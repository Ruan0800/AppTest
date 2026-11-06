import { AppState, PermissionsAndroid, Platform } from 'react-native';

import { listKeywords } from '@/src/data/repositories';
import type { ListeningStatus } from '@/src/domain/types';
import {
  VigintelListener,
  type DetectionEvent,
  type ListenerSnapshot,
} from '@/modules/vigintel-listener';
import { warmAlertLocation } from '@/src/device/locationService';
import { getAppSettings } from '@/src/settings/appSettings';

type StatusListener = (status: ListeningStatus) => void;
type SnapshotListener = (snapshot: ListenerSnapshot) => void;
type DetectionListener = (event: DetectionEvent) => void;

const DEFAULT_CONFIDENCE = 0.7;

let snapshot: ListenerSnapshot = {
  status: 'idle',
  protectionEnabled: false,
  reason: null,
  partial: null,
  phraseCount: 0,
};
let wired = false;

const statusListeners = new Set<StatusListener>();
const snapshotListeners = new Set<SnapshotListener>();
const detectionListeners = new Set<DetectionListener>();

function emit() {
  statusListeners.forEach((listener) => listener(snapshot.status));
  snapshotListeners.forEach((listener) => listener(snapshot));
}

function wire() {
  if (wired || Platform.OS !== 'android') return;
  wired = true;
  VigintelListener.addStatusListener((next) => {
    snapshot = next;
    emit();
  });
  VigintelListener.addDetectionListener((event) => {
    snapshot = { ...snapshot, partial: event.phrase };
    emit();
    detectionListeners.forEach((listener) => listener(event));
  });
  void VigintelListener.getStatus().then((next) => {
    snapshot = next;
    emit();
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void VigintelListener.recover();
  });
}

async function ensurePermissions(): Promise<void> {
  const mic = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
  );
  if (mic !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error('Permissão de microfone negada.');
  }
}

export async function syncListenerConfig(): Promise<void> {
  if (Platform.OS !== 'android') return;
  wire();
  const settings = await getAppSettings();
  const endpointUrl = process.env.EXPO_PUBLIC_ALERT_ENDPOINT?.trim();
  const accessToken = process.env.EXPO_PUBLIC_ALERT_INGEST_SECRET?.trim();
  await VigintelListener.configure({
    cooldownMs: settings.cooldownSeconds * 1000,
    confidenceThreshold: DEFAULT_CONFIDENCE,
    ...(endpointUrl ? { endpointUrl } : {}),
    ...(accessToken ? { accessToken } : {}),
  });
  await syncListenerKeywords();
}

export async function syncListenerKeywords(): Promise<void> {
  if (Platform.OS !== 'android') return;
  wire();
  const rows = await listKeywords();
  await VigintelListener.updateKeywords(rows.map((row) => row.word));
}

/** @deprecated Use syncListenerKeywords. Kept so existing screens keep compiling. */
export function invalidateKeywordCache() {
  void syncListenerKeywords();
}

export async function reconcileListener(): Promise<void> {
  if (Platform.OS !== 'android') return;
  wire();
  await warmAlertLocation();
  await syncListenerConfig();
  await VigintelListener.recover();
  const status = await VigintelListener.getStatus();
  snapshot = status;
  emit();
  if (status.protectionEnabled && status.status === 'idle') {
    try {
      await ensurePermissions();
      await VigintelListener.start();
    } catch {
      snapshot = { ...snapshot, status: 'error', reason: 'permission' };
      emit();
    }
  }
}

export function subscribeListeningStatus(listener: StatusListener) {
  wire();
  statusListeners.add(listener);
  listener(snapshot.status);
  return () => {
    statusListeners.delete(listener);
  };
}

export function subscribeListeningSnapshot(listener: SnapshotListener) {
  wire();
  snapshotListeners.add(listener);
  listener(snapshot);
  return () => {
    snapshotListeners.delete(listener);
  };
}

export function subscribeDetections(listener: DetectionListener) {
  wire();
  detectionListeners.add(listener);
  return () => {
    detectionListeners.delete(listener);
  };
}

export function subscribeTranscript(listener: (transcript: string) => void) {
  return subscribeListeningSnapshot((next) => listener(next.partial ?? ''));
}

export function isListening(): boolean {
  return (
    snapshot.protectionEnabled ||
    snapshot.status === 'listening' ||
    snapshot.status === 'starting' ||
    snapshot.status === 'paused'
  );
}

export async function startListening(): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('A escuta em segundo plano está disponível no Android.');
  }
  wire();
  snapshot = { ...snapshot, status: 'starting', reason: null };
  emit();
  await ensurePermissions();
  await warmAlertLocation();
  await syncListenerConfig();
  await VigintelListener.start();
}

export async function stopListening(): Promise<void> {
  if (Platform.OS !== 'android') return;
  wire();
  await VigintelListener.stop();
  snapshot = {
    ...snapshot,
    status: 'idle',
    protectionEnabled: false,
    reason: null,
    partial: null,
  };
  emit();
}

export async function validatePhrase(phrase: string) {
  return VigintelListener.validatePhrases([phrase]);
}
