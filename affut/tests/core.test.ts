import { describe, expect, it } from 'vitest';
import { analyzeWeek } from '@/core/analyze';
import { addDays, defaultReviewWeek, isoWeekNumber, weekStart } from '@/core/dates';
import { matchWeek, readiness } from '@/core/facts';
import { acuteChronicRatio, buildFitnessSeries, monotony } from '@/core/fitness';
import { computeLoad } from '@/core/load';
import { weeklyLoadForRamp } from '@/core/recommend';
import type { Activity, AthleteProfile, PlannedWorkout } from '@/core/types';

const profile: AthleteProfile = { id: 'a', firstName: 'Test', lastName: 'Athlète', ftpW: 250, runThresholdPaceS: 240, swimCssS: 100, lthr: 170, restHr: 50 };

describe('dates', () => {
  it('ramène toute date au lundi de sa semaine', () => {
    expect(weekStart('2026-11-14')).toBe('2026-11-09');
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
    expect(weekStart('2026-11-15')).toBe('2026-11-09');
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
  });
  it('numérote les semaines selon ISO 8601', () => {
    expect(isoWeekNumber('2026-11-02')).toBe(45);
    expect(isoWeekNumber('2026-12-28')).toBe(53);
    expect(isoWeekNumber('2027-01-04')).toBe(1);
  });
  it('propose la dernière semaine terminée, ou la semaine en cours le dimanche', () => {
    expect(defaultReviewWeek('2026-11-14')).toBe('2026-11-02');
    expect(defaultReviewWeek('2026-11-15')).toBe('2026-11-09');
    expect(defaultReviewWeek('2026-11-16')).toBe('2026-11-09');
  });
});

describe('charge d’une séance', () => {
  it('vaut 100 pour une heure au seuil, dans chaque sport', () => {
    expect(computeLoad({ sport: 'bike', durationS: 3600, normalizedPowerW: 250 }, profile)).toMatchObject({ load: 100, method: 'power' });
    expect(computeLoad({ sport: 'run', durationS: 3600, distanceM: 15000 }, profile)).toMatchObject({ load: 100, method: 'pace' });
    expect(computeLoad({ sport: 'swim', durationS: 3600, distanceM: 3600 }, profile)).toMatchObject({ load: 100, method: 'pace' });
  });
  it('croît avec le carré de l’intensité à vélo', () => {
    expect(computeLoad({ sport: 'bike', durationS: 7200, normalizedPowerW: 175 }, profile).load).toBe(98);
  });
  it('se replie sur la FC, puis le ressenti, puis la durée', () => {
    const noThresholds = { ...profile, ftpW: null, runThresholdPaceS: null };
    expect(computeLoad({ sport: 'bike', durationS: 3600, avgHr: 170 }, noThresholds).method).toBe('hr');
    expect(computeLoad({ sport: 'run', durationS: 3600, rpe: 7 }, { ...noThresholds, lthr: null }).method).toBe('rpe');
    expect(computeLoad({ sport: 'strength', durationS: 3600 }, profile)).toMatchObject({ method: 'duration', load: 30 });
  });
});

describe('modèle forme / fatigue', () => {
  const constant = (load: number, days: number) => new Map(Array.from({ length: days }, (_, i) => [addDays('2026-01-01', i), load] as const));

  it('converge vers la charge quotidienne quand elle est constante', () => {
    const series = buildFitnessSeries(constant(80, 120), '2026-01-01', addDays('2026-01-01', 119));
    const last = series.at(-1)!;
    expect(last.ctl).toBeCloseTo(80, 0);
    expect(last.atl).toBeCloseTo(80, 0);
    expect(last.tsb).toBeCloseTo(0, 0);
  });
  it('fait chuter la fraîcheur après une semaine doublée', () => {
    const loads = constant(60, 90);
    for (let i = 83; i < 90; i++) loads.set(addDays('2026-01-01', i), 120);
    const last = buildFitnessSeries(loads, '2026-01-01', addDays('2026-01-01', 89)).at(-1)!;
    expect(last.tsb).toBeLessThan(-25);
    expect(acuteChronicRatio(loads, addDays('2026-01-01', 89))).toBeCloseTo(1.6, 1);
  });
  it('relie une rampe de CTL à la charge hebdomadaire qui la produit', () => {
    const target = weeklyLoadForRamp(70, 3);
    const loads = constant(70, 100);
    for (let i = 100; i < 107; i++) loads.set(addDays('2026-01-01', i), target / 7);
    const series = buildFitnessSeries(loads, '2026-01-01', addDays('2026-01-01', 106));
    expect(series.at(-1)!.ctl - series.at(-8)!.ctl).toBeCloseTo(3, 0);
  });
  it('mesure la monotonie d’une semaine', () => {
    expect(monotony([80, 80, 80, 80, 80, 80, 80])).toBe(10);
    expect(monotony([0, 120, 60, 130, 0, 180, 90])!).toBeLessThan(1.5);
  });
});

