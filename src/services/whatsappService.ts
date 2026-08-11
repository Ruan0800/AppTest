import { Linking } from 'react-native';

import type { AlertLocation } from '@/src/services/locationService';
import type { AlertTrigger, Contact } from '@/src/types';

export type WhatsAppAlertPayload = {
  trigger: AlertTrigger;
  matchedWord: string | null;
  triggeredAt: Date;
  location: AlertLocation | null;
};

/** Remove tudo que não for dígito; WhatsApp exige DDI+número. */
export function normalizePhoneForWhatsApp(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function buildAlertMessage(
  payload: WhatsAppAlertPayload,
  contact: Contact
): string {
  const origem =
    payload.trigger === 'voice' && payload.matchedWord
      ? `voz (palavra: ${payload.matchedWord})`
      : 'manual (SOS)';

  const horario = payload.triggeredAt.toLocaleString('pt-BR');

  const locationLines = payload.location
    ? [
        `Local: ${payload.location.placeName}`,
        `Coordenadas: ${payload.location.latitude.toFixed(6)}, ${payload.location.longitude.toFixed(6)}`,
        `Mapa: https://maps.google.com/?q=${payload.location.latitude},${payload.location.longitude}`,
      ]
    : ['Localização: indisponível (permissão negada ou GPS off)'];

  return [
    'ALERTA - Escuta Alertas',
    `Origem: ${origem}`,
    `Horário: ${horario}`,
    ...locationLines,
    `Contato: ${contact.name} (${contact.phone})`,
  ].join('\n');
}

export async function openWhatsAppForContacts(
  contacts: Contact[],
  payload: WhatsAppAlertPayload
): Promise<{ opened: number; skipped: number }> {
  let opened = 0;
  let skipped = 0;

  for (let i = 0; i < contacts.length; i += 1) {
    const contact = contacts[i];
    const phone = normalizePhoneForWhatsApp(contact.phone);
    if (phone.length < 8) {
      skipped += 1;
      continue;
    }

    const text = buildAlertMessage(payload, contact);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

    try {
      // openURL direto — canOpenURL no Android costuma atrasar o SOS.
      await Linking.openURL(url);
      opened += 1;
      if (i < contacts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    } catch {
      skipped += 1;
    }
  }

  return { opened, skipped };
}
