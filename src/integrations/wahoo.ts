import type { Sport } from '@/core/types';
import { clientCredentials } from './oauth';
import { providerFetch, type ProviderActivity, type TrainingDataProvider } from './provider';

/** Wahoo Cloud API : séances des compteurs ELEMNT, home trainers KICKR et montres RIVAL. */
const API = 'https://api.wahooligan.com/v1';

interface WahooWorkout {
  id: number;
  starts: string;
  minutes?: number;
  name?: string;
  workout_type_id?: number;
  workout_summary?: {
    duration_active_accum?: string;
    distance_accum?: string;
    heart_rate_avg?: string;
    power_avg?: string;
    power_bike_np_last?: string;
    ascent_accum?: string;
    time_zone?: string;
  } | null;
}

const BIKE = new Set([0, 11, 12, 13, 14, 15, 16, 49, 61, 64, 68, 70]);
const RUN = new Set([1, 3, 4, 5, 67, 71]);
const SWIM = new Set([25, 26]);
const STRENGTH = new Set([42, 43, 66]);

function sportOf(type: number | undefined): Sport {
  if (type === undefined) return 'other';
  return BIKE.has(type) ? 'bike' : RUN.has(type) ? 'run' : SWIM.has(type) ? 'swim' : STRENGTH.has(type) ? 'strength' : 'other';
}

const number = (value: string | undefined): number | null => (value !== undefined && value !== null && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null);

function localDate(instant: Date, timeZone: string | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

export const wahooProvider: TrainingDataProvider = {
  id: 'wahoo',
  label: 'Wahoo',
  auth: 'oauth',
  oauth: {
    authorizeUrl: 'https://api.wahooligan.com/oauth/authorize',
    tokenUrl: 'https://api.wahooligan.com/oauth/token',
    scopes: ['user_read', 'workouts_read', 'offline_data'],
    scopeSeparator: ' ',
    clientAuth: 'body',
  },
  capabilities: { activities: true, wellness: false, plannedWorkouts: false },
  isConfigured: () => clientCredentials('wahoo') !== null,

  async fetchActivities(credentials, since, until) {
    const out: ProviderActivity[] = [];
    // Les séances arrivent de la plus récente à la plus ancienne : on s'arrête en sortant de la fenêtre.
    for (let page = 1; page <= 30; page++) {
      const batch = await providerFetch<{ workouts: WahooWorkout[]; total: number }>(`${API}/workouts?page=${page}&per_page=50`, { headers: { Authorization: `Bearer ${credentials.accessToken}` } }, 'Wahoo');
      let reachedStart = false;
      for (const w of batch.workouts ?? []) {
        const startAt = new Date(w.starts);
        const summary = w.workout_summary;
        const date = localDate(startAt, summary?.time_zone);
        if (date < since) {
          reachedStart = true;
          continue;
        }
        const durationS = number(summary?.duration_active_accum) ?? (w.minutes ?? 0) * 60;
        if (date > until || durationS <= 0) continue;
        out.push({
          externalId: String(w.id),
          startAt,
          date,
          sport: sportOf(w.workout_type_id),
          title: w.name || 'Séance Wahoo',
          durationS: Math.round(durationS),
          distanceM: number(summary?.distance_accum),
          elevationM: number(summary?.ascent_accum),
          avgHr: number(summary?.heart_rate_avg) ? Math.round(number(summary?.heart_rate_avg)!) : null,
          avgPowerW: number(summary?.power_avg) ? Math.round(number(summary?.power_avg)!) : null,
          normalizedPowerW: number(summary?.power_bike_np_last) ? Math.round(number(summary?.power_bike_np_last)!) : null,
          rpe: null,
          zoneSeconds: null,
        });
      }
      if (reachedStart || (batch.workouts ?? []).length < 50) break;
    }
    return out;
  },
};
