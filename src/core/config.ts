/**
 * Seuils du moteur d'analyse. Regroupés ici pour être lisibles, testables
 * et, à terme, surchargés par organisation.
 * Chaque valeur est documentée sur la page « Méthode » de l'application.
 */
export const ENGINE_VERSION = 1;

export const THRESHOLDS = {
  fitness: {
    ctlDays: 42,
    atlDays: 7,
    /** Hausse de CTL par semaine. */
    rampWatch: 5,
    rampHigh: 8,
    acwrHigh: 1.5,
    acwrWatch: 1.3,
    acwrLow: 0.75,
    tsbDeep: -30,
    /** TSB minimal attendu à l'approche d'un objectif A ou B. */
    taperTsbMin: -10,
    minHistoryDays: 28,
  },
  recovery: {
    hrvZWatch: -1,
    hrvZAlert: -1.5,
    rhrWatch: 4,
    rhrAlert: 7,
    sleepWatchH: 6.5,
    shortNightH: 6,
    subjectiveWatch: 3.8,
    baselineDays: 28,
    minBaselineValues: 10,
    minWeekValues: 3,
  },
  compliance: {
    lowPct: 0.75,
    veryLowPct: 0.5,
    overPct: 1.25,
    fourWeekLowPct: 0.7,
    /** Facteur d'intensité au-delà duquel une séance d'endurance est jugée trop soutenue. */
    easyMaxIf: 0.82,
  },
  rhythm: {
    monotonyHigh: 2,
    minLoadForMonotony: 250,
  },
  distribution: {
    lowMin: 0.65,
    moderateMax: 0.35,
    minDurationS: 4 * 3600,
  },
  run: {
    spikeWatch: 1.3,
    spikeAlert: 1.5,
    minKm: 20,
  },
  efficiency: {
    improving: 0.03,
    declining: -0.04,
  },
  data: {
    silentDays: 5,
  },
} as const;

export const READINESS_WEIGHTS = { hrv: 0.3, sleep: 0.2, form: 0.2, rhr: 0.15, subjective: 0.15 } as const;
