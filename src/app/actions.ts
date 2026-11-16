'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { isValidISODate } from '@/core/dates';
import { getDb } from '@/db/client';
import { DEMO_EMAIL } from '@/db/seed';
import { athletes, connections, races, users } from '@/db/schema';
import { encrypt } from '@/integrations/crypto';
import { syncConnection } from '@/integrations/sync';
import { assertAthleteInOrg, reviewAllOnTrack, saveNote, setReviewed } from '@/server/analysis';
import { resolveWeek } from '@/server/week';
import { authenticate, createSession, destroySession, requireUser } from '@/server/auth';
import { env } from '@/server/env';

export interface FormState {
  error?: string;
  ok?: string;
  /** Saisie renvoyée après une erreur : le formulaire ne se vide pas. */
  values?: Record<string, string>;
}

function echo(form: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, typeof form.get(k) === 'string' ? (form.get(k) as string) : '']));
}

const credentials = z.object({ email: z.string().trim().email(), password: z.string().min(1) });

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({ email: form.get('email'), password: form.get('password') });
  const values = echo(form, ['email']);
  if (!parsed.success) return { error: 'Saisissez une adresse e-mail valide et votre mot de passe.', values };
  const result = await authenticate(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    return { error: result.reason === 'throttled' ? 'Trop de tentatives. Réessayez dans quelques minutes.' : 'Adresse e-mail ou mot de passe incorrect.', values };
  }
  await createSession(result.userId);
  redirect('/');
}

export async function enterDemo(): Promise<void> {
  if (!env.DEMO_MODE) redirect('/login');
  const db = await getDb();
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  if (!user) redirect('/login');
  await createSession(user.id);
  redirect('/');
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect('/login');
}

const weekRef = z.object({ athleteId: z.string().uuid(), weekStart: z.string().refine(isValidISODate) });

export async function toggleReviewed(form: FormData): Promise<void> {
  const user = await requireUser();
  const { athleteId, weekStart } = weekRef.parse({ athleteId: form.get('athleteId'), weekStart: form.get('weekStart') });
  await setReviewed(user.org.id, athleteId, weekStart, user.id, form.get('reviewed') === 'true');
  revalidatePath('/', 'layout');
  const next = form.get('next');
  // Redirection interne uniquement : jamais vers une adresse fournie telle quelle.
  if (typeof next === 'string' && /^\/(?![\/\\])/.test(next)) redirect(next);
}

export async function validateOnTrack(form: FormData): Promise<void> {
  const user = await requireUser();
  const weekStart = z.string().refine(isValidISODate).parse(form.get('weekStart'));
  const { today, week } = resolveWeek(weekStart, user.org.timezone);
  await reviewAllOnTrack(user.org.id, week, today, user.id);
  revalidatePath('/', 'layout');
}

export async function saveCoachNote(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = weekRef.extend({ note: z.string().max(4000) }).safeParse({ athleteId: form.get('athleteId'), weekStart: form.get('weekStart'), note: form.get('note') ?? '' });
  if (!parsed.success) return { error: 'La note dépasse 4 000 caractères.' };
  await saveNote(user.org.id, parsed.data.athleteId, parsed.data.weekStart, parsed.data.note.trim());
  revalidatePath(`/athletes/${parsed.data.athleteId}`);
  return { ok: 'Note enregistrée.' };
}

const optionalInt = (min: number, max: number) =>
  z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().min(min).max(max).nullable());
/** Allure saisie en min:s, convertie en secondes. */
const pace = (min: number, max: number) =>
  z.preprocess((v) => {
    if (typeof v !== 'string' || v.trim() === '') return null;
    const match = /^(\d{1,2})[:'.](\d{2})$/.exec(v.trim());
    return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
  }, z.number().int().min(min).max(max).nullable());

const athleteSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.preprocess((v) => (v === '' ? null : v), z.string().trim().email().nullable()),
  distance: z.enum(['S', 'M', 'L', 'XL']),
  ftpW: optionalInt(80, 500),
  runThresholdPaceS: pace(150, 480),
  swimCssS: pace(55, 240),
  lthr: optionalInt(110, 210),
  restHr: optionalInt(30, 90),
});

