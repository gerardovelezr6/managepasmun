'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/hooks';
import { APP_CONFIG } from '@/lib/config';
import { toast, toastError } from '@/lib/toast';
import { Attendance, Delegate } from '@/lib/types';
import { Empty, Seg, Spinner } from '../ui';

export function RollCall({ committeeId }: { committeeId: string }) {
  const { rows: delegates, loading } = useRows<Delegate>('delegates', committeeId, 'country');
  const [bulk, setBulk] = useState('');
  const [showManage, setShowManage] = useState(false);

  const total = delegates.length;
  const present = delegates.filter((d) => d.attendance !== 'absent').length;
  const voting = delegates.filter((d) => d.attendance === 'present_and_voting').length;
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Present" value={`${present} / ${total}`} />
        <Stat label="Present & voting" value={String(voting)} />
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
          {delegates.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{d.country}</div>
                <div className="truncate text-xs text-slate-500">{d.name || 'Delegate name placeholder'}</div>
              </div>
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
          ))}
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
