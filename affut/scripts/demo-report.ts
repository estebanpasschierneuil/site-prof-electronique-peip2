import { analyzeWeek } from '../src/core/analyze';
import { generateDemo } from '../src/integrations/demo/generator';

const today = process.argv[2] ?? '2026-11-14';
const { reviewWeek, athletes } = generateDemo(today);
console.log('review week', reviewWeek, 'today', today);
for (const a of athletes) {
  const r = analyzeWeek({
    athlete: { id: a.key, ...a.profile },
    activities: a.activities.map((x) => ({ ...x, id: x.externalId })),
    planned: a.planned.map((x, i) => ({ ...x, id: `p${i}` })),
    wellness: a.wellness,
    races: a.races,
    weekStart: process.argv[3] ?? reviewWeek,
    today,
  });
  const ok = r.status === a.expected.status && r.insights.some((i) => i.code === a.expected.code);
  console.log(
    `${ok ? 'OK ' : 'XX '} ${a.key.padEnd(9)} ${r.status.padEnd(6)} ${r.phase.padEnd(9)} load ${String(r.load.done).padStart(4)}/${String(r.load.planned).padStart(4)} ` +
      `ctl ${r.fitness.ctl} tsb ${r.fitness.tsb} ramp ${r.fitness.ramp} acwr ${r.fitness.acwr} mono ${r.rhythm.monotony} ready ${r.recovery.readiness} hrvz ${r.recovery.hrv.z} rhr ${r.recovery.restingHr.delta} sleep ${r.recovery.sleep.week} ` +
      `4w ${r.compliance.fourWeekPct} run ${r.run.km}/${r.run.baselineKm} ef ${r.efficiency.run}/${r.efficiency.bike} dist ${r.distribution ? [r.distribution.low, r.distribution.moderate, r.distribution.high].join('/') : '-'}`,
  );
  console.log(`      [${r.insights.map((i) => `${i.severity[0]}:${i.code}`).join(', ')}] → ${r.recommendation.mode} ${r.recommendation.targetLoad.join('–')} plan ${r.recommendation.plannedNextLoad} (${r.recommendation.planVerdict})`);
}
