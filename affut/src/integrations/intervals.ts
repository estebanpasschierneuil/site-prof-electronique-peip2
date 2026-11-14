import type { Sport, WorkoutKind } from '@/core/types';
import { providerFetch, type Credentials, type ProviderActivity, type ProviderPlannedWorkout, type ProviderWellness, type TrainingDataProvider } from './provider';

/**
 * Connecteur intervals.icu (clé d'API personnelle de l'athlète).
 * Source la plus complète : activités avec temps par zone, récupération
 * (VFC, FC de repos, sommeil, ressenti) et séances planifiées.
 */
const API = 'https://intervals.icu/api/v1';

interface IcuActivity {
  id: string;
  name?: string;
  type?: string;
  start_date?: string;
  start_date_local: string;
  moving_time?: number;
  distance?: number;
  total_elevation_gain?: number;
  average_heartrate?: number;
  icu_average_watts?: number;
  icu_weighted_avg_watts?: number;
  icu_rpe?: number;
  icu_hr_zone_times?: number[];
  icu_zone_times?: { id: string; secs: number }[];
}

interface IcuWellness {
  id: string;
  hrv?: number;
  restingHR?: number;
  sleepSecs?: number;
  fatigue?: number;
  soreness?: number;
  mood?: number;
}

interface IcuEvent {
  id: number;
  category?: string;
  type?: string;
  name?: string;
  start_date_local: string;
  moving_time?: number;
  icu_training_load?: number;
}

const SPORTS: Record<string, Sport> = { Swim: 'swim', OpenWaterSwim: 'swim', Ride: 'bike', VirtualRide: 'bike', GravelRide: 'bike', MountainBikeRide: 'bike', Run: 'run', TrailRun: 'run', VirtualRun: 'run', WeightTraining: 'strength', Workout: 'strength' };

const headers = (credentials: Credentials) => ({ Authorization: `Basic ${Buffer.from(`API_KEY:${credentials.accessToken}`).toString('base64')}` });
const athletePath = (credentials: Credentials) => `${API}/athlete/${encodeURIComponent(credentials.externalAthleteId ?? '0')}`;

/** Ramène les temps par zone (5 à 7 zones selon le sport) à 5 zones. */
function fiveZones(times: number[] | undefined): number[] | null {
  if (!times || times.length < 5) return null;
  return [times[0], times[1], times[2], times[3], times.slice(4).reduce((a, b) => a + b, 0)];
}

/** intervals.icu note le ressenti de 1 (bon) à 4 (mauvais) : conversion vers l'échelle 1–5. */
const scale = (value: number | undefined) => (value ? Math.round(1 + ((value - 1) * 4) / 3) : null);

function guessKind(name: string): WorkoutKind {
  const n = name.toLowerCase();
  if (/vo2|vma|fractionn/.test(n)) return 'vo2';
  if (/seuil|threshold/.test(n)) return 'threshold';
  if (/tempo|sweet/.test(n)) return 'tempo';
  if (/long/.test(n)) return 'long';
  if (/r[ée]cup|recovery/.test(n)) return 'recovery';
  if (/techni|[ée]ducatif|drill/.test(n)) return 'technique';
  return 'endurance';
}

export const intervalsProvider: TrainingDataProvider = {
  id: 'intervals',
  label: 'intervals.icu',
  auth: 'api_key',
  capabilities: { activities: true, wellness: true, plannedWorkouts: true },
  isConfigured: () => true,

  async fetchActivities(credentials, since, until) {
    const rows = await providerFetch<IcuActivity[]>(`${athletePath(credentials)}/activities?oldest=${since}&newest=${until}`, { headers: headers(credentials) }, 'intervals.icu');
    return rows
      .filter((a) => a.moving_time)
      .map<ProviderActivity>((a) => ({
        externalId: String(a.id),
        startAt: new Date(a.start_date ?? a.start_date_local),
        date: a.start_date_local.slice(0, 10),
        sport: SPORTS[a.type ?? ''] ?? 'other',
        title: a.name ?? 'Séance',
        durationS: a.moving_time!,
        distanceM: a.distance ?? null,
        elevationM: a.total_elevation_gain ?? null,
        avgHr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
        avgPowerW: a.icu_average_watts ?? null,
        normalizedPowerW: a.icu_weighted_avg_watts ?? null,
        rpe: a.icu_rpe ?? null,
        zoneSeconds: fiveZones(a.icu_zone_times?.map((z) => z.secs)) ?? fiveZones(a.icu_hr_zone_times),
      }));
  },

  async fetchWellness(credentials, since, until) {
    const rows = await providerFetch<IcuWellness[]>(`${athletePath(credentials)}/wellness?oldest=${since}&newest=${until}`, { headers: headers(credentials) }, 'intervals.icu');
    return rows.map<ProviderWellness>((w) => ({
      date: w.id,
      hrv: w.hrv ?? null,
      restingHr: w.restingHR ?? null,
      sleepH: w.sleepSecs ? Math.round(w.sleepSecs / 360) / 10 : null,
      fatigue: scale(w.fatigue),
      soreness: scale(w.soreness),
      mood: w.mood ? 6 - scale(w.mood)! : null,
    }));
  },

  async fetchPlannedWorkouts(credentials, since, until) {
    const rows = await providerFetch<IcuEvent[]>(`${athletePath(credentials)}/events?oldest=${since}&newest=${until}&category=WORKOUT`, { headers: headers(credentials) }, 'intervals.icu');
    return rows
      .filter((e) => e.moving_time)
      .map<ProviderPlannedWorkout>((e) => ({
        externalId: String(e.id),
        date: e.start_date_local.slice(0, 10),
        sport: SPORTS[e.type ?? ''] ?? 'other',
        kind: guessKind(e.name ?? ''),
        title: e.name ?? 'Séance planifiée',
        durationS: e.moving_time!,
        load: e.icu_training_load ?? null,
      }));
  },
};
