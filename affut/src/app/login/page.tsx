import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { enterDemo } from '@/app/actions';
import { LoginForm } from '@/components/login-form';
import { Wordmark } from '@/components/wordmark';
import { getCurrentUser } from '@/server/auth';
import { env } from '@/server/env';

export const metadata: Metadata = { title: 'Connexion' };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/');
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-5xl items-center gap-12 px-6 py-12 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <section>
        <Wordmark />
        <h1 className="mt-8 max-w-md text-3xl">Votre revue du dimanche, déjà triée.</h1>
        <p className="mt-4 max-w-md text-lg text-ink-2">Affût analyse la semaine de chaque athlète et vous dit lesquels ont besoin de vous, pourquoi, et quoi ajuster pour la suivante.</p>
        {env.DEMO_MODE ? (
          <form action={enterDemo} className="mt-8">
            <button className="btn btn-primary" type="submit">
              Explorer la démonstration
            </button>
            <p className="mt-3 max-w-sm text-sm text-ink-3">18 triathlètes fictifs, six mois d’historique, régénérés pour coller à la semaine qui vient de s’achever.</p>
          </form>
        ) : null}
      </section>
      <section className="panel p-6" aria-labelledby="login-title">
        <h2 id="login-title" className="text-lg">
          Se connecter
        </h2>
        <p className="mb-5 mt-1 text-sm text-ink-3">Accès réservé aux entraîneurs de votre structure.</p>
        <LoginForm />
      </section>
    </main>
  );
}
