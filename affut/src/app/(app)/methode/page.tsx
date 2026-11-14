import type { Metadata } from 'next';
import { READINESS_WEIGHTS, THRESHOLDS as T } from '@/core/config';
import { formatNumber, formatPct } from '@/core/format';
import { requireUser } from '@/server/auth';

export const metadata: Metadata = { title: 'Méthode' };

const pct = (v: number) => formatPct(v);

export default async function MethodPage() {
  await requireUser();
  const sections: { title: string; intro: string; rows: [string, string, string][] }[] = [
    {
      title: 'Charge',
      intro: 'Chaque séance reçoit une charge sur une échelle commune aux trois sports : 100 points valent une heure au seuil. La méthode la plus fiable disponible est retenue : puissance à vélo, allure en course et en natation, puis fréquence cardiaque, ressenti, et enfin durée.',
      rows: [
        ['Condition (CTL)', `Moyenne exponentielle de la charge quotidienne sur ${T.fitness.ctlDays} jours.`, 'Ce que l’athlète est capable d’encaisser.'],
        ['Fatigue (ATL)', `Même calcul sur ${T.fitness.atlDays} jours.`, 'Ce qu’il vient d’encaisser.'],
        ['Fraîcheur (TSB)', 'Condition moins fatigue.', `Signalée sous ${T.fitness.tsbDeep} ; attendue au-dessus de ${T.fitness.taperTsbMin} à dix jours d’un objectif.`],
        ['Rampe', 'Variation de CTL sur la semaine.', `À surveiller à partir de +${T.fitness.rampWatch}, critique à partir de +${T.fitness.rampHigh}.`],
        ['Ratio aigu / chronique', 'Charge des 7 derniers jours rapportée à la moyenne hebdomadaire des 28 derniers.', `À surveiller à partir de ${formatNumber(T.fitness.acwrWatch, 1)}, élevé à partir de ${formatNumber(T.fitness.acwrHigh, 1)}.`],
        ['Monotonie', 'Charge quotidienne moyenne divisée par son écart-type (Foster).', `Signalée à partir de ${T.rhythm.monotonyHigh} : les journées se ressemblent trop.`],
        ['Volume de course à pied', 'Kilomètres de la semaine comparés à la moyenne et au maximum des 4 semaines précédentes.', `À surveiller à +${Math.round((T.run.spikeWatch - 1) * 100)} %, critique à +${Math.round((T.run.spikeAlert - 1) * 100)} %.`],
      ],
    },
    {
      title: 'Récupération',
      intro: `Chaque marqueur est comparé à la référence propre à l’athlète : sa moyenne des ${T.recovery.baselineDays} jours précédents. Une VFC de 45 ms peut être excellente pour l’un et alarmante pour l’autre.`,
      rows: [
        ['VFC nocturne', 'Moyenne de la semaine, exprimée en écarts-types par rapport à la référence.', `À surveiller à ${formatNumber(T.recovery.hrvZWatch, 0)} écart-type, critique à −2.`],
        ['FC de repos', 'Écart de la moyenne de la semaine à la référence.', `Signalée à partir de +${T.recovery.rhrWatch} bpm.`],
        ['Sommeil', 'Durée moyenne par nuit.', `Signalé sous ${formatNumber(T.recovery.sleepWatchH, 1)} h ; une nuit est comptée courte sous ${T.recovery.shortNightH} h.`],
        ['Ressenti', 'Fatigue, courbatures et moral déclarés, de 1 à 5.', `Fatigue signalée à partir de ${formatNumber(T.recovery.subjectiveWatch, 1)}.`],
        ['Indice de préparation', `Combinaison pondérée : VFC ${pct(READINESS_WEIGHTS.hrv)}, sommeil ${pct(READINESS_WEIGHTS.sleep)}, fraîcheur ${pct(READINESS_WEIGHTS.form)}, FC de repos ${pct(READINESS_WEIGHTS.rhr)}, ressenti ${pct(READINESS_WEIGHTS.subjective)}.`, 'De 0 à 100. Non calculé sans au moins deux marqueurs de récupération.'],
      ],
    },
    {
      title: 'Plan, intensité et régularité',
      intro: 'Les séances réalisées sont rapprochées des séances prévues : même sport le même jour, ou à un jour près pour une séance décalée.',
      rows: [
        ['Conformité', 'Charge réalisée rapportée à la charge prévue.', `Incomplète sous ${pct(T.compliance.lowPct)}, très incomplète sous ${pct(T.compliance.veryLowPct)}, au-delà du plan au-dessus de ${pct(T.compliance.overPct)}.`],
        ['Séances clés', 'Séances marquées comme prioritaires dans le plan.', 'Toute séance clé manquée est signalée, même si la semaine est remplie par ailleurs.'],
        ['Endurance trop rapide', 'Séances faciles de plus de 40 min réalisées au-dessus de l’intensité cible.', `Signalé à partir de deux séances au-dessus de ${pct(T.compliance.easyMaxIf)} du seuil.`],
        ['Répartition de l’intensité', 'Temps en endurance (zones 1 et 2), en zone intermédiaire (3 et 4) et en haute intensité (5).', `Signalée quand la zone intermédiaire dépasse ${pct(T.distribution.moderateMax)} et l’endurance passe sous ${pct(T.distribution.lowMin)}.`],
        ['Régularité', 'Part des séances prévues réalisées sur 4 semaines.', `Signalée sous ${pct(T.compliance.fourWeekLowPct)}. Un sport est dit délaissé sous 40 % sur 3 semaines.`],
        ['Athlète silencieux', 'Aucune séance ni donnée de récupération reçue.', `Signalé après ${T.data.silentDays} jours alors que des séances étaient prévues.`],
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <div>
        <p className="text-sm text-ink-3">Méthode</p>
        <h1 className="text-2xl sm:text-3xl">Comment chaque semaine est analysée</h1>
        <p className="mt-3 max-w-2xl text-lg text-ink-2">Aucune boîte noire : chaque alerte vient d’une règle écrite, avec un seuil que vous pouvez lire ici. L’analyse éclaire votre décision, elle ne la prend pas.</p>
      </div>

      <section aria-labelledby="etats">
        <h2 id="etats" className="mb-2 text-lg">
          Les trois états
        </h2>
        <dl className="panel divide-y divide-line">
          {[
            ['Action requise', 'Au moins un constat critique : surcharge non absorbée, signes de maladie, athlète silencieux, hausse brutale du volume de course, fraîcheur insuffisante avant un objectif.'],
            ['À surveiller', 'Au moins un signal isolé : sommeil, VFC, semaine incomplète, monotonie, intensité mal répartie, sport délaissé.'],
            ['Sur les rails', 'Aucun signal. Les constats positifs (progression assimilée, affûtage conforme) sont affichés pour nourrir votre retour à l’athlète.'],
          ].map(([term, definition]) => (
            <div key={term} className="grid gap-1 p-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
              <dt className="font-medium">{term}</dt>
              <dd className="text-ink-2">{definition}</dd>
            </div>
          ))}
        </dl>
      </section>

      {sections.map((section) => (
        <section key={section.title} aria-labelledby={`s-${section.title}`}>
          <h2 id={`s-${section.title}`} className="text-lg">
            {section.title}
          </h2>
          <p className="mb-3 mt-1 max-w-3xl text-ink-2">{section.intro}</p>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-line text-sm text-ink-3">
                  <th scope="col" className="w-[22%] px-4 py-2 font-medium">Indicateur</th>
                  <th scope="col" className="w-[39%] px-3 py-2 font-medium">Calcul</th>
                  <th scope="col" className="px-4 py-2 font-medium">Repères</th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map(([name, how, marks]) => (
                  <tr key={name} className="border-b border-line align-top last:border-0">
                    <th scope="row" className="px-4 py-2.5 font-medium">{name}</th>
                    <td className="px-3 py-2.5 text-ink-2">{how}</td>
                    <td className="px-4 py-2.5 text-ink-2">{marks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section aria-labelledby="semaine-suivante">
        <h2 id="semaine-suivante" className="text-lg">
          La fourchette conseillée pour la semaine suivante
        </h2>
        <div className="panel mt-2 space-y-2 p-5 text-ink-2">
          <p>Elle part de la condition actuelle et de la variation de CTL visée : −4 à −2 pour récupérer, autour de 0 pour stabiliser, +2 à +4 pour progresser. À l’approche d’un objectif A ou B, elle devient une part de la charge habituelle : deux tiers à deux semaines, la moitié la semaine de course.</p>
          <p>Si un plan existe déjà pour la semaine suivante, il est comparé à cette fourchette, et l’écart est chiffré.</p>
        </div>
      </section>

      <section aria-labelledby="limites">
        <h2 id="limites" className="text-lg">
          Ce que l’analyse ne sait pas
        </h2>
        <ul className="panel mt-2 list-disc space-y-1.5 p-5 pl-9 text-ink-2">
          <li>Elle ne pose aucun diagnostic médical : une VFC en chute appelle une conversation, pas une conclusion.</li>
          <li>Les seuils de l’athlète conditionnent tout : des seuils périmés faussent la charge. L’analyse le signale quand les séances dépassent durablement les seuils déclarés.</li>
          <li>Le ratio aigu / chronique et la monotonie sont des repères discutés dans la littérature : ils comptent ici comme un signal parmi d’autres, jamais seuls pour un constat critique.</li>
          <li>Avant 4 semaines d’historique, la condition et les tendances sont indicatives.</li>
        </ul>
      </section>
    </div>
  );
}
