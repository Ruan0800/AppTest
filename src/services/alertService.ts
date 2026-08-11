import notifee, { AndroidImportance } from '@notifee/react-native';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { insertAlert, listContacts } from '@/src/db/database';
import {
  getQuickAlertLocation,
  requestLocationPermission,
} from '@/src/services/locationService';
import { openWhatsAppForContacts } from '@/src/services/whatsappService';
import type { AlertTrigger } from '@/src/types';

const ALERT_CHANNEL_ID = 'alerts';
const COOLDOWN_MS = 15_000;
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
  body: string
): Promise<boolean> {
  try {
    await notifee.displayNotification({
      title,
      body,
      android: {
        channelId: ALERT_CHANNEL_ID,
        importance: AndroidImportance.HIGH,
        pressAction: { id: 'default' },
        sound: 'default',
      },
    });
    return true;
  } catch {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
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

  if (!force && now - lastAlertAt < COOLDOWN_MS) {
    return {
      triggered: false,
      notified: false,
      contactsCount: 0,
      whatsappOpened: 0,
      hasLocation: false,
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

  // Localização (rápida), contatos e notificação em paralelo.
  const [location, contacts, notified] = await Promise.all([
    getQuickAlertLocation(LOCATION_BUDGET_MS),
    listContacts(),
    displayAlertNotification(title, body),
  ]);

  await insertAlert(trigger, matchedWord, notified);

  let whatsappOpened = 0;
  if (contacts.length > 0) {
    const result = await openWhatsAppForContacts(contacts, {
      trigger,
      matchedWord,
      triggeredAt,
      location,
    });
    whatsappOpened = result.opened;
  }

  return {
    triggered: true,
    notified,
    contactsCount: contacts.length,
    whatsappOpened,
    hasLocation: !!location,
  };
}
