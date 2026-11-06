import { isAuthCallback } from '@/src/auth/authRedirect';

type Listener = (url: string) => void;

const listeners = new Set<Listener>();
let pending: string | null = null;

export function rememberAuthUrl(url: string | null | undefined) {
  if (!url || !isAuthCallback(url)) return;
  pending = url;
  listeners.forEach((listener) => listener(url));
}

export function subscribeAuthUrl(listener: Listener) {
  listeners.add(listener);
  if (pending) listener(pending);
  return () => {
    listeners.delete(listener);
  };
}
