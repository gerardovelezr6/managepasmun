import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, ACCESS_HOURS, accessConfigured, codeMatches, createAccessToken } from '@/lib/access';

// Best-effort brute-force throttle (per server instance).
const attempts = new Map<string, { n: number; reset: number }>();
const LIMIT = 10;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  if (!accessConfigured()) {
    return NextResponse.json({ error: 'Server is missing CONFERENCE_ACCESS_CODE / ACCESS_COOKIE_SECRET.' }, { status: 500 });
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const entry = attempts.get(ip);
  if (entry && entry.reset > now && entry.n >= LIMIT) {
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  if (!codeMatches(String(body?.code ?? ''))) {
    attempts.set(ip, entry && entry.reset > now ? { n: entry.n + 1, reset: entry.reset } : { n: 1, reset: now + WINDOW_MS });
    return NextResponse.json({ error: 'Incorrect access code.' }, { status: 401 });
  }
  attempts.delete(ip);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, await createAccessToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ACCESS_HOURS * 3600,
  });
  return res;
}

// Forget the access code on this device.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
