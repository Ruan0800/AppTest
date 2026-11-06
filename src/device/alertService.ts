import {
  alertEndpoint,
  authorizedJsonHeaders,
  messageForCode,
} from '@/src/data/catalogClient';
import { listContacts } from '@/src/data/repositories';
import type { AlertTrigger, Contact } from '@/src/domain/types';
import {
  getQuickAlertLocation,
  requestLocationPermission,
  type AlertLocation,
} from '@/src/device/locationService';
import {
  getAppSettings,
  getCachedCooldownMs,
} from '@/src/settings/appSettings';

const LOCATION_BUDGET_MS = 12000;

let lastAlertAt = 0;

type ServerDelivery = {
  channel?: string;
  status?: string;
};

export type TriggerAlertResult = {
  triggered: boolean;
  notified: boolean;
  contactsCount: number;
  hasLocation: boolean;
  summary: string;
};

export async function requestAlertPermissions(): Promise<boolean> {
  return requestLocationPermission();
}

function createClientAlertId(): string {
  const cryptoRef = globalThis.crypto;
  if (typeof cryptoRef?.randomUUID === 'function') return cryptoRef.randomUUID();

  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function summarizeDeliveries(deliveries: ServerDelivery[], errorCode?: string): string {
  const smsSent = deliveries.filter(
    (item) => item.channel === 'sms' && item.status === 'sent'
  ).length;
  const telegramSent = deliveries.filter(
    (item) => item.channel === 'telegram' && item.status === 'sent'
  ).length;
  const failed = deliveries.filter((item) => item.status === 'failed').length;
  const lines: string[] = [];

  if (smsSent > 0) {
    lines.push(`SMS enviado para ${smsSent} contato(s).`);
  }
  if (telegramSent > 0) {
    lines.push(`Telegram enviado para ${telegramSent} contato(s).`);
  }
  if (failed > 0) {
    lines.push(`${failed} envio(s) falharam.`);
  }
  if (lines.length > 0) return lines.join('\n');
  return messageForCode(errorCode, 'O servidor não confirmou o envio.');
}

async function sendServerAlert(input: {
  trigger: AlertTrigger;
  phrase: string;
  triggeredAt: Date;
  location: AlertLocation | null;
  contacts: Contact[];
}): Promise<string> {
  const response = await fetch(alertEndpoint(), {
    method: 'POST',
    headers: authorizedJsonHeaders(),
    body: JSON.stringify({
      client_alert_id: createClientAlertId(),
      phrase: input.phrase,
      trigger: input.trigger,
      confidence: input.trigger === 'manual' ? 1 : null,
      created_at: input.triggeredAt.toISOString(),
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      latitude: input.location?.latitude ?? null,
      longitude: input.location?.longitude ?? null,
      accuracy: input.location?.accuracy ?? null,
      contacts: input.contacts.map((contact) => ({
        name: contact.name,
        phone: contact.phone,
        telegram_chat_id: contact.telegram_chat_id ?? null,
      })),
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    duplicate?: boolean;
    deliveries?: ServerDelivery[];
  };
  const deliveries = Array.isArray(payload.deliveries) ? payload.deliveries : [];

  if (response.status === 409 && payload.duplicate) {
    return 'Esse alerta já tinha sido enviado.';
  }
  if (!response.ok && deliveries.length === 0) {
    throw new Error(messageForCode(payload.error, 'Não foi possível enviar o alerta.'));
  }
  return summarizeDeliveries(deliveries, payload.error);
}

export async function triggerAlert(options: {
  trigger: AlertTrigger;
  matchedWord?: string | null;
  force?: boolean;
  /** Quando a escuta nativa já enviou o alerta, não envia de novo. */
  clientAlertId?: string | null;
}): Promise<TriggerAlertResult> {
  const { trigger, matchedWord = null, force = false, clientAlertId = null } = options;
  const now = Date.now();

  await getAppSettings();
  const cooldownMs = getCachedCooldownMs();

  if (!force && now - lastAlertAt < cooldownMs) {
    return {
      triggered: false,
      notified: false,
      contactsCount: 0,
      hasLocation: false,
      summary: '',
    };
  }

  lastAlertAt = now;

  const triggeredAt = new Date();
  const phrase =
    trigger === 'voice' && matchedWord ? matchedWord : 'SOS';

  const [location, contacts] = await Promise.all([
    getQuickAlertLocation(LOCATION_BUDGET_MS),
    listContacts(),
  ]);

  if (!location && !clientAlertId) {
    return {
      triggered: true,
      notified: false,
      contactsCount: contacts.length,
      hasLocation: false,
      summary: '',
    };
  }
  let summary = '';
  if (!clientAlertId) {
    summary = await sendServerAlert({
      trigger,
      phrase,
      triggeredAt,
      location,
      contacts,
    });
  }

  return {
    triggered: true,
    notified: false,
    contactsCount: contacts.length,
    hasLocation: !!location,
    summary,
  };
}
