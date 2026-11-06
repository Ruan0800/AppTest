import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeText } from '@/src/domain/keywordMatcher';
import {
  startForegroundListening,
  stopForegroundListening,
} from '@/src/device/foregroundService';
import { isListening, stopListening } from '@/src/device/listeningService';

/** Nome do asset gerado pelo config plugin do react-native-vosk. */
export const VOSK_MODEL_ASSET = 'model-small-pt';

export const POC_PHRASES = [
  'abacaxi azul',
  'fecha a janela',
  'me liga depois',
  'chave do carro',
] as const;

export const POC_GRAMMAR: string[] = [...POC_PHRASES, '[unk]'];

export const POC_SCENARIOS = [
  { id: 'normal', label: 'Normal' },
  { id: 'bolso', label: 'Bolso' },
  { id: 'rua', label: 'Rua' },
  { id: 'tv', label: 'TV' },
  { id: 'voz_baixa', label: 'Voz baixa' },
] as const;

export type PocScenarioId = (typeof POC_SCENARIOS)[number]['id'];
export type PocPhrase = (typeof POC_PHRASES)[number];

/** Janela para falar depois de marcar a tentativa (dá tempo de bloquear a tela). */
export const POC_TRIAL_MS = 30_000;

const STORAGE_KEY = 'vigintel.voskPoc.v1';
const DUPLICATE_MS = 2500;
const MAX_EVENTS = 300;

export type PocEventKind = 'hit' | 'miss' | 'false_positive';

export type PocEvent = {
  id: string;
  at: number;
  kind: PocEventKind;
  phrase: string | null;
  scenario: PocScenarioId;
  latencyMs: number | null;
  heard: string;
};

export type PocTrial = {
  phrase: string;
  startedAt: number;
  deadline: number;
  /** Primeiro texto parcial: aproxima o início da fala, sem o tempo de bloquear a tela. */
  speechStartedAt: number | null;
  heardAt: number | null;
};

export type PocModelStatus = 'idle' | 'loading' | 'ready' | 'error';

export type PocState = {
  hydrated: boolean;
  modelStatus: PocModelStatus;
  listening: boolean;
  partial: string;
  lastHeard: string;
  notice: string | null;
  scenario: PocScenarioId;
  trial: PocTrial | null;
  events: PocEvent[];
  listenMsByScenario: Record<PocScenarioId, number>;
};

type VoskModule = typeof import('react-native-vosk');

type Listener = (state: PocState) => void;

const listeners = new Set<Listener>();

let modelStatus: PocModelStatus = 'idle';
let listening = false;
let partial = '';
let lastHeard = '';
let notice: string | null = null;
let scenario: PocScenarioId = 'normal';
let trial: PocTrial | null = null;
let events: PocEvent[] = [];
let listenMsByScenario = emptyListenMs();
let segmentStartedAt: number | null = null;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let loadPromise: Promise<void> | null = null;
let wired = false;
let trialTimer: ReturnType<typeof setTimeout> | null = null;
let lastScoredPhrase = '';
let lastScoredAt = 0;
let voskApi: VoskModule | null = null;

function emptyListenMs(): Record<PocScenarioId, number> {
  return {
    normal: 0,
    bolso: 0,
    rua: 0,
    tv: 0,
    voz_baixa: 0,
  };
}

function snapshotListenMs(now = Date.now()): Record<PocScenarioId, number> {
  const copy = { ...listenMsByScenario };
  if (listening && segmentStartedAt != null) {
    copy[scenario] += now - segmentStartedAt;
  }
  return copy;
}

function getState(): PocState {
  return {
    hydrated,
    modelStatus,
    listening,
    partial,
    lastHeard,
    notice,
    scenario,
    trial: trial ? { ...trial } : null,
    events: events.slice(),
    listenMsByScenario: snapshotListenMs(),
  };
}

function emit() {
  const state = getState();
  listeners.forEach((listener) => listener(state));
}

export function subscribePoc(listener: Listener) {
  listeners.add(listener);
  listener(getState());
  return () => listeners.delete(listener);
}

export function getPocState(): PocState {
  return getState();
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return 'Falha desconhecida no Vosk.';
}

async function getVosk(): Promise<VoskModule> {
  if (voskApi) return voskApi;
  try {
    // Import tardio: o binário antigo ainda não tem o módulo nativo.
    voskApi = await import('react-native-vosk');
    return voskApi;
  } catch (error) {
    throw new Error(
      `O Vosk nativo ainda não está neste build. Rode npx expo run:android e abra o app de novo.\n${errorMessage(error)}`
    );
  }
}

