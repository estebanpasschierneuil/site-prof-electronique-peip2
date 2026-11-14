import { NextResponse, type NextRequest } from 'next/server';
import { verifyToken } from '@/integrations/crypto';
import { stravaAuthorizeUrl, stravaProvider } from '@/integrations/strava';
import { env } from '@/server/env';

export const dynamic = 'force-dynamic';

/** Départ du parcours OAuth : le jeton d'invitation signé sert de paramètre `state`. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  if (!verifyToken(token)?.athleteId || !stravaProvider.isConfigured()) {
    return NextResponse.redirect(`${env.APP_URL}/connexion/${encodeURIComponent(token)}?etat=erreur`);
  }
  return NextResponse.redirect(stravaAuthorizeUrl(token));
}
