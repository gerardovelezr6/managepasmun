'use client';
import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useLiveReload, useSecretTopics, useTick } from '@/lib/hooks';
import { catalogOf, categoryOf, typeOf } from '@/lib/catalog';
import { useSettings } from '../BrandProvider';
import { MODE_LABEL } from '@/lib/config';
import { CommitteeAnalytics, SessionRow } from '@/lib/types';
import { Empty, StatusBadge } from '../ui';

// Time actually spent in session: each session counts from opening until it was suspended/adjourned,
// so the clock stands still between sessions.
function elapsed(r: CommitteeAnalytics, sessions: SessionRow[]) {
  const mine = sessions.filter((s) => s.committee_id === r.committee_id);
  let ms = 0;
  if (mine.length) {
    for (const s of mine) ms += Math.max(0, (s.closed_at ? new Date(s.closed_at).getTime() : Date.now()) - new Date(s.opened_at).getTime());
  } else if (r.status === 'in_session' && r.session_started_at) {
    ms = Date.now() - new Date(r.session_started_at).getTime(); // committee started before sessions were tracked
  } else return '—';
  const m = Math.max(0, Math.floor(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

// Topics can be long: show two lines, click to read the whole thing.
function TopicCell({ text }: { text: string }) {
  const [full, setFull] = useState(false);
  return (
    <button type="button" onClick={() => setFull((v) => !v)} title={full ? 'Click to shorten' : 'Click to read the full topic'} className={`mt-0.5 block max-w-md text-left text-xs text-slate-500 ${full ? '' : 'line-clamp-2'}`}>{text}</button>
  );
}

export function Analytics() {
  const { settings } = useSettings();
  const catalog = catalogOf(settings);
  const secrets = useSecretTopics();
  const [rows, setRows] = useState<CommitteeAnalytics[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [updated, setUpdated] = useState<Date | null>(null);
  useTick(30_000);

  useLiveReload(['committees', 'committee_state', 'delegates', 'speakers_list', 'events', 'votes', 'sessions'], async () => {
    const [{ data }, { data: ss }] = await Promise.all([
      supabase().from('committee_analytics').select('*').order('name'),
      supabase().from('sessions').select('*'),
    ]);
    setSessions((ss || []) as SessionRow[]);
    setRows(((data || []) as any[]).map((r) => ({ ...r, delegates_total: +r.delegates_total, delegates_present: +r.delegates_present, speakers_queued: +r.speakers_queued, speeches_given: +r.speeches_given, motions_total: +r.motions_total, motions_passed: +r.motions_passed, points_total: +r.points_total, votes_total: +r.votes_total, votes_open: +r.votes_open })));
    setUpdated(new Date());
  });

  const grouped = useMemo(() => {
    const keys = [...catalog.categories.map((c) => c.key), ''];
    return keys.map((k) => ({ key: k, cat: categoryOf(catalog, k), items: rows.filter((r) => (categoryOf(catalog, r.category)?.key || '') === k) })).filter((g) => g.items.length);
  }, [rows, catalog]);
  const sum = (k: keyof CommitteeAnalytics) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const inSession = rows.filter((r) => r.status === 'in_session').length;

  const cards = [
    { label: 'Committees in session', value: `${inSession} / ${rows.length}` },
    { label: 'Delegates present', value: `${sum('delegates_present')} / ${sum('delegates_total')}` },
    { label: 'Speeches given', value: String(sum('speeches_given')) },
    { label: 'Motions (passed)', value: `${sum('motions_total')} (${sum('motions_passed')})` },
    { label: 'Points raised', value: String(sum('points_total')) },
    { label: 'Votes held / open', value: `${sum('votes_total')} / ${sum('votes_open')}` },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{c.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>

      {rows.length === 0 ? <Empty>No committees yet.</Empty> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Committee</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Attendance</th>
                <th className="px-3 py-3 text-right">Queue</th>
                <th className="px-3 py-3 text-right">Speeches</th>
                <th className="px-3 py-3 text-right">Motions</th>
                <th className="px-3 py-3 text-right">Points</th>
                <th className="px-3 py-3 text-right">Votes</th>
                <th className="px-3 py-3 text-right">Elapsed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {grouped.map((g) => (
                <Fragment key={g.key || 'none'}>
                  <tr className="bg-slate-50">
                    <td colSpan={9} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: g.cat?.color || '#94a3b8' }} />
                      {g.cat?.name || 'Uncategorized'} <span className="font-medium normal-case text-slate-400">· {g.items.filter((r) => r.status === 'in_session').length} of {g.items.length} in session</span>
                    </td>
                  </tr>
                  {g.items.map((r) => {
                const pct = r.delegates_total ? Math.round((r.delegates_present / r.delegates_total) * 100) : 0;
                const secret = typeOf(catalog, r.type).secret_topic;
                const topic = secret ? (secrets[r.committee_id] ? `🔒 ${secrets[r.committee_id]}` : '🔒 Confidential') : r.topic;
                return (
                  <tr key={r.committee_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/committee/${r.committee_id}/run`} className="font-semibold hover:text-brand">{r.name}</Link>
                      {typeOf(catalog, r.type).key !== 'standard' && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{typeOf(catalog, r.type).name}</span>}
                      <TopicCell text={topic} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={r.status} />
                      {r.status === 'in_session' && <div className="mt-1 text-xs text-slate-500">{MODE_LABEL[r.mode]}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand" style={{ width: `${pct}%` }} /></div>
                        <span className="tabular-nums text-xs text-slate-600">{r.delegates_present}/{r.delegates_total}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.speakers_queued}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.speeches_given}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.motions_total} <span className="text-slate-400">({r.motions_passed})</span></td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.points_total}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.votes_total}{r.votes_open > 0 && <span className="ml-1 badge bg-amber-100 text-amber-800">open</span>}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-500">{elapsed(r, sessions)}</td>
                  </tr>
                );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400">Live: updates instantly as chairs work. {updated && `Last refresh ${updated.toLocaleTimeString()}`}</p>
    </div>
  );
}
