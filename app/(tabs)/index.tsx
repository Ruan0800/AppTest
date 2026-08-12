import FontAwesome from '@expo/vector-icons/FontAwesome';
import notifee from '@notifee/react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Layout } from '@/constants/Layout';
import { listContacts, listKeywords } from '@/src/db/database';
import { requestAlertPermissions, triggerAlert } from '@/src/services/alertService';
import {
  isListening,
  startListening,
  stopListening,
  subscribeListeningStatus,
  subscribeTranscript,
} from '@/src/services/listeningService';
import {
  getAlertLocation,
  type AlertLocation,
} from '@/src/services/locationService';
import { getAppSettings } from '@/src/settings/appSettings';
import type { Contact, ListeningStatus } from '@/src/types';

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const pulse = useRef(new Animated.Value(0)).current;

  const [status, setStatus] = useState<ListeningStatus>(
    isListening() ? 'listening' : 'idle'
  );
  const [transcript, setTranscript] = useState('');
  const [busy, setBusy] = useState(false);
  const [sosBusy, setSosBusy] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [location, setLocation] = useState<AlertLocation | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  useEffect(() => {
    const unsubStatus = subscribeListeningStatus(setStatus);
    const unsubTranscript = subscribeTranscript(setTranscript);
    return () => {
      unsubStatus();
      unsubTranscript();
    };
  }, []);

  const refreshSummary = useCallback(async () => {
    const [kw, ct] = await Promise.all([listKeywords(), listContacts()]);
    setKeywords(kw.map((k) => k.word));
    setContacts(ct);
  }, []);

  const refreshLocation = useCallback(async () => {
    setLocationLoading(true);
    try {
      const loc = await getAlertLocation();
      setLocation(loc);
    } finally {
      setLocationLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshSummary();
      void refreshLocation();
    }, [refreshSummary, refreshLocation])
  );

  const listeningOn = status === 'listening' || status === 'starting';

  useEffect(() => {
    if (!listeningOn) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [listeningOn, pulse]);

  const statusMeta = useMemo(() => {
    if (status === 'listening') {
      return { title: 'Protegido', subtitle: 'Escuta ativa', dot: colors.tint };
    }
    if (status === 'starting') {
      return { title: 'Iniciando…', subtitle: 'Preparando escuta', dot: colors.starting };
    }
    if (status === 'error') {
      return {
        title: 'Atenção',
        subtitle: 'Tente ligar a escuta de novo',
        dot: colors.danger,
      };
    }
    return {
      title: 'Desprotegido',
      subtitle: 'Ligue a escuta para monitorar',
      dot: colors.muted,
    };
  }, [status, colors.tint, colors.muted, colors.starting, colors.danger]);

  const toggleListening = useCallback(async (value: boolean) => {
    setBusy(true);
    try {
      if (value) {
        const notified = await requestAlertPermissions();
        if (!notified) {
          Alert.alert(
            'Notificações',
            'Permita notificações para receber alertas quando uma palavra-chave for detectada.'
          );
        }
        await startListening();

        // OEM/bateria: se a otimização estiver ligada, a escuta em background pode falhar.
        if (Platform.OS === 'android') {
          try {
            const batteryOptimized =
              await notifee.isBatteryOptimizationEnabled();
            if (batteryOptimized) {
              Alert.alert(
                'Melhorar escuta em segundo plano',
                'Desative a otimização de bateria para este app. Assim a escuta e o alerta funcionam melhor com a tela bloqueada.',
                [
                  { text: 'Agora não', style: 'cancel' },
                  {
                    text: 'Abrir configurações',
                    onPress: () => {
                      void notifee.openBatteryOptimizationSettings();
                    },
                  },
                ]
              );
            }
          } catch {
            // API indisponível em alguns aparelhos
          }
        }
      } else {
        await stopListening();
      }
    } catch (error) {
      Alert.alert(
        'Erro na escuta',
        error instanceof Error ? error.message : 'Não foi possível iniciar a escuta.'
      );
      setStatus('error');
    } finally {
      setBusy(false);
    }
  }, []);

  const runSosAlert = useCallback(async () => {
    setSosBusy(true);
    try {
      // Não espera diálogos de permissão aqui — isso travava o botão.
      void requestAlertPermissions();

      const result = await triggerAlert({ trigger: 'manual', force: true });
      if (!result.triggered) {
        Alert.alert(
          'Aguarde',
          'Um alerta foi disparado recentemente. Tente de novo em alguns segundos.'
        );
        return;
      }

      const parts = [
        result.notified ? 'Notificação local enviada.' : 'Notificação local falhou.',
        result.hasLocation
          ? 'Localização incluída na mensagem.'
          : 'Localização indisponível (permita o GPS).',
        result.contactsCount === 0
          ? 'Nenhum contato cadastrado — cadastre em Contatos para abrir o WhatsApp.'
          : result.whatsappOpened > 0
            ? `WhatsApp aberto para ${result.whatsappOpened} contato(s). Confirme o envio no app.`
            : result.pendingWhatsApp
              ? 'WhatsApp pendente: toque na notificação "Abrir WhatsApp" (em background o Android bloqueia a abertura automática).'
              : 'Não foi possível abrir o WhatsApp. Verifique se está instalado e se o telefone tem DDI.',
      ];

      Alert.alert('Alerta disparado', parts.join('\n'));

      void refreshSummary();
      void refreshLocation();
    } catch {
      Alert.alert('Erro', 'Não foi possível disparar o alerta.');
    } finally {
      setSosBusy(false);
    }
  }, [refreshSummary, refreshLocation]);

  const onSos = useCallback(async () => {
    const settings = await getAppSettings();
    if (settings.confirmSos) {
      Alert.alert(
        'Confirmar SOS',
        'Disparar alerta de emergência agora?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Disparar',
            style: 'destructive',
            onPress: () => {
              void runSosAlert();
            },
          },
        ]
      );
      return;
    }
    await runSosAlert();
  }, [runSosAlert]);

  const keywordBody =
    keywords.length === 0
      ? 'Nenhuma palavra cadastrada.\nToque para adicionar.'
      : keywords.slice(0, 4).join('  ·  ') +
        (keywords.length > 4 ? `\n+${keywords.length - 4} mais` : '');

  const contactsBody =
    contacts.length === 0
      ? 'Nenhum contato cadastrado.\nToque para adicionar.'
      : contacts
          .slice(0, 3)
          .map((c) => `${c.name}\n${c.phone}`)
          .join('\n\n') +
        (contacts.length > 3 ? `\n\n+${contacts.length - 3} mais` : '');

  const locationBody = locationLoading
    ? 'Atualizando localização…'
    : location
      ? location.placeName
      : 'Toque para obter a localização atual';

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0.15],
  });

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>

      <View style={styles.statusBlock}>
        <View style={styles.statusLeft}>
          <View style={styles.titleRow}>
            <View style={[styles.dot, { backgroundColor: statusMeta.dot }]} />
            <Text style={[styles.statusTitle, { color: colors.text }]}>
              {statusMeta.title}
            </Text>
          </View>
          <Text style={[styles.statusSubtitle, { color: colors.muted }]}>
            {statusMeta.subtitle}
          </Text>
        </View>
        {busy ? (
          <ActivityIndicator color={colors.tint} />
        ) : (
          <Switch
            value={listeningOn}
            onValueChange={toggleListening}
            trackColor={{ false: colors.border, true: colors.switchTrackOn }}
            thumbColor={listeningOn ? colors.tint : colors.switchThumbOff}
            accessibilityLabel="Ligar ou desligar escuta"
          />
        )}
      </View>

      <View style={styles.sosArea}>
        <View style={styles.sosStage}>
          {listeningOn ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.sosPulse,
                {
                  backgroundColor: colors.sosRing,
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScale }],
                },
              ]}
            />
          ) : null}
          <Pressable
            onPress={onSos}
            disabled={sosBusy}
            accessibilityRole="button"
            accessibilityLabel="Disparar alerta SOS"
            accessibilityHint="Envia notificação e abre o WhatsApp dos contatos"
            style={({ pressed }) => [
              styles.sosOuter,
              {
                backgroundColor: colors.sosRing,
                opacity: pressed || sosBusy ? 0.9 : 1,
              },
            ]}>
            <View
              style={[
                styles.sosButton,
                { backgroundColor: colors.sos, shadowColor: colors.sos },
              ]}>
              {sosBusy ? (
                <ActivityIndicator color="#fff" size="large" />
              ) : (
                <>
                  <Text style={styles.sosTitle}>SOS</Text>
                  <Text style={styles.sosSubtitle}>Toque para alertar</Text>
                </>
              )}
            </View>
          </Pressable>
        </View>
        {listeningOn && !!transcript ? (
          <Text style={[styles.listeningText, { color: colors.muted }]} numberOfLines={1}>
            “{transcript}”
          </Text>
        ) : (
          <Text style={[styles.sosHint, { color: colors.muted }]}>
            Ou fale uma palavra-chave
          </Text>
        )}
      </View>

      <FeatureCard
        icon="microphone"
        title="Palavras"
        subtitle={`${keywords.length} cadastrada${keywords.length === 1 ? '' : 's'}`}
        body={keywordBody}
        backgroundColor={colors.card}
        titleColor={colors.tint}
        subtitleColor={colors.muted}
        bodyColor={colors.text}
        borderColor={colors.border}
        onPress={() => router.push('/keywords')}
      />

      <FeatureCard
        icon="users"
        title="Contatos"
        subtitle={`${contacts.length} cadastrado${contacts.length === 1 ? '' : 's'}`}
        body={contactsBody}
        backgroundColor={colors.card}
        titleColor={colors.tint}
        subtitleColor={colors.muted}
        bodyColor={colors.text}
        borderColor={colors.border}
        onPress={() => router.push('/contacts')}
      />

      <FeatureCard
        icon="map-marker"
        title="Localização"
        subtitle={location ? 'Atual' : 'GPS'}
        body={locationBody}
        backgroundColor={colors.card}
        titleColor={colors.tint}
        subtitleColor={colors.muted}
        bodyColor={colors.text}
        borderColor={colors.border}
        onPress={() => void refreshLocation()}
      />
    </ScrollView>
  );
}

