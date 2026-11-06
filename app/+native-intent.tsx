import { isAuthCallback } from '@/src/auth/authRedirect';
import { rememberAuthUrl } from '@/src/auth/pendingAuthUrl';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    rememberAuthUrl(path);
    if (isAuthCallback(path)) return '/login';
  } catch {
    return '/login';
  }
  return path;
}
