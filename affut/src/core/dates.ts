/**
 * Dates calendaires manipulées comme chaînes ISO `YYYY-MM-DD`.
 * Tout le moteur raisonne en jours locaux de l'athlète : aucune heure, aucun fuseau.
 */
export type ISODate = string;

const DAY_MS = 86_400_000;

export function toEpochDay(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromEpochDay(day: number): ISODate {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromEpochDay(toEpochDay(date) + days);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return toEpochDay(a) - toEpochDay(b);
}

/** Lundi de la semaine ISO contenant `date`. */
export function weekStart(date: ISODate): ISODate {
  const day = toEpochDay(date);
  // 1970-01-01 est un jeudi : (day + 3) % 7 vaut 0 le lundi.
  const offset = (((day + 3) % 7) + 7) % 7;
  return fromEpochDay(day - offset);
}

export function weekEnd(start: ISODate): ISODate {
  return addDays(start, 6);
}

export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = toEpochDay(from); d <= toEpochDay(to); d++) out.push(fromEpochDay(d));
  return out;
}

export function todayISO(now: Date = new Date(), timeZone = 'Europe/Paris'): ISODate {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * Semaine proposée par défaut à la revue : la dernière semaine terminée,
 * ou la semaine en cours si l'on est dimanche (le coach fait son bilan en fin de semaine).
 */
export function defaultReviewWeek(today: ISODate): ISODate {
  return weekStart(addDays(today, -6));
}

/** Numéro de semaine ISO 8601. */
export function isoWeekNumber(date: ISODate): number {
  const thursday = toEpochDay(weekStart(date)) + 3;
  const year = new Date(thursday * DAY_MS).getUTCFullYear();
  const jan1 = Math.floor(Date.UTC(year, 0, 1) / DAY_MS);
  return Math.floor((thursday - jan1) / 7) + 1;
}

export function isValidISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return fromEpochDay(toEpochDay(value)) === value;
}
