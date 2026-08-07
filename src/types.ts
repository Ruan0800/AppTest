export type AlertTrigger = 'voice' | 'manual';

export interface Keyword {
  id: number;
  word: string;
  created_at: string;
}

export interface Contact {
  id: number;
  name: string;
  phone: string;
  created_at: string;
}

export interface AlertRecord {
  id: number;
  trigger: AlertTrigger;
  matched_word: string | null;
  created_at: string;
  notified: number;
}

export type ListeningStatus = 'idle' | 'starting' | 'listening' | 'error';
