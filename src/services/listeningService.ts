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

let running = false;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let subscriptions: Array<{ remove: () => void }> = [];

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

function scheduleRestart(delayMs = 400) {
  clearRestartTimer();
  if (!running) return;
  restartTimer = setTimeout(() => {
    if (running) startRecognitionLoop();
  }, delayMs);
}

async function handleResult(event: ExpoSpeechRecognitionResultEvent) {
  const transcript = event.results?.[0]?.transcript ?? '';
  if (!transcript) return;

  emitTranscript(transcript);

  const keywords = (await listKeywords()).map((k) => k.word);
  const match = findMatchingKeyword(transcript, keywords);

  if (match) {
    await triggerAlert({ trigger: 'voice', matchedWord: match });
  }
}

function handleError(event: ExpoSpeechRecognitionErrorEvent) {
  // "no-speech" / "aborted" são esperados no loop contínuo
  if (event.error === 'aborted' || event.error === 'no-speech') {
    scheduleRestart(300);
    return;
  }

  console.warn('Speech recognition error:', event.error, event.message);
  setStatus('error');
  scheduleRestart(1200);
}

function startRecognitionLoop() {
  try {
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
    setStatus('error');
    scheduleRestart(1500);
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

  subscriptions.forEach((s) => s.remove());
  subscriptions = [
    ExpoSpeechRecognitionModule.addListener('result', (event) => {
      void handleResult(event);
    }),
    ExpoSpeechRecognitionModule.addListener('error', handleError),
    ExpoSpeechRecognitionModule.addListener('end', () => {
      if (running) scheduleRestart(350);
    }),
  ];

  await startForegroundListening();
  startRecognitionLoop();
}

export async function stopListening(): Promise<void> {
  running = false;
  clearRestartTimer();

  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // ignore
    }
  }

  subscriptions.forEach((s) => s.remove());
  subscriptions = [];

  await stopForegroundListening();
  setStatus('idle');
  emitTranscript('');
}
