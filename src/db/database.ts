import * as SQLite from 'expo-sqlite';

import type { AlertRecord, AlertTrigger, Contact, Keyword } from '@/src/types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('escuta_alertas.db');
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

      const count = await db.getFirstAsync<{ c: number }>(
        'SELECT COUNT(*) as c FROM keywords'
      );
      if ((count?.c ?? 0) === 0) {
        await db.runAsync('INSERT INTO keywords (word) VALUES (?)', ['socorro']);
        await db.runAsync('INSERT INTO keywords (word) VALUES (?)', ['perigo']);
      }

      return db;
    })();
  }
  return dbPromise;
}

export async function listKeywords(): Promise<Keyword[]> {
  const db = await getDb();
  return db.getAllAsync<Keyword>(
    'SELECT * FROM keywords ORDER BY created_at DESC'
  );
}

export async function addKeyword(word: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO keywords (word) VALUES (?)', [word]);
}

export async function removeKeyword(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM keywords WHERE id = ?', [id]);
}

export async function listContacts(): Promise<Contact[]> {
  const db = await getDb();
  return db.getAllAsync<Contact>(
    'SELECT * FROM contacts ORDER BY created_at DESC'
  );
}

export async function addContact(name: string, phone: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO contacts (name, phone) VALUES (?, ?)', [
    name,
    phone,
  ]);
}

export async function removeContact(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM contacts WHERE id = ?', [id]);
}

export async function listAlerts(): Promise<AlertRecord[]> {
  const db = await getDb();
  return db.getAllAsync<AlertRecord>(
    'SELECT * FROM alerts ORDER BY created_at DESC'
  );
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

export async function clearAlerts(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM alerts');
}
