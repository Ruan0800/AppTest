import notifee, {
  AndroidImportance,
  AndroidForegroundServiceType,
} from '@notifee/react-native';
import { Platform } from 'react-native';

const LISTENING_CHANNEL_ID = 'listening';
const LISTENING_NOTIFICATION_ID = 'listening-foreground';

let registered = false;

export function registerForegroundService() {
  if (registered || Platform.OS !== 'android') return;
  registered = true;

  notifee.registerForegroundService(() => {
    // Mantém o processo vivo enquanto a notificação de escuta estiver ativa.
    return new Promise(() => {
      /* resolved when stopForegroundListening is called via stopForegroundService */
    });
  });
}

async function ensureListeningChannel() {
  await notifee.createChannel({
    id: LISTENING_CHANNEL_ID,
    name: 'Escuta ativa',
    importance: AndroidImportance.LOW,
    vibration: false,
  });
}

export async function startForegroundListening(): Promise<void> {
  if (Platform.OS !== 'android') return;

  registerForegroundService();
  await ensureListeningChannel();

  await notifee.displayNotification({
    id: LISTENING_NOTIFICATION_ID,
    title: 'Escuta ativa',
    body: 'Monitorando palavras-chave de emergência',
    android: {
      channelId: LISTENING_CHANNEL_ID,
      asForegroundService: true,
      ongoing: true,
      importance: AndroidImportance.LOW,
      pressAction: { id: 'default' },
      foregroundServiceTypes: [
        AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_MICROPHONE,
      ],
    },
  });
}

export async function stopForegroundListening(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    await notifee.stopForegroundService();
  } catch {
    // ignore
  }

  try {
    await notifee.cancelNotification(LISTENING_NOTIFICATION_ID);
  } catch {
    // ignore
  }
}
