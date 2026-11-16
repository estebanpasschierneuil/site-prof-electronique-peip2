import 'server-only';
import { and, asc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { analyzeWeek } from '@/core/analyze';
import { ENGINE_VERSION } from '@/core/config';
import { trendOf, type Trend } from '@/core/digest';
import { addDays, weekEnd, type ISODate } from '@/core/dates';
import type { Activity, PlannedWorkout, Race, WeeklyAnalysis, WellnessDay } from '@/core/types';
import { getDb, type Db } from '@/db/client';
import { activities, athletes, plannedWorkouts, races, users, weeklyAnalyses, weeklyReviews, wellnessDays } from '@/db/schema';

const HISTORY_DAYS = 26 * 7;

export type AthleteRow = typeof athletes.$inferSelect;

export interface AthleteWeek {
  athlete: AthleteRow & { coachName: string | null };
  analysis: WeeklyAnalysis;
  review: { reviewedAt: Date | null; note: string } | null;
  /** Évolution par rapport à la semaine précédente (renseignée dans la revue de groupe). */
  trend: Trend;
}

function groupBy<T extends { athleteId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.athleteId);
    if (list) list.push(row);
    else map.set(row.athleteId, [row]);
  }
  return map;
}

/** Calcule et enregistre l'analyse d'une semaine pour un lot d'athlètes, en 4 requêtes. */
async function computeAnalyses(db: Db, rows: AthleteRow[], weekStart: ISODate, today: ISODate): Promise<Map<string, WeeklyAnalysis>> {
  const ids = rows.map((a) => a.id);
  const from = addDays(weekStart, -HISTORY_DAYS);
  const to = addDays(weekEnd(weekStart), 7);
  const [acts, plans, wells, raceRows] = await Promise.all([
    // Une séance reçue par plusieurs sources ne compte qu'une fois.
    db.select().from(activities).where(and(inArray(activities.athleteId, ids), isNull(activities.duplicateOf), gte(activities.date, from), lte(activities.date, to))),
    db.select().from(plannedWorkouts).where(and(inArray(plannedWorkouts.athleteId, ids), gte(plannedWorkouts.date, from), lte(plannedWorkouts.date, to))),
    db.select().from(wellnessDays).where(and(inArray(wellnessDays.athleteId, ids), gte(wellnessDays.date, from), lte(wellnessDays.date, to))),
    db.select().from(races).where(inArray(races.athleteId, ids)),
  ]);
  const actsBy = groupBy(acts);
  const plansBy = groupBy(plans);
  const wellsBy = groupBy(wells);
  const racesBy = groupBy(raceRows);

  const out = new Map<string, WeeklyAnalysis>();
  for (const a of rows) {
    const analysis = analyzeWeek({
      athlete: { id: a.id, firstName: a.firstName, lastName: a.lastName, ftpW: a.ftpW, runThresholdPaceS: a.runThresholdPaceS, swimCssS: a.swimCssS, lthr: a.lthr, restHr: a.restHr },
      activities: (actsBy.get(a.id) ?? []) as Activity[],
      planned: (plansBy.get(a.id) ?? []) as PlannedWorkout[],
      wellness: (wellsBy.get(a.id) ?? []) as WellnessDay[],
      races: (racesBy.get(a.id) ?? []) as Race[],
      weekStart,
      today,
    });
    out.set(a.id, analysis);
  }

  const values = rows.map((a) => {
    const analysis = out.get(a.id)!;
    return { athleteId: a.id, weekStart, status: analysis.status, priority: analysis.priority, engineVersion: ENGINE_VERSION, asOf: analysis.asOf, payload: analysis, computedAt: new Date() };
  });
  for (let i = 0; i < values.length; i += 50) {
    for (const value of values.slice(i, i + 50)) {
      await db
        .insert(weeklyAnalyses)
        .values(value)
        .onConflictDoUpdate({ target: [weeklyAnalyses.athleteId, weeklyAnalyses.weekStart], set: { status: value.status, priority: value.priority, engineVersion: value.engineVersion, asOf: value.asOf, payload: value.payload, computedAt: value.computedAt } });
    }
  }
  return out;
}

/**
 * Analyses d'une semaine pour les athlètes demandés. Une analyse en cache est
 * réutilisée tant que le moteur, la date de clôture et les données sources n'ont pas changé.
 */
async function loadAnalyses(db: Db, rows: AthleteRow[], weekStart: ISODate, today: ISODate): Promise<Map<string, WeeklyAnalysis>> {
  if (rows.length === 0) return new Map();
  const end = weekEnd(weekStart);
  const expectedAsOf = end <= today ? end : today;
  const cached = await db
    .select()
    .from(weeklyAnalyses)
    .where(and(inArray(weeklyAnalyses.athleteId, rows.map((a) => a.id)), eq(weeklyAnalyses.weekStart, weekStart)));
  const cachedBy = new Map(cached.map((c) => [c.athleteId, c]));

  const result = new Map<string, WeeklyAnalysis>();
  const stale: AthleteRow[] = [];
  for (const a of rows) {
    const hit = cachedBy.get(a.id);
    if (hit && hit.engineVersion === ENGINE_VERSION && hit.asOf === expectedAsOf && hit.computedAt >= a.dataUpdatedAt) result.set(a.id, hit.payload);
    else stale.push(a);
  }
  if (stale.length) for (const [id, analysis] of await computeAnalyses(db, stale, weekStart, today)) result.set(id, analysis);
  return result;
}

