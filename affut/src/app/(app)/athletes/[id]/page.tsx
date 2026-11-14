import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Star } from 'lucide-react';
import { LineChart } from '@/components/charts/line-chart';
import { Meter, Sparkline } from '@/components/charts/mini';
import { WeeklyLoadChart } from '@/components/charts/weekly-load-chart';
import { MessageDraft } from '@/components/message-draft';
import { NoteForm } from '@/components/note-form';
import { ReviewToggle } from '@/components/review-toggle';
import { SportMark } from '@/components/sport';
import { SeverityIcon, StatusBadge } from '@/components/status';
import { WeekNav } from '@/components/week-nav';
import { addDays, isoWeekNumber } from '@/core/dates';
import { formatDay, formatDistance, formatDuration, formatInt, formatNumber, formatPct, formatSigned, KIND_LABEL } from '@/core/format';
import { TRI_SPORTS, type SessionRow, type WeeklyAnalysis } from '@/core/types';
import { getAthleteWeek, getWeekReview } from '@/server/analysis';
import { requireUser } from '@/server/auth';
import { DISTANCE_LABEL, resolveWeek } from '@/server/week';

export const metadata: Metadata = { title: 'Fiche athlète' };

const STATE_LABEL: Record<SessionRow['state'], string> = { done: 'Réalisée', missed: 'Manquée', unplanned: 'Hors plan', upcoming: 'À venir' };
const PLAN_VERDICT = { above: 'au-dessus de la fourchette', within: 'dans la fourchette', below: 'sous la fourchette', none: '' } as const;

