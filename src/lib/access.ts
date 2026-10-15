// Global conference access code: signed, expiring cookie. Uses Web Crypto so it runs in
// both the Edge middleware and Node route handlers.
export const ACCESS_COOKIE = 'mp_access';
export const ACCESS_HOURS = 72;

const enc = new TextEncoder();

function code() {
  return process.env.CONFERENCE_ACCESS_CODE || '';
}
function secret() {
  return process.env.ACCESS_COOKIE_SECRET || '';
}

async function hmac(message: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret() + '|' + code()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function accessConfigured() {
  return Boolean(code() && secret());
}

export function codeMatches(input: string) {
  return accessConfigured() && safeEqual(input.trim(), code());
}

// Rotating CONFERENCE_ACCESS_CODE or ACCESS_COOKIE_SECRET invalidates every existing cookie.
export async function createAccessToken() {
  const exp = Date.now() + ACCESS_HOURS * 3600 * 1000;
  return `${exp}.${await hmac(String(exp))}`;
}

export async function verifyAccessToken(token?: string) {
  if (!token || !accessConfigured()) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(exp));
}
