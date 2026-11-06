import type { AuthError, Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  AUTH_REDIRECT_URL,
  createSessionFromUrl,
  isAuthCallback,
  linkErrorMessage,
} from '@/src/auth/authRedirect';
import { subscribeAuthUrl } from '@/src/auth/pendingAuthUrl';
import { isSupabaseConfigured, supabase } from '@/src/data/remote/supabase';

const PASSWORD_RECOVERY_KEY = 'vigintel.passwordRecovery';

export type AuthResult =
  | { ok: true; notice?: string }
  | { ok: false; message: string };

type AuthContextValue = {
  session: Session | null;
  initializing: boolean;
  passwordRecovery: boolean;
  linkError: string | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  resetPassword: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function authMessage(error: AuthError): string {
  const code = error.code ?? '';
  const message = error.message.toLowerCase();

  if (
    code === 'invalid_credentials' ||
    message.includes('invalid login credentials')
  ) {
    return 'E-mail ou senha incorretos.';
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar.';
  }
  if (
    code === 'user_already_exists' ||
    message.includes('already registered') ||
    message.includes('already been registered')
  ) {
    return 'Esse e-mail já está cadastrado. Entre com a senha.';
  }
  if (message.includes('password') && message.includes('least')) {
    return 'A senha precisa ter pelo menos 6 caracteres.';
  }
  if (
    code === 'over_request_rate_limit' ||
    message.includes('rate limit') ||
    message.includes('too many')
  ) {
    return 'Muitas tentativas. Espere um pouco e tente de novo.';
  }
  if (message.includes('network') || message.includes('fetch')) {
    return 'Sem conexão com o servidor.';
  }
  if (message.includes('redirect') && (message.includes('not allowed') || message.includes('invalid'))) {
    return 'O servidor recusou o retorno para o app. Tente de novo em instantes.';
  }
  return 'Não foi possível concluir. Tente novamente.';
}

function requireConfig(): AuthResult | null {
  if (isSupabaseConfigured()) return null;
  return {
    ok: false,
    message: 'Login não configurado. Defina a URL e a chave do Supabase no .env e reinicie o app.',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const markPasswordRecovery = useCallback((active: boolean) => {
    setPasswordRecovery(active);
    if (active) {
      void AsyncStorage.setItem(PASSWORD_RECOVERY_KEY, '1');
    } else {
      void AsyncStorage.removeItem(PASSWORD_RECOVERY_KEY);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const inflight = new Map<string, Promise<void>>();

    const consumeUrl = (url: string | null) => {
      if (!url || !isAuthCallback(url)) return Promise.resolve();
      const existing = inflight.get(url);
      if (existing) return existing;

      const task = (async () => {
        try {
          const kind = await createSessionFromUrl(url);
          if (!mounted || !kind) return;
          setLinkError(null);
          if (kind === 'recovery') markPasswordRecovery(true);
        } catch (error) {
          if (mounted) setLinkError(linkErrorMessage(error));
        }
      })();

      inflight.set(url, task);
      return task;
    };

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') markPasswordRecovery(true);
    });

    const unsubscribeUrl = subscribeAuthUrl((url) => {
      void consumeUrl(url);
    });
    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      void consumeUrl(url);
    });

    void (async () => {
      try {
        const [initialUrl, storedRecovery] = await Promise.all([
          Linking.getInitialURL(),
          AsyncStorage.getItem(PASSWORD_RECOVERY_KEY),
        ]);
        await consumeUrl(initialUrl);
        const { data: sessionData } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(sessionData.session);
        if (storedRecovery === '1' && sessionData.session) {
          setPasswordRecovery(true);
        }
      } catch {
        if (mounted) setSession(null);
      } finally {
        if (mounted) setInitializing(false);
      }
    })();

    return () => {
      mounted = false;
      unsubscribeUrl();
      linkingSub.remove();
      data.subscription.unsubscribe();
    };
  }, [markPasswordRecovery]);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const missing = requireConfig();
    if (missing) return missing;

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { ok: false, message: authMessage(error) };
    return { ok: true };
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const missing = requireConfig();
    if (missing) return missing;

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: AUTH_REDIRECT_URL },
    });
    if (error) return { ok: false, message: authMessage(error) };
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      return {
        ok: false,
        message: 'Esse e-mail já está cadastrado. Entre com a senha.',
      };
    }
    if (!data.session) {
      return {
        ok: true,
        notice:
          'Enviamos um e-mail de confirmação. Abra nesse celular e toque no link para entrar.',
      };
    }
    return { ok: true };
  }, []);

  const resetPassword = useCallback(async (email: string): Promise<AuthResult> => {
    const missing = requireConfig();
    if (missing) return missing;

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: AUTH_REDIRECT_URL,
    });
    if (error) return { ok: false, message: authMessage(error) };
    return {
      ok: true,
      notice:
        'Se esse e-mail estiver cadastrado, enviamos o link. Abra o e-mail neste celular e toque nele para escolher a nova senha.',
    };
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<AuthResult> => {
    const missing = requireConfig();
    if (missing) return missing;

    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, message: authMessage(error) };
    markPasswordRecovery(false);
    return { ok: true };
  }, [markPasswordRecovery]);

  const signOut = useCallback(async () => {
    markPasswordRecovery(false);
    await supabase.auth.signOut();
  }, [markPasswordRecovery]);

  const value = useMemo(
    () => ({
      session,
      initializing,
      passwordRecovery,
      linkError,
      signIn,
      signUp,
      resetPassword,
      updatePassword,
      signOut,
    }),
    [
      session,
      initializing,
      passwordRecovery,
      linkError,
      signIn,
      signUp,
      resetPassword,
      updatePassword,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return ctx;
}
