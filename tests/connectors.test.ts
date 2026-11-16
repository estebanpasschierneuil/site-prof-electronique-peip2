import { afterEach, describe, expect, it, vi } from 'vitest';
import { ouraProvider } from '@/integrations/oura';
import { isoDurationSeconds, polarProvider } from '@/integrations/polar';
import { wahooProvider } from '@/integrations/wahoo';
import { whoopProvider } from '@/integrations/whoop';

/**
 * Les connecteurs sont vérifiés contre les exemples de réponse publiés dans la
 * documentation de chaque plateforme (ils n'ont pas été éprouvés sur des comptes réels).
 */
const credentials = { externalAthleteId: '1', accessToken: 'jeton', refreshToken: null, expiresAt: null };

function stubFetch(routes: Record<string, unknown>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    calls.push(String(url));
    const key = Object.keys(routes).find((fragment) => String(url).includes(fragment));
    return new Response(JSON.stringify(key ? routes[key] : {}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('Polar Flow', () => {
  it('convertit les durées ISO 8601', () => {
    expect(isoDurationSeconds('PT2H44M')).toBe(9840);
    expect(isoDurationSeconds('PT45M30.5S')).toBe(2731);
    expect(isoDurationSeconds('PT4S')).toBe(4);
    expect(isoDurationSeconds(undefined)).toBe(0);
  });
  it('lit une séance, son heure locale et ses zones', async () => {
    stubFetch({
      '/exercises': [{ id: '2AC312F', start_time: '2026-11-03T18:40:02', start_time_utc_offset: 60, duration: 'PT1H10M', distance: 14200, heart_rate: { average: 151, maximum: 172 }, sport: 'RUNNING', detailed_sport_info: 'ROAD_RUNNING', heart_rate_zones: [{ index: 2, 'in-zone': 'PT50M' }, { index: 4, 'in-zone': 'PT20M' }] }],
    });
    const [run] = await polarProvider.fetchActivities(credentials, '2026-11-01', '2026-11-08');
    expect(run).toMatchObject({ externalId: '2AC312F', sport: 'run', date: '2026-11-03', durationS: 4200, distanceM: 14200, avgHr: 151, zoneSeconds: [0, 3000, 0, 1200, 0] });
    expect(run.startAt.toISOString()).toBe('2026-11-03T17:40:02.000Z');
  });
  it('réunit sommeil et Nightly Recharge par jour', async () => {
    stubFetch({
      '/users/sleep': { nights: [{ date: '2026-11-03', light_sleep: 14400, deep_sleep: 5400, rem_sleep: 6300 }] },
      '/users/nightly-recharge': { recharges: [{ date: '2026-11-03', heart_rate_avg: 52, heart_rate_variability_avg: 61 }] },
    });
    expect(await polarProvider.fetchWellness!(credentials, '2026-11-01', '2026-11-08')).toEqual([{ date: '2026-11-03', hrv: 61, restingHr: 52, sleepH: 7.3, fatigue: null, soreness: null, mood: null }]);
  });
});

describe('Wahoo', () => {
  it('lit le résumé d’une sortie et s’arrête hors de la fenêtre demandée', async () => {
    const calls = stubFetch({
      '/workouts': {
        total: 2,
        workouts: [
          { id: 56519, starts: '2026-11-04T17:30:00.000Z', minutes: 62, name: 'KICKR tempo', workout_type_id: 61, workout_summary: { duration_active_accum: '3600.00', distance_accum: '32909.71', heart_rate_avg: '148.00', power_avg: '214.59', power_bike_np_last: '226.00', ascent_accum: '0.00', time_zone: 'Europe/Paris' } },
          { id: 1, starts: '2026-09-01T09:00:00.000Z', minutes: 30, workout_type_id: 1, workout_summary: null },
        ],
      },
    });
    const rides = await wahooProvider.fetchActivities(credentials, '2026-11-01', '2026-11-08');
    expect(rides).toHaveLength(1);
    expect(rides[0]).toMatchObject({ externalId: '56519', sport: 'bike', date: '2026-11-04', durationS: 3600, distanceM: 32909.71, avgHr: 148, avgPowerW: 215, normalizedPowerW: 226, elevationM: null });
    expect(calls).toHaveLength(1);
  });
});

describe('Oura', () => {
  it('ne retient que la nuit principale de chaque jour', async () => {
    stubFetch({
      '/sleep': {
        data: [
          { id: 'a', day: '2026-11-03', type: 'long_sleep', total_sleep_duration: 27360, average_hrv: 72, lowest_heart_rate: 44 },
          { id: 'b', day: '2026-11-03', type: 'late_nap', total_sleep_duration: 1500, average_hrv: 40, lowest_heart_rate: 58 },
        ],
        next_token: null,
      },
    });
    expect(await ouraProvider.fetchWellness!(credentials, '2026-11-01', '2026-11-08')).toEqual([{ date: '2026-11-03', hrv: 72, restingHr: 44, sleepH: 7.6, fatigue: null, soreness: null, mood: null }]);
    expect(await ouraProvider.fetchActivities(credentials, '2026-11-01', '2026-11-08')).toEqual([]);
  });
});

describe('WHOOP', () => {
  it('rattache la récupération à la nuit et au jour du réveil', async () => {
    stubFetch({
      '/activity/sleep': { records: [{ id: 'nuit-1', start: '2026-11-02T21:25:44.774Z', end: '2026-11-03T05:25:44.774Z', timezone_offset: '+01:00', nap: false, score: { stage_summary: { total_in_bed_time_milli: 30272735, total_awake_time_milli: 1403507 } } }] },
      '/recovery': { records: [{ cycle_id: 93845, sleep_id: 'nuit-1', score_state: 'SCORED', score: { recovery_score: 44, resting_heart_rate: 64, hrv_rmssd_milli: 31.813562 } }] },
    });
    expect(await whoopProvider.fetchWellness!(credentials, '2026-11-01', '2026-11-08')).toEqual([{ date: '2026-11-03', hrv: 31.8, restingHr: 64, sleepH: 8, fatigue: null, soreness: null, mood: null }]);
  });
  it('ramène les six zones WHOOP à cinq', async () => {
    stubFetch({
      '/activity/workout': { records: [{ id: 'w1', start: '2026-11-04T17:00:00.000Z', end: '2026-11-04T18:00:00.000Z', timezone_offset: '+01:00', sport_name: 'running', score_state: 'SCORED', score: { average_heart_rate: 152, distance_meter: 12100.4, altitude_gain_meter: 46.6, zone_durations: { zone_zero_milli: 60000, zone_one_milli: 240000, zone_two_milli: 1800000, zone_three_milli: 900000, zone_four_milli: 480000, zone_five_milli: 120000 } } }] },
    });
    const [run] = await whoopProvider.fetchActivities(credentials, '2026-11-01', '2026-11-08');
    expect(run).toMatchObject({ sport: 'run', date: '2026-11-04', durationS: 3600, distanceM: 12100, elevationM: 47, avgHr: 152, zoneSeconds: [300, 1800, 900, 480, 120] });
  });
});
