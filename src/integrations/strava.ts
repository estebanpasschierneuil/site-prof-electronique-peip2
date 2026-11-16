import type { Sport } from '@/core/types';
import { clientCredentials } from './oauth';
import { providerFetch, type ProviderActivity, type TrainingDataProvider } from './provider';

/**
 * Strava (API v3). Séances uniquement : pas de données de récupération.
 * La plupart des montres et applications y recopient leurs séances automatiquement.
 */
const API = 'https://www.strava.com/api/v3';

interface StravaActivity {
  id: number;
  name: string;
  sport_type?: string;
  type?: string;
  start_date: string;
  start_date_local: string;
  moving_time: number;
  distance?: number;
  total_elevation_gain?: number;
  average_heartrate?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  device_watts?: boolean;
  perceived_exertion?: number;
}

const SPORTS: Record<string, Sport> = {
  Swim: 'swim',
  Ride: 'bike',
  VirtualRide: 'bike',
  GravelRide: 'bike',
  MountainBikeRide: 'bike',
  EBikeRide: 'bike',
  Run: 'run',
  TrailRun: 'run',
  VirtualRun: 'run',
  WeightTraining: 'strength',
  Workout: 'strength',
  Crossfit: 'strength',
};

export const stravaProvider: TrainingDataProvider = {
  id: 'strava',
  label: 'Strava',
  auth: 'oauth',
  oauth: {
    authorizeUrl: 'https://www.strava.com/oauth/authorize',
    tokenUrl: 'https://www.strava.com/oauth/token',
    scopes: ['read', 'activity:read_all'],
    scopeSeparator: ',',
    clientAuth: 'body',
    extraAuthorizeParams: { approval_prompt: 'auto' },
    externalAthleteId: (r) => (r.athlete && typeof r.athlete === 'object' && 'id' in r.athlete ? String((r.athlete as { id: unknown }).id) : null),
  },
  capabilities: { activities: true, wellness: false, plannedWorkouts: false },
  isConfigured: () => clientCredentials('strava') !== null,

  async fetchActivities(credentials, since, until) {
    const after = Math.floor(Date.parse(`${since}T00:00:00Z`) / 1000) - 86_400;
    const before = Math.floor(Date.parse(`${until}T00:00:00Z`) / 1000) + 2 * 86_400;
    const out: ProviderActivity[] = [];
    for (let page = 1; page <= 20; page++) {
      const batch = await providerFetch<StravaActivity[]>(`${API}/athlete/activities?after=${after}&before=${before}&per_page=200&page=${page}`, { headers: { Authorization: `Bearer ${credentials.accessToken}` } }, 'Strava');
      for (const a of batch) {
        const power = a.device_watts ? a : null;
        out.push({
          externalId: String(a.id),
          startAt: new Date(a.start_date),
          date: a.start_date_local.slice(0, 10),
          sport: SPORTS[a.sport_type ?? a.type ?? ''] ?? 'other',
          title: a.name,
          durationS: a.moving_time,
          distanceM: a.distance ?? null,
          elevationM: a.total_elevation_gain ?? null,
          avgHr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
          avgPowerW: power?.average_watts ? Math.round(power.average_watts) : null,
          normalizedPowerW: power?.weighted_average_watts ?? null,
          rpe: a.perceived_exertion ? Math.round(a.perceived_exertion) : null,
          zoneSeconds: null,
        });
      }
      if (batch.length < 200) break;
    }
    return out.filter((a) => a.date >= since && a.date <= until);
  },
};
