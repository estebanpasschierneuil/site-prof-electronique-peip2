import { addDays } from '@/core/dates';
import { clientCredentials } from './oauth';
import { providerFetch, type ProviderWellness, type TrainingDataProvider } from './provider';

/**
 * Oura (API v2). Récupération uniquement : la bague mesure la nuit, pas l'entraînement.
 * Elle complète idéalement une source de séances (montre, Strava) qui n'a pas de VFC nocturne.
 */
const API = 'https://api.ouraring.com/v2/usercollection';

interface OuraSleep {
  day: string;
  type?: string;
  total_sleep_duration?: number;
  average_hrv?: number | null;
  lowest_heart_rate?: number | null;
}

export const ouraProvider: TrainingDataProvider = {
  id: 'oura',
  label: 'Oura',
  auth: 'oauth',
  oauth: {
    authorizeUrl: 'https://cloud.ouraring.com/oauth/authorize',
    tokenUrl: 'https://api.ouraring.com/oauth/token',
    scopes: ['daily', 'heartrate'],
    scopeSeparator: ' ',
    clientAuth: 'body',
  },
  capabilities: { activities: false, wellness: true, plannedWorkouts: false },
  isConfigured: () => clientCredentials('oura') !== null,

  async fetchActivities() {
    return [];
  },

  async fetchWellness(credentials, since, until) {
    const nights = new Map<string, OuraSleep>();
    let nextToken: string | null = null;
    for (let page = 0; page < 20; page++) {
      // `end_date` est exclusif côté Oura pour la nuit en cours : on demande un jour de plus.
      const query = new URLSearchParams({ start_date: since, end_date: addDays(until, 1), ...(nextToken ? { next_token: nextToken } : {}) });
      const body: { data?: OuraSleep[]; next_token?: string | null } = await providerFetch(`${API}/sleep?${query}`, { headers: { Authorization: `Bearer ${credentials.accessToken}` } }, 'Oura');
      for (const sleep of body.data ?? []) {
        // Une journée peut contenir des siestes : seule la nuit principale, la plus longue, compte.
        if (sleep.type !== 'long_sleep') continue;
        const current = nights.get(sleep.day);
        if (!current || (sleep.total_sleep_duration ?? 0) > (current.total_sleep_duration ?? 0)) nights.set(sleep.day, sleep);
      }
      nextToken = body.next_token ?? null;
      if (!nextToken) break;
    }
    return [...nights.values()]
      .filter((n) => n.day >= since && n.day <= until)
      .map<ProviderWellness>((n) => ({
        date: n.day,
        hrv: n.average_hrv ?? null,
        restingHr: n.lowest_heart_rate ?? null,
        sleepH: n.total_sleep_duration ? Math.round(n.total_sleep_duration / 360) / 10 : null,
        fatigue: null,
        soreness: null,
        mood: null,
      }));
  },
};
