'use client';

import { useActionState, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { addRace, connectIntervals, type FormState } from '@/app/actions';

export function RaceForm({ athleteId }: { athleteId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addRace, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] sm:items-end">
      <input type="hidden" name="athleteId" value={athleteId} />
      <div>
        <label className="label" htmlFor="race-name">Course</label>
        <input className="field" id="race-name" name="name" placeholder="Half de Vichy" required />
      </div>
      <div>
        <label className="label" htmlFor="race-date">Date</label>
        <input className="field" id="race-date" name="date" type="date" required />
      </div>
      <div>
        <label className="label" htmlFor="race-distance">Format</label>
        <select className="field" id="race-distance" name="distance" defaultValue="M">
          <option value="S">Sprint</option>
          <option value="M">Olympique</option>
          <option value="L">Half</option>
          <option value="XL">Ironman</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="race-priority">Priorité</label>
        <select className="field" id="race-priority" name="priority" defaultValue="B">
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
      </div>
      <button type="submit" className="btn" disabled={pending}>
        Ajouter
      </button>
      <p className={`text-sm sm:col-span-5 ${state.error ? 'text-critical-ink' : 'text-ink-2'}`} role="status">
        {state.error ?? state.ok ?? ''}
      </p>
    </form>
  );
}

export function IntervalsForm({ athleteId }: { athleteId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectIntervals, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
      <input type="hidden" name="athleteId" value={athleteId} />
      <div>
        <label className="label" htmlFor="icu-id">Identifiant d’athlète</label>
        <input className="field" id="icu-id" name="externalAthleteId" placeholder="i12345" autoComplete="off" required />
      </div>
      <div>
        <label className="label" htmlFor="icu-key">Clé d’API</label>
        <input className="field" id="icu-key" name="apiKey" type="password" autoComplete="off" required />
      </div>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? 'Import en cours…' : 'Connecter et importer'}
      </button>
      <p className={`text-sm sm:col-span-3 ${state.error ? 'text-critical-ink' : 'text-ink-2'}`} role="status">
        {state.error ?? state.ok ?? 'L’athlète trouve ces deux informations dans intervals.icu, page Réglages, section Developer Settings. La clé est chiffrée avant d’être enregistrée.'}
      </p>
    </form>
  );
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <label className="sr-only" htmlFor="copy-field">
        {label}
      </label>
      <input id="copy-field" className="field tnum" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* le champ reste sélectionnable à la main */
          }
        }}
      >
        {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
        {copied ? 'Copié' : 'Copier'}
      </button>
    </div>
  );
}
