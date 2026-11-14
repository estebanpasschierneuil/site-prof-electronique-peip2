import { THRESHOLDS as T } from './config';
import { formatDateShort, formatDuration, formatInt, formatNumber, formatPct, formatSigned, SPORT_LABEL } from './format';
import type { ISODate } from './dates';
import type { Insight, Phase, Race, Severity, TriSport, WeeklyAnalysis, WeekStatus } from './types';

/** Faits de la semaine dont les règles ont besoin, en plus de l'analyse chiffrée. */
export interface InsightContext {
  phase: Phase;
  nextRace: (Race & { daysTo: number }) | null;
  /** Course A ou B disputée cette semaine ou la précédente. */
  recentRace: Race | null;
  load: WeeklyAnalysis['load'];
  fitness: WeeklyAnalysis['fitness'];
  distribution: WeeklyAnalysis['distribution'];
  rhythm: WeeklyAnalysis['rhythm'];
  compliance: WeeklyAnalysis['compliance'];
  recovery: WeeklyAnalysis['recovery'];
  run: WeeklyAnalysis['run'];
  efficiency: WeeklyAnalysis['efficiency'];
  daysSinceLastActivity: number | null;
  lastActivityDate: ISODate | null;
  /** Jours écoulés depuis la dernière donnée de récupération reçue (montre encore synchronisée ?). */
  daysSinceLastWellness: number | null;
  plannedSinceLastActivity: number;
  missedKeyTitles: string[];
  /** Sports dont moins de 40 % des séances prévues ont été faites sur 3 semaines. */
  neglected: { sport: TriSport; done: number; planned: number }[];
  /** Séances de plus de 45 min réalisées à 94 % du seuil déclaré ou plus, sur 3 semaines, hors courses. */
  aboveThresholdSessions: number;
  isPartial: boolean;
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, positive: 2, info: 3 };

