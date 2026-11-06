import notifee, {
  AndroidForegroundServiceType,
  AndroidImportance,
  AndroidVisibility,
} from '@notifee/react-native';
import { Platform } from 'react-native';

const LISTENING_CHANNEL_ID = 'vigintel-runtime';
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
    name: 'Vigintel',
    importance: AndroidImportance.LOW,
    vibration: false,
    lights: false,
    badge: false,
  });
}

/** Apaga avisos já exibidos. Não encerra o serviço em primeiro plano. */
export async function dismissAlertNotifications(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    await notifee.cancelDisplayedNotifications();
    await notifee.deleteChannel('alerts-v2');
    await notifee.deleteChannel('listening');
  } catch {
    // A gaveta pode estar indisponível neste aparelho.
  }
}

export async function startForegroundListening(): Promise<void> {
  if (Platform.OS !== 'android') return;

  registerForegroundService();
  await ensureListeningChannel();
  await dismissAlertNotifications();

  await notifee.displayNotification({
    id: LISTENING_NOTIFICATION_ID,
    android: {
      channelId: LISTENING_CHANNEL_ID,
      asForegroundService: true,
      ongoing: true,
      importance: AndroidImportance.LOW,
      visibility: AndroidVisibility.SECRET,
      smallIcon: 'ic_vigintel_status',
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
