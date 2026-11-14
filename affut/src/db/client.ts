import path from 'node:path';
import { mkdirSync } from 'node:fs';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { todayISO } from '@/core/dates';
import { env } from '@/server/env';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), 'drizzle');
const globalForDb = globalThis as unknown as { __affutDb?: Promise<Db> };

/**
 * Connexion unique par processus. Postgres en production ; à défaut, PGlite
 * (Postgres compilé en WASM) pour démarrer sans aucune infrastructure.
 */
export function getDb(): Promise<Db> {
  if (!globalForDb.__affutDb) {
    globalForDb.__affutDb = connect().catch((error) => {
      globalForDb.__affutDb = undefined;
      throw error;
    });
  }
  return globalForDb.__affutDb;
}

async function connect(): Promise<Db> {
  let db: Db;
  if (env.DATABASE_URL) {
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    const postgres = (await import('postgres')).default;
    const instance = drizzle(postgres(env.DATABASE_URL, { max: 10, idle_timeout: 30 }), { schema });
    if (env.AUTO_MIGRATE) await migrate(instance, { migrationsFolder: MIGRATIONS });
    db = instance as unknown as Db;
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    let dataDir: string | undefined;
    if (env.PGLITE_DIR !== 'memory') {
      dataDir = path.resolve(process.cwd(), env.PGLITE_DIR);
      mkdirSync(dataDir, { recursive: true });
    }
    const instance = drizzle(new PGlite(dataDir), { schema });
    await migrate(instance, { migrationsFolder: MIGRATIONS });
    db = instance as unknown as Db;
  }

  if (env.DEMO_MODE) {
    const { ensureDemoData } = await import('./seed');
    await ensureDemoData(db, todayISO());
  }
  return db;
}
