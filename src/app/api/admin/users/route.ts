import { NextRequest, NextResponse } from 'next/server';
import { adminClient, requireHighCommand } from '@/lib/serverAdmin';

// Account management needs the service-role key, which only ever lives on the server.
// Every call verifies the caller's Supabase session and requires role = high_command.

const ROLES = ['high_command', 'chair'];

const admin = adminClient;

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  try {
    const caller = await requireHighCommand(req);
    if (!caller) return fail('High Command only', 403);
    const { email, password, full_name = '', role } = await req.json();
    if (!email || !password || password.length < 8) return fail('Email and a password of at least 8 characters are required');
    if (!ROLES.includes(role)) return fail('Invalid role');

    const sb = admin();
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
    if (error || !data.user) return fail(error?.message || 'Could not create user');
    const { error: pErr } = await sb.from('profiles').upsert({ id: data.user.id, email, full_name, role });
    if (pErr) return fail(pErr.message, 500);
    return NextResponse.json({ id: data.user.id });
  } catch (e: any) {
    return fail(e.message, 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const caller = await requireHighCommand(req);
    if (!caller) return fail('High Command only', 403);
    const { id, role, full_name, password } = await req.json();
    if (!id) return fail('Missing id');
    const sb = admin();

    if (role !== undefined) {
      if (!ROLES.includes(role)) return fail('Invalid role');
      if (id === caller.id && role !== 'high_command') return fail('You cannot remove your own High Command role');
    }
    if (password !== undefined) {
      if (String(password).length < 8) return fail('Password must be at least 8 characters');
      const { error } = await sb.auth.admin.updateUserById(id, { password });
      if (error) return fail(error.message);
    }
    const patch: Record<string, string> = {};
    if (role !== undefined) patch.role = role;
    if (full_name !== undefined) patch.full_name = full_name;
    if (Object.keys(patch).length) {
      const { error } = await sb.from('profiles').update(patch).eq('id', id);
      if (error) return fail(error.message, 500);
      // A demoted/changed user keeps no stale chair links beyond what RLS already blocks.
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return fail(e.message, 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const caller = await requireHighCommand(req);
    if (!caller) return fail('High Command only', 403);
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return fail('Missing id');
    if (id === caller.id) return fail('You cannot delete your own account');
    const { error } = await admin().auth.admin.deleteUser(id);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return fail(e.message, 500);
  }
}
