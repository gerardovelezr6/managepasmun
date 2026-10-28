'use client';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRows, useRubric } from '@/lib/hooks';
import { AWARD_TYPES } from '@/lib/config';
import { computeStandings, fmtPts } from '@/lib/grading';
import { exportCommitteeLog } from '@/lib/gradingExport';
import { toast, toastError } from '@/lib/toast';
import { AwardRow, Delegate, ParticipationEntry, SessionAttendance, SessionRow, VoteRecord, WarningRow } from '@/lib/types';
import { useT } from '@/lib/i18n';
import { Flag } from '../Flag';
import { Empty } from '../ui';

// Everything the PASMUN grading-log spreadsheet shows, live: standings, attendance per session,
// warnings, winners, and a one-click export in the original workbook layout.
export function GradingLog({ committeeId, committeeName }: { committeeId: string; committeeName: string }) {
  const t = useT();
  const { rows: delegates } = useRows<Delegate>('delegates', committeeId, 'country');
  const { rows: sessions } = useRows<SessionRow>('sessions', committeeId, 'number');
  const { rows: attendance } = useRows<SessionAttendance>('session_attendance', committeeId, 'id');
  const { rows: entries } = useRows<ParticipationEntry>('participation_entries', committeeId, 'created_at');
  const { rows: warnings } = useRows<WarningRow>('warnings', committeeId, 'created_at');
  const { rows: records } = useRows<VoteRecord>('vote_records', committeeId, 'id');
  const { rows: awards } = useRows<AwardRow>('awards', committeeId, 'award');
  const { explanationPoints } = useRubric();
  const [busy, setBusy] = useState(false);

  const standings = useMemo(() => computeStandings(delegates, sessions, entries, records, explanationPoints), [delegates, sessions, entries, records, explanationPoints]);
  const attBy = useMemo(() => new Map(attendance.map((a) => [`${a.session_id}:${a.delegate_id}`, a])), [attendance]);

  async function setAward(award: AwardRow['award'], delegateId: string) {
    const sb = supabase();
    const { error } = delegateId
      ? await sb.from('awards').upsert({ committee_id: committeeId, award, delegate_id: delegateId }, { onConflict: 'committee_id,award' })
      : await sb.from('awards').delete().eq('committee_id', committeeId).eq('award', award);
    if (error) toastError(error);
  }

  async function doExport() {
    setBusy(true);
    try {
      await exportCommitteeLog(committeeId);
      toast(t('Grading log exported'), 'success');
    } catch (e) {
      toastError(e);
    }
    setBusy(false);
  }

  const suggestion = standings[0]?.total ? standings[0].delegate.country : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold">{t('Grading log')} · {committeeName}</h3>
          <p className="text-xs text-slate-500">{t('Live totals from the Participation tab. Only chairs and High Command can see grades.')}</p>
        </div>
        <button className="btn btn-primary" onClick={doExport} disabled={busy}>{busy ? t('Building…') : t('Export grading log (.xlsx)')}</button>
      </div>

      {delegates.length === 0 ? (
        <Empty>{t('No delegates yet.')}</Empty>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">{t('Delegation')}</th>
                  {sessions.map((s) => <th key={s.id} className="px-3 py-3 text-center">S{s.number}</th>)}
                  <th className="px-3 py-3 text-right">{t('Explanations')}</th>
                  <th className="px-3 py-3 text-right">{t('Total')}</th>
                  <th className="px-3 py-3 text-center">{t('Warnings')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {standings.map((st, i) => {
                  const w = warnings.filter((x) => x.delegate_id === st.delegate.id && x.kind !== 'call_of_attention');
                  const calls = warnings.filter((x) => x.delegate_id === st.delegate.id && x.kind === 'call_of_attention');
                  return (
                    <tr key={st.delegate.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2 font-semibold"><span className="inline-flex items-center gap-2"><Flag country={st.delegate.country} flag={st.delegate.flag} />{st.delegate.country}</span></td>
                      {sessions.map((s) => {
                        const a = attBy.get(`${s.id}:${st.delegate.id}`);
                        const missed = !a || a.attendance === 'absent';
                        return (
                          <td key={s.id} className="px-3 py-2 text-center">
                            <div className="font-semibold tabular-nums">{fmtPts(st.bySession[s.id] || 0)}</div>
                            <div className={`text-[10px] font-semibold uppercase ${missed ? 'text-red-600' : a!.late ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {missed ? t('missed') : a!.late ? t('late') : t('on time')}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{st.explanations ? `${st.explanations} (+${fmtPts(st.explanationPoints)})` : '—'}</td>
                      <td className="px-3 py-2 text-right text-base font-extrabold tabular-nums">{fmtPts(st.total)}</td>
                      <td className="px-3 py-2 text-center">
                        {w.length || calls.length ? (
                          <span className="inline-flex flex-wrap items-center justify-center gap-1">
                            {w.length > 0 && <span title={w.map((x) => x.reason).join('; ')} className={`badge ${w.length >= 3 ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700'}`}>⚠ {w.length}</span>}
                            {calls.length > 0 && <span title={calls.map((x) => x.reason).join('; ')} className="badge bg-amber-100 text-amber-800">{t('Call')} {calls.length}</span>}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card space-y-3">
            <div>
              <h3 className="font-bold">{t('Winners')}</h3>
              <p className="text-xs text-slate-500">{t('Pick the awards for this committee.')} {suggestion ? t('Current leader on points: {name}.', { name: suggestion }) : t('The leaderboard fills in as you grade.')}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {AWARD_TYPES.map((a) => {
                const cur = awards.find((x) => x.award === a.value)?.delegate_id || '';
                return (
                  <label key={a.value} className="block">
                    <span className="label">{t(a.label)}</span>
                    <select className="input" value={cur} onChange={(e) => setAward(a.value as AwardRow['award'], e.target.value)}>
                      <option value="">{t('— not chosen —')}</option>
                      {standings.map((st) => <option key={st.delegate.id} value={st.delegate.id}>{st.delegate.country} ({fmtPts(st.total)} {t('pts')})</option>)}
                    </select>
                  </label>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
