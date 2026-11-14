import { READINESS_WEIGHTS, THRESHOLDS } from './config';
import { addDays, diffDays, type ISODate } from './dates';
import type { Activity, BaselineMetric, PlannedWorkout, SessionRow, Sport, SportTotals, WellnessDay } from './types';

export const ALL_SPORTS: Sport[] = ['swim', 'bike', 'run', 'strength', 'other'];

export function emptyTotals(): Record<Sport, SportTotals> {
  return Object.fromEntries(ALL_SPORTS.map((s) => [s, { load: 0, durationS: 0, distanceM: 0, sessions: 0 }])) as Record<Sport, SportTotals>;
}

export interface WeekMatch {
  rows: SessionRow[];
  planned: number;
  done: number;
  keyPlanned: number;
  keyDone: number;
  missedKeyTitles: string[];
  easyTooHard: number;
  plannedBySport: Record<Sport, number>;
  doneBySport: Record<Sport, number>;
}

const EASY_KINDS = new Set(['recovery', 'endurance', 'long', 'technique']);

/**
 * Rapproche les séances prévues et réalisées d'une semaine : même sport le même jour,
 * sinon même sport à un jour près (séance décalée).
 */
export function matchWeek(planned: PlannedWorkout[], activities: Activity[], start: ISODate, end: ISODate, asOf: ISODate): WeekMatch {
  const weekPlanned = planned.filter((p) => p.date >= start && p.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  const weekActivities = activities.filter((a) => a.date >= start && a.date <= end && a.date <= asOf);
  const used = new Set<string>();
  const pairs = new Map<string, Activity>();

  for (const tolerance of [0, 1]) {
    for (const p of weekPlanned) {
      if (pairs.has(p.id)) continue;
      const candidate = weekActivities
        .filter((a) => !used.has(a.id) && a.sport === p.sport && Math.abs(diffDays(a.date, p.date)) <= tolerance)
        .sort((a, b) => Math.abs(a.durationS - p.durationS) - Math.abs(b.durationS - p.durationS))[0];
      if (candidate) {
        used.add(candidate.id);
        pairs.set(p.id, candidate);
      }
    }
  }

  const rows: SessionRow[] = [];
  const result: WeekMatch = {
    rows,
    planned: 0,
    done: 0,
    keyPlanned: 0,
    keyDone: 0,
    missedKeyTitles: [],
    easyTooHard: 0,
    plannedBySport: { swim: 0, bike: 0, run: 0, strength: 0, other: 0 },
    doneBySport: { swim: 0, bike: 0, run: 0, strength: 0, other: 0 },
  };

  for (const p of weekPlanned) {
    const a = pairs.get(p.id);
    const due = p.date <= asOf;
    if (due) {
      result.planned++;
      result.plannedBySport[p.sport]++;
      if (p.isKey) result.keyPlanned++;
    }
    if (a) {
      result.done++;
      result.doneBySport[p.sport]++;
      if (p.isKey) result.keyDone++;
      const maxIf = THRESHOLDS.compliance.easyMaxIf;
      if (EASY_KINDS.has(p.kind) && (p.sport === 'bike' || p.sport === 'run') && (a.intensityFactor ?? 0) > maxIf && a.durationS >= 40 * 60) {
        result.easyTooHard++;
      }
    } else if (due && p.isKey) {
      result.missedKeyTitles.push(p.title);
    }
    rows.push({
      date: a?.date ?? p.date,
      sport: p.sport,
      title: p.title,
      kind: p.kind,
      isKey: p.isKey,
      state: a ? 'done' : due ? 'missed' : 'upcoming',
      plannedDurationS: p.durationS,
      plannedLoad: p.load,
      durationS: a?.durationS ?? null,
      distanceM: a?.distanceM ?? null,
      load: a?.load ?? null,
      intensityFactor: a?.intensityFactor ?? null,
      avgHr: a?.avgHr ?? null,
      rpe: a?.rpe ?? null,
      loadMethod: a?.loadMethod ?? null,
    });
  }

  for (const a of weekActivities) {
    if (used.has(a.id)) continue;
    rows.push({
      date: a.date,
      sport: a.sport,
      title: a.title,
      kind: null,
      isKey: false,
      state: 'unplanned',
      plannedDurationS: null,
      plannedLoad: null,
      durationS: a.durationS,
      distanceM: a.distanceM,
      load: a.load,
      intensityFactor: a.intensityFactor,
      avgHr: a.avgHr,
      rpe: a.rpe,
      loadMethod: a.loadMethod,
    });
  }

  rows.sort((x, y) => x.date.localeCompare(y.date));
  return result;
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const sd = (values: number[]) => {
  const m = mean(values);
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
};
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const present = (values: (number | null)[]): number[] => values.filter((v): v is number => v !== null && Number.isFinite(v));
const round = (v: number, digits = 1) => Math.round(v * 10 ** digits) / 10 ** digits;
const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

/** Compare la moyenne de la semaine à la référence individuelle des 28 jours précédents. */
export function baselineMetric(wellness: WellnessDay[], pick: (d: WellnessDay) => number | null, start: ISODate, asOf: ISODate): BaselineMetric {
  const { baselineDays, minBaselineValues, minWeekValues } = THRESHOLDS.recovery;
  const weekValues = present(wellness.filter((d) => d.date >= start && d.date <= asOf).map(pick));
  const baseValues = present(wellness.filter((d) => d.date >= addDays(start, -baselineDays) && d.date < start).map(pick));
  const week = weekValues.length >= minWeekValues ? round(mean(weekValues)) : null;
  if (baseValues.length < minBaselineValues) return { week, baseline: null, sd: null, z: null, delta: null };
  const baseline = mean(baseValues);
  const spread = Math.max(sd(baseValues), baseline * 0.02);
  return {
    week,
    baseline: round(baseline),
    sd: round(spread),
    z: week === null ? null : round((week - baseline) / spread, 2),
    delta: week === null ? null : round(week - baseline),
  };
}

export function weekAverage(wellness: WellnessDay[], pick: (d: WellnessDay) => number | null, start: ISODate, asOf: ISODate): number | null {
  const values = present(wellness.filter((d) => d.date >= start && d.date <= asOf).map(pick));
  return values.length >= 2 ? round(mean(values)) : null;
}

export interface ReadinessInput {
  hrvZ: number | null;
  rhrDelta: number | null;
  sleepH: number | null;
  fatigue: number | null;
  soreness: number | null;
  mood: number | null;
  tsb: number;
}

/**
 * Indice de préparation 0–100 : combinaison pondérée et transparente de la VFC,
 * du sommeil, de la fraîcheur (TSB), de la FC de repos et du ressenti.
 */
export function readiness(input: ReadinessInput) {
  const components: { key: 'hrv' | 'rhr' | 'sleep' | 'subjective' | 'form'; label: string; score: number; weight: number }[] = [];
  if (input.hrvZ !== null) components.push({ key: 'hrv', label: 'VFC', score: clamp(100 + input.hrvZ * 50), weight: READINESS_WEIGHTS.hrv });
  if (input.sleepH !== null) components.push({ key: 'sleep', label: 'Sommeil', score: clamp(((input.sleepH - 5.5) / 2.5) * 100), weight: READINESS_WEIGHTS.sleep });
  if (input.rhrDelta !== null) components.push({ key: 'rhr', label: 'FC de repos', score: clamp(100 - input.rhrDelta * 12.5), weight: READINESS_WEIGHTS.rhr });
  const subjective = present([
    input.fatigue === null ? null : 100 - (input.fatigue - 1) * 25,
    input.soreness === null ? null : 100 - (input.soreness - 1) * 25,
    input.mood === null ? null : (input.mood - 1) * 25,
  ]);
  if (subjective.length) components.push({ key: 'subjective', label: 'Ressenti', score: clamp(mean(subjective)), weight: READINESS_WEIGHTS.subjective });

  // Sans au moins deux signaux de récupération, l'indice ne dirait que la charge.
  if (components.length < 2) return { score: null, components: [] };
  components.push({ key: 'form', label: 'Fraîcheur', score: clamp(((input.tsb + 35) / 40) * 100), weight: READINESS_WEIGHTS.form });

  const totalWeight = components.reduce((a, c) => a + c.weight, 0);
  const score = Math.round(components.reduce((a, c) => a + c.score * c.weight, 0) / totalWeight);
  return { score, components: components.map((c) => ({ ...c, score: Math.round(c.score) })) };
}

/**
 * Efficacité aérobie (vitesse ou puissance rapportée à la FC) sur les séances faciles :
 * médiane des 21 derniers jours comparée aux 7 semaines précédentes.
 */
export function efficiencyTrend(activities: Activity[], sport: 'run' | 'bike', asOf: ISODate): number | null {
  const factor = (a: Activity): number | null => {
    if (a.sport !== sport || !a.avgHr || a.durationS < 40 * 60) return null;
    if (a.intensityFactor === null || a.intensityFactor < 0.6 || a.intensityFactor > 0.85) return null;
    if (sport === 'run') return a.distanceM ? a.distanceM / a.durationS / a.avgHr : null;
    const power = a.normalizedPowerW ?? a.avgPowerW;
    return power ? power / a.avgHr : null;
  };
  const recentFrom = addDays(asOf, -20);
  const referenceFrom = addDays(asOf, -69);
  const recent = present(activities.filter((a) => a.date >= recentFrom && a.date <= asOf).map(factor));
  const reference = present(activities.filter((a) => a.date >= referenceFrom && a.date < recentFrom).map(factor));
  if (recent.length < 3 || reference.length < 5) return null;
  return round(median(recent) / median(reference) - 1, 3);
}

export { mean, round, present };
