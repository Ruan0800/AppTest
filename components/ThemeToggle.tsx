import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Pressable, StyleSheet } from 'react-native';

import Colors from '@/constants/Colors';
import { useThemeMode } from '@/src/theme/ThemeContext';

type Props = {
  color?: string;
};

export function ThemeToggle({ color }: Props) {
  const { theme, toggleTheme } = useThemeMode();
  const colors = Colors[theme];

  return (
    <Pressable
      onPress={toggleTheme}
      accessibilityRole="button"
      accessibilityLabel={
        theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'
      }
      hitSlop={10}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}>
      <FontAwesome
        name={theme === 'light' ? 'moon-o' : 'sun-o'}
        size={20}
        color={color ?? colors.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    marginRight: 16,
    padding: 4,
  },
});
