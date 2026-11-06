import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { Layout } from '@/constants/Layout';
import {
  POC_SCENARIOS,
  POC_TRIAL_MS,
  armPocTrial,
  hydratePoc,
  loadPocModel,
  resetPocSession,
  setPocScenario,
  startPocListening,
  stopPocListening,
  subscribePoc,
  summarizeScenario,
  type PocScenarioId,
  type PocState,
} from '@/src/device/voskPoc';

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes} min ${seconds}s`;
  return `${seconds} s`;
}

function formatLatency(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatRate(rate: number | null): string {
  if (rate == null) return '—';
  return `${Math.round(rate * 100)}%`;
}

function formatPerHour(value: number | null): string {
  if (value == null) return '—';
  if (value < 10) return value.toFixed(1);
  return String(Math.round(value));
}

export default function VoskPocScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [state, setState] = useState<PocState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribePoc(setState);
    void hydratePoc().then(() => loadPocModel());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  if (!state) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  }

  const summary = summarizeScenario(state, state.scenario);
  const trialLeft = state.trial
    ? Math.max(0, state.trial.deadline - now)
    : 0;
  const normal = summarizeScenario(state, 'normal');
  const tv = summarizeScenario(state, 'tv');
  const normalOk = normal.rate != null && normal.rate >= 0.85;
  const tvOk = tv.listenMs >= 60 * 60 * 1000 && tv.falsePositives === 0;

  const onToggle = async () => {
    setBusy(true);
    try {
      if (state.listening) await stopPocListening();
      else await startPocListening();
    } finally {
      setBusy(false);
    }
  };

  const onReset = () => {
    Alert.alert(
      'Zerar contagem',
      'Apaga tentativas, falsos positivos e o tempo de escuta desta prova.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Zerar',
          style: 'destructive',
          onPress: () => {
            void resetPocSession();
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}>
      <Text style={[styles.lead, { color: colors.muted }]}>
        Gramática restrita nas 4 frases abaixo, mais [unk]. Aperte “Vou falar”,
        bloqueie o celular e diga a frase.
      </Text>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}>
        <Text style={[styles.cardLabel, { color: colors.muted }]}>Modelo</Text>
        <Text style={[styles.cardValue, { color: colors.text }]}>
          {state.modelStatus === 'ready'
            ? 'vosk-model-small-pt carregado'
            : state.modelStatus === 'loading'
              ? 'Carregando modelo…'
              : state.modelStatus === 'error'
                ? 'Modelo não carregou'
                : 'Aguardando'}
        </Text>
        <Text style={[styles.cardLabel, { color: colors.muted }]}>
          Último texto
        </Text>
        <Text style={[styles.heard, { color: colors.text }]}>
          {state.partial || state.lastHeard || '—'}
        </Text>
        {state.notice ? (
          <Text style={[styles.notice, { color: colors.tint }]}>
            {state.notice}
          </Text>
        ) : null}
      </View>

      <Button
        label={
          busy
            ? 'Aguarde…'
            : state.listening
              ? 'Parar escuta'
              : 'Iniciar escuta'
        }
        onPress={() => {
          void onToggle();
        }}
        disabled={busy || state.modelStatus === 'loading'}
      />

      <Text style={[styles.section, { color: colors.text }]}>Cenário</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}>
        {POC_SCENARIOS.map((item) => {
          const selected = item.id === state.scenario;
          return (
            <Pressable
              key={item.id}
              onPress={() => setPocScenario(item.id as PocScenarioId)}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? colors.tint : colors.card,
                  borderColor: selected ? colors.tint : colors.border,
                },
              ]}>
              <Text
                style={{
                  color: selected ? '#FFFFFF' : colors.text,
                  fontWeight: '700',
                }}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}>
        <Text style={[styles.cardValue, { color: colors.text }]}>
          Acerto {formatRate(summary.rate)} ({summary.hits}/{summary.attempts})
        </Text>
        <Text style={[styles.meta, { color: colors.muted }]}>
          Latência média {formatLatency(summary.avgLatencyMs)}
        </Text>
        <Text style={[styles.meta, { color: colors.muted }]}>
          Falsos positivos {summary.falsePositives} em{' '}
          {formatDuration(summary.listenMs)}
          {summary.fpPerHour != null
            ? ` (≈ ${formatPerHour(summary.fpPerHour)}/h)`
            : ''}
        </Text>
      </View>

      {state.trial ? (
        <View style={[styles.trial, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.cardValue, { color: colors.tint }]}>
            Fale “{state.trial.phrase}”
          </Text>
          <Text style={[styles.meta, { color: colors.text }]}>
            {Math.ceil(trialLeft / 1000)}s restantes
          </Text>
        </View>
      ) : null}

      <Text style={[styles.section, { color: colors.text }]}>Frases</Text>
      {summary.byPhrase.map((item) => (
        <View
          key={item.phrase}
          style={[
            styles.phraseRow,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}>
          <View style={styles.phraseText}>
            <Text style={[styles.phraseTitle, { color: colors.text }]}>
              {item.phrase}
            </Text>
            <Text style={[styles.meta, { color: colors.muted }]}>
              {item.hits}/{item.attempts} · {formatRate(item.rate)} ·{' '}
              {formatLatency(item.avgLatencyMs)}
            </Text>
          </View>
          <Pressable
            onPress={() => armPocTrial(item.phrase)}
            disabled={!state.listening}
            style={[
              styles.speak,
              {
                backgroundColor: state.listening ? colors.tint : colors.border,
              },
            ]}>
            <Text style={styles.speakLabel}>Vou falar</Text>
          </Pressable>
        </View>
      ))}

      <Text style={[styles.hint, { color: colors.muted }]}>
        Sem apertar “Vou falar”, qualquer frase detectada conta como falso
        positivo. Para a TV, deixe o cenário em TV, inicie a escuta e não fale
        por cerca de 1 hora. Cada tentativa dura {POC_TRIAL_MS / 1000}s.
      </Text>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}>
        <Text style={[styles.cardLabel, { color: colors.muted }]}>
          Critério para seguir
        </Text>
        <Text style={{ color: normalOk ? colors.success : colors.text }}>
          Normal: {formatRate(normal.rate)} (meta acima de 85%)
        </Text>
        <Text style={{ color: tvOk ? colors.success : colors.text }}>
          TV: {tv.falsePositives} falso(s) em {formatDuration(tv.listenMs)}{' '}
          (meta ~0 em 1 h)
        </Text>
      </View>

      <Text style={[styles.section, { color: colors.text }]}>Registro</Text>
      {state.events.length === 0 ? (
        <Text style={[styles.hint, { color: colors.muted }]}>
          Nenhuma detecção ainda.
        </Text>
      ) : (
        state.events.slice(0, 12).map((event) => (
          <Text
            key={event.id}
            style={[styles.logLine, { color: colors.text }]}>
            {event.kind === 'hit'
              ? 'Acerto'
              : event.kind === 'miss'
                ? 'Errou'
                : 'Falso positivo'}
            {' · '}
            {event.phrase ?? '—'}
            {' · '}
            {event.scenario}
            {event.latencyMs != null
              ? ` · ${formatLatency(event.latencyMs)}`
              : ''}
          </Text>
        ))
      )}

      <Button label="Zerar contagem" variant="secondary" onPress={onReset} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lead: {
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderWidth: 1,
    borderRadius: Layout.radius,
    padding: 16,
    gap: 6,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cardValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  heard: {
    fontSize: 15,
    lineHeight: 21,
  },
  notice: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  section: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  chips: {
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  meta: {
    fontSize: 13,
    lineHeight: 18,
  },
  trial: {
    borderRadius: Layout.radius,
    padding: 16,
    gap: 4,
  },
  phraseRow: {
    borderWidth: 1,
    borderRadius: Layout.radius,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  phraseText: {
    flex: 1,
    gap: 2,
  },
  phraseTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  speak: {
    borderRadius: Layout.radiusSm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  speakLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
  },
  logLine: {
    fontSize: 14,
    lineHeight: 20,
  },
});
