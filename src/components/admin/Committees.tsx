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
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | { cat: string } | null>(null);
  const [catFilter, setCatFilter] = useState('all');
  const [form, setForm] = useState({ name: '', abbreviation: '', topic: '', description: '', language: 'en', type: 'standard', category: '' });

  const load = async () => {
    const sb = supabase();
    const [c, p, l, d, st] = await Promise.all([
      sb.from('committees').select('*').order('sort_order').order('name'),
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
      sort_order: committees.reduce((m, c) => Math.max(m, c.sort_order || 0), 0) + 1,
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
    // .select() so an update that touched no row (blocked by permissions, row gone) is reported instead of shown as "Saved".
    const { data, error } = await supabase().from('committees').update(patch).eq('id', c.id).select('id');
    if (error) { toastError(error); return false; }
    if (!data?.length) { toastError(new Error('Nothing was saved: you may not have permission, or the committee no longer exists. Reload and try again.')); return false; }
    toast('Saved', 'success');
    load();
    return true;
  }
  async function saveTopic(c: Committee, topic: string) {
    if (topic === topicOf(c)) return true;
    if (!typeFor(c).secret_topic) return save(c, { topic });
    const { data, error } = await supabase().from('committee_secrets').upsert({ committee_id: c.id, topic, updated_at: new Date().toISOString() }).select('committee_id');
    if (error) { toastError(error); return false; }
    if (!data?.length) { toastError(new Error('Nothing was saved: you may not have permission.')); return false; }
    toast('Saved', 'success');
    load();
    return true;
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
      const { data, error } = await sb.from('committees').update({ type: key }).eq('id', c.id).select('id');
      if (error) return toastError(error);
      if (!data?.length) return toastError(new Error('Nothing was saved: you may not have permission. Reload and try again.'));
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

  // Drag and drop: the committee lands before/after the one it is dropped on (taking over its category),
  // or at the end of a category when dropped on that category's heading. Every committee is then renumbered.
  async function move(id: string, target: { id: string; after: boolean } | { cat: string }) {
    const catKeys = [...catalog.categories.map((c) => c.key), ''];
    const catOf = (c: Committee) => categoryOf(catalog, c.category)?.key || '';
    const ordered = [...committees].sort((a, b) => catKeys.indexOf(catOf(a)) - catKeys.indexOf(catOf(b)) || (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name));
    const moving = ordered.find((c) => c.id === id);
    if (!moving) return;
    const rest = ordered.filter((c) => c.id !== id);
    let cat: string;
    let at: number;
    if ('cat' in target) {
      cat = target.cat;
      const last = rest.map((c, i) => (catOf(c) === cat ? i : -1)).filter((i) => i >= 0).pop();
      at = last === undefined ? rest.filter((c) => catKeys.indexOf(catOf(c)) < catKeys.indexOf(cat)).length : last + 1;
    } else {
      const i = rest.findIndex((c) => c.id === target.id);
      if (i < 0) return;
      cat = catOf(rest[i]);
      at = i + (target.after ? 1 : 0);
    }
    const next = [...rest];
    next.splice(at, 0, { ...moving, category: cat || null });
    const changed = next.map((c, i) => ({ c, order: i + 1 })).filter(({ c, order }) => (c.sort_order || 0) !== order || (c.id === id && (moving.category || '') !== cat));
    setCommittees(next.map((c, i) => ({ ...c, sort_order: i + 1 })));
    const results = await Promise.all(changed.map(({ c, order }) => supabase().from('committees').update(c.id === id ? { sort_order: order, category: cat || null } : { sort_order: order }).eq('id', c.id)));
    const failed = results.find((r) => r.error);
    if (failed?.error) toastError(failed.error);
    load();
  }
  const endDrag = () => { setDrag(null); setOver(null); };

  // Committees grouped by category, in the catalog's order, uncategorized last.
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = committees.filter((c) => (catFilter === 'all' || (c.category || '') === (catFilter === 'none' ? '' : catFilter)) && (!needle || `${c.name} ${c.abbreviation} ${topicOf(c)}`.toLowerCase().includes(needle)));
    const keys = [...catalog.categories.map((c) => c.key), ''];
    return keys.map((k) => ({ key: k, cat: categoryOf(catalog, k), items: list.filter((c) => (categoryOf(catalog, c.category)?.key || '') === k) })).filter((g) => g.items.length || (drag && catFilter === 'all' && !needle && (g.key || committees.some((c) => !categoryOf(catalog, c.category)))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committees, q, catFilter, catalog, secrets, drag]);

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
                <button key={c.key} onClick={() => setCatFilter(c.key)} className={`px-3 py-1 text-xs font-semibold ${catFilter === c.key ? 'bg-brand text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'}`}>{c.name}</button>
              ))}
            </div>
            {anySecret && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Conference {started ? <b className="text-emerald-700">started</b> : <b className="text-amber-700">not started</b>} ({live} of {committees.length} in session; it starts at half). Confidential topics are {started ? 'now visible to assigned chairs' : 'hidden from chairs'}.</span>
                {started && <button className="btn btn-ghost btn-sm" onClick={relock}>Lock again</button>}
              </div>
            )}
          </div>

          <div className="space-y-2 overflow-y-auto px-3 pb-3">
            {groups.length === 0 && <Empty>{committees.length ? 'No committees match.' : 'No committees yet.'}</Empty>}
            {groups.map((g) => (
              <section key={g.key || 'none'}>
                <h4
                  onDragOver={(e) => { if (drag) { e.preventDefault(); setOver({ cat: g.key }); } }}
                  onDrop={(e) => { e.preventDefault(); if (drag) move(drag, { cat: g.key }); endDrag(); }}
                  className={`sticky top-0 z-10 -mx-3 mb-2 flex items-center gap-2 border-b bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 ${over && "cat" in over && over.cat === g.key ? "border-brand text-brand" : "border-slate-200"}`}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.cat?.color || '#94a3b8' }} />
                  {g.cat?.name || 'Uncategorized'} <span className="font-medium normal-case text-slate-400">({g.items.length})</span>
                </h4>
                <div className="space-y-2">
                  {g.items.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-400">Drop here</div>}
                  {g.items.map((c) => {
                    const chairIds = links.filter((l) => l.committee_id === c.id).map((l) => l.user_id);
                    const chairNames = staff.filter((s) => chairIds.includes(s.id)).map((s) => s.full_name || s.email);
                    const type = typeFor(c);
                    const topic = topicOf(c);
                    return (
                      <div
                        key={c.id}
                        data-card
                        onDragOver={(e) => { if (!drag || drag === c.id) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver({ id: c.id, after: e.clientY > r.top + r.height / 2 }); }}
                        onDrop={(e) => { e.preventDefault(); if (drag && over && "id" in over) move(drag, over); endDrag(); }}
                        className={`card relative ${drag === c.id ? "opacity-40" : ""} ${over && "id" in over && over.id === c.id ? (over.after ? "!shadow-[0_3px_0_0_rgb(var(--brand))]" : "!shadow-[0_-3px_0_0_rgb(var(--brand))]") : ""}`}>
                        <div className="flex flex-wrap items-center gap-3">
                          <span
                            draggable
                            title="Drag to reorder or to move to another category"
                            onDragStart={(e) => { setDrag(c.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.id); const card = (e.currentTarget as HTMLElement).closest("[data-card]"); if (card) e.dataTransfer.setDragImage(card, 24, 24); }}
                            onDragEnd={endDrag}
                            className="cursor-grab select-none px-1 text-lg leading-none text-slate-300 hover:text-slate-500 active:cursor-grabbing" aria-label="Drag handle">⋮⋮</span>
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
                              <TextFields key={`${c.id}-${c.name}-${c.abbreviation}-${topic}`} c={c} topic={topic} secret={!!type.secret_topic} onSave={async (v) => {
                                const patch: Partial<Committee> = {};
                                if (v.name !== c.name) patch.name = v.name;
                                if (v.abbreviation !== c.abbreviation) patch.abbreviation = v.abbreviation;
                                let ok = true;
                                if (Object.keys(patch).length) ok = (await save(c, patch)) !== false;
                                if (ok && v.topic !== topic) ok = (await saveTopic(c, v.topic)) !== false;
                                return ok;
                              }} />
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

// Name, abbreviation and topic are edited together and saved with the button (or Enter), so nothing depends on clicking away.
function TextFields({ c, topic, secret, onSave }: { c: Committee; topic: string; secret: boolean; onSave: (v: { name: string; abbreviation: string; topic: string }) => Promise<boolean> }) {
  const [v, setV] = useState({ name: c.name, abbreviation: c.abbreviation, topic });
  const [busy, setBusy] = useState(false);
  const dirty = v.name !== c.name || v.abbreviation !== c.abbreviation || v.topic !== topic;
  async function go(e?: React.FormEvent) {
    e?.preventDefault();
    if (!dirty || busy) return;
    setBusy(true);
    try { await onSave(v); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={go} className="contents">
      <Field label="Name"><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <Field label="Abbreviation"><input className="input" value={v.abbreviation} onChange={(e) => setV({ ...v, abbreviation: e.target.value })} /></Field>
      <Field label={secret ? 'Confidential topic' : 'Topic'}><input className="input" value={v.topic} onChange={(e) => setV({ ...v, topic: e.target.value })} /></Field>
      <div className="sm:col-span-3 flex items-center gap-3">
        <button type="submit" className="btn btn-primary btn-sm" disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        {dirty && <span className="text-xs font-semibold text-amber-700">Unsaved changes</span>}
      </div>
    </form>
  );
}
