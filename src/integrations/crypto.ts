import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '@/server/env';

const globalForKey = globalThis as unknown as { __affutEphemeralKey?: Buffer };

/** La clé de chiffrement est-elle utilisable sur ce déploiement ? */
export function encryptionReady(): boolean {
  return Boolean(env.APP_ENCRYPTION_KEY) || !env.isProduction || env.DEMO_MODE;
}

/** Les jetons des plateformes sont chiffrés au repos (AES-256-GCM). */
function key(): Buffer {
  const raw = env.APP_ENCRYPTION_KEY;
  if (!raw) {
    // Développement : clé fixe, pour que les connexions survivent aux redémarrages.
    if (!env.isProduction) return Buffer.alloc(32, 'affut-dev-key');
    // Démonstration en production : clé éphémère, propre au processus.
    if (env.DEMO_MODE) return (globalForKey.__affutEphemeralKey ??= randomBytes(32));
    throw new Error('APP_ENCRYPTION_KEY est requise pour connecter une plateforme.');
  }
  const buffer = Buffer.from(raw, 'base64');
  if (buffer.length !== 32) throw new Error('APP_ENCRYPTION_KEY doit faire 32 octets encodés en base64.');
  return buffer;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Jeton signé à durée limitée : lien d'invitation et paramètre `state` OAuth. */
export function signToken(payload: Record<string, string>, ttlSeconds: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  return `${body}.${createHmac('sha256', key()).update(body).digest('base64url')}`;
}

export function verifyToken(token: string): Record<string, string> | null {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = createHmac('sha256', key()).update(body).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, string> & { exp: number };
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}
