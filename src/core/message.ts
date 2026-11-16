import { isoWeekNumber } from './dates';
import { formatDuration, formatInt, formatPct } from './format';
import type { Insight, Recommendation, WeeklyAnalysis } from './types';

/** Formulation destinée à l'athlète pour les constats principaux. */
const ATHLETE_NOTES: Record<string, string> = {
  no_data: 'Je ne reçois plus tes séances depuis quelques jours : peux-tu vérifier la synchronisation de ta montre et me dire comment tu vas ?',
  illness: 'Tes marqueurs de récupération ont nettement décroché cette semaine. On lève le pied complètement jusqu’à ce qu’ils reviennent à la normale, sans chercher à rattraper.',
  overreach: 'Tu as beaucoup donné ces derniers jours et ton corps n’a pas encore absorbé : la récupération recule alors que la charge monte. On allège pour repartir sur de bonnes bases.',
  ramp_high: 'La charge a augmenté très vite cette semaine. On stabilise pour consolider avant de reprendre la progression.',
  ramp_watch: 'La charge progresse vite : c’est bien, mais on ne poussera pas davantage la semaine prochaine.',
  tsb_deep: 'Tu finis la semaine avec une bonne dose de fatigue : deux jours faciles pour commencer la suivante.',
  taper_late: 'La course approche et tu portes encore trop de fatigue : on réduit franchement le volume dès lundi pour arriver avec de la fraîcheur.',
  taper_ok: 'L’affûtage se passe comme prévu : la fraîcheur remonte, continue exactement comme ça.',
  hrv_low: 'Ta variabilité cardiaque est sous ta normale cette semaine : écoute-toi, on adaptera l’intensité si ça se confirme.',
  sleep_low: 'Tes nuits ont été courtes cette semaine. Le sommeil est ton premier outil de récupération : essaie de gagner 30 minutes par nuit.',
  fatigue_high: 'Tu signales une fatigue élevée : dis-m’en un peu plus pour que j’ajuste la suite.',
  compliance_low: 'Semaine incomplète, ça arrive. Dis-moi ce qui a coincé pour que j’adapte le plan à ta réalité plutôt que l’inverse.',
  key_missed: 'La semaine est bien remplie, mais la séance clé a sauté : dis-moi si tu préfères la reporter.',
  over_plan: 'Tu en as fait plus que prévu : garde en tête que le plan fixe aussi un plafond, c’est ce qui permet d’enchaîner.',
  regularity_low: 'Ces dernières semaines ont été irrégulières. Je préfère un plan plus léger que tu tiens à 90 % : on en parle ?',
  easy_too_hard: 'Tes sorties d’endurance sont trop rapides. Ralentis-les vraiment : c’est ce qui te permettra de réussir les séances clés.',
  grey_zone: 'Beaucoup de temps en zone intermédiaire cette semaine : on va mieux séparer le facile du dur.',
  monotony: 'Tes journées se ressemblent trop en charge : il te faut de vrais jours faciles et un jour de repos complet.',
  run_spike: 'Ton volume de course a beaucoup augmenté d’un coup. Pour protéger tes tendons, on revient à une hausse plus progressive.',
  neglect_swim: 'La natation passe à la trappe depuis trois semaines : trouvons un créneau sûr pour au moins une séance.',
  neglect_bike: 'Le vélo passe à la trappe depuis trois semaines : trouvons un créneau sûr pour au moins une séance.',
  neglect_run: 'La course à pied passe à la trappe depuis trois semaines : trouvons un créneau sûr pour au moins une séance.',
  progress_ok: 'Belle semaine : la charge monte et tu l’encaisses bien.',
  deload_ok: 'Semaine allégée bien respectée, tu repars avec de la fraîcheur.',
  efficiency_up: 'Bonne nouvelle : à fréquence cardiaque égale tu vas plus vite qu’il y a un mois.',
  thresholds_stale: 'Tes dernières séances dépassent tes seuils déclarés : on programme un test pour recalibrer tes zones.',
  post_race: 'Semaine de récupération après la course : exactement ce qu’il fallait.',
};

const NEXT_WEEK: Record<Recommendation['mode'], string> = {
  recover: 'semaine nettement allégée, sans intensité',
  ease: 'charge stable ou un peu réduite, en surveillant la récupération',
  maintain: 'on consolide au même niveau',
  progress: 'on monte d’un cran',
  taper: 'on baisse le volume en gardant quelques rappels d’intensité',
  race: 'semaine de course : très peu de volume, des rappels courts, du repos',
  post_race: 'récupération active, aucune intensité',
  rebuild: 'retour progressif vers ta charge habituelle',
};

export function draftMessage(firstName: string, a: Pick<WeeklyAnalysis, 'weekStart' | 'load' | 'compliance'>, insights: Insight[], recommendation: Recommendation): string {
  const lines: string[] = [`Bonjour ${firstName},`, ''];

  // Sans données, un bilan chiffré n'aurait aucun sens : le message ne fait que prendre des nouvelles.
  if (insights.some((i) => i.code === 'no_data')) {
    lines.push(ATHLETE_NOTES.no_data, '', 'Dès que tes séances reviennent, je te fais ton bilan et on cale la suite.', '', 'À très vite !');
    return lines.join('\n');
  }

  const volume = a.load.plannedDurationS > 0 ? `${formatDuration(a.load.durationS)} réalisées sur ${formatDuration(a.load.plannedDurationS)} prévues` : `${formatDuration(a.load.durationS)} d’entraînement`;
  const sessions = a.compliance.sessionsPlanned > 0 ? ` (${a.compliance.sessionsDone} séances sur ${a.compliance.sessionsPlanned}${a.compliance.loadPct !== null ? `, ${formatPct(a.compliance.loadPct)} de la charge` : ''})` : '';
  lines.push(`Bilan de ta semaine ${isoWeekNumber(a.weekStart)} : ${volume}${sessions}.`, '');

  const notes = insights
    .map((i) => ATHLETE_NOTES[i.code])
    .filter((n): n is string => Boolean(n))
    .slice(0, 3);
  if (notes.length === 0) notes.push('Semaine conforme au plan, rien à signaler.');
  lines.push(...notes.map((n) => `• ${n}`), '');

  lines.push(`Pour la semaine prochaine : ${NEXT_WEEK[recommendation.mode]}, autour de ${formatInt(recommendation.targetLoad[0])} à ${formatInt(recommendation.targetLoad[1])} points de charge.`, '', 'Bonne semaine !');
  return lines.join('\n');
}
