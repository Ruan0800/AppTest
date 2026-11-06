type Action =
  | "list_keywords"
  | "add_keyword"
  | "remove_keyword"
  | "list_contacts"
  | "add_contact"
  | "remove_contact"
  | "list_alerts"
  | "delivery_status";

type CatalogBody = {
  action?: Action;
  id?: string;
  word?: string;
  name?: string;
  phone?: string;
  telegram_chat_id?: string | null;
};

const MAX_KEYWORDS = 15;
const MAX_CONTACTS = 5;
const encoder = new TextEncoder();

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "method", message: "Use POST." }, 405);
  }

  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "supabase_env", message: "Servidor indisponível." }, 503);
  }
  if (!(await authorized(token, supabaseUrl, serviceKey))) {
    return json({ error: "unauthorized", message: "Acesso negado." }, 401);
  }

  let body: CatalogBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json", message: "Pedido inválido." }, 400);
  }

  try {
    switch (body.action) {
      case "list_keywords":
        return json(await listKeywords(supabaseUrl, serviceKey), 200);
      case "add_keyword":
        return await addKeyword(supabaseUrl, serviceKey, body.word ?? "");
      case "remove_keyword":
        return await removeRow(supabaseUrl, serviceKey, "keywords", body.id ?? "");
      case "list_contacts":
        return json(await listContacts(supabaseUrl, serviceKey), 200);
      case "add_contact":
        return await addContact(supabaseUrl, serviceKey, body);
      case "remove_contact":
        return await removeRow(supabaseUrl, serviceKey, "contacts", body.id ?? "");
      case "list_alerts":
        return json(await listAlerts(supabaseUrl, serviceKey), 200);
      case "delivery_status":
        return json(await deliveryStatus(supabaseUrl, serviceKey, body.id ?? ""), 200);
      default:
        return json({ error: "invalid_action", message: "Ação inválida." }, 400);
    }
  } catch {
    return json({ error: "catalog_failed", message: "Não foi possível acessar os dados." }, 503);
  }
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

async function listKeywords(supabaseUrl: string, serviceKey: string) {
  const response = await rest(
    supabaseUrl,
    serviceKey,
    "keywords?select=id,word,created_at&order=created_at.desc",
  );
  if (!response.ok) throw new Error("keywords");
  return { keywords: await response.json() };
}

async function addKeyword(supabaseUrl: string, serviceKey: string, raw: string) {
  const word = raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
  if (!word) {
    return json({ error: "invalid_word", message: "Digite uma palavra-chave." }, 400);
  }

  const current = await rest(supabaseUrl, serviceKey, "keywords?select=id");
  if (!current.ok) throw new Error("keywords");
  const rows = (await current.json()) as unknown[];
  if (rows.length >= MAX_KEYWORDS) {
    return json({ error: "limit", message: "Limite de palavras atingido." }, 400);
  }

  const inserted = await rest(supabaseUrl, serviceKey, "keywords", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ word }),
  });
  if (inserted.status === 409) {
    return json({ error: "duplicate", message: "Essa palavra já está cadastrada." }, 409);
  }
  if (!inserted.ok) throw new Error("keywords");
  const created = (await inserted.json()) as unknown[];
  return json({ keyword: created[0] ?? null }, 200);
}

async function listContacts(supabaseUrl: string, serviceKey: string) {
  const response = await rest(
    supabaseUrl,
    serviceKey,
    "contacts?select=id,name,phone,telegram_chat_id,created_at&order=created_at.desc",
  );
  if (!response.ok) throw new Error("contacts");
  return { contacts: await response.json() };
}

