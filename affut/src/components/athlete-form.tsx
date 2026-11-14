'use client';

import { useActionState } from 'react';
import { createAthlete, updateAthlete, type FormState } from '@/app/actions';
import { formatPace } from '@/core/format';

interface Values {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  distance?: string | null;
  ftpW?: number | null;
  runThresholdPaceS?: number | null;
  swimCssS?: number | null;
  lthr?: number | null;
  restHr?: number | null;
}

/** Création et édition d'un athlète. Les seuils servent à normaliser la charge entre les sports. */
export function AthleteForm({ values = {} }: { values?: Values }) {
  const editing = Boolean(values.id);
  const [state, action, pending] = useActionState<FormState, FormData>(editing ? updateAthlete : createAthlete, {});
  return (
    <form action={action} className="space-y-6" noValidate>
      {editing ? <input type="hidden" name="athleteId" value={values.id} /> : null}
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-semibold">Identité</legend>
        <Field label="Prénom" name="firstName" defaultValue={values.firstName} required autoComplete="off" />
        <Field label="Nom" name="lastName" defaultValue={values.lastName} required autoComplete="off" />
        <Field label="Adresse e-mail" name="email" type="email" defaultValue={values.email ?? ''} hint="Facultative, pour lui envoyer le lien de connexion." autoComplete="off" />
        <div>
          <label className="label" htmlFor="distance">
            Format préparé
          </label>
          <select className="field" id="distance" name="distance" defaultValue={values.distance ?? 'M'}>
            <option value="S">Sprint</option>
            <option value="M">Distance olympique</option>
            <option value="L">Half (70.3)</option>
            <option value="XL">Ironman</option>
          </select>
        </div>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-1 font-semibold">Seuils</legend>
        <p className="text-sm text-ink-3 sm:col-span-3">Sans seuil, la charge est estimée à partir de la fréquence cardiaque ou de la durée, avec moins de précision.</p>
        <Field label="FTP vélo (watts)" name="ftpW" inputMode="numeric" defaultValue={values.ftpW ?? ''} placeholder="250" />
        <Field label="Allure seuil course (min:s par km)" name="runThresholdPaceS" defaultValue={values.runThresholdPaceS ? formatPace(values.runThresholdPaceS) : ''} placeholder="4:15" />
        <Field label="CSS natation (min:s par 100 m)" name="swimCssS" defaultValue={values.swimCssS ? formatPace(values.swimCssS) : ''} placeholder="1:40" />
        <Field label="FC au seuil (bpm)" name="lthr" inputMode="numeric" defaultValue={values.lthr ?? ''} placeholder="168" />
        <Field label="FC de repos (bpm)" name="restHr" inputMode="numeric" defaultValue={values.restHr ?? ''} placeholder="48" />
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Enregistrement…' : editing ? 'Enregistrer le profil' : 'Créer l’athlète'}
        </button>
        <p className={`text-sm ${state.error ? 'text-critical-ink' : 'text-ink-2'}`} role={state.error ? 'alert' : 'status'}>
          {state.error ?? state.ok ?? ''}
        </p>
      </div>
    </form>
  );
}

function Field({ label, name, hint, ...props }: { label: string; name: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input className="field" id={name} name={name} aria-describedby={hint ? `${name}-hint` : undefined} {...props} />
      {hint ? (
        <p id={`${name}-hint`} className="mt-1 text-sm text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
