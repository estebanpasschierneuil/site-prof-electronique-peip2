import { isoWeekNumber, type ISODate } from './dates';
import { formatDuration, formatInt, formatWeekRange } from './format';
import type { WeekStatus, WeeklyAnalysis } from './types';

/** Évolution d'un athlète par rapport à la semaine précédente. */
export type Trend = 'new' | 'persisting' | 'resolved' | null;

export function trendOf(current: WeekStatus, previous: WeekStatus | null): Trend {
  if (previous === null) return null;
  if (current === 'ok') return previous === 'ok' ? null : 'resolved';
  return previous === 'ok' ? 'new' : 'persisting';
}

export const TREND_LABEL: Record<Exclude<Trend, null>, string> = {
  new: 'Nouveau cette semaine',
  persisting: 'Déjà signalé la semaine dernière',
  resolved: 'De retour sur les rails',
};

export interface DigestEntry {
  name: string;
  analysis: WeeklyAnalysis;
  trend: Trend;
}

export interface Digest {
  athletes: number;
  durationS: number;
  plannedDurationS: number;
  sessionsDone: number;
  sessionsPlanned: number;
  /** Part des séances prévues réalisées, tous athlètes confondus. */
  completion: number | null;
  counts: Record<WeekStatus, number>;
  trends: { new: number; persisting: number; resolved: number };
  /** Les évolutions non nulles, déjà rédigées. */
  changes: string[];
  /** Athlètes qui courent dans les 14 jours. */
  races: { name: string; race: string; daysTo: number }[];
  /** Athlètes dont l'analyse repose sur des données incomplètes. */
  dataGaps: { name: string; reason: string }[];
  /** Version texte, prête à être partagée avec un autre coach ou archivée. */
  text: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Synthèse du groupe : ce qu'un coach reconstituerait à la main en ouvrant
 * chaque athlète, ramené à une page.
 */
export function buildDigest(entries: DigestEntry[], weekStart: ISODate, organization: string): Digest {
  const counts: Record<WeekStatus, number> = { action: 0, watch: 0, ok: 0 };
  const trends = { new: 0, persisting: 0, resolved: 0 };
  let durationS = 0;
  let plannedDurationS = 0;
  let sessionsDone = 0;
  let sessionsPlanned = 0;
  const races: Digest['races'] = [];
  const dataGaps: Digest['dataGaps'] = [];

  for (const { name, analysis: a, trend } of entries) {
    counts[a.status]++;
    if (trend) trends[trend]++;
    durationS += a.load.durationS;
    plannedDurationS += a.load.plannedDurationS;
    sessionsDone += a.compliance.sessionsDone;
    sessionsPlanned += a.compliance.sessionsPlanned;
    if (a.nextRace && a.nextRace.priority !== 'C' && a.nextRace.daysTo <= 14) races.push({ name, race: a.nextRace.name, daysTo: a.nextRace.daysTo });
    const codes = new Set(a.insights.map((i) => i.code));
    if (codes.has('no_data')) dataGaps.push({ name, reason: 'aucune donnée reçue' });
    else if (codes.has('wellness_missing')) dataGaps.push({ name, reason: 'pas de données de récupération' });
    else if (codes.has('history_short')) dataGaps.push({ name, reason: 'historique encore court' });
  }
  races.sort((x, y) => x.daysTo - y.daysTo);

  const lines: string[] = [
    `Synthèse de la semaine ${isoWeekNumber(weekStart)} (${formatWeekRange(weekStart)}), ${organization}`,
    `${plural(entries.length, 'athlète', 'athlètes')}, ${formatDuration(durationS)} d’entraînement${plannedDurationS > 0 ? ` sur ${formatDuration(plannedDurationS)} prévues` : ''}, ${sessionsDone} séances${sessionsPlanned > 0 ? ` sur ${sessionsPlanned}` : ''}.`,
  ];
  const changes = [trends.new ? plural(trends.new, 'nouveau signalement', 'nouveaux signalements') : '', trends.persisting ? plural(trends.persisting, 'signalement qui persiste', 'signalements qui persistent') : '', trends.resolved ? plural(trends.resolved, 'athlète de retour sur les rails', 'athlètes de retour sur les rails') : ''].filter(Boolean);
  if (changes.length) lines.push(`Depuis la semaine dernière : ${changes.join(', ')}.`);

  const sections: [WeekStatus, string][] = [
    ['action', 'Action requise'],
    ['watch', 'À surveiller'],
  ];
  for (const [status, title] of sections) {
    const group = entries.filter((e) => e.analysis.status === status);
    if (group.length === 0) continue;
    lines.push('', `${title} (${group.length})`);
    for (const { name, analysis: a } of group) {
      lines.push(`- ${name} : ${a.headline}. ${a.insights[0]?.detail ?? ''}`.trim());
      lines.push(`  Semaine suivante : ${a.recommendation.label.toLowerCase()}, ${formatInt(a.recommendation.targetLoad[0])} à ${formatInt(a.recommendation.targetLoad[1])} points de charge.`);
    }
  }
  const fine = entries.filter((e) => e.analysis.status === 'ok');
  if (fine.length) lines.push('', `Sur les rails (${fine.length}) : ${fine.map((e) => e.name).join(', ')}.`);
  if (races.length) lines.push('', `Échéances : ${races.map((r) => `${r.name} (${r.race}, dans ${r.daysTo} jours)`).join(' ; ')}.`);
  if (dataGaps.length) lines.push('', `Données incomplètes : ${dataGaps.map((g) => `${g.name} (${g.reason})`).join(' ; ')}.`);

  return {
    athletes: entries.length,
    durationS,
    plannedDurationS,
    sessionsDone,
    sessionsPlanned,
    completion: sessionsPlanned > 0 ? sessionsDone / sessionsPlanned : null,
    counts,
    trends,
    changes,
    races,
    dataGaps,
    text: lines.join('\n'),
  };
}
