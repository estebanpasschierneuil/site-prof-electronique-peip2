import { createHash } from 'node:crypto';
import { Decoder, Stream } from '@garmin/fitsdk';
import { XMLParser } from 'fast-xml-parser';
import { summarizeStream, type StreamPoint } from '@/core/sources';
import type { Sport } from '@/core/types';
import type { ProviderActivity } from '../provider';

/**
 * Import universel : tout appareil ou application sait exporter au moins l'un de ces
 * formats (FIT pour Garmin, COROS, Wahoo, Suunto, Zwift ; TCX et GPX pour le reste).
 * Le fichier est résumé avec les mêmes calculs que les connecteurs.
 */

export interface ParseContext {
  /** FC au seuil de l'athlète, pour calculer le temps par zone. */
  lthr: number | null;
  /** Fuseau utilisé quand le fichier ne donne pas l'heure locale. */
  timeZone: string;
}

export class FileFormatError extends Error {}

const SPORT_WORDS: [RegExp, Sport][] = [
  [/swim|natation|nage/i, 'swim'],
  [/cycl|bik|ride|v[ée]lo|spinning/i, 'bike'],
  [/run|jog|course|trail|treadmill/i, 'run'],
  [/strength|training|fitness|muscu|renfo|gym|yoga|hiit/i, 'strength'],
];

function guessSport(...labels: (string | undefined | null)[]): Sport {
  const text = labels.filter(Boolean).join(' ');
  return SPORT_WORDS.find(([pattern]) => pattern.test(text))?.[1] ?? 'other';
}

function localDate(instant: Date, timeZone: string, offsetS?: number | null): string {
  if (offsetS !== null && offsetS !== undefined) return new Date(instant.getTime() + offsetS * 1000).toISOString().slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

const SPORT_TITLES: Record<Sport, string> = { swim: 'Natation', bike: 'Sortie vélo', run: 'Course à pied', strength: 'Renforcement', other: 'Séance' };
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

// ——— FIT ———
type FitMessage = Record<string, unknown>;

function parseFit(bytes: Uint8Array, id: string, ctx: ParseContext): ProviderActivity[] {
  const decoder = new Decoder(Stream.fromByteArray(Array.from(bytes)));
  if (!decoder.isFIT()) throw new FileFormatError('Ce fichier n’est pas un fichier FIT valide.');
  const { messages } = decoder.read() as unknown as { messages: Record<string, FitMessage[] | undefined> };
  const sessions = messages.sessionMesgs ?? [];
  if (sessions.length === 0) throw new FileFormatError('Ce fichier FIT ne contient aucune séance (fichier de réglages ou de parcours ?).');

  const activity = messages.activityMesgs?.[0];
  const utc = activity?.timestamp instanceof Date ? activity.timestamp : null;
  // `localTimestamp` est l'heure murale exprimée en secondes FIT : l'écart donne le décalage horaire.
  const local = num(activity?.localTimestamp);
  const offsetS = utc && local !== null ? Math.round((local + 631_065_600 - utc.getTime() / 1000) / 900) * 900 : null;
  const records = (messages.recordMesgs ?? []).filter((r) => r.timestamp instanceof Date);

  return sessions.map((session, index) => {
    const start = session.startTime instanceof Date ? session.startTime : (records[0]?.timestamp as Date | undefined);
    if (!start) throw new FileFormatError('Séance sans heure de début.');
    const elapsed = num(session.totalElapsedTime) ?? num(session.totalTimerTime) ?? 0;
    const end = start.getTime() + elapsed * 1000;
    const points: StreamPoint[] = records
      .filter((r) => (r.timestamp as Date).getTime() >= start.getTime() && (r.timestamp as Date).getTime() <= end + 1000)
      .map((r) => ({
        t: ((r.timestamp as Date).getTime() - start.getTime()) / 1000,
        hr: num(r.heartRate),
        power: num(r.power),
        distance: num(r.distance),
        altitude: num(r.enhancedAltitude) ?? num(r.altitude),
      }));
    const stream = summarizeStream(points, ctx.lthr);
    const sport = guessSport(String(session.sport ?? ''), String(session.subSport ?? ''));
    return {
      externalId: sessions.length > 1 ? `${id}-${index + 1}` : id,
      startAt: start,
      date: localDate(start, ctx.timeZone, offsetS),
      sport,
      title: SPORT_TITLES[sport],
      durationS: Math.round(num(session.totalTimerTime) ?? stream.movingS),
      distanceM: num(session.totalDistance) ?? stream.distanceM,
      elevationM: num(session.totalAscent) ?? stream.elevationM,
      avgHr: num(session.avgHeartRate) ?? stream.avgHr,
      avgPowerW: num(session.avgPower) ?? stream.avgPowerW,
      normalizedPowerW: num(session.normalizedPower) ?? stream.normalizedPowerW,
      rpe: null,
      zoneSeconds: stream.zoneSeconds,
    };
  });
}

// ——— TCX et GPX ———
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true, parseTagValue: true });
const list = <T>(value: T | T[] | undefined | null): T[] => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);
type Node = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function fromPoints(points: (StreamPoint & { at: Date })[], sport: Sport, title: string, id: string, ctx: ParseContext): ProviderActivity {
  if (points.length < 2) throw new FileFormatError('Ce fichier ne contient pas assez de points pour reconstituer une séance.');
  const start = points[0].at;
  const stream = summarizeStream(points, ctx.lthr);
  return {
    externalId: id,
    startAt: start,
    date: localDate(start, ctx.timeZone),
    sport,
    title: title || SPORT_TITLES[sport],
    durationS: stream.movingS,
    distanceM: stream.distanceM,
    elevationM: stream.elevationM,
    avgHr: stream.avgHr,
    avgPowerW: stream.avgPowerW,
    normalizedPowerW: stream.normalizedPowerW,
    rpe: null,
    zoneSeconds: stream.zoneSeconds,
  };
}

