export type AlertTrigger = 'voice' | 'manual';

export interface Keyword {
  id: string;
  word: string;
  created_at: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  telegram_chat_id?: string | null;
  created_at: string;
}

export interface AlertRecord {
  id: string;
  trigger: AlertTrigger;
  matched_word: string | null;
  created_at: string;
  notified: number;
  client_alert_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  confidence?: number | null;
  sync_status?: 'pending' | 'sent' | 'failed' | null;
  error?: string | null;
}

export type ListeningStatus = 'idle' | 'starting' | 'listening' | 'paused' | 'error';
