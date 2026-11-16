import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { validateOnTrack } from '@/app/actions';
import { LoadBar, Meter, Sparkbars } from '@/components/charts/mini';
import { CopyText } from '@/components/copy-text';
import { ReviewToggle } from '@/components/review-toggle';
import { STATUS_LABEL, StatusIcon } from '@/components/status';
import { WeekNav } from '@/components/week-nav';
import { buildDigest, TREND_LABEL } from '@/core/digest';
import { formatDuration, formatInt, formatPct, formatSigned } from '@/core/format';
import { TRI_SPORTS, type WeekStatus } from '@/core/types';
import { SportMark } from '@/components/sport';
import { getWeekReview, type AthleteWeek } from '@/server/analysis';
import { requireUser } from '@/server/auth';
import { DISTANCE_LABEL, resolveWeek } from '@/server/week';

export const metadata: Metadata = { title: 'Revue de la semaine' };

type Params = { week?: string; statut?: string; coach?: string; q?: string };

const STATUSES: WeekStatus[] = ['action', 'watch', 'ok'];
const GROUP_HINT: Record<WeekStatus, string> = {
  action: 'Une décision de votre part est attendue avant la semaine prochaine.',
  watch: 'Un signal à garder en tête au moment de valider le plan.',
  ok: 'Semaine conforme : le plan peut se dérouler tel quel.',
};