export function deriveInsights(c: InsightContext): Insight[] {
  const out: Insight[] = [];
  const add = (insight: Insight) => out.push(insight);
  const has = (code: string) => out.some((i) => i.code === code);

  const { fitness, recovery, compliance, load } = c;
  const reliable = fitness.historyDays >= T.fitness.minHistoryDays;
  const racing = c.phase === 'race_week' || c.phase === 'post_race';
  const hrvZ = recovery.hrv.z;
  const rhrDelta = recovery.restingHr.delta;
  const sleepH = recovery.sleep.week;

  // ——— Données ———
  const deviceQuiet = c.daysSinceLastWellness === null || c.daysSinceLastWellness >= T.data.silentDays;
  const silent = c.daysSinceLastActivity !== null && c.daysSinceLastActivity >= T.data.silentDays && c.plannedSinceLastActivity >= 2 && deviceQuiet && !racing;
  if (silent) {
    add({
      code: 'no_data',
      severity: 'critical',
      category: 'donnees',
      title: `Aucune donnée depuis ${c.daysSinceLastActivity} jours`,
      detail: `Dernière séance reçue le ${formatDateShort(c.lastActivityDate!)}, alors que ${c.plannedSinceLastActivity} séances étaient prévues depuis.`,
      action: 'Vérifier la synchronisation de la montre ou prendre des nouvelles de l’athlète.',
    });
  }

  // ——— Signaux composites : maladie, surcharge ———
  const illness = hrvZ !== null && rhrDelta !== null && hrvZ <= T.recovery.hrvZAlert && rhrDelta >= T.recovery.rhrAlert;
  if (illness) {
    const missed = compliance.sessionsPlanned - compliance.sessionsDone;
    add({
      code: 'illness',
      severity: 'critical',
      category: 'recuperation',
      title: 'Signes de maladie ou de stress aigu',
      detail: `VFC à ${formatInt(recovery.hrv.week!)} ms contre ${formatInt(recovery.hrv.baseline!)} habituellement, FC de repos ${formatSigned(rhrDelta!)} bpm${missed > 0 ? `, ${missed} séance${missed > 1 ? 's' : ''} manquée${missed > 1 ? 's' : ''}` : ''}.`,
      action: 'Repos ou activité très légère jusqu’au retour des marqueurs à la normale, puis reprise progressive sans rattraper les séances.',
    });
  }

  const loadStress: string[] = [];
  if (reliable && fitness.ramp >= T.fitness.rampWatch) loadStress.push(`CTL ${formatSigned(fitness.ramp, 1)} sur la semaine`);
  if (reliable && fitness.acwr !== null && fitness.acwr >= T.fitness.acwrWatch) loadStress.push(`ratio aigu/chronique à ${formatNumber(fitness.acwr, 2)}`);
  if (fitness.tsb <= -25) loadStress.push(`fraîcheur à ${formatSigned(fitness.tsb)}`);
  if (compliance.loadPct !== null && compliance.loadPct >= 1.2) loadStress.push(`${formatPct(compliance.loadPct)} de la charge prévue`);

  const strain: string[] = [];
  if (hrvZ !== null && hrvZ <= T.recovery.hrvZWatch) strain.push(`VFC à ${formatInt(recovery.hrv.week!)} ms contre ${formatInt(recovery.hrv.baseline!)}`);
  if (rhrDelta !== null && rhrDelta >= T.recovery.rhrWatch) strain.push(`FC de repos ${formatSigned(rhrDelta)} bpm`);
  if (sleepH !== null && sleepH < T.recovery.sleepWatchH) strain.push(`${formatDuration(sleepH * 3600)} de sommeil par nuit`);
  if (recovery.fatigue !== null && recovery.fatigue >= T.recovery.subjectiveWatch) strain.push(`fatigue ressentie ${formatNumber(recovery.fatigue)}/5`);

  const overreach = !illness && !racing && loadStress.length >= 1 && strain.length >= 2;
  if (overreach) {
    add({
      code: 'overreach',
      severity: 'critical',
      category: 'charge',
      title: 'Surcharge non absorbée',
      detail: `La charge monte (${loadStress.join(', ')}) pendant que la récupération se dégrade : ${strain.join(', ')}.`,
      action: 'Couper l’intensité et réduire le volume la semaine prochaine ; réévaluer à mi-semaine sur la VFC et le ressenti.',
    });
  }
  const composite = illness || overreach;

  // ——— Charge ———
  if (reliable && !composite && !racing) {
    if (fitness.ramp >= T.fitness.rampHigh) {
      add({
        code: 'ramp_high',
        severity: 'critical',
        category: 'charge',
        title: 'Montée de charge trop rapide',
        detail: `CTL ${formatSigned(fitness.ramp, 1)} points en une semaine (repère : moins de ${T.fitness.rampWatch}).`,
        action: 'Stabiliser la charge une semaine avant de reprendre la progression.',
      });
    } else if (fitness.ramp >= T.fitness.rampWatch) {
      add({
        code: 'ramp_watch',
        severity: 'warning',
        category: 'charge',
        title: 'Progression de charge soutenue',
        detail: `CTL ${formatSigned(fitness.ramp, 1)} points en une semaine, au-dessus du repère de ${T.fitness.rampWatch}.`,
        action: 'Ne pas enchaîner une troisième semaine à ce rythme.',
      });
    } else if (fitness.acwr !== null && fitness.acwr >= T.fitness.acwrHigh) {
      add({
        code: 'acwr_high',
        severity: 'warning',
        category: 'charge',
        title: 'Charge de la semaine très au-dessus de l’habitude',
        detail: `Ratio aigu/chronique à ${formatNumber(fitness.acwr, 2)} (repère : moins de ${formatNumber(T.fitness.acwrWatch, 1)}).`,
        action: 'Prévoir une semaine plus légère pour laisser l’adaptation se faire.',
      });
    }
    if (fitness.tsb <= T.fitness.tsbDeep && c.phase !== 'taper') {
      add({
        code: 'tsb_deep',
        severity: 'warning',
        category: 'charge',
        title: 'Fatigue aiguë élevée',
        detail: `Fraîcheur à ${formatSigned(fitness.tsb)} en fin de semaine (repère : au-dessus de ${T.fitness.tsbDeep}).`,
        action: 'Placer deux jours faciles en début de semaine.',
      });
    }
  }
  if (!composite && !silent && load.planned === 0 && reliable && fitness.acwr !== null && fitness.acwr <= T.fitness.acwrLow && c.phase === 'training') {
    add({
      code: 'acwr_low',
      severity: 'warning',
      category: 'charge',
      title: 'Charge en net recul',
      detail: `Ratio aigu/chronique à ${formatNumber(fitness.acwr, 2)} sans semaine allégée planifiée.`,
    });
  }

  // ——— Compétition ———
  if (c.phase === 'taper' && c.nextRace && c.nextRace.daysTo <= 10) {
    if (fitness.tsb < T.fitness.taperTsbMin) {
      add({
        code: 'taper_late',
        severity: 'critical',
        category: 'competition',
        title: `Pas assez de fraîcheur à J-${c.nextRace.daysTo}`,
        detail: `Fraîcheur à ${formatSigned(fitness.tsb)} à ${c.nextRace.daysTo} jours de ${c.nextRace.name}${compliance.loadPct !== null && compliance.loadPct > 1.1 ? `, avec ${formatPct(compliance.loadPct)} de la charge prévue` : ''}.`,
        action: 'Réduire nettement le volume dès lundi et ne garder que de courts rappels d’intensité.',
      });
    } else if (!composite) {
      add({
        code: 'taper_ok',
        severity: 'positive',
        category: 'competition',
        title: `Affûtage conforme à J-${c.nextRace.daysTo}`,
        detail: `Fraîcheur à ${formatSigned(fitness.tsb)} et en hausse avant ${c.nextRace.name}.`,
      });
    }
  }
  if (c.phase === 'race_week' && c.recentRace) {
    add({ code: 'race_week', severity: 'info', category: 'competition', title: `Course cette semaine : ${c.recentRace.name}`, detail: 'La charge et la fraîcheur de la semaine reflètent la compétition.' });
  }
  if (c.phase === 'post_race' && c.recentRace) {
    add({
      code: 'post_race',
      severity: 'info',
      category: 'competition',
      title: `Récupération après ${c.recentRace.name}`,
      detail: `Semaine volontairement légère : ${formatInt(load.done)} points de charge, fraîcheur à ${formatSigned(fitness.tsb)}.`,
    });
  }
  if (c.phase === 'training' && c.nextRace && c.nextRace.priority !== 'C' && c.nextRace.daysTo <= 28) {
    add({ code: 'race_ahead', severity: 'info', category: 'competition', title: `${c.nextRace.name} dans ${c.nextRace.daysTo} jours`, detail: `Objectif ${c.nextRace.priority}, début de l’affûtage à prévoir deux semaines avant.` });
  }

  // ——— Récupération (signaux isolés) ———
  if (!composite) {
    if (hrvZ !== null && hrvZ <= T.recovery.hrvZWatch) {
      add({
        code: 'hrv_low',
        severity: hrvZ <= -2 ? 'critical' : 'warning',
        category: 'recuperation',
        title: 'VFC sous la référence',
        detail: `Moyenne 7 jours à ${formatInt(recovery.hrv.week!)} ms contre ${formatInt(recovery.hrv.baseline!)} habituellement (${formatSigned(hrvZ, 1)} écart-type).`,
        action: 'Remplacer la prochaine séance intense par de l’endurance si la tendance se confirme.',
      });
    }
    if (rhrDelta !== null && rhrDelta >= T.recovery.rhrWatch) {
      add({
        code: 'rhr_high',
        severity: 'warning',
        category: 'recuperation',
        title: 'FC de repos en hausse',
        detail: `${formatInt(recovery.restingHr.week!)} bpm en moyenne, soit ${formatSigned(rhrDelta)} par rapport à la référence.`,
      });
    }
    if (recovery.fatigue !== null && recovery.fatigue >= T.recovery.subjectiveWatch) {
      add({
        code: 'fatigue_high',
        severity: 'warning',
        category: 'recuperation',
        title: 'Fatigue ressentie élevée',
        detail: `${formatNumber(recovery.fatigue)}/5 en moyenne sur la semaine.`,
        action: 'En parler avec l’athlète avant de valider la semaine suivante.',
      });
    }
  }
  if (sleepH !== null && sleepH < T.recovery.sleepWatchH && !overreach) {
    const nights = recovery.sleep.shortNights;
    add({
      code: 'sleep_low',
      severity: 'warning',
      category: 'recuperation',
      title: 'Sommeil insuffisant',
      detail: `${formatDuration(sleepH * 3600)} par nuit en moyenne${nights > 0 ? `, dont ${nights} nuit${nights > 1 ? 's' : ''} sous ${T.recovery.shortNightH} h` : ''}.`,
      action: 'Éviter les séances très matinales et placer l’intensité après les meilleures nuits.',
    });
  }

  // ——— Conformité au plan ———
  const pct = compliance.loadPct;
  if (pct !== null && !silent && !illness && c.phase !== 'post_race') {
    const missed = compliance.sessionsPlanned - compliance.sessionsDone;
    const sessions = `${compliance.sessionsDone} séance${compliance.sessionsDone > 1 ? 's' : ''} sur ${compliance.sessionsPlanned}`;
    const keys = c.missedKeyTitles.length ? ` Séance${c.missedKeyTitles.length > 1 ? 's' : ''} clé${c.missedKeyTitles.length > 1 ? 's' : ''} manquée${c.missedKeyTitles.length > 1 ? 's' : ''} : ${c.missedKeyTitles.join(', ')}.` : '';
    if (pct < T.compliance.lowPct && missed > 0) {
      add({
        code: 'compliance_low',
        severity: pct < T.compliance.veryLowPct ? 'critical' : 'warning',
        category: 'conformite',
        title: pct < T.compliance.veryLowPct ? 'Semaine très incomplète' : 'Semaine incomplète',
        detail: `${sessions}, ${formatPct(pct)} de la charge prévue.${keys}`,
        action: 'Comprendre ce qui a bloqué (emploi du temps, motivation, douleur) et adapter le plan plutôt que rattraper.',
      });
    } else if (c.missedKeyTitles.length > 0) {
      add({
        code: 'key_missed',
        severity: 'warning',
        category: 'conformite',
        title: c.missedKeyTitles.length > 1 ? 'Séances clés manquées' : 'Séance clé manquée',
        detail: `${c.missedKeyTitles.join(', ')}. Le reste de la semaine est fait (${formatPct(pct)} de la charge).`,
        action: 'Décider si la séance est reportée ou abandonnée.',
      });
    } else if (pct > T.compliance.overPct && !overreach && c.aboveThresholdSessions < 2 && c.phase !== 'taper' && c.phase !== 'race_week') {
      add({
        code: 'over_plan',
        severity: 'warning',
        category: 'conformite',
        title: 'Charge au-delà du plan',
        detail: `${formatPct(pct)} de la charge prévue (${formatInt(load.done)} points pour ${formatInt(load.planned)}).`,
        action: 'Rappeler que le plan fixe aussi un plafond.',
      });
    }
  }
  if (compliance.fourWeekPct !== null && compliance.fourWeekPct < T.compliance.fourWeekLowPct && !silent && !illness) {
    add({
      code: 'regularity_low',
      severity: 'warning',
      category: 'regularite',
      title: 'Régularité en baisse sur 4 semaines',
      detail: `${formatPct(compliance.fourWeekPct)} des séances prévues réalisées sur les 4 dernières semaines.`,
      action: 'Revoir le volume planifié avec l’athlète : un plan tenu à 90 % vaut mieux qu’un plan ambitieux tenu à 60 %.',
    });
  }
  for (const n of c.neglected) {
    add({
      code: `neglect_${n.sport}`,
      severity: 'warning',
      category: 'regularite',
      title: `${SPORT_LABEL[n.sport]} délaissée depuis 3 semaines`,
      detail: `${n.done} séance${n.done > 1 ? 's' : ''} réalisée${n.done > 1 ? 's' : ''} sur ${n.planned} prévues.`,
      action: 'Identifier le frein (créneau, accès, envie) et sécuriser au moins une séance par semaine.',
    });
  }

  // ——— Intensité et rythme ———
  if (compliance.easyTooHard >= 2) {
    add({
      code: 'easy_too_hard',
      severity: 'warning',
      category: 'intensite',
      title: 'Endurance réalisée trop vite',
      detail: `${compliance.easyTooHard} séances faciles au-dessus de ${formatPct(T.compliance.easyMaxIf)} de l’intensité seuil${c.distribution ? `, ${formatPct(c.distribution.moderate)} du temps en zone intermédiaire` : ''}.`,
      action: 'Fixer un plafond de FC ou de puissance sur les sorties d’endurance.',
    });
  } else if (c.distribution && c.distribution.totalS >= T.distribution.minDurationS && c.distribution.low < T.distribution.lowMin && c.distribution.moderate > T.distribution.moderateMax && c.phase !== 'race_week') {
    add({
      code: 'grey_zone',
      severity: 'warning',
      category: 'intensite',
      title: 'Trop de temps en zone intermédiaire',
      detail: `${formatPct(c.distribution.moderate)} du temps entre les deux seuils, ${formatPct(c.distribution.low)} seulement en endurance fondamentale.`,
      action: 'Ralentir les séances faciles pour mieux encaisser les séances clés.',
    });
  }
  const { monotony } = c.rhythm;
  if (monotony !== null && monotony >= T.rhythm.monotonyHigh && load.done >= T.rhythm.minLoadForMonotony && c.phase === 'training' && !c.isPartial) {
    add({
      code: 'monotony',
      severity: 'warning',
      category: 'charge',
      title: 'Charge monotone, sans vrai jour facile',
      detail: `Monotonie à ${formatNumber(monotony, 1)} (repère : moins de ${T.rhythm.monotonyHigh}), ${c.rhythm.restDays} jour${c.rhythm.restDays > 1 ? 's' : ''} de repos.`,
      action: 'Alterner jours durs et jours faciles, avec un jour de repos complet.',
    });
  }
  // Hausse réelle : au-dessus de la moyenne ET de la plus grosse des 4 dernières semaines.
  const runAboveRecentMax = c.run.maxKm !== null && c.run.km >= c.run.maxKm * 1.15;
  if (c.run.ratio !== null && c.run.km >= T.run.minKm && c.run.ratio >= T.run.spikeWatch && runAboveRecentMax && c.phase !== 'race_week') {
    add({
      code: 'run_spike',
      severity: c.run.ratio >= T.run.spikeAlert ? 'critical' : 'warning',
      category: 'charge',
      title: 'Volume de course à pied en forte hausse',
      detail: `${formatNumber(c.run.km, 0)} km cette semaine contre ${formatNumber(c.run.baselineKm!, 0)} km en moyenne sur 4 semaines (${formatSigned((c.run.ratio - 1) * 100)} %).`,
      action: 'Revenir à une hausse de 10 à 15 % par semaine : la course à pied est le premier poste de blessure.',
    });
  }

  // ——— Performance ———
  if (c.aboveThresholdSessions >= 2) {
    add({
      code: 'thresholds_stale',
      severity: 'info',
      category: 'performance',
      title: 'Seuils à réévaluer',
      detail: `${c.aboveThresholdSessions} séances de plus de 45 min tenues à 94 % du seuil déclaré ou plus en 3 semaines : les seuils sont probablement sous-estimés et la charge surestimée.`,
      action: 'Programmer un test (FTP, allure seuil) pour recalibrer les zones.',
    });
  }
  const efficiency = Math.max(c.efficiency.run ?? -1, c.efficiency.bike ?? -1);
  if (efficiency >= T.efficiency.improving && !composite) {
    const sport = (c.efficiency.run ?? -1) >= (c.efficiency.bike ?? -1) ? 'course à pied' : 'vélo';
    add({
      code: 'efficiency_up',
      severity: 'positive',
      category: 'performance',
      title: 'Efficacité aérobie en hausse',
      detail: `${formatSigned(efficiency * 100, 1)} % en ${sport} sur 3 semaines, à fréquence cardiaque égale.`,
    });
  }

  // ——— Constats positifs ———
  const blocking = out.some((i) => i.severity === 'critical' || i.severity === 'warning');
  if (!blocking && c.phase === 'training' && reliable && pct !== null && pct >= 0.9 && fitness.ramp >= 1 && (recovery.readiness === null || recovery.readiness >= 65)) {
    add({
      code: 'progress_ok',
      severity: 'positive',
      category: 'charge',
      title: 'Progression bien assimilée',
      detail: `CTL ${formatSigned(fitness.ramp, 1)} avec ${formatPct(pct)} de la charge prévue${recovery.readiness !== null ? ` et une préparation à ${recovery.readiness}/100` : ''}.`,
    });
  }
  if (!blocking && c.phase === 'deload' && pct !== null && pct >= 0.8) {
    add({
      code: 'deload_ok',
      severity: 'positive',
      category: 'charge',
      title: 'Semaine allégée respectée',
      detail: `${formatInt(load.done)} points de charge, fraîcheur remontée à ${formatSigned(fitness.tsb)}.`,
    });
  }

  // ——— Qualité des données ———
  if (!reliable) {
    add({
      code: 'history_short',
      severity: 'info',
      category: 'donnees',
      title: 'Historique encore court',
      detail: `${fitness.historyDays} jours de données : charge chronique et tendances seront fiables après 4 semaines.`,
    });
  }
  if (recovery.loggedDays < 3 && !silent) {
    add({
      code: 'wellness_missing',
      severity: 'info',
      category: 'donnees',
      title: 'Peu de données de récupération',
      detail: `${recovery.loggedDays} jour${recovery.loggedDays > 1 ? 's' : ''} renseigné${recovery.loggedDays > 1 ? 's' : ''} sur 7 : sommeil, VFC et ressenti ne peuvent pas être évalués.`,
    });
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function deriveStatus(insights: Insight[]): { status: WeekStatus; priority: number } {
  const critical = insights.filter((i) => i.severity === 'critical').length;
  const warning = insights.filter((i) => i.severity === 'warning').length;
  return {
    status: critical > 0 ? 'action' : warning > 0 ? 'watch' : 'ok',
    priority: critical * 100 + warning * 25,
  };
}
