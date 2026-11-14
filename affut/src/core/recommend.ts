import { THRESHOLDS as T } from './config';
import { formatInt } from './format';
import type { Insight, Phase, Race, Recommendation, RecommendationMode } from './types';

const LABELS: Record<RecommendationMode, string> = {
  recover: 'Récupérer',
  ease: 'Alléger',
  maintain: 'Stabiliser',
  progress: 'Progresser',
  taper: 'Affûter',
  race: 'Semaine de course',
  post_race: 'Récupérer après la course',
  rebuild: 'Reprendre progressivement',
};

/** Part de CTL gagnée en 7 jours pour un écart constant charge quotidienne − CTL. */
const WEEK_GAIN = 1 - (1 - 1 / T.fitness.ctlDays) ** 7;

/** Charge hebdomadaire qui fait varier la CTL de `ramp` points en une semaine. */
export function weeklyLoadForRamp(ctl: number, ramp: number): number {
  return Math.max(0, 7 * (ctl + ramp / WEEK_GAIN));
}

const round5 = (v: number) => Math.round(v / 5) * 5;

export interface RecommendInput {
  phase: Phase;
  ctl: number;
  insights: Insight[];
  /** Course A ou B dans les 14 jours suivant la semaine. */
  nextRace: (Race & { daysTo: number }) | null;
  loadPct: number | null;
  plannedNextLoad: number | null;
  reliable: boolean;
}

export function recommend(input: RecommendInput): Recommendation {
  const { ctl, insights, phase } = input;
  const chronic = ctl * 7;
  const codes = new Set(insights.map((i) => i.code));
  const critical = insights.filter((i) => i.severity === 'critical');
  const warnings = insights.filter((i) => i.severity === 'warning');
  const byRamp = (lo: number, hi: number): [number, number] => [weeklyLoadForRamp(ctl, lo), weeklyLoadForRamp(ctl, hi)];
  const byShare = (lo: number, hi: number): [number, number] => [chronic * lo, chronic * hi];

  let mode: RecommendationMode;
  let range: [number, number];
  let rationale: string;

  const raceSoon = input.nextRace && input.nextRace.priority !== 'C' ? input.nextRace : null;

  if (raceSoon && raceSoon.daysTo <= 7) {
    mode = 'race';
    range = byShare(0.4, 0.55);
    rationale = `${raceSoon.name} dans ${raceSoon.daysTo} jours : volume réduit de moitié hors course, courts rappels d’intensité.`;
  } else if (raceSoon && raceSoon.daysTo <= 14) {
    mode = 'taper';
    range = byShare(0.6, 0.75);
    rationale = `${raceSoon.name} dans ${raceSoon.daysTo} jours : baisser le volume d’un tiers en gardant l’intensité.`;
  } else if (phase === 'race_week') {
    mode = 'post_race';
    range = byShare(0.35, 0.55);
    rationale = 'Semaine qui suit la compétition : récupération active, aucune intensité.';
  } else if (codes.has('illness')) {
    mode = 'recover';
    range = byShare(0.3, 0.5);
    rationale = 'Marqueurs de maladie ou de stress : la reprise dépend du retour de la VFC et de la FC de repos à la normale.';
  } else if (codes.has('no_data')) {
    mode = 'maintain';
    range = byRamp(-1, 1);
    rationale = 'Données manquantes : fourchette calculée sur le dernier état connu, à confirmer avec l’athlète.';
  } else if (critical.some((i) => i.category === 'charge' || i.category === 'recuperation')) {
    mode = 'recover';
    range = byRamp(-4, -2);
    rationale = 'Fatigue non absorbée : une semaine nettement allégée pour relancer l’adaptation.';
  } else if (phase === 'post_race' || codes.has('compliance_low') || codes.has('regularity_low')) {
    mode = 'rebuild';
    range = byShare(0.8, 0.95);
    rationale = phase === 'post_race' ? 'Retour progressif vers la charge habituelle après la récupération.' : 'Revenir à la charge habituelle sans chercher à rattraper les séances manquées.';
  } else if (warnings.some((i) => i.category === 'charge' || i.category === 'recuperation')) {
    mode = 'ease';
    range = byRamp(-1.5, 0.5);
    rationale = 'Signaux de fatigue à surveiller : charge stable ou légèrement réduite.';
  } else if (input.reliable && (phase === 'deload' || ((input.loadPct ?? 1) >= 0.9 && warnings.length === 0))) {
    mode = 'progress';
    range = byRamp(2, 4);
    rationale = phase === 'deload' ? 'Semaine allégée terminée : reprise du bloc de charge.' : 'Charge assimilée : marge pour une progression de 2 à 4 points de CTL.';
  } else {
    mode = 'maintain';
    range = byRamp(0, 2);
    rationale = input.reliable ? 'Consolider le niveau actuel avant de reprendre la progression.' : 'Historique trop court pour prescrire une progression : charge stable.';
  }

  const targetLoad: [number, number] = [round5(range[0]), round5(range[1])];
  const planned = input.plannedNextLoad;
  let planVerdict: Recommendation['planVerdict'] = 'none';
  // Tolérance plus large quand rien n'impose de réduire : un plan un peu ambitieux n'est pas une alerte.
  const tolerance = mode === 'maintain' || mode === 'progress' ? 1.15 : 1.08;
  if (planned !== null && planned > 0 && !codes.has('no_data')) {
    if (planned > targetLoad[1] * tolerance) planVerdict = 'above';
    else if (planned < targetLoad[0] * 0.95) planVerdict = 'below';
    else planVerdict = 'within';
  }

  const actions: string[] = [];
  if (planVerdict === 'above') {
    actions.push(`Alléger le plan de la semaine prochaine d’environ ${formatInt(round5(planned! - targetLoad[1]))} points de charge.`);
  } else if (planVerdict === 'below' && (mode === 'progress' || mode === 'maintain')) {
    actions.push(`Le plan prévoit une semaine plus légère (${formatInt(planned!)} points) : à conserver si elle clôt un bloc de charge, sinon il reste une marge d’environ ${formatInt(round5(targetLoad[0] - planned!))} points.`);
  }
  for (const insight of [...critical, ...warnings]) {
    if (insight.action && !actions.includes(insight.action)) actions.push(insight.action);
  }
  if (actions.length === 0) actions.push(planned ? 'Dérouler le plan prévu, sans ajustement.' : 'Planifier la semaine dans la fourchette conseillée.');

  return { mode, label: LABELS[mode], rationale, targetLoad, plannedNextLoad: planned, planVerdict, actions: actions.slice(0, 4) };
}
