import { useThemeMode } from '@/src/theme/ThemeContext';

/** Tema efetivo do app (padrão claro; controlado pelo toggle). */
export function useColorScheme(): 'light' | 'dark' {
  const { theme } = useThemeMode();
  return theme;
}
