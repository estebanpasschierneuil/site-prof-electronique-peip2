import { describe, expect, it } from 'vitest';
import { analyzeWeek } from '@/core/analyze';
import { buildDigest, trendOf } from '@/core/digest';
import { generateDemo } from '@/integrations/demo/generator';

describe('évolution d’une semaine à l’autre', () => {
  it('distingue un signal nouveau, persistant ou résolu', () => {
    expect(trendOf('action', 'ok')).toBe('new');
    expect(trendOf('watch', 'action')).toBe('persisting');
    expect(trendOf('ok', 'watch')).toBe('resolved');
    expect(trendOf('ok', 'ok')).toBeNull();
    expect(trendOf('action', null)).toBeNull();
  });
});

describe('synthèse du groupe', () => {
  const today = '2026-11-14';
  const { reviewWeek, athletes } = generateDemo(today);
  const entries = athletes.map((a) => ({
    name: `${a.profile.firstName} ${a.profile.lastName}`,
    trend: null,
    analysis: analyzeWeek({
      athlete: { id: a.key, ...a.profile },
      activities: a.activities.map((x) => ({ ...x, id: x.externalId })),
      planned: a.planned.map((x, i) => ({ ...x, id: `p${i}` })),
      wellness: a.wellness,
      races: a.races,
      weekStart: reviewWeek,
      today,
    }),
  }));
  const digest = buildDigest(entries, reviewWeek, 'Trinôme Coaching');

  it('totalise le groupe et compte les états', () => {
    expect(digest.athletes).toBe(18);
    expect(digest.counts).toEqual({ action: 5, watch: 5, ok: 8 });
    expect(digest.durationS).toBe(entries.reduce((s, e) => s + e.analysis.load.durationS, 0));
    expect(digest.completion!).toBeGreaterThan(0.7);
    expect(digest.completion!).toBeLessThanOrEqual(1.1);
  });
  it('fait remonter les échéances et les données manquantes', () => {
    expect(digest.races.map((r) => r.name).sort()).toEqual(['Camille Roux', 'Clara Vidal']);
    expect(digest.dataGaps.map((g) => g.name)).toEqual(expect.arrayContaining(['Hugo Fontaine', 'Océane Lambert']));
  });
  it('produit un texte partageable qui nomme chaque athlète à suivre', () => {
    expect(digest.text).toContain('Synthèse de la semaine 45');
    expect(digest.text).toContain('Action requise (5)');
    for (const name of ['Thomas Girard', 'Julien Perrin', 'Sarah Benali', 'Hugo Fontaine', 'Clara Vidal']) expect(digest.text).toContain(`- ${name} :`);
    expect(digest.text).toContain('Sur les rails (8)');
    expect(digest.text).not.toContain('undefined');
  });
});
