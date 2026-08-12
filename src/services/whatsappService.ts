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

export function buildWhatsAppUrl(
  contact: Contact,
  payload: WhatsAppAlertPayload
): string | null {
  const phone = normalizePhoneForWhatsApp(contact.phone);
  if (phone.length < 8) return null;

  const text = buildAlertMessage(payload, contact);
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function buildWhatsAppUrls(
  contacts: Contact[],
  payload: WhatsAppAlertPayload
): string[] {
  return contacts
    .map((contact) => buildWhatsAppUrl(contact, payload))
    .filter((url): url is string => !!url);
}

export async function openWhatsAppForContacts(
  contacts: Contact[],
  payload: WhatsAppAlertPayload
): Promise<{ opened: number; skipped: number; urls: string[] }> {
  const urls = buildWhatsAppUrls(contacts, payload);
  let opened = 0;
  let skipped = contacts.length - urls.length;

  for (let i = 0; i < urls.length; i += 1) {
    try {
      await Linking.openURL(urls[i]);
      opened += 1;
      if (i < urls.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    } catch {
      skipped += 1;
    }
  }

  return { opened, skipped, urls };
}
