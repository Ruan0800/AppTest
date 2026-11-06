const MESSAGES: Record<string, string> = {
  unauthorized: 'O servidor recusou o acesso. Confira o segredo de ingestão.',
  duplicate: 'Esse cadastro já existe.',
  limit: 'Limite de cadastro atingido.',
  invalid_word: 'Digite uma palavra-chave.',
  invalid_contact: 'Informe nome e telefone.',
  invalid_phone: 'Telefone inválido.',
  invalid_telegram: 'ID do Telegram inválido.',
  sem_localizacao: 'Alerta retido até obter a localização.',
  no_destination:
    'Nenhum SMS ou Telegram disponível. Cadastre um telefone válido e o ID do chat, e confira Twilio e o bot no servidor.',
  supabase_env: 'Servidor indisponível.',
  catalog_failed: 'Não foi possível carregar os dados do servidor.',
};

export class CatalogError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function catalogUrl(): string {
  const endpoint = process.env.EXPO_PUBLIC_ALERT_ENDPOINT?.trim() ?? '';
  if (!endpoint) {
    throw new CatalogError(
      'config',
      'Servidor não configurado. Defina o endpoint no .env e reinicie o app.'
    );
  }
  return endpoint.replace(/\/send-alert\/?$/, '/catalog');
}

function authToken(): string {
  const token = process.env.EXPO_PUBLIC_ALERT_INGEST_SECRET?.trim() ?? '';
  if (!token) {
    throw new CatalogError(
      'config',
      'Servidor não configurado. Defina o segredo de ingestão no .env e reinicie o app.'
    );
  }
  return token;
}

export function authorizedJsonHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${authToken()}`,
    'Content-Type': 'application/json',
  };
}

export function alertEndpoint(): string {
  const endpoint = process.env.EXPO_PUBLIC_ALERT_ENDPOINT?.trim() ?? '';
  if (!endpoint) {
    throw new CatalogError(
      'config',
      'Servidor não configurado. Defina o endpoint no .env e reinicie o app.'
    );
  }
  return endpoint;
}

export async function catalogRequest<T>(body: unknown): Promise<T> {
  const response = await fetch(catalogUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    const code = payload.error ?? 'catalog_failed';
    const raw = payload.message || '';
    const message = /not found/i.test(raw)
      ? 'A função de cadastro não foi encontrada no servidor.'
      : raw || MESSAGES[code] || 'Não foi possível falar com o servidor.';
    throw new CatalogError(code, message);
  }

  return payload as T;
}

export function messageForCode(code: string | undefined, fallback: string): string {
  if (!code) return fallback;
  return MESSAGES[code] ?? fallback;
}
