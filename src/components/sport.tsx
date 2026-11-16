import { SPORT_SHORT } from '@/core/format';
import type { Sport } from '@/core/types';

export const SPORT_VAR: Record<Sport, string> = { swim: 'var(--swim)', bike: 'var(--bike)', run: 'var(--run)', strength: 'var(--other)', other: 'var(--other)' };

/** Pastille de couleur à côté du nom : le texte ne porte jamais la couleur de la série. */
export function SportMark({ sport, label = true }: { sport: Sport; label?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: SPORT_VAR[sport] }} aria-hidden="true" />
      {label ? SPORT_SHORT[sport] : <span className="sr-only">{SPORT_SHORT[sport]}</span>}
    </span>
  );
}
