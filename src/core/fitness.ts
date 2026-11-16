import { THRESHOLDS } from './config';
import { addDays, dateRange, type ISODate } from './dates';
import type { DayPoint } from './types';

/**
 * Modèle charge chronique / charge aiguë (Banister, version à moyennes exponentielles).
 * CTL = moyenne mobile exponentielle 42 jours (condition), ATL = 7 jours (fatigue),
 * TSB = CTL − ATL (fraîcheur) à l'issue de la journée.
 */
export function buildFitnessSeries(loadByDate: Map<ISODate, number>, from: ISODate, to: ISODate): DayPoint[] {
  const { ctlDays, atlDays } = THRESHOLDS.fitness;
  const days = dateRange(from, to);
  if (days.length === 0) return [];

  // Amorçage sur la moyenne des 14 premiers jours pour limiter le biais de démarrage.
  const warmup = days.slice(0, 14);
  const seed = warmup.reduce((sum, d) => sum + (loadByDate.get(d) ?? 0), 0) / warmup.length;

  let ctl = seed;
  let atl = seed;
  return days.map((date) => {
    const load = loadByDate.get(date) ?? 0;
    ctl += (load - ctl) / ctlDays;
    atl += (load - atl) / atlDays;
    return { date, load, ctl: round1(ctl), atl: round1(atl), tsb: round1(ctl - atl) };
  });
}

export function sumLoads(loadByDate: Map<ISODate, number>, from: ISODate, to: ISODate): number {
  let sum = 0;
  for (const date of dateRange(from, to)) sum += loadByDate.get(date) ?? 0;
  return sum;
}

/** Ratio charge aiguë (7 j) sur charge chronique (moyenne hebdomadaire des 28 j). */
export function acuteChronicRatio(loadByDate: Map<ISODate, number>, asOf: ISODate): number | null {
  const acute = sumLoads(loadByDate, addDays(asOf, -6), asOf);
  const chronic = sumLoads(loadByDate, addDays(asOf, -27), asOf) / 4;
  if (chronic < 50) return null;
  return Math.round((acute / chronic) * 100) / 100;
}

/** Monotonie de Foster : moyenne quotidienne / écart-type quotidien. */
export function monotony(dailyLoads: number[]): number | null {
  if (dailyLoads.length < 5) return null;
  const mean = dailyLoads.reduce((a, b) => a + b, 0) / dailyLoads.length;
  if (mean === 0) return null;
  const variance = dailyLoads.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyLoads.length;
  const sd = Math.sqrt(variance);
  if (sd < mean / 10) return 10;
  return Math.round((mean / sd) * 100) / 100;
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
}
