import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Layout } from '@/constants/Layout';

type Props = TextInputProps & {
  label?: string;
  hint?: string;
};

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, hint, style, ...rest },
  ref
) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            color: colors.text,
          },
          style,
        ]}
        {...rest}
      />
      {hint ? (
        <Text style={[styles.hint, { color: colors.muted }]}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: Layout.radiusSm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
  },
});
