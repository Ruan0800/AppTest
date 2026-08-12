import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionResultEvent,
  type ExpoSpeechRecognitionErrorEvent,
} from 'expo-speech-recognition';

import { listKeywords } from '@/src/db/database';
import { triggerAlert } from '@/src/services/alertService';
import {
  startForegroundListening,
  stopForegroundListening,
} from '@/src/services/foregroundService';
import { findMatchingKeyword } from '@/src/services/keywordMatcher';
import type { ListeningStatus } from '@/src/types';

type StatusListener = (status: ListeningStatus) => void;
type TranscriptListener = (transcript: string) => void;

const RESTART_DELAY_MS = 700;
const MIN_START_GAP_MS = 900;

let running = false;
let starting = false;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let lastStartAt = 0;
let subscriptions: Array<{ remove: () => void }> = [];

/** Cache de palavras para não bater no SQLite a cada resultado. */
let cachedKeywords: string[] | null = null;

const statusListeners = new Set<StatusListener>();
const transcriptListeners = new Set<TranscriptListener>();

function setStatus(status: ListeningStatus) {
  statusListeners.forEach((listener) => listener(status));
}

function emitTranscript(transcript: string) {
  transcriptListeners.forEach((listener) => listener(transcript));
}

function clearRestartTimer() {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
}

export function invalidateKeywordCache() {
  cachedKeywords = null;
}

async function getKeywords(): Promise<string[]> {
  if (cachedKeywords) return cachedKeywords;
  const rows = await listKeywords();
  cachedKeywords = rows.map((k) => k.word);
  return cachedKeywords;
}

function safeAbort() {
  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // ignore
    }
  }
}

function scheduleRestart(delayMs = RESTART_DELAY_MS) {
  if (!running) return;
  // Um único timer — evita end + error dispararem dois starts.
  clearRestartTimer();
  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (running) void restartRecognition();
  }, delayMs);
}

async function restartRecognition() {
  if (!running || starting) return;

  const elapsed = Date.now() - lastStartAt;
  if (elapsed < MIN_START_GAP_MS) {
    scheduleRestart(MIN_START_GAP_MS - elapsed + 50);
    return;
  }

  starting = true;
  try {
    safeAbort();
    await new Promise((resolve) => setTimeout(resolve, 180));
    if (!running) return;
    startRecognitionLoop();
  } finally {
    starting = false;
  }
}

async function handleResult(event: ExpoSpeechRecognitionResultEvent) {
  const transcript = event.results?.[0]?.transcript ?? '';
  if (!transcript) return;

  // Interinos só atualizam a UI — não disparam alerta.
  emitTranscript(transcript);
  if (!event.isFinal) return;

  const keywords = await getKeywords();
  const match = findMatchingKeyword(transcript, keywords);

  if (match) {
    await triggerAlert({ trigger: 'voice', matchedWord: match });
  }
}

function handleError(event: ExpoSpeechRecognitionErrorEvent) {
  if (!running) return;

  // Esperados no loop contínuo — reinicia sem piscar status de erro.
  if (
    event.error === 'aborted' ||
    event.error === 'no-speech' ||
    event.error === 'speech-timeout' ||
    event.error === 'client' ||
    event.error === 'busy' ||
    event.error === 'interrupted' ||
    event.error === 'network'
  ) {
    scheduleRestart(
      event.error === 'busy' || event.error === 'network' ? 1400 : RESTART_DELAY_MS
    );
    return;
  }

  console.warn('Speech recognition error:', event.error, event.message);
  // Mantém UI como "listening" se ainda estamos no modo escuta;
  // só mostra erro se for algo mais grave e persistente.
  if (
    event.error === 'not-allowed' ||
    event.error === 'service-not-allowed' ||
    event.error === 'audio-capture'
  ) {
    setStatus('error');
  }
  scheduleRestart(1400);
}

function handleEnd() {
  if (!running) return;
  scheduleRestart(RESTART_DELAY_MS);
}

function startRecognitionLoop() {
  if (!running) return;

  try {
    lastStartAt = Date.now();
    ExpoSpeechRecognitionModule.start({
      lang: 'pt-BR',
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: false,
      addsPunctuation: false,
      androidIntentOptions: {
        EXTRA_LANGUAGE_MODEL: 'web_search',
      },
    });
    setStatus('listening');
  } catch (error) {
    console.warn('Failed to start speech recognition', error);
    if (running) {
      scheduleRestart(1200);
    }
  }
}

export function subscribeListeningStatus(listener: StatusListener) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function subscribeTranscript(listener: TranscriptListener) {
  transcriptListeners.add(listener);
  return () => transcriptListeners.delete(listener);
}

export function isListening(): boolean {
  return running;
}

export async function startListening(): Promise<void> {
  if (running) return;

  setStatus('starting');

  const permissions =
    await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!permissions.granted) {
    setStatus('error');
    throw new Error('Permissão de microfone/reconhecimento de voz negada');
  }

  running = true;
  starting = false;
  clearRestartTimer();
  invalidateKeywordCache();

  subscriptions.forEach((s) => s.remove());
  subscriptions = [
    ExpoSpeechRecognitionModule.addListener('result', (event) => {
      void handleResult(event);
    }),
    ExpoSpeechRecognitionModule.addListener('error', handleError),
    ExpoSpeechRecognitionModule.addListener('end', handleEnd),
  ];

  await startForegroundListening();
  startRecognitionLoop();
}

export async function stopListening(): Promise<void> {
  running = false;
  starting = false;
  clearRestartTimer();

  safeAbort();

  subscriptions.forEach((s) => s.remove());
  subscriptions = [];

  await stopForegroundListening();
  setStatus('idle');
  emitTranscript('');
}
