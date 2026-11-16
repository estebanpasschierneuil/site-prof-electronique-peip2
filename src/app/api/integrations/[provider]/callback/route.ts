import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { connections } from '@/db/schema';
import { encrypt, verifyToken } from '@/integrations/crypto';
import { exchangeCode } from '@/integrations/oauth';
import { PROVIDERS } from '@/integrations/registry';
import { syncConnection } from '@/integrations/sync';
import { env } from '@/server/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Retour de la plateforme : échange du code, enregistrement chiffré des jetons, premier import. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const provider = PROVIDERS[(await params).provider];
  const query = request.nextUrl.searchParams;
  const state = query.get('state') ?? '';
  const back = (etat: string) => NextResponse.redirect(`${env.APP_URL}/connexion/${encodeURIComponent(state)}?etat=${etat}`);

  const athleteId = verifyToken(state)?.athleteId;
  const code = query.get('code');
  if (!provider?.oauth || !athleteId || !code || query.get('error')) return back('erreur');

  try {
    const tokens = await exchangeCode(provider, code);
    const credentials = { externalAthleteId: tokens.externalAthleteId, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt };
    await provider.afterConnect?.(credentials, athleteId);

    const db = await getDb();
    const values = {
      athleteId,
      provider: provider.id,
      externalAthleteId: tokens.externalAthleteId,
      accessTokenEnc: encrypt(tokens.accessToken),
      refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      tokenExpiresAt: tokens.expiresAt,
      status: 'active' as const,
      lastError: null,
    };
    const [connection] = await db
      .insert(connections)
      .values(values)
      .onConflictDoUpdate({ target: [connections.athleteId, connections.provider], set: values })
      .returning({ id: connections.id });
    const result = await syncConnection(db, connection.id);
    return back(result.ok ? `ok-${provider.id}` : 'erreur');
  } catch {
    return back('erreur');
  }
}
