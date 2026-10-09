// Signed session tokens (HMAC-SHA256 via Web Crypto) — works in middleware and route handlers.
export const SESSION_COOKIE = "forgeai_session";
export const SESSION_TTL_S = 60 * 60 * 12;

export interface Session {
  uid: string;
  email: string;
  exp: number;
}

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function key(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(s: Session, secret: string) {
  const body = b64url(enc.encode(JSON.stringify(s)));
  const sig = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined, secret: string | undefined): Promise<Session | null> {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    if (typeof s.exp !== "number" || s.exp < Date.now() / 1000) return null;
    return s;
  } catch {
    return null;
  }
}
