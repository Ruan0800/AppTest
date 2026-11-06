import { catalogRequest } from '@/src/data/catalogClient';
import * as sqlite from '@/src/data/sqlite/database';
import type { AlertRecord, Contact, Keyword } from '@/src/domain/types';

async function fetchKeywords(): Promise<Keyword[]> {
  const payload = await catalogRequest<{ keywords: Keyword[] }>({
    action: 'list_keywords',
  });
  return payload.keywords ?? [];
}

async function fetchContacts(): Promise<Contact[]> {
  const payload = await catalogRequest<{ contacts: Contact[] }>({
    action: 'list_contacts',
  });
  return payload.contacts ?? [];
}

function isCorrupt(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /malformed|corrupt|not a database/i.test(message);
}

let cacheChain: Promise<void> = Promise.resolve();

function enqueueCache(task: () => Promise<void>): Promise<void> {
  const run = cacheChain.then(task, task);
  cacheChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function rememberKeywords(keywords: Keyword[]) {
  await enqueueCache(async () => {
    const words = keywords.map((keyword) => keyword.word);
    try {
      await sqlite.replaceKeywordCache(words);
    } catch (error) {
      if (!isCorrupt(error)) return;
      try {
        await sqlite.resetLocalDatabase();
        await sqlite.replaceKeywordCache(words);
      } catch {
        // A frase segue para o serviço de escuta mesmo sem a cópia local.
      }
    }
  });
}

async function rememberContacts(contacts: Contact[]) {
  await enqueueCache(async () => {
    try {
      await sqlite.replaceContactCache(contacts);
    } catch (error) {
      if (!isCorrupt(error)) return;
      try {
        await sqlite.resetLocalDatabase();
        await sqlite.replaceContactCache(contacts);
      } catch {
        // O próximo alerta usa a cópia local quando ela puder ser regravada.
      }
    }
  });
}

export async function listKeywords(): Promise<Keyword[]> {
  const keywords = await fetchKeywords();
  await rememberKeywords(keywords);
  return keywords;
}

export async function addKeyword(word: string): Promise<void> {
  await catalogRequest({ action: 'add_keyword', word });
  await listKeywords();
}

export async function removeKeyword(id: string): Promise<void> {
  await catalogRequest({ action: 'remove_keyword', id });
  await listKeywords();
}

export async function listContacts(): Promise<Contact[]> {
  const contacts = await fetchContacts();
  await rememberContacts(contacts);
  return contacts;
}

export async function addContact(
  name: string,
  phone: string,
  telegramChatId?: string | null
): Promise<void> {
  await catalogRequest({
    action: 'add_contact',
    name,
    phone,
    telegram_chat_id: telegramChatId ?? null,
  });
  await listContacts();
}

export async function removeContact(id: string): Promise<void> {
  await catalogRequest({ action: 'remove_contact', id });
  await listContacts();
}

export async function listAlerts(): Promise<AlertRecord[]> {
  const payload = await catalogRequest<{ alerts: AlertRecord[] }>({
    action: 'list_alerts',
  });
  return payload.alerts ?? [];
}

function channelLine(
  label: string,
  rows: Array<{ status: string; error: string | null }>
): string | null {
  if (rows.length === 0) return null;
  if (rows.some((row) => row.status === 'sent')) return `${label} enviado.`;
  if (rows.some((row) => row.error === 'telegram_nao_configurado')) {
    return 'Telegram não enviado.';
  }
  return `${label} não enviado.`;
}

export async function waitForSmsResult(clientAlertId: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const payload = await catalogRequest<{
        deliveries: Array<{ channel: string; status: string; error: string | null; destination?: string }>;
      }>({ action: 'delivery_status', id: clientAlertId });
      const deliveries = (payload.deliveries ?? []).filter((row) => row.destination !== 'nenhum');
      const telegram = deliveries.filter((row) => row.channel === 'telegram');
      const sms = deliveries.filter((row) => row.channel === 'sms');
      const lines = [channelLine('Telegram', telegram), channelLine('SMS', sms)].filter(
        (line): line is string => !!line
      );
      if (lines.length > 0) return lines.join(' ');
    } catch {
      // O envio ainda pode estar em andamento.
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  return 'Telegram não enviado.';
}

export async function syncRemoteCatalog(): Promise<void> {
  const [keywords, contacts] = await Promise.all([fetchKeywords(), fetchContacts()]);
  const words = keywords.map((keyword) => keyword.word);
  await enqueueCache(async () => {
    try {
      await sqlite.replaceKeywordCache(words);
      await sqlite.replaceContactCache(contacts);
    } catch (error) {
      if (!isCorrupt(error)) return;
      await sqlite.resetLocalDatabase();
      await sqlite.replaceKeywordCache(words);
      await sqlite.replaceContactCache(contacts);
    }
  });
}

export { clearAlerts, insertAlert, markAlertNotified } from '@/src/data/sqlite/database';
