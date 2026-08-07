import { useFocusEffect } from 'expo-router/react-navigation';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { listAlerts } from '@/src/db/database';
import type { AlertRecord } from '@/src/types';

function formatDate(value: string) {
  // SQLite datetime('now') is UTC-ish; show as local-friendly string
  const normalized = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
}

export default function HistoryScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);

  const refresh = useCallback(async () => {
    setAlerts(await listAlerts());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.hint, { color: colors.muted }]}>
        Histórico de alertas disparados por voz ou pelo botão SOS.
      </Text>

      <FlatList
        data={alerts}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 40 }}>
            Nenhum alerta registrado ainda.
          </Text>
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.row,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}>
            <View style={styles.rowTop}>
              <Text style={[styles.trigger, { color: colors.tint }]}>
                {item.trigger === 'voice' ? 'Por voz' : 'Manual (SOS)'}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {formatDate(item.created_at)}
              </Text>
            </View>
            <Text style={{ color: colors.text }}>
              {item.matched_word
                ? `Palavra: ${item.matched_word}`
                : 'Sem palavra-chave (alerta manual)'}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
              Notificação: {item.notified ? 'enviada' : 'falhou'}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  list: { gap: 8, paddingBottom: 24 },
  row: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  trigger: { fontWeight: '700', fontSize: 15 },
});
