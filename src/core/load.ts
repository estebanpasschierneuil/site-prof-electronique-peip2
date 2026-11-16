import type { AthleteProfile, LoadMethod, Sport } from './types';

export interface LoadInput {
  sport: Sport;
  durationS: number;
  distanceM?: number | null;
  normalizedPowerW?: number | null;
  avgPowerW?: number | null;
  avgHr?: number | null;
  rpe?: number | null;
}

export interface LoadResult {
  load: number;
  intensityFactor: number | null;
  method: LoadMethod;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Charge d'une séance, exprimée sur une échelle commune aux trois sports
 * (100 points = une heure au seuil). La méthode la plus fiable disponible est
 * retenue, dans l'ordre : puissance, allure, fréquence cardiaque, ressenti, durée.
 */
export function computeLoad(input: LoadInput, profile: Pick<AthleteProfile, 'ftpW' | 'runThresholdPaceS' | 'swimCssS' | 'lthr' | 'restHr'>): LoadResult {
  const hours = input.durationS / 3600;
  if (hours <= 0) return { load: 0, intensityFactor: null, method: 'duration' };

  const power = input.normalizedPowerW ?? input.avgPowerW ?? null;
  if (input.sport === 'bike' && power && profile.ftpW) {
    const intensity = clamp(power / profile.ftpW, 0.3, 1.5);
    return { load: round(hours * intensity ** 2 * 100), intensityFactor: round2(intensity), method: 'power' };
  }

  if (input.sport === 'run' && input.distanceM && profile.runThresholdPaceS) {
    const speed = input.distanceM / input.durationS;
    const thresholdSpeed = 1000 / profile.runThresholdPaceS;
    const intensity = clamp(speed / thresholdSpeed, 0.3, 1.4);
    return { load: round(hours * intensity ** 2 * 100), intensityFactor: round2(intensity), method: 'pace' };
  }

  if (input.sport === 'swim' && input.distanceM && profile.swimCssS) {
    const speed = input.distanceM / input.durationS;
    const cssSpeed = 100 / profile.swimCssS;
    const intensity = clamp(speed / cssSpeed, 0.3, 1.3);
    // En natation la résistance croît plus vite que la vitesse : exposant 3.
    return { load: round(hours * intensity ** 3 * 100), intensityFactor: round2(intensity), method: 'pace' };
  }

  if (input.avgHr && profile.lthr) {
    const rest = profile.restHr ?? 50;
    const intensity = clamp((input.avgHr - rest) / (profile.lthr - rest), 0.3, 1.2);
    return { load: round(hours * intensity ** 2 * 100), intensityFactor: round2(intensity), method: 'hr' };
  }

  if (input.rpe) {
    const intensity = clamp(0.5 + 0.05 * input.rpe, 0.5, 1.05);
    return { load: round(hours * intensity ** 2 * 100), intensityFactor: round2(intensity), method: 'rpe' };
  }

  const defaultIntensity = input.sport === 'strength' ? 0.55 : 0.65;
  return { load: round(hours * defaultIntensity ** 2 * 100), intensityFactor: null, method: 'duration' };
}

function round(v: number) {
  return Math.round(v);
}
function round2(v: number) {
  return Math.round(v * 100) / 100;
}
