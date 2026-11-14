import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { defaultReviewWeek, todayISO } from '@/core/dates';
import { getDb, type Db } from '@/db/client';
import { DEMO_ORG_SLUG } from '@/db/seed';
import { athletes, organizations, weeklyAnalyses, weeklyReviews } from '@/db/schema';
import { syncAll } from '@/integrations/sync';
import { getAthleteWeek, getWeekReview, saveNote, setReviewed } from '@/server/analysis';

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
    const [again] = await db.select().from(weeklyAnalyses).where(eq(weeklyAnalyses.athleteId, first.athleteId)).limit(1);
    expect(again.computedAt.getTime()).toBe(first.computedAt.getTime());

    await db.update(athletes).set({ dataUpdatedAt: new Date(Date.now() + 1000) }).where(eq(athletes.id, first.athleteId));
    await getWeekReview(orgId, week, today);
    const [recomputed] = await db.select().from(weeklyAnalyses).where(eq(weeklyAnalyses.athleteId, first.athleteId)).limit(1);
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

  it('ne tente aucune synchronisation réseau pour les connexions de démonstration', async () => {
    expect(await syncAll()).toEqual([]);
  });
});
