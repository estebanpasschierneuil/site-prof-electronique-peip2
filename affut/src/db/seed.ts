import { createHash } from 'node:crypto';
import { eq, inArray, max } from 'drizzle-orm';
import type { ISODate } from '@/core/dates';
import { generateDemo } from '@/integrations/demo/generator';
import { hashPassword } from '@/server/password';
import type { Db } from './client';
import { activities, athletes, connections, organizations, plannedWorkouts, races, users, weeklyAnalyses, wellnessDays } from './schema';

export const DEMO_ORG_SLUG = 'demo';
export const DEMO_EMAIL = 'claire@demo.affut.app';
export const DEMO_PASSWORD = 'demo-affut';

/** UUID stable dérivé d'une clé : les notes du coach survivent à une régénération. */
function stableId(key: string): string {
  const h = createHash('sha1').update(`affut-demo:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function chunks<T>(rows: T[], size = 400): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Crée l'organisation de démonstration, ou la régénère si ses données ne sont
 * plus à jour : la démo présente toujours la semaine qui vient de s'achever.
 */
export async function ensureDemoData(db: Db, today: ISODate, force = false): Promise<void> {
  const orgId = stableId('org');
  const athleteIds = (await db.select({ id: athletes.id }).from(athletes).where(eq(athletes.orgId, orgId))).map((a) => a.id);
  if (athleteIds.length > 0 && !force) {
    const [{ latest }] = await db.select({ latest: max(activities.date) }).from(activities).where(inArray(activities.athleteId, athleteIds));
    if (latest === today) return;
  }

  const demo = generateDemo(today);
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const coachIds = { claire: stableId('user:claire'), mathieu: stableId('user:mathieu') };

  await db.transaction(async (tx) => {
    await tx
      .insert(organizations)
      .values({ id: orgId, name: 'Trinôme Coaching', slug: DEMO_ORG_SLUG, plan: 'team', isDemo: true })
      .onConflictDoNothing();
    await tx
      .insert(users)
      .values([
        { id: coachIds.claire, orgId, email: DEMO_EMAIL, name: 'Claire Fontenay', passwordHash, role: 'owner' },
        { id: coachIds.mathieu, orgId, email: 'mathieu@demo.affut.app', name: 'Mathieu Besson', passwordHash, role: 'coach' },
      ])
      .onConflictDoNothing();

    if (athleteIds.length > 0) {
      // Les revues et notes (weekly_reviews) sont conservées ; tout le reste est régénéré.
      await tx.delete(activities).where(inArray(activities.athleteId, athleteIds));
      await tx.delete(plannedWorkouts).where(inArray(plannedWorkouts.athleteId, athleteIds));
      await tx.delete(wellnessDays).where(inArray(wellnessDays.athleteId, athleteIds));
      await tx.delete(races).where(inArray(races.athleteId, athleteIds));
      await tx.delete(weeklyAnalyses).where(inArray(weeklyAnalyses.athleteId, athleteIds));
      await tx.delete(connections).where(inArray(connections.athleteId, athleteIds));
    }

    for (const a of demo.athletes) {
      const athleteId = stableId(`athlete:${a.key}`);
      const row = {
        id: athleteId,
        orgId,
        coachId: coachIds[a.coach],
        firstName: a.profile.firstName,
        lastName: a.profile.lastName,
        sex: a.sex,
        birthYear: a.birthYear,
        distance: a.distance,
        weeklyHours: a.weeklyHours,
        ftpW: a.profile.ftpW,
        runThresholdPaceS: a.profile.runThresholdPaceS,
        swimCssS: a.profile.swimCssS,
        lthr: a.profile.lthr,
        maxHr: a.maxHr,
        restHr: a.profile.restHr,
        dataUpdatedAt: new Date(),
      };
      await tx.insert(athletes).values(row).onConflictDoUpdate({ target: athletes.id, set: { dataUpdatedAt: row.dataUpdatedAt } });

      const lastDate = a.activities.at(-1)?.date ?? null;
      await tx.insert(connections).values({
        athleteId,
        provider: a.source,
        externalAthleteId: `demo-${a.key}`,
        status: a.key === 'hugo' ? 'error' : 'active',
        lastSyncAt: lastDate ? new Date(`${lastDate}T19:30:00Z`) : null,
        lastError: a.key === 'hugo' ? 'Autorisation révoquée côté plateforme : l’athlète doit reconnecter son compte.' : null,
      });
      if (a.races.length) await tx.insert(races).values(a.races.map((r) => ({ ...r, athleteId })));
      for (const part of chunks(a.activities)) {
        await tx.insert(activities).values(part.map((x) => ({ ...x, athleteId, source: a.source, startAt: new Date(`${x.date}T07:00:00Z`) })));
      }
      for (const part of chunks(a.planned)) await tx.insert(plannedWorkouts).values(part.map((x) => ({ ...x, athleteId })));
      for (const part of chunks(a.wellness)) await tx.insert(wellnessDays).values(part.map((x) => ({ ...x, athleteId })));
    }
  });
}
