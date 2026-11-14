import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getDb } from '@/db/client';
import { organizations, sessions, users } from '@/db/schema';
import { env } from './env';
import { verifyPassword } from './password';

const COOKIE = 'affut_session';
const SESSION_DAYS = 30;

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'coach';
  org: { id: string; name: string; isDemo: boolean; timezone: string };
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(userId: string): Promise<void> {
  const db = await getDb();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt });
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: env.isProduction, path: '/', expires: expiresAt });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.delete(COOKIE);
}

/** Utilisateur de la requête courante, ou `null`. Mis en cache pour la durée du rendu. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, orgId: organizations.id, orgName: organizations.name, isDemo: organizations.isDemo, timezone: organizations.timezone })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(organizations, eq(organizations.id, users.orgId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role, org: { id: row.orgId, name: row.orgName, isDemo: row.isDemo, timezone: row.timezone } };
});

/** À appeler en tête de chaque page et de chaque action protégée. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

// Limitation simple des tentatives, par processus. Derrière plusieurs instances,
// la remplacer par un compteur partagé (Redis, table dédiée).
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60_000;

export async function authenticate(email: string, password: string): Promise<{ ok: true; userId: string } | { ok: false; reason: 'invalid' | 'throttled' }> {
  const key = email.toLowerCase();
  const now = Date.now();
  const entry = attempts.get(key);
  if (entry && entry.resetAt > now && entry.count >= MAX_ATTEMPTS) return { ok: false, reason: 'throttled' };

  const db = await getDb();
  const [user] = await db.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(eq(sql`lower(${users.email})`, key)).limit(1);
  // Même coût de calcul que l'utilisateur existe ou non.
  const valid = await verifyPassword(password, user?.passwordHash ?? 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
  if (!user || !valid) {
    attempts.set(key, entry && entry.resetAt > now ? { ...entry, count: entry.count + 1 } : { count: 1, resetAt: now + WINDOW_MS });
    return { ok: false, reason: 'invalid' };
  }
  attempts.delete(key);
  return { ok: true, userId: user.id };
}
