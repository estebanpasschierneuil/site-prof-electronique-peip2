import type { Sport } from '@/core/types';
import { clientCredentials } from './oauth';
import { providerFetch, type Credentials, type ProviderActivity, type ProviderWellness, type TrainingDataProvider } from './provider';

/** WHOOP (API v2). Récupération (VFC, FC de repos, sommeil) et séances avec temps par zone de FC. */
const API = 'https://api.prod.whoop.com/developer/v2';

interface WhoopRecovery {
  sleep_id?: string;
  score_state?: string;
  score?: { resting_heart_rate?: number; hrv_rmssd_milli?: number };
}
interface WhoopSleep {
  id: string;
  end: string;
  timezone_offset?: string;
  nap?: boolean;
  score?: { stage_summary?: { total_in_bed_time_milli?: number; total_awake_time_milli?: number } };
}
interface WhoopWorkout {
  id: string;
  start: string;
  end: string;
  timezone_offset?: string;
  sport_name?: string;
  score_state?: string;
  score?: {
    average_heart_rate?: number;
    distance_meter?: number;
    altitude_gain_meter?: number;
    zone_durations?: Partial<Record<'zone_zero_milli' | 'zone_one_milli' | 'zone_two_milli' | 'zone_three_milli' | 'zone_four_milli' | 'zone_five_milli', number>>;
  };
}

function sportOf(name: string | undefined): Sport {
  const n = (name ?? '').toLowerCase();
  if (/swim/.test(n)) return 'swim';
  if (/cycl|bik|spin/.test(n)) return 'bike';
  if (/run|track/.test(n)) return 'run';
  if (/weight|strength|functional|yoga|pilates|hiit/.test(n)) return 'strength';
  return 'other';
}

/** Jour local à partir d'un instant UTC et d'un décalage « +02:00 ». */
function localDate(iso: string, offset: string | undefined): string {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset ?? '');
  const minutes = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString().slice(0, 10);
}

async function collect<T>(path: string, credentials: Credentials, since: string, until: string): Promise<T[]> {
  const out: T[] = [];
  let nextToken: string | null = null;
  for (let page = 0; page < 40; page++) {
    const query = new URLSearchParams({ start: `${since}T00:00:00.000Z`, end: `${until}T23:59:59.999Z`, limit: '25', ...(nextToken ? { nextToken } : {}) });
    const body: { records?: T[]; next_token?: string | null } = await providerFetch(`${API}${path}?${query}`, { headers: { Authorization: `Bearer ${credentials.accessToken}` } }, 'WHOOP');
    out.push(...(body.records ?? []));
    nextToken = body.next_token ?? null;
    if (!nextToken) break;
  }
  return out;
}

export const whoopProvider: TrainingDataProvider = {
  id: 'whoop',
  label: 'WHOOP',
  auth: 'oauth',
  oauth: {
    authorizeUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    scopes: ['read:recovery', 'read:sleep', 'read:workout', 'offline'],
    scopeSeparator: ' ',
    clientAuth: 'body',
  },
  capabilities: { activities: true, wellness: true, plannedWorkouts: false },
  isConfigured: () => clientCredentials('whoop') !== null,

  async fetchActivities(credentials, since, until) {
    const workouts = await collect<WhoopWorkout>('/activity/workout', credentials, since, until);
    return workouts
      .filter((w) => w.score_state === 'SCORED')
      .map<ProviderActivity>((w) => {
        const z = w.score?.zone_durations;
        const zones = z ? [(z.zone_zero_milli ?? 0) + (z.zone_one_milli ?? 0), z.zone_two_milli ?? 0, z.zone_three_milli ?? 0, z.zone_four_milli ?? 0, z.zone_five_milli ?? 0].map((ms) => Math.round(ms / 1000)) : null;
        const sport = sportOf(w.sport_name);
        return {
          externalId: w.id,
          startAt: new Date(w.start),
          date: localDate(w.start, w.timezone_offset),
          sport,
          title: w.sport_name ? w.sport_name.charAt(0).toUpperCase() + w.sport_name.slice(1) : 'Séance WHOOP',
          durationS: Math.round((Date.parse(w.end) - Date.parse(w.start)) / 1000),
          distanceM: w.score?.distance_meter ? Math.round(w.score.distance_meter) : null,
          elevationM: w.score?.altitude_gain_meter ? Math.round(w.score.altitude_gain_meter) : null,
          avgHr: w.score?.average_heart_rate ?? null,
          avgPowerW: null,
          normalizedPowerW: null,
          rpe: null,
          zoneSeconds: zones && zones.some((s) => s > 0) ? zones : null,
        };
      })
      .filter((a) => a.durationS > 0);
  },

  async fetchWellness(credentials, since, until) {
    const [sleeps, recoveries] = await Promise.all([collect<WhoopSleep>('/activity/sleep', credentials, since, until), collect<WhoopRecovery>('/recovery', credentials, since, until)]);
    const recoveryBySleep = new Map(recoveries.filter((r) => r.sleep_id && r.score_state === 'SCORED').map((r) => [r.sleep_id!, r]));
    const days = new Map<string, ProviderWellness>();
    for (const sleep of sleeps) {
      if (sleep.nap) continue;
      // La nuit est rattachée au jour du réveil, comme la récupération qui en découle.
      const date = localDate(sleep.end, sleep.timezone_offset);
      const stages = sleep.score?.stage_summary;
      const asleepMs = stages ? (stages.total_in_bed_time_milli ?? 0) - (stages.total_awake_time_milli ?? 0) : 0;
      const recovery = recoveryBySleep.get(sleep.id);
      days.set(date, {
        date,
        hrv: recovery?.score?.hrv_rmssd_milli ? Math.round(recovery.score.hrv_rmssd_milli * 10) / 10 : null,
        restingHr: recovery?.score?.resting_heart_rate ?? null,
        sleepH: asleepMs > 0 ? Math.round(asleepMs / 360_000) / 10 : null,
        fatigue: null,
        soreness: null,
        mood: null,
      });
    }
    return [...days.values()].filter((d) => d.date >= since && d.date <= until);
  },
};
