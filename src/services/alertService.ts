import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
} from '@notifee/react-native';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

import { insertAlert, listContacts } from '@/src/db/database';
import {
  getQuickAlertLocation,
  requestLocationPermission,
} from '@/src/services/locationService';
import {
  clearPendingWhatsAppUrls,
  enqueueWhatsAppUrls,
  openWhatsAppUrls,
} from '@/src/services/pendingWhatsApp';
import {
  buildWhatsAppUrls,
  type WhatsAppAlertPayload,
} from '@/src/services/whatsappService';
import {
  getAppSettings,
  getCachedCooldownMs,
} from '@/src/settings/appSettings';
import type { AlertTrigger } from '@/src/types';

const ALERT_CHANNEL_ID = 'alerts';
/** Só usado quando não há lastKnown — evita travar o SOS. */
const LOCATION_BUDGET_MS = 800;

let lastAlertAt = 0;
let channelsReady = false;

export type TriggerAlertResult = {
  triggered: boolean;
  notified: boolean;
  contactsCount: number;
  whatsappOpened: number;
  hasLocation: boolean;
  pendingWhatsApp: boolean;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureChannels() {
  if (channelsReady) return;

  if (Platform.OS === 'android') {
    await notifee.createChannel({
      id: ALERT_CHANNEL_ID,
      name: 'Alertas de emergência',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
      bypassDnd: true,
    });

    await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
      name: 'Alertas de emergência',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400],
      sound: 'default',
    });
  }

  channelsReady = true;
}

async function displayAlertNotification(
  title: string,
  body: string,
  whatsappUrls: string[]
): Promise<boolean> {
  const hasWhatsApp = whatsappUrls.length > 0;
  const notificationBody = hasWhatsApp
    ? `${body}\nToque em "Abrir WhatsApp" para enviar.`
    : body;

  try {
    await notifee.displayNotification({
      title,
      body: notificationBody,
      data: {
        whatsappUrls: JSON.stringify(whatsappUrls),
      },
      android: {
        channelId: ALERT_CHANNEL_ID,
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        category: AndroidCategory.ALARM,
        pressAction: {
          id: 'open-whatsapp',
          launchActivity: 'default',
        },
        // Tenta trazer o app à frente em background (requer USE_FULL_SCREEN_INTENT).
        fullScreenAction: {
          id: 'default',
          launchActivity: 'default',
        },
        actions: hasWhatsApp
          ? [
              {
                title: 'Abrir WhatsApp',
                pressAction: {
                  id: 'open-whatsapp',
                  launchActivity: 'default',
                },
              },
            ]
          : undefined,
        sound: 'default',
        vibrationPattern: [300, 500, 300, 500],
        lightUpScreen: true,
      },
    });
    return true;
  } catch {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body: notificationBody,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          data: {
            whatsappUrls: JSON.stringify(whatsappUrls),
          },
        },
        trigger: null,
      });
      return true;
    } catch {
      return false;
    }
  }
}

export async function requestAlertPermissions(): Promise<boolean> {
  await ensureChannels();

  const settings = await notifee.requestPermission();
  const expo = await Notifications.requestPermissionsAsync();
  await requestLocationPermission();

  const notifeeOk =
    settings.authorizationStatus >= 1; /* AUTHORIZED or PROVISIONAL */
  const expoOk =
    expo.granted ||
    expo.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED;

  return notifeeOk || !!expoOk;
}

export async function triggerAlert(options: {
  trigger: AlertTrigger;
  matchedWord?: string | null;
  force?: boolean;
}): Promise<TriggerAlertResult> {
  const { trigger, matchedWord = null, force = false } = options;
  const now = Date.now();

  await getAppSettings();
  const cooldownMs = getCachedCooldownMs();

  if (!force && now - lastAlertAt < cooldownMs) {
    return {
      triggered: false,
      notified: false,
      contactsCount: 0,
      whatsappOpened: 0,
      hasLocation: false,
      pendingWhatsApp: false,
    };
  }

  lastAlertAt = now;
  await ensureChannels();

  const triggeredAt = new Date();
  const title = 'ALERTA DISPARADO';
  const body =
    trigger === 'voice' && matchedWord
      ? `Palavra-chave detectada: "${matchedWord}"`
      : 'Alerta manual acionado pelo botão SOS';

  const [location, contacts] = await Promise.all([
    getQuickAlertLocation(LOCATION_BUDGET_MS),
    listContacts(),
  ]);

  const payload: WhatsAppAlertPayload = {
    trigger,
    matchedWord,
    triggeredAt,
    location,
  };

  const whatsappUrls = buildWhatsAppUrls(contacts, payload);

  // Guarda URLs para abrir quando o app voltar ao foreground / usuário tocar na notificação.
  if (whatsappUrls.length > 0) {
    await enqueueWhatsAppUrls(whatsappUrls);
  }

  const notified = await displayAlertNotification(title, body, whatsappUrls);
  await insertAlert(trigger, matchedWord, notified);

  let whatsappOpened = 0;
  let pendingWhatsApp = whatsappUrls.length > 0;
  const isActive = AppState.currentState === 'active';

  if (whatsappUrls.length > 0) {
    // Em foreground abre na hora. Em background o Android costuma bloquear —
    // tentamos mesmo assim; se falhar, a fila + notificação resolvem depois.
    whatsappOpened = await openWhatsAppUrls(whatsappUrls);
    if (whatsappOpened > 0) {
      await clearPendingWhatsAppUrls();
      pendingWhatsApp = false;
    } else if (isActive) {
      pendingWhatsApp = true;
    }
  }

  return {
    triggered: true,
    notified,
    contactsCount: contacts.length,
    whatsappOpened,
    hasLocation: !!location,
    pendingWhatsApp,
  };
}
