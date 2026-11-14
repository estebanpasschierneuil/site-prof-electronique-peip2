import { ENGINE_VERSION, THRESHOLDS as T } from './config';
import { addDays, diffDays, weekEnd as endOfWeek, type ISODate } from './dates';
import { ALL_SPORTS, baselineMetric, efficiencyTrend, emptyTotals, matchWeek, mean, present, readiness, round, weekAverage } from './facts';
import { acuteChronicRatio, buildFitnessSeries, monotony, sumLoads } from './fitness';
import { formatDuration, formatInt, formatPct, formatSigned } from './format';
import { deriveInsights, deriveStatus, type InsightContext } from './insights';
import { draftMessage } from './message';
import { recommend } from './recommend';
import type { Activity, AthleteProfile, Phase, PlannedWorkout, Race, Sport, TriSport, WeekPoint, WeeklyAnalysis, WellnessDay } from './types';
import { TRI_SPORTS } from './types';

export interface AnalyzeInput {
  athlete: AthleteProfile;
  activities: Activity[];
  planned: PlannedWorkout[];
  wellness: WellnessDay[];
  races: Race[];
  weekStart: ISODate;
  today: ISODate;
}

const SERIES_WEEKS = 12;
const SERIES_DAYS = 84;
const WELLNESS_DAYS = 42;

/**
 * Analyse une semaine d'entraînement telle qu'elle se présentait à sa clôture :
 * aucune donnée postérieure à `asOf` n'est prise en compte.
 */
