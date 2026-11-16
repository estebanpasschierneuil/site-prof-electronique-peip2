import { Check } from 'lucide-react';
import { toggleReviewed } from '@/app/actions';

/** Marque une semaine comme revue. Formulaire natif : fonctionne sans JavaScript. */
export function ReviewToggle({ athleteId, weekStart, reviewed, name, compact = false, next }: { athleteId: string; weekStart: string; reviewed: boolean; name: string; compact?: boolean; next?: string }) {
  return (
    <form action={toggleReviewed}>
      <input type="hidden" name="athleteId" value={athleteId} />
      <input type="hidden" name="weekStart" value={weekStart} />
      <input type="hidden" name="reviewed" value={String(!reviewed)} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <button
        type="submit"
        aria-pressed={reviewed}
        aria-label={compact ? `${reviewed ? 'Annuler la revue de' : 'Marquer comme revue la semaine de'} ${name}` : undefined}
        className={compact ? `btn h-8 min-h-8 w-8 px-0 ${reviewed ? 'btn-primary' : ''}` : `btn ${reviewed ? '' : 'btn-primary'}`}
        title={reviewed ? 'Revue faite, cliquer pour annuler' : 'Marquer comme revue'}
      >
        <Check size={16} aria-hidden="true" className={compact && !reviewed ? 'text-ink-3' : ''} />
        {compact ? null : reviewed ? 'Revue faite' : next ? 'Valider et passer au suivant' : 'Marquer comme revue'}
      </button>
    </form>
  );
}