function FeatureCard({
  icon,
  title,
  subtitle,
  body,
  backgroundColor,
  titleColor,
  subtitleColor,
  bodyColor,
  borderColor,
  onPress,
}: {
  icon: ComponentProps<typeof FontAwesome>['name'];
  title: string;
  subtitle: string;
  body: string;
  backgroundColor: string;
  titleColor: string;
  subtitleColor: string;
  bodyColor: string;
  borderColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.cardWrap,
        { opacity: pressed ? 0.92 : 1 },
      ]}>
      <View style={[styles.card, { backgroundColor, borderColor }]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <View style={[styles.iconBadge, { backgroundColor: `${titleColor}18` }]}>
              <FontAwesome name={icon} size={16} color={titleColor} />
            </View>
            <View style={styles.cardTitleText}>
              <Text style={[styles.cardTitle, { color: titleColor }]}>{title}</Text>
              <Text style={[styles.cardSubtitle, { color: subtitleColor }]}>
                {subtitle}
              </Text>
            </View>
            <FontAwesome name="angle-right" size={18} color={subtitleColor} />
          </View>
        </View>
        <View style={[styles.cardDivider, { backgroundColor: borderColor }]} />
        <Text style={[styles.cardBody, { color: bodyColor }]}>{body}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 8,
    paddingBottom: 120,
  },
  brandTagline: {
    fontSize: 13,
    marginBottom: 12,
  },
  statusBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  statusLeft: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  statusSubtitle: {
    fontSize: 13,
    paddingLeft: 18,
  },
  sosArea: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 22,
  },
  sosStage: {
    width: 210,
    height: 210,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosPulse: {
    position: 'absolute',
    width: 196,
    height: 196,
    borderRadius: 98,
  },
  sosOuter: {
    width: 196,
    height: 196,
    borderRadius: 98,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosButton: {
    width: 164,
    height: 164,
    borderRadius: 82,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.32,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  sosTitle: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 3,
  },
  sosSubtitle: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
    opacity: 0.92,
    fontWeight: '500',
  },
  sosHint: {
    fontSize: 13,
    textAlign: 'center',
  },
  listeningText: {
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  cardWrap: {
    marginBottom: 12,
    borderRadius: Layout.radius,
    overflow: 'hidden',
  },
  card: {
    minHeight: 132,
    borderRadius: Layout.radius,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    justifyContent: 'space-between',
    gap: 14,
  },
  cardHeader: {
    gap: 2,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleText: {
    flex: 1,
    gap: 2,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    opacity: 0.9,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  cardBody: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
});
