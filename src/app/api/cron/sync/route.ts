import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { syncAll } from '@/integrations/sync';
import { env } from '@/server/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Synchronisation planifiée de toutes les connexions actives.
 * À appeler toutes les heures avec l'en-tête `Authorization: Bearer $CRON_SECRET`.
 */
export async function POST(request: NextRequest) {
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET ?? ''}`);
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  if (!env.CRON_SECRET || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const results = await syncAll();
  return NextResponse.json({ synced: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
}