async function addContact(supabaseUrl: string, serviceKey: string, body: CatalogBody) {
  const name = (body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const phone = (body.phone ?? "").replace(/\D/g, "");
  const chatRaw = (body.telegram_chat_id ?? "").trim();
  const telegramChatId = chatRaw || null;

  if (!name || !phone) {
    return json({ error: "invalid_contact", message: "Informe nome e telefone." }, 400);
  }
  if (!/^[0-9]{8,15}$/.test(phone)) {
    return json({ error: "invalid_phone", message: "Telefone inválido." }, 400);
  }
  if (!telegramChatId || !/^-?[0-9]{5,20}$/.test(telegramChatId)) {
    return json({ error: "invalid_telegram", message: "Informe o ID do Telegram." }, 400);
  }

  const current = await rest(supabaseUrl, serviceKey, "contacts?select=id");
  if (!current.ok) throw new Error("contacts");
  const rows = (await current.json()) as unknown[];
  if (rows.length >= MAX_CONTACTS) {
    return json({ error: "limit", message: "Limite de contatos atingido." }, 400);
  }

  const inserted = await rest(supabaseUrl, serviceKey, "contacts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      name,
      phone,
      telegram_chat_id: telegramChatId,
    }),
  });
  if (inserted.status === 409) {
    return json({ error: "duplicate", message: "Esse contato já está cadastrado." }, 409);
  }
  if (!inserted.ok) throw new Error("contacts");
  const created = (await inserted.json()) as unknown[];
  return json({ contact: created[0] ?? null }, 200);
}

async function removeRow(
  supabaseUrl: string,
  serviceKey: string,
  table: "keywords" | "contacts",
  id: string,
) {
  if (!/^[0-9a-fA-F-]{32,40}$/.test(id)) {
    return json({ error: "invalid_id", message: "Registro inválido." }, 400);
  }
  const response = await rest(
    supabaseUrl,
    serviceKey,
    `${table}?id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  );
  if (!response.ok) throw new Error(table);
  return json({ ok: true }, 200);
}

async function deliveryStatus(supabaseUrl: string, serviceKey: string, id: string) {
  if (!/^[0-9a-fA-F-]{32,40}$/.test(id)) {
    return { deliveries: [] };
  }
  const response = await rest(
    supabaseUrl,
    serviceKey,
    `alert_deliveries?client_alert_id=eq.${encodeURIComponent(id)}&select=channel,status,error`,
  );
  if (!response.ok) throw new Error("deliveries");
  return { deliveries: await response.json() };
}

async function listAlerts(supabaseUrl: string, serviceKey: string) {
  const response = await rest(
    supabaseUrl,
    serviceKey,
    "alert_ingest?select=client_alert_id,phrase,trigger,confidence,created_at,received_at,latitude,longitude,accuracy,status&order=received_at.desc&limit=100",
  );
  if (!response.ok) throw new Error("alerts");
  const rows = (await response.json()) as Array<{
    client_alert_id: string;
    phrase: string;
    trigger?: string;
    confidence: number | null;
    created_at: string | null;
    received_at: string;
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    status: string;
  }>;

  return {
    alerts: rows.map((row) => {
      const trigger = row.trigger === "manual" ? "manual" : "voice";
      return {
        id: row.client_alert_id,
        trigger,
        matched_word: trigger === "voice" ? row.phrase : null,
        created_at: row.created_at ?? row.received_at,
        notified: row.status === "sent" ? 1 : 0,
        confidence: row.confidence,
        latitude: row.latitude,
        longitude: row.longitude,
        accuracy: row.accuracy,
        sync_status: row.status === "sent" ? "sent" : "pending",
        error: null,
      };
    }),
  };
}

async function rest(
  supabaseUrl: string,
  serviceKey: string,
  path: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceKey);
  headers.set("Authorization", `Bearer ${serviceKey}`);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers });
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function authorized(token: string, supabaseUrl: string, serviceKey: string) {
  const expected = Deno.env.get("ALERT_INGEST_SECRET") ?? "";
  if (expected && safeEqual(token, expected)) return true;
  if (!token) return false;

  const response = await rest(
    supabaseUrl,
    serviceKey,
    "alert_ingest_auth?id=eq.1&select=token_sha256",
  );
  if (!response.ok) return false;
  const rows = (await response.json()) as Array<{ token_sha256?: string }>;
  const stored = rows[0]?.token_sha256 ?? "";
  if (!stored) return false;
  return safeEqual(await sha256Hex(token), stored);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a[index] ^ b[index];
  return diff === 0;
}
