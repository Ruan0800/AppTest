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

  for (const contact of contacts) {
    const phone = normalizePhoneForWhatsApp(contact.phone);
    if (phone.length < 8) {
      skipped += 1;
      continue;
    }

    const text = buildAlertMessage(payload, contact);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        skipped += 1;
        continue;
      }
      await Linking.openURL(url);
      opened += 1;
      // Pequena pausa para o SO processar cada intent (vários contatos)
      await new Promise((resolve) => setTimeout(resolve, 600));
    } catch {
      skipped += 1;
    }
  }

  return { opened, skipped };
}
