import type { Metadata } from 'next';
import Link from 'next/link';
import { MessageDraft } from '@/components/message-draft';
import { ReviewToggle } from '@/components/review-toggle';
import { StatusBadge } from '@/components/status';
import { WeekNav } from '@/components/week-nav';
import { isoWeekNumber } from '@/core/dates';
import { getWeekReview } from '@/server/analysis';
import { requireUser } from '@/server/auth';
import { resolveWeek } from '@/server/week';

export const metadata: Metadata = { title: 'Retours aux athlètes' };

/**
 * Tous les retours de la semaine sur une page : le coach relit, ajuste et envoie
 * à la suite, sans ouvrir chaque fiche.
 */
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ week?: string; coach?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const { today, week, currentWeek, defaultWeek } = resolveWeek(params.week, user.org.timezone);
  const mine = params.coach === 'moi';
  const all = (await getWeekReview(user.org.id, week, today)).filter((row) => !mine || row.athlete.coachId === user.id);
  const pending = all.filter((row) => !row.review?.reviewedAt);
  const done = all.length - pending.length;
  const weekQuery = week === defaultWeek ? '' : `week=${week}`;
  const href = (w: string, coach: boolean) => {
    const query = [w === defaultWeek ? '' : `week=${w}`, coach ? 'coach=moi' : ''].filter(Boolean).join('&');
    return query ? `/retours?${query}` : '/retours';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-ink-3">Retours aux athlètes</p>
          <h1 className="text-2xl sm:text-3xl">{pending.length > 0 ? `${pending.length} retour${pending.length > 1 ? 's' : ''} à envoyer` : 'Tous les retours sont faits'}</h1>
          <p className="mt-1 text-ink-2">
            Chaque brouillon est rédigé à partir de l’analyse. Relisez, ajustez, envoyez, puis marquez la semaine comme revue.{done > 0 ? ` ${done} déjà fait${done > 1 ? 's' : ''}.` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={href(week, !mine)} className="btn" aria-pressed={mine}>
            {mine ? 'Tous les athlètes' : 'Mes athlètes'}
          </Link>
          <WeekNav weekStart={week} currentWeek={currentWeek} hrefFor={(w) => href(w, mine)} isPartial={all[0]?.analysis.isPartial ?? week === currentWeek} />
        </div>
      </div>

      {all.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="font-medium">Aucun athlète à qui écrire.</p>
          <p className="mx-auto mt-1 max-w-sm text-ink-2">Les brouillons apparaissent ici dès qu’un athlète a une semaine analysée.</p>
        </div>
      ) : pending.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="font-medium">La semaine {isoWeekNumber(week)} est bouclée.</p>
          <Link href={weekQuery ? `/?${weekQuery}` : '/'} className="btn mt-4">
            Revenir à la revue
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {pending.map(({ athlete, analysis }) => {
            const name = `${athlete.firstName} ${athlete.lastName}`;
            return (
              <li key={athlete.id} className="panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg">
                      <Link href={`/athletes/${athlete.id}${weekQuery ? `?${weekQuery}` : ''}`} className="hover:underline">
                        {name}
                      </Link>
                    </h2>
                    <p className="text-sm text-ink-2">{analysis.headline}</p>
                  </div>
                  <StatusBadge status={analysis.status} />
                </div>
                <div className="mt-3">
                  <MessageDraft id={`message-${athlete.id}`} initial={analysis.message} email={athlete.email} subject={`Bilan de ta semaine ${isoWeekNumber(week)}`} compact />
                </div>
                <div className="mt-3 border-t border-line pt-3">
                  <ReviewToggle athleteId={athlete.id} weekStart={week} reviewed={false} name={name} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
