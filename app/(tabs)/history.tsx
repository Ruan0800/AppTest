import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from 'expo-router/react-navigation';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Layout } from '@/constants/Layout';
import { listAlerts } from '@/src/db/database';
import type { AlertRecord, AlertTrigger } from '@/src/types';

type FilterKey = 'all' | AlertTrigger;

type DaySection = {
  title: string;
  dayKey: string;
  data: AlertRecord[];
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'voice', label: 'Voz' },
  { key: 'manual', label: 'SOS' },
];

function parseAlertDate(value: string): Date | null {
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayLabel(date: Date): string {
  const today = startOfLocalDay(new Date());
  const target = startOfLocalDay(date);
  const diffDays = Math.round(
    (today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000)
  );

  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  return date.toLocaleDateString('pt-BR');
}

function formatTime(value: string): string {
  const date = parseAlertDate(value);
  if (!date) return '--:--';
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function groupAlertsByDay(alerts: AlertRecord[]): DaySection[] {
  const sections = new Map<string, DaySection>();

  for (const alert of alerts) {
    const date = parseAlertDate(alert.created_at);
    if (!date) continue;

    const key = dayKey(date);
    const existing = sections.get(key);
    if (existing) {
      existing.data.push(alert);
    } else {
      sections.set(key, {
        title: dayLabel(date),
        dayKey: key,
        data: [alert],
      });
    }
  }

  return Array.from(sections.values()).sort((a, b) =>
    b.dayKey.localeCompare(a.dayKey)
  );
}

export default function HistoryScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');

  const refresh = useCallback(async () => {
    setAlerts(await listAlerts());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const filteredAlerts = useMemo(() => {
    if (filter === 'all') return alerts;
    return alerts.filter((alert) => alert.trigger === filter);
  }, [alerts, filter]);

  const sections = useMemo(
    () => groupAlertsByDay(filteredAlerts),
    [filteredAlerts]
  );

  const countLabel =
    filteredAlerts.length === 1
      ? '1 alerta'
      : `${filteredAlerts.length} alertas`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View style={styles.hintRow}>
          <Text style={[styles.hint, { color: colors.muted }]}>
            Alertas disparados por voz ou pelo botão SOS.
          </Text>
          <Text style={[styles.counter, { color: colors.muted }]}>
            {countLabel}
          </Text>
        </View>

        <View style={styles.filters}>
          {FILTERS.map((item) => {
            const active = filter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setFilter(item.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Filtrar por ${item.label}`}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: active ? colors.accentSoft : colors.card,
                    borderColor: active ? colors.tint : colors.border,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}>
                <Text
                  style={[
                    styles.chipLabel,
                    { color: active ? colors.tint : colors.muted },
                  ]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        SectionSeparatorComponent={() => <View style={styles.sectionGap} />}
        ListEmptyComponent={
          alerts.length === 0 ? (
            <EmptyState
              icon="history"
              title="Nenhum alerta ainda"
              description="Quando um alerta for disparado, ele aparece aqui com data e status."
            />
          ) : (
            <EmptyState
              icon="filter"
              title="Nenhum alerta deste tipo"
              description="Troque o filtro no topo para ver outros alertas."
            />
          )
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => {
          const isVoice = item.trigger === 'voice';
          const notified = !!item.notified;
          const title = isVoice
            ? item.matched_word
              ? `"${item.matched_word}"`
              : 'Alerta por voz'
            : 'Alerta SOS';
          const statusLabel = notified
            ? 'Notificação enviada'
            : 'Falha na notificação';
          const iconName = isVoice ? 'microphone' : 'exclamation-circle';
          const iconBg = isVoice ? colors.badgeVoiceBg : colors.badgeSosBg;
          const iconColor = isVoice
            ? colors.badgeVoiceText
            : colors.badgeSosText;

          return (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: notified ? colors.card : colors.badgeFailBg,
                  borderColor: notified ? colors.border : colors.warning,
                },
              ]}>
              <View style={[styles.iconBadge, { backgroundColor: iconBg }]}>
                <FontAwesome name={iconName} size={16} color={iconColor} />
              </View>

              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  {title}
                </Text>
                <Text
                  style={[
                    styles.cardStatus,
                    {
                      color: notified ? colors.success : colors.warning,
                    },
                  ]}>
                  {statusLabel}
                </Text>
              </View>

              <Text style={[styles.cardTime, { color: colors.muted }]}>
                {formatTime(item.created_at)}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Layout.screenPadding,
  },
  header: {
    gap: 12,
    marginBottom: 8,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  hint: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  counter: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  list: {
    paddingBottom: 24,
    flexGrow: 1,
    gap: 8,
  },
  sectionGap: {
    height: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
  },
  card: {
    borderWidth: 1,
    borderRadius: Layout.radius,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardStatus: {
    fontSize: 13,
    fontWeight: '500',
  },
  cardTime: {
    fontSize: 13,
    fontWeight: '600',
  },
});
