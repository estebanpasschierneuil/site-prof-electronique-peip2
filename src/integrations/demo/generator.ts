import { addDays, defaultReviewWeek, type ISODate } from '@/core/dates';
import { computeLoad } from '@/core/load';
import type { Activity, AthleteProfile, PlannedWorkout, Race, RaceDistance, Sport, WellnessDay, WorkoutKind } from '@/core/types';

/**
 * Générateur de données de démonstration, déterministe et ancré sur la date du jour.
 * Chaque persona suit un vrai plan (mésocycles 3 + 1, affûtage, course) et un scénario
 * qui illustre une situation de coaching : surcharge, maladie, reprise de blessure…
 * Les charges passent par le même `computeLoad` que les données réelles.
 */

export interface DemoAthlete {
  key: string;
  coach: 'claire' | 'mathieu';
  sex: 'F' | 'M';
  birthYear: number;
  distance: RaceDistance;
  weeklyHours: number;
  source: 'garmin' | 'strava' | 'intervals';
  profile: Omit<AthleteProfile, 'id'>;
  maxHr: number;
  races: Race[];
  activities: (Omit<Activity, 'id'> & { externalId: string })[];
  planned: Omit<PlannedWorkout, 'id'>[];
  wellness: WellnessDay[];
  /** Statut attendu pour la semaine de revue : sert de garde-fou dans les tests. */
  expected: { status: 'action' | 'watch' | 'ok'; code: string };
}

interface Mods {
  skip?: boolean;
  durMul?: number;
  ifMul?: number;
}
interface WellnessMods {
  hrvMul?: number;
  rhrAdd?: number;
  sleepAdd?: number;
  fatigueAdd?: number;
}
interface Extra {
  day: number;
  sport: Sport;
  kind: WorkoutKind;
  minutes: number;
  title: string;
}
interface Scenario {
  /** Position dans le mésocycle (0–2 : charge, 3 : allégée) pour la semaine de revue. */
  cyclePos: number;
  planFactor?: (w: number) => number | undefined;
  sportPlanMul?: (w: number, sport: Sport) => number;
  session?: (w: number, day: number, sport: Sport, kind: WorkoutKind) => Mods;
  extras?: (w: number) => Extra[];
  wellness?: (w: number, day: number) => WellnessMods;
  /** Multiplicateur de FC à intensité égale (< 1 : meilleure efficacité). */
  hrFactor?: (w: number) => number;
  silentFrom?: { w: number; day: number };
  historyWeeks?: number;
  noWellness?: boolean;
  /** Rapport entre les seuils réels et les seuils déclarés. */
  thresholdFactor?: number;
  race?: { w: number; name: string; distance: RaceDistance; priority: 'A' | 'B' | 'C' };
}

interface Persona {
  key: string;
  first: string;
  last: string;
  coach: 'claire' | 'mathieu';
  sex: 'F' | 'M';
  birthYear: number;
  distance: RaceDistance;
  hours: number;
  source: 'garmin' | 'strava' | 'intervals';
  ftp: number;
  runPace: number;
  css: number;
  lthr: number;
  restHr: number;
  hrv: number;
  sleep: number;
  expected: DemoAthlete['expected'];
  scenario: Scenario;
}

const HISTORY_WEEKS = 26;
const FUTURE_WEEKS = 2;
const CYCLE = [0.95, 1.03, 1.1, 0.65];

