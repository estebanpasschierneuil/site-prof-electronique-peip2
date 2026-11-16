import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { Wordmark } from '@/components/wordmark';
import { getDb } from '@/db/client';
import { athletes, organizations } from '@/db/schema';
import { verifyToken } from '@/integrations/crypto';
import { PROVIDERS } from '@/integrations/registry';

export const metadata: Metadata = { title: 'Connecter mes données' };

/** Page publique ouverte par l'athlète depuis le lien envoyé par son coach. */
export default async function ConnectPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ etat?: string }> }) {
  const { token } = await params;
  const state = (await searchParams).etat;
  const payload = verifyToken(token);
  const db = await getDb();
  const [row] = payload?.athleteId
    ? await db.select({ firstName: athletes.firstName, orgName: organizations.name }).from(athletes).innerJoin(organizations, eq(organizations.id, athletes.orgId)).where(eq(athletes.id, payload.athleteId)).limit(1)
    : [];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-12">
      <Wordmark />
      {!row ? (
        <>
          <h1 className="mt-8 text-2xl">Ce lien n’est plus valable</h1>
          <p className="mt-3 text-ink-2">Il a expiré ou a été mal copié. Demandez un nouveau lien à votre entraîneur.</p>
        </>
      ) : state === 'ok' ? (
        <>
          <h1 className="mt-8 text-2xl">C’est connecté, {row.firstName}</h1>
          <p className="mt-3 text-ink-2">Vos séances sont maintenant transmises à {row.orgName}. Vous pouvez fermer cette page.</p>
        </>
      ) : (
        <>
          <h1 className="mt-8 text-2xl">Bonjour {row.firstName}, partagez vos séances avec {row.orgName}</h1>
          <p className="mt-3 text-ink-2">Votre entraîneur utilise Affût pour analyser vos semaines. Il verra vos séances (durée, distance, fréquence cardiaque, puissance) et rien d’autre. Vous pouvez retirer cet accès à tout moment depuis votre compte Strava.</p>
          {state === 'erreur' ? (
            <p className="mt-4 rounded-control bg-critical-soft p-3 text-critical-ink" role="alert">
              La connexion n’a pas abouti. Réessayez, en acceptant l’accès aux activités.
            </p>
          ) : null}
          {PROVIDERS.strava.isConfigured() ? (
            <a href={`/api/integrations/strava/start?token=${encodeURIComponent(token)}`} className="btn btn-primary mt-6 self-start">
              Autoriser l’accès à Strava
            </a>
          ) : (
            <p className="mt-6 rounded-control bg-sunken p-3 text-ink-2">La connexion Strava n’est pas encore activée par votre structure. Prévenez votre entraîneur.</p>
          )}
        </>
      )}
    </main>
  );
}
