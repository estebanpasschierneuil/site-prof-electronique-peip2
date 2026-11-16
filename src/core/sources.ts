import type { ISODate } from './dates';
import type { Sport, WellnessDay } from './types';

/**
 * Réconciliation multi-sources. Un athlète connecte souvent plusieurs applications
 * qui se recopient entre elles (montre → Strava → plateforme d'analyse) : la même séance
 * arrive alors deux ou trois fois. Ces fonctions pures décident quelle version garder.
 */

export interface SourcedActivity {
  id: string;
  source: string;
  sport: Sport;
  date: ISODate;
  /** Début de séance en secondes depuis l'époque, si la source le fournit. */
  startS: number | null;
  durationS: number;
  distanceM: number | null;
  hasPower: boolean;
  hasHr: boolean;
  hasZones: boolean;
}

/** Fiabilité relative des sources pour une même séance : l'enregistrement d'origine d'abord. */
const ACTIVITY_SOURCE_RANK: Record<string, number> = { file: 6, garmin: 6, intervals: 5, wahoo: 5, polar: 5, strava: 3, whoop: 2, oura: 1 };

function richness(a: SourcedActivity): number {
  return (a.hasPower ? 8 : 0) + (a.hasZones ? 4 : 0) + (a.hasHr ? 2 : 0) + (a.distanceM ? 1 : 0) + (ACTIVITY_SOURCE_RANK[a.source] ?? 0) / 10;
}

const within = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance * Math.max(a, b);

/** Deux enregistrements décrivent-ils la même séance ? */
export function isSameSession(a: SourcedActivity, b: SourcedActivity): boolean {
  if (a.source === b.source) return false;
  if (a.sport !== b.sport && a.sport !== 'other' && b.sport !== 'other') return false;

  if (a.startS !== null && b.startS !== null) {
    const overlap = Math.min(a.startS + a.durationS, b.startS + b.durationS) - Math.max(a.startS, b.startS);
    const shorter = Math.min(a.durationS, b.durationS);
    // Les deux enregistrements couvrent le même créneau : au moins 70 % de la plus courte,
    // pour des durées comparables (temps actif et temps écoulé diffèrent selon les sources).
    return shorter > 0 && overlap / shorter >= 0.7 && within(a.durationS, b.durationS, 0.35);
  }

  // Sans heure de départ fiable : même jour, même durée, même distance.
  if (a.date !== b.date || !within(a.durationS, b.durationS, 0.06)) return false;
  return a.distanceM && b.distanceM ? within(a.distanceM, b.distanceM, 0.06) : true;
}

/**
 * Regroupe les séances identiques et désigne, pour chaque doublon, la version à garder
 * (la plus riche : puissance, zones, FC, puis la source la plus proche de l'appareil).
 * Retourne une table doublon → version retenue.
 */
export function findDuplicates(activities: SourcedActivity[]): Map<string, string> {
  const parent = new Map(activities.map((a) => [a.id, a.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };

  const sorted = [...activities].sort((a, b) => a.date.localeCompare(b.date) || (a.startS ?? 0) - (b.startS ?? 0));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].date > sorted[i].date && (sorted[j].startS ?? Infinity) - (sorted[i].startS ?? -Infinity) > 86_400) break;
      if (isSameSession(sorted[i], sorted[j])) parent.set(find(sorted[j].id), find(sorted[i].id));
    }
  }

  const groups = new Map<string, SourcedActivity[]>();
  for (const a of activities) {
    const root = find(a.id);
    groups.set(root, [...(groups.get(root) ?? []), a]);
  }

  const duplicates = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [keep, ...rest] = group.sort((a, b) => richness(b) - richness(a) || a.id.localeCompare(b.id));
    for (const other of rest) duplicates.set(other.id, keep.id);
  }
  return duplicates;
}

export type WellnessSample = Omit<WellnessDay, 'date'> & { source: string };

/** Les capteurs portés la nuit priment pour la physiologie ; le ressenti vient du questionnaire. */
const PHYSIOLOGY_RANK = ['oura', 'whoop', 'garmin', 'polar', 'intervals'];
const SUBJECTIVE_RANK = ['intervals', 'whoop', 'polar', 'garmin', 'oura'];

function pick<K extends keyof Omit<WellnessSample, 'source'>>(samples: WellnessSample[], key: K, rank: string[]): number | null {
  const order = (source: string) => (rank.indexOf(source) === -1 ? rank.length : rank.indexOf(source));
  const candidates = samples.filter((s) => s[key] !== null && s[key] !== undefined).sort((a, b) => order(a.source) - order(b.source) || a.source.localeCompare(b.source));
  return candidates[0]?.[key] ?? null;
}

