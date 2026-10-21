'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useLiveReload } from '@/lib/hooks';
import { MODE_LABEL, SESSION_STATUS_LABEL } from '@/lib/config';
import { Committee, CommitteeState } from '@/lib/types';
import { useAuth } from './AuthProvider';
import { Empty, Spinner, StatusBadge } from './ui';

type Row = Committee & { state: CommitteeState | null };

// Committees organised by name, topic and live session status.
// `onlyMine` limits the list to committees the signed-in chair runs (High Command always sees all).
export function CommitteeGrid({ onlyMine = false }: { onlyMine?: boolean }) {
  const { canRun, isHC, chairOf } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [q, setQ] = useState('');

  useLiveReload(['committees', 'committee_state'], async () => {
    const { data } = await supabase().from('committees').select('*, committee_state(*)').order('name');
    setRows(
      ((data || []) as any[]).map((c) => {
        const s = Array.isArray(c.committee_state) ? c.committee_state[0] : c.committee_state;
        const { committee_state, ...rest } = c;
        return { ...rest, state: s || null } as Row;
      })
    );
  });

  const visible = useMemo(() => {
    let r = rows || [];
    if (onlyMine && !isHC) r = r.filter((c) => chairOf.includes(c.id));
    if (filter !== 'all') r = r.filter((c) => (c.state?.status || 'not_started') === filter);
    const needle = q.trim().toLowerCase();
    if (needle) r = r.filter((c) => `${c.name} ${c.abbreviation} ${c.topic}`.toLowerCase().includes(needle));
    return r;
  }, [rows, onlyMine, isHC, chairOf, filter, q]);

  if (!rows) return <Spinner label="Loading committees…" />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {['all', 'in_session', 'suspended', 'not_started', 'adjourned'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${filter === s ? 'bg-brand text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'}`}
          >
            {s === 'all' ? 'All' : SESSION_STATUS_LABEL[s]}
          </button>
        ))}
        <input className="input ml-auto max-w-xs" placeholder="Search name or topic…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {visible.length === 0 ? (
        <Empty>{onlyMine && !isHC ? 'You have not been assigned to a committee yet. Ask High Command.' : 'No committees match.'}</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((c) => (
            <div key={c.id} className="card flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold uppercase tracking-wider text-brand">{c.abbreviation}</div>
                  <h3 className="break-words text-base font-bold leading-snug">{c.name}</h3>
                </div>
                <StatusBadge status={c.state?.status} />
              </div>
              <p className="mt-2 flex-1 text-sm text-slate-600">{c.topic}</p>
              {c.state?.status === 'in_session' && <p className="mt-2 text-xs font-medium text-emerald-700">{MODE_LABEL[c.state.mode]}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/committee/${c.id}/display`} target="_blank" className="btn btn-secondary btn-sm">Live screen</Link>
                {canRun(c.id) && <Link href={`/committee/${c.id}/run`} className="btn btn-primary btn-sm">Run session</Link>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
