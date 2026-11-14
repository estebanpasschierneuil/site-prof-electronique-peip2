import type { Sport } from '@/core/types';
import { env } from '@/server/env';
import { providerFetch, type Credentials, type ProviderActivity, type RefreshedTokens, type TrainingDataProvider } from './provider';

/**
 * Connecteur Strava (API v3, OAuth 2).
 * Portée demandée : `activity:read_all`. Strava ne fournit pas les données de récupération.
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

interface StravaToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number };
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

const toTokens = (t: StravaToken): RefreshedTokens => ({ accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(t.expires_at * 1000) });

export function stravaAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.STRAVA_CLIENT_ID ?? '',
    redirect_uri: `${env.APP_URL}/api/integrations/strava/callback`,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
    state,
  });
  return `https://www.strava.com/oauth/authorize?${params}`;
}

async function tokenRequest(body: Record<string, string>): Promise<StravaToken> {
  return providerFetch<StravaToken>(
    'https://www.strava.com/oauth/token',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, ...body }) },
    'Strava',
  );
}

export async function stravaExchangeCode(code: string): Promise<RefreshedTokens & { externalAthleteId: string | null }> {
  const token = await tokenRequest({ code, grant_type: 'authorization_code' });
  return { ...toTokens(token), externalAthleteId: token.athlete ? String(token.athlete.id) : null };
}

export const stravaProvider: TrainingDataProvider = {
  id: 'strava',
  label: 'Strava',
  auth: 'oauth',
  capabilities: { activities: true, wellness: false, plannedWorkouts: false },
  isConfigured: () => Boolean(env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET),

  async refresh(credentials: Credentials) {
    if (!credentials.refreshToken) return null;
    if (credentials.expiresAt && credentials.expiresAt.getTime() - Date.now() > 5 * 60_000) return null;
    return toTokens(await tokenRequest({ refresh_token: credentials.refreshToken, grant_type: 'refresh_token' }));
  },

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
