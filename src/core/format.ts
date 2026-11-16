import { isoWeekNumber, addDays, type ISODate } from './dates';
import type { Sport, WorkoutKind } from './types';

export const SPORT_LABEL: Record<Sport, string> = {
  swim: 'Natation',
  bike: 'Vélo',
  run: 'Course à pied',
  strength: 'Renforcement',
  other: 'Autre',
};

export const SPORT_SHORT: Record<Sport, string> = { swim: 'Natation', bike: 'Vélo', run: 'Course', strength: 'Renfo', other: 'Autre' };

export const KIND_LABEL: Record<WorkoutKind, string> = {
  recovery: 'Récupération',
  endurance: 'Endurance',
  long: 'Sortie longue',
  tempo: 'Tempo',
  threshold: 'Seuil',
  vo2: 'VO2max',
  technique: 'Technique',
  strength: 'Renforcement',
  brick: 'Enchaînement',
  race: 'Course',
};

const nbsp = ' ';
const nnbsp = ' ';

/** 9 h 30, 45 min */
export function formatDuration(seconds: number): string {
  const totalMin = Math.round(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}${nbsp}min`;
  return `${h}${nbsp}h${m > 0 ? `${nbsp}${String(m).padStart(2, '0')}` : ''}`;
}

export function formatDistance(meters: number, sport?: Sport): string {
  if (sport === 'swim') return `${formatInt(Math.round(meters / 50) * 50)}${nbsp}m`;
  return `${formatNumber(meters / 1000, meters >= 100_000 ? 0 : 1)}${nbsp}km`;
}

export function formatInt(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value);
}

export function formatNumber(value: number, digits = 1): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatSigned(value: number, digits = 0): string {
  const rounded = Number(value.toFixed(digits));
  const text = formatNumber(Math.abs(rounded), digits);
  if (rounded > 0) return `+${text}`;
  if (rounded < 0) return `−${text}`;
  return text;
}

export function formatPct(ratio: number): string {
  return `${Math.round(ratio * 100)}${nnbsp}%`;
}

/** Allure en min:s (par km ou par 100 m). */
export function formatPace(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function parts(date: ISODate) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDay(date: ISODate, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric' }): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...opts }).format(parts(date));
}

export function formatDateLong(date: ISODate): string {
  return formatDay(date, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateShort(date: ISODate): string {
  return formatDay(date, { day: 'numeric', month: 'short' });
}

/** « Semaine 45, du 2 au 8 novembre » */
export function formatWeek(weekStart: ISODate): string {
  return `Semaine ${isoWeekNumber(weekStart)}, ${formatWeekRange(weekStart)}`;
}

export function formatWeekRange(weekStart: ISODate): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.slice(0, 7) === end.slice(0, 7);
  const from = formatDay(weekStart, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'long' });
  const to = formatDay(end, { day: 'numeric', month: 'long' });
  return `du ${from} au ${to}`;
}
