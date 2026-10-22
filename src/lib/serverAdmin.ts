import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-only helpers for routes that need the service-role key.
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server is missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type Caller = { id: string; role: 'high_command' | 'advisor' };

// Returns the caller if their Supabase session belongs to a High Command user or an advisor, otherwise null.
export async function requireHighCommand(req: NextRequest): Promise<Caller | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const sb = adminClient();
  const { data } = await sb.auth.getUser(token);
  if (!data.user) return null;
  const { data: p } = await sb.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  return p?.role === 'high_command' || p?.role === 'advisor' ? { id: data.user.id, role: p.role } : null;
}

// Where emailed links should send people. Set NEXT_PUBLIC_SITE_URL on Vercel to your real domain.
export function siteUrl(req: NextRequest) {
  // Only the origin counts: a path pasted into the variable (e.g. /set-password) is ignored.
  try {
    const fixed = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (fixed) return new URL(fixed).origin;
  } catch {}
  return req.headers.get('origin') || req.nextUrl.origin;
}

// Advisor accounts (and the advisor role) can only be handled by advisors. Returns an error message or null.
export async function advisorGuard(caller: Caller, opts: { targetId?: string; newRole?: string }) {
  if (caller.role === 'advisor') return null;
  if (opts.newRole === 'advisor') return 'Only an advisor can give the advisor role';
  if (opts.targetId) {
    const { data } = await adminClient().from('profiles').select('role').eq('id', opts.targetId).maybeSingle();
    if (data?.role === 'advisor') return 'Only an advisor can change an advisor account';
  }
  return null;
}
