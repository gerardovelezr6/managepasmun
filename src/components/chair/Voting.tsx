'use client';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/hooks';
import { THRESHOLD_LABEL, tally, voteOutcome } from '@/lib/session';
import { toastError } from '@/lib/toast';
import { CommitteeState, Delegate, VoteRecord, VoteRow } from '@/lib/types';
import { Empty, Field, Seg } from '../ui';

type Choice = VoteRecord['choice'];
type Explanation = VoteRecord['explanation'];

export const CHOICE_LABEL: Record<Choice, string> = { for: 'In favor', against: 'Against', abstain: 'Abstain' };

// none -> requested -> given -> none
const NEXT_EXPLANATION: Record<string, Explanation> = { none: 'requested', requested: 'given', given: null };

async function cycleExplanation(rec: VoteRecord) {
  const next = NEXT_EXPLANATION[rec.explanation || 'none'];
  const { error } = await supabase().from('vote_records').update({ explanation: next }).eq('id', rec.id);
  if (error) toastError(error);
}

function ExplainButton({ rec }: { rec: VoteRecord }) {
  const s = rec.explanation || 'none';
  const style =
    s === 'requested' ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300' : s === 'given' ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50';
  const label = s === 'requested' ? 'Explanation requested · mark given' : s === 'given' ? 'Explanation given ✓ · undo' : 'Right of explanation';
  return (
    <button onClick={() => cycleExplanation(rec)} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${style}`}>
      {label}
    </button>
  );
}

export function Voting({ committeeId, update }: { committeeId: string; state: CommitteeState; update: (p: Partial<CommitteeState>) => Promise<boolean> }) {
  const { rows: delegates } = useRows<Delegate>('delegates', committeeId, 'country');
  const { rows: votes } = useRows<VoteRow>('votes', committeeId, 'created_at', false);
  // vote_records has no created_at column, so order by id.
  const { rows: records } = useRows<VoteRecord>('vote_records', committeeId, 'id');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<VoteRow['kind']>('procedural');
  const [threshold, setThreshold] = useState<VoteRow['threshold']>('simple');

  const open = votes.find((v) => v.status === 'open');
  const closed = votes.filter((v) => v.status === 'closed');
  const lastSubstantive = closed.find((v) => v.kind === 'substantive');
  const byDelegate = useMemo(() => {
    const m = new Map<string, VoteRecord>();
    for (const r of records) if (open && r.vote_id === open.id) m.set(r.delegate_id, r);
    return m;
  }, [records, open]);
  const live = tally(Array.from(byDelegate.values()));
  const eligible = delegates.filter((d) => d.attendance !== 'absent');
  const missing = eligible.length - byDelegate.size;

  async function start() {
    if (!title.trim()) return;
    const { error } = await supabase().from('votes').insert({ committee_id: committeeId, title: title.trim(), kind, threshold });
    if (error) return toastError(error);
    await update({ mode: 'voting' });
    setTitle('');
  }

  async function cast(d: Delegate, choice: Choice) {
    if (!open) return;
    const existing = byDelegate.get(d.id);
    const sb = supabase();
    const { error } =
      existing && existing.choice === choice
        ? await sb.from('vote_records').delete().eq('id', existing.id) // tap again to clear
        : await sb
            .from('vote_records')
            .upsert({ vote_id: open.id, committee_id: committeeId, delegate_id: d.id, choice, explanation: null }, { onConflict: 'vote_id,delegate_id' });
    if (error) toastError(error);
  }

  async function close() {
    if (!open) return;
    const result = voteOutcome(live, open.threshold);
    const { error } = await supabase()
      .from('votes')
      .update({ status: 'closed', result, final_for: live.for, final_against: live.against, final_abstain: live.abstain, closed_at: new Date().toISOString() })
      .eq('id', open.id);
    if (error) return toastError(error);
    await update({ mode: 'formal' });
  }

  async function cancel() {
    if (!open || !window.confirm('Cancel this vote and discard recorded votes?')) return;
    const { error } = await supabase().from('votes').delete().eq('id', open.id);
    if (error) return toastError(error);
    await update({ mode: 'formal' });
  }

  if (!open) {
    const explainRecs = lastSubstantive ? records.filter((r) => r.vote_id === lastSubstantive.id && r.choice !== 'abstain') : [];
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="card space-y-3">
            <h3 className="font-bold">Open a vote</h3>
            <Field label="What is being voted on?">
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="[Placeholder: e.g. Draft Resolution 1.1]" />
            </Field>
            <Field label="Type" hint={kind === 'procedural' ? 'Procedural: In favor / Against only. No abstentions, no explanations.' : 'Substantive: In favor / Against / Abstain, plus right of explanation for those voting in favor or against.'}>
              <Seg<VoteRow['kind']> value={kind} onChange={setKind} options={[{ value: 'procedural', label: 'Procedural' }, { value: 'substantive', label: 'Substantive' }]} />
            </Field>
            <Field label="Needed to pass">
              <Seg<VoteRow['threshold']> value={threshold} onChange={setThreshold} options={[{ value: 'simple', label: 'Simple majority' }, { value: 'two_thirds', label: 'Two-thirds' }]} />
            </Field>
            <button className="btn btn-primary w-full" disabled={!title.trim()} onClick={start}>Open voting procedure</button>
          </div>

          {lastSubstantive && (
            <div className="card">
              <h3 className="font-bold">Right of explanation</h3>
              <p className="mb-3 text-sm text-slate-500">{lastSubstantive.title}. Delegates who voted in favor or against may explain their vote. Click to cycle: requested → given → cleared.</p>
              {explainRecs.length === 0 ? <Empty>No in-favor or against votes were recorded.</Empty> : (
                <ul className="divide-y divide-slate-100">
                  {explainRecs.map((r) => {
                    const d = delegates.find((x) => x.id === r.delegate_id);
                    return (
                      <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate font-semibold">{d?.country || 'Unknown'}</span>
                        <span className={`badge ${r.choice === 'for' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{CHOICE_LABEL[r.choice]}</span>
                        <ExplainButton rec={r} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="card h-fit">
          <h3 className="mb-3 font-bold">Vote history</h3>
          {closed.length === 0 ? <Empty>No votes yet.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {closed.map((v) => (
                <li key={v.id} className="py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{v.title}</span>
                    <span className={`badge ml-auto ${v.result === 'passed' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{v.result}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {v.final_for} in favor · {v.final_against} against{v.kind === 'substantive' ? ` · ${v.final_abstain} abstain` : ''} · {THRESHOLD_LABEL[v.threshold]} · {v.kind}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  const substantive = open.kind === 'substantive';
  const projected = voteOutcome(live, open.threshold);
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Voting now · <span className={substantive ? 'text-brand' : ''}>{open.kind}</span> · {THRESHOLD_LABEL[open.threshold]}
          </div>
          <div className="truncate text-xl font-bold">{open.title}</div>
          <div className="text-xs text-slate-400">{substantive ? 'Abstentions and right of explanation are enabled.' : 'Procedural: In favor or Against only.'}</div>
        </div>
        <Tally label="In favor" n={live.for} tone="text-emerald-600" />
        <Tally label="Against" n={live.against} tone="text-red-600" />
        {substantive && <Tally label="Abstain" n={live.abstain} tone="text-slate-500" />}
        <div className="text-center text-xs text-slate-500">Remaining<div className="text-xl font-bold text-slate-800">{Math.max(0, missing)}</div></div>
      </div>

      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {eligible.length === 0 && <div className="p-6 text-center text-sm text-slate-500">No delegates are marked present. Take roll call first.</div>}
        {eligible.map((d) => {
          const rec = byDelegate.get(d.id);
          const mayAbstain = d.attendance === 'present'; // "present & voting" delegates cannot abstain
          return (
            <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{d.country}</div>
                <div className="text-xs text-slate-400">{d.attendance === 'present_and_voting' ? 'Present & voting' : 'Present'}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <ChoiceBtn active={rec?.choice === 'for'} tone="bg-emerald-600" onClick={() => cast(d, 'for')}>In favor</ChoiceBtn>
                <ChoiceBtn active={rec?.choice === 'against'} tone="bg-red-600" onClick={() => cast(d, 'against')}>Against</ChoiceBtn>
                {substantive && (
                  <ChoiceBtn
                    active={rec?.choice === 'abstain'}
                    tone="bg-slate-600"
                    disabled={!mayAbstain}
                    title={mayAbstain ? undefined : 'Present & voting delegates cannot abstain'}
                    onClick={() => cast(d, 'abstain')}
                  >
                    Abstain
                  </ChoiceBtn>
                )}
                {substantive && rec && rec.choice !== 'abstain' && <ExplainButton rec={rec} />}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" onClick={close}>Close vote &amp; record result ({projected})</button>
        <button className="btn btn-secondary" onClick={cancel}>Cancel vote</button>
      </div>
    </div>
  );
}

function Tally({ label, n, tone }: { label: string; n: number; tone: string }) {
  return (
    <div className="text-center text-xs text-slate-500">
      {label}
      <div className={`text-3xl font-extrabold tabular-nums ${tone}`}>{n}</div>
    </div>
  );
}

function ChoiceBtn({ active, tone, onClick, children, disabled, title }: { active: boolean; tone: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? `${tone} text-white` : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
    >
      {children}
    </button>
  );
}
