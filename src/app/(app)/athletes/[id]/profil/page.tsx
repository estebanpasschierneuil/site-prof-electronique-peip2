import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AthleteForm } from '@/components/athlete-form';
import { FileImport } from '@/components/file-import';
import { CopyField, IntervalsForm, RaceForm } from '@/components/profile-forms';
import { formatDateLong } from '@/core/format';
import { encryptionReady, signToken } from '@/integrations/crypto';
import { oauthProviders, PROVIDER_LABELS } from '@/integrations/registry';
import { requireUser } from '@/server/auth';
import { env } from '@/server/env';
import { getAthleteProfile } from '@/server/roster';
import { DISTANCE_LABEL } from '@/server/week';

export const metadata: Metadata = { title: 'Profil de l’athlète' };

const INVITE_TTL = 14 * 86_400;

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const profile = await getAthleteProfile(user.org.id, id);
  if (!profile) notFound();
  const { athlete, connections, races } = profile;
  const created = (await searchParams).created === '1';
  const canConnect = encryptionReady();
  const inviteUrl = canConnect ? `${env.APP_URL}/connexion/${signToken({ athleteId: athlete.id }, INVITE_TTL)}` : null;
  const ready = oauthProviders().filter((p) => p.isConfigured());
  const pendingSetup = oauthProviders().filter((p) => !p.isConfigured());

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/athletes" className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={15} aria-hidden="true" />
        Athlètes
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl">
          {athlete.firstName} {athlete.lastName}
        </h1>
        <Link href={`/athletes/${athlete.id}`} className="btn">
          Voir l’analyse de la semaine
        </Link>
      </div>
      {created ? (
        <p className="panel bg-good-soft p-4 text-good-ink" role="status">
          Athlète créé. Il reste à connecter sa plateforme d’entraînement, plus bas sur cette page.
        </p>
      ) : null}

      <section className="panel p-5" aria-labelledby="profil">
        <h2 id="profil" className="sr-only">
          Profil et seuils
        </h2>
        <AthleteForm values={athlete} />
      </section>

      <section className="panel p-5" aria-labelledby="courses">
        <h2 id="courses" className="text-lg">
          Courses
        </h2>
        <p className="mb-3 text-sm text-ink-3">Les objectifs A et B déclenchent l’affûtage et la récupération dans l’analyse.</p>
        {races.length > 0 ? (
          <ul className="mb-4 divide-y divide-line border-y border-line">
            {races.map((race) => (
              <li key={race.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="font-medium">{race.name}</span>
                <span className="text-sm text-ink-2">
                  {formatDateLong(race.date)}, {DISTANCE_LABEL[race.distance]}, objectif {race.priority}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-ink-2">Aucune course enregistrée.</p>
        )}
        <RaceForm athleteId={athlete.id} />
      </section>

      <section className="panel p-5" aria-labelledby="sources">
        <h2 id="sources" className="text-lg">
          Sources de données
        </h2>
        {connections.length > 0 ? (
          <ul className="mb-5 mt-2 divide-y divide-line border-y border-line">
            {connections.map((c) => (
              <li key={c.id} className="py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{PROVIDER_LABELS[c.provider] ?? c.provider}</span>
                  <span className={`text-sm ${c.status === 'active' ? 'text-ink-2' : 'font-medium text-critical-ink'}`}>
                    {c.status === 'active' ? `Active, dernière synchronisation le ${c.lastSyncAt ? formatDateLong(c.lastSyncAt.toISOString().slice(0, 10)) : '–'}` : 'À reconnecter'}
                  </span>
                </div>
                {c.lastError ? <p className="mt-0.5 text-sm text-critical-ink">{c.lastError}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-5 mt-2 text-ink-2">Aucune source connectée. Plusieurs sources peuvent se cumuler : une séance reçue deux fois n’est comptée qu’une fois.</p>
        )}

        {inviteUrl ? (
          <>
        <h3 className="font-semibold">Lien à envoyer à l’athlète</h3>
        <p className="mb-2 text-sm text-ink-3">
          Depuis ce lien, valable 14 jours, l’athlète connecte lui-même toutes ses applications
          {ready.length > 0 ? ` : ${ready.map((p) => p.label).join(', ')}.` : '.'}
          {pendingSetup.length > 0 ? ` À activer sur ce déploiement : ${pendingSetup.map((p) => p.label).join(', ')}.` : ''}
        </p>
        <CopyField value={inviteUrl} label="Lien de connexion pour l’athlète" />

        <h3 className="mt-6 font-semibold">intervals.icu</h3>
        <p className="mb-3 text-sm text-ink-3">Source la plus complète : séances, temps par zone, récupération et plan d’entraînement.</p>
        <IntervalsForm athleteId={athlete.id} />

        <h3 className="mt-6 font-semibold">Fichiers d’activité</h3>
        <p className="mb-3 text-sm text-ink-3">Pour toute montre ou application sans connexion directe : exportez les séances et déposez-les ici. Garmin, COROS, Suunto, Zwift et Wahoo produisent des fichiers FIT.</p>
        <FileImport athleteId={athlete.id} />
          </>
        ) : (
          <p className="rounded-control bg-warning-soft p-3 text-warning-ink" role="status">
            Les connexions sont désactivées : la variable <code>APP_ENCRYPTION_KEY</code> n’est pas définie sur ce déploiement. Elle protège les jetons d’accès des athlètes.
          </p>
        )}
      </section>
    </div>
  );
}
