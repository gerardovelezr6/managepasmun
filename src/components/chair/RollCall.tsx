'use client';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/hooks';
import { APP_CONFIG } from '@/lib/config';
import { toast, toastError } from '@/lib/toast';
import { Absence, Attendance, CommitteeState, Delegate, SessionAttendance, SessionRow } from '@/lib/types';
import { Empty, Seg, Spinner } from '../ui';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function RollCall({ committeeId, state }: { committeeId: string; state: CommitteeState }) {
  const { rows: delegates, loading } = useRows<Delegate>('delegates', committeeId, 'country');
  const { rows: sessions } = useRows<SessionRow>('sessions', committeeId, 'number');
  const { rows: attendance } = useRows<SessionAttendance>('session_attendance', committeeId, 'id');
  const { rows: absences } = useRows<Absence>('delegate_absences', committeeId, 'left_at');
  const [bulk, setBulk] = useState('');
  const [showManage, setShowManage] = useState(false);

  const session = sessions.find((s) => s.id === state.current_session_id) || null;
  const nextNumber = (sessions.reduce((m, s) => Math.max(m, s.number), 0) || 0) + 1;
  const lateBy = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const a of attendance) if (session && a.session_id === session.id) m.set(a.delegate_id, a.late);
    return m;
  }, [attendance, session]);
  const outBy = useMemo(() => {
    const m = new Map<string, Absence>();
    for (const a of absences) if (!a.returned_at) m.set(a.delegate_id, a);
    return m;
  }, [absences]);
  const stepOuts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of absences) if (session && a.session_id === session.id) m.set(a.delegate_id, (m.get(a.delegate_id) || 0) + 1);
    return m;
  }, [absences, session]);

  const total = delegates.length;
  const present = delegates.filter((d) => d.attendance !== 'absent').length;
  const voting = delegates.filter((d) => d.attendance === 'present_and_voting').length;
  const late = delegates.filter((d) => lateBy.get(d.id) && d.attendance !== 'absent').length;
  const debateQuorum = Math.ceil(total * APP_CONFIG.quorum.debateFraction);
  const majority = Math.floor(total * APP_CONFIG.quorum.majorityFraction) + 1;

  async function mark(id: string, attendance: Attendance) {
    const { error } = await supabase().from('delegates').update({ attendance }).eq('id', id);
    if (error) toastError(error);
  }
  async function markAll(attendance: Attendance) {
    const { error } = await supabase().from('delegates').update({ attendance }).eq('committee_id', committeeId);
    if (error) toastError(error);
  }
  async function toggleLate(d: Delegate) {
    if (!session) return;
    const { error } = await supabase()
      .from('session_attendance')
      .update({ late: !lateBy.get(d.id) })
      .eq('session_id', session.id)
      .eq('delegate_id', d.id);
    if (error) toastError(error);
  }
  async function stepOut(d: Delegate) {
    const { error } = await supabase().from('delegate_absences').insert({ committee_id: committeeId, delegate_id: d.id });
    if (error) toastError(error);
  }
  async function returned(a: Absence) {
    const { error } = await supabase().from('delegate_absences').update({ returned_at: new Date().toISOString() }).eq('id', a.id);
    if (error) toastError(error);
  }
  async function addBulk() {
    // One delegate per line: "Country, Delegate Name" (name optional)
    const rows = bulk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [country, ...rest] = l.split(',');
        return { committee_id: committeeId, country: country.trim(), name: rest.join(',').trim() };
      });
    if (!rows.length) return;
    const { error } = await supabase().from('delegates').insert(rows);
    if (error) return toastError(error);
    setBulk('');
    toast(`Added ${rows.length} delegate(s)`, 'success');
  }
  async function remove(d: Delegate) {
    if (!window.confirm(`Remove ${d.country}?`)) return;
    const { error } = await supabase().from('delegates').delete().eq('id', d.id);
    if (error) toastError(error);
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        {session ? (
          <>
            <b>Session {session.number}</b> is open. Delegates who arrive after it opened are flagged <span className="font-semibold text-amber-700">late</span> automatically.
          </>
        ) : (
          <>
            Taking roll call for <b>Session {nextNumber}</b>. Press <b>Call to order</b> (or pass an Open session motion) to start it and save this roll call.
          </>
        )}
        <span className="block text-xs text-slate-500">Roll call is saved per session and resets when a session is suspended or adjourned.</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Present" value={`${present} / ${total}`} />
        <Stat label="Present & voting" value={String(voting)} />
        <Stat label="Late" value={String(late)} />
        <Stat label={`Debate quorum (${debateQuorum})`} value={present >= debateQuorum && total > 0 ? 'Met' : 'Not met'} good={present >= debateQuorum && total > 0} />
        <Stat label={`Majority (${majority})`} value={present >= majority && total > 0 ? 'Present' : 'Short'} good={present >= majority && total > 0} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-secondary btn-sm" onClick={() => markAll('present')}>Mark all present</button>
        <button className="btn btn-secondary btn-sm" onClick={() => markAll('absent')}>Reset to absent</button>
        <button className="btn btn-ghost btn-sm ml-auto" onClick={() => setShowManage((v) => !v)}>{showManage ? 'Hide' : 'Manage'} delegate list</button>
      </div>

      {showManage && (
        <div className="card space-y-2">
          <label className="label">Add delegates (one per line: Country, Delegate Name)</label>
          <textarea className="input h-28 font-mono" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Placeholder Country 1, Delegate Name 1\nPlaceholder Country 2, Delegate Name 2'} />
          <button className="btn btn-primary btn-sm" onClick={addBulk} disabled={!bulk.trim()}>Add to roll</button>
        </div>
      )}

      {total === 0 ? (
        <Empty>No delegates yet. Use “Manage delegate list” to add the roll.</Empty>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {delegates.map((d) => {
            const out = outBy.get(d.id);
            const isPresent = d.attendance !== 'absent';
            return (
              <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{d.country}</span>
                    {isPresent && lateBy.get(d.id) && <span className="badge bg-amber-100 text-amber-800">Late</span>}
                    {out && <span className="badge bg-red-100 text-red-700">Out since {hhmm(out.left_at)}</span>}
                    {!out && (stepOuts.get(d.id) || 0) > 0 && <span className="text-xs text-slate-400">stepped out {stepOuts.get(d.id)}×</span>}
                  </div>
                  <div className="truncate text-xs text-slate-500">{d.name || 'Delegate name placeholder'}</div>
                </div>
                {isPresent && session && (
                  <button className={`btn btn-sm ${lateBy.get(d.id) ? 'bg-amber-100 text-amber-800' : 'btn-ghost'}`} onClick={() => toggleLate(d)} title="Toggle late flag">
                    Late
                  </button>
                )}
                {isPresent && (out ? (
                  <button className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => returned(out)}>Returned</button>
                ) : (
                  <button className="btn btn-secondary btn-sm" onClick={() => stepOut(d)} title="Log that this delegate left the room">Step out</button>
                ))}
                <Seg<Attendance>
                  value={d.attendance}
                  onChange={(v) => mark(d.id, v)}
                  options={[
                    { value: 'absent', label: 'Absent', tone: 'bg-slate-700 text-white' },
                    { value: 'present', label: 'Present', tone: 'bg-emerald-600 text-white' },
                    { value: 'present_and_voting', label: 'P&V', tone: 'bg-brand text-white' },
                  ]}
                />
                {showManage && <button className="btn btn-ghost btn-sm text-red-600" onClick={() => remove(d)}>Remove</button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${good === undefined ? '' : good ? 'text-emerald-600' : 'text-amber-600'}`}>{value}</div>
    </div>
  );
}
