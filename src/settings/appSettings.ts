import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@escuta_alertas/app_settings';

export const COOLDOWN_OPTIONS_SECONDS = [10, 15, 30, 60] as const;

export type AppSettings = {
  /** Intervalo mínimo entre alertas por voz (SOS usa force e ignora). */
  cooldownSeconds: number;
  /** Pede confirmação antes de disparar o SOS. */
  confirmSos: boolean;
};

const DEFAULT_SETTINGS: AppSettings = {
  cooldownSeconds: 15,
  confirmSos: false,
};

let cache: AppSettings = { ...DEFAULT_SETTINGS };
let loaded = false;

function normalize(raw: Partial<AppSettings> | null | undefined): AppSettings {
  const cooldown = Number(raw?.cooldownSeconds);
  const validCooldown = COOLDOWN_OPTIONS_SECONDS.includes(
    cooldown as (typeof COOLDOWN_OPTIONS_SECONDS)[number]
  )
    ? cooldown
    : DEFAULT_SETTINGS.cooldownSeconds;

  return {
    cooldownSeconds: validCooldown,
    confirmSos: Boolean(raw?.confirmSos),
  };
}

export function getCachedSettings(): AppSettings {
  return cache;
}

export function getCachedCooldownMs(): number {
  return cache.cooldownSeconds * 1000;
}

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      cache = normalize(JSON.parse(raw) as Partial<AppSettings>);
    } else {
      cache = { ...DEFAULT_SETTINGS };
    }
  } catch {
    cache = { ...DEFAULT_SETTINGS };
  } finally {
    loaded = true;
  }
  return cache;
}

export async function getAppSettings(): Promise<AppSettings> {
  if (!loaded) return loadAppSettings();
  return cache;
}

export async function updateAppSettings(
  partial: Partial<AppSettings>
): Promise<AppSettings> {
  const next = normalize({ ...cache, ...partial });
  cache = next;
  loaded = true;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // mantém cache em memória
  }
  return next;
}
