'use client';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLiveReload, useRubric } from '@/lib/hooks';
import { computeStandings, fmtPts } from '@/lib/grading';
import { exportCommitteeLog } from '@/lib/gradingExport';
import { toast, toastError } from '@/lib/toast';
import { Committee, Delegate, ParticipationEntry, SessionRow, VoteRecord, WarningRow } from '@/lib/types';
import { Empty } from '../ui';

// Read-only cross-committee view of participation grades (chairs enter them; High Command watches and exports).
export function ParticipationOverview() {
  const { explanationPoints } = useRubric();
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [delegates, setDelegates] = useState<Delegate[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [entries, setEntries] = useState<ParticipationEntry[]>([]);
  const [records, setRecords] = useState<VoteRecord[]>([]);
  const [warnings, setWarnings] = useState<WarningRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useLiveReload(['committees', 'delegates', 'sessions', 'participation_entries', 'vote_records', 'warnings'], async () => {
    const sb = supabase();
    const [c, d, s, e, r, w] = await Promise.all([
      sb.from('committees').select('*').order('name'),
      sb.from('delegates').select('*'),
      sb.from('sessions').select('*').order('number'),
      sb.from('participation_entries').select('*'),
      sb.from('vote_records').select('*'),
      sb.from('warnings').select('*'),
    ]);
    setCommittees((c.data || []) as Committee[]);
    setDelegates((d.data || []) as Delegate[]);
    setSessions((s.data || []) as SessionRow[]);
    setEntries((e.data || []) as ParticipationEntry[]);
    setRecords((r.data || []) as VoteRecord[]);
    setWarnings((w.data || []) as WarningRow[]);
  });

  const perCommittee = useMemo(
    () =>
      committees.map((c) => {
        const ds = delegates.filter((x) => x.committee_id === c.id);
        const ss = sessions.filter((x) => x.committee_id === c.id);
        const es = entries.filter((x) => x.committee_id === c.id);
        const rs = records.filter((x) => x.committee_id === c.id);
        return { c, sessions: ss.length, graded: es.length, warns: warnings.filter((w) => w.committee_id === c.id).length, standings: computeStandings(ds, ss, es, rs, explanationPoints) };
      }),
    [committees, delegates, sessions, entries, records, warnings, explanationPoints]
  );

  const global = useMemo(
    () =>
      perCommittee
        .flatMap((p) => p.standings.map((s) => ({ ...s, committee: p.c })))
        .filter((s) => s.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
    [perCommittee]
  );

  async function exportOne(c: Committee) {
    setBusy(c.id);
    try {
      await exportCommitteeLog(c.id);
    } catch (e) {
      toastError(e);
    }
    setBusy(null);
  }
  async function exportAll() {
    setBusy('all');
    try {
      for (const c of committees) {
        await exportCommitteeLog(c.id);
        await new Promise((r) => setTimeout(r, 400)); // let the browser start each download
      }
      toast(`Exported ${committees.length} grading log(s). Your browser may ask to allow multiple downloads.`, 'success');
    } catch (e) {
      toastError(e);
    }
    setBusy(null);
  }

  if (committees.length === 0) return <Empty>No committees yet.</Empty>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-slate-500">Grades are entered by each committee's chairs. This view is read-only and updates live.</p>
        <button className="btn btn-primary" onClick={exportAll} disabled={busy !== null}>{busy === 'all' ? 'Exporting…' : 'Export all grading logs (.xlsx)'}</button>
      </div>

      <div className="card">
        <h3 className="mb-2 font-bold">Top delegates across all committees</h3>
        {global.length === 0 ? <Empty>No grades recorded yet.</Empty> : (
          <ol className="divide-y divide-slate-100">
            {global.map((g, i) => (
              <li key={g.delegate.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-6 text-center font-bold text-slate-400">{i + 1}</span>
                <span className="flex-1 font-semibold">{g.delegate.country}</span>
                <span className="text-slate-500">{g.committee.abbreviation || g.committee.name}</span>
                <span className="w-14 text-right text-base font-extrabold tabular-nums">{fmtPts(g.total)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {perCommittee.map(({ c, sessions: n, graded, warns, standings }) => (
          <div key={c.id} className="card">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold uppercase tracking-wider text-brand">{c.abbreviation}</div>
                <div className="truncate font-bold">{c.name}</div>
                <div className="text-xs text-slate-500">{n} session{n === 1 ? '' : 's'} · {graded} scores · {warns} warning{warns === 1 ? '' : 's'}</div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => exportOne(c)} disabled={busy !== null}>{busy === c.id ? '…' : 'Export .xlsx'}</button>
            </div>
            {standings.filter((s) => s.total > 0).length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">No grades yet.</p>
            ) : (
              <ol className="mt-3 divide-y divide-slate-100 text-sm">
                {standings.filter((s) => s.total > 0).slice(0, 5).map((s, i) => (
                  <li key={s.delegate.id} className="flex items-center gap-3 py-1.5">
                    <span className="w-5 text-center font-bold text-slate-400">{i + 1}</span>
                    <span className="flex-1 truncate">{s.delegate.country}</span>
                    <span className="font-bold tabular-nums">{fmtPts(s.total)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
