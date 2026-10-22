'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLiveReload } from '@/lib/hooks';
import { toast, toastError } from '@/lib/toast';
import { Profile } from '@/lib/types';
import { useAuth } from '../AuthProvider';
import { Field } from '../ui';

async function api(method: string, body?: unknown, query = '') {
  const { data } = await supabase().auth.getSession();
  const res = await fetch(`/api/admin/users${query}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'Request failed');
  return j;
}

const ROLE_LABEL: Record<string, string> = { advisor: 'Advisor', high_command: 'High Command', chair: 'Chair', pending: 'No access' };

export function Users() {
  const { profile: me, isAdvisor } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'chair' });
  const [busy, setBusy] = useState(false);

  useLiveReload(['profiles'], async () => {
    const { data } = await supabase().from('profiles').select('*').order('created_at');
    setUsers((data || []) as Profile[]);
  });
  // profiles isn't in the realtime publication, so also expose a manual reload after changes.
  const reload = async () => {
    const { data } = await supabase().from('profiles').select('*').order('created_at');
    setUsers((data || []) as Profile[]);
  };

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('POST', form);
      toast(`Created ${form.email}`, 'success');
      setForm({ email: '', password: '', full_name: '', role: 'chair' });
      await reload();
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  }
  async function setRole(u: Profile, role: string) {
    try {
      await api('PATCH', { id: u.id, role });
      await reload();
    } catch (err) {
      toastError(err);
    }
  }
  async function resetPw(u: Profile) {
    const password = window.prompt(`New password for ${u.email} (min 8 characters):`);
    if (!password) return;
    try {
      await api('PATCH', { id: u.id, password });
      toast('Password updated', 'success');
    } catch (err) {
      toastError(err);
    }
  }
  async function remove(u: Profile) {
    if (!window.confirm(`Permanently delete ${u.email}?`)) return;
    try {
      await api('DELETE', undefined, `?id=${u.id}`);
      await reload();
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <form onSubmit={create} className="card h-fit space-y-3">
        <h3 className="font-bold">Create account</h3>
        <Field label="Full name"><input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="[Placeholder Name]" /></Field>
        <Field label="Email"><input type="email" required className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="chair@example.org" /></Field>
        <Field label="Temporary password" hint="At least 8 characters. Share it privately."><input type="text" required minLength={8} className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <Field label="Role">
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="chair">Committee Chair</option>
            <option value="high_command">High Command (Secretariat)</option>
            {isAdvisor && <option value="advisor">Advisor</option>}
          </select>
        </Field>
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>

      <div className="card lg:col-span-2">
        <h3 className="mb-3 font-bold">Users ({users.length})</h3>
        <div className="divide-y divide-slate-100">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{u.full_name || '(no name)'}{u.id === me?.id && <span className="ml-2 text-xs text-slate-400">you</span>}</div>
                <div className="truncate text-xs text-slate-500">{u.email}</div>
              </div>
              <select className="input w-auto" value={u.role} disabled={u.id === me?.id || (u.role === 'advisor' && !isAdvisor)} onChange={(e) => setRole(u, e.target.value)}>
                {u.role === 'pending' && <option value="pending">{ROLE_LABEL.pending}</option>}
                <option value="chair">{ROLE_LABEL.chair}</option>
                <option value="high_command">{ROLE_LABEL.high_command}</option>
                {(isAdvisor || u.role === 'advisor') && <option value="advisor">{ROLE_LABEL.advisor}</option>}
              </select>
              <button className="btn btn-secondary btn-sm" disabled={u.role === 'advisor' && !isAdvisor} onClick={() => resetPw(u)}>Reset password</button>
              <button className="btn btn-ghost btn-sm text-red-600" disabled={u.id === me?.id || (u.role === 'advisor' && !isAdvisor)} onClick={() => remove(u)}>Delete</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