const STATUS_RANK = { action: 0, watch: 1, ok: 2 } as const;

/** La revue de la semaine : tous les athlètes actifs, les plus urgents d'abord. */
export async function getWeekReview(orgId: string, weekStart: ISODate, today: ISODate): Promise<AthleteWeek[]> {
  const db = await getDb();
  const rows = await db
    .select({ athlete: athletes, coachName: users.name })
    .from(athletes)
    .leftJoin(users, eq(users.id, athletes.coachId))
    .where(and(eq(athletes.orgId, orgId), isNull(athletes.archivedAt)))
    .orderBy(asc(athletes.lastName));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.athlete.id);
  const athleteRows = rows.map((r) => r.athlete);
  const [analyses, reviews] = await Promise.all([
    loadAnalyses(db, athleteRows, weekStart, today),
    db.select().from(weeklyReviews).where(and(inArray(weeklyReviews.athleteId, ids), eq(weeklyReviews.weekStart, weekStart))),
  ]);
  // La semaine précédente dit si un signal est nouveau, s'il persiste ou s'il est résolu.
  const previous = await loadAnalyses(db, athleteRows, addDays(weekStart, -7), today);
  const reviewBy = new Map(reviews.map((r) => [r.athleteId, r]));

  return rows
    .map(({ athlete, coachName }) => {
      const review = reviewBy.get(athlete.id);
      const analysis = analyses.get(athlete.id)!;
      const before = previous.get(athlete.id);
      const trend = before && before.fitness.historyDays >= 7 ? trendOf(analysis.status, before.status) : null;
      return { athlete: { ...athlete, coachName }, analysis, review: review ? { reviewedAt: review.reviewedAt, note: review.note } : null, trend };
    })
    .sort((a, b) => STATUS_RANK[a.analysis.status] - STATUS_RANK[b.analysis.status] || b.analysis.priority - a.analysis.priority || a.athlete.lastName.localeCompare(b.athlete.lastName, 'fr'));
}

export async function getAthleteWeek(orgId: string, athleteId: string, weekStart: ISODate, today: ISODate): Promise<AthleteWeek | null> {
  const db = await getDb();
  const [row] = await db
    .select({ athlete: athletes, coachName: users.name })
    .from(athletes)
    .leftJoin(users, eq(users.id, athletes.coachId))
    .where(and(eq(athletes.orgId, orgId), eq(athletes.id, athleteId)))
    .limit(1);
  if (!row) return null;
  const [analyses, [review]] = await Promise.all([
    loadAnalyses(db, [row.athlete], weekStart, today),
    db.select().from(weeklyReviews).where(and(eq(weeklyReviews.athleteId, athleteId), eq(weeklyReviews.weekStart, weekStart))).limit(1),
  ]);
  return { athlete: { ...row.athlete, coachName: row.coachName }, analysis: analyses.get(athleteId)!, review: review ? { reviewedAt: review.reviewedAt, note: review.note } : null, trend: null };
}

/** Vérifie qu'un athlète appartient bien à l'organisation de l'utilisateur. */
export async function assertAthleteInOrg(orgId: string, athleteId: string): Promise<AthleteRow> {
  const db = await getDb();
  const [row] = await db.select().from(athletes).where(and(eq(athletes.orgId, orgId), eq(athletes.id, athleteId))).limit(1);
  if (!row) throw new Error('Athlète introuvable.');
  return row;
}

export async function setReviewed(orgId: string, athleteId: string, weekStart: ISODate, userId: string, reviewed: boolean): Promise<void> {
  await assertAthleteInOrg(orgId, athleteId);
  const db = await getDb();
  const reviewedAt = reviewed ? new Date() : null;
  await db
    .insert(weeklyReviews)
    .values({ athleteId, weekStart, reviewedBy: reviewed ? userId : null, reviewedAt })
    .onConflictDoUpdate({ target: [weeklyReviews.athleteId, weeklyReviews.weekStart], set: { reviewedBy: reviewed ? userId : null, reviewedAt, updatedAt: new Date() } });
}

/** Valide d'un coup tous les athlètes sans signal : le coach ne s'arrête que sur les exceptions. */
export async function reviewAllOnTrack(orgId: string, weekStart: ISODate, today: ISODate, userId: string): Promise<number> {
  const pending = (await getWeekReview(orgId, weekStart, today)).filter((row) => row.analysis.status === 'ok' && !row.review?.reviewedAt);
  if (pending.length === 0) return 0;
  const db = await getDb();
  const reviewedAt = new Date();
  await db
    .insert(weeklyReviews)
    .values(pending.map((row) => ({ athleteId: row.athlete.id, weekStart, reviewedBy: userId, reviewedAt })))
    .onConflictDoUpdate({ target: [weeklyReviews.athleteId, weeklyReviews.weekStart], set: { reviewedBy: userId, reviewedAt, updatedAt: reviewedAt } });
  return pending.length;
}

export async function saveNote(orgId: string, athleteId: string, weekStart: ISODate, note: string): Promise<void> {
  await assertAthleteInOrg(orgId, athleteId);
  const db = await getDb();
  await db
    .insert(weeklyReviews)
    .values({ athleteId, weekStart, note })
    .onConflictDoUpdate({ target: [weeklyReviews.athleteId, weeklyReviews.weekStart], set: { note, updatedAt: new Date() } });
}
