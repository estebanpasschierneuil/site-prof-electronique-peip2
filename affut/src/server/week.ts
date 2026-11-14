import { defaultReviewWeek, isValidISODate, todayISO, weekStart, type ISODate } from '@/core/dates';

/** Résout la semaine demandée dans l'URL : lundi de la semaine, jamais dans le futur. */
export function resolveWeek(param: string | string[] | undefined, timezone: string): { today: ISODate; week: ISODate; currentWeek: ISODate; defaultWeek: ISODate } {
  const today = todayISO(new Date(), timezone);
  const currentWeek = weekStart(today);
  const defaultWeek = defaultReviewWeek(today);
  const value = Array.isArray(param) ? param[0] : param;
  let week = isValidISODate(value) ? weekStart(value) : defaultWeek;
  if (week > currentWeek) week = currentWeek;
  return { today, week, currentWeek, defaultWeek };
}

export const DISTANCE_LABEL = { S: 'Sprint', M: 'Distance olympique', L: 'Half', XL: 'Ironman' } as const;
