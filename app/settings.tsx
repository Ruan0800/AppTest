import FontAwesome from '@expo/vector-icons/FontAwesome';
import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router/react-navigation';
import { useCallback, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import notifee from '@notifee/react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Layout } from '@/constants/Layout';
import { clearAlerts } from '@/src/db/database';
import {
  COOLDOWN_OPTIONS_SECONDS,
  getAppSettings,
  updateAppSettings,
  type AppSettings,
} from '@/src/settings/appSettings';

export default function SettingsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [clearing, setClearing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void getAppSettings().then(setSettings);
    }, [])
  );

  const appVersion =
    Constants.expoConfig?.version ??
    Constants.nativeAppVersion ??
    '1.0.0';

  const onToggleConfirmSos = async (value: boolean) => {
    const next = await updateAppSettings({ confirmSos: value });
    setSettings(next);
  };

  const onSelectCooldown = async (seconds: number) => {
    const next = await updateAppSettings({ cooldownSeconds: seconds });
    setSettings(next);
  };

  const onBatteryOptimization = () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Indisponível', 'Essa opção está disponível apenas no Android.');
      return;
    }
    void notifee.openBatteryOptimizationSettings();
  };

  const onClearHistory = () => {
    Alert.alert(
      'Apagar histórico',
      'Isso remove todos os alertas registrados neste aparelho. Não dá para desfazer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              await clearAlerts();
              Alert.alert('Pronto', 'Histórico apagado.');
            } catch {
              Alert.alert('Erro', 'Não foi possível apagar o histórico.');
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  };

  if (!settings) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]} />
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <Text style={[styles.sectionTitle, { color: colors.muted }]}>
        ESCUTA E ALERTA
      </Text>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>
          Intervalo entre alertas
        </Text>
        <Text style={[styles.rowHint, { color: colors.muted }]}>
          Tempo mínimo entre disparos por voz. O SOS ignora esse intervalo.
        </Text>
        <View style={styles.chips}>
          {COOLDOWN_OPTIONS_SECONDS.map((seconds) => {
            const active = settings.cooldownSeconds === seconds;
            return (
              <Pressable
                key={seconds}
                onPress={() => void onSelectCooldown(seconds)}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: active ? colors.accentSoft : colors.background,
                    borderColor: active ? colors.tint : colors.border,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}>
                <Text
                  style={[
                    styles.chipLabel,
                    { color: active ? colors.tint : colors.muted },
                  ]}>
                  {seconds}s
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View
        style={[
          styles.card,
          styles.rowHorizontal,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>
            Confirmar SOS
          </Text>
          <Text style={[styles.rowHint, { color: colors.muted }]}>
            Pede confirmação antes de disparar o botão SOS.
          </Text>
        </View>
        <Switch
          value={settings.confirmSos}
          onValueChange={(value) => void onToggleConfirmSos(value)}
          trackColor={{ false: colors.border, true: colors.switchTrackOn }}
          thumbColor={settings.confirmSos ? colors.tint : colors.switchThumbOff}
        />
      </View>

      <Pressable
        onPress={onBatteryOptimization}
        style={({ pressed }) => [
          styles.card,
          styles.rowHorizontal,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.9 : 1,
          },
        ]}>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>
            Otimização de bateria
          </Text>
          <Text style={[styles.rowHint, { color: colors.muted }]}>
            Abre as configurações do Android para melhorar a escuta em segundo plano.
          </Text>
        </View>
        <FontAwesome name="external-link" size={16} color={colors.muted} />
      </Pressable>

      <Text style={[styles.sectionTitle, { color: colors.muted, marginTop: 8 }]}>
        DADOS
      </Text>

      <Pressable
        onPress={onClearHistory}
        disabled={clearing}
        style={({ pressed }) => [
          styles.card,
          styles.rowHorizontal,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed || clearing ? 0.85 : 1,
          },
        ]}>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: colors.destructive }]}>
            Apagar histórico
          </Text>
          <Text style={[styles.rowHint, { color: colors.muted }]}>
            Remove todos os alertas salvos neste aparelho.
          </Text>
        </View>
        <FontAwesome name="trash-o" size={18} color={colors.destructive} />
      </Pressable>

      <Text style={[styles.sectionTitle, { color: colors.muted, marginTop: 8 }]}>
        SOBRE
      </Text>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}>
        <Text style={[styles.aboutBrand, { color: colors.tint }]}>Vigintel</Text>
        <Text style={[styles.rowHint, { color: colors.muted }]}>
          Monitoramento por voz com alerta rápido para contatos de emergência.
        </Text>
        <Text style={[styles.version, { color: colors.text }]}>
          Versão {appVersion}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Layout.screenPadding,
    paddingBottom: 40,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 2,
    marginTop: 4,
  },
  card: {
    borderWidth: 1,
    borderRadius: Layout.radius,
    padding: 14,
    gap: 8,
  },
  rowHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  rowHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
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
  aboutBrand: {
    fontSize: 18,
    fontWeight: '800',
  },
  version: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
});
