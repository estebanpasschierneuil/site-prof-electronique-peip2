import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import { todayISO } from '@/core/dates';
import { encryptionReady } from '@/integrations/crypto';
import { PROVIDER_LABELS, PROVIDERS } from '@/integrations/registry';
import { requireUser } from '@/server/auth';
import { env } from '@/server/env';
import { listRoster } from '@/server/roster';

export const metadata: Metadata = { title: 'Intégrations' };

const SOURCES = [
  { id: 'intervals', how: 'Clé d’API de l’athlète, saisie dans son profil.', note: 'Séances avec temps par zone, VFC, FC de repos, sommeil, ressenti et plan d’entraînement.' },
  { id: 'strava', how: 'L’athlète autorise l’accès depuis le lien que vous lui envoyez.', note: 'Séances uniquement. À compléter par une autre source pour la récupération.' },
] as const;

const ROADMAP = [
  { name: 'Garmin Connect', note: 'Séances, VFC nocturne, sommeil. Accès soumis à l’agrément du programme développeur Garmin.' },
  { name: 'TrainingPeaks', note: 'Séances et plan. Accès soumis à un partenariat API.' },
  { name: 'Polar, Wahoo, COROS', note: 'Séances ; récupération selon la marque.' },
  { name: 'Import de fichiers FIT', note: 'Pour les athlètes sans compte connecté.' },
];

function Yes({ value }: { value: boolean }) {
  return value ? <Check size={16} className="text-good" role="img" aria-label="Oui" /> : <Minus size={16} className="text-ink-3" role="img" aria-label="Non" />;
}

export default async function IntegrationsPage() {
  const user = await requireUser();
  const roster = await listRoster(user.org.id, todayISO(new Date(), user.org.timezone));
  const connections = roster.flatMap((entry) => entry.connections.map((c) => ({ ...c, athlete: entry.athlete })));
  const broken = connections.filter((c) => c.status !== 'active');
  const without = roster.filter((entry) => entry.connections.length === 0);
  const count = (provider: string) => connections.filter((c) => c.provider === provider).length;
  const demoSources = [...new Set(connections.map((c) => c.provider))].filter((p) => !PROVIDERS[p]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-ink-3">Sources de données</p>
        <h1 className="text-2xl sm:text-3xl">
          {connections.length - broken.length} connexion{connections.length - broken.length > 1 ? 's' : ''} active{connections.length - broken.length > 1 ? 's' : ''} sur {roster.length} athlète{roster.length > 1 ? 's' : ''}
        </h1>
      </div>

      {broken.length > 0 || without.length > 0 ? (
        <section aria-labelledby="a-traiter">
          <h2 id="a-traiter" className="mb-2 text-lg">
            À traiter
          </h2>
          <ul className="panel divide-y divide-line">
            {broken.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    {c.athlete.firstName} {c.athlete.lastName}, {PROVIDER_LABELS[c.provider] ?? c.provider}
                  </p>
                  <p className="text-sm text-critical-ink">{c.lastError ?? 'La dernière synchronisation a échoué.'}</p>
                </div>
                <Link href={`/athletes/${c.athlete.id}/profil`} className="btn">
                  Ouvrir le profil
                </Link>
              </li>
            ))}
            {without.map(({ athlete }) => (
              <li key={athlete.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">
                    {athlete.firstName} {athlete.lastName}
                  </p>
                  <p className="text-sm text-warning-ink">Aucune source connectée.</p>
                </div>
                <Link href={`/athletes/${athlete.id}/profil`} className="btn">
                  Connecter une source
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="connecteurs">
        <h2 id="connecteurs" className="mb-2 text-lg">
          Connecteurs disponibles
        </h2>
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-line text-sm text-ink-3">
                <th scope="col" className="px-4 py-2 font-medium">Plateforme</th>
                <th scope="col" className="px-3 py-2 font-medium">Séances</th>
                <th scope="col" className="px-3 py-2 font-medium">Récupération</th>
                <th scope="col" className="px-3 py-2 font-medium">Plan</th>
                <th scope="col" className="px-3 py-2 font-medium">Mise en place</th>
                <th scope="col" className="px-3 py-2 font-medium">État</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Athlètes</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((source) => {
                const provider = PROVIDERS[source.id];
                return (
                  <tr key={source.id} className="border-b border-line align-top last:border-0">
                    <th scope="row" className="px-4 py-3 font-normal">
                      <div className="font-medium">{provider.label}</div>
                      <div className="max-w-xs text-sm text-ink-3">{source.note}</div>
                    </th>
                    <td className="px-3 py-3"><Yes value={provider.capabilities.activities} /></td>
                    <td className="px-3 py-3"><Yes value={provider.capabilities.wellness} /></td>
                    <td className="px-3 py-3"><Yes value={provider.capabilities.plannedWorkouts} /></td>
                    <td className="px-3 py-3 text-sm text-ink-2">{source.how}</td>
                    <td className="px-3 py-3 text-sm">{provider.isConfigured() ? 'Prêt' : <span className="text-warning-ink">Identifiants d’application à renseigner</span>}</td>
                    <td className="px-4 py-3 text-right tnum">{count(source.id)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!encryptionReady() ? (
          <p className="mt-2 rounded-control bg-warning-soft p-3 text-warning-ink" role="status">
            Configuration incomplète : définissez <code>APP_ENCRYPTION_KEY</code> pour pouvoir connecter des plateformes.
          </p>
        ) : null}
        {!PROVIDERS.strava.isConfigured() ? (
          <p className="mt-2 text-sm text-ink-3">
            Strava : créez une application sur strava.com/settings/api puis renseignez <code>STRAVA_CLIENT_ID</code> et <code>STRAVA_CLIENT_SECRET</code>. Adresse de retour : <code>{env.APP_URL}/api/integrations/strava/callback</code>
          </p>
        ) : null}
        {demoSources.length > 0 ? (
          <p className="mt-2 text-sm text-ink-3">
            Démonstration : les connexions des athlètes fictifs ({demoSources.map((p) => PROVIDER_LABELS[p] ?? p).join(', ')}, Strava, intervals.icu) sont simulées et ne contactent aucune plateforme.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="synchro" className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 id="synchro" className="mb-2 text-lg">
            Synchronisation
          </h2>
          <div className="panel space-y-2 p-5 text-ink-2">
            <p>Les nouvelles séances sont importées par une tâche planifiée, chaque heure. L’import est incrémental et ne crée jamais de doublon.</p>
            <p>La charge de chaque séance est recalculée avec les seuils de l’athlète, quelle que soit la plateforme : deux athlètes sur deux sources différentes restent comparables.</p>
            <p>Les jetons d’accès sont chiffrés avant d’être enregistrés et ne sont jamais affichés.</p>
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-lg">Sources envisagées</h2>
          <ul className="panel divide-y divide-line">
            {ROADMAP.map((item) => (
              <li key={item.name} className="p-4">
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-ink-2">{item.note}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-ink-3">Pas encore développées. Dites-nous laquelle vous manque le plus.</p>
        </div>
      </section>
    </div>
  );
}
