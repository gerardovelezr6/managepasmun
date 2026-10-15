'use client';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/hooks';
import { MOTION_TYPES, POINT_TYPES, labelFor } from '@/lib/config';
import { motionPatch } from '@/lib/session';
import { toast, toastError } from '@/lib/toast';
import { CommitteeState, Delegate, EventRow } from '@/lib/types';
import { Empty, Field, Seg } from '../ui';

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  passed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  withdrawn: 'bg-slate-100 text-slate-600',
  addressed: 'bg-emerald-100 text-emerald-700',
  out_of_order: 'bg-red-100 text-red-700',
};

export function Motions({ committeeId, update }: { committeeId: string; state: CommitteeState; update: (p: Partial<CommitteeState>) => Promise<boolean> }) {
  const { rows: delegates } = useRows<Delegate>('delegates', committeeId, 'country');
  const { rows: events } = useRows<EventRow>('events', committeeId, 'created_at', false);
  const [kind, setKind] = useState<'motion' | 'point'>('motion');
  const [type, setType] = useState(MOTION_TYPES[2].value);
  const [delegateId, setDelegateId] = useState('');
  const [details, setDetails] = useState('');
  const [durationMin, setDurationMin] = useState(10);
  const [speakingSec, setSpeakingSec] = useState(60);

  const byId = useMemo(() => new Map(delegates.map((d) => [d.id, d])), [delegates]);
  const motionDef = MOTION_TYPES.find((m) => m.value === type);
  const present = delegates.filter((d) => d.attendance !== 'absent');

  function switchKind(k: 'motion' | 'point') {
    setKind(k);
    setType(k === 'motion' ? MOTION_TYPES[2].value : POINT_TYPES[0].value);
  }

  async function log() {
    const row = {
      committee_id: committeeId,
      kind,
      type,
      delegate_id: delegateId || null,
      details: details.trim() || null,
      duration_sec: kind === 'motion' && motionDef?.needsDuration ? durationMin * 60 : null,
      speaking_sec: kind === 'motion' && motionDef?.needsSpeaking ? speakingSec : null,
      status: kind === 'motion' ? 'pending' : 'raised',
    };
    const { error } = await supabase().from('events').insert(row);
    if (error) return toastError(error);
    setDetails('');
    setDelegateId('');
  }

  async function setStatus(ev: EventRow, status: string) {
    const { error } = await supabase().from('events').update({ status }).eq('id', ev.id);
    if (error) return toastError(error);
    if (ev.kind === 'motion' && status === 'passed') {
      const patch = motionPatch(ev);
      if (patch) {
        await update(patch);
        toast(ev.type.includes('caucus') ? 'Motion passed. Caucus is ready on the Caucus tab.' : 'Motion passed and applied.', 'success');
      }
    }
  }
  async function del(id: string) {
    const { error } = await supabase().from('events').delete().eq('id', id);
    if (error) toastError(error);
  }

  const pending = events.filter((e) => e.kind === 'motion' && e.status === 'pending');

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="card h-fit space-y-3 lg:col-span-2">
        <Seg<'motion' | 'point'> value={kind} onChange={switchKind} options={[{ value: 'motion', label: 'Motion' }, { value: 'point', label: 'Point' }]} />
        <Field label={kind === 'motion' ? 'Motion' : 'Point'}>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {(kind === 'motion' ? MOTION_TYPES : POINT_TYPES).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Raised by">
          <select className="input" value={delegateId} onChange={(e) => setDelegateId(e.target.value)}>
            <option value="">— unspecified —</option>
            {present.map((d) => <option key={d.id} value={d.id}>{d.country}</option>)}
          </select>
        </Field>
        {kind === 'motion' && motionDef?.needsDuration && (
          <Field label="Total duration (minutes)">
            <input type="number" min={1} className="input" value={durationMin} onChange={(e) => setDurationMin(Math.max(1, Number(e.target.value) || 1))} />
          </Field>
        )}
        {kind === 'motion' && motionDef?.needsSpeaking && (
          <Field label="Speaking time (seconds)">
            <input type="number" min={5} className="input" value={speakingSec} onChange={(e) => setSpeakingSec(Math.max(5, Number(e.target.value) || 5))} />
          </Field>
        )}
        <Field label={kind === 'motion' ? 'Topic / details' : 'Details'}>
          <input className="input" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="[Placeholder details]" />
        </Field>
        <button className="btn btn-primary w-full" onClick={log}>Log {kind}</button>
        {kind === 'motion' && <p className="text-xs text-slate-400">Passing a caucus, speaking-time, suspension or adjournment motion applies it to the committee automatically.</p>}
      </div>

      <div className="space-y-4 lg:col-span-3">
        {pending.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <b>{pending.length}</b> motion{pending.length > 1 ? 's' : ''} on the floor. Vote in order of disruptiveness.
          </div>
        )}
        {events.length === 0 ? (
          <Empty>No points or motions logged yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {events.map((ev) => (
              <li key={ev.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${ev.kind === 'motion' ? 'bg-brand/10 text-brand' : 'bg-slate-100 text-slate-700'}`}>{ev.kind === 'motion' ? 'Motion' : 'Point'}</span>
                  <span className="font-semibold">{labelFor(ev.kind === 'motion' ? MOTION_TYPES : POINT_TYPES, ev.type)}</span>
                  <span className={`badge ${STATUS_TONE[ev.status] || 'bg-slate-100 text-slate-600'}`}>{ev.status.replace('_', ' ')}</span>
                  <span className="ml-auto text-xs text-slate-400">{new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {ev.delegate_id ? <b>{byId.get(ev.delegate_id)?.country}</b> : 'Delegate unspecified'}
                  {ev.duration_sec ? ` · ${ev.duration_sec / 60} min` : ''}
                  {ev.speaking_sec ? ` · ${ev.speaking_sec}s speaking` : ''}
                  {ev.details ? ` · ${ev.details}` : ''}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ev.kind === 'motion' && ev.status === 'pending' && (
                    <>
                      <button className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setStatus(ev, 'passed')}>Pass</button>
                      <button className="btn btn-sm bg-red-600 text-white hover:bg-red-700" onClick={() => setStatus(ev, 'failed')}>Fail</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setStatus(ev, 'withdrawn')}>Withdraw</button>
                    </>
                  )}
                  {ev.kind === 'point' && ev.status === 'raised' && (
                    <>
                      <button className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setStatus(ev, 'addressed')}>Addressed</button>
                      <button className="btn btn-sm bg-red-600 text-white hover:bg-red-700" onClick={() => setStatus(ev, 'out_of_order')}>Out of order</button>
                    </>
                  )}
                  <button className="btn btn-ghost btn-sm ml-auto text-slate-400" onClick={() => del(ev.id)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
