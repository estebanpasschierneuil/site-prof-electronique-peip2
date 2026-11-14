import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, type ISODate } from '@/core/dates';
import { formatWeekRange } from '@/core/format';
import { isoWeekNumber } from '@/core/dates';

/** Navigation de semaine en semaine ; la semaine vit dans l'URL. */
export function WeekNav({ weekStart, currentWeek, hrefFor, isPartial }: { weekStart: ISODate; currentWeek: ISODate; hrefFor: (week: ISODate) => string; isPartial: boolean }) {
  const next = addDays(weekStart, 7);
  const canGoNext = next <= currentWeek;
  return (
    <div className="flex items-center gap-1">
      <Link href={hrefFor(addDays(weekStart, -7))} className="btn px-2" aria-label="Semaine précédente" scroll={false}>
        <ChevronLeft size={16} aria-hidden="true" />
      </Link>
      <div className="min-w-56 px-2 text-center leading-tight">
        <div className="font-medium">Semaine {isoWeekNumber(weekStart)}</div>
        <div className="text-sm text-ink-3">
          {formatWeekRange(weekStart)}
          {isPartial ? ', en cours' : ''}
        </div>
      </div>
      {canGoNext ? (
        <Link href={hrefFor(next)} className="btn px-2" aria-label="Semaine suivante" scroll={false}>
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      ) : (
        <span className="btn px-2" aria-disabled="true" title="Semaine à venir">
          <ChevronRight size={16} aria-hidden="true" />
        </span>
      )}
    </div>
  );
}
