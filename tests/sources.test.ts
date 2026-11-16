import { describe, expect, it } from 'vitest';
import { Encoder, Profile } from '@garmin/fitsdk';
import { findDuplicates, isSameSession, mergeWellness, summarizeStream, type SourcedActivity, type StreamPoint } from '@/core/sources';
import { FileFormatError, parseActivityFile } from '@/integrations/files/parse';

const start = Date.UTC(2026, 10, 3, 6, 30) / 1000;
const session = (id: string, source: string, extra: Partial<SourcedActivity> = {}): SourcedActivity => ({
  id, source, sport: 'bike', date: '2026-11-03', startS: start, durationS: 5400, distanceM: 45_000, hasPower: false, hasHr: true, hasZones: false, ...extra,
});

describe('dédoublonnage entre sources', () => {
  it('reconnaît la même sortie reçue par la montre et par Strava, malgré des durées différentes', () => {
    const device = session('a', 'intervals', { hasPower: true, hasZones: true });
    const strava = session('b', 'strava', { startS: start + 20, durationS: 5100 });
    expect(isSameSession(device, strava)).toBe(true);
    expect(findDuplicates([strava, device])).toEqual(new Map([['b', 'a']]));
  });
  it('garde la version la plus riche, quelle que soit l’ordre d’arrivée', () => {
    const duplicates = findDuplicates([session('z', 'strava'), session('m', 'whoop', { distanceM: null }), session('a', 'file', { hasPower: true })]);
    expect(duplicates.get('z')).toBe('a');
    expect(duplicates.get('m')).toBe('a');
    expect(duplicates.has('a')).toBe(false);
  });
  it('ne confond pas deux séances distinctes du même jour', () => {
    const morning = session('a', 'strava', { sport: 'run', durationS: 3000 });
    const evening = session('b', 'polar', { sport: 'run', durationS: 3000, startS: start + 10 * 3600 });
    const brick = session('c', 'polar', { sport: 'run', startS: start + 5400, durationS: 1200 });
    expect(findDuplicates([morning, evening])).toEqual(new Map());
    expect(isSameSession(session('bike', 'strava'), brick)).toBe(false);
  });
  it('ne fusionne jamais deux séances d’une même source', () => {
    expect(findDuplicates([session('a', 'strava'), session('b', 'strava')])).toEqual(new Map());
  });
  it('se rabat sur jour, durée et distance quand l’heure de départ manque', () => {
    const a = session('a', 'file', { startS: null });
    expect(isSameSession(a, session('b', 'strava', { durationS: 5450, distanceM: 45_300 }))).toBe(true);
    expect(isSameSession(a, session('c', 'strava', { durationS: 3600 }))).toBe(false);
  });
});

describe('fusion des mesures de récupération', () => {
  const empty = { hrv: null, restingHr: null, sleepH: null, fatigue: null, soreness: null, mood: null };
  it('retient la bague pour la nuit et le questionnaire pour le ressenti', () => {
    const merged = mergeWellness('2026-11-03', [
      { ...empty, source: 'intervals', hrv: 61, sleepH: 7.1, fatigue: 3, mood: 4 },
      { ...empty, source: 'oura', hrv: 68, restingHr: 47, sleepH: 7.6 },
    ]);
    expect(merged).toEqual({ date: '2026-11-03', hrv: 68, restingHr: 47, sleepH: 7.6, fatigue: 3, soreness: null, mood: 4 });
  });
  it('complète un champ absent de la meilleure source par une autre', () => {
    const merged = mergeWellness('2026-11-03', [{ ...empty, source: 'oura', sleepH: 7.6 }, { ...empty, source: 'polar', hrv: 55 }]);
    expect(merged.hrv).toBe(55);
    expect(merged.sleepH).toBe(7.6);
  });
});

describe('résumé d’un enregistrement', () => {
  const steady = (seconds: number, power: number, hr: number, from = 0): StreamPoint[] => Array.from({ length: seconds }, (_, i) => ({ t: from + i, power, hr, distance: (from + i) * 8, altitude: 100 }));
  it('exclut les pauses du temps actif', () => {
    const points = [...steady(600, 200, 140), ...steady(600, 200, 140, 1500)];
    expect(summarizeStream(points, 170).movingS).toBe(1198);
  });
  it('calcule une puissance normalisée supérieure à la moyenne quand l’effort varie', () => {
    const intervals = [0, 1, 2, 3].flatMap((i) => [...steady(300, 320, 165, i * 600), ...steady(300, 120, 130, i * 600 + 300)]);
    const summary = summarizeStream(intervals, 170);
    expect(summary.avgPowerW).toBe(220);
    expect(summary.normalizedPowerW!).toBeGreaterThan(245);
    expect(summarizeStream(steady(1200, 200, 140), 170).normalizedPowerW).toBe(200);
  });
  it('répartit le temps dans les zones de fréquence cardiaque', () => {
    const zones = summarizeStream([...steady(600, 150, 130), ...steady(600, 250, 172, 600)], 170).zoneSeconds!;
    expect(zones[0]).toBeGreaterThan(590);
    expect(zones[4]).toBeGreaterThan(590);
    expect(zones[1] + zones[2] + zones[3]).toBe(0);
  });
});