const ATHLETE_FIELDS = ['firstName', 'lastName', 'email', 'distance', 'ftpW', 'runThresholdPaceS', 'swimCssS', 'lthr', 'restHr'] as const;

function readAthlete(form: FormData) {
  return athleteSchema.safeParse(Object.fromEntries(ATHLETE_FIELDS.map((k) => [k, form.get(k)])));
}

const ATHLETE_ERROR = 'Vérifiez les champs : nom et prénom requis, allures au format min:s (4:15), valeurs physiologiques plausibles.';

export async function createAthlete(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = readAthlete(form);
  if (!parsed.success) return { error: ATHLETE_ERROR, values: echo(form, ATHLETE_FIELDS) };
  const db = await getDb();
  const [created] = await db.insert(athletes).values({ ...parsed.data, orgId: user.org.id, coachId: user.id }).returning({ id: athletes.id });
  revalidatePath('/athletes');
  redirect(`/athletes/${created.id}/profil?created=1`);
}

export async function updateAthlete(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const athleteId = z.string().uuid().parse(form.get('athleteId'));
  await assertAthleteInOrg(user.org.id, athleteId);
  const parsed = readAthlete(form);
  if (!parsed.success) return { error: ATHLETE_ERROR, values: echo(form, ATHLETE_FIELDS) };
  const db = await getDb();
  // Les seuils changent la charge : les analyses en cache sont invalidées.
  await db.update(athletes).set({ ...parsed.data, dataUpdatedAt: new Date() }).where(eq(athletes.id, athleteId));
  revalidatePath('/', 'layout');
  return { ok: 'Profil enregistré. Les analyses seront recalculées avec ces seuils.', values: echo(form, ATHLETE_FIELDS) };
}

const raceSchema = z.object({ athleteId: z.string().uuid(), name: z.string().trim().min(2).max(80), date: z.string().refine(isValidISODate), distance: z.enum(['S', 'M', 'L', 'XL']), priority: z.enum(['A', 'B', 'C']) });

export async function addRace(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = raceSchema.safeParse(Object.fromEntries(['athleteId', 'name', 'date', 'distance', 'priority'].map((k) => [k, form.get(k)])));
  if (!parsed.success) return { error: 'Indiquez le nom, la date, le format et la priorité de la course.', values: echo(form, ['name', 'date', 'distance', 'priority']) };
  await assertAthleteInOrg(user.org.id, parsed.data.athleteId);
  const db = await getDb();
  await db.insert(races).values(parsed.data);
  await db.update(athletes).set({ dataUpdatedAt: new Date() }).where(eq(athletes.id, parsed.data.athleteId));
  revalidatePath('/', 'layout');
  return { ok: 'Course ajoutée.' };
}

const intervalsSchema = z.object({ athleteId: z.string().uuid(), externalAthleteId: z.string().trim().regex(/^i?\d+$/), apiKey: z.string().trim().min(10).max(200) });

export async function connectIntervals(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = intervalsSchema.safeParse({ athleteId: form.get('athleteId'), externalAthleteId: form.get('externalAthleteId'), apiKey: form.get('apiKey') });
  if (!parsed.success) return { error: 'Identifiant d’athlète (par exemple i12345) et clé d’API requis.' };
  await assertAthleteInOrg(user.org.id, parsed.data.athleteId);
  const db = await getDb();
  const values = { athleteId: parsed.data.athleteId, provider: 'intervals', externalAthleteId: parsed.data.externalAthleteId, accessTokenEnc: encrypt(parsed.data.apiKey), status: 'active' as const, lastError: null };
  const [connection] = await db
    .insert(connections)
    .values(values)
    .onConflictDoUpdate({ target: [connections.athleteId, connections.provider], set: values })
    .returning({ id: connections.id });
  const result = await syncConnection(db, connection.id);
  revalidatePath('/', 'layout');
  return result.ok ? { ok: `Connexion établie : ${result.activities} séances et ${result.wellnessDays} jours de récupération importés.` } : { error: result.error ?? 'La synchronisation a échoué.' };
}
