import { supabase } from '@/src/data/remote/supabase';

/** Deep link gravado no APK. Precisa estar na lista de redirect do Supabase. */
export const AUTH_REDIRECT_URL = 'escutaalertas://auth-callback';

export type AuthLinkResult = 'recovery' | 'signed-in';

export function isAuthCallback(url: string): boolean {
  const value = url.toLowerCase();
  return (
    value.includes('auth-callback') ||
    value.includes('access_token=') ||
    value.includes('refresh_token=') ||
    value.includes('type=recovery') ||
    value.includes('type=signup') ||
    /[?&#]code=/.test(value)
  );
}

function readParams(url: string): URLSearchParams {
  const params = new URLSearchParams();
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const query =
    queryIndex === -1
      ? ''
      : url.slice(queryIndex + 1, hashIndex === -1 ? undefined : hashIndex);
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex + 1);

  for (const part of [query, hash]) {
    if (!part) continue;
    const parsed = new URLSearchParams(part);
    parsed.forEach((value, key) => {
      params.set(key, value);
    });
  }

  return params;
}

export async function createSessionFromUrl(url: string): Promise<AuthLinkResult | null> {
  if (!isAuthCallback(url)) return null;

  const params = readParams(url);
  const errorCode = params.get('error_code') ?? params.get('error');
  const errorDescription = params.get('error_description');
  if (errorCode || errorDescription) {
    throw new Error(errorDescription || errorCode || 'auth_callback_error');
  }

  const type = params.get('type');
  const code = params.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    const redirectType = (data as { redirectType?: string | null }).redirectType;
    if (redirectType === 'recovery' || type === 'recovery') return 'recovery';
    return 'signed-in';
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return type === 'recovery' ? 'recovery' : 'signed-in';
  }

  return null;
}

export function linkErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('code verifier') || message.includes('pkce')) {
    return 'Abra o link no mesmo celular em que você pediu o e-mail.';
  }
  if (message.includes('expired') || message.includes('invalid') || message.includes('otp')) {
    return 'Esse link expirou. Peça um novo em Esqueci a senha.';
  }
  return 'Não foi possível abrir o link. Peça um novo e-mail e tente de novo.';
}
