import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')
  .optional();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Postgres de production. Absent : base PGlite embarquée (démo, développement). */
  DATABASE_URL: z.string().url().optional(),
  /** Dossier de la base embarquée, ou `memory` pour une base volatile. */
  PGLITE_DIR: z.string().default('.data/pglite'),
  DEMO_MODE: bool,
  AUTO_MIGRATE: bool,
  APP_URL: z.string().url().default('http://localhost:3000'),
  /** Clé de chiffrement des jetons des plateformes (32 octets, base64). */
  APP_ENCRYPTION_KEY: z.string().optional(),
  CRON_SECRET: z.string().min(16).optional(),
  STRAVA_CLIENT_ID: z.string().optional(),
  STRAVA_CLIENT_SECRET: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Configuration invalide : ${parsed.error.issues.map((i) => `${i.path.join('.')} (${i.message})`).join(', ')}`);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  /** Sans Postgres configuré, l'application démarre en démonstration. */
  DEMO_MODE: raw.DEMO_MODE ?? !raw.DATABASE_URL,
  AUTO_MIGRATE: raw.AUTO_MIGRATE ?? !raw.DATABASE_URL,
};
