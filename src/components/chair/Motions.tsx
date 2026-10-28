'use client';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/hooks';
import { MOTION_TYPES, POINT_TYPES, codeFor, labelFor } from '@/lib/config';
import { applyMotionEffects } from '@/lib/session';
import { toast, toastError } from '@/lib/toast';
import { CommitteeState, Delegate, EventRow, SessionRow } from '@/lib/types';
import { LOCALE, useLang, useT } from '@/lib/i18n';
import { Flag } from '../Flag';
import { Empty, Field, Seg } from '../ui';

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  passed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  withdrawn: 'bg-slate-100 text-slate-600',
  addressed: 'bg-emerald-100 text-emerald-700',
  out_of_order: 'bg-red-100 text-red-700',
};

export function Motions({
  committeeId,
  state,
  update,
  refresh,
}: {
  committeeId: string;
  state: CommitteeState;
  update: (p: Partial<CommitteeState>) => Promise<boolean>;
  refresh: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const { rows: delegates } = useRows<Delegate>('delegates', committeeId, 'country');
  const { rows: events } = useRows<EventRow>('events', committeeId, 'created_at', false);
  const { rows: sessions } = useRows<SessionRow>('sessions', committeeId, 'number');
  const [kind, setKind] = useState<'motion' | 'point'>('motion');
  const [type, setType] = useState('moderated_caucus');
  const [delegateId, setDelegateId] = useState('');
  const [details, setDetails] = useState('');
  const [durationMin, setDurationMin] = useState(10);
  const [speakingSec, setSpeakingSec] = useState(60);
  const [scope, setScope] = useState<'all' | 'current'>('all');
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const byId = useMemo(() => new Map(delegates.map((d) => [d.id, d])), [delegates]);
  const sessionNo = useMemo(() => new Map(sessions.map((s) => [s.id, s.number])), [sessions]);
  const motionDef = MOTION_TYPES.find((m) => m.value === type);
  const present = delegates.filter((d) => d.attendance !== 'absent');

  function switchKind(k: 'motion' | 'point') {
    setKind(k);
    setType(k === 'motion' ? 'moderated_caucus' : POINT_TYPES[0].value);
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
    const reason = (reasons[ev.id] || '').trim() || null;
    const { error } = await supabase().from('events').update({ status, reason }).eq('id', ev.id);
    if (error) return toastError(error);
    setReasons((r) => ({ ...r, [ev.id]: '' }));
    if (ev.kind === 'motion' && status === 'passed') {
      const msg = await applyMotionEffects(ev, committeeId, state, update, refresh, t);
      if (msg) toast(t(msg), 'success');
    }
  }
  async function del(id: string) {
    const { error } = await supabase().from('events').delete().eq('id', id);
    if (error) toastError(error);
  }

  const visible = scope === 'current' && state.current_session_id ? events.filter((e) => e.session_id === state.current_session_id) : events;
  const pending = events.filter((e) => e.kind === 'motion' && e.status === 'pending');
  const list = kind === 'motion' ? MOTION_TYPES : POINT_TYPES;

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="card h-fit space-y-3 lg:col-span-2">
        <Seg<'motion' | 'point'> value={kind} onChange={switchKind} options={[{ value: 'motion', label: t('Motion') }, { value: 'point', label: t('Point') }]} />
        <Field label={kind === 'motion' ? t('Motion') : t('Point')}>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {list.map((m) => <option key={m.value} value={m.value}>{m.code} · {t(m.label)}</option>)}
          </select>
        </Field>
        <Field label={t('Raised by')}>
          <select className="input" value={delegateId} onChange={(e) => setDelegateId(e.target.value)}>
            <option value="">{t('— unspecified —')}</option>
            {present.map((d) => <option key={d.id} value={d.id}>{d.country}</option>)}
          </select>
        </Field>
        {kind === 'motion' && motionDef?.needsDuration && (
          <Field label={t('Total duration (minutes)')}>
            <input type="number" min={1} className="input" value={durationMin} onChange={(e) => setDurationMin(Math.max(1, Number(e.target.value) || 1))} />
          </Field>
        )}
        {kind === 'motion' && motionDef?.needsSpeaking && (
          <Field label={t('Speaking time (seconds)')}>
            <input type="number" min={5} className="input" value={speakingSec} onChange={(e) => setSpeakingSec(Math.max(5, Number(e.target.value) || 5))} />
          </Field>
        )}
        <Field label={kind === 'motion' ? t('Topic / details') : t('Details')}>
          <input className="input" value={details} onChange={(e) => setDetails(e.target.value)} placeholder={t('[Placeholder details]')} />
        </Field>
        <button className="btn btn-primary w-full" onClick={log}>{kind === 'motion' ? t('Log motion') : t('Log point')}</button>
        {kind === 'motion' && (
          <p className="text-xs text-slate-400">
            {t('Passing MOS opens the next session, MSS suspends it, and caucus / speaking-time / adjournment / open-debate motions are applied automatically.')}
          </p>
        )}
      </div>

      <div className="space-y-4 lg:col-span-3">
        {pending.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {t(pending.length === 1 ? '{n} motion on the floor. Vote in order of disruptiveness.' : '{n} motions on the floor. Vote in order of disruptiveness.', { n: pending.length })}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-slate-500">{t(visible.length === 1 ? '{n} entry' : '{n} entries', { n: visible.length })}</span>
          <Seg<'all' | 'current'> value={scope} onChange={setScope} options={[{ value: 'all', label: t('All sessions') }, { value: 'current', label: t('Current session') }]} />
        </div>
        {visible.length === 0 ? (
          <Empty>{t('No points or motions logged yet.')}</Empty>
        ) : (
          <ul className="space-y-2">
            {visible.map((ev) => {
              const open = (ev.kind === 'motion' && ev.status === 'pending') || (ev.kind === 'point' && ev.status === 'raised');
              return (
                <li key={ev.id} className="card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${ev.kind === 'motion' ? 'bg-brand/10 text-brand' : 'bg-slate-100 text-slate-700'}`}>{codeFor(ev.kind === 'motion' ? MOTION_TYPES : POINT_TYPES, ev.type) || (ev.kind === 'motion' ? t('Motion') : t('Point'))}</span>
                    <span className="font-semibold">{t(labelFor(ev.kind === 'motion' ? MOTION_TYPES : POINT_TYPES, ev.type))}</span>
                    <span className={`badge ${STATUS_TONE[ev.status] || 'bg-slate-100 text-slate-600'}`}>{t(ev.status.replace('_', ' '))}</span>
                    <span className="ml-auto text-xs text-slate-400">
                      {ev.session_id && sessionNo.has(ev.session_id) ? `S${sessionNo.get(ev.session_id)} · ` : ''}
                      {new Date(ev.created_at).toLocaleTimeString(LOCALE[lang], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {ev.delegate_id ? <b className="inline-flex items-center gap-1.5"><Flag country={byId.get(ev.delegate_id)?.country || ''} flag={byId.get(ev.delegate_id)?.flag} />{byId.get(ev.delegate_id)?.country}</b> : t('Delegate unspecified')}
                    {ev.duration_sec ? ` · ${t('{n} min', { n: ev.duration_sec / 60 })}` : ''}
                    {ev.speaking_sec ? ` · ${t('{n}s speaking', { n: ev.speaking_sec })}` : ''}
                    {ev.details ? ` · ${ev.details}` : ''}
                  </div>
                  {ev.reason && <div className="mt-1 text-xs italic text-slate-500">{t('Reason')}: {ev.reason}</div>}
                  {open && (
                    <input
                      className="input mt-2"
                      placeholder={t('Reason / note (optional), e.g. did not pass due to time concerns')}
                      value={reasons[ev.id] || ''}
                      onChange={(e) => setReasons((r) => ({ ...r, [ev.id]: e.target.value }))}
                    />
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ev.kind === 'motion' && ev.status === 'pending' && (
                      <>
                        <button className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setStatus(ev, 'passed')}>{t('Pass')}</button>
                        <button className="btn btn-sm bg-red-600 text-white hover:bg-red-700" onClick={() => setStatus(ev, 'failed')}>{t('Fail')}</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setStatus(ev, 'withdrawn')}>{t('Withdraw')}</button>
                      </>
                    )}
                    {ev.kind === 'point' && ev.status === 'raised' && (
                      <>
                        <button className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setStatus(ev, 'addressed')}>{t('Addressed')}</button>
                        <button className="btn btn-sm bg-red-600 text-white hover:bg-red-700" onClick={() => setStatus(ev, 'out_of_order')}>{t('Out of order')}</button>
                      </>
                    )}
                    <button className="btn btn-ghost btn-sm ml-auto text-slate-400" onClick={() => del(ev.id)}>{t('Delete')}</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
