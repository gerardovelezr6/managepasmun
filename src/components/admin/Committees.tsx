'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useLiveReload } from '@/lib/hooks';
import { toast, toastError } from '@/lib/toast';
import { Committee, Profile } from '@/lib/types';
import { Empty, Field } from '../ui';

interface Link_ { committee_id: string; user_id: string }

export function Committees() {
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [links, setLinks] = useState<Link_[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', abbreviation: '', topic: '', description: '', language: 'en' });

  const load = async () => {
    const sb = supabase();
    const [c, p, l, d] = await Promise.all([
      sb.from('committees').select('*').order('name'),
      sb.from('profiles').select('*').in('role', ['chair']).order('full_name'),
      sb.from('committee_chairs').select('*'),
      sb.from('delegates').select('committee_id'),
    ]);
    setCommittees((c.data || []) as Committee[]);
    setStaff((p.data || []) as Profile[]);
    setLinks((l.data || []) as Link_[]);
    const n: Record<string, number> = {};
    for (const r of (d.data || []) as { committee_id: string }[]) n[r.committee_id] = (n[r.committee_id] || 0) + 1;
    setCounts(n);
  };
  useLiveReload(['committees', 'delegates'], load);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase().from('committees').insert({
      name: form.name.trim(),
      abbreviation: form.abbreviation.trim(),
      topic: form.topic.trim() || '[Placeholder topic]',
      description: form.description.trim() || null,
      language: form.language,
    });
    if (error) return toastError(error);
    setForm({ name: '', abbreviation: '', topic: '', description: '', language: form.language });
    toast('Committee created', 'success');
    load();
  }

  async function save(c: Committee, patch: Partial<Committee>) {
    const { error } = await supabase().from('committees').update(patch).eq('id', c.id);
    if (error) return toastError(error);
    toast('Saved', 'success');
  }

  async function toggleChair(committeeId: string, userId: string, on: boolean) {
    const sb = supabase();
    const { error } = on
      ? await sb.from('committee_chairs').insert({ committee_id: committeeId, user_id: userId })
      : await sb.from('committee_chairs').delete().eq('committee_id', committeeId).eq('user_id', userId);
    if (error) return toastError(error);
    load();
  }

  async function remove(c: Committee) {
    if (!window.confirm(`Delete “${c.name}” and ALL its delegates, motions and votes? Consider archiving first (System tab).`)) return;
    const { error } = await supabase().from('committees').delete().eq('id', c.id);
    if (error) toastError(error);
    else load();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <form onSubmit={create} className="card h-fit space-y-3">
        <h3 className="font-bold">New committee</h3>
        <Field label="Name"><input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="[Placeholder Committee Name]" /></Field>
        <Field label="Abbreviation"><input className="input" value={form.abbreviation} onChange={(e) => setForm({ ...form, abbreviation: e.target.value })} placeholder="[ABBR]" /></Field>
        <Field label="Topic"><input className="input" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="[Placeholder topic]" /></Field>
        <Field label="Description (optional)"><textarea className="input h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Language" hint="Spanish translates the chair console and the projection screen for this committee only (Mexican Spanish).">
          <select className="input" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
            <option value="en">English</option>
            <option value="es">Español (México)</option>
          </select>
        </Field>
        <button className="btn btn-primary w-full">Create committee</button>
      </form>

      <div className="space-y-3 lg:col-span-2">
        {committees.length === 0 && <Empty>No committees yet.</Empty>}
        {committees.map((c) => {
          const chairIds = links.filter((l) => l.committee_id === c.id).map((l) => l.user_id);
          const chairNames = staff.filter((s) => chairIds.includes(s.id)).map((s) => s.full_name || s.email);
          return (
            <div key={c.id} className="card">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-brand">{c.abbreviation}{c.language === 'es' && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">ES</span>}</div>
                  <div className="truncate font-bold">{c.name}</div>
                  <div className="scroll-x text-sm text-slate-500">{c.topic}</div>
                  <div className="mt-1 text-xs text-slate-500">{counts[c.id] || 0} delegates · Chairs: {chairNames.length ? chairNames.join(', ') : <i>none assigned</i>}</div>
                </div>
                <Link href={`/committee/${c.id}/run`} className="btn btn-primary btn-sm">Run</Link>
                <Link href={`/committee/${c.id}/display`} target="_blank" className="btn btn-secondary btn-sm">Screen</Link>
                <button className="btn btn-secondary btn-sm" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'Close' : 'Edit'}</button>
              </div>
              {open === c.id && (
                <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Name"><input className="input" defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && save(c, { name: e.target.value })} /></Field>
                    <Field label="Abbreviation"><input className="input" defaultValue={c.abbreviation} onBlur={(e) => e.target.value !== c.abbreviation && save(c, { abbreviation: e.target.value })} /></Field>
                    <Field label="Topic"><input className="input" defaultValue={c.topic} onBlur={(e) => e.target.value !== c.topic && save(c, { topic: e.target.value })} /></Field>
                  </div>
                  <Field label="Language">
                    <select className="input max-w-xs" value={c.language || 'en'} onChange={(e) => save(c, { language: e.target.value as Committee['language'] })}>
                      <option value="en">English</option>
                      <option value="es">Español (México)</option>
                    </select>
                  </Field>
                  <div>
                    <div className="label">Assigned chairs</div>
                    {staff.length === 0 ? <p className="text-sm text-slate-500">Create chair accounts in the Users tab first. High Command and advisors can run every committee, so they are never assigned.</p> : (
                      <div className="flex flex-wrap gap-2">
                        {staff.map((s) => {
                          const on = chairIds.includes(s.id);
                          return (
                            <label key={s.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${on ? 'border-brand bg-brand/5 font-medium' : 'border-slate-200'}`}>
                              <input type="checkbox" checked={on} onChange={(e) => toggleChair(c.id, s.id, e.target.checked)} />
                              {s.full_name || s.email}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">Delegate lists are edited by the chair under Run → Roll call → Manage delegate list.</p>
                  <button className="btn btn-ghost btn-sm text-red-600" onClick={() => remove(c)}>Delete committee</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
