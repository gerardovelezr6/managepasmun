'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast, toastError } from '@/lib/toast';
import { ArchiveRecord } from '@/lib/types';
import { useLiveReload } from '@/lib/hooks';
import { Empty, Field } from '../ui';

const CONFIRM_WORD = 'RESET';

export function System() {
  const [archives, setArchives] = useState<ArchiveRecord[]>([]);
  const [label, setLabel] = useState('');
  const [wipe, setWipe] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase().from('archive_records').select('id,label,counts,created_at').order('created_at', { ascending: false });
    setArchives((data || []) as ArchiveRecord[]);
  };
  useLiveReload([], load);

  async function archiveOnly() {
    setBusy(true);
    const { error } = await supabase().rpc('admin_create_archive', { p_label: label });
    setBusy(false);
    if (error) return toastError(error);
    toast('Archive saved. Nothing was deleted.', 'success');
    setLabel('');
    load();
  }

  async function reset() {
    if (confirm !== CONFIRM_WORD) return;
    setBusy(true);
    const { error } = await supabase().rpc('admin_reset_system', { p_label: label, p_wipe_structure: wipe });
    setBusy(false);
    if (error) return toastError(error);
    toast('System reset. A full archive was saved first.', 'success');
    setLabel('');
    setConfirm('');
    setWipe(false);
    load();
  }

  async function download(a: ArchiveRecord) {
    const { data, error } = await supabase().from('archive_records').select('snapshot').eq('id', a.id).single();
    if (error || !data) return toastError(error || 'Could not load archive');
    const blob = new Blob([JSON.stringify({ label: a.label, created_at: a.created_at, ...data.snapshot }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = `${a.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'archive'}.json`;
    el.click();
    URL.revokeObjectURL(url);
  }

  async function removeArchive(a: ArchiveRecord) {
    if (!window.confirm(`Permanently delete the archive “${a.label}”?`)) return;
    const { error } = await supabase().from('archive_records').delete().eq('id', a.id);
    if (error) return toastError(error);
    load();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="card space-y-3">
          <h3 className="font-bold">Archive &amp; reset</h3>
          <p className="text-sm text-slate-600">
            Saves a full snapshot (committees, rosters, speakers, motions, points, votes, announcements, document records) as an archive for future High Command teams. Then a reset clears the live session: attendance, speakers’ lists, motions, points, votes, announcements and timers. Accounts, branding and uploaded files are kept.
          </p>
          <Field label="Archive label"><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="[Placeholder: PASMUN 2026 Day 1]" /></Field>
          <button className="btn btn-secondary" onClick={archiveOnly} disabled={busy}>Save archive only (no deletion)</button>
        </div>

        <div className="card space-y-3 border-red-200">
          <h3 className="font-bold text-red-700">Full administrative reset</h3>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={wipe} onChange={(e) => setWipe(e.target.checked)} />
            <span>Also delete committees, delegate rosters and chair assignments (start the next conference from a blank slate).</span>
          </label>
          <Field label={`Type ${CONFIRM_WORD} to confirm`}><input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={CONFIRM_WORD} /></Field>
          <button className="btn btn-danger w-full" disabled={busy || confirm !== CONFIRM_WORD} onClick={reset}>
            {busy ? 'Working…' : 'Archive everything and reset the system'}
          </button>
          <p className="text-xs text-slate-400">The archive is written first in the same database transaction. If it fails, nothing is deleted.</p>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-3 font-bold">Archives ({archives.length})</h3>
        {archives.length === 0 ? <Empty>No archives yet.</Empty> : (
          <ul className="divide-y divide-slate-100">
            {archives.map((a) => (
              <li key={a.id} className="py-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{a.label}</div>
                    <div className="text-xs text-slate-500">{new Date(a.created_at).toLocaleString()}</div>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => download(a)}>Download JSON</button>
                  <button className="btn btn-ghost btn-sm text-red-600" onClick={() => removeArchive(a)}>Delete</button>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                  {Object.entries(a.counts || {}).map(([k, v]) => <span key={k}>{k.replace(/_/g, ' ')}: <b>{String(v)}</b></span>)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
