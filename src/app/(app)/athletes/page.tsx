import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { todayISO } from '@/core/dates';
import { formatDateShort, formatPace } from '@/core/format';
import { PROVIDER_LABELS } from '@/integrations/registry';
import { requireUser } from '@/server/auth';
import { listRoster } from '@/server/roster';
import { DISTANCE_LABEL } from '@/server/week';

export const metadata: Metadata = { title: 'Athlètes' };

function syncAge(date: Date | null): string {
  if (!date) return 'jamais synchronisé';
  const hours = Math.floor((Date.now() - date.getTime()) / 3_600_000);
  if (hours < 1) return 'à l’instant';
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} jour${days > 1 ? 's' : ''}`;
}

export default async function AthletesPage() {
  const user = await requireUser();
  const roster = await listRoster(user.org.id, todayISO(new Date(), user.org.timezone));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-3">{user.org.name}</p>
          <h1 className="text-2xl sm:text-3xl">
            {roster.length} athlète{roster.length > 1 ? 's' : ''} suivi{roster.length > 1 ? 's' : ''}
          </h1>
        </div>
        <Link href="/athletes/nouveau" className="btn btn-primary">
          <Plus size={16} aria-hidden="true" />
          Ajouter un athlète
        </Link>
      </div>

      {roster.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="font-medium">Votre effectif est vide.</p>
          <p className="mx-auto mt-1 max-w-sm text-ink-2">Créez un athlète, renseignez ses seuils, puis connectez sa plateforme d’entraînement.</p>
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[58rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-line text-sm text-ink-3">
                <th scope="col" className="px-4 py-2 font-medium">Athlète</th>
                <th scope="col" className="px-3 py-2 font-medium">Format</th>
                <th scope="col" className="px-3 py-2 font-medium">Coach</th>
                <th scope="col" className="px-3 py-2 font-medium">Prochain objectif</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">FTP</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Seuil course</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">CSS</th>
                <th scope="col" className="px-4 py-2 font-medium">Sources de données</th>
              </tr>
            </thead>
            <tbody>
              {roster.map(({ athlete, coachName, connections, nextRace }) => {
                return (
                  <tr key={athlete.id} className="relative border-b border-line last:border-0 hover:bg-sunken">
                    <th scope="row" className="px-4 py-2.5 font-medium">
                      <Link href={`/athletes/${athlete.id}/profil`} className="after:absolute after:inset-0 after:content-['']">
                        {athlete.firstName} {athlete.lastName}
                      </Link>
                    </th>
                    <td className="px-3 py-2.5">{athlete.distance ? DISTANCE_LABEL[athlete.distance] : '–'}</td>
                    <td className="px-3 py-2.5 text-ink-2">{coachName ?? '–'}</td>
                    <td className="px-3 py-2.5">
                      {nextRace ? (
                        <>
                          {nextRace.name} <span className="text-sm text-ink-3">le {formatDateShort(nextRace.date)}, objectif {nextRace.priority}</span>
                        </>
                      ) : (
                        <span className="text-ink-3">Aucun</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tnum">{athlete.ftpW ? `${athlete.ftpW} W` : '–'}</td>
                    <td className="px-3 py-2.5 text-right tnum">{athlete.runThresholdPaceS ? `${formatPace(athlete.runThresholdPaceS)} /km` : '–'}</td>
                    <td className="px-3 py-2.5 text-right tnum">{athlete.swimCssS ? `${formatPace(athlete.swimCssS)} /100 m` : '–'}</td>
                    <td className="px-4 py-2.5">
                      {connections.length > 0 ? (
                        <ul className="space-y-0.5">
                          {connections.map((connection) => (
                            <li key={connection.id}>
                              {PROVIDER_LABELS[connection.provider] ?? connection.provider}{' '}
                              <span className={`text-sm ${connection.status === 'active' ? 'text-ink-3' : 'font-medium text-critical-ink'}`}>{connection.status === 'active' ? syncAge(connection.lastSyncAt) : 'à reconnecter'}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="font-medium text-warning-ink">Aucune source</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
