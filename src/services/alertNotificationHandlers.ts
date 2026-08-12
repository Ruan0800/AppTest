import notifee, { EventType } from '@notifee/react-native';
import { AppState, Platform } from 'react-native';

import {
  flushPendingWhatsApp,
  openWhatsAppUrls,
} from '@/src/services/pendingWhatsApp';

let registered = false;

function parseWhatsAppUrls(data?: Record<string, unknown> | null): string[] {
  if (!data) return [];
  const raw = data.whatsappUrls;
  if (typeof raw !== 'string' || !raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

async function handleNotificationOpen(
  data?: Record<string, unknown> | null
): Promise<void> {
  const urls = parseWhatsAppUrls(data);
  if (urls.length > 0) {
    const opened = await openWhatsAppUrls(urls);
    if (opened === 0) {
      // App pode ter aberto, mas WhatsApp ainda não — tenta a fila.
      await flushPendingWhatsApp();
    }
    return;
  }

  await flushPendingWhatsApp();
}

/**
 * Handlers para notificação + AppState.
 * Em background o Android bloqueia Linking.openURL; ao tocar na notificação
 * ou voltar ao app, abrimos o WhatsApp com a mensagem pronta.
 */
export function registerAlertNotificationHandlers() {
  if (registered || Platform.OS !== 'android') return;
  registered = true;

  notifee.onForegroundEvent(({ type, detail }) => {
    if (
      type === EventType.PRESS ||
      type === EventType.ACTION_PRESS ||
      type === EventType.DELIVERED
    ) {
      // DELIVERED com fullScreen pode trazer o app; só abre WA em press/action.
      if (type === EventType.DELIVERED) return;
      void handleNotificationOpen(detail.notification?.data ?? null);
    }
  });

  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
      await handleNotificationOpen(detail.notification?.data ?? null);
    }
  });

  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void flushPendingWhatsApp();
    }
  });
}