function parseTcx(text: string, id: string, ctx: ParseContext): ProviderActivity[] {
  const root = xml.parse(text) as Node;
  const activities = list<Node>(root.TrainingCenterDatabase?.Activities?.Activity);
  if (activities.length === 0) throw new FileFormatError('Ce fichier TCX ne contient aucune activité.');
  return activities.map((activity, index) => {
    const raw = list<Node>(activity.Lap).flatMap((lap) => list<Node>(lap.Track).flatMap((track) => list<Node>(track.Trackpoint)));
    const timed = raw.filter((p) => p.Time).map((p) => ({ p, at: new Date(p.Time) }));
    const start = timed[0]?.at.getTime() ?? 0;
    const points = timed.map(({ p, at }) => ({
      at,
      t: (at.getTime() - start) / 1000,
      hr: num(p.HeartRateBpm?.Value),
      power: num(p.Extensions?.TPX?.Watts),
      distance: num(p.DistanceMeters),
      altitude: num(p.AltitudeMeters),
    }));
    const sport = guessSport(String(activity['@Sport'] ?? ''), String(activity.Notes ?? ''));
    return fromPoints(points, sport, '', activities.length > 1 ? `${id}-${index + 1}` : id, ctx);
  });
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

function parseGpx(text: string, id: string, ctx: ParseContext): ProviderActivity[] {
  const root = xml.parse(text) as Node;
  const tracks = list<Node>(root.gpx?.trk);
  if (tracks.length === 0) throw new FileFormatError('Ce fichier GPX ne contient aucune trace enregistrée (un parcours seul ne suffit pas).');
  return tracks.map((track, index) => {
    const raw = list<Node>(track.trkseg).flatMap((segment) => list<Node>(segment.trkpt)).filter((p) => p.time);
    if (raw.length < 2) throw new FileFormatError('Cette trace GPX n’est pas horodatée : c’est un parcours, pas une séance.');
    const start = new Date(raw[0].time).getTime();
    let distance = 0;
    const points = raw.map((p, i) => {
      if (i > 0) distance += haversine(Number(raw[i - 1]['@lat']), Number(raw[i - 1]['@lon']), Number(p['@lat']), Number(p['@lon']));
      const extension = p.extensions?.TrackPointExtension ?? p.extensions ?? {};
      const at = new Date(p.time);
      return { at, t: (at.getTime() - start) / 1000, hr: num(extension.hr), power: num(p.extensions?.power ?? extension.power), distance, altitude: num(p.ele) };
    });
    const title = typeof track.name === 'string' ? track.name : '';
    return fromPoints(points, guessSport(String(track.type ?? ''), title), title, tracks.length > 1 ? `${id}-${index + 1}` : id, ctx);
  });
}

export const ACCEPTED_EXTENSIONS = ['.fit', '.tcx', '.gpx'] as const;

/** Lit un fichier d'activité et en extrait une ou plusieurs séances (plusieurs pour un enchaînement). */
export function parseActivityFile(filename: string, bytes: Uint8Array, ctx: ParseContext): ProviderActivity[] {
  // L'empreinte du contenu sert d'identifiant : réimporter le même fichier ne crée rien.
  const id = createHash('sha256').update(bytes).digest('hex').slice(0, 32);
  const extension = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  if (extension === '.fit') return parseFit(bytes, id, ctx);
  const text = new TextDecoder('utf-8').decode(bytes);
  if (extension === '.tcx') return parseTcx(text, id, ctx);
  if (extension === '.gpx') return parseGpx(text, id, ctx);
  throw new FileFormatError('Format non pris en charge. Formats acceptés : FIT, TCX, GPX.');
}
