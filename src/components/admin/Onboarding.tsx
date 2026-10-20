'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast, toastError } from '@/lib/toast';
import { Profile } from '@/lib/types';
import { Empty, Field } from '../ui';

interface AuthStatus {
  id: string;
  invited_at: string | null;
  password_set_at: string | null;
  last_sign_in_at: string | null;
  recovery_sent_at: string | null;
}
interface Created {
  email: string;
  tempPassword: string;
  emailSent: boolean;
  emailError: string | null;
}

async function api(method: string, body?: unknown) {
  const { data } = await supabase().auth.getSession();
  const res = await fetch('/api/admin/invite', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'Request failed');
  return j;
}

function statusOf(s?: AuthStatus): { text: string; tone: string } {
  if (!s) return { text: 'Unknown', tone: 'bg-slate-100 text-slate-600' };
  if (s.password_set_at) return { text: 'Password set', tone: 'bg-emerald-100 text-emerald-800' };
  if (s.invited_at) return { text: 'Waiting for password', tone: 'bg-amber-100 text-amber-800' };
  if (s.last_sign_in_at) return { text: 'Active', tone: 'bg-emerald-100 text-emerald-800' };
  return { text: 'Never signed in', tone: 'bg-slate-100 text-slate-600' };
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
const ROLE_LABEL: Record<string, string> = { high_command: 'High Command', chair: 'Chair', pending: 'No access' };

// Invite people by email: they choose their own password through the emailed link.
export function Onboarding() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [status, setStatus] = useState<Record<string, AuthStatus>>({});
  const [form, setForm] = useState({ email: '', full_name: '', role: 'chair' });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase().from('profiles').select('*').order('created_at', { ascending: false });
    setUsers((data || []) as Profile[]);
    try {
      const j = await api('GET');
      setStatus(Object.fromEntries((j.users as AuthStatus[]).map((u) => [u.id, u])));
    } catch (e) {
      toastError(e);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('POST', form);
      setCreated(r);
      setForm({ email: '', full_name: '', role: form.role });
      await load();
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  }

  async function resend(u: Profile) {
    setWorking(u.id);
    try {
      await api('PATCH', { id: u.id, mode: 'email' });
      toast(`Email sent to ${u.email}`, 'success');
      await load();
    } catch (err) {
      toastError(err);
    }
    setWorking(null);
  }

  async function copyLink(u: Profile) {
    setWorking(u.id);
    try {
      const { link } = await api('PATCH', { id: u.id, mode: 'link' });
      await navigator.clipboard.writeText(link);
      toast(`Set-password link for ${u.email} copied. Send it privately.`, 'success');
    } catch (err) {
      toastError(err);
    }
    setWorking(null);
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied', 'success');
    } catch {
      toast('Copy failed. Select the text instead.', 'error');
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4">
        <form onSubmit={invite} className="card h-fit space-y-3">
          <h3 className="font-bold">Invite a new user</h3>
          <p className="text-xs text-slate-500">They get an email with a link to choose their own password.</p>
          <Field label="Full name"><input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="[Placeholder Name]" /></Field>
          <Field label="Email"><input type="email" required className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="chair@example.org" /></Field>
          <Field label="Role">
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="chair">Committee Chair</option>
              <option value="high_command">High Command (Secretariat)</option>
            </select>
          </Field>
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Inviting…' : 'Create account and send email'}</button>
        </form>

        {created && (
          <div className="card space-y-2 border-brand">
            <h3 className="font-bold">{created.email} was created</h3>
            {created.emailSent ? (
              <p className="text-sm text-emerald-700">The set-password email was sent.</p>
            ) : (
              <p className="text-sm text-red-600">The email could not be sent: {created.emailError}. Use “Copy link” in the list below to share the link yourself.</p>
            )}
            <div>
              <div className="label">Temporary password (shown only now)</div>
              <div className="flex gap-2">
                <input readOnly className="input font-mono" value={created.tempPassword} onFocus={(e) => e.target.select()} />
                <button type="button" className="btn btn-secondary" onClick={() => copy(created.tempPassword)}>Copy</button>
              </div>
              <p className="mt-1 text-xs text-slate-500">It works until they set their own. Passwords people choose are encrypted and cannot be viewed by anyone.</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreated(null)}>Dismiss</button>
          </div>
        )}
      </div>

      <div className="card lg:col-span-2">
        <h3 className="mb-3 font-bold">Accounts ({users.length})</h3>
        {users.length === 0 ? <Empty>No accounts yet.</Empty> : (
          <div className="divide-y divide-slate-100">
            {users.map((u) => {
              const s = status[u.id];
              const st = statusOf(s);
              return (
                <div key={u.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{u.full_name || '(no name)'} <span className="ml-1 text-xs font-normal text-slate-400">{ROLE_LABEL[u.role] || u.role}</span></div>
                    <div className="truncate text-xs text-slate-500">{u.email}</div>
                    <div className="text-xs text-slate-400">Last sign-in: {when(s?.last_sign_in_at ?? null)}{s?.recovery_sent_at ? ` · Email sent: ${when(s.recovery_sent_at)}` : ''}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.tone}`}>{st.text}</span>
                  <button className="btn btn-secondary btn-sm" disabled={working === u.id} onClick={() => resend(u)}>Email link</button>
                  <button className="btn btn-ghost btn-sm" disabled={working === u.id} onClick={() => copyLink(u)}>Copy link</button>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">“Email link” sends Supabase’s password-reset email. “Copy link” gives you the same link to pass on by hand if an email does not arrive.</p>
      </div>
    </div>
  );
}
