import FontAwesome from '@expo/vector-icons/FontAwesome';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Layout } from '@/constants/Layout';

type Props = {
  icon: ComponentProps<typeof FontAwesome>['name'];
  onPress: () => void;
  accessibilityLabel: string;
  tone?: 'default' | 'destructive';
};

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  tone = 'default',
}: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const color = tone === 'destructive' ? colors.destructive : colors.muted;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={Layout.hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: tone === 'destructive' ? `${colors.destructive}14` : colors.accentSoft,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <FontAwesome name={icon} size={16} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
