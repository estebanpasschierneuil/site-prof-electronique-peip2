'use client';

import { useActionState } from 'react';
import { saveCoachNote, type FormState } from '@/app/actions';

export function NoteForm({ athleteId, weekStart, note }: { athleteId: string; weekStart: string; note: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCoachNote, {});
  return (
    <form action={action}>
      <input type="hidden" name="athleteId" value={athleteId} />
      <input type="hidden" name="weekStart" value={weekStart} />
      <label htmlFor="note" className="sr-only">
        Note du coach
      </label>
      <textarea id="note" name="note" className="field min-h-72 resize-y leading-relaxed" defaultValue={note} maxLength={4000} placeholder="Décision prise, point à vérifier la semaine prochaine, contexte personnel…" />
      <div className="mt-2 flex items-center gap-3">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer la note'}
        </button>
        <span className={`text-sm ${state.error ? 'text-critical-ink' : 'text-ink-3'}`} role="status">
          {state.error ?? state.ok ?? ''}
        </span>
      </div>
    </form>
  );
}
