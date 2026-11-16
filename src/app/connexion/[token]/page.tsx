import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { CircleCheck } from 'lucide-react';
import { Wordmark } from '@/components/wordmark';
import { getDb } from '@/db/client';
import { athletes, connections, organizations } from '@/db/schema';
import { verifyToken } from '@/integrations/crypto';
import { oauthProviders, PROVIDER_LABELS } from '@/integrations/registry';

export const metadata: Metadata = { title: 'Connecter mes données' };

const WHAT: Record<string, string> = {
  strava: 'Vos séances, quelle que soit la montre qui les enregistre.',
  polar: 'Séances, sommeil et récupération nocturne.',
  wahoo: 'Séances de vos compteurs et home trainers.',
  whoop: 'Récupération, sommeil et séances.',
  oura: 'Sommeil et variabilité cardiaque nocturne.',
};

/** Page publique ouverte par l'athlète depuis le lien envoyé par son coach. */
export default async function ConnectPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ etat?: string }> }) {
  const { token } = await params;
  const state = (await searchParams).etat ?? '';
  const payload = verifyToken(token);
  const db = await getDb();
  const [row] = payload?.athleteId
    ? await db.select({ id: athletes.id, firstName: athletes.firstName, orgName: organizations.name }).from(athletes).innerJoin(organizations, eq(organizations.id, athletes.orgId)).where(eq(athletes.id, payload.athleteId)).limit(1)
    : [];

  if (!row) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-12">
        <Wordmark />
        <h1 className="mt-8 text-2xl">Ce lien n’est plus valable</h1>
        <p className="mt-3 text-ink-2">Il a expiré ou a été mal copié. Demandez un nouveau lien à votre entraîneur.</p>
      </main>
    );
  }

  const connected = new Set((await db.select({ provider: connections.provider, status: connections.status }).from(connections).where(eq(connections.athleteId, row.id))).filter((c) => c.status === 'active').map((c) => c.provider));
  const available = oauthProviders().filter((p) => p.isConfigured());
  const justConnected = state.startsWith('ok-') ? PROVIDER_LABELS[state.slice(3)] : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-12">
      <Wordmark />
      <h1 className="mt-8 text-2xl">Bonjour {row.firstName}, partagez vos données d’entraînement avec {row.orgName}</h1>
      <p className="mt-3 text-ink-2">Votre entraîneur utilise Affût pour analyser vos semaines. Connectez chaque application que vous utilisez : plus le tableau est complet, plus ses retours sont justes. Vous pouvez retirer un accès à tout moment depuis l’application concernée.</p>

      {justConnected ? (
        <p className="mt-4 rounded-control bg-good-soft p-3 text-good-ink" role="status">
          {justConnected} est connecté. Vous pouvez ajouter une autre application ou fermer cette page.
        </p>
      ) : null}
      {state === 'erreur' ? (
        <p className="mt-4 rounded-control bg-critical-soft p-3 text-critical-ink" role="alert">
          La connexion n’a pas abouti. Réessayez en acceptant toutes les autorisations demandées.
        </p>
      ) : null}

      {available.length === 0 ? (
        <p className="mt-6 rounded-control bg-sunken p-3 text-ink-2">Aucune connexion n’est encore activée par votre structure. Prévenez votre entraîneur.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {available.map((provider) => (
            <li key={provider.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">{provider.label}</p>
                <p className="text-sm text-ink-2">{WHAT[provider.id] ?? ''}</p>
              </div>
              {connected.has(provider.id) ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-good-ink">
                  <CircleCheck size={16} className="text-good" aria-hidden="true" />
                  Connecté
                </span>
              ) : (
                <a href={`/api/integrations/${provider.id}/start?token=${encodeURIComponent(token)}`} className="btn btn-primary shrink-0">
                  Connecter
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm text-ink-3">Vous utilisez Garmin, COROS, Suunto ou Zwift ? Reliez-les à Strava : vos séances suivront automatiquement.</p>
    </main>
  );
}
