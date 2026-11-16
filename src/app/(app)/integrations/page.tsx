import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import { todayISO } from '@/core/dates';
import { encryptionReady } from '@/integrations/crypto';
import { redirectUri } from '@/integrations/oauth';
import { PROVIDER_LABELS, PROVIDERS } from '@/integrations/registry';
import { requireUser } from '@/server/auth';
import { listRoster } from '@/server/roster';

export const metadata: Metadata = { title: 'Intégrations' };

/** Ce que chaque marque permet aujourd'hui, connexion directe ou non. */
const COVERAGE: { brand: string; path: string; recovery: string }[] = [
  { brand: 'Garmin', path: 'Via Strava ou intervals.icu, qui se synchronisent seuls avec Garmin Connect, ou fichiers FIT.', recovery: 'Via intervals.icu (VFC, sommeil, FC de repos).' },
  { brand: 'Polar', path: 'Connexion directe.', recovery: 'Connexion directe (sommeil, Nightly Recharge).' },
  { brand: 'Wahoo', path: 'Connexion directe, ou fichiers FIT.', recovery: 'Aucune : à compléter par une autre source.' },
  { brand: 'COROS, Suunto', path: 'Via Strava ou intervals.icu, ou fichiers FIT.', recovery: 'Via intervals.icu (sommeil, FC de repos).' },
  { brand: 'Zwift, Rouvy, TrainerRoad', path: 'Via Strava, ou fichiers FIT.', recovery: 'Sans objet.' },
  { brand: 'Apple Watch', path: 'Via Strava.', recovery: 'Pas d’accès hors du téléphone.' },
  { brand: 'WHOOP', path: 'Connexion directe.', recovery: 'Connexion directe (VFC, FC de repos, sommeil).' },
  { brand: 'Oura', path: 'Sans objet (pas de séances).', recovery: 'Connexion directe (VFC, FC de repos, sommeil).' },
  { brand: 'TrainingPeaks', path: 'Export FIT ou TCX, puis import de fichiers.', recovery: 'Non repris.' },
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
  const providers = Object.values(PROVIDERS);
  const toConfigure = providers.filter((p) => p.auth === 'oauth' && !p.isConfigured());
  const simulated = [...new Set(connections.filter((c) => user.org.isDemo).map((c) => c.provider))];
  const active = connections.length - broken.length;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-ink-3">Sources de données</p>
        <h1 className="text-2xl sm:text-3xl">
          {active} connexion{active > 1 ? 's' : ''} active{active > 1 ? 's' : ''} pour {roster.length} athlète{roster.length > 1 ? 's' : ''}
        </h1>
        <p className="mt-2 max-w-3xl text-ink-2">Un athlète peut cumuler plusieurs sources : sa montre, son home trainer, sa bague. Affût réunit le tout, écarte les séances reçues en double et garde pour chaque mesure la source la plus fiable.</p>
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
          Connexions directes
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
              {providers.map((provider) => (
                <tr key={provider.id} className="border-b border-line align-top">
                  <th scope="row" className="px-4 py-2.5 font-medium">{provider.label}</th>
                  <td className="px-3 py-2.5"><Yes value={provider.capabilities.activities} /></td>
                  <td className="px-3 py-2.5"><Yes value={provider.capabilities.wellness} /></td>
                  <td className="px-3 py-2.5"><Yes value={provider.capabilities.plannedWorkouts} /></td>
                  <td className="px-3 py-2.5 text-sm text-ink-2">{provider.auth === 'oauth' ? 'L’athlète l’autorise depuis son lien d’invitation.' : 'Clé d’API de l’athlète, saisie dans son profil.'}</td>
                  <td className="px-3 py-2.5 text-sm">{provider.isConfigured() ? 'Prêt' : <span className="text-warning-ink">Identifiants d’application à renseigner</span>}</td>
                  <td className="px-4 py-2.5 text-right tnum">{count(provider.id)}</td>
                </tr>
              ))}
              <tr className="align-top">
                <th scope="row" className="px-4 py-2.5 font-medium">Fichiers FIT, TCX, GPX</th>
                <td className="px-3 py-2.5"><Yes value /></td>
                <td className="px-3 py-2.5"><Yes value={false} /></td>
                <td className="px-3 py-2.5"><Yes value={false} /></td>
                <td className="px-3 py-2.5 text-sm text-ink-2">Dépôt dans le profil de l’athlète, par lot.</td>
                <td className="px-3 py-2.5 text-sm">Prêt</td>
                <td className="px-4 py-2.5 text-right text-ink-3">–</td>
              </tr>
            </tbody>
          </table>
        </div>
        {!encryptionReady() ? (
          <p className="mt-2 rounded-control bg-warning-soft p-3 text-warning-ink" role="status">
            Configuration incomplète : définissez <code>APP_ENCRYPTION_KEY</code> pour pouvoir connecter des plateformes.
          </p>
        ) : null}
        {toConfigure.length > 0 ? (
          <details className="mt-2 text-sm text-ink-2">
            <summary className="cursor-pointer hover:text-ink">Activer {toConfigure.map((p) => p.label).join(', ')}</summary>
            <p className="mt-2">Créez une application développeur chez chaque plateforme, puis renseignez ses identifiants dans les variables d’environnement du serveur.</p>
            <ul className="mt-2 space-y-1">
              {toConfigure.map((p) => (
                <li key={p.id}>
                  <span className="font-medium text-ink">{p.label}</span> : <code>{p.id.toUpperCase()}_CLIENT_ID</code>, <code>{p.id.toUpperCase()}_CLIENT_SECRET</code>, adresse de retour <code>{redirectUri(p.id)}</code>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {simulated.length > 0 ? (
          <p className="mt-2 text-sm text-ink-3">Démonstration : les connexions des athlètes fictifs ({simulated.map((p) => PROVIDER_LABELS[p] ?? p).join(', ')}) sont simulées et ne contactent aucune plateforme.</p>
        ) : null}
      </section>

      <section aria-labelledby="couverture">
        <h2 id="couverture" className="text-lg">
          Quelle que soit la montre de l’athlète
        </h2>
        <p className="mb-2 mt-1 max-w-3xl text-ink-2">Toutes les marques n’ouvrent pas leurs données de la même façon. Voici le chemin qui fonctionne aujourd’hui pour chacune.</p>
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-line text-sm text-ink-3">
                <th scope="col" className="w-[22%] px-4 py-2 font-medium">Marque</th>
                <th scope="col" className="px-3 py-2 font-medium">Séances</th>
                <th scope="col" className="w-[34%] px-4 py-2 font-medium">Récupération</th>
              </tr>
            </thead>
            <tbody>
              {COVERAGE.map((row) => (
                <tr key={row.brand} className="border-b border-line align-top last:border-0">
                  <th scope="row" className="px-4 py-2.5 font-medium">{row.brand}</th>
                  <td className="px-3 py-2.5 text-ink-2">{row.path}</td>
                  <td className="px-4 py-2.5 text-ink-2">{row.recovery}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-ink-3">Les connexions directes à Garmin, COROS, Suunto et TrainingPeaks passent par un agrément de chaque marque : elles ne sont pas développées. Dites-nous laquelle vous manque le plus.</p>
      </section>

      <section aria-labelledby="fusion" className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 id="fusion" className="mb-2 text-lg">
            Comment les sources sont réunies
          </h2>
          <div className="panel space-y-2 p-5 text-ink-2">
            <p>Une séance reçue par deux applications (la montre et Strava, par exemple) est reconnue à son horaire et à sa durée. Une seule version est analysée : celle qui contient la puissance, les zones et la fréquence cardiaque.</p>
            <p>Pour la récupération, chaque mesure vient de la source la plus fiable : le capteur porté la nuit pour la VFC et le sommeil, le questionnaire pour le ressenti.</p>
            <p>La charge est recalculée avec les seuils de l’athlète, quelle que soit l’origine : deux athlètes sur deux applications différentes restent comparables.</p>
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-lg">Synchronisation</h2>
          <div className="panel space-y-2 p-5 text-ink-2">
            <p>Les nouvelles données sont importées par une tâche planifiée, chaque heure. L’import est incrémental et ne crée jamais de doublon.</p>
            <p>Les jetons d’accès sont chiffrés avant d’être enregistrés et ne sont jamais affichés. Un athlète qui retire son accès apparaît ici, dans « À traiter ».</p>
          </div>
        </div>
      </section>
    </div>
  );
}
