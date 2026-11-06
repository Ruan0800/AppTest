type ContactPayload = {
  name?: string;
  phone?: string;
  telegram_chat_id?: string | null;
};

type AlertPayload = {
  client_alert_id?: string;
  phrase?: string;
  confidence?: number;
  created_at?: string;
  time_zone?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  trigger?: string;
  contacts?: ContactPayload[];
};

type Channel = "sms" | "telegram";

type Target = {
  channel: Channel;
  destination: string;
};

type Delivery = {
  channel: Channel;
  destination: string;
  status: "sent" | "failed";
  error: string | null;
};

type AlertMessage = {
  phrase: string;
  when: string;
  map: string;
  text: string;
  sms: string;
};

const encoder = new TextEncoder();

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "method" }, 405);
  }

  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "supabase_env" }, 503);
  }
  if (!(await ingestAuthorized(token, supabaseUrl, serviceKey))) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: AlertPayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const id = (payload.client_alert_id ?? "").trim();
  const phrase = (payload.phrase ?? "").trim().slice(0, 200);
  const trigger = payload.trigger === "manual" ? "manual" : "voice";
  if (!/^[0-9a-fA-F-]{16,80}$/.test(id) || !phrase) {
    return json({ error: "invalid_payload" }, 400);
  }

  const latitude = payload.latitude;
  const longitude = payload.longitude;
  const hasLocation =
    typeof latitude === "number" && Number.isFinite(latitude) &&
    typeof longitude === "number" && Number.isFinite(longitude);
  if (!hasLocation) {
    return json({ error: "sem_localizacao" }, 503);
  }

  const incoming = Array.isArray(payload.contacts) ? payload.contacts.slice(0, 20) : [];
  const botToken = await telegramBotToken(supabaseUrl, serviceKey);
  const contacts = await enrichContacts(supabaseUrl, serviceKey, incoming);

  const existing = await rest(
    supabaseUrl,
    serviceKey,
    `alert_ingest?client_alert_id=eq.${encodeURIComponent(id)}&select=status`,
  );
  if (!existing.ok) return json({ error: "ingest_read" }, 503);
  const rows = (await existing.json()) as Array<{ status: string }>;
  if (rows[0]?.status === "sent") return json({ ok: true, duplicate: true }, 409);

  const destinations = planDestinations(contacts, botToken);
  if (destinations.length === 0) {
    const reason = refusalReason(contacts);
    if (!rows[0]) {
      const inserted = await rest(supabaseUrl, serviceKey, "alert_ingest", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          client_alert_id: id,
          phrase,
          trigger,
          confidence: payload.confidence ?? null,
          created_at: payload.created_at ?? null,
          latitude: payload.latitude ?? null,
          longitude: payload.longitude ?? null,
          accuracy: payload.accuracy ?? null,
          status: "pending",
        }),
      });
      if (!inserted.ok && inserted.status !== 409) {
        return json({ error: "ingest_insert" }, 503);
      }
    }
    await rest(supabaseUrl, serviceKey, "alert_deliveries?on_conflict=client_alert_id,channel,destination", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        client_alert_id: id,
        channel: "sms",
        destination: "nenhum",
        status: "failed",
        error: reason,
        updated_at: new Date().toISOString(),
      }),
    });
    return json({ error: reason }, 422);
  }

  if (!rows[0]) {
    const inserted = await rest(supabaseUrl, serviceKey, "alert_ingest", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        client_alert_id: id,
        phrase,
        trigger,
        confidence: payload.confidence ?? null,
        created_at: payload.created_at ?? null,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        accuracy: payload.accuracy ?? null,
        status: "pending",
      }),
    });
    if (!inserted.ok && inserted.status !== 409) {
      return json({ error: "ingest_insert" }, 503);
    }
  }

  const prior = await rest(
    supabaseUrl,
    serviceKey,
    `alert_deliveries?client_alert_id=eq.${encodeURIComponent(id)}&select=channel,destination,status`,
  );
  if (!prior.ok) return json({ error: "delivery_read" }, 503);
  const already = new Set(
    ((await prior.json()) as Array<{ channel: string; destination: string; status: string }>)
      .filter((row) => row.status === "sent")
      .map((row) => `${row.channel}:${row.destination}`),
  );

  const message = buildMessage(phrase, payload);
  let retry = false;
  const deliveries: Delivery[] = [];

  for (const target of destinations) {
    const key = `${target.channel}:${target.destination}`;
    if (already.has(key)) {
      deliveries.push({
        channel: target.channel,
        destination: target.destination,
        status: "sent",
        error: null,
      });
      continue;
    }

    const result = await send(target, message, botToken);
    deliveries.push({
      channel: target.channel,
      destination: target.destination,
      status: result.ok ? "sent" : "failed",
      error: result.ok ? null : result.error,
    });
    if (result.retry) retry = true;

    await rest(supabaseUrl, serviceKey, "alert_deliveries?on_conflict=client_alert_id,channel,destination", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        client_alert_id: id,
        channel: target.channel,
        destination: target.destination,
        status: result.ok ? "sent" : "failed",
        error: result.ok ? null : result.error,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  if (retry) return json({ ok: false, deliveries }, 503);

  await rest(
    supabaseUrl,
    serviceKey,
    `alert_ingest?client_alert_id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "sent" }),
    },
  );

  return json({ ok: true, deliveries }, 200);
});

function refusalReason(contacts: ContactPayload[]): string {
  const hasChat = contacts.some((contact) => /^-?\d{5,20}$/.test((contact.telegram_chat_id ?? "").trim()));
  if (hasChat) return "telegram_nao_configurado";
  if (smsConfig() === null) return "sms_nao_configurado";
  const hasPhone = contacts.some((contact) => {
    const phone = (contact.phone ?? "").replace(/\D/g, "");
    return phone.length >= 8 && phone.length <= 15;
  });
  if (!hasPhone) return "sem_telefone";
  return "sem_destino";
}

async function telegramBotToken(supabaseUrl: string, serviceKey: string): Promise<string> {
  const env = (Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "").trim();
  if (env) return env;
  const response = await rest(
    supabaseUrl,
    serviceKey,
    "alert_channel_config?id=eq.1&select=telegram_bot_token",
  );
  if (!response.ok) return "";
  const rows = (await response.json()) as Array<{ telegram_bot_token?: string }>;
  return (rows[0]?.telegram_bot_token ?? "").trim();
}

async function enrichContacts(
  supabaseUrl: string,
  serviceKey: string,
  incoming: ContactPayload[],
): Promise<ContactPayload[]> {
  const response = await rest(
    supabaseUrl,
    serviceKey,
    "contacts?select=name,phone,telegram_chat_id",
  );
  if (!response.ok) return incoming;
  const stored = (await response.json()) as ContactPayload[];
  const byPhone = new Map<string, ContactPayload>();
  for (const row of stored) {
    const phone = (row.phone ?? "").replace(/\D/g, "");
    if (phone) byPhone.set(phone, row);
  }
  const source = incoming.length > 0 ? incoming : stored;
  return source.slice(0, 20).map((contact) => {
    const phone = (contact.phone ?? "").replace(/\D/g, "");
    const saved = byPhone.get(phone);
    const chat = (contact.telegram_chat_id ?? "").trim() || (saved?.telegram_chat_id ?? "").trim();
    return {
      name: contact.name || saved?.name,
      phone: phone || (saved?.phone ?? "").replace(/\D/g, ""),
      telegram_chat_id: chat || null,
    };
  });
}

function planDestinations(contacts: ContactPayload[], botToken: string): Target[] {
  const smsReady = smsConfig() !== null;
  const telegramReady = Boolean(botToken);
  const targets: Target[] = [];
  const seen = new Set<string>();

  for (const contact of contacts) {
    const phone = (contact.phone ?? "").replace(/\D/g, "");
    if (smsReady && phone.length >= 8 && phone.length <= 15) {
      const key = `sms:${phone}`;
      if (!seen.has(key)) {
        seen.add(key);
        targets.push({ channel: "sms", destination: phone });
      }
    }
    const chatId = (contact.telegram_chat_id ?? "").trim();
    if (telegramReady && /^-?\d{5,20}$/.test(chatId)) {
      const key = `telegram:${chatId}`;
      if (!seen.has(key)) {
        seen.add(key);
        targets.push({ channel: "telegram", destination: chatId });
      }
    }
  }

  return targets;
}

function parseInstant(raw: string | undefined): Date {
  const value = (raw ?? "").trim();
  if (!value) return new Date();
  if (/[zZ]$/.test(value) || /[+-]\d{2}:\d{2}$/.test(value)) return new Date(value);
  const iso = value.includes("T") ? `${value}Z` : `${value.replace(" ", "T")}Z`;
  return new Date(iso);
}

function safeZone(zone: string | undefined): string | null {
  const value = (zone ?? "").trim();
  if (!value || value.length > 64) return null;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return null;
  }
}

function formatWhen(raw: string | undefined, timeZone?: string): string {
  const date = parseInstant(raw);
  if (Number.isNaN(date.getTime())) return (raw ?? "").trim();
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    timeZone: safeZone(timeZone) ?? "America/Fortaleza",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return formatted.replace(", ", " ");
}

function buildMessage(phrase: string, payload: AlertPayload) {
  const when = formatWhen(payload.created_at, payload.time_zone);
  const lat = payload.latitude;
  const lng = payload.longitude;
  const map =
    typeof lat === "number" && typeof lng === "number"
      ? `https://maps.google.com/?q=${lat},${lng}`
      : "localização indisponível";
  const text = `Alerta Vigintel\nFrase: ${phrase}\nQuando: ${when}\nLocal: ${map}`;
  const sms = `Alerta Vigintel\n${phrase.slice(0, 80)}\n${map}`.slice(0, 320);
  return { phrase, when, map, text, sms };
}

async function send(
  target: Target,
  message: AlertMessage,
  botToken: string,
): Promise<{ ok: boolean; retry: boolean; error: string | null }> {
  try {
    if (target.channel === "telegram") return await sendTelegram(target.destination, message.text, botToken);
    return await sendSms(target.destination, message.sms);
  } catch (error) {
    return { ok: false, retry: true, error: error instanceof Error ? error.message : "rede" };
  }
}

async function sendTelegram(chatId: string, text: string, token: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (response.ok) return { ok: true, retry: false, error: null };
  const body = await response.text();
  const retry = response.status === 429 || response.status >= 500;
  return { ok: false, retry, error: body.slice(0, 300) };
}

function smsConfig() {
  const sid = (Deno.env.get("TWILIO_ACCOUNT_SID") ?? "").trim();
  const token = (Deno.env.get("TWILIO_AUTH_TOKEN") ?? "").trim();
  const from = (Deno.env.get("TWILIO_FROM_NUMBER") ?? "").trim();
  const messagingServiceSid = (Deno.env.get("TWILIO_MESSAGING_SERVICE_SID") ?? "").trim();
  if (!sid || !token || (!from && !messagingServiceSid)) return null;
  return { sid, token, from, messagingServiceSid };
}

async function sendSms(phone: string, text: string) {
  const config = smsConfig();
  if (!config) return { ok: false, retry: false, error: "sms_nao_configurado" };

  const body = new URLSearchParams();
  body.set("To", `+${phone}`);
  body.set("Body", text);
  if (config.messagingServiceSid) {
    body.set("MessagingServiceSid", config.messagingServiceSid);
  } else {
    const fromDigits = config.from.replace(/\D/g, "");
    if (fromDigits.length < 8 || fromDigits.length > 15) {
      return { ok: false, retry: false, error: "remetente_sms_invalido" };
    }
    body.set("From", `+${fromDigits}`);
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.sid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${config.sid}:${config.token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  if (response.ok) return { ok: true, retry: false, error: null };
  const responseBody = await response.text();
  const retry = response.status === 429 || response.status >= 500;
  return { ok: false, retry, error: responseBody.slice(0, 300) };
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
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers });
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function ingestAuthorized(token: string, supabaseUrl: string, serviceKey: string) {
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