function buildFit(): Uint8Array {
  const encoder = new Encoder();
  const write = (mesgNum: number, mesg: Record<string, unknown>) => encoder.onMesg(mesgNum, mesg as never);
  const begin = new Date(Date.UTC(2026, 10, 3, 6, 30));
  write(Profile.MesgNum.FILE_ID, { manufacturer: 'development', product: 1, timeCreated: begin, type: 'activity' });
  for (let i = 0; i <= 3600; i += 5) {
    write(Profile.MesgNum.RECORD, { timestamp: new Date(begin.getTime() + i * 1000), heartRate: 150, power: 210, distance: i * 9, enhancedAltitude: 120 + i / 60 });
  }
  write(Profile.MesgNum.SESSION, { timestamp: new Date(begin.getTime() + 3_600_000), startTime: begin, sport: 'cycling', subSport: 'road', totalElapsedTime: 3600, totalTimerTime: 3600, totalDistance: 32_400, avgHeartRate: 150, avgPower: 210, totalAscent: 60 });
  write(Profile.MesgNum.ACTIVITY, { timestamp: new Date(begin.getTime() + 3_600_000), numSessions: 1, localTimestamp: (begin.getTime() + 3_600_000) / 1000 - 631_065_600 + 3600 });
  return encoder.close();
}

describe('import de fichiers', () => {
  const ctx = { lthr: 170, timeZone: 'Europe/Paris' };

  it('lit un fichier FIT : sport, durée, distance, puissance et zones', () => {
    const [activity] = parseActivityFile('sortie.fit', buildFit(), ctx);
    expect(activity).toMatchObject({ sport: 'bike', date: '2026-11-03', durationS: 3600, distanceM: 32_400, avgHr: 150, avgPowerW: 210, normalizedPowerW: 210, elevationM: 60 });
    expect(activity.zoneSeconds!.reduce((a, b) => a + b, 0)).toBe(3600);
    expect(activity.zoneSeconds![1]).toBe(3600);
  });
  it('donne le même identifiant à un fichier réimporté', () => {
    const bytes = buildFit();
    expect(parseActivityFile('a.fit', bytes, ctx)[0].externalId).toBe(parseActivityFile('copie.FIT', bytes, ctx)[0].externalId);
  });
  it('lit un fichier TCX avec fréquence cardiaque et puissance', () => {
    const points = Array.from({ length: 121 }, (_, i) => `<Trackpoint><Time>${new Date(Date.UTC(2026, 10, 4, 17, 0, i * 10)).toISOString()}</Time><DistanceMeters>${i * 35}</DistanceMeters><AltitudeMeters>50</AltitudeMeters><HeartRateBpm><Value>158</Value></HeartRateBpm><Extensions><ns3:TPX><ns3:Watts>250</ns3:Watts></ns3:TPX></Extensions></Trackpoint>`).join('');
    const tcx = `<?xml version="1.0"?><TrainingCenterDatabase><Activities><Activity Sport="Running"><Id>2026-11-04T17:00:00Z</Id><Lap><Track>${points}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
    const [activity] = parseActivityFile('footing.tcx', new TextEncoder().encode(tcx), ctx);
    expect(activity).toMatchObject({ sport: 'run', date: '2026-11-04', durationS: 1200, distanceM: 4200, avgHr: 158, avgPowerW: 250 });
  });
  it('lit une trace GPX horodatée et reconstitue la distance', () => {
    const points = Array.from({ length: 61 }, (_, i) => `<trkpt lat="${(48.85 + i * 0.0009).toFixed(5)}" lon="2.35000"><ele>${35 + i}</ele><time>${new Date(Date.UTC(2026, 10, 5, 22, 30, i * 30)).toISOString()}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>141</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`).join('');
    const gpx = `<?xml version="1.0"?><gpx><trk><name>Sortie vélo du soir</name><type>cycling</type><trkseg>${points}</trkseg></trk></gpx>`;
    const [activity] = parseActivityFile('trace.gpx', new TextEncoder().encode(gpx), ctx);
    expect(activity).toMatchObject({ sport: 'bike', title: 'Sortie vélo du soir', date: '2026-11-05', durationS: 1800, avgHr: 141, elevationM: 60 });
    expect(activity.distanceM!).toBeGreaterThan(5900);
    expect(activity.distanceM!).toBeLessThan(6100);
  });
  it('explique pourquoi un fichier est refusé', () => {
    expect(() => parseActivityFile('notes.pdf', new Uint8Array(10), ctx)).toThrow(FileFormatError);
    expect(() => parseActivityFile('faux.fit', new TextEncoder().encode('pas un fit'), ctx)).toThrow(/FIT valide/);
    expect(() => parseActivityFile('parcours.gpx', new TextEncoder().encode('<gpx><rte><rtept lat="1" lon="1"/></rte></gpx>'), ctx)).toThrow(/aucune trace/);
  });
});