/** Fusionne les mesures d'une journée, champ par champ, en retenant la source la plus fiable. */
export function mergeWellness(date: ISODate, samples: WellnessSample[]): WellnessDay {
  return {
    date,
    hrv: pick(samples, 'hrv', PHYSIOLOGY_RANK),
    restingHr: pick(samples, 'restingHr', PHYSIOLOGY_RANK),
    sleepH: pick(samples, 'sleepH', PHYSIOLOGY_RANK),
    fatigue: pick(samples, 'fatigue', SUBJECTIVE_RANK),
    soreness: pick(samples, 'soreness', SUBJECTIVE_RANK),
    mood: pick(samples, 'mood', SUBJECTIVE_RANK),
  };
}

/** Bornes hautes des zones de FC 1 à 4, en fraction de la FC au seuil. */
export const HR_ZONE_BOUNDS = [0.81, 0.9, 0.94, 1.0] as const;

export interface StreamPoint {
  /** Secondes depuis le début de l'enregistrement. */
  t: number;
  hr?: number | null;
  power?: number | null;
  /** Distance cumulée en mètres. */
  distance?: number | null;
  altitude?: number | null;
}

export interface StreamSummary {
  movingS: number;
  distanceM: number | null;
  avgHr: number | null;
  avgPowerW: number | null;
  normalizedPowerW: number | null;
  elevationM: number | null;
  zoneSeconds: number[] | null;
}

/**
 * Résume un enregistrement seconde par seconde : temps actif (pauses exclues),
 * puissance normalisée (moyenne glissante 30 s élevée à la puissance 4) et temps par zone de FC.
 */
export function summarizeStream(points: StreamPoint[], lthr: number | null): StreamSummary {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  let movingS = 0;
  let hrSum = 0;
  let hrTime = 0;
  let powerSum = 0;
  let powerTime = 0;
  let gain = 0;
  let lastAltitude: number | null = sorted[0]?.altitude ?? null;
  const zones = [0, 0, 0, 0, 0];
  const perSecondPower: number[] = [];

  // Une pause se reconnaît à un trou bien plus long que la cadence d'enregistrement habituelle.
  const gaps = sorted.slice(1).map((p, i) => p.t - sorted[i].t).filter((dt) => dt > 0).sort((x, y) => x - y);
  const pauseAfter = Math.max(15, 4 * (gaps[Math.floor(gaps.length / 2)] ?? 1));

  for (let i = 1; i < sorted.length; i++) {
    const dt = sorted[i].t - sorted[i - 1].t;
    if (dt <= 0 || dt > pauseAfter) continue;
    movingS += dt;
    const { hr, power, altitude } = sorted[i];
    if (hr) {
      hrSum += hr * dt;
      hrTime += dt;
      if (lthr) {
        const ratio = hr / lthr;
        const zone = HR_ZONE_BOUNDS.findIndex((bound) => ratio < bound);
        zones[zone === -1 ? 4 : zone] += dt;
      }
    }
    if (power !== null && power !== undefined) {
      powerSum += power * dt;
      powerTime += dt;
      for (let s = 0; s < Math.round(dt); s++) perSecondPower.push(power);
    }
    if (altitude !== null && altitude !== undefined) {
      // Seuil de 1 m pour ne pas additionner le bruit du baromètre.
      if (lastAltitude === null) lastAltitude = altitude;
      else if (altitude - lastAltitude >= 1) {
        gain += altitude - lastAltitude;
        lastAltitude = altitude;
      } else if (lastAltitude - altitude >= 1) lastAltitude = altitude;
    }
  }

  let normalized: number | null = null;
  if (perSecondPower.length >= 60) {
    let window = 0;
    let fourth = 0;
    let count = 0;
    for (let i = 0; i < perSecondPower.length; i++) {
      window += perSecondPower[i];
      if (i >= 30) window -= perSecondPower[i - 30];
      if (i >= 29) {
        fourth += (window / 30) ** 4;
        count++;
      }
    }
    normalized = Math.round((fourth / count) ** 0.25);
  }

  const distances = sorted.map((p) => p.distance).filter((d): d is number => d !== null && d !== undefined);
  return {
    movingS: Math.round(movingS),
    distanceM: distances.length >= 2 ? Math.round(distances[distances.length - 1] - distances[0]) : null,
    avgHr: hrTime > 0 ? Math.round(hrSum / hrTime) : null,
    avgPowerW: powerTime > 0 ? Math.round(powerSum / powerTime) : null,
    normalizedPowerW: normalized,
    elevationM: lastAltitude !== null ? Math.round(gain) : null,
    zoneSeconds: lthr && hrTime > 0 ? zones.map(Math.round) : null,
  };
}
