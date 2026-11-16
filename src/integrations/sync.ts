import 'server-only';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { addDays, todayISO } from '@/core/dates';
import { computeLoad } from '@/core/load';
import { getDb, type Db } from '@/db/client';
import { athletes, connections, plannedWorkouts } from '@/db/schema';
import { decrypt, encrypt } from './crypto';
import { ingestActivities, ingestWellness, touchAthlete } from './ingest';
import { refreshIfNeeded } from './oauth';
import type { Credentials } from './provider';
import { PROVIDERS } from './registry';

const INITIAL_BACKFILL_DAYS = 180;
const OVERLAP_DAYS = 7;
const PLAN_HORIZON_DAYS = 21;

export interface SyncResult {
  connectionId: string;
  ok: boolean;
  activities: number;
  wellnessDays: number;
  error?: string;
}

/**
 * Synchronise une connexion : renouvellement du jeton, import incrémental et idempotent,
 * réconciliation avec les autres sources de l'athlète, puis invalidation des analyses en cache.
 */
export async function syncConnection(db: Db, connectionId: string): Promise<SyncResult> {
  const failure = (error: string): SyncResult => ({ connectionId, ok: false, activities: 0, wellnessDays: 0, error });
  const [row] = await db.select({ connection: connections, athlete: athletes }).from(connections).innerJoin(athletes, eq(athletes.id, connections.athleteId)).where(eq(connections.id, connectionId)).limit(1);
  if (!row) return failure('Connexion introuvable.');
  const { connection, athlete } = row;
  const provider = PROVIDERS[connection.provider];
  if (!provider) return failure(`Aucun connecteur pour « ${connection.provider} ».`);

  try {
    let credentials: Credentials = {
      externalAthleteId: connection.externalAthleteId,
      accessToken: connection.accessTokenEnc ? decrypt(connection.accessTokenEnc) : null,
      refreshToken: connection.refreshTokenEnc ? decrypt(connection.refreshTokenEnc) : null,
      expiresAt: connection.tokenExpiresAt,
    };
    const refreshed = await refreshIfNeeded(provider, credentials.refreshToken, credentials.expiresAt);
    if (refreshed) {
      credentials = { ...credentials, ...refreshed };
      await db
        .update(connections)
        .set({ accessTokenEnc: encrypt(refreshed.accessToken), refreshTokenEnc: refreshed.refreshToken ? encrypt(refreshed.refreshToken) : null, tokenExpiresAt: refreshed.expiresAt })
        .where(eq(connections.id, connectionId));
    }

    const today = todayISO();
    const backfill = Math.min(INITIAL_BACKFILL_DAYS, provider.historyDays ?? INITIAL_BACKFILL_DAYS);
    const since = connection.lastSyncAt ? addDays(connection.lastSyncAt.toISOString().slice(0, 10), -OVERLAP_DAYS) : addDays(today, -backfill);

    const imported = await ingestActivities(db, athlete, provider.id, await provider.fetchActivities(credentials, since, today));
    const wellness = await ingestWellness(db, athlete.id, provider.id, (await provider.fetchWellness?.(credentials, since, today)) ?? []);

    const planned = await provider.fetchPlannedWorkouts?.(credentials, since, addDays(today, PLAN_HORIZON_DAYS));
    if (planned) {
      // Le plan de la plateforme fait foi : on remplace la fenêtre synchronisée.
      await db.transaction(async (tx) => {
        await tx.delete(plannedWorkouts).where(sql`${plannedWorkouts.athleteId} = ${athlete.id} and ${plannedWorkouts.date} >= ${since}`);
        if (planned.length) {
          await tx.insert(plannedWorkouts).values(
            planned.map((p) => ({ athleteId: athlete.id, date: p.date, sport: p.sport, kind: p.kind, title: p.title, durationS: p.durationS, load: p.load ?? computeLoad({ sport: p.sport, durationS: p.durationS }, athlete).load, isKey: p.kind === 'vo2' || p.kind === 'threshold' || p.kind === 'long' })),
          );
        }
      });
    }

    await db.update(connections).set({ status: 'active', lastSyncAt: new Date(), lastError: null }).where(eq(connections.id, connectionId));
    await touchAthlete(db, athlete.id);
    return { connectionId, ok: true, activities: imported, wellnessDays: wellness };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue.';
    await db.update(connections).set({ status: 'error', lastError: message }).where(eq(connections.id, connectionId));
    return failure(message);
  }
}

/** Synchronise toutes les connexions actives ; appelé par la tâche planifiée. */
export async function syncAll(): Promise<SyncResult[]> {
  const db = await getDb();
  // Sans jeton enregistré (connexions de démonstration), il n'y a rien à interroger.
  const rows = await db
    .select({ id: connections.id, provider: connections.provider })
    .from(connections)
    .where(and(eq(connections.status, 'active'), isNotNull(connections.accessTokenEnc)));
  const results: SyncResult[] = [];
  for (const row of rows) {
    if (!PROVIDERS[row.provider]) continue;
    results.push(await syncConnection(db, row.id));
  }
  return results;
}
