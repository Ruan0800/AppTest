import * as SQLite from 'expo-sqlite';

import type { AlertRecord, AlertTrigger } from '@/src/domain/types';

export type CachedKeyword = {
  id: number;
  word: string;
  created_at: string;
};

export type CachedContact = {
  id: number;
  name: string;
  phone: string;
  telegram_chat_id?: string | null;
  created_at: string;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function isCorrupt(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /malformed|corrupt|not a database/i.test(message);
}

async function ensureContactColumns(db: SQLite.SQLiteDatabase) {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(contacts)');
  const names = new Set(columns.map((column) => column.name));
  if (!names.has('telegram_chat_id')) {
    await db.execAsync('ALTER TABLE contacts ADD COLUMN telegram_chat_id TEXT');
  }
}

async function ensureAlertColumns(db: SQLite.SQLiteDatabase) {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(alerts)');
  const names = new Set(columns.map((column) => column.name));
  const additions: Array<[string, string]> = [
    ['client_alert_id', 'TEXT'],
    ['latitude', 'REAL'],
    ['longitude', 'REAL'],
    ['accuracy', 'REAL'],
    ['confidence', 'REAL'],
    ['sync_status', 'TEXT'],
    ['error', 'TEXT'],
  ];
  for (const [name, type] of additions) {
    if (!names.has(name)) {
      await db.execAsync(`ALTER TABLE alerts ADD COLUMN ${name} ${type}`);
    }
  }
  await db.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS alerts_client_alert_id ON alerts(client_alert_id) WHERE client_alert_id IS NOT NULL'
  );
}

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger TEXT NOT NULL CHECK (trigger IN ('voice', 'manual')),
      matched_word TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      notified INTEGER NOT NULL DEFAULT 0
    );
  `);
  await ensureContactColumns(db);
  await ensureAlertColumns(db);
}

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('escuta_alertas.db');
  try {
    await migrate(db);
    return db;
  } catch (error) {
    await db.closeAsync().catch(() => undefined);
    if (!isCorrupt(error)) throw error;
    await SQLite.deleteDatabaseAsync('escuta_alertas.db');
    const fresh = await SQLite.openDatabaseAsync('escuta_alertas.db');
    await migrate(fresh);
    return fresh;
  }
}

export async function resetLocalDatabase(): Promise<void> {
  if (dbPromise) {
    const current = await dbPromise.catch(() => null);
    await current?.closeAsync().catch(() => undefined);
  }
  dbPromise = null;
  await SQLite.deleteDatabaseAsync('escuta_alertas.db');
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = openDatabase().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

export async function listKeywords(): Promise<CachedKeyword[]> {
  const db = await getDb();
  return db.getAllAsync<CachedKeyword>(
    'SELECT * FROM keywords ORDER BY created_at DESC'
  );
}

export async function replaceKeywordCache(words: string[]): Promise<void> {
  const db = await getDb();
  const unique = [...new Set(words.map((word) => word.trim()).filter(Boolean))];
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM keywords');
    for (const word of unique) {
      await db.runAsync('INSERT INTO keywords (word) VALUES (?)', [word]);
    }
  });
}

export async function addKeyword(word: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO keywords (word) VALUES (?)', [word]);
}

export async function removeKeyword(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM keywords WHERE id = ?', [id]);
}

export async function listContacts(): Promise<CachedContact[]> {
  const db = await getDb();
  return db.getAllAsync<CachedContact>(
    'SELECT * FROM contacts ORDER BY created_at DESC'
  );
}

export async function replaceContactCache(
  contacts: Array<Pick<CachedContact, 'name' | 'phone' | 'telegram_chat_id'>>
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE alerts SET sync_status = 'failed', error = ? WHERE sync_status = 'pending'",
      ['Alerta antigo não reenviado']
    );
    await db.runAsync('DELETE FROM contacts');
    for (const contact of contacts) {
      await db.runAsync(
        'INSERT INTO contacts (name, phone, telegram_chat_id) VALUES (?, ?, ?)',
        [contact.name, contact.phone, contact.telegram_chat_id?.trim() || null]
      );
    }
  });
}

export async function addContact(
  name: string,
  phone: string,
  telegramChatId?: string | null
): Promise<void> {
  const db = await getDb();
  const chatId = telegramChatId?.trim() || null;
  await db.runAsync(
    'INSERT INTO contacts (name, phone, telegram_chat_id) VALUES (?, ?, ?)',
    [name, phone, chatId]
  );
}

export async function removeContact(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM contacts WHERE id = ?', [id]);
}

export async function listAlerts(): Promise<AlertRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Omit<AlertRecord, 'id'> & { id: number }>(
    'SELECT * FROM alerts ORDER BY created_at DESC'
  );
  return rows.map((row) => ({ ...row, id: String(row.id) }));
}

export async function insertAlert(
  trigger: AlertTrigger,
  matchedWord: string | null,
  notified: boolean
): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    'INSERT INTO alerts (trigger, matched_word, notified) VALUES (?, ?, ?)',
    [trigger, matchedWord, notified ? 1 : 0]
  );
  return result.lastInsertRowId;
}

/** Marca o alerta que o serviço nativo já gravou. Retorna false se a linha ainda não existir. */
export async function markAlertNotified(clientAlertId: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.runAsync(
    'UPDATE alerts SET notified = 1 WHERE client_alert_id = ?',
    [clientAlertId]
  );
  return result.changes > 0;
}

export async function clearAlerts(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM alerts');
}
