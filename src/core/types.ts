import type { ISODate } from './dates';

export type Sport = 'swim' | 'bike' | 'run' | 'strength' | 'other';
export const TRI_SPORTS = ['swim', 'bike', 'run'] as const;
export type TriSport = (typeof TRI_SPORTS)[number];

export type WorkoutKind =
  | 'recovery'
  | 'endurance'
  | 'long'
  | 'tempo'
  | 'threshold'
  | 'vo2'
  | 'technique'
  | 'strength'
  | 'brick'
  | 'race';

export type LoadMethod = 'power' | 'pace' | 'hr' | 'rpe' | 'duration';
export type RaceDistance = 'S' | 'M' | 'L' | 'XL';
export type RacePriority = 'A' | 'B' | 'C';

/** Seuils physiologiques de l'athlète, nécessaires pour normaliser la charge. */
export interface AthleteProfile {
  id: string;
  firstName: string;
  lastName: string;
  /** FTP vélo en watts. */
  ftpW: number | null;
  /** Allure seuil course à pied, en secondes par km. */
  runThresholdPaceS: number | null;
  /** Critical Swim Speed, en secondes par 100 m. */
  swimCssS: number | null;
  /** Fréquence cardiaque au seuil lactique. */
  lthr: number | null;
  restHr: number | null;
}

export interface Activity {
  id: string;
  date: ISODate;
  sport: Sport;
  title: string;
  durationS: number;
  distanceM: number | null;
  elevationM: number | null;
  avgHr: number | null;
  avgPowerW: number | null;
  normalizedPowerW: number | null;
  /** Ressenti de la séance, échelle 1–10. */
  rpe: number | null;
  /** Temps passé dans les zones 1 à 5, en secondes. */
  zoneSeconds: number[] | null;
  load: number;
  intensityFactor: number | null;
  loadMethod: LoadMethod;
}

export interface PlannedWorkout {
  id: string;
  date: ISODate;
  sport: Sport;
  kind: WorkoutKind;
  title: string;
  durationS: number;
  load: number;
  isKey: boolean;
}

export interface WellnessDay {
  date: ISODate;
  /** VFC nocturne (rMSSD, ms). */
  hrv: number | null;
  restingHr: number | null;
  sleepH: number | null;
  /** 1 = très frais, 5 = épuisé. */
  fatigue: number | null;
  /** 1 = aucune courbature, 5 = très douloureux. */
  soreness: number | null;
  /** 1 = moral au plus bas, 5 = excellent. */
  mood: number | null;
}

export interface Race {
  date: ISODate;
  name: string;
  distance: RaceDistance;
  priority: RacePriority;
}

export type Severity = 'critical' | 'warning' | 'info' | 'positive';
export type InsightCategory = 'charge' | 'recuperation' | 'intensite' | 'conformite' | 'regularite' | 'competition' | 'performance' | 'donnees';
export type WeekStatus = 'action' | 'watch' | 'ok';

export interface Insight {
  code: string;
  severity: Severity;
  category: InsightCategory;
  /** Constat, formulé pour être lu en une seconde. */
  title: string;
  /** Preuve chiffrée du constat. */
  detail: string;
  /** Ce que le coach peut faire. */
  action?: string;
}

export type Phase = 'training' | 'deload' | 'taper' | 'race_week' | 'post_race';
export type RecommendationMode = 'recover' | 'ease' | 'maintain' | 'progress' | 'taper' | 'race' | 'post_race' | 'rebuild';

export interface Recommendation {
  mode: RecommendationMode;
  label: string;
  rationale: string;
  /** Fourchette de charge conseillée pour la semaine suivante. */
  targetLoad: [number, number];
  /** Charge déjà planifiée la semaine suivante, si un plan existe. */
  plannedNextLoad: number | null;
  planVerdict: 'above' | 'within' | 'below' | 'none';
  actions: string[];
}

export interface SportTotals {
  load: number;
  durationS: number;
  distanceM: number;
  sessions: number;
}

export interface SessionRow {
  date: ISODate;
  sport: Sport;
  title: string;
  kind: WorkoutKind | null;
  isKey: boolean;
  state: 'done' | 'missed' | 'unplanned' | 'upcoming';
  plannedDurationS: number | null;
  plannedLoad: number | null;
  durationS: number | null;
  distanceM: number | null;
  load: number | null;
  intensityFactor: number | null;
  avgHr: number | null;
  rpe: number | null;
  loadMethod: LoadMethod | null;
}

export interface BaselineMetric {
  week: number | null;
  baseline: number | null;
  sd: number | null;
  /** Écart à la référence en nombre d'écarts-types. */
  z: number | null;
  /** Écart absolu à la référence. */
  delta: number | null;
}

export interface WeekPoint {
  weekStart: ISODate;
  load: number;
  planned: number;
  bySport: Record<Sport, number>;
  ctl: number;
  tsb: number;
}

export interface DayPoint {
  date: ISODate;
  load: number;
  ctl: number;
  atl: number;
  tsb: number;
}

export interface WellnessPoint {
  date: ISODate;
  hrv: number | null;
  restingHr: number | null;
  sleepH: number | null;
}

export interface WeeklyAnalysis {
  engineVersion: number;
  weekStart: ISODate;
  weekEnd: ISODate;
  /** Dernier jour pris en compte : la fin de semaine, ou aujourd'hui si la semaine est en cours. */
  asOf: ISODate;
  isPartial: boolean;
  status: WeekStatus;
  priority: number;
  headline: string;
  summary: string;
  phase: Phase;
  nextRace: (Race & { daysTo: number }) | null;

  load: {
    done: number;
    planned: number;
    durationS: number;
    plannedDurationS: number;
    bySport: Record<Sport, SportTotals>;
    plannedBySport: Record<Sport, SportTotals>;
  };
  fitness: {
    ctl: number;
    atl: number;
    tsb: number;
    /** Variation de CTL sur la semaine. */
    ramp: number;
    /** Charge 7 jours rapportée à la moyenne hebdomadaire des 28 jours. */
    acwr: number | null;
    historyDays: number;
  };
  distribution: { low: number; moderate: number; high: number; totalS: number } | null;
  rhythm: { monotony: number | null; strain: number | null; trainingDays: number; restDays: number; dailyLoads: number[] };
  compliance: {
    loadPct: number | null;
    durationPct: number | null;
    sessionsPlanned: number;
    sessionsDone: number;
    keyPlanned: number;
    keyDone: number;
    easyTooHard: number;
    fourWeekPct: number | null;
  };
  recovery: {
    readiness: number | null;
    components: { key: 'hrv' | 'rhr' | 'sleep' | 'subjective' | 'form'; label: string; score: number; weight: number }[];
    hrv: BaselineMetric;
    restingHr: BaselineMetric;
    sleep: BaselineMetric & { shortNights: number };
    fatigue: number | null;
    soreness: number | null;
    mood: number | null;
    loggedDays: number;
  };
  run: { km: number; baselineKm: number | null; maxKm: number | null; ratio: number | null };
  efficiency: { run: number | null; bike: number | null };
  daysSinceLastActivity: number | null;

  insights: Insight[];
  recommendation: Recommendation;
  sessions: SessionRow[];
  series: { weeks: WeekPoint[]; days: DayPoint[]; wellness: WellnessPoint[] };
  /** Brouillon de retour à envoyer à l'athlète. */
  message: string;
}