function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const params = await searchParams;
  const { today, week, currentWeek, defaultWeek } = resolveWeek(params.week, user.org.timezone);
  const all = await getWeekReview(user.org.id, week, today);

  const status = STATUSES.includes(params.statut as WeekStatus) ? (params.statut as WeekStatus) : null;
  const mine = params.coach === 'moi';
  const query = (params.q ?? '').trim();

  const href = (changes: Partial<Params>) => {
    const next = { week: week === defaultWeek ? undefined : week, statut: status ?? undefined, coach: mine ? 'moi' : undefined, q: query || undefined, ...changes };
    const search = new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => Boolean(e[1])));
    return search.size ? `/?${search}` : '/';
  };

  const scoped = all.filter((row) => (!mine || row.athlete.coachId === user.id) && (!query || normalize(`${row.athlete.firstName} ${row.athlete.lastName}`).includes(normalize(query))));
  const counts = { action: 0, watch: 0, ok: 0 };
  for (const row of scoped) counts[row.analysis.status]++;
  const visible = status ? scoped.filter((row) => row.analysis.status === status) : scoped;
  const reviewed = scoped.filter((row) => row.review?.reviewedAt).length;
  const digest = buildDigest(scoped.map((row) => ({ name: `${row.athlete.firstName} ${row.athlete.lastName}`, analysis: row.analysis, trend: row.trend })), week, user.org.name);
  const pendingOnTrack = all.filter((row) => row.analysis.status === 'ok' && !row.review?.reviewedAt).length;
  const isPartial = all[0]?.analysis.isPartial ?? week === currentWeek;

  if (all.length === 0) {
    return (
      <div className="panel mx-auto mt-10 max-w-xl p-8 text-center">
        <h1 className="text-xl">Aucun athlète pour l’instant</h1>
        <p className="mx-auto mt-2 max-w-sm text-ink-2">Ajoutez un premier athlète et connectez sa plateforme d’entraînement : sa semaine apparaîtra ici, déjà analysée.</p>
        <Link href="/athletes/nouveau" className="btn btn-primary mt-5">
          <Plus size={16} aria-hidden="true" />
          Ajouter un athlète
        </Link>
      </div>
    );
  }

  const headline =
    counts.action > 0
      ? `${counts.action} athlète${counts.action > 1 ? 's demandent' : ' demande'} une action`
      : counts.watch > 0
        ? `Aucune urgence, ${counts.watch} athlète${counts.watch > 1 ? 's' : ''} à surveiller`
        : 'Tout le groupe est sur les rails';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-ink-3">Revue de la semaine</p>
          <h1 className="text-2xl sm:text-3xl">{headline}</h1>
        </div>
        <WeekNav weekStart={week} currentWeek={currentWeek} hrefFor={(w) => href({ week: w === defaultWeek ? undefined : w })} isPartial={isPartial} />
      </div>

      <section className="panel grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" aria-labelledby="synthese">
        <div className="p-5">
          <h2 id="synthese" className="text-lg">
            Synthèse du groupe
          </h2>
          <ul className="mt-2 space-y-1.5 text-ink-2">
            <li>
              <span className="font-medium text-ink">{formatDuration(digest.durationS)}</span> d’entraînement{digest.plannedDurationS > 0 ? ` sur ${formatDuration(digest.plannedDurationS)} prévues` : ''}, <span className="font-medium text-ink">{digest.sessionsDone}</span> séances
              {digest.sessionsPlanned > 0 ? ` sur ${digest.sessionsPlanned}` : ''}
              {digest.completion !== null ? ` (${formatPct(digest.completion)})` : ''}.
            </li>
            {digest.changes.length > 0 ? <li>Depuis la semaine dernière : {digest.changes.join(', ')}.</li> : null}
            {digest.races.length > 0 ? (
              <li>
                Échéances sous 14 jours : {digest.races.map((r) => `${r.name} (${r.race}, dans ${r.daysTo} j)`).join(', ')}.
              </li>
            ) : null}
            {digest.dataGaps.length > 0 ? (
              <li>
                Données incomplètes : {digest.dataGaps.map((g) => `${g.name} (${g.reason})`).join(', ')}.
              </li>
            ) : null}
          </ul>
        </div>
        <div className="no-print flex flex-col justify-center gap-3 border-t border-line p-5 lg:border-l lg:border-t-0">
          {pendingOnTrack > 0 ? (
            <form action={validateOnTrack}>
              <input type="hidden" name="weekStart" value={week} />
              <button type="submit" className="btn btn-primary w-full">
                Valider les {pendingOnTrack} athlètes sur les rails
              </button>
              <p className="mt-1.5 text-sm text-ink-3">Aucun signal chez eux : il ne vous reste que les cas qui demandent votre regard.</p>
            </form>
          ) : (
            <p className="text-ink-2">Tous les athlètes sur les rails sont validés.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <CopyText text={digest.text} label="Copier la synthèse" />
            <Link href={`/retours${week === defaultWeek ? '' : `?week=${week}`}`} className="btn">
              Préparer les retours
            </Link>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line pb-3">
        <nav aria-label="Filtrer par état" className="flex flex-wrap gap-1">
          <FilterTab href={href({ statut: undefined })} active={!status} label="Tous" count={scoped.length} />
          {STATUSES.map((s) => (
            <FilterTab key={s} href={href({ statut: s })} active={status === s} label={STATUS_LABEL[s]} count={counts[s]} status={s} />
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <ul className="hidden items-center gap-3 text-sm text-ink-2 md:flex" aria-label="Couleurs des sports dans la colonne Charge">
            {TRI_SPORTS.map((s) => (
              <li key={s}>
                <SportMark sport={s} />
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-2 tnum" aria-live="polite">
            {reviewed} sur {scoped.length} revus
          </p>
          <Link href={href({ coach: mine ? undefined : 'moi' })} className="btn" aria-pressed={mine} scroll={false}>
            {mine ? 'Tous les athlètes' : 'Mes athlètes'}
          </Link>
          <form action="/" role="search" className="relative">
            {week !== defaultWeek ? <input type="hidden" name="week" value={week} /> : null}
            {status ? <input type="hidden" name="statut" value={status} /> : null}
            {mine ? <input type="hidden" name="coach" value="moi" /> : null}
            <label htmlFor="q" className="sr-only">
              Rechercher un athlète
            </label>
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
            <input id="q" name="q" type="search" defaultValue={query} placeholder="Rechercher un athlète" className="field w-44 pl-8 sm:w-52" />
          </form>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="font-medium">Aucun athlète ne correspond à ces filtres.</p>
          <Link href={href({ statut: undefined, coach: undefined, q: undefined })} className="btn mt-4">
            Réinitialiser les filtres
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {STATUSES.map((s) => {
            const rows = visible.filter((row) => row.analysis.status === s);
            if (rows.length === 0) return null;
            return (
              <section key={s} aria-labelledby={`groupe-${s}`}>
                <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
                  <h2 id={`groupe-${s}`} className="flex items-center gap-2 text-lg">
                    <StatusIcon status={s} size={18} />
                    {STATUS_LABEL[s]}
                    <span className="font-normal text-ink-3 tnum">{rows.length}</span>
                  </h2>
                  <p className="text-sm text-ink-3">{GROUP_HINT[s]}</p>
                </div>
                <div className="panel overflow-x-auto">
                  <table className="w-full border-collapse text-left md:min-w-[60rem]">
                    <thead>
                      <tr className="border-b border-line text-sm text-ink-3">
                        <th scope="col" className="w-[36%] px-4 py-2 font-medium md:w-[19%]">Athlète</th>
                        <th scope="col" className="px-3 py-2 font-medium">Constat</th>
                        <th scope="col" className="hidden w-[15%] px-3 py-2 font-medium md:table-cell">Charge</th>
                        <th scope="col" className="hidden w-[9%] px-3 py-2 font-medium md:table-cell">Fraîcheur</th>
                        <th scope="col" className="hidden w-[10%] px-3 py-2 font-medium md:table-cell">Préparation</th>
                        <th scope="col" className="hidden w-[8%] px-3 py-2 font-medium md:table-cell">8 semaines</th>
                        <th scope="col" className="w-12 px-3 py-2 font-medium">
                          <span className="sr-only">Revue</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <ReviewRow key={row.athlete.id} row={row} week={week} isDefaultWeek={week === defaultWeek} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterTab({ href, active, label, count, status }: { href: string; active: boolean; label: string; count: number; status?: WeekStatus }) {
  return (
    <Link href={href} scroll={false} aria-current={active ? 'true' : undefined} className={`btn ${active ? 'btn-primary' : 'btn-quiet'}`}>
      {status && !active ? <StatusIcon status={status} size={14} /> : null}
      {label}
      <span className={`tnum ${active ? 'opacity-80' : 'text-ink-3'}`}>{count}</span>
    </Link>
  );
}

function ReviewRow({ row, week, isDefaultWeek }: { row: AthleteWeek; week: string; isDefaultWeek: boolean }) {
  const { athlete, analysis: a, review, trend } = row;
  const name = `${athlete.firstName} ${athlete.lastName}`;
  const detailHref = `/athletes/${athlete.id}${isDefaultWeek ? '' : `?week=${week}`}`;
  const others = a.insights.filter((i) => i.severity === 'critical' || i.severity === 'warning').length - 1;
  const reviewed = Boolean(review?.reviewedAt);
  const race = a.nextRace && a.nextRace.daysTo <= 70 ? `${a.nextRace.name} dans ${a.nextRace.daysTo} j` : athlete.distance ? DISTANCE_LABEL[athlete.distance] : '';

  return (
    <tr className={`group relative border-b border-line align-top last:border-b-0 hover:bg-sunken ${reviewed ? 'opacity-60 hover:opacity-100' : ''}`}>
      <th scope="row" className="px-4 py-3 text-left font-normal">
        <Link href={detailHref} className="font-medium after:absolute after:inset-0 after:content-['']">
          {name}
        </Link>
        <div className="text-sm text-ink-3">{race}</div>
      </th>
      <td className="px-3 py-3">
        <div className="font-medium">{a.headline}</div>
        <div className="line-clamp-2 text-sm text-ink-2">{a.insights[0]?.detail ?? a.summary}</div>
        {others > 0 || trend ? (
          <div className="mt-0.5 text-sm text-ink-3">
            {[trend ? TREND_LABEL[trend] : null, others > 0 ? `${others} autre${others > 1 ? 's' : ''} signal${others > 1 ? 'ements' : 'ement'}` : null].filter(Boolean).join(', ')}
          </div>
        ) : null}
      </td>
      <td className="hidden px-3 py-3 md:table-cell">
        <div className="tnum">
          <span className="font-medium">{formatInt(a.load.done)}</span>
          {a.load.planned > 0 ? <span className="text-ink-3"> / {formatInt(a.load.planned)}</span> : null}
        </div>
        <div className="mt-1.5">
          <LoadBar bySport={a.load.bySport} done={a.load.done} planned={a.load.planned} />
        </div>
        <div className="mt-1 text-sm text-ink-3 tnum">{a.compliance.loadPct !== null ? `${formatPct(a.compliance.loadPct)} du plan` : 'Sans plan'}</div>
      </td>
      <td className="hidden px-3 py-3 tnum md:table-cell">
        <div className="font-medium">{formatSigned(a.fitness.tsb)}</div>
        <div className="text-sm text-ink-3">CTL {formatInt(a.fitness.ctl)}, {formatSigned(a.fitness.ramp, 1)}</div>
      </td>
      <td className="hidden px-3 py-3 md:table-cell">
        {a.recovery.readiness !== null ? (
          <>
            <div className="tnum">
              <span className="font-medium">{a.recovery.readiness}</span>
              <span className="text-ink-3"> / 100</span>
            </div>
            <div className="mt-1.5">
              <Meter value={a.recovery.readiness} label={`Préparation ${a.recovery.readiness} sur 100`} />
            </div>
          </>
        ) : (
          <span className="text-sm text-ink-3">Pas de données</span>
        )}
      </td>
      <td className="hidden px-3 py-3 md:table-cell">
        <Sparkbars values={a.series.weeks.slice(-8).map((w) => w.load)} label={`Charge des 8 dernières semaines : ${a.series.weeks.slice(-8).map((w) => formatInt(w.load)).join(', ')}`} />
      </td>
      <td className="relative z-10 px-3 py-3">
        <ReviewToggle athleteId={athlete.id} weekStart={week} reviewed={reviewed} name={name} compact />
      </td>
    </tr>
  );
}