function ensureWired(api: VoskModule) {
  if (wired) return;
  wired = true;
  api.onResult((text) => handleResult(text));
  api.onPartialResult((text) => handlePartial(text));
  api.onFinalResult((text) => {
    if (text) lastHeard = text;
    emit();
  });
  api.onError((error) => {
    notice = errorMessage(error);
    emit();
  });
  api.onTimeout(() => {
    listening = false;
    flushSegment();
    notice = 'O reconhecedor encerrou sozinho.';
    void stopForegroundListening();
    emit();
    void persist();
  });
}

function cleanHeard(value: string): string {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchPocPhrase(heard: string): string | null {
  const cleaned = cleanHeard(heard);
  if (!cleaned || cleaned === 'unk') return null;
  for (const phrase of POC_PHRASES) {
    if (cleaned === phrase) return phrase;
  }
  return null;
}

function flushSegment(now = Date.now()) {
  if (!listening || segmentStartedAt == null) return;
  listenMsByScenario[scenario] += now - segmentStartedAt;
  segmentStartedAt = now;
}

function pushEvent(event: Omit<PocEvent, 'id'>) {
  events = [{ ...event, id: `${event.at}-${events.length}` }, ...events].slice(
    0,
    MAX_EVENTS
  );
}

function clearTrialTimer() {
  if (trialTimer) {
    clearTimeout(trialTimer);
    trialTimer = null;
  }
}

function finishMiss(expired: PocTrial) {
  pushEvent({
    at: Date.now(),
    kind: 'miss',
    phrase: expired.phrase,
    scenario,
    latencyMs: null,
    heard: '',
  });
  void persist();
}

export async function hydratePoc(): Promise<void> {
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as {
            events?: PocEvent[];
            listenMsByScenario?: Record<PocScenarioId, number>;
            scenario?: PocScenarioId;
          };
          if (Array.isArray(saved.events)) events = saved.events;
          if (saved.listenMsByScenario) {
            listenMsByScenario = {
              ...emptyListenMs(),
              ...saved.listenMsByScenario,
            };
          }
          if (saved.scenario && saved.scenario in emptyListenMs()) {
            scenario = saved.scenario;
          }
        }
      } catch {
        // Sessão corrompida não impede o teste.
      } finally {
        hydrated = true;
        emit();
      }
    })();
  }
  await hydratePromise;
}

async function persist() {
  flushSegment();
  const payload = {
    events,
    listenMsByScenario,
    scenario,
  };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // A medição em memória continua valendo nesta sessão.
  }
}

export async function loadPocModel(): Promise<void> {
  if (modelStatus === 'ready') return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    modelStatus = 'loading';
    notice = null;
    emit();
    try {
      const api = await getVosk();
      ensureWired(api);
      await api.loadModel(VOSK_MODEL_ASSET);
      modelStatus = 'ready';
      notice = null;
    } catch (error) {
      modelStatus = 'error';
      notice = errorMessage(error);
    } finally {
      loadPromise = null;
      emit();
    }
  })();

  return loadPromise;
}

export async function startPocListening(): Promise<void> {
  await hydratePoc();
  await loadPocModel();
  if (modelStatus !== 'ready') return;
  if (listening) return;

  notice = null;
  emit();

  try {
    if (isListening()) {
      await stopListening();
    }
    await startForegroundListening();

    const api = await getVosk();
    ensureWired(api);
    await api.start({ grammar: POC_GRAMMAR });

    listening = true;
    segmentStartedAt = Date.now();
    notice = 'Pode bloquear a tela e falar.';
    emit();
  } catch (error) {
    listening = false;
    segmentStartedAt = null;
    notice = errorMessage(error);
    await stopForegroundListening();
    emit();
  }
}

export async function stopPocListening(): Promise<void> {
  clearTrialTimer();
  trial = null;
  flushSegment();
  listening = false;
  segmentStartedAt = null;
  partial = '';

  try {
    voskApi?.stop();
  } catch {
    // ignore
  }
  await stopForegroundListening();
  notice = 'Escuta pausada. A proteção da tela inicial continua desligada.';
  emit();
  await persist();
}

export function setPocScenario(next: PocScenarioId) {
  if (next === scenario) return;
  flushSegment();
  scenario = next;
  emit();
  void persist();
}

