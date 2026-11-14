'use client';

import { useActionState } from 'react';
import { login, type FormState } from '@/app/actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <div>
        <label className="label" htmlFor="email">
          Adresse e-mail
        </label>
        <input className="field" id="email" name="email" type="email" autoComplete="username" required aria-invalid={Boolean(state.error)} aria-describedby={state.error ? 'login-error' : undefined} />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Mot de passe
        </label>
        <input className="field" id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={Boolean(state.error)} />
      </div>
      {state.error ? (
        <p id="login-error" role="alert" className="text-sm text-critical-ink">
          {state.error}
        </p>
      ) : null}
      <button className="btn btn-primary w-full" type="submit" disabled={pending}>
        {pending ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
