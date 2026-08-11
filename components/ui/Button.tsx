import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Layout } from '@/constants/Layout';

type Variant = 'primary' | 'secondary';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  style,
  accessibilityLabel,
}: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.base,
        isPrimary
          ? { backgroundColor: colors.tint }
          : {
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            },
        (pressed || disabled) && { opacity: 0.85 },
        style,
      ]}>
      <Text
        style={[
          styles.label,
          { color: isPrimary ? '#FFFFFF' : colors.text },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Layout.radiusSm,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  label: {
    fontWeight: '700',
    fontSize: 15,
  },
});
