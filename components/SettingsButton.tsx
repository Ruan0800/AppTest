import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import Colors from '@/constants/Colors';
import { useThemeMode } from '@/src/theme/ThemeContext';

type Props = {
  color?: string;
};

export function SettingsButton({ color }: Props) {
  const router = useRouter();
  const { theme } = useThemeMode();
  const colors = Colors[theme];

  return (
    <Pressable
      onPress={() => router.push('/settings')}
      accessibilityRole="button"
      accessibilityLabel="Abrir configurações"
      hitSlop={10}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}>
      <FontAwesome name="cog" size={20} color={color ?? colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    marginLeft: 16,
    padding: 4,
  },
});
