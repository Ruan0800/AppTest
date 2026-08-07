import { useThemeMode } from '@/src/theme/ThemeContext';

export function useColorScheme(): 'light' | 'dark' {
  try {
    return useThemeMode().theme;
  } catch {
    return 'light';
  }
}
