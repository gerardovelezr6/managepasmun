'use client';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/hooks';
import { APP_CONFIG } from '@/lib/config';
import { nowMs } from '@/lib/clock';
import { emptyTimer, startTimer } from '@/lib/timer';
import { endSpeech } from '@/lib/session';
import { toastError } from '@/lib/toast';
import { CommitteeState, Delegate, SpeakerEntry, TimerState } from '@/lib/types';
import { Empty } from '../ui';
import { TimerPanel } from '../LiveTimer';

export function Speakers({ committeeId, state, update }: { committeeId: string; state: CommitteeState; update: (p: Partial<CommitteeState>) => Promise<boolean> }) {
  const { rows: delegates } = useRows<Delegate>('delegates', committeeId, 'country');
  const { rows: entries } = useRows<SpeakerEntry>('speakers_list', committeeId, 'position');
  const [pick, setPick] = useState('');

  const byId = useMemo(() => new Map(delegates.map((d) => [d.id, d])), [delegates]);
  const queue = entries.filter((e) => e.status === 'queued' && e.source === 'gsl');
  const spoke = entries.filter((e) => e.status === 'spoke').slice(-8).reverse();
  const queuedIds = new Set(queue.map((e) => e.delegate_id));
  const eligible = delegates.filter((d) => d.attendance !== 'absent' && !queuedIds.has(d.id));
  const speaker = state.current_speaker_id ? byId.get(state.current_speaker_id) : null;

  async function add() {
    if (!pick) return;
    const { error } = await supabase().from('speakers_list').insert({ committee_id: committeeId, delegate_id: pick, position: Date.now() });
    if (error) toastError(error);
    setPick('');
  }
  async function remove(id: string) {
    const { error } = await supabase().from('speakers_list').delete().eq('id', id);
    if (error) toastError(error);
  }
  async function move(index: number, dir: -1 | 1) {
    const a = queue[index];
    const b = queue[index + dir];
    if (!a || !b) return;
    const sb = supabase();
    await Promise.all([
      sb.from('speakers_list').update({ position: b.position }).eq('id', a.id),
      sb.from('speakers_list').update({ position: a.position }).eq('id', b.id),
    ]);
  }
  async function next() {
    const first = queue[0];
    if (!first) return;
    const sb = supabase();
    await sb.from('speakers_list').update({ status: 'spoke' }).eq('committee_id', committeeId).eq('status', 'speaking');
    await sb.from('speakers_list').update({ status: 'speaking' }).eq('id', first.id);
    await update({
      current_speaker_id: first.delegate_id,
      speaker_timer: startTimer(emptyTimer(state.speaking_time_sec * 1000), nowMs()),
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-2">
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Now speaking</div>
          <div className="mt-1 min-h-[3.5rem]">
            {speaker ? (
              <>
                <div className="text-2xl font-bold">{speaker.country}</div>
                <div className="text-sm text-slate-500">{speaker.name || 'Delegate name placeholder'}</div>
              </>
            ) : (
              <div className="pt-2 text-slate-400">No one at the podium</div>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary flex-1" onClick={next} disabled={queue.length === 0}>Next speaker →</button>
            <button className="btn btn-secondary" onClick={() => endSpeech(committeeId, state, update)} disabled={!speaker}>End speech</button>
          </div>
        </div>

        <TimerPanel label="Speaker timer" timer={state.speaker_timer} onChange={(t: TimerState) => update({ speaker_timer: t })} presetsSec={APP_CONFIG.speakingPresets} />

        <div className="card">
          <label className="label" htmlFor="spk">Default speaking time (seconds)</label>
          <div className="flex gap-2">
            <input
              id="spk"
              type="number"
              min={5}
              className="input"
              defaultValue={state.speaking_time_sec}
              key={state.speaking_time_sec}
              onBlur={(e) => {
                const v = Math.max(5, Number(e.target.value) || 0);
                if (v !== state.speaking_time_sec) update({ speaking_time_sec: v });
              }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-400">Used when you press “Next speaker”.</p>
        </div>
      </div>

      <div className="space-y-4 lg:col-span-3">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold">Speakers’ list <span className="ml-1 text-sm font-normal text-slate-500">({queue.length})</span></h3>
          </div>
          <div className="mb-3 flex gap-2">
            <select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Add a present delegate…</option>
              {eligible.map((d) => (
                <option key={d.id} value={d.id}>{d.country}{d.name ? ` — ${d.name}` : ''}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={add} disabled={!pick}>Add</button>
          </div>
          {queue.length === 0 ? (
            <Empty>The list is empty. Only delegates marked present can be added.</Empty>
          ) : (
            <ol className="divide-y divide-slate-100">
              {queue.map((e, i) => {
                const d = byId.get(e.delegate_id);
                return (
                  <li key={e.id} className="flex items-center gap-3 py-2">
                    <span className="w-6 text-center text-sm font-bold text-slate-400">{i + 1}</span>
                    <span className="flex-1 font-medium">{d?.country || 'Unknown'}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === queue.length - 1} aria-label="Move down">↓</button>
                    <button className="btn btn-ghost btn-sm text-red-600" onClick={() => remove(e.id)}>Remove</button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {spoke.length > 0 && (
          <div className="card">
            <h3 className="mb-2 text-sm font-bold text-slate-500">Recently spoke</h3>
            <div className="flex flex-wrap gap-2">
              {spoke.map((e) => (
                <span key={e.id} className="badge bg-slate-100 text-slate-600">{byId.get(e.delegate_id)?.country || '—'}{e.source === 'caucus' ? ' (caucus)' : ''}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