export function analyzeWeek(input: AnalyzeInput): WeeklyAnalysis {
  const { weekStart: start, today } = input;
  const end = endOfWeek(start);
  const asOf = end <= today ? end : today;
  const isPartial = asOf < end;

  const activities = input.activities.filter((a) => a.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
  const wellness = input.wellness.filter((d) => d.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
  const races = [...input.races].sort((a, b) => a.date.localeCompare(b.date));

  // ——— Charge quotidienne et modèle forme / fatigue ———
  const loadByDate = new Map<ISODate, number>();
  for (const a of activities) loadByDate.set(a.date, (loadByDate.get(a.date) ?? 0) + a.load);
  const firstDate = activities[0]?.date ?? start;
  const historyDays = Math.max(0, diffDays(asOf, firstDate) + 1);
  const fitnessSeries = buildFitnessSeries(loadByDate, firstDate < start ? firstDate : start, asOf);
  const fitnessAt = (date: ISODate) => fitnessSeries.find((p) => p.date === date) ?? null;
  const last = fitnessSeries[fitnessSeries.length - 1] ?? { ctl: 0, atl: 0, tsb: 0 };
  const before = fitnessAt(addDays(start, -1));

  // ——— Semaine : réalisé contre prévu ———
  const match = matchWeek(input.planned, activities, start, end, asOf);
  const bySport = emptyTotals();
  const plannedBySport = emptyTotals();
  for (const a of activities) {
    if (a.date < start) continue;
    const t = bySport[a.sport];
    t.load += a.load;
    t.durationS += a.durationS;
    t.distanceM += a.distanceM ?? 0;
    t.sessions++;
  }
  for (const p of input.planned) {
    if (p.date < start || p.date > asOf) continue;
    const t = plannedBySport[p.sport];
    t.load += p.load;
    t.durationS += p.durationS;
    t.sessions++;
  }
  const total = (totals: typeof bySport, key: 'load' | 'durationS') => ALL_SPORTS.reduce((sum, s) => sum + totals[s][key], 0);
  const load = {
    done: total(bySport, 'load'),
    planned: total(plannedBySport, 'load'),
    durationS: total(bySport, 'durationS'),
    plannedDurationS: total(plannedBySport, 'durationS'),
    bySport,
    plannedBySport,
  };

  // ——— Régularité sur 4 semaines et sports délaissés sur 3 semaines ———
  let plannedFour = 0;
  let doneFour = 0;
  const three = { planned: { swim: 0, bike: 0, run: 0 }, done: { swim: 0, bike: 0, run: 0 } };
  for (let w = 0; w < 4; w++) {
    const ws = addDays(start, -7 * w);
    if (ws < firstDate && w > 0) break;
    const m = w === 0 ? match : matchWeek(input.planned, activities, ws, endOfWeek(ws), asOf);
    plannedFour += m.planned;
    doneFour += m.done;
    if (w < 3) {
      for (const s of TRI_SPORTS) {
        three.planned[s] += m.plannedBySport[s];
        three.done[s] += m.doneBySport[s];
      }
    }
  }
  const neglected = TRI_SPORTS.filter((s) => three.planned[s] >= 4 && three.done[s] / three.planned[s] < 0.4).map((s: TriSport) => ({
    sport: s,
    done: three.done[s],
    planned: three.planned[s],
  }));

  // ——— Rythme de la semaine ———
  const weekDays = Array.from({ length: diffDays(asOf, start) + 1 }, (_, i) => addDays(start, i));
  const dailyLoads = weekDays.map((d) => loadByDate.get(d) ?? 0);
  const mono = isPartial ? null : monotony(dailyLoads);
  const restDays = dailyLoads.filter((l) => l < 15).length;

  // ——— Répartition de l'intensité (modèle à 3 zones) ———
  let low = 0;
  let moderate = 0;
  let high = 0;
  for (const a of activities) {
    if (a.date < start || !a.zoneSeconds) continue;
    const [z1 = 0, z2 = 0, z3 = 0, z4 = 0, z5 = 0] = a.zoneSeconds;
    low += z1 + z2;
    moderate += z3 + z4;
    high += z5;
  }
  const zoneTotal = low + moderate + high;
  const distribution = zoneTotal > 0 ? { low: round(low / zoneTotal, 3), moderate: round(moderate / zoneTotal, 3), high: round(high / zoneTotal, 3), totalS: zoneTotal } : null;

  // ——— Récupération ———
  const hrv = baselineMetric(wellness, (d) => d.hrv, start, asOf);
  const restingHr = baselineMetric(wellness, (d) => d.restingHr, start, asOf);
  const sleep = baselineMetric(wellness, (d) => d.sleepH, start, asOf);
  const weekWellness = wellness.filter((d) => d.date >= start);
  const fatigue = weekAverage(wellness, (d) => d.fatigue, start, asOf);
  const soreness = weekAverage(wellness, (d) => d.soreness, start, asOf);
  const mood = weekAverage(wellness, (d) => d.mood, start, asOf);
  const ready = readiness({ hrvZ: hrv.z, rhrDelta: restingHr.delta, sleepH: sleep.week, fatigue, soreness, mood, tsb: last.tsb });
  const recovery = {
    readiness: ready.score,
    components: ready.components,
    hrv,
    restingHr,
    sleep: { ...sleep, shortNights: present(weekWellness.map((d) => d.sleepH)).filter((h) => h < T.recovery.shortNightH).length },
    fatigue,
    soreness,
    mood,
    loggedDays: weekWellness.filter((d) => d.hrv !== null || d.sleepH !== null || d.fatigue !== null).length,
  };

  // ——— Course à pied : variation de volume ———
  const runKm = (from: ISODate, to: ISODate) => activities.filter((a) => a.sport === 'run' && a.date >= from && a.date <= to).reduce((s, a) => s + (a.distanceM ?? 0), 0) / 1000;
  const km = round(runKm(start, asOf));
  const priorWeeks = [1, 2, 3, 4].filter((w) => addDays(start, -7 * w) >= firstDate).map((w) => runKm(addDays(start, -7 * w), addDays(start, -7 * w + 6)));
  const baselineKm = priorWeeks.length >= 3 ? round(mean(priorWeeks)) : null;
  const run = { km, baselineKm, maxKm: priorWeeks.length ? round(Math.max(...priorWeeks)) : null, ratio: baselineKm && baselineKm >= 8 && !isPartial ? round(km / baselineKm, 2) : null };

  // ——— Contexte compétition ———
  const majorRaces = races.filter((r) => r.priority !== 'C');
  const raceInWeek = majorRaces.find((r) => r.date >= start && r.date <= end) ?? null;
  const racePrevWeek = majorRaces.find((r) => r.date >= addDays(start, -8) && r.date < start) ?? null;
  const upcoming = races.find((r) => r.date > asOf) ?? null;
  const nextRace = upcoming ? { ...upcoming, daysTo: diffDays(upcoming.date, asOf) } : null;
  const nextMajor = majorRaces.find((r) => r.date > end) ?? null;

  const plannedLoadOfWeek = (ws: ISODate) => input.planned.filter((p) => p.date >= ws && p.date <= endOfWeek(ws)).reduce((s, p) => s + p.load, 0);
  const priorPlanned = [1, 2, 3].map((w) => plannedLoadOfWeek(addDays(start, -7 * w))).filter((v) => v > 0);
  const weekPlannedFull = plannedLoadOfWeek(start);
  const isDeload = priorPlanned.length >= 2 && weekPlannedFull > 0 && weekPlannedFull < 0.8 * mean(priorPlanned);

  let phase: Phase = 'training';
  if (raceInWeek) phase = 'race_week';
  else if (racePrevWeek) phase = 'post_race';
  else if (nextMajor && diffDays(nextMajor.date, end) <= 14) phase = 'taper';
  else if (isDeload) phase = 'deload';

  // ——— Données manquantes ———
  const lastActivityDate = activities[activities.length - 1]?.date ?? null;
  const daysSinceLastActivity = lastActivityDate ? diffDays(asOf, lastActivityDate) : null;
  const plannedSinceLastActivity = lastActivityDate ? input.planned.filter((p) => p.date > lastActivityDate && p.date <= asOf).length : 0;

  const lastWellnessDate = wellness.filter((d) => d.hrv !== null || d.sleepH !== null || d.restingHr !== null).at(-1)?.date ?? null;
  const daysSinceLastWellness = lastWellnessDate ? diffDays(asOf, lastWellnessDate) : null;

  const threeWeeksAgo = addDays(start, -14);
  const raceDates = new Set(races.map((r) => r.date));
  const aboveThresholdSessions = activities.filter(
    (a) => a.date >= threeWeeksAgo && !raceDates.has(a.date) && (a.sport === 'bike' || a.sport === 'run') && a.durationS >= 45 * 60 && (a.intensityFactor ?? 0) >= 0.94,
  ).length;

  const fitness = {
    ctl: last.ctl,
    atl: last.atl,
    tsb: last.tsb,
    ramp: before ? round(last.ctl - before.ctl) : 0,
    acwr: acuteChronicRatio(loadByDate, asOf),
    historyDays,
  };
  const compliance = {
    loadPct: load.planned > 0 ? round(load.done / load.planned, 3) : null,
    durationPct: load.plannedDurationS > 0 ? round(load.durationS / load.plannedDurationS, 3) : null,
    sessionsPlanned: match.planned,
    sessionsDone: match.done,
    keyPlanned: match.keyPlanned,
    keyDone: match.keyDone,
    easyTooHard: match.easyTooHard,
    fourWeekPct: plannedFour >= 8 ? round(doneFour / plannedFour, 3) : null,
  };
  const rhythm = { monotony: mono, strain: mono === null ? null : Math.round(load.done * mono), trainingDays: dailyLoads.length - restDays, restDays, dailyLoads };
  const efficiency = { run: efficiencyTrend(activities, 'run', asOf), bike: efficiencyTrend(activities, 'bike', asOf) };

  const context: InsightContext = {
    phase,
    nextRace,
    recentRace: raceInWeek ?? racePrevWeek,
    load,
    fitness,
    distribution,
    rhythm,
    compliance,
    recovery,
    run,
    efficiency,
    daysSinceLastActivity,
    lastActivityDate,
    daysSinceLastWellness,
    plannedSinceLastActivity,
    missedKeyTitles: match.missedKeyTitles,
    neglected,
    aboveThresholdSessions,
    isPartial,
  };
  const insights = deriveInsights(context);
  const { status, priority } = deriveStatus(insights);

  const nextStart = addDays(start, 7);
  const plannedNext = input.planned.filter((p) => p.date >= nextStart && p.date <= endOfWeek(nextStart) && p.kind !== 'race');
  const recommendation = recommend({
    phase,
    ctl: fitness.ctl,
    insights,
    nextRace: nextMajor ? { ...nextMajor, daysTo: diffDays(nextMajor.date, end) } : null,
    loadPct: compliance.loadPct,
    plannedNextLoad: plannedNext.length ? plannedNext.reduce((s, p) => s + p.load, 0) : null,
    reliable: historyDays >= T.fitness.minHistoryDays,
  });

  // ——— Séries pour les graphiques ———
  const weeks: WeekPoint[] = [];
  for (let w = SERIES_WEEKS - 1; w >= 0; w--) {
    const ws = addDays(start, -7 * w);
    const we = endOfWeek(ws) <= asOf ? endOfWeek(ws) : asOf;
    const sportLoads = Object.fromEntries(ALL_SPORTS.map((s) => [s, 0])) as Record<Sport, number>;
    for (const a of activities) if (a.date >= ws && a.date <= we) sportLoads[a.sport] += a.load;
    const point = fitnessAt(we);
    weeks.push({ weekStart: ws, load: sumLoads(loadByDate, ws, we), planned: plannedLoadOfWeek(ws), bySport: sportLoads, ctl: point?.ctl ?? 0, tsb: point?.tsb ?? 0 });
  }
  const seriesFrom = addDays(asOf, -(SERIES_DAYS - 1));
  const wellnessFrom = addDays(asOf, -(WELLNESS_DAYS - 1));

  const headline = insights[0]?.title ?? (compliance.loadPct !== null ? 'Semaine conforme au plan' : 'Rien à signaler');
  const summaryParts = [
    load.plannedDurationS > 0 ? `${formatDuration(load.durationS)} sur ${formatDuration(load.plannedDurationS)} prévues` : `${formatDuration(load.durationS)} d’entraînement`,
    `${formatInt(load.done)} points de charge${compliance.loadPct !== null ? ` (${formatPct(compliance.loadPct)} du plan)` : ''}`,
    `fraîcheur à ${formatSigned(fitness.tsb)}`,
  ];
  if (recovery.readiness !== null) summaryParts.push(`préparation ${recovery.readiness}/100`);

  const analysis: WeeklyAnalysis = {
    engineVersion: ENGINE_VERSION,
    weekStart: start,
    weekEnd: end,
    asOf,
    isPartial,
    status,
    priority: priority + (nextRace && nextRace.daysTo <= 14 ? 10 : 0),
    headline,
    summary: `${summaryParts.join(', ')}.`,
    phase,
    nextRace,
    load,
    fitness,
    distribution,
    rhythm,
    compliance,
    recovery,
    run,
    efficiency,
    daysSinceLastActivity,
    insights,
    recommendation,
    sessions: match.rows,
    series: {
      weeks,
      days: fitnessSeries.filter((p) => p.date >= seriesFrom),
      wellness: wellness.filter((d) => d.date >= wellnessFrom).map((d) => ({ date: d.date, hrv: d.hrv, restingHr: d.restingHr, sleepH: d.sleepH })),
    },
    message: '',
  };
  analysis.message = draftMessage(input.athlete.firstName, analysis, insights, recommendation);
  return analysis;
}
