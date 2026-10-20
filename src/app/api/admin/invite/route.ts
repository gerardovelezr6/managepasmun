import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { adminClient, requireHighCommand, siteUrl } from '@/lib/serverAdmin';

// Onboarding: High Command creates an account, the person gets Supabase's password-reset email
// and chooses their own password on /set-password. User-chosen passwords are hashed by Supabase
// and can never be read back; the only password High Command sees is the temporary one below.

const ROLES = ['high_command', 'chair'];
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const tempPassword = () => Array.from({ length: 14 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function sendResetEmail(req: NextRequest, email: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl(req)}/set-password` });
  return error?.message || null;
}

// Status of every account, from Supabase Auth.
export async function GET(req: NextRequest) {
  try {
    if (!(await requireHighCommand(req))) return fail('High Command only', 403);
    const { data, error } = await adminClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return fail(error.message, 500);
    return NextResponse.json({
      users: data.users.map((u) => ({
        id: u.id,
        invited_at: (u.user_metadata?.invited_at as string) || null,
        password_set_at: (u.user_metadata?.password_set_at as string) || null,
        last_sign_in_at: u.last_sign_in_at || null,
        recovery_sent_at: u.recovery_sent_at || null,
      })),
    });
  } catch (e: any) {
    return fail(e.message, 500);
  }
}

// Create an account and email the set-password link.
export async function POST(req: NextRequest) {
  try {
    if (!(await requireHighCommand(req))) return fail('High Command only', 403);
    const { email, full_name = '', role } = await req.json();
    const addr = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) return fail('Enter a valid email address');
    if (!ROLES.includes(role)) return fail('Invalid role');

    const sb = adminClient();
    const password = tempPassword();
    const { data, error } = await sb.auth.admin.createUser({
      email: addr,
      password,
      email_confirm: true,
      user_metadata: { full_name, invited_at: new Date().toISOString() },
    });
    if (error || !data.user) return fail(error?.message || 'Could not create user');
    const { error: pErr } = await sb.from('profiles').upsert({ id: data.user.id, email: addr, full_name, role });
    if (pErr) return fail(pErr.message, 500);

    const emailError = await sendResetEmail(req, addr);
    return NextResponse.json({ id: data.user.id, email: addr, tempPassword: password, emailSent: !emailError, emailError });
  } catch (e: any) {
    return fail(e.message, 500);
  }
}

// Re-send the email ({mode:'email'}) or get the link to share by hand ({mode:'link'}).
export async function PATCH(req: NextRequest) {
  try {
    if (!(await requireHighCommand(req))) return fail('High Command only', 403);
    const { id, mode } = await req.json();
    if (!id || !['email', 'link'].includes(mode)) return fail('Missing id or mode');
    const sb = adminClient();
    const { data: u, error } = await sb.auth.admin.getUserById(id);
    if (error || !u.user?.email) return fail(error?.message || 'User not found', 404);
    const email = u.user.email;

    if (mode === 'email') {
      const emailError = await sendResetEmail(req, email);
      if (emailError) return fail(emailError);
      return NextResponse.json({ ok: true });
    }
    const { data: link, error: lErr } = await sb.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${siteUrl(req)}/set-password` },
    });
    if (lErr || !link.properties?.action_link) return fail(lErr?.message || 'Could not create link');
    return NextResponse.json({ link: link.properties.action_link });
  } catch (e: any) {
    return fail(e.message, 500);
  }
}
