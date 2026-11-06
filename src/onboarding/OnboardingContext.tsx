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
  hasCompletedOnboarding,
  markOnboardingCompleted,
} from '@/src/onboarding/onboardingStorage';

type OnboardingState = {
  completed: boolean | null;
  complete: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [completed, setCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    hasCompletedOnboarding()
      .then((value) => {
        if (alive) setCompleted(value);
      })
      .catch(() => {
        if (alive) setCompleted(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const complete = useCallback(async () => {
    try {
      await markOnboardingCompleted();
    } finally {
      setCompleted(true);
    }
  }, []);

  const value = useMemo(() => ({ completed, complete }), [completed, complete]);

  return (
    <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingState {
  const value = useContext(OnboardingContext);
  if (!value) {
    throw new Error('useOnboarding precisa do OnboardingProvider.');
  }
  return value;
}
