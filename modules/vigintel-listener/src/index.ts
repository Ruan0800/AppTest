import {
  requireNativeModule,
  type EventSubscription,
  type NativeModule,
} from 'expo-modules-core';
import { Platform } from 'react-native';

export type ListenerStatusName =
  | 'idle'
  | 'starting'
  | 'listening'
  | 'paused'
  | 'error';

export type ListenerSnapshot = {
  status: ListenerStatusName;
  protectionEnabled: boolean;
  reason: string | null;
  partial: string | null;
  phraseCount: number;
};

export type DetectionEvent = {
  clientAlertId: string;
  phrase: string;
  confidence: number;
  createdAt: string;
};

export type ListenerConfig = {
  cooldownMs?: number;
  confidenceThreshold?: number;
  endpointUrl?: string | null;
  accessToken?: string | null;
};

export type PhraseValidation = {
  ok: boolean;
  missing: string[];
  phrase: string;
};

type VigintelListenerNative = NativeModule & {
  start(): Promise<void>;
  stop(): Promise<void>;
  recover(): Promise<void>;
  updateKeywords(phrases: string[]): Promise<void>;
  getStatus(): Promise<ListenerSnapshot>;
  configure(options: ListenerConfig): Promise<void>;
  validatePhrases(phrases: string[]): Promise<PhraseValidation>;
  addListener<EventName extends 'onStatusChange' | 'onDetection'>(
    eventName: EventName,
    listener: EventName extends 'onDetection'
      ? (event: DetectionEvent) => void
      : (snapshot: ListenerSnapshot) => void
  ): EventSubscription;
};

const IDLE: ListenerSnapshot = {
  status: 'idle',
  protectionEnabled: false,
  reason: null,
  partial: null,
  phraseCount: 0,
};

let nativeModule: VigintelListenerNative | null | undefined;

function getNative(): VigintelListenerNative | null {
  if (Platform.OS !== 'android') return null;
  if (nativeModule !== undefined) return nativeModule;
  try {
    nativeModule = requireNativeModule<VigintelListenerNative>('VigintelListener');
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

function missingNative(): Error {
  return new Error(
    'O serviço nativo de escuta ainda não está neste build. Rode npx expo run:android e abra o app de novo.'
  );
}

export const VigintelListener = {
  async start(): Promise<void> {
    const native = getNative();
    if (!native) throw missingNative();
    await native.start();
  },

  async stop(): Promise<void> {
    const native = getNative();
    if (!native) return;
    await native.stop();
  },

  async recover(): Promise<void> {
    const native = getNative();
    if (!native) return;
    await native.recover();
  },

  async updateKeywords(phrases: string[]): Promise<void> {
    const native = getNative();
    if (!native) return;
    await native.updateKeywords(phrases);
  },

  async getStatus(): Promise<ListenerSnapshot> {
    const native = getNative();
    if (!native) return IDLE;
    return native.getStatus();
  },

  async configure(options: ListenerConfig): Promise<void> {
    const native = getNative();
    if (!native) return;
    await native.configure(options);
  },

  async validatePhrases(phrases: string[]): Promise<PhraseValidation> {
    const native = getNative();
    if (!native) throw missingNative();
    return native.validatePhrases(phrases);
  },

  addStatusListener(
    listener: (snapshot: ListenerSnapshot) => void
  ): EventSubscription | { remove: () => void } {
    const native = getNative();
    if (!native) return { remove: () => undefined };
    return native.addListener('onStatusChange', listener);
  },

  addDetectionListener(
    listener: (event: DetectionEvent) => void
  ): EventSubscription | { remove: () => void } {
    const native = getNative();
    if (!native) return { remove: () => undefined };
    return native.addListener('onDetection', listener);
  },
};
