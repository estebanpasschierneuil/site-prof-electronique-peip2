import { NextResponse, type NextRequest } from 'next/server';
import { verifyToken } from '@/integrations/crypto';
import { authorizeUrl } from '@/integrations/oauth';
import { PROVIDERS } from '@/integrations/registry';
import { env } from '@/server/env';

export const dynamic = 'force-dynamic';

/** Départ du parcours OAuth : le jeton d'invitation signé sert de paramètre `state`. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const provider = PROVIDERS[(await params).provider];
  const token = request.nextUrl.searchParams.get('token') ?? '';
  if (!provider?.oauth || !provider.isConfigured() || !verifyToken(token)?.athleteId) {
    return NextResponse.redirect(`${env.APP_URL}/connexion/${encodeURIComponent(token)}?etat=erreur`);
  }
  return NextResponse.redirect(authorizeUrl(provider, token));
}
