import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { defaultReviewWeek, todayISO } from '@/core/dates';
import { getDb, type Db } from '@/db/client';
import { DEMO_ORG_SLUG } from '@/db/seed';
import { activities, athletes, organizations, weeklyAnalyses, weeklyReviews, wellnessDays } from '@/db/schema';
import { ingestActivities, ingestWellness } from '@/integrations/ingest';
import { syncAll } from '@/integrations/sync';
import { getAthleteWeek, getWeekReview, reviewAllOnTrack, saveNote, setReviewed } from '@/server/analysis';

/**
 * Tests d'intégration sur une vraie base Postgres embarquée (PGlite, en mémoire) :
 * migrations, génération de la démo, service d'analyse, cache et cloisonnement.
 */
describe('service d’analyse', () => {
  const today = todayISO();
  const week = defaultReviewWeek(today);
  let db: Db;
  let orgId: string;

  beforeAll(async () => {
    db = await getDb();
    [{ id: orgId }] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, DEMO_ORG_SLUG));
  });

  it('classe les 18 athlètes de démonstration, les plus urgents d’abord', async () => {
    const review = await getWeekReview(orgId, week, today);
    expect(review).toHaveLength(18);
    const statuses = review.map((r) => r.analysis.status);
    expect(statuses.filter((s) => s === 'action')).toHaveLength(5);
    expect(statuses.filter((s) => s === 'watch')).toHaveLength(5);
    expect(statuses).toEqual([...statuses].sort((a, b) => ['action', 'watch', 'ok'].indexOf(a) - ['action', 'watch', 'ok'].indexOf(b)));
  });

  it('sert la seconde lecture depuis le cache, et recalcule si les données changent', async () => {
    await getWeekReview(orgId, week, today);
    const [first] = await db.select().from(weeklyAnalyses).where(eq(weeklyAnalyses.weekStart, week)).limit(1);
    await getWeekReview(orgId, week, today);
    const [again] = await db.select().from(weeklyAnalyses).where(and(eq(weeklyAnalyses.athleteId, first.athleteId), eq(weeklyAnalyses.weekStart, week))).limit(1);
    expect(again.computedAt.getTime()).toBe(first.computedAt.getTime());

    await db.update(athletes).set({ dataUpdatedAt: new Date(Date.now() + 1000) }).where(eq(athletes.id, first.athleteId));
    await getWeekReview(orgId, week, today);
    const [recomputed] = await db.select().from(weeklyAnalyses).where(and(eq(weeklyAnalyses.athleteId, first.athleteId), eq(weeklyAnalyses.weekStart, week))).limit(1);
    expect(recomputed.computedAt.getTime()).toBeGreaterThan(first.computedAt.getTime());
  });

  it('refuse l’accès aux athlètes d’une autre organisation', async () => {
    const [other] = await db.insert(organizations).values({ name: 'Autre club', slug: 'autre-club' }).returning({ id: organizations.id });
    const [athlete] = await db.select({ id: athletes.id }).from(athletes).where(eq(athletes.orgId, orgId)).limit(1);

    expect(await getWeekReview(other.id, week, today)).toEqual([]);
    expect(await getAthleteWeek(other.id, athlete.id, week, today)).toBeNull();
    await expect(setReviewed(other.id, athlete.id, week, athlete.id, true)).rejects.toThrow();
    await expect(saveNote(other.id, athlete.id, week, 'intrusion')).rejects.toThrow();
    expect(await db.select().from(weeklyReviews).where(eq(weeklyReviews.athleteId, athlete.id))).toHaveLength(0);
  });

  it('enregistre la revue et la note du coach sans que l’une efface l’autre', async () => {
    const [athlete] = await db.select({ id: athletes.id, coachId: athletes.coachId }).from(athletes).where(eq(athletes.orgId, orgId)).limit(1);
    await saveNote(orgId, athlete.id, week, 'Alléger mardi.');
    await setReviewed(orgId, athlete.id, week, athlete.coachId!, true);
    const result = await getAthleteWeek(orgId, athlete.id, week, today);
    expect(result?.review?.note).toBe('Alléger mardi.');
    expect(result?.review?.reviewedAt).toBeInstanceOf(Date);
  });

  it('ne compte qu’une fois une séance reçue par deux sources, et garde la plus complète', async () => {
    const [athlete] = await db.insert(athletes).values({ orgId, firstName: 'Multi', lastName: 'Sources', ftpW: 250, lthr: 170 }).returning();
    const startAt = new Date('2026-11-03T06:30:00Z');
    const ride = { startAt, date: '2026-11-03', sport: 'bike' as const, title: 'Sortie', durationS: 5400, distanceM: 45_000, elevationM: 400, avgHr: 142, rpe: null };
    await ingestActivities(db, athlete, 'strava', [{ ...ride, externalId: 's1', durationS: 5200, avgPowerW: null, normalizedPowerW: null, zoneSeconds: null }]);
    await ingestActivities(db, athlete, 'file', [{ ...ride, externalId: 'f1', avgPowerW: 190, normalizedPowerW: 205, zoneSeconds: [600, 3600, 900, 300, 0] }]);
    // Le même fichier réimporté ne crée rien.
    await ingestActivities(db, athlete, 'file', [{ ...ride, externalId: 'f1', avgPowerW: 190, normalizedPowerW: 205, zoneSeconds: [600, 3600, 900, 300, 0] }]);

    const rows = await db.select().from(activities).where(eq(activities.athleteId, athlete.id));
    expect(rows).toHaveLength(2);
    const kept = rows.find((r) => r.duplicateOf === null)!;
    expect(kept.source).toBe('file');
    expect(kept.loadMethod).toBe('power');
    expect(rows.find((r) => r.source === 'strava')!.duplicateOf).toBe(kept.id);

    const week = await getAthleteWeek(orgId, athlete.id, '2026-11-02', today);
    expect(week!.analysis.load.bySport.bike.sessions).toBe(1);
    expect(week!.analysis.load.done).toBe(kept.load);
  });

  it('fusionne la récupération de deux capteurs, champ par champ', async () => {
    const [athlete] = await db.insert(athletes).values({ orgId, firstName: 'Deux', lastName: 'Capteurs' }).returning();
    const empty = { hrv: null, restingHr: null, sleepH: null, fatigue: null, soreness: null, mood: null };
    await ingestWellness(db, athlete.id, 'intervals', [{ ...empty, date: '2026-11-03', hrv: 58, sleepH: 6.9, fatigue: 3 }]);
    await ingestWellness(db, athlete.id, 'oura', [{ ...empty, date: '2026-11-03', hrv: 66, restingHr: 46, sleepH: 7.4 }]);
    const [day] = await db.select().from(wellnessDays).where(eq(wellnessDays.athleteId, athlete.id));
    expect(day).toMatchObject({ hrv: 66, restingHr: 46, sleepH: 7.4, fatigue: 3 });
  });

  it('valide d’un coup les athlètes sans signal, et eux seulement', async () => {
    const [coach] = await db.select({ id: athletes.coachId }).from(athletes).where(eq(athletes.orgId, orgId)).limit(1);
    const before = await getWeekReview(orgId, week, today);
    const expected = before.filter((r) => r.analysis.status === 'ok' && !r.review?.reviewedAt).length;
    expect(await reviewAllOnTrack(orgId, week, today, coach.id!)).toBe(expected);
    const after = await getWeekReview(orgId, week, today);
    expect(after.filter((r) => r.analysis.status === 'ok').every((r) => r.review?.reviewedAt)).toBe(true);
    expect(after.filter((r) => r.analysis.status === 'action').some((r) => r.review?.reviewedAt && r.athlete.lastName !== before.find((b) => b.review?.reviewedAt)?.athlete.lastName)).toBe(false);
    expect(await reviewAllOnTrack(orgId, week, today, coach.id!)).toBe(0);
  });

  it('indique pour chaque athlète l’évolution depuis la semaine précédente', async () => {
    const review = await getWeekReview(orgId, week, today);
    const trendOfAthlete = (lastName: string) => review.find((r) => r.athlete.lastName === lastName)!.trend;
    expect(trendOfAthlete('Perrin')).toBe('new');
    expect(trendOfAthlete('Marchand')).toBeNull();
  });

  it('ne tente aucune synchronisation réseau pour les connexions de démonstration', async () => {
    expect(await syncAll()).toEqual([]);
  });
});