describe('rapprochement prévu / réalisé', () => {
  const plan = (id: string, date: string, sport: PlannedWorkout['sport'], extra: Partial<PlannedWorkout> = {}): PlannedWorkout => ({ id, date, sport, kind: 'endurance', title: id, durationS: 3600, load: 50, isKey: false, ...extra });
  const act = (id: string, date: string, sport: Activity['sport'], extra: Partial<Activity> = {}): Activity => ({
    id, date, sport, title: id, durationS: 3600, distanceM: null, elevationM: null, avgHr: null, avgPowerW: null, normalizedPowerW: null, rpe: null, zoneSeconds: null, load: 50, intensityFactor: 0.7, loadMethod: 'power', ...extra,
  });

  it('associe une séance décalée d’un jour et repère les manquées et les ajouts', () => {
    const m = matchWeek(
      [plan('run', '2026-11-03', 'run', { isKey: true }), plan('bike', '2026-11-04', 'bike'), plan('swim', '2026-11-05', 'swim', { isKey: true })],
      [act('run-late', '2026-11-04', 'run'), act('bike', '2026-11-04', 'bike'), act('extra', '2026-11-07', 'run')],
      '2026-11-02', '2026-11-08', '2026-11-08',
    );
    expect(m.done).toBe(2);
    expect(m.missedKeyTitles).toEqual(['swim']);
    expect(m.rows.map((r) => r.state).sort()).toEqual(['done', 'done', 'missed', 'unplanned']);
  });
  it('ne compte pas comme manquée une séance à venir', () => {
    const m = matchWeek([plan('long', '2026-11-08', 'bike', { isKey: true })], [], '2026-11-02', '2026-11-08', '2026-11-05');
    expect(m.planned).toBe(0);
    expect(m.rows[0].state).toBe('upcoming');
  });
  it('signale l’endurance réalisée au-dessus de l’intensité cible', () => {
    const m = matchWeek([plan('a', '2026-11-03', 'run'), plan('b', '2026-11-05', 'bike', { kind: 'tempo' })], [act('a', '2026-11-03', 'run', { intensityFactor: 0.88 }), act('b', '2026-11-05', 'bike', { intensityFactor: 0.88 })], '2026-11-02', '2026-11-08', '2026-11-08');
    expect(m.easyTooHard).toBe(1);
  });
});

describe('indice de préparation', () => {
  it('reste indéterminé sans données de récupération', () => {
    expect(readiness({ hrvZ: null, rhrDelta: null, sleepH: null, fatigue: null, soreness: null, mood: null, tsb: 0 }).score).toBeNull();
  });
  it('baisse quand la VFC décroche et que le sommeil manque', () => {
    const fresh = readiness({ hrvZ: 0.2, rhrDelta: 0, sleepH: 7.8, fatigue: 2, soreness: 2, mood: 4, tsb: -5 }).score!;
    const tired = readiness({ hrvZ: -2, rhrDelta: 6, sleepH: 6, fatigue: 4, soreness: 4, mood: 2, tsb: -30 }).score!;
    expect(fresh).toBeGreaterThan(80);
    expect(tired).toBeLessThan(30);
  });
});

describe('analyse hebdomadaire', () => {
  it('reste exploitable pour un athlète sans aucune donnée', () => {
    const a = analyzeWeek({ athlete: profile, activities: [], planned: [], wellness: [], races: [], weekStart: '2026-11-02', today: '2026-11-14' });
    expect(a.status).toBe('ok');
    expect(a.load.done).toBe(0);
    expect(a.recovery.readiness).toBeNull();
    expect(a.insights.map((i) => i.code)).toContain('history_short');
  });
  it('ignore tout ce qui est postérieur à la clôture de la semaine analysée', () => {
    const later: Activity = { id: 'x', date: '2026-11-10', sport: 'bike', title: 'Après', durationS: 7200, distanceM: null, elevationM: null, avgHr: null, avgPowerW: null, normalizedPowerW: null, rpe: null, zoneSeconds: null, load: 150, intensityFactor: 0.8, loadMethod: 'power' };
    const a = analyzeWeek({ athlete: profile, activities: [later], planned: [], wellness: [], races: [], weekStart: '2026-11-02', today: '2026-11-14' });
    expect(a.load.done).toBe(0);
    expect(a.fitness.ctl).toBe(0);
  });
});
