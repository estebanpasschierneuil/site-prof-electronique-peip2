/**
 * Outils de base de données en ligne de commande.
 *   npm run db:migrate   applique les migrations sur DATABASE_URL (ou la base embarquée)
 *   npm run db:seed      (re)génère l'organisation de démonstration
 */
import { todayISO } from '@/core/dates';

async function main() {
  const command = process.argv[2];
  if (command !== 'migrate' && command !== 'seed') {
    console.error('Usage : tsx src/db/cli.ts <migrate|seed>');
    process.exit(1);
  }
  process.env.AUTO_MIGRATE = 'true';
  if (command === 'migrate') process.env.DEMO_MODE = 'false';
  const { getDb } = await import('./client');
  const db = await getDb();
  if (command === 'seed') {
    const { ensureDemoData } = await import('./seed');
    await ensureDemoData(db, todayISO(), true);
    console.log('Organisation de démonstration régénérée.');
  } else {
    console.log('Migrations appliquées.');
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
