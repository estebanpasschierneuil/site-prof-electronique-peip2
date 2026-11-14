import { describe, expect, it } from 'vitest';
import { analyzeWeek } from '@/core/analyze';
import { addDays } from '@/core/dates';
import { generateDemo, type DemoAthlete } from '@/integrations/demo/generator';

function analyze(a: DemoAthlete, weekStart: string, today: string) {
  return analyzeWeek({
    athlete: { id: a.key, ...a.profile },
    activities: a.activities.map((x) => ({ ...x, id: x.externalId })),
    planned: a.planned.map((x, i) => ({ ...x, id: `p${i}` })),
    wellness: a.wellness,
    races: a.races,
    weekStart,
    today,
  });
}

/**
 * Le jeu de démonstration doit raconter la même histoire quel que soit le jour
 * où il est généré : un samedi, un dimanche, un lundi, en hiver comme en été.
 */
describe.each(['2026-11-14', '2026-11-15', '2026-11-16', '2027-02-10', '2026-07-01'])('démo générée le %s', (today) => {
  const { reviewWeek, athletes } = generateDemo(today);

  it.each(athletes.map((a) => [a.key, a] as const))('%s : diagnostic attendu', (_key, athlete) => {
    const analysis = analyze(athlete, reviewWeek, today);
    expect(analysis.status).toBe(athlete.expected.status);
    expect(analysis.insights.map((i) => i.code)).toContain(athlete.expected.code);
    expect(analysis.recommendation.targetLoad[0]).toBeLessThanOrEqual(analysis.recommendation.targetLoad[1]);
    expect(analysis.message).toContain(athlete.profile.firstName);
  });

  it('est strictement déterministe', () => {
    expect(JSON.stringify(generateDemo(today))).toBe(JSON.stringify({ reviewWeek, athletes }));
  });

  it('ne produit aucune donnée réalisée dans le futur', () => {
    for (const a of athletes) {
      expect(a.activities.every((x) => x.date <= today)).toBe(true);
      expect(a.wellness.every((x) => x.date <= today)).toBe(true);
    }
  });

  it('analyse aussi la semaine en cours sans compter les séances à venir comme manquées', () => {
    const current = addDays(reviewWeek, 7);
    for (const a of athletes) {
      const analysis = analyze(a, current, today);
      if (!analysis.isPartial) continue;
      expect(analysis.sessions.filter((s) => s.state === 'missed').every((s) => s.date <= today)).toBe(true);
    }
  });
});
