'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { AnnouncementBanner } from '@/components/AnnouncementBanner';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/components/AuthProvider';
import { Spinner, StatusBadge, Tabs, useLocalState } from '@/components/ui';
import { Documents } from '@/components/Documents';
import { RollCall } from '@/components/chair/RollCall';
import { Speakers } from '@/components/chair/Speakers';
import { Caucus } from '@/components/chair/Caucus';
import { Motions } from '@/components/chair/Motions';
import { Voting } from '@/components/chair/Voting';
import { MODE_LABEL } from '@/lib/config';
import { useClockSync, useCommittee, useCommitteeState, useRows } from '@/lib/hooks';
import { Delegate, EventRow } from '@/lib/types';

function Console({ id }: { id: string }) {
  const { canRun } = useAuth();
  const { committee, missing } = useCommittee(id);
  const { state, update } = useCommitteeState(id);
  const { rows: delegates } = useRows<Delegate>('delegates', id, 'country');
  const { rows: events } = useRows<EventRow>('events', id, 'created_at', false);
  const [tab, setTab] = useLocalState<string>(`mp-tab-${id}`, 'roll');
  useClockSync();

  if (missing) return <div className="mx-auto mt-16 max-w-md card text-center">Committee not found.</div>;
  if (!committee || !state) return <Spinner label="Loading committee…" />;
  if (!canRun(id)) {
    return (
      <div className="mx-auto mt-16 max-w-md card text-center">
        <h2 className="text-lg font-bold">Not your committee</h2>
        <p className="mt-2 text-sm text-slate-600">You are not assigned as a chair of {committee.name}.</p>
        <Link href="/dashboard" className="btn btn-primary mt-4">Back to dashboard</Link>
      </div>
    );
  }

  const present = delegates.filter((d) => d.attendance !== 'absent').length;
  const pendingMotions = events.filter((e) => e.kind === 'motion' && e.status === 'pending').length;

  const setStatus = (status: typeof state.status) =>
    update(status === 'in_session' && !state.session_started_at ? { status, session_started_at: new Date().toISOString() } : { status });

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <div className="card flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-wider text-brand">{committee.abbreviation}</div>
          <h1 className="truncate text-xl font-bold">{committee.name}</h1>
          <p className="truncate text-sm text-slate-500">{committee.topic}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <StatusBadge status={state.status} />
            {state.status === 'in_session' && <span className="badge bg-slate-100 text-slate-700">{MODE_LABEL[state.mode]}</span>}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {state.status !== 'in_session' && state.status !== 'adjourned' && (
              <button className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setStatus('in_session')}>
                {state.status === 'suspended' ? 'Resume session' : 'Call to order'}
              </button>
            )}
            {state.status === 'in_session' && <button className="btn btn-sm bg-amber-500 text-black hover:bg-amber-400" onClick={() => setStatus('suspended')}>Suspend</button>}
            {state.status === 'adjourned' && <button className="btn btn-secondary btn-sm" onClick={() => setStatus('in_session')}>Reopen</button>}
            {state.status !== 'adjourned' && (
              <button className="btn btn-secondary btn-sm" onClick={() => window.confirm('Adjourn this committee?') && setStatus('adjourned')}>Adjourn</button>
            )}
            <Link href={`/committee/${id}/display`} target="_blank" className="btn btn-primary btn-sm">Open projection screen ↗</Link>
          </div>
        </div>
      </div>

      <AnnouncementBanner max={2} />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'roll', label: `Roll call (${present}/${delegates.length})` },
          { id: 'floor', label: 'Speakers & timer' },
          { id: 'caucus', label: 'Caucus' },
          { id: 'motions', label: 'Points & motions', count: pendingMotions },
          { id: 'voting', label: 'Voting' },
          { id: 'docs', label: 'Documents' },
        ]}
      />

      <div className="pt-1">
        {tab === 'roll' && <RollCall committeeId={id} />}
        {tab === 'floor' && <Speakers committeeId={id} state={state} update={update} />}
        {tab === 'caucus' && <Caucus committeeId={id} state={state} update={update} />}
        {tab === 'motions' && <Motions committeeId={id} state={state} update={update} />}
        {tab === 'voting' && <Voting committeeId={id} state={state} update={update} />}
        {tab === 'docs' && <Documents committeeId={id} />}
      </div>
    </main>
  );
}

export default function RunPage() {
  const params = useParams<{ id: string }>();
  return (
    <>
      <AppHeader />
      <RequireAuth>
        <Console id={params.id} />
      </RequireAuth>
    </>
  );
}
