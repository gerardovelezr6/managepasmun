'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLiveReload, useTick } from '@/lib/hooks';
import { toast, toastError } from '@/lib/toast';
import { Announcement } from '@/lib/types';
import { useAuth } from '../AuthProvider';
import { Empty, Field, Seg } from '../ui';

export function Announcements() {
  const { session } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<Announcement['severity']>('info');
  const [expiresMin, setExpiresMin] = useState<number | ''>('');
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [startAt, setStartAt] = useState('');
  useTick(15_000);

  useLiveReload(['announcements'], async () => {
    const { data } = await supabase().from('announcements').select('*').order('created_at', { ascending: false });
    setItems((data || []) as Announcement[]);
  });

  async function send(e: React.FormEvent) {
    e.preventDefault();
    let start: Date | null = null;
    if (when === 'later') {
      start = startAt ? new Date(startAt) : null; // datetime-local is read in this browser's time zone
      if (!start || Number.isNaN(start.getTime())) return toastError('Pick the date and time to send it.');
      if (start.getTime() <= Date.now()) return toastError('That time has already passed. Pick a later time or choose Send now.');
    }
    // Auto-hide counts from the moment it goes live.
    const from = start ? start.getTime() : Date.now();
    const { error } = await supabase().from('announcements').insert({
      message: message.trim(),
      severity,
      created_by: session?.user.id,
      starts_at: start ? start.toISOString() : null,
      expires_at: expiresMin ? new Date(from + Number(expiresMin) * 60_000).toISOString() : null,
    });
    if (error) return toastError(error);
    setMessage('');
    setExpiresMin('');
    setStartAt('');
    toast(start ? `Scheduled for ${start.toLocaleString()}` : 'Sent to every dashboard and projection screen', 'success');
  }
  async function remove(id: string) {
    const { error } = await supabase().from('announcements').delete().eq('id', id);
    if (error) toastError(error);
  }

  const now = Date.now();
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <form onSubmit={send} className="card h-fit space-y-3">
        <h3 className="font-bold">Global announcement</h3>
        <Field label="Message"><textarea required className="input h-24" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="[Placeholder: Lunch is served in the main hall at 12:30]" /></Field>
        <Field label="Priority"><Seg<Announcement['severity']> value={severity} onChange={setSeverity} options={[{ value: 'info', label: 'Info' }, { value: 'urgent', label: 'Urgent', tone: 'bg-red-600 text-white' }]} /></Field>
        <Field label="When"><Seg<'now' | 'later'> value={when} onChange={setWhen} options={[{ value: 'now', label: 'Send now' }, { value: 'later', label: 'Schedule' }]} /></Field>
        {when === 'later' && (
          <Field label="Send at" hint="In your local time. It appears on every screen at that moment.">
            <input type="datetime-local" required className="input" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </Field>
        )}
        <Field label="Auto-hide after (minutes)" hint={when === 'later' ? 'Counted from when it goes live. Leave blank to keep it up until deleted.' : 'Leave blank to keep it up until deleted.'}>
          <input type="number" min={1} className="input" value={expiresMin} onChange={(e) => setExpiresMin(e.target.value ? Number(e.target.value) : '')} />
        </Field>
        <button className="btn btn-primary w-full" disabled={!message.trim()}>{when === 'later' ? 'Schedule announcement' : 'Send to all committees'}</button>
      </form>
      <div className="card lg:col-span-2">
        <h3 className="mb-3 font-bold">Announcements</h3>
        {items.length === 0 ? <Empty>Nothing sent yet.</Empty> : (
          <ul className="divide-y divide-slate-100">
            {items.map((a) => {
              const expired = a.expires_at && new Date(a.expires_at).getTime() <= now;
              const scheduled = a.starts_at && new Date(a.starts_at).getTime() > now;
              const fmt = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
              return (
                <li key={a.id} className="flex items-start gap-3 py-3">
                  <span className={`badge mt-0.5 ${a.severity === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{a.severity}</span>
                  {scheduled && <span className="badge mt-0.5 bg-sky-100 text-sky-800">scheduled</span>}
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm ${expired ? 'text-slate-400 line-through' : ''}`}>{a.message}</div>
                    <div className="text-xs text-slate-400">{a.starts_at ? `${scheduled ? 'Goes live' : 'Went live'} ${fmt(a.starts_at)}` : new Date(a.created_at).toLocaleString()}{a.expires_at ? ` · ${expired ? 'expired' : 'expires'} ${fmt(a.expires_at)}` : ''}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm text-red-600" onClick={() => remove(a.id)}>{scheduled ? 'Cancel' : 'Delete'}</button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
