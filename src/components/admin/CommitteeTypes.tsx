'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast, toastError } from '@/lib/toast';
import { useSettings } from '../BrandProvider';
import { BulkColumn, Catalog, Category, CommitteeType, DEFAULT_CATALOG, FlagSource, Group, catalogOf, slug } from '@/lib/catalog';
import { GroupBadge } from '../Flag';
import { Field } from '../ui';

const FLAG_SOURCES: { value: FlagSource; label: string }[] = [
  { value: 'country', label: 'Country flag (from the country name)' },
  { value: 'country_in_text', label: 'Country flag, found inside longer text' },
  { value: 'us_state', label: 'US state flag' },
  { value: 'none', label: 'No flag' },
];
const BULK: { value: string; label: string; cols: BulkColumn[] }[] = [
  { value: 'country,name', label: 'Country, Name', cols: ['country', 'name'] },
  { value: 'country,name,group', label: 'Country, Name, Group', cols: ['country', 'name', 'group'] },
  { value: 'group,name,country', label: 'Group, Name, Country', cols: ['group', 'name', 'country'] },
  { value: 'name,group', label: 'Name, Group', cols: ['name', 'group'] },
];

// High Command: define what kinds of committee exist, what they are called and how their delegates look.
export function CommitteeTypes() {
  const { settings } = useSettings();
  const saved = catalogOf(settings);
  const [cat, setCat] = useState<Catalog>(saved);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const upload = useRef<{ type: string; group: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Pick up changes saved elsewhere unless there are unsaved edits here.
  useEffect(() => {
    if (!dirty) setCat(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.committee_catalog]);

  const edit = (fn: (c: Catalog) => void) => {
    const next: Catalog = JSON.parse(JSON.stringify(cat));
    fn(next);
    setCat(next);
    setDirty(true);
  };
  const setType = (key: string, patch: Partial<CommitteeType>) => edit((c) => { const t = c.types.find((x) => x.key === key)!; Object.assign(t, patch); });
  const setCategory = (key: string, patch: Partial<Category>) => edit((c) => { Object.assign(c.categories.find((x) => x.key === key)!, patch); });
  const setGroup = (tkey: string, i: number, patch: Partial<Group>) => edit((c) => { Object.assign(c.types.find((x) => x.key === tkey)!.groups[i], patch); });

  async function save() {
    setBusy(true);
    const { error } = await supabase().from('settings').update({ committee_catalog: cat }).eq('id', 1);
    setBusy(false);
    if (error) return toastError(error);
    setDirty(false);
    toast('Saved', 'success');
  }

  async function uploadLogo(file: File) {
    const target = upload.current;
    if (!target) return;
    const path = `groups/${target.type}-${target.group}-${Date.now()}.${(file.name.split('.').pop() || 'png').toLowerCase()}`;
    const sb = supabase();
    const up = await sb.storage.from('branding').upload(path, file, { contentType: file.type, cacheControl: '3600' });
    if (up.error) return toastError(up.error);
    setGroup(target.type, target.group, { logo: sb.storage.from('branding').getPublicUrl(path).data.publicUrl });
  }

  function addCategory() {
    const name = window.prompt('Category name (e.g. Historical Committees):')?.trim();
    if (!name) return;
    let key = slug(name);
    while (cat.categories.some((c) => c.key === key)) key += '_2';
    edit((c) => c.categories.push({ key, name, color: '#475569' }));
  }
  function addType() {
    const name = window.prompt('Name of the new committee type (e.g. Joint Crisis Cabinet):')?.trim();
    if (!name) return;
    let key = slug(name);
    while (cat.types.some((t) => t.key === key)) key += '_2';
    edit((c) => c.types.push({ key, name, default_category: null, label_field: 'Country', flag: 'country', groups: [], bulk: ['country', 'name'] }));
    setOpen(key);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-slate-600">Everything about how a kind of committee looks and behaves lives here: its categories, delegate fields, parties or sides with colours and logos, flags and confidential topics. Changes apply to every committee of that type.</p>
        <button className="btn btn-secondary btn-sm" onClick={() => { setCat(DEFAULT_CATALOG); setDirty(true); }}>Restore built-in defaults</button>
        <button className="btn btn-primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
      </div>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Categories</h3>
          <button className="btn btn-secondary btn-sm" onClick={addCategory}>+ Category</button>
        </div>
        <div className="space-y-2">
          {cat.categories.map((c) => (
            <div key={c.key} className="flex flex-wrap items-center gap-2">
              <input type="color" className="h-9 w-10 rounded border border-slate-200" value={c.color} onChange={(e) => setCategory(c.key, { color: e.target.value })} aria-label="Colour" />
              <input className="input max-w-xs flex-1" value={c.name} onChange={(e) => setCategory(c.key, { name: e.target.value })} aria-label="Name" />
              <input className="input max-w-xs flex-1" value={c.name_es || ''} placeholder="Nombre en español" onChange={(e) => setCategory(c.key, { name_es: e.target.value })} aria-label="Nombre en español" />
              <button className="btn btn-ghost btn-sm text-red-600" onClick={() => window.confirm(`Remove “${c.name}”? Committees in it become uncategorized.`) && edit((x) => { x.categories = x.categories.filter((k) => k.key !== c.key); })}>Remove</button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Committee types</h3>
          <button className="btn btn-secondary btn-sm" onClick={addType}>+ Committee type</button>
        </div>
        {cat.types.map((t) => (
          <div key={t.key} className="card">
            <button className="flex w-full flex-wrap items-center gap-3 text-left" onClick={() => setOpen(open === t.key ? null : t.key)}>
              <span className="font-bold">{t.name}</span>
              <span className="text-xs text-slate-500">{t.groups.length ? t.groups.map((g) => g.name).join(' · ') : 'no groups'}</span>
              {t.secret_topic && <span className="badge bg-slate-800 text-white">confidential topic</span>}
              <span className="ml-auto text-xs text-slate-400">{open === t.key ? 'Close' : 'Edit'}</span>
            </button>
            {open === t.key && (
              <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Name"><input className="input" value={t.name} onChange={(e) => setType(t.key, { name: e.target.value })} /></Field>
                  <Field label="Nombre en español"><input className="input" value={t.name_es || ''} onChange={(e) => setType(t.key, { name_es: e.target.value })} /></Field>
                  <Field label="Default category">
                    <select className="input" value={t.default_category || ''} onChange={(e) => setType(t.key, { default_category: e.target.value || null })}>
                      <option value="">None</option>
                      {cat.categories.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Main column is called" hint="Country, State...">
                    <input className="input" value={t.label_field} onChange={(e) => setType(t.key, { label_field: e.target.value })} />
                  </Field>
                  <Field label="Se llama (español)"><input className="input" value={t.label_field_es || ''} onChange={(e) => setType(t.key, { label_field_es: e.target.value })} /></Field>
                  <Field label="Flag">
                    <select className="input" value={t.flag} onChange={(e) => setType(t.key, { flag: e.target.value as FlagSource })}>
                      {FLAG_SOURCES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Bulk-add column order">
                    <select className="input" value={t.bulk.join(',')} onChange={(e) => setType(t.key, { bulk: BULK.find((b) => b.value === e.target.value)!.cols })}>
                      {BULK.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Groups are called" hint="Party, Side..."><input className="input" value={t.group_label || ''} onChange={(e) => setType(t.key, { group_label: e.target.value })} /></Field>
                  <Field label="Se llaman (español)"><input className="input" value={t.group_label_es || ''} onChange={(e) => setType(t.key, { group_label_es: e.target.value })} /></Field>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={!!t.group_required} onChange={(e) => setType(t.key, { group_required: e.target.checked })} /> Every delegate needs a group</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={!!t.secret_topic} onChange={(e) => setType(t.key, { secret_topic: e.target.checked })} /> Confidential topic (High Command and advisors always; assigned chairs once half of all committees are in session)</label>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="label !mb-0">Groups</div>
                    <button className="btn btn-secondary btn-sm" onClick={() => setType(t.key, { groups: [...t.groups, { key: `group_${t.groups.length + 1}_${Date.now() % 10000}`, name: 'New group', short: 'NEW', color: '#475569' }] })}>+ Group</button>
                  </div>
                  {t.groups.length === 0 && <p className="text-xs text-slate-500">No groups: delegates are just listed by their {t.label_field.toLowerCase()}.</p>}
                  <div className="space-y-2">
                    {t.groups.map((g, i) => (
                      <div key={g.key} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 p-2">
                        <input type="color" className="h-9 w-10 rounded border border-slate-200" value={g.color} onChange={(e) => setGroup(t.key, i, { color: e.target.value })} aria-label="Colour" />
                        <input className="input w-36" value={g.name} onChange={(e) => setGroup(t.key, i, { name: e.target.value })} aria-label="Name" placeholder="Name" />
                        <input className="input w-36" value={g.name_es || ''} onChange={(e) => setGroup(t.key, i, { name_es: e.target.value })} aria-label="Nombre" placeholder="Nombre (es)" />
                        <input className="input w-24" value={g.short} maxLength={8} onChange={(e) => setGroup(t.key, i, { short: e.target.value })} aria-label="Badge text" placeholder="Badge" />
                        <GroupBadge groupKey={g.key} type={t} />
                        <button className="btn btn-secondary btn-sm" onClick={() => { upload.current = { type: t.key, group: i }; fileRef.current?.click(); }}>{g.logo ? 'Change logo' : 'Upload logo'}</button>
                        {g.logo && <button className="btn btn-ghost btn-sm" onClick={() => setGroup(t.key, i, { logo: '' })}>Remove logo</button>}
                        <button className="btn btn-ghost btn-sm ml-auto text-red-600" onClick={() => setType(t.key, { groups: t.groups.filter((_, k) => k !== i) })}>Remove</button>
                      </div>
                    ))}
                  </div>
                </div>
                {t.key !== 'standard' && <button className="btn btn-ghost btn-sm text-red-600" onClick={() => window.confirm(`Remove the type “${t.name}”? Committees of this type are shown as Standard.`) && edit((x) => { x.types = x.types.filter((k) => k.key !== t.key); })}>Remove type</button>}
              </div>
            )}
          </div>
        ))}
      </section>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ''; }} />
    </div>
  );
}
