import { env } from '@/server/env';
import { ProviderError, type OAuthConfig, type RefreshedTokens, type TrainingDataProvider } from './provider';

/**
 * Parcours OAuth 2 commun à toutes les plateformes : seuls les URL, les portées
 * et la façon de présenter les identifiants changent de l'une à l'autre.
 */

type EnvKey = keyof typeof env;

export function clientCredentials(providerId: string): { id: string; secret: string } | null {
  const prefix = providerId.toUpperCase();
  const id = env[`${prefix}_CLIENT_ID` as EnvKey];
  const secret = env[`${prefix}_CLIENT_SECRET` as EnvKey];
  return typeof id === 'string' && typeof secret === 'string' && id && secret ? { id, secret } : null;
}

export const redirectUri = (providerId: string) => `${env.APP_URL}/api/integrations/${providerId}/callback`;

export function authorizeUrl(provider: TrainingDataProvider, state: string): string {
  const oauth = provider.oauth!;
  const params = new URLSearchParams({
    client_id: clientCredentials(provider.id)?.id ?? '',
    redirect_uri: redirectUri(provider.id),
    response_type: 'code',
    scope: oauth.scopes.join(oauth.scopeSeparator),
    state,
    ...oauth.extraAuthorizeParams,
  });
  return `${oauth.authorizeUrl}?${params}`;
}

async function tokenRequest(provider: TrainingDataProvider, body: Record<string, string>): Promise<Record<string, unknown>> {
  const oauth = provider.oauth as OAuthConfig;
  const client = clientCredentials(provider.id);
  if (!client) throw new ProviderError(`${provider.label} : identifiants d’application non configurés.`);
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'Affut/1.0' };
  const form = new URLSearchParams(body);
  if (oauth.clientAuth === 'basic') {
    headers.Authorization = `Basic ${Buffer.from(`${client.id}:${client.secret}`).toString('base64')}`;
  } else {
    form.set('client_id', client.id);
    form.set('client_secret', client.secret);
  }
  const response = await fetch(oauth.tokenUrl, { method: 'POST', headers, body: form, signal: AbortSignal.timeout(20_000), cache: 'no-store' });
  if (!response.ok) throw new ProviderError(`${provider.label} : échange du jeton refusé (erreur ${response.status}).`, response.status);
  return (await response.json()) as Record<string, unknown>;
}

function toTokens(response: Record<string, unknown>, previousRefresh: string | null = null): RefreshedTokens {
  if (typeof response.access_token !== 'string') throw new ProviderError('Réponse de jeton inattendue.');
  const expiresAt =
    typeof response.expires_at === 'number' ? new Date(response.expires_at * 1000) : typeof response.expires_in === 'number' ? new Date(Date.now() + response.expires_in * 1000) : null;
  return { accessToken: response.access_token, refreshToken: typeof response.refresh_token === 'string' ? response.refresh_token : previousRefresh, expiresAt };
}

export async function exchangeCode(provider: TrainingDataProvider, code: string): Promise<RefreshedTokens & { externalAthleteId: string | null }> {
  const response = await tokenRequest(provider, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(provider.id) });
  return { ...toTokens(response), externalAthleteId: provider.oauth?.externalAthleteId?.(response) ?? null };
}

/** Renouvelle le jeton s'il expire dans moins de cinq minutes ; `null` s'il est encore valable. */
export async function refreshIfNeeded(provider: TrainingDataProvider, refreshToken: string | null, expiresAt: Date | null): Promise<RefreshedTokens | null> {
  if (!provider.oauth || !refreshToken || !expiresAt) return null;
  if (expiresAt.getTime() - Date.now() > 5 * 60_000) return null;
  return toTokens(await tokenRequest(provider, { grant_type: 'refresh_token', refresh_token: refreshToken }), refreshToken);
}
