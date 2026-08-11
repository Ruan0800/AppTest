import FontAwesome from '@expo/vector-icons/FontAwesome';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

type Props = {
  icon: ComponentProps<typeof FontAwesome>['name'];
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <View style={styles.wrap}>
      <View style={[styles.iconBadge, { backgroundColor: colors.accentSoft }]}>
        <FontAwesome name={icon} size={22} color={colors.tint} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.description, { color: colors.muted }]}>
        {description}
      </Text>
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
    gap: 8,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 280,
  },
  action: {
    marginTop: 12,
    minWidth: 180,
  },
});
