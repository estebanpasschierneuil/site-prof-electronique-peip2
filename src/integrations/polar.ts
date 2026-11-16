import type { Sport } from '@/core/types';
import { clientCredentials } from './oauth';
import { providerFetch, ProviderError, type ProviderActivity, type ProviderWellness, type TrainingDataProvider } from './provider';

/**
 * Polar AccessLink v3. Séances (avec temps par zone de FC), sommeil et Nightly Recharge (VFC).
 * La plateforme ne restitue que les 30 derniers jours de séances et 28 jours de récupération.
 */
const API = 'https://www.polaraccesslink.com/v3';

interface PolarExercise {
  id: string;
  start_time: string;
  start_time_utc_offset?: number;
  duration: string;
  distance?: number;
  heart_rate?: { average?: number };
  sport?: string;
  detailed_sport_info?: string;
  heart_rate_zones?: { index: number; 'in-zone': string }[];
}
interface PolarNight {
  date: string;
  light_sleep?: number;
  deep_sleep?: number;
  rem_sleep?: number;
}
interface PolarRecharge {
  date: string;
  heart_rate_avg?: number;
  heart_rate_variability_avg?: number;
}

/** Durée ISO 8601 (« PT2H44M12.5S ») en secondes. */
export function isoDurationSeconds(value: string | undefined): number {
  const match = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value ?? '');
  if (!match) return 0;
  return Math.round(Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0));
}

function sportOf(label: string): Sport {
  if (/SWIM|AQUATICS/.test(label)) return 'swim';
  if (/CYCLING|BIKING|SPINNING|GRAVEL|E_BIKE|LES_MILLS_RPM/.test(label)) return 'bike';
  if (/RUNNING|JOGGING/.test(label)) return 'run';
  if (/STRENGTH|CORE|CIRCUIT|FUNCTIONAL|MOBILITY|STRETCHING|PILATES|YOGA|HIIT|KETTLEBELL|CALISTHENICS/.test(label)) return 'strength';
  return 'other';
}

const TITLES: Record<Sport, string> = { swim: 'Natation', bike: 'Sortie vélo', run: 'Course à pied', strength: 'Renforcement', other: 'Séance' };
const auth = (token: string | null) => ({ Authorization: `Bearer ${token}` });

export const polarProvider: TrainingDataProvider = {
  id: 'polar',
  label: 'Polar Flow',
  auth: 'oauth',
  oauth: {
    authorizeUrl: 'https://flow.polar.com/oauth2/authorization',
    tokenUrl: 'https://polarremote.com/v2/oauth2/token',
    scopes: ['accesslink.read_all'],
    scopeSeparator: ' ',
    clientAuth: 'basic',
    externalAthleteId: (r) => (r.x_user_id !== undefined ? String(r.x_user_id) : null),
  },
  capabilities: { activities: true, wellness: true, plannedWorkouts: false },
  historyDays: 30,
  isConfigured: () => clientCredentials('polar') !== null,

  // AccessLink exige d'enregistrer l'utilisateur avant toute lecture ; 409 = déjà enregistré.
  async afterConnect(credentials, athleteId) {
    const response = await fetch(`${API}/users`, {
      method: 'POST',
      headers: { ...auth(credentials.accessToken), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ 'member-id': athleteId }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok && response.status !== 409) throw new ProviderError(`Polar Flow : enregistrement de l’utilisateur refusé (erreur ${response.status}).`, response.status);
  },

  async fetchActivities(credentials, since, until) {
    const rows = await providerFetch<PolarExercise[]>(`${API}/exercises?zones=true`, { headers: auth(credentials.accessToken) }, 'Polar Flow');
    return rows
      .map<ProviderActivity>((e) => {
        const sport = sportOf(`${e.detailed_sport_info ?? ''} ${e.sport ?? ''}`);
        // `start_time` est une heure locale sans fuseau ; le décalage est donné à part, en minutes.
        const startAt = new Date(Date.parse(`${e.start_time}Z`) - (e.start_time_utc_offset ?? 0) * 60_000);
        const zones = [1, 2, 3, 4, 5].map((index) => isoDurationSeconds(e.heart_rate_zones?.find((z) => z.index === index)?.['in-zone']));
        return {
          externalId: e.id,
          startAt,
          date: e.start_time.slice(0, 10),
          sport,
          title: TITLES[sport],
          durationS: isoDurationSeconds(e.duration),
          distanceM: e.distance ?? null,
          elevationM: null,
          avgHr: e.heart_rate?.average ?? null,
          avgPowerW: null,
          normalizedPowerW: null,
          rpe: null,
          zoneSeconds: zones.some((s) => s > 0) ? zones : null,
        };
      })
      .filter((a) => a.durationS > 0 && a.date >= since && a.date <= until);
  },

  async fetchWellness(credentials, since, until) {
    const headers = auth(credentials.accessToken);
    const [sleep, recharge] = await Promise.all([
      providerFetch<{ nights?: PolarNight[] }>(`${API}/users/sleep`, { headers }, 'Polar Flow'),
      providerFetch<{ recharges?: PolarRecharge[] }>(`${API}/users/nightly-recharge`, { headers }, 'Polar Flow'),
    ]);
    const days = new Map<string, ProviderWellness>();
    const day = (date: string) => days.get(date) ?? days.set(date, { date, hrv: null, restingHr: null, sleepH: null, fatigue: null, soreness: null, mood: null }).get(date)!;
    for (const n of sleep.nights ?? []) {
      const seconds = (n.light_sleep ?? 0) + (n.deep_sleep ?? 0) + (n.rem_sleep ?? 0);
      if (seconds > 0) day(n.date).sleepH = Math.round(seconds / 360) / 10;
    }
    for (const r of recharge.recharges ?? []) {
      day(r.date).hrv = r.heart_rate_variability_avg ?? null;
      // FC moyenne des premières heures de sommeil : le meilleur équivalent d'une FC de repos chez Polar.
      day(r.date).restingHr = r.heart_rate_avg ?? null;
    }
    return [...days.values()].filter((d) => d.date >= since && d.date <= until);
  },
};
