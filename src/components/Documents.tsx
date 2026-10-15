'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLiveReload } from '@/lib/hooks';
import { APP_CONFIG, DOC_KINDS, labelFor } from '@/lib/config';
import { toast, toastError } from '@/lib/toast';
import { DocRow } from '@/lib/types';
import { useAuth } from './AuthProvider';
import { Empty, Field } from './ui';

interface Cmt { id: string; name: string; abbreviation: string }

// Draft resolutions & crisis documents.
//  - Inside a committee (committeeId set): that committee's documents + every global document.
//  - In the High Command panel (committeeId = null): documents organised in folders:
//    one "Global" folder plus one folder per committee (labelled by abbreviation).
//    Uploads made there are global, so every chair sees them.
export function Documents({ committeeId }: { committeeId: string | null }) {
  const { session, isHC } = useAuth();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [committees, setCommittees] = useState<Cmt[]>([]);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<string>(DOC_KINDS[0].label);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useLiveReload(['documents', 'committees'], async () => {
    const sb = supabase();
    let q = sb.from('documents').select('*').is('archive_id', null).order('created_at', { ascending: false });
    if (committeeId) q = q.or(`committee_id.eq.${committeeId},committee_id.is.null`);
    const [{ data }, { data: cs }] = await Promise.all([q, sb.from('committees').select('id,name,abbreviation').order('abbreviation')]);
    setDocs((data || []) as DocRow[]);
    setCommittees((cs || []) as Cmt[]);
  });

  const label = (c: Cmt) => c.abbreviation || c.name;
  const byId = new Map(committees.map((c) => [c.id, c]));

  async function upload() {
    if (!file || !title.trim()) return;
    if (file.size > APP_CONFIG.maxUploadMb * 1024 * 1024) return toastError(`File is larger than ${APP_CONFIG.maxUploadMb} MB`);
    setBusy(true);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${committeeId || 'global'}/${Date.now()}-${safe}`;
    const sb = supabase();
    const up = await sb.storage.from('documents').upload(path, file, { contentType: file.type || undefined });
    if (up.error) {
      setBusy(false);
      return toastError(up.error);
    }
    const { error } = await sb.from('documents').insert({ committee_id: committeeId, title: title.trim(), kind: kind.trim() || DOC_KINDS[0].label, file_path: path, uploaded_by: session?.user.id });
    setBusy(false);
    if (error) {
      await sb.storage.from('documents').remove([path]);
      return toastError(error);
    }
    setTitle('');
    setFile(null);
    toast('Uploaded', 'success');
  }

  async function open(d: DocRow) {
    const { data, error } = await supabase().storage.from('documents').createSignedUrl(d.file_path, 120);
    if (error || !data) return toastError(error || 'Could not open file');
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function remove(d: DocRow) {
    if (!window.confirm(`Delete “${d.title}”?`)) return;
    const sb = supabase();
    await sb.storage.from('documents').remove([d.file_path]);
    const { error } = await sb.from('documents').delete().eq('id', d.id);
    if (error) toastError(error);
  }

  // Chairs can only delete their own committee's documents; High Command can delete anything.
  const canDelete = (d: DocRow) => isHC || (committeeId !== null && d.committee_id === committeeId);

  const DocItem = ({ d, badge }: { d: DocRow; badge?: string }) => (
    <li key={d.id} className="card flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{d.title}</span>
          {badge && <span className={`badge shrink-0 ${badge === 'Global' ? 'bg-brand/10 text-brand' : 'bg-slate-100 text-slate-600'}`}>{badge}</span>}
        </div>
        <div className="text-xs text-slate-500">{labelFor(DOC_KINDS, d.kind)} · {new Date(d.created_at).toLocaleString()}</div>
      </div>
      <button className="btn btn-secondary btn-sm" onClick={() => open(d)}>Open</button>
      {canDelete(d) && <button className="btn btn-ghost btn-sm text-red-600" onClick={() => remove(d)}>Delete</button>}
    </li>
  );

  const Folder = ({ k, name, hint, items, defaultOpen }: { k: string; name: string; hint?: string; items: DocRow[]; defaultOpen?: boolean }) => (
    <details key={k} open={defaultOpen} className="group rounded-xl border border-slate-200 bg-slate-50/60">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
        <span className="text-lg" aria-hidden>📁</span>
        <span className="font-bold">{name}</span>
        {hint && <span className="hidden truncate text-xs text-slate-500 sm:inline">{hint}</span>}
        <span className="badge ml-auto bg-white text-slate-600 ring-1 ring-slate-200">{items.length}</span>
        <span className="text-slate-400 transition group-open:rotate-90" aria-hidden>›</span>
      </summary>
      <div className="px-3 pb-3">
        {items.length === 0 ? <p className="px-1 py-2 text-sm text-slate-400">No documents in this folder.</p> : (
          <ul className="space-y-2">{items.map((d) => DocItem({ d }))}</ul>
        )}
      </div>
    </details>
  );

  // Suggestions: built-in types plus any custom types already in use.
  const kindOptions = Array.from(new Set([...DOC_KINDS.map((k) => k.label), ...docs.map((d) => labelFor(DOC_KINDS, d.kind))]));

  const globalDocs = docs.filter((d) => !d.committee_id);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="card h-fit space-y-3 lg:col-span-2">
        <h3 className="font-bold">{committeeId ? 'Upload a document' : 'Upload a global document'}</h3>
        {!committeeId && <p className="text-xs text-slate-500">Global documents are visible to every chair in every committee.</p>}
        <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="[Placeholder: Draft Resolution 1.1]" /></Field>
        <Field label="Type" hint="Pick a suggestion or type your own (e.g. Position paper, Press release).">
          <input className="input" list="doc-kinds" value={kind} onChange={(e) => setKind(e.target.value)} placeholder="[Placeholder document type]" />
          <datalist id="doc-kinds">
            {kindOptions.map((k) => <option key={k} value={k} />)}
          </datalist>
        </Field>
        <Field label="File" hint={`Max ${APP_CONFIG.maxUploadMb} MB. Stored privately; only chairs and High Command can open it.`}>
          <input type="file" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </Field>
        <button className="btn btn-primary w-full" disabled={busy || !file || !title.trim() || !kind.trim()} onClick={upload}>{busy ? 'Uploading…' : 'Upload'}</button>
      </div>

      <div className="lg:col-span-3">
        {committeeId === null ? (
          // High Command: folders. Global first, then one per committee by abbreviation.
          <div className="space-y-3">
            {Folder({ k: 'global', name: 'Global documents', hint: 'Visible to every chair', items: globalDocs, defaultOpen: true })}
            {committees.length === 0 && <Empty>No committees yet, so there are no committee folders.</Empty>}
            {committees.map((c) =>
              Folder({ k: c.id, name: label(c), hint: c.abbreviation ? c.name : undefined, items: docs.filter((d) => d.committee_id === c.id) })
            )}
          </div>
        ) : docs.length === 0 ? (
          <Empty>No documents yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) =>
              DocItem({ d, badge: d.committee_id ? (byId.get(d.committee_id) ? label(byId.get(d.committee_id)!) : 'Committee') : 'Global' })
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