export default async function AthletePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ week?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { today, week, currentWeek, defaultWeek } = resolveWeek((await searchParams).week, user.org.timezone);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [data, queue] = await Promise.all([getAthleteWeek(user.org.id, id, week, today), getWeekReview(user.org.id, week, today)]);
  if (!data) notFound();
  const { athlete, analysis: a, review } = data;

  const weekQuery = week === defaultWeek ? '' : `?week=${week}`;
  const position = queue.findIndex((row) => row.athlete.id === id);
  const previous = position > 0 ? queue[position - 1] : null;
  const following = position >= 0 && position < queue.length - 1 ? queue[position + 1] : null;
  const nextToReview = [...queue.slice(position + 1), ...queue.slice(0, Math.max(0, position))].find((row) => !row.review?.reviewedAt);
  const reviewed = Boolean(review?.reviewedAt);
  const name = `${athlete.firstName} ${athlete.lastName}`;
  const focusFrom = a.series.days.findIndex((d) => d.date >= a.weekStart);
  const meta = [athlete.distance ? DISTANCE_LABEL[athlete.distance] : null, athlete.coachName ? `suivi par ${athlete.coachName}` : null, a.nextRace ? `${a.nextRace.name} dans ${a.nextRace.daysTo} jours (objectif ${a.nextRace.priority})` : null].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href={`/${weekQuery}`} className="inline-flex items-center gap-1.5 text-ink-2 hover:text-ink">
          <ArrowLeft size={15} aria-hidden="true" />
          Revue de la semaine
        </Link>
        <div className="flex items-center gap-4 text-ink-2">
          <span className="tnum">
            {position + 1} sur {queue.length}
          </span>
          {previous ? (
            <Link href={`/athletes/${previous.athlete.id}${weekQuery}`} className="inline-flex items-center gap-1.5 hover:text-ink">
              <ArrowLeft size={15} aria-hidden="true" />
              {previous.athlete.firstName} {previous.athlete.lastName}
            </Link>
          ) : null}
          {following ? (
            <Link href={`/athletes/${following.athlete.id}${weekQuery}`} className="inline-flex items-center gap-1.5 hover:text-ink">
              {following.athlete.firstName} {following.athlete.lastName}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl">{name}</h1>
          <p className="mt-1 text-ink-2">{meta.join(', ')}</p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-3">
          <WeekNav weekStart={week} currentWeek={currentWeek} hrefFor={(w) => `/athletes/${id}${w === defaultWeek ? '' : `?week=${w}`}`} isPartial={a.isPartial} />
          <Link href={`/athletes/${id}/profil`} className="btn">
            Profil et seuils
          </Link>
          <ReviewToggle athleteId={id} weekStart={week} reviewed={reviewed} name={name} next={reviewed ? undefined : nextToReview ? `/athletes/${nextToReview.athlete.id}${weekQuery}` : `/${weekQuery}`} />
        </div>
      </div>

      {/* Verdict : ce qu'il faut savoir, puis ce qu'il faut faire */}
      <section className="panel grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" aria-labelledby="verdict">
        <div className="p-5">
          <StatusBadge status={a.status} />
          <h2 id="verdict" className="mt-3 text-xl">
            {a.headline}
          </h2>
          <p className="mt-1 text-ink-2">{capitalize(a.summary)}</p>
          <ul className="mt-4 space-y-3">
            {a.insights.map((insight) => (
              <li key={insight.code} className="flex gap-2.5">
                <SeverityIcon severity={insight.severity} />
                <div className="min-w-0">
                  <div className="font-medium">{insight.title}</div>
                  <div className="text-ink-2">{insight.detail}</div>
                </div>
              </li>
            ))}
          </ul>
          {a.insights.length === 0 ? <p className="mt-4 text-ink-2">Aucun signal particulier cette semaine.</p> : null}
        </div>
        <div className="border-t border-line p-5 lg:border-l lg:border-t-0">
          <p className="text-sm text-ink-3">Pour la semaine {isoWeekNumber(addDays(a.weekStart, 7))}</p>
          <h2 className="text-xl">{a.recommendation.label}</h2>
          <p className="mt-3 text-2xl font-semibold">
            {formatInt(a.recommendation.targetLoad[0])} à {formatInt(a.recommendation.targetLoad[1])}
            <span className="ml-1.5 text-base font-normal text-ink-2">points de charge</span>
          </p>
          {a.recommendation.plannedNextLoad !== null && a.recommendation.planVerdict !== 'none' ? (
            <p className="mt-1 text-ink-2">
              Plan actuel : <span className="font-medium text-ink tnum">{formatInt(a.recommendation.plannedNextLoad)}</span>, {PLAN_VERDICT[a.recommendation.planVerdict]}.
            </p>
          ) : null}
          <p className="mt-3 text-ink-2">{a.recommendation.rationale}</p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            {a.recommendation.actions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Chiffres de la semaine */}
      <dl className="panel grid grid-cols-2 divide-line sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
        <Stat label="Charge" value={formatInt(a.load.done)} hint={a.load.planned > 0 ? `${formatPct(a.compliance.loadPct ?? 0)} des ${formatInt(a.load.planned)} prévus` : 'sans plan'} />
        <Stat label="Volume" value={formatDuration(a.load.durationS)} hint={a.load.plannedDurationS > 0 ? `sur ${formatDuration(a.load.plannedDurationS)} prévues` : `${a.rhythm.trainingDays} jours actifs`} />
        <Stat label="Condition (CTL)" value={formatInt(a.fitness.ctl)} hint={`${formatSigned(a.fitness.ramp, 1)} sur la semaine`} />
        <Stat label="Fraîcheur (TSB)" value={formatSigned(a.fitness.tsb)} hint={`fatigue (ATL) ${formatInt(a.fitness.atl)}`} />
        <Stat label="Aigu / chronique" value={a.fitness.acwr === null ? '–' : formatNumber(a.fitness.acwr, 2)} hint="7 jours sur 28 jours" />
        <Stat label="Séances" value={`${a.compliance.sessionsDone} / ${a.compliance.sessionsPlanned}`} hint={a.compliance.keyPlanned > 0 ? `clés : ${a.compliance.keyDone} sur ${a.compliance.keyPlanned}` : `${a.rhythm.restDays} jour${a.rhythm.restDays > 1 ? 's' : ''} de repos`} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="panel p-5" aria-labelledby="charge">
            <h2 id="charge" className="text-lg">
              Charge hebdomadaire
            </h2>
            <p className="mb-3 text-sm text-ink-3">Douze dernières semaines, par sport, comparées au plan.</p>
            <WeeklyLoadChart
              weeks={a.series.weeks.map((w) => ({ weekStart: w.weekStart, weekNumber: isoWeekNumber(w.weekStart), planned: Math.round(w.planned), swim: Math.round(w.bySport.swim), bike: Math.round(w.bySport.bike), run: Math.round(w.bySport.run), other: Math.round(w.bySport.strength + w.bySport.other) }))}
            />
          </section>

          <section className="panel p-5" aria-labelledby="forme">
            <h2 id="forme" className="text-lg">
              Condition et fatigue
            </h2>
            <p className="mb-3 text-sm text-ink-3">Charge chronique sur 42 jours et charge aiguë sur 7 jours. La semaine analysée est sur fond gris.</p>
            <LineChart
              title="Condition (CTL) et fatigue (ATL) sur 12 semaines"
              dates={a.series.days.map((d) => d.date)}
              focusFrom={focusFrom >= 0 ? focusFrom : undefined}
              series={[
                { key: 'ctl', label: 'Condition (CTL)', color: 'var(--fitness)', values: a.series.days.map((d) => d.ctl) },
                { key: 'atl', label: 'Fatigue (ATL)', color: 'var(--fatigue)', values: a.series.days.map((d) => d.atl) },
              ]}
            />
            <h3 className="mt-5 font-semibold">Fraîcheur (TSB)</h3>
            <p className="mb-2 text-sm text-ink-3">Condition moins fatigue. Sous −30, la fatigue aiguë devient difficile à absorber.</p>
            <LineChart
              title="Fraîcheur (TSB) sur 12 semaines"
              dates={a.series.days.map((d) => d.date)}
              focusFrom={focusFrom >= 0 ? focusFrom : undefined}
              height={150}
              format="signed"
              zeroLine
              series={[{ key: 'tsb', label: 'Fraîcheur', color: 'var(--ink-2)', values: a.series.days.map((d) => d.tsb), area: true }]}
            />
          </section>
        </div>

        <div className="space-y-6">
          <Recovery a={a} />

          <section className="panel p-5" aria-labelledby="intensite">
            <h2 id="intensite" className="text-lg">
              Répartition de l’intensité
            </h2>
            {a.distribution ? <Distribution d={a.distribution} easyTooHard={a.compliance.easyTooHard} monotony={a.rhythm.monotony} /> : <p className="mt-2 text-sm text-ink-3">Aucun temps par zone transmis par la plateforme cette semaine.</p>}
          </section>

          <section className="panel p-5" aria-labelledby="sports">
            <h2 id="sports" className="text-lg">
              Par sport
            </h2>
            <table className="mt-2 w-full text-left tnum">
              <thead>
                <tr className="border-b border-line text-sm text-ink-3">
                  <th scope="col" className="py-1.5 font-medium">Sport</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Durée</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Distance</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Charge</th>
                </tr>
              </thead>
              <tbody>
                {TRI_SPORTS.map((s) => (
                  <tr key={s} className="border-b border-line last:border-0">
                    <th scope="row" className="py-1.5 font-normal">
                      <SportMark sport={s} />
                    </th>
                    <td className="py-1.5 text-right">{a.load.bySport[s].durationS ? formatDuration(a.load.bySport[s].durationS) : '–'}</td>
                    <td className="py-1.5 text-right">{a.load.bySport[s].distanceM ? formatDistance(a.load.bySport[s].distanceM, s) : '–'}</td>
                    <td className="py-1.5 text-right">
                      <span className="font-medium">{formatInt(a.load.bySport[s].load)}</span>
                      {a.load.plannedBySport[s].load > 0 ? <span className="text-ink-3"> / {formatInt(a.load.plannedBySport[s].load)}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {a.run.ratio !== null && a.run.baselineKm !== null ? (
              <p className="mt-3 text-sm text-ink-2">
                Course à pied : {formatNumber(a.run.km, 0)} km contre {formatNumber(a.run.baselineKm, 0)} km en moyenne sur 4 semaines.
              </p>
            ) : null}
          </section>
        </div>
      </div>

      <section className="panel" aria-labelledby="seances">
        <div className="p-5 pb-3">
          <h2 id="seances" className="text-lg">
            Séances de la semaine
          </h2>
        </div>
        {a.sessions.length === 0 ? (
          <p className="px-5 pb-5 text-ink-2">Aucune séance prévue ni réalisée cette semaine. Si l’athlète s’entraîne, vérifiez sa connexion dans son profil.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left">
              <thead>
                <tr className="border-y border-line text-sm text-ink-3">
                  <th scope="col" className="px-5 py-2 font-medium">Jour</th>
                  <th scope="col" className="px-3 py-2 font-medium">Sport</th>
                  <th scope="col" className="px-3 py-2 font-medium">Séance</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Prévu</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Réalisé</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Charge</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Intensité</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">FC moy.</th>
                  <th scope="col" className="px-5 py-2 font-medium">État</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {a.sessions.map((s, index) => (
                  <tr key={`${s.date}-${s.title}-${index}`} className={`border-b border-line last:border-0 ${s.state === 'upcoming' ? 'text-ink-3' : ''}`}>
                    <td className="whitespace-nowrap px-5 py-2">{capitalize(formatDay(s.date))}</td>
                    <td className="px-3 py-2">
                      <SportMark sport={s.sport} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        {s.title}
                        {s.isKey ? <Star size={13} className="shrink-0 text-ink-3" role="img" aria-label="Séance clé" /> : null}
                      </span>
                      {s.kind ? <span className="ml-2 text-sm text-ink-3">{KIND_LABEL[s.kind]}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right">{s.plannedDurationS ? formatDuration(s.plannedDurationS) : '–'}</td>
                    <td className="px-3 py-2 text-right">
                      {s.durationS ? formatDuration(s.durationS) : '–'}
                      {s.distanceM ? <span className="ml-2 text-sm text-ink-3">{formatDistance(s.distanceM, s.sport)}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {s.load !== null ? <span className="font-medium">{formatInt(s.load)}</span> : '–'}
                      {s.plannedLoad !== null ? <span className="text-ink-3"> / {formatInt(s.plannedLoad)}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right">{s.intensityFactor !== null ? formatPct(s.intensityFactor) : '–'}</td>
                    <td className="px-3 py-2 text-right">{s.avgHr ?? '–'}</td>
                    <td className={`whitespace-nowrap px-5 py-2 ${s.state === 'missed' ? 'font-medium text-critical-ink' : s.state === 'unplanned' ? 'text-warning-ink' : ''}`}>{STATE_LABEL[s.state]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-line px-5 py-2.5 text-sm text-ink-3">Intensité : en pourcentage du seuil de l’athlète (FTP, allure seuil ou CSS). L’étoile marque une séance clé.</p>
      </section>

      <div className="no-print grid gap-6 lg:grid-cols-2">
        <section className="panel p-5" aria-labelledby="retour">
          <h2 id="retour" className="text-lg">
            Retour à l’athlète
          </h2>
          <p className="mb-3 text-sm text-ink-3">Brouillon rédigé à partir de l’analyse. Relisez, ajustez, puis copiez-le dans votre messagerie.</p>
          <MessageDraft key={`${id}-${week}`} initial={a.message} />
        </section>
        <section className="panel p-5" aria-labelledby="note">
          <h2 id="note" className="text-lg">
            Note du coach
          </h2>
          <p className="mb-3 text-sm text-ink-3">Privée, rattachée à cette semaine, visible par les coachs de votre structure.</p>
          <NoteForm key={`${id}-${week}`} athleteId={id} weekStart={week} note={review?.note ?? ''} />
        </section>
      </div>
    </div>
  );
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="border-b border-line p-4 lg:border-b-0">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold">{value}</dd>
      <dd className="text-sm text-ink-2 tnum">{hint}</dd>
    </div>
  );
}

function Recovery({ a }: { a: WeeklyAnalysis }) {
  const r = a.recovery;
  const series = a.series.wellness;
  const band = (m: { baseline: number | null; sd: number | null }): [number, number] | undefined => (m.baseline !== null && m.sd !== null ? [m.baseline - m.sd, m.baseline + m.sd] : undefined);
  return (
    <section className="panel p-5" aria-labelledby="recuperation">
      <h2 id="recuperation" className="text-lg">
        Récupération
      </h2>
      {r.readiness === null ? (
        <p className="mt-2 text-sm text-ink-2">Pas assez de données de récupération cette semaine ({r.loggedDays} jour{r.loggedDays > 1 ? 's' : ''} sur 7). Une montre qui mesure la VFC nocturne ou un court questionnaire quotidien suffit.</p>
      ) : (
        <>
          <p className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold">{r.readiness}</span>
            <span className="text-ink-2">/ 100, indice de préparation</span>
          </p>
          <ul className="mt-3 space-y-2">
            {r.components.map((c) => (
              <li key={c.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2rem] items-center gap-2 text-sm">
                <span className="text-ink-2">{c.label}</span>
                <Meter value={c.score} label={`${c.label} : ${c.score} sur 100`} />
                <span className="text-right tnum">{c.score}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <dl className="mt-4 divide-y divide-line border-t border-line">
        <Vital label="VFC nocturne" value={r.hrv.week !== null ? `${formatInt(r.hrv.week)} ms` : '–'} reference={r.hrv.baseline !== null ? `habituellement ${formatInt(r.hrv.baseline)}` : 'référence en cours de calcul'}>
          <Sparkline values={series.map((d) => d.hrv)} band={band(r.hrv)} label="VFC nocturne sur 6 semaines, avec la plage habituelle" />
        </Vital>
        <Vital label="FC de repos" value={r.restingHr.week !== null ? `${formatInt(r.restingHr.week)} bpm` : '–'} reference={r.restingHr.delta !== null ? `${formatSigned(r.restingHr.delta)} par rapport à la référence` : 'référence en cours de calcul'}>
          <Sparkline values={series.map((d) => d.restingHr)} band={band(r.restingHr)} label="FC de repos sur 6 semaines, avec la plage habituelle" />
        </Vital>
        <Vital label="Sommeil" value={r.sleep.week !== null ? formatDuration(r.sleep.week * 3600) : '–'} reference={r.sleep.shortNights > 0 ? `${r.sleep.shortNights} nuit${r.sleep.shortNights > 1 ? 's' : ''} sous 6 h` : 'par nuit en moyenne'}>
          <Sparkline values={series.map((d) => d.sleepH)} band={band(r.sleep)} label="Durée de sommeil sur 6 semaines, avec la plage habituelle" />
        </Vital>
        <Vital label="Ressenti" value={r.fatigue !== null ? `${formatNumber(r.fatigue)} / 5` : '–'} reference={r.fatigue !== null ? `fatigue ; courbatures ${r.soreness !== null ? formatNumber(r.soreness) : '–'}, moral ${r.mood !== null ? formatNumber(r.mood) : '–'}` : 'aucun questionnaire rempli'} />
      </dl>
      <p className="mt-3 text-sm text-ink-3">La bande claire couvre la plage habituelle de l’athlète sur les 28 jours précédents.</p>
    </section>
  );
}

function Vital({ label, value, reference, children }: { label: string; value: string; reference: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <dt className="text-sm text-ink-3">{label}</dt>
        <dd className="font-medium tnum">{value}</dd>
        <dd className="text-sm text-ink-2 tnum">{reference}</dd>
      </div>
      {children}
    </div>
  );
}

function Distribution({ d, easyTooHard, monotony }: { d: NonNullable<WeeklyAnalysis['distribution']>; easyTooHard: number; monotony: number | null }) {
  const parts = [
    { key: 'low', label: 'Endurance', hint: 'zones 1 et 2', share: d.low, fill: 'var(--zone-low)', ink: 'var(--zone-low-ink)' },
    { key: 'moderate', label: 'Intermédiaire', hint: 'zones 3 et 4', share: d.moderate, fill: 'var(--zone-mid)', ink: 'var(--zone-mid-ink)' },
    { key: 'high', label: 'Haute intensité', hint: 'zone 5', share: d.high, fill: 'var(--zone-high)', ink: 'var(--zone-high-ink)' },
  ];
  return (
    <>
      <div className="mt-3 flex h-7 gap-0.5" role="img" aria-label={parts.map((p) => `${p.label} ${formatPct(p.share)}`).join(', ')}>
        {parts
          .filter((p) => p.share > 0)
          .map((p) => (
            <div key={p.key} className="flex min-w-0 items-center rounded-[4px] px-1.5 text-sm font-medium tnum" style={{ flexGrow: p.share, flexBasis: 0, background: p.fill, color: p.ink }}>
              {p.share >= 0.12 ? formatPct(p.share) : ''}
            </div>
          ))}
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: p.fill }} aria-hidden="true" />
            <span>{p.label}</span>
            <span className="text-ink-3">{p.hint}</span>
            <span className="ml-auto tnum">{formatPct(p.share)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-ink-2">
        {easyTooHard > 0 ? `${easyTooHard} séance${easyTooHard > 1 ? 's' : ''} facile${easyTooHard > 1 ? 's' : ''} au-dessus de l’intensité cible. ` : ''}
        {monotony !== null ? `Monotonie de la semaine : ${formatNumber(monotony, 1)}.` : ''}
      </p>
    </>
  );
}
