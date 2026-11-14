import 'server-only';
import { and, asc, eq, gte, inArray, isNull } from 'drizzle-orm';
import type { ISODate } from '@/core/dates';
import { getDb } from '@/db/client';
import { athletes, connections, races, users } from '@/db/schema';

export type ConnectionRow = typeof connections.$inferSelect;
export type RaceRow = typeof races.$inferSelect;

export interface RosterEntry {
  athlete: typeof athletes.$inferSelect;
  coachName: string | null;
  connections: Pick<ConnectionRow, 'id' | 'provider' | 'status' | 'lastSyncAt' | 'lastError'>[];
  nextRace: RaceRow | null;
}

/** Effectif de l'organisation, avec l'état des connexions et le prochain objectif. */
export async function listRoster(orgId: string, today: ISODate): Promise<RosterEntry[]> {
  const db = await getDb();
  const rows = await db
    .select({ athlete: athletes, coachName: users.name })
    .from(athletes)
    .leftJoin(users, eq(users.id, athletes.coachId))
    .where(and(eq(athletes.orgId, orgId), isNull(athletes.archivedAt)))
    .orderBy(asc(athletes.lastName), asc(athletes.firstName));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.athlete.id);
  const [conns, upcoming] = await Promise.all([
    db.select({ id: connections.id, athleteId: connections.athleteId, provider: connections.provider, status: connections.status, lastSyncAt: connections.lastSyncAt, lastError: connections.lastError }).from(connections).where(inArray(connections.athleteId, ids)),
    db.select().from(races).where(and(inArray(races.athleteId, ids), gte(races.date, today))).orderBy(asc(races.date)),
  ]);
  return rows.map(({ athlete, coachName }) => ({
    athlete,
    coachName,
    connections: conns.filter((c) => c.athleteId === athlete.id),
    nextRace: upcoming.find((r) => r.athleteId === athlete.id) ?? null,
  }));
}

export async function getAthleteProfile(orgId: string, athleteId: string) {
  const db = await getDb();
  const [athlete] = await db.select().from(athletes).where(and(eq(athletes.orgId, orgId), eq(athletes.id, athleteId))).limit(1);
  if (!athlete) return null;
  const [conns, raceRows] = await Promise.all([
    db.select().from(connections).where(eq(connections.athleteId, athleteId)),
    db.select().from(races).where(eq(races.athleteId, athleteId)).orderBy(asc(races.date)),
  ]);
  return { athlete, connections: conns, races: raceRows };
}
