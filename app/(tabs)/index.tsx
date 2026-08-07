import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
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
import type { Contact, ListeningStatus } from '@/src/types';

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

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

  const statusMeta = useMemo(() => {
    if (status === 'listening') {
      return { title: 'Protegido', subtitle: 'Escuta ativa', dot: colors.tint };
    }
    if (status === 'starting') {
      return { title: 'Iniciando…', subtitle: 'Preparando escuta', dot: '#93C5FD' };
    }
    if (status === 'error') {
      return {
        title: 'Atenção',
        subtitle: 'Tente ligar a escuta de novo',
        dot: '#F87171',
      };
    }
    return {
      title: 'Desprotegido',
      subtitle: 'Ligue a escuta para monitorar',
      dot: colors.muted,
    };
  }, [status, colors.tint, colors.muted]);

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

  const onSos = useCallback(async () => {
    setSosBusy(true);
    try {
      await requestAlertPermissions();
      const result = await triggerAlert({ trigger: 'manual', force: true });
      if (!result.triggered) {
        Alert.alert(
          'Aguarde',
          'Um alerta foi disparado recentemente. Tente de novo em alguns segundos.'
        );
        return;
      }

      await refreshSummary();
      await refreshLocation();

      const parts = [
        result.notified ? 'Notificação local enviada.' : 'Notificação local falhou.',
        result.hasLocation
          ? 'Localização incluída na mensagem.'
          : 'Localização indisponível (permita o GPS).',
        result.contactsCount === 0
          ? 'Nenhum contato cadastrado — cadastre em Contatos para abrir o WhatsApp.'
          : result.whatsappOpened > 0
            ? `WhatsApp aberto para ${result.whatsappOpened} contato(s). Confirme o envio no app.`
            : 'Não foi possível abrir o WhatsApp. Verifique se está instalado e se o telefone tem DDI.',
      ];

      Alert.alert('Alerta disparado', parts.join('\n'));
    } catch {
      Alert.alert('Erro', 'Não foi possível disparar o alerta.');
    } finally {
      setSosBusy(false);
    }
  }, [refreshSummary, refreshLocation]);

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
            trackColor={{ false: colors.border, true: '#BFDBFE' }}
            thumbColor={listeningOn ? colors.tint : '#F8FAFC'}
          />
        )}
      </View>

      <View style={styles.sosArea}>
        <Pressable
          onPress={onSos}
          disabled={sosBusy}
          style={({ pressed }) => [
            styles.sosOuter,
            {
              backgroundColor:
                colorScheme === 'dark' ? 'rgba(220,38,38,0.18)' : '#FEE2E2',
              opacity: pressed || sosBusy ? 0.9 : 1,
            },
          ]}>
          <View
            style={[
              styles.sosButton,
              { backgroundColor: '#DC2626', shadowColor: '#DC2626' },
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
        backgroundColor={colorScheme === 'dark' ? '#1A2233' : '#F7F8FA'}
        titleColor={colors.tint}
        subtitleColor={colors.muted}
        bodyColor={colorScheme === 'dark' ? '#E2E8F0' : '#1E293B'}
        onPress={() => router.push('/keywords')}
      />

      <FeatureCard
        icon="users"
        title="Contatos"
        subtitle={`${contacts.length} cadastrado${contacts.length === 1 ? '' : 's'}`}
        body={contactsBody}
        backgroundColor={colorScheme === 'dark' ? '#1A2233' : '#F7F8FA'}
        titleColor={colors.tint}
        subtitleColor={colors.muted}
        bodyColor={colorScheme === 'dark' ? '#E2E8F0' : '#1E293B'}
        onPress={() => router.push('/contacts')}
      />

      <FeatureCard
        icon="map-marker"
        title="Localização"
        subtitle={location ? 'Atual' : 'GPS'}
        body={locationBody}
        backgroundColor={colorScheme === 'dark' ? '#1A2233' : '#F7F8FA'}
        titleColor={colors.tint}
        subtitleColor={colors.muted}
        bodyColor={colorScheme === 'dark' ? '#E2E8F0' : '#1E293B'}
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
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.cardWrap,
        { opacity: pressed ? 0.92 : 1 },
      ]}>
      <View style={[styles.card, { backgroundColor }]}>
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
          </View>
        </View>
        <View style={[styles.cardDivider, { backgroundColor: subtitleColor }]} />
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
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 120,
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
    borderRadius: 22,
    overflow: 'hidden',
  },
  card: {
    minHeight: 132,
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 18,
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
    opacity: 0.45,
  },
  cardTitle: {
    fontSize: 20,
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