export function armPocTrial(phrase: string) {
  if (!listening) {
    notice = 'Inicie a escuta antes de marcar uma tentativa.';
    emit();
    return;
  }

  clearTrialTimer();
  const startedAt = Date.now();
  trial = {
    phrase,
    startedAt,
    deadline: startedAt + POC_TRIAL_MS,
    speechStartedAt: null,
    heardAt: null,
  };
  notice = `Fale “${phrase}” em até ${POC_TRIAL_MS / 1000}s. Pode bloquear a tela.`;
  trialTimer = setTimeout(() => {
    const expired = trial;
    trial = null;
    trialTimer = null;
    if (expired) finishMiss(expired);
    notice = `Não reconheceu “${phrase}”.`;
    emit();
  }, POC_TRIAL_MS);
  emit();
}

function handlePartial(text: string) {
  partial = text;
  const phrase = matchPocPhrase(text);
  if (trial && trial.speechStartedAt == null && cleanHeard(text).length > 0) {
    trial.speechStartedAt = Date.now();
  }
  if (phrase && trial && trial.phrase === phrase && trial.heardAt == null) {
    trial.heardAt = Date.now();
  }
  emit();
}

function handleResult(text: string) {
  partial = '';
  lastHeard = text;
  const phrase = matchPocPhrase(text);
  const now = Date.now();

  if (!phrase) {
    emit();
    return;
  }

  if (phrase === lastScoredPhrase && now - lastScoredAt < DUPLICATE_MS) {
    emit();
    return;
  }
  lastScoredPhrase = phrase;
  lastScoredAt = now;

  if (trial && trial.phrase === phrase && now <= trial.deadline) {
    const latencyMs =
      (trial.heardAt ?? now) - (trial.speechStartedAt ?? trial.startedAt);
    clearTrialTimer();
    trial = null;
    pushEvent({
      at: now,
      kind: 'hit',
      phrase,
      scenario,
      latencyMs,
      heard: text,
    });
    notice = `Reconheceu “${phrase}”.`;
  } else {
    pushEvent({
      at: now,
      kind: 'false_positive',
      phrase,
      scenario,
      latencyMs: null,
      heard: text,
    });
    notice = `Falso positivo: “${phrase}”.`;
  }

  emit();
  void persist();
}

export async function resetPocSession(): Promise<void> {
  clearTrialTimer();
  trial = null;
  events = [];
  listenMsByScenario = emptyListenMs();
  if (listening) segmentStartedAt = Date.now();
  notice = 'Contagem zerada.';
  emit();
  await persist();
}

export type PocPhraseStat = {
  phrase: string;
  attempts: number;
  hits: number;
  rate: number | null;
  avgLatencyMs: number | null;
};

export type PocScenarioSummary = {
  attempts: number;
  hits: number;
  rate: number | null;
  falsePositives: number;
  listenMs: number;
  fpPerHour: number | null;
  avgLatencyMs: number | null;
  byPhrase: PocPhraseStat[];
};

export function summarizeScenario(
  state: PocState,
  scenarioId: PocScenarioId
): PocScenarioSummary {
  const scoped = state.events.filter((event) => event.scenario === scenarioId);
  const trials = scoped.filter(
    (event) => event.kind === 'hit' || event.kind === 'miss'
  );
  const hits = scoped.filter((event) => event.kind === 'hit');
  const falsePositives = scoped.filter(
    (event) => event.kind === 'false_positive'
  ).length;
  const listenMs = state.listenMsByScenario[scenarioId] ?? 0;
  const hours = listenMs / 3_600_000;
  const latencies = hits
    .map((event) => event.latencyMs)
    .filter((value): value is number => value != null);

  return {
    attempts: trials.length,
    hits: hits.length,
    rate: trials.length ? hits.length / trials.length : null,
    falsePositives,
    listenMs,
    fpPerHour: hours > 0 ? falsePositives / hours : null,
    avgLatencyMs: latencies.length
      ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
      : null,
    byPhrase: POC_PHRASES.map((phrase) => {
      const phraseTrials = trials.filter((event) => event.phrase === phrase);
      const phraseHits = hits.filter((event) => event.phrase === phrase);
      const phraseLatency = phraseHits
        .map((event) => event.latencyMs)
        .filter((value): value is number => value != null);
      return {
        phrase,
        attempts: phraseTrials.length,
        hits: phraseHits.length,
        rate: phraseTrials.length
          ? phraseHits.length / phraseTrials.length
          : null,
        avgLatencyMs: phraseLatency.length
          ? phraseLatency.reduce((sum, value) => sum + value, 0) /
            phraseLatency.length
          : null,
      };
    }),
  };
}
