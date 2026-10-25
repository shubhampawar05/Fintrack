/**
 * Stateless signed session cookie (HMAC-SHA256 via Web Crypto, so it works in middleware).
 * Format: v1.<expiresAtEpochSeconds>.<base64url signature>
 */
export const SESSION_COOKIE = "ft_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

function b64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function key(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (at least 32 characters).");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function sign(payload: string): Promise<string> {
  return b64url(await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(payload)));
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const payload = `v1.${Math.floor(now / 1000) + SESSION_TTL_SECONDS}`;
  return `${payload}.${await sign(payload)}`;
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function verifySessionToken(token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  try {
    return safeEqual(parts[2], await sign(`${parts[0]}.${parts[1]}`));
  } catch {
    return false;
  }
}
