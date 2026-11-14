import type { ISODate } from '@/core/dates';
import type { Sport, WorkoutKind } from '@/core/types';

/**
 * Contrat commun à toutes les sources de données d'entraînement.
 * Un connecteur ne fait que traduire le format de la plateforme : le calcul
 * de charge et l'analyse restent dans `src/core`, identiques pour toutes les sources.
 */
export interface ProviderActivity {
  externalId: string;
  startAt: Date;
  /** Jour local de l'athlète. */
  date: ISODate;
  sport: Sport;
  title: string;
  durationS: number;
  distanceM: number | null;
  elevationM: number | null;
  avgHr: number | null;
  avgPowerW: number | null;
  normalizedPowerW: number | null;
  rpe: number | null;
  zoneSeconds: number[] | null;
}

export interface ProviderWellness {
  date: ISODate;
  hrv: number | null;
  restingHr: number | null;
  sleepH: number | null;
  fatigue: number | null;
  soreness: number | null;
  mood: number | null;
}

export interface ProviderPlannedWorkout {
  externalId: string;
  date: ISODate;
  sport: Sport;
  kind: WorkoutKind;
  title: string;
  durationS: number;
  load: number | null;
}

export interface Credentials {
  externalAthleteId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
}

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface TrainingDataProvider {
  id: string;
  label: string;
  /** Comment l'athlète autorise l'accès. */
  auth: 'oauth' | 'api_key';
  capabilities: { activities: boolean; wellness: boolean; plannedWorkouts: boolean };
  /** Les identifiants d'application nécessaires sont-ils configurés sur ce déploiement ? */
  isConfigured(): boolean;
  /** Renouvelle le jeton d'accès s'il arrive à expiration. */
  refresh?(credentials: Credentials): Promise<RefreshedTokens | null>;
  fetchActivities(credentials: Credentials, since: ISODate, until: ISODate): Promise<ProviderActivity[]>;
  fetchWellness?(credentials: Credentials, since: ISODate, until: ISODate): Promise<ProviderWellness[]>;
  fetchPlannedWorkouts?(credentials: Credentials, since: ISODate, until: ISODate): Promise<ProviderPlannedWorkout[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export async function providerFetch<T>(url: string, init: RequestInit, label: string): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000), cache: 'no-store' });
  if (!response.ok) {
    const hint = response.status === 401 ? 'autorisation expirée ou révoquée' : response.status === 429 ? 'quota de la plateforme atteint' : `erreur ${response.status}`;
    throw new ProviderError(`${label} : ${hint}.`, response.status);
  }
  return (await response.json()) as T;
}
