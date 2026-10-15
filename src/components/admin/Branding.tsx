'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast, toastError } from '@/lib/toast';
import { Settings } from '@/lib/types';
import { BrandMark, useSettings } from '../BrandProvider';
import { Field } from '../ui';

const MAX_LOGO_MB = 4;

export function Branding() {
  const { settings, reload } = useSettings();
  const [form, setForm] = useState<Settings>(settings);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setForm(settings), [settings]);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    const { error } = await supabase()
      .from('settings')
      .update({
        conference_name: form.conference_name,
        short_name: form.short_name,
        tagline: form.tagline,
        conference_dates: form.conference_dates,
        venue: form.venue,
        primary_color: form.primary_color,
        accent_color: form.accent_color,
        default_speaking_sec: form.default_speaking_sec,
      })
      .eq('id', 1);
    setBusy(false);
    if (error) return toastError(error);
    toast('Branding saved', 'success');
    reload();
  }

  async function uploadLogo(file: File) {
    if (!file.type.startsWith('image/')) return toastError('Please choose an image file (PNG, SVG, JPG, WebP).');
    if (file.size > MAX_LOGO_MB * 1024 * 1024) return toastError(`Logo must be under ${MAX_LOGO_MB} MB.`);
    setBusy(true);
    const sb = supabase();
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `logo-${Date.now()}.${ext}`;
    const up = await sb.storage.from('branding').upload(path, file, { contentType: file.type, cacheControl: '3600' });
    if (up.error) {
      setBusy(false);
      return toastError(up.error);
    }
    const { data } = sb.storage.from('branding').getPublicUrl(path);
    const { error } = await sb.from('settings').update({ logo_url: data.publicUrl }).eq('id', 1);
    setBusy(false);
    if (error) return toastError(error);
    toast('Logo updated', 'success');
    reload();
  }

  async function removeLogo() {
    const { error } = await supabase().from('settings').update({ logo_url: null }).eq('id', 1);
    if (error) return toastError(error);
    reload();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="card h-fit space-y-4">
        <h3 className="font-bold">Site logo</h3>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) uploadLogo(f);
          }}
          onClick={() => fileRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition ${drag ? 'border-brand bg-brand/5' : 'border-slate-300 hover:border-slate-400'}`}
        >
          <BrandMark size={72} />
          <div className="text-sm font-medium">{settings.logo_url ? 'Replace logo' : 'Upload logo'}</div>
          <div className="text-xs text-slate-400">Click or drop an image · PNG, SVG, JPG or WebP · max {MAX_LOGO_MB} MB</div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ''; }} />
        </div>
        {settings.logo_url && <button className="btn btn-ghost btn-sm text-red-600" onClick={removeLogo} disabled={busy}>Remove logo</button>}
        <p className="text-xs text-slate-400">The logo appears in the header, the access screen and the projection screens.</p>
      </div>

      <form onSubmit={save} className="card space-y-4 lg:col-span-2">
        <h3 className="font-bold">Conference details</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Conference name"><input className="input" value={form.conference_name} onChange={(e) => set('conference_name', e.target.value)} /></Field>
          <Field label="Short name"><input className="input" value={form.short_name} onChange={(e) => set('short_name', e.target.value)} /></Field>
          <Field label="Tagline"><input className="input" value={form.tagline} onChange={(e) => set('tagline', e.target.value)} /></Field>
          <Field label="Dates"><input className="input" value={form.conference_dates} onChange={(e) => set('conference_dates', e.target.value)} /></Field>
          <Field label="Venue"><input className="input" value={form.venue} onChange={(e) => set('venue', e.target.value)} /></Field>
          <Field label="Default speaking time (sec)" hint="Applied to newly created committees.">
            <input type="number" min={5} className="input" value={form.default_speaking_sec} onChange={(e) => set('default_speaking_sec', Math.max(5, Number(e.target.value) || 5))} />
          </Field>
          <Field label="Primary color">
            <div className="flex items-center gap-2"><input type="color" className="h-10 w-14 cursor-pointer rounded border border-slate-300" value={form.primary_color} onChange={(e) => set('primary_color', e.target.value)} /><input className="input" value={form.primary_color} onChange={(e) => set('primary_color', e.target.value)} /></div>
          </Field>
          <Field label="Accent color">
            <div className="flex items-center gap-2"><input type="color" className="h-10 w-14 cursor-pointer rounded border border-slate-300" value={form.accent_color} onChange={(e) => set('accent_color', e.target.value)} /><input className="input" value={form.accent_color} onChange={(e) => set('accent_color', e.target.value)} /></div>
          </Field>
        </div>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save branding'}</button>
      </form>
    </div>
  );
}
