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
  refreshToken: string | null;
  expiresAt: Date | null;
}

/** Paramètres OAuth 2 d'une plateforme ; le parcours lui-même est commun (voir `oauth.ts`). */
export interface OAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  scopeSeparator: ' ' | ',';
  /** Où la plateforme attend l'identifiant et le secret de l'application. */
  clientAuth: 'basic' | 'body';
  extraAuthorizeParams?: Record<string, string>;
  /** Identifiant de l'athlète côté plateforme, quand la réponse du jeton le contient. */
  externalAthleteId?: (tokenResponse: Record<string, unknown>) => string | null;
}

export interface TrainingDataProvider {
  id: string;
  label: string;
  /** Comment l'athlète autorise l'accès. */
  auth: 'oauth' | 'api_key';
  oauth?: OAuthConfig;
  capabilities: { activities: boolean; wellness: boolean; plannedWorkouts: boolean };
  /** Profondeur d'historique que la plateforme accepte de restituer, en jours. */
  historyDays?: number;
  /** Étape propre à la plateforme juste après l'autorisation (enregistrement de l'utilisateur…). */
  afterConnect?(credentials: Credentials, athleteId: string): Promise<void>;
  /** Les identifiants d'application nécessaires sont-ils configurés sur ce déploiement ? */
  isConfigured(): boolean;
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
  const response = await fetch(url, { ...init, headers: { 'User-Agent': 'Affut/1.0', Accept: 'application/json', ...init.headers }, signal: AbortSignal.timeout(20_000), cache: 'no-store' });
  // Certaines plateformes répondent « aucun contenu » quand il n'y a rien de nouveau.
  if (response.status === 204) return [] as T;
  if (!response.ok) {
    const hint = response.status === 401 ? 'autorisation expirée ou révoquée' : response.status === 429 ? 'quota de la plateforme atteint' : `erreur ${response.status}`;
    throw new ProviderError(`${label} : ${hint}.`, response.status);
  }
  return (await response.json()) as T;
}
