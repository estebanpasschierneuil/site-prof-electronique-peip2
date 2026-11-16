import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { connections } from '@/db/schema';
import { encrypt, verifyToken } from '@/integrations/crypto';
import { stravaExchangeCode } from '@/integrations/strava';
import { syncConnection } from '@/integrations/sync';
import { env } from '@/server/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Retour de Strava : échange du code, enregistrement chiffré des jetons, premier import. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = params.get('state') ?? '';
  const back = (etat: 'ok' | 'erreur') => NextResponse.redirect(`${env.APP_URL}/connexion/${encodeURIComponent(state)}?etat=${etat}`);

  const athleteId = verifyToken(state)?.athleteId;
  const code = params.get('code');
  const scope = params.get('scope') ?? '';
  if (!athleteId || !code || params.get('error') || !scope.includes('activity:read')) return back('erreur');

  try {
    const tokens = await stravaExchangeCode(code);
    const db = await getDb();
    const values = {
      athleteId,
      provider: 'strava',
      externalAthleteId: tokens.externalAthleteId,
      accessTokenEnc: encrypt(tokens.accessToken),
      refreshTokenEnc: encrypt(tokens.refreshToken),
      tokenExpiresAt: tokens.expiresAt,
      status: 'active' as const,
      lastError: null,
    };
    const [connection] = await db
      .insert(connections)
      .values(values)
      .onConflictDoUpdate({ target: [connections.athleteId, connections.provider], set: values })
      .returning({ id: connections.id });
    await syncConnection(db, connection.id);
    return back('ok');
  } catch {
    return back('erreur');
  }
}
