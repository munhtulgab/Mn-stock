/**
 * CallPro SMS gateway client.
 *
 * API: https://api-text.callpro.mn/v1/sms
 * Auth: `x-api-key` request header.
 */

const BASE_URL = "https://api-text.callpro.mn/v1/sms";
const TIMEOUT_MS = 15_000;

export interface SmsCredentials {
  apiKey: string;
  from: string;
  brand?: string;
}

export interface SendSmsResult {
  ok: boolean;
  messageId?: string;
  status?: string;
  error?: string;
}

/**
 * CallPro expects a local 8-digit subscriber number, so the Mongolian country
 * code is stripped whether it arrives as +976, 976, or with spaces/dashes.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  const local = digits.startsWith("976") && digits.length > 8 ? digits.slice(3) : digits;
  return /^\d{8}$/.test(local) ? local : null;
}

/** Turns a CallPro error payload into a Mongolian message. */
function humanizeError(status: number, body: unknown): string {
  const payload = body as { error?: string; reason?: string; issues?: unknown[] } | null;
  const raw = payload?.error ?? payload?.reason ?? "";

  switch (status) {
    case 401:
      return "CallPro: API түлхүүр буруу байна.";
    case 402:
      return "CallPro: Дансны төлбөр төлөгдөөгүй байна.";
    case 403:
      return raw === "Blocked number"
        ? "CallPro: Хүлээн авагчийн дугаар хориглогдсон байна."
        : `CallPro: Хандах эрхгүй байна.${raw ? ` (${raw})` : ""}`;
    case 404:
      return "CallPro: Хүсэлт олдсонгүй.";
    case 422:
      return "CallPro: Илгээх мэдээлэл буруу байна (дугаар эсвэл текст).";
    case 500:
      return "CallPro: Серверийн алдаа гарлаа. Дараа дахин оролдоно уу.";
    default:
      return `CallPro алдаа ${status}${raw ? `: ${raw}` : ""}`;
  }
}

export async function sendSms(
  creds: SmsCredentials,
  to: string,
  text: string,
): Promise<SendSmsResult> {
  const recipient = normalizePhone(to);
  if (!recipient) {
    return { ok: false, error: "Утасны дугаар буруу байна (8 оронтой байх ёстой)." };
  }
  const sender = normalizePhone(creds.from) ?? creds.from;

  const payload: Record<string, string> = { from: sender, to: recipient, text };
  if (creds.brand?.trim()) payload.brand = creds.brand.trim();

  try {
    const res = await fetch(`${BASE_URL}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": creds.apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: humanizeError(res.status, body) };
    }

    const data = body as { status?: string; message_id?: string } | null;
    return { ok: true, status: data?.status, messageId: data?.message_id };
  } catch (err) {
    const message =
      (err as Error).name === "TimeoutError"
        ? "CallPro хариу өгөхгүй байна (хугацаа хэтэрлээ)."
        : `CallPro холболтын алдаа: ${(err as Error).message}`;
    return { ok: false, error: message };
  }
}

export interface SmsBalance {
  balance: number;
  current: number;
  totalMessage: number;
}

export async function getSmsBalance(
  apiKey: string,
  operator: "skytel" | "mobicom" | "unitel" = "skytel",
): Promise<{ ok: true; balance: SmsBalance } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${BASE_URL}/tenant/daily?operator=${operator}`, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: humanizeError(res.status, body) };

    const data = body as {
      balance?: number;
      current?: number;
      total_message?: number;
    };
    return {
      ok: true,
      balance: {
        balance: data.balance ?? 0,
        current: data.current ?? 0,
        totalMessage: data.total_message ?? 0,
      },
    };
  } catch (err) {
    return { ok: false, error: `CallPro холболтын алдаа: ${(err as Error).message}` };
  }
}
