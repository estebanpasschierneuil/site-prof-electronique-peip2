import 'server-only';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { addDays, type ISODate } from '@/core/dates';
import { computeLoad } from '@/core/load';
import { findDuplicates, mergeWellness, type WellnessSample } from '@/core/sources';
import type { Db } from '@/db/client';
import { activities, athletes, wellnessDays, wellnessSamples } from '@/db/schema';
import type { ProviderActivity, ProviderWellness } from './provider';

type AthleteRow = typeof athletes.$inferSelect;

/**
 * Point d'entrée unique de toute donnée entrante, quelle que soit sa source
 * (connecteur, webhook, fichier) : enregistrement idempotent, calcul de charge avec
 * les seuils de l'athlète, puis réconciliation entre sources.
 */
export async function ingestActivities(db: Db, athlete: AthleteRow, source: string, items: ProviderActivity[]): Promise<number> {
  if (items.length === 0) return 0;
  for (const item of items) {
    const computed = computeLoad(item, athlete);
    const mutable = { ...item, load: computed.load, intensityFactor: computed.intensityFactor, loadMethod: computed.method };
    await db
      .insert(activities)
      .values({ ...mutable, athleteId: athlete.id, source })
      .onConflictDoUpdate({ target: [activities.athleteId, activities.source, activities.externalId], set: mutable });
  }
  const dates = items.map((i) => i.date).sort();
  await reconcileActivities(db, athlete.id, dates[0], dates[dates.length - 1]);
  return items.length;
}

/** Repère les séances reçues par plusieurs sources sur la période et n'en garde qu'une pour l'analyse. */
export async function reconcileActivities(db: Db, athleteId: string, from: ISODate, to: ISODate): Promise<number> {
  const rows = await db
    .select()
    .from(activities)
    .where(and(eq(activities.athleteId, athleteId), gte(activities.date, addDays(from, -1)), lte(activities.date, addDays(to, 1))));
  if (new Set(rows.map((r) => r.source)).size < 2) return 0;

  const duplicates = findDuplicates(
    rows.map((r) => ({
      id: r.id,
      source: r.source,
      sport: r.sport,
      date: r.date,
      startS: r.startAt ? Math.floor(r.startAt.getTime() / 1000) : null,
      durationS: r.durationS,
      distanceM: r.distanceM,
      hasPower: r.normalizedPowerW !== null || r.avgPowerW !== null,
      hasHr: r.avgHr !== null,
      hasZones: r.zoneSeconds !== null,
    })),
  );

  const changed = rows.filter((r) => (duplicates.get(r.id) ?? null) !== r.duplicateOf);
  for (const row of changed) {
    await db.update(activities).set({ duplicateOf: duplicates.get(row.id) ?? null }).where(eq(activities.id, row.id));
  }
  return duplicates.size;
}

export async function ingestWellness(db: Db, athleteId: string, source: string, items: ProviderWellness[]): Promise<number> {
  const useful = items.filter((w) => w.hrv !== null || w.restingHr !== null || w.sleepH !== null || w.fatigue !== null || w.soreness !== null || w.mood !== null);
  if (useful.length === 0) return 0;
  for (const w of useful) {
    await db
      .insert(wellnessSamples)
      .values({ ...w, athleteId, source })
      .onConflictDoUpdate({ target: [wellnessSamples.athleteId, wellnessSamples.date, wellnessSamples.source], set: w });
  }
  await reconcileWellness(db, athleteId, useful.map((w) => w.date));
  return useful.length;
}

/** Recalcule la journée fusionnée à partir de toutes les sources qui l'ont renseignée. */
export async function reconcileWellness(db: Db, athleteId: string, dates: ISODate[]): Promise<void> {
  const unique = [...new Set(dates)];
  for (let i = 0; i < unique.length; i += 200) {
    const batch = unique.slice(i, i + 200);
    const samples = await db.select().from(wellnessSamples).where(and(eq(wellnessSamples.athleteId, athleteId), inArray(wellnessSamples.date, batch)));
    for (const date of batch) {
      const merged = mergeWellness(date, samples.filter((s) => s.date === date) as (WellnessSample & { date: string })[]);
      const { date: _date, ...fields } = merged;
      await db.insert(wellnessDays).values({ ...merged, athleteId }).onConflictDoUpdate({ target: [wellnessDays.athleteId, wellnessDays.date], set: fields });
    }
  }
}

/** Invalide les analyses en cache de l'athlète. */
export async function touchAthlete(db: Db, athleteId: string): Promise<void> {
  await db.update(athletes).set({ dataUpdatedAt: sql`now()` }).where(eq(athletes.id, athleteId));
}