// ——— Hasard déterministe ———
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRandom(seed: string) {
  const uniform = mulberry32(hash(seed));
  const normal = (mean = 0, sd = 1) => {
    const u = Math.max(uniform(), 1e-9);
    const v = uniform();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { uniform, normal };
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ——— Plan type ———
interface TemplateSession {
  day: number;
  sport: Sport;
  kind: WorkoutKind;
  minutes: number;
  title: string;
  key?: boolean;
}

/** Semaine type pour 11 h ; les durées sont mises à l'échelle du volume de l'athlète. */
const TEMPLATE_FULL: TemplateSession[] = [
  { day: 1, sport: 'run', kind: 'vo2', minutes: 60, title: 'Fractionné 6 × 1000 m', key: true },
  { day: 1, sport: 'swim', kind: 'threshold', minutes: 55, title: 'Seuil 10 × 200 m' },
  { day: 2, sport: 'bike', kind: 'tempo', minutes: 90, title: 'Tempo 3 × 15 min' },
  { day: 2, sport: 'strength', kind: 'strength', minutes: 30, title: 'Renforcement et gainage' },
  { day: 3, sport: 'swim', kind: 'technique', minutes: 50, title: 'Technique et éducatifs' },
  { day: 3, sport: 'run', kind: 'endurance', minutes: 50, title: 'Footing endurance' },
  { day: 4, sport: 'swim', kind: 'endurance', minutes: 50, title: 'Aérobie continu' },
  { day: 5, sport: 'bike', kind: 'long', minutes: 170, title: 'Sortie longue vélo', key: true },
  { day: 5, sport: 'run', kind: 'endurance', minutes: 20, title: 'Enchaînement course' },
  { day: 6, sport: 'run', kind: 'long', minutes: 85, title: 'Sortie longue course', key: true },
];
const FULL_MINUTES = TEMPLATE_FULL.reduce((s, t) => s + t.minutes, 0);

/** Semaine type pour 7 h. */
const TEMPLATE_LIGHT: TemplateSession[] = [
  { day: 1, sport: 'run', kind: 'vo2', minutes: 50, title: 'Fractionné 5 × 1000 m', key: true },
  { day: 2, sport: 'swim', kind: 'threshold', minutes: 50, title: 'Seuil 8 × 200 m' },
  { day: 3, sport: 'bike', kind: 'tempo', minutes: 70, title: 'Tempo 2 × 20 min' },
  { day: 3, sport: 'swim', kind: 'endurance', minutes: 45, title: 'Aérobie continu' },
  { day: 5, sport: 'bike', kind: 'long', minutes: 140, title: 'Sortie longue vélo', key: true },
  { day: 6, sport: 'run', kind: 'long', minutes: 70, title: 'Sortie longue course', key: true },
  { day: 6, sport: 'swim', kind: 'technique', minutes: 40, title: 'Technique et éducatifs' },
];
const LIGHT_MINUTES = TEMPLATE_LIGHT.reduce((s, t) => s + t.minutes, 0);

/** Intensité cible (fraction du seuil) par sport et type de séance. */
const TARGET_IF: Record<'swim' | 'bike' | 'run', Partial<Record<WorkoutKind, number>>> = {
  swim: { technique: 0.72, endurance: 0.78, threshold: 0.88, recovery: 0.68, race: 0.92 },
  bike: { recovery: 0.58, endurance: 0.68, long: 0.7, tempo: 0.8, threshold: 0.86, vo2: 0.88, race: 0.8 },
  run: { recovery: 0.64, endurance: 0.7, long: 0.72, tempo: 0.82, threshold: 0.88, vo2: 0.86, race: 0.86 },
};

/** Répartition type du temps dans les zones 1 à 5. */
const ZONES: Record<WorkoutKind, number[]> = {
  recovery: [0.6, 0.4, 0, 0, 0],
  technique: [0.3, 0.57, 0.11, 0.02, 0],
  endurance: [0.15, 0.72, 0.11, 0.02, 0],
  long: [0.1, 0.74, 0.14, 0.02, 0],
  tempo: [0.1, 0.42, 0.4, 0.08, 0],
  threshold: [0.12, 0.45, 0.1, 0.3, 0.03],
  vo2: [0.15, 0.47, 0.08, 0.1, 0.2],
  strength: [0.7, 0.3, 0, 0, 0],
  brick: [0.1, 0.6, 0.25, 0.05, 0],
  race: [0.02, 0.16, 0.42, 0.36, 0.04],
};

const RPE: Record<WorkoutKind, number> = { recovery: 2, technique: 3, endurance: 3, long: 5, tempo: 6, threshold: 7, vo2: 8, strength: 4, brick: 6, race: 9 };

const RACE_LEGS: Record<RaceDistance, { swimM: number; bikeKm: number; runKm: number; bikeIf: number; runIf: number }> = {
  S: { swimM: 750, bikeKm: 20, runKm: 5, bikeIf: 0.95, runIf: 0.97 },
  M: { swimM: 1500, bikeKm: 40, runKm: 10, bikeIf: 0.9, runIf: 0.94 },
  L: { swimM: 1900, bikeKm: 90, runKm: 21.1, bikeIf: 0.8, runIf: 0.86 },
  XL: { swimM: 3800, bikeKm: 180, runKm: 42.2, bikeIf: 0.71, runIf: 0.76 },
};

function targetIf(sport: Sport, kind: WorkoutKind): number {
  if (sport === 'strength' || sport === 'other') return 0.55;
  return TARGET_IF[sport][kind] ?? 0.7;
}

function plannedLoad(sport: Sport, kind: WorkoutKind, durationS: number): number {
  const hours = durationS / 3600;
  const intensity = targetIf(sport, kind);
  if (sport === 'strength') return Math.round(hours * 0.55 ** 2 * 100);
  return Math.round(hours * intensity ** (sport === 'swim' ? 3 : 2) * 100);
}

// ——— Personas ———
const PERSONAS: Persona[] = [
  {
    key: 'lea', first: 'Léa', last: 'Marchand', coach: 'claire', sex: 'F', birthYear: 1994, distance: 'L', hours: 12, source: 'garmin',
    ftp: 215, runPace: 255, css: 98, lthr: 172, restHr: 46, hrv: 78, sleep: 7.7,
    expected: { status: 'ok', code: 'progress_ok' },
    scenario: { cyclePos: 1, race: { w: 6, name: 'Ironman 70.3 Aix-en-Provence', distance: 'L', priority: 'A' } },
  },
  {
    key: 'thomas', first: 'Thomas', last: 'Girard', coach: 'claire', sex: 'M', birthYear: 1988, distance: 'XL', hours: 15, source: 'garmin',
    ftp: 285, runPace: 245, css: 95, lthr: 166, restHr: 44, hrv: 68, sleep: 7.2,
    expected: { status: 'action', code: 'overreach' },
    scenario: {
      cyclePos: 1,
      race: { w: 9, name: 'Ironman Nice', distance: 'XL', priority: 'A' },
      session: (w) => (w === -1 || w === 0 ? { durMul: 1.18, ifMul: 1.04 } : {}),
      extras: (w) =>
        w === -1 || w === 0
          ? [
              { day: 0, sport: 'bike', kind: 'endurance', minutes: 95, title: 'Sortie vélo ajoutée' },
              { day: 4, sport: 'run', kind: 'endurance', minutes: 55, title: 'Footing ajouté' },
            ]
          : [],
      wellness: (w, day) => {
        if (w === -1) return { hrvMul: 0.95, rhrAdd: 2, sleepAdd: -0.4, fatigueAdd: 0.6 };
        if (w === 0) return { hrvMul: 0.88 - day * 0.008, rhrAdd: 4.5 + day * 0.3, sleepAdd: -0.9, fatigueAdd: 1.6 };
        if (w === 1) return { hrvMul: 0.84, rhrAdd: 6, sleepAdd: -0.9, fatigueAdd: 1.8 };
        return {};
      },
    },
  },
  {
    key: 'camille', first: 'Camille', last: 'Roux', coach: 'claire', sex: 'F', birthYear: 1991, distance: 'M', hours: 9, source: 'strava',
    ftp: 195, runPace: 270, css: 105, lthr: 174, restHr: 50, hrv: 72, sleep: 7.6,
    expected: { status: 'ok', code: 'taper_ok' },
    scenario: { cyclePos: 3, race: { w: 1, name: 'Triathlon M de La Baule', distance: 'M', priority: 'A' } },
  },
  {
    key: 'julien', first: 'Julien', last: 'Perrin', coach: 'claire', sex: 'M', birthYear: 1985, distance: 'L', hours: 10, source: 'garmin',
    ftp: 255, runPace: 260, css: 108, lthr: 164, restHr: 48, hrv: 58, sleep: 7.1,
    expected: { status: 'action', code: 'illness' },
    scenario: {
      cyclePos: 1,
      session: (w, day) => ((w === 0 && day >= 2) || (w === 1 && day <= 3) ? { skip: true } : w === 1 ? { durMul: 0.6, ifMul: 0.9 } : {}),
      wellness: (w, day) => {
        if (w === 0 && day >= 1) return { hrvMul: 0.74, rhrAdd: 10, sleepAdd: 0.6, fatigueAdd: 2.2 };
        if (w === 1) return { hrvMul: 0.8 + day * 0.03, rhrAdd: Math.max(0, 8 - day * 1.5), fatigueAdd: 1.5 };
        return {};
      },
    },
  },
  {
    key: 'sarah', first: 'Sarah', last: 'Benali', coach: 'claire', sex: 'F', birthYear: 1997, distance: 'M', hours: 14, source: 'garmin',
    ftp: 230, runPace: 230, css: 82, lthr: 178, restHr: 42, hrv: 95, sleep: 8,
    expected: { status: 'action', code: 'run_spike' },
    scenario: {
      cyclePos: 1,
      race: { w: 7, name: 'Championnat de France M', distance: 'M', priority: 'A' },
      // Reprise après une périostite : la course à pied revient progressivement dans le plan…
      sportPlanMul: (w, sport) => (sport !== 'run' ? 1 : w <= -9 ? 1 : w <= -7 ? 0 : w <= -3 ? 0.4 : w <= -1 ? 0.5 : 0.6),
      // …mais l'athlète double ses sorties dès qu'elle se sent bien.
      session: (w, _day, sport) => (w === 0 && sport === 'run' ? { durMul: 1.85 } : {}),
    },
  },
  {
    key: 'antoine', first: 'Antoine', last: 'Lefèvre', coach: 'mathieu', sex: 'M', birthYear: 1979, distance: 'L', hours: 8, source: 'strava',
    ftp: 240, runPace: 280, css: 115, lthr: 160, restHr: 52, hrv: 48, sleep: 6.9,
    expected: { status: 'watch', code: 'easy_too_hard' },
    scenario: {
      cyclePos: 1,
      session: (w, _day, sport, kind) => (w >= -9 && (sport === 'bike' || sport === 'run') && (kind === 'endurance' || kind === 'long') ? { ifMul: 1.22, durMul: 0.88 } : {}),
    },
  },
  {
    key: 'manon', first: 'Manon', last: 'Dubois', coach: 'claire', sex: 'F', birthYear: 1990, distance: 'M', hours: 8, source: 'garmin',
    ftp: 180, runPace: 295, css: 112, lthr: 170, restHr: 54, hrv: 62, sleep: 7.3,
    expected: { status: 'watch', code: 'compliance_low' },
    scenario: {
      cyclePos: 1,
      session: (w, day, sport) => {
        if (w === 0) return { skip: (day === 3 && sport === 'swim') || (day === 5 && sport === 'bike') || (day === 6 && sport === 'swim') };
        if (w === -1) return { skip: (day === 1 && sport === 'run') || (day === 3 && sport === 'bike') || (day === 6 && sport === 'swim') };
        if (w === -2) return { skip: day === 3 || (day === 6 && sport === 'run') };
        if (w === 1) return { skip: day === 2 };
        return {};
      },
    },
  },
  {
    key: 'hugo', first: 'Hugo', last: 'Fontaine', coach: 'mathieu', sex: 'M', birthYear: 1996, distance: 'M', hours: 11, source: 'strava',
    ftp: 290, runPace: 238, css: 92, lthr: 172, restHr: 45, hrv: 88, sleep: 7.5,
    expected: { status: 'action', code: 'no_data' },
    scenario: { cyclePos: 1, silentFrom: { w: -1, day: 6 } },
  },
  {
    key: 'elodie', first: 'Élodie', last: 'Garnier', coach: 'claire', sex: 'F', birthYear: 1983, distance: 'XL', hours: 13, source: 'garmin',
    ftp: 205, runPace: 275, css: 102, lthr: 162, restHr: 47, hrv: 60, sleep: 7.4,
    expected: { status: 'ok', code: 'efficiency_up' },
    scenario: {
      cyclePos: 1,
      race: { w: 10, name: 'Embrunman', distance: 'XL', priority: 'A' },
      hrFactor: (w) => (w >= -2 ? 0.95 : w >= -5 ? 0.975 : 1),
    },
  },
  {
    key: 'maxime', first: 'Maxime', last: 'Colin', coach: 'mathieu', sex: 'M', birthYear: 1992, distance: 'L', hours: 10, source: 'garmin',
    ftp: 270, runPace: 252, css: 118, lthr: 168, restHr: 49, hrv: 70, sleep: 7.2,
    expected: { status: 'watch', code: 'neglect_swim' },
    scenario: {
      cyclePos: 1,
      race: { w: 5, name: 'Half de Vichy', distance: 'L', priority: 'B' },
      session: (w, day, sport) => (sport === 'swim' && w >= -2 && w <= 1 && !(w === -2 && day === 1) ? { skip: true } : {}),
    },
  },
  {
    key: 'nicolas', first: 'Nicolas', last: 'Aubert', coach: 'mathieu', sex: 'M', birthYear: 1975, distance: 'M', hours: 7, source: 'garmin',
    ftp: 235, runPace: 285, css: 110, lthr: 156, restHr: 53, hrv: 42, sleep: 6.9,
    expected: { status: 'watch', code: 'sleep_low' },
    scenario: { cyclePos: 0, wellness: (w) => (w >= -1 ? { sleepAdd: -1.05 } : {}) },
  },
  {
    key: 'ines', first: 'Inès', last: 'Morel', coach: 'claire', sex: 'F', birthYear: 1999, distance: 'S', hours: 10, source: 'intervals',
    ftp: 200, runPace: 245, css: 88, lthr: 180, restHr: 48, hrv: 90, sleep: 7.8,
    expected: { status: 'watch', code: 'monotony' },
    scenario: {
      cyclePos: 1,
      session: (w, day) => {
        if (w !== 0 && w !== -1) return {};
        if (day === 5) return { durMul: 0.58 };
        if (day === 4) return { durMul: 1.6 };
        if (day === 6) return { durMul: 1.25 };
        return {};
      },
      extras: (w) => (w === 0 || w === -1 ? [{ day: 0, sport: 'run', kind: 'endurance', minutes: 70, title: 'Footing ajouté' }] : []),
    },
  },
  {
    key: 'paul', first: 'Paul', last: 'Renaud', coach: 'claire', sex: 'M', birthYear: 1987, distance: 'XL', hours: 14, source: 'garmin',
    ftp: 275, runPace: 255, css: 100, lthr: 165, restHr: 45, hrv: 65, sleep: 7.3,
    expected: { status: 'ok', code: 'post_race' },
    scenario: { cyclePos: 0, race: { w: -1, name: 'Ironman Barcelone', distance: 'XL', priority: 'A' } },
  },
  {
    key: 'clara', first: 'Clara', last: 'Vidal', coach: 'claire', sex: 'F', birthYear: 1993, distance: 'L', hours: 11, source: 'garmin',
    ftp: 210, runPace: 265, css: 100, lthr: 170, restHr: 49, hrv: 74, sleep: 7.5,
    expected: { status: 'action', code: 'taper_late' },
    scenario: {
      cyclePos: 3,
      race: { w: 1, name: 'Half de Cannes', distance: 'L', priority: 'A' },
      // N'ose pas lever le pied : fait sa semaine d'affûtage comme une grosse semaine.
      session: (w) => (w === 0 ? { durMul: 1.62, ifMul: 1.03 } : w === -1 ? { durMul: 1.1 } : {}),
    },
  },
  {
    key: 'romain', first: 'Romain', last: 'Chevalier', coach: 'mathieu', sex: 'M', birthYear: 1990, distance: 'M', hours: 9, source: 'strava',
    ftp: 265, runPace: 258, css: 104, lthr: 169, restHr: 50, hrv: 66, sleep: 7.3,
    expected: { status: 'ok', code: 'progress_ok' },
    scenario: { cyclePos: 2, race: { w: 3, name: 'Triathlon M de Deauville', distance: 'M', priority: 'B' } },
  },
  {
    key: 'louise', first: 'Louise', last: 'Hamon', coach: 'mathieu', sex: 'F', birthYear: 1986, distance: 'L', hours: 10, source: 'garmin',
    ftp: 190, runPace: 290, css: 108, lthr: 165, restHr: 51, hrv: 58, sleep: 7.5,
    expected: { status: 'ok', code: 'deload_ok' },
    scenario: { cyclePos: 3 },
  },
  {
    key: 'baptiste', first: 'Baptiste', last: 'Noël', coach: 'claire', sex: 'M', birthYear: 2001, distance: 'S', hours: 12, source: 'intervals',
    ftp: 280, runPace: 225, css: 80, lthr: 182, restHr: 44, hrv: 105, sleep: 8.1,
    expected: { status: 'ok', code: 'thresholds_stale' },
    scenario: { cyclePos: 1, thresholdFactor: 1.13 },
  },
  {
    key: 'oceane', first: 'Océane', last: 'Lambert', coach: 'mathieu', sex: 'F', birthYear: 1989, distance: 'M', hours: 6, source: 'strava',
    ftp: 170, runPace: 310, css: 125, lthr: 168, restHr: 56, hrv: 55, sleep: 7.2,
    expected: { status: 'ok', code: 'history_short' },
    scenario: { cyclePos: 1, historyWeeks: 3, noWellness: true },
  },
];

function planFactorFor(p: Persona, w: number): number {
  const custom = p.scenario.planFactor?.(w);
  if (custom !== undefined) return custom;
  const race = p.scenario.race;
  if (race && race.priority !== 'C') {
    const offset = w - race.w;
    if (offset === 0) return 0.5;
    if (offset === -1) return 0.72;
    if (offset === 1) return 0.35;
    if (offset === 2) return 0.7;
  }
  const pos = (((w + p.scenario.cyclePos) % 4) + 4) % 4;
  return CYCLE[pos] * (1 + 0.004 * w);
}

function generateAthlete(p: Persona, reviewWeek: ISODate, today: ISODate): DemoAthlete {
  const rng = makeRandom(`affut:${p.key}`);
  const s = p.scenario;
  const profile: Omit<AthleteProfile, 'id'> = {
    firstName: p.first,
    lastName: p.last,
    ftpW: p.ftp,
    runThresholdPaceS: p.runPace,
    swimCssS: p.css,
    lthr: p.lthr,
    restHr: p.restHr,
  };
  const real = s.thresholdFactor ?? 1;
  const template = p.hours >= 9 ? TEMPLATE_FULL : TEMPLATE_LIGHT;
  const templateMinutes = p.hours >= 9 ? FULL_MINUTES : LIGHT_MINUTES;
  const scale = (p.hours * 60) / templateMinutes;
  const firstWeek = -(s.historyWeeks ?? HISTORY_WEEKS) + 1;

  const planned: DemoAthlete['planned'] = [];
  const activities: DemoAthlete['activities'] = [];
  const wellness: WellnessDay[] = [];
  const races: Race[] = [];
  const loadByDate = new Map<ISODate, number>();
  let counter = 0;

  const silentDate = s.silentFrom ? addDays(reviewWeek, s.silentFrom.w * 7 + s.silentFrom.day) : null;
  const isSilent = (date: ISODate) => silentDate !== null && date >= silentDate;

  const perform = (date: ISODate, w: number, sport: Sport, kind: WorkoutKind, title: string, durationS: number, intensity: number) => {
    if (date > today || isSilent(date)) return;
    const hours = durationS / 3600;
    let distanceM: number | null = null;
    let np: number | null = null;
    let avgPower: number | null = null;
    if (sport === 'bike') {
      np = Math.round(intensity * p.ftp * real);
      avgPower = Math.round(np * (0.93 + rng.uniform() * 0.04));
      distanceM = Math.round(5.1 * Math.cbrt(avgPower) * hours * 1000);
    } else if (sport === 'run') {
      distanceM = Math.round((intensity * real * 1000 * durationS) / p.runPace / 10) * 10;
    } else if (sport === 'swim') {
      distanceM = Math.round((intensity * real * 100 * durationS) / p.css / 50) * 50;
    }
    const tri = sport === 'swim' || sport === 'bike' || sport === 'run';
    const hrFactor = s.hrFactor?.(w) ?? 1;
    const hrBase = p.lthr * (0.45 + 0.55 * intensity) * hrFactor - (sport === 'swim' ? 10 : 0);
    const avgHr = tri && !(sport === 'swim' && rng.uniform() < 0.4) ? Math.round(hrBase + rng.normal(0, 1.5)) : sport === 'strength' ? Math.round(p.restHr + 55 + rng.normal(0, 4)) : null;

    const base = ZONES[kind];
    const shift = clamp((intensity / targetIf(sport, kind) - 1) * 2.4, 0, 0.6);
    const zones = [base[0] * (1 - shift), base[1] * (1 - shift), base[2] + (base[0] + base[1]) * shift * 0.8, base[3] + (base[0] + base[1]) * shift * 0.2, base[4]];
    const zoneSeconds = zones.map((z) => Math.round(z * durationS));

    const computed = computeLoad({ sport, durationS, distanceM, normalizedPowerW: np, avgPowerW: avgPower, avgHr }, profile);
    activities.push({
      externalId: `demo-${p.key}-${++counter}`,
      date,
      sport,
      title,
      durationS: Math.round(durationS),
      distanceM,
      elevationM: sport === 'bike' && distanceM ? Math.round((distanceM / 1000) * (7 + rng.uniform() * 5)) : sport === 'run' && distanceM ? Math.round((distanceM / 1000) * (4 + rng.uniform() * 6)) : null,
      avgHr,
      avgPowerW: avgPower,
      normalizedPowerW: np,
      rpe: clamp(Math.round(RPE[kind] + (intensity / targetIf(sport, kind) - 1) * 12 + rng.normal(0, 0.5)), 1, 10),
      zoneSeconds,
      load: computed.load,
      intensityFactor: computed.intensityFactor,
      loadMethod: computed.method,
    });
    loadByDate.set(date, (loadByDate.get(date) ?? 0) + computed.load);
  };

  for (let w = firstWeek; w <= FUTURE_WEEKS; w++) {
    const monday = addDays(reviewWeek, w * 7);
    const factor = planFactorFor(p, w);
    const race = s.race && s.race.w === w ? s.race : null;

    for (const t of template) {
      // La veille et le jour de course remplacent les séances habituelles.
      if (race && t.day >= 5) continue;
      const sportMul = s.sportPlanMul?.(w, t.sport) ?? 1;
      if (sportMul === 0) continue;
      const date = addDays(monday, t.day);
      const durationS = Math.round((t.minutes * scale * factor * sportMul) / 5) * 5 * 60;
      if (durationS < 15 * 60) continue;
      planned.push({ date, sport: t.sport, kind: t.kind, title: t.title, durationS, load: plannedLoad(t.sport, t.kind, durationS), isKey: Boolean(t.key) && factor > 0.6 });

      const mods = s.session?.(w, t.day, t.sport, t.kind) ?? {};
      // Les semaines récentes sont entièrement scénarisées : pas d'aléa sur les séances manquées.
      const skipped = mods.skip || (w < -3 && rng.uniform() < 0.04);
      if (skipped) continue;
      const actualS = durationS * (mods.durMul ?? 1) * clamp(rng.normal(1, 0.045), 0.85, 1.15);
      const intensity = targetIf(t.sport, t.kind) * (mods.ifMul ?? 1) * clamp(rng.normal(1, 0.018), 0.95, 1.05);
      perform(date, w, t.sport, t.kind, t.title, actualS, intensity);
    }

    for (const extra of s.extras?.(w) ?? []) {
      perform(addDays(monday, extra.day), w, extra.sport, extra.kind, extra.title, extra.minutes * 60 * clamp(rng.normal(1, 0.05), 0.9, 1.1), targetIf(extra.sport, extra.kind) * clamp(rng.normal(1, 0.02), 0.95, 1.05));
    }

    if (race) {
      const legs = RACE_LEGS[race.distance];
      const saturday = addDays(monday, 5);
      const sunday = addDays(monday, 6);
      races.push({ date: sunday, name: race.name, distance: race.distance, priority: race.priority });
      planned.push({ date: saturday, sport: 'bike', kind: 'recovery', title: 'Déblocage veille de course', durationS: 30 * 60, load: plannedLoad('bike', 'recovery', 30 * 60), isKey: false });
      perform(saturday, w, 'bike', 'recovery', 'Déblocage veille de course', 30 * 60, 0.6);

      const swimS = (legs.swimM / 100) * p.css * 1.04;
      const bikeS = (legs.bikeKm / (5.1 * Math.cbrt(legs.bikeIf * p.ftp * 0.95))) * 3600;
      const runS = legs.runKm * (p.runPace / legs.runIf);
      const parts: [Sport, number, number][] = [
        ['swim', swimS, 0.96],
        ['bike', bikeS, legs.bikeIf],
        ['run', runS, legs.runIf],
      ];
      for (const [sport, durationS, intensity] of parts) {
        const title = `${race.name}, ${sport === 'swim' ? 'natation' : sport === 'bike' ? 'vélo' : 'course à pied'}`;
        planned.push({ date: sunday, sport, kind: 'race', title, durationS: Math.round(durationS), load: plannedLoad(sport, 'race', durationS), isKey: true });
        perform(sunday, w, sport, 'race', title, durationS * clamp(rng.normal(1, 0.02), 0.96, 1.04), intensity);
      }
    }
  }
  if (s.race && s.race.w > FUTURE_WEEKS) {
    races.push({ date: addDays(reviewWeek, s.race.w * 7 + 6), name: s.race.name, distance: s.race.distance, priority: s.race.priority });
  }

  // ——— Récupération : dérivée de la fatigue réellement accumulée ———
  if (!s.noWellness) {
    let ctl = (p.hours * 55) / 7;
    let atl = ctl;
    const start = addDays(reviewWeek, firstWeek * 7);
    for (let date = start; date <= today; date = addDays(date, 1)) {
      const load = loadByDate.get(date) ?? 0;
      const strain = clamp((atl - ctl) / Math.max(ctl, 20), -0.3, 0.8);
      ctl += (load - ctl) / 42;
      atl += (load - atl) / 7;
      if (isSilent(date)) continue;
      const offset = Math.round((Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) - Date.UTC(+reviewWeek.slice(0, 4), +reviewWeek.slice(5, 7) - 1, +reviewWeek.slice(8, 10))) / 86_400_000);
      const w = Math.floor(offset / 7);
      const day = ((offset % 7) + 7) % 7;
      const mods = s.wellness?.(w, day) ?? {};
      const logged = rng.uniform() < 0.88;
      wellness.push({
        date,
        hrv: Math.round(p.hrv * (1 - 0.1 * Math.max(0, strain)) * (mods.hrvMul ?? 1) * clamp(rng.normal(1, 0.055), 0.85, 1.15)),
        restingHr: Math.round(p.restHr + 4 * Math.max(0, strain) + (mods.rhrAdd ?? 0) + rng.normal(0, 1.2)),
        sleepH: Math.round(clamp(p.sleep + (day >= 5 ? 0.4 : 0) + (mods.sleepAdd ?? 0) + rng.normal(0, 0.5), 4, 10) * 10) / 10,
        fatigue: logged ? clamp(Math.round(2.2 + 2.5 * strain + (mods.fatigueAdd ?? 0) + rng.normal(0, 0.45)), 1, 5) : null,
        soreness: logged ? clamp(Math.round(2 + 2 * strain + (mods.fatigueAdd ?? 0) * 0.6 + rng.normal(0, 0.5)), 1, 5) : null,
        mood: logged ? clamp(Math.round(4 - 1.2 * strain - (mods.fatigueAdd ?? 0) * 0.6 + rng.normal(0, 0.45)), 1, 5) : null,
      });
    }
  }

  return {
    key: p.key,
    coach: p.coach,
    sex: p.sex,
    birthYear: p.birthYear,
    distance: p.distance,
    weeklyHours: p.hours,
    source: p.source,
    profile,
    maxHr: Math.round(p.lthr / 0.9),
    races,
    activities,
    planned,
    wellness,
    expected: p.expected,
  };
}

/** Jeu de démonstration complet, ancré sur la dernière semaine terminée. */
export function generateDemo(today: ISODate): { reviewWeek: ISODate; athletes: DemoAthlete[] } {
  const reviewWeek = defaultReviewWeek(today);
  return { reviewWeek, athletes: PERSONAS.map((p) => generateAthlete(p, reviewWeek, today)) };
}
