'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useLiveReload, useSecretTopics } from '@/lib/hooks';
import { toast, toastError } from '@/lib/toast';
import { Committee, Profile } from '@/lib/types';
import { catalogOf, categoryOf, typeOf } from '@/lib/catalog';
import { useSettings } from '../BrandProvider';
import { Empty, Field } from '../ui';

interface Link_ { committee_id: string; user_id: string }
const PLACEHOLDER = 'Confidential';

export function Committees() {
  const { settings } = useSettings();
  const catalog = catalogOf(settings);
  const secrets = useSecretTopics();
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [links, setLinks] = useState<Link_[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [live, setLive] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [form, setForm] = useState({ name: '', abbreviation: '', topic: '', description: '', language: 'en', type: 'standard', category: '' });

  const load = async () => {
    const sb = supabase();
    const [c, p, l, d, st] = await Promise.all([
      sb.from('committees').select('*').order('name'),
      sb.from('profiles').select('*').in('role', ['chair']).order('full_name'),
      sb.from('committee_chairs').select('*'),
      sb.from('delegates').select('committee_id'),
      sb.from('committee_state').select('status'),
    ]);
    setCommittees((c.data || []) as Committee[]);
    setStaff((p.data || []) as Profile[]);
    setLinks((l.data || []) as Link_[]);
    setLive(((st.data || []) as { status: string }[]).filter((s) => s.status === 'in_session').length);
    const n: Record<string, number> = {};
    for (const r of (d.data || []) as { committee_id: string }[]) n[r.committee_id] = (n[r.committee_id] || 0) + 1;
    setCounts(n);
  };
  useLiveReload(['committees', 'delegates', 'committee_state'], load);

  const typeFor = (c: { type?: string }) => typeOf(catalog, c.type);
  const topicOf = (c: Committee) => (typeFor(c).secret_topic ? secrets[c.id] ?? '' : c.topic);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const type = typeOf(catalog, form.type);
    const topic = form.topic.trim();
    const { data, error } = await supabase().from('committees').insert({
      name: form.name.trim(),
      abbreviation: form.abbreviation.trim(),
      topic: type.secret_topic ? PLACEHOLDER : topic || '[Placeholder topic]',
      description: form.description.trim() || null,
      language: form.language,
      type: form.type,
      category: form.category || null,
    }).select('id').single();
    if (error) return toastError(error);
    if (type.secret_topic) {
      const r = await supabase().from('committee_secrets').upsert({ committee_id: data.id, topic });
      if (r.error) toastError(r.error);
    }
    setForm({ name: '', abbreviation: '', topic: '', description: '', language: form.language, type: form.type, category: form.category });
    toast('Committee created', 'success');
    load();
  }

  async function save(c: Committee, patch: Partial<Committee>) {
    const { error } = await supabase().from('committees').update(patch).eq('id', c.id);
    if (error) return toastError(error);
    toast('Saved', 'success');
  }
  async function saveTopic(c: Committee, topic: string) {
    if (topic === topicOf(c)) return;
    if (!typeFor(c).secret_topic) return save(c, { topic });
    const { error } = await supabase().from('committee_secrets').upsert({ committee_id: c.id, topic, updated_at: new Date().toISOString() });
    if (error) return toastError(error);
    toast('Saved', 'success');
  }
  // Switching a committee to or from a confidential-topic type moves the topic between the public and the private place.
  async function changeType(c: Committee, key: string) {
    const was = typeFor(c);
    const now = typeOf(catalog, key);
    const sb = supabase();
    if (!was.secret_topic && now.secret_topic) {
      const r = await sb.from('committee_secrets').upsert({ committee_id: c.id, topic: c.topic });
      if (r.error) return toastError(r.error);
      await sb.from('committees').update({ type: key, topic: PLACEHOLDER }).eq('id', c.id);
    } else if (was.secret_topic && !now.secret_topic) {
      await sb.from('committees').update({ type: key, topic: secrets[c.id] || '[Placeholder topic]' }).eq('id', c.id);
      await sb.from('committee_secrets').delete().eq('committee_id', c.id);
    } else {
      const { error } = await sb.from('committees').update({ type: key }).eq('id', c.id);
      if (error) return toastError(error);
    }
    toast('Saved', 'success');
    load();
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

  async function relock() {
    if (!window.confirm('Hide confidential topics from chairs again until half of the committees are back in session?')) return;
    const { error } = await supabase().from('settings').update({ conference_started_at: null }).eq('id', 1);
    if (error) toastError(error);
    else toast('Confidential topics locked again', 'success');
  }

  // Committees grouped by category, in the catalog's order, uncategorized last.
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = committees.filter((c) => (catFilter === 'all' || (c.category || '') === (catFilter === 'none' ? '' : catFilter)) && (!needle || `${c.name} ${c.abbreviation} ${topicOf(c)}`.toLowerCase().includes(needle)));
    const keys = [...catalog.categories.map((c) => c.key), ''];
    return keys.map((k) => ({ key: k, cat: categoryOf(catalog, k), items: list.filter((c) => (categoryOf(catalog, c.category)?.key || '') === k) })).filter((g) => g.items.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committees, q, catFilter, catalog, secrets]);

  const started = !!settings.conference_started_at;
  const anySecret = committees.some((c) => typeFor(c).secret_topic);
  const formType = typeOf(catalog, form.type);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <form onSubmit={create} className="card h-fit space-y-3 lg:sticky lg:top-4">
        <h3 className="font-bold">New committee</h3>
        <Field label="Name"><input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="[Placeholder Committee Name]" /></Field>
        <Field label="Abbreviation"><input className="input" value={form.abbreviation} onChange={(e) => setForm({ ...form, abbreviation: e.target.value })} placeholder="[ABBR]" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type" hint={formType.groups.length ? `${formType.group_label || 'Groups'}: ${formType.groups.map((g) => g.name).join(', ')}` : undefined}>
            <select className="input" value={form.type} onChange={(e) => { const t = typeOf(catalog, e.target.value); setForm({ ...form, type: e.target.value, category: form.category || t.default_category || '' }); }}>
              {catalog.types.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Category">
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">Uncategorized</option>
              {catalog.categories.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label={formType.secret_topic ? 'Confidential topic' : 'Topic'} hint={formType.secret_topic ? 'Only High Command, advisors and assigned chairs see it, and chairs only once half of all committees are in session.' : undefined}>
          <input className="input" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="[Placeholder topic]" />
        </Field>
        <Field label="Description (optional)"><textarea className="input h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Language" hint="Spanish translates the chair console and the projection screen for this committee only (Mexican Spanish).">
          <select className="input" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
            <option value="en">English</option>
            <option value="es">Español (México)</option>
          </select>
        </Field>
        <button className="btn btn-primary w-full">Create committee</button>
      </form>

      <div className="lg:col-span-2">
        <div className="flex max-h-[78vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
          <div className="space-y-2 border-b border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input className="input max-w-xs flex-1" placeholder="Search committees…" value={q} onChange={(e) => setQ(e.target.value)} />
              <span className="ml-auto text-xs text-slate-500">{committees.length} committees · {live} in session</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[{ key: 'all', name: 'All' }, ...catalog.categories, { key: 'none', name: 'Uncategorized' }].map((c) => (
                <button key={c.key} onClick={() => setCatFilter(c.key)} className={`rounded-full px-3 py-1 text-xs font-semibold ${catFilter === c.key ? 'bg-brand text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'}`}>{c.name}</button>
              ))}
            </div>
            {anySecret && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Conference {started ? <b className="text-emerald-700">started</b> : <b className="text-amber-700">not started</b>} ({live} of {committees.length} in session; it starts at half). Confidential topics are {started ? 'now visible to assigned chairs' : 'hidden from chairs'}.</span>
                {started && <button className="btn btn-ghost btn-sm" onClick={relock}>Lock again</button>}
              </div>
            )}
          </div>

          <div className="space-y-4 overflow-y-auto p-3">
            {groups.length === 0 && <Empty>{committees.length ? 'No committees match.' : 'No committees yet.'}</Empty>}
            {groups.map((g) => (
              <section key={g.key || 'none'}>
                <h4 className="sticky top-0 z-10 -mx-1 mb-2 flex items-center gap-2 bg-slate-50/95 px-1 py-1 text-xs font-bold uppercase tracking-wider text-slate-500 backdrop-blur">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.cat?.color || '#94a3b8' }} />
                  {g.cat?.name || 'Uncategorized'} <span className="font-medium normal-case text-slate-400">({g.items.length})</span>
                </h4>
                <div className="space-y-2">
                  {g.items.map((c) => {
                    const chairIds = links.filter((l) => l.committee_id === c.id).map((l) => l.user_id);
                    const chairNames = staff.filter((s) => chairIds.includes(s.id)).map((s) => s.full_name || s.email);
                    const type = typeFor(c);
                    const topic = topicOf(c);
                    return (
                      <div key={c.id} className="card">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand">
                              {c.abbreviation}
                              {type.key !== 'standard' && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-slate-600">{type.name}</span>}
                              {c.language === 'es' && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">ES</span>}
                            </div>
                            <div className="truncate font-bold">{c.name}</div>
                            <div className="scroll-x text-sm text-slate-500">{type.secret_topic ? (topic ? <span>🔒 {topic}</span> : <i>🔒 No topic set</i>) : topic}</div>
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
                              <Field label={type.secret_topic ? 'Confidential topic' : 'Topic'}><input className="input" defaultValue={topic} key={`${c.id}-${topic}`} onBlur={(e) => saveTopic(c, e.target.value)} /></Field>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                              <Field label="Type">
                                <select className="input" value={type.key} onChange={(e) => changeType(c, e.target.value)}>
                                  {catalog.types.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
                                </select>
                              </Field>
                              <Field label="Category">
                                <select className="input" value={categoryOf(catalog, c.category)?.key || ''} onChange={(e) => save(c, { category: e.target.value || null })}>
                                  <option value="">Uncategorized</option>
                                  {catalog.categories.map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
                                </select>
                              </Field>
                              <Field label="Language">
                                <select className="input" value={c.language || 'en'} onChange={(e) => save(c, { language: e.target.value as Committee['language'] })}>
                                  <option value="en">English</option>
                                  <option value="es">Español (México)</option>
                                </select>
                              </Field>
                            </div>
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
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
