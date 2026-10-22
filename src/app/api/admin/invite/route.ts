import { NextRequest, NextResponse } from 'next/server';
import { User } from '@supabase/supabase-js';
import { adminClient, advisorGuard, requireHighCommand, siteUrl } from '@/lib/serverAdmin';

// Onboarding without email: High Command creates an account and gets a one-time link to hand over.
// The person opens the link, chooses their own password on /set-password and is signed in.
// Passwords are hashed by Supabase and can't be read back by anyone.

const ROLES = ['advisor', 'high_command', 'chair'];
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// A link for this address: an invite link until the person has joined, a recovery link afterwards.
async function makeLink(req: NextRequest, email: string, pending: boolean, data?: Record<string, unknown>) {
  const options = { redirectTo: `${siteUrl(req)}/set-password`, ...(data ? { data } : {}) };
  const { data: link, error } = await adminClient().auth.admin.generateLink(
    pending ? { type: 'invite', email, options } : { type: 'recovery', email, options: { redirectTo: options.redirectTo } }
  );
  if (error || !link.properties?.action_link) throw new Error(error?.message || 'Could not create link');
  return { link: link.properties.action_link, id: link.user?.id as string | undefined };
}

// Status of every account, from Supabase Auth.
export async function GET(req: NextRequest) {
  try {
    if (!(await requireHighCommand(req))) return fail('High Command only', 403);
    const { data, error } = await adminClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return fail(error.message, 500);
    return NextResponse.json({
      users: (data.users as User[]).map((u) => ({
        id: u.id,
        invited_at: (u.user_metadata?.invited_at as string) || null,
        password_set_at: (u.user_metadata?.password_set_at as string) || null,
        last_sign_in_at: u.last_sign_in_at || null,
      })),
    });
  } catch (e: any) {
    return fail(e.message, 500);
  }
}

// Create an account and return its set-password link. Nothing is emailed.
export async function POST(req: NextRequest) {
  try {
    const caller = await requireHighCommand(req);
    if (!caller) return fail('High Command only', 403);
    const { email, full_name = '', role } = await req.json();
    const addr = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) return fail('Enter a valid email address');
    if (!ROLES.includes(role)) return fail('Invalid role');
    const blocked = await advisorGuard(caller, { newRole: role });
    if (blocked) return fail(blocked, 403);

    const sb = adminClient();
    const { data: existing } = await sb.from('profiles').select('id').eq('email', addr).maybeSingle();
    if (existing) {
      const g = await advisorGuard(caller, { targetId: existing.id });
      if (g) return fail(g, 403);
    }
    const { link, id } = await makeLink(req, addr, true, { full_name, invited_at: new Date().toISOString() });
    if (!id) return fail('Could not create user', 500);
    const { error: pErr } = await sb.from('profiles').upsert({ id, email: addr, full_name, role });
    if (pErr) return fail(pErr.message, 500);
    return NextResponse.json({ id, email: addr, link });
  } catch (e: any) {
    // generateLink refuses an invite for an address that already joined.
    const msg = String(e.message || '');
    return fail(/already|registered|exists/i.test(msg) ? 'That email already has an account. Use “Copy link” in the list.' : msg, 500);
  }
}

// A fresh link for an existing account.
export async function PATCH(req: NextRequest) {
  try {
    const caller = await requireHighCommand(req);
    if (!caller) return fail('High Command only', 403);
    const { id } = await req.json();
    if (!id) return fail('Missing id');
    const blocked = await advisorGuard(caller, { targetId: id });
    if (blocked) return fail(blocked, 403);
    const { data: u, error } = await adminClient().auth.admin.getUserById(id);
    if (error || !u.user?.email) return fail(error?.message || 'User not found', 404);
    const { link } = await makeLink(req, u.user.email, !u.user.email_confirmed_at);
    return NextResponse.json({ link });
  } catch (e: any) {
    return fail(e.message, 500);
  }
}
