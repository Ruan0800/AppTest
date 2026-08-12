import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';

const STORAGE_KEY = '@escuta_alertas/pending_whatsapp_urls';

let memoryQueue: string[] = [];
let flushing = false;

export async function enqueueWhatsAppUrls(urls: string[]): Promise<void> {
  const clean = urls.filter((url) => typeof url === 'string' && url.length > 0);
  if (clean.length === 0) return;

  memoryQueue = [...memoryQueue, ...clean];

  try {
    const existingRaw = await AsyncStorage.getItem(STORAGE_KEY);
    const existing = existingRaw ? (JSON.parse(existingRaw) as string[]) : [];
    const merged = [...new Set([...existing, ...clean])];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // memória já tem a fila
  }
}

export async function clearPendingWhatsAppUrls(): Promise<void> {
  memoryQueue = [];
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

async function loadQueuedUrls(): Promise<string[]> {
  let urls = [...memoryQueue];
  memoryQueue = [];

  try {
    const existingRaw = await AsyncStorage.getItem(STORAGE_KEY);
    if (existingRaw) {
      const existing = JSON.parse(existingRaw) as string[];
      urls = [...new Set([...urls, ...existing])];
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // usa só a fila em memória
  }

  return urls;
}

export async function openWhatsAppUrls(urls: string[]): Promise<number> {
  let opened = 0;

  for (let i = 0; i < urls.length; i += 1) {
    try {
      await Linking.openURL(urls[i]);
      opened += 1;
      if (i < urls.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    } catch {
      // Android em background costuma bloquear; mantém na fila se re-enfileirarmos
    }
  }

  return opened;
}

/** Abre URLs pendentes (chamado ao voltar para foreground / toque na notificação). */
export async function flushPendingWhatsApp(): Promise<number> {
  if (flushing) return 0;
  flushing = true;

  try {
    const urls = await loadQueuedUrls();
    if (urls.length === 0) return 0;

    const opened = await openWhatsAppUrls(urls);

    // Se não abriu nenhum (ainda bloqueado), recoloca na fila.
    if (opened === 0) {
      await enqueueWhatsAppUrls(urls);
    }

    return opened;
  } finally {
    flushing = false;
  }
}
