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
import { Participation } from '@/components/chair/Participation';
import { GradingLog } from '@/components/chair/GradingLog';
import { MODE_LABEL } from '@/lib/config';
import { LangProvider, useT } from '@/lib/i18n';
import { useClockSync, useCommittee, useCommitteeState, useRows } from '@/lib/hooks';
import { closeSession, openSession } from '@/lib/session';
import { Delegate, EventRow, SessionRow } from '@/lib/types';

function Console({ id }: { id: string }) {
  const { canRun } = useAuth();
  const t = useT();
  const { committee, missing } = useCommittee(id);
  const { state, update, refresh } = useCommitteeState(id);
  const { rows: sessions } = useRows<SessionRow>('sessions', id, 'number');
  const { rows: delegates } = useRows<Delegate>('delegates', id, 'country');
  const { rows: events } = useRows<EventRow>('events', id, 'created_at', false);
  const [tab, setTab] = useLocalState<string>(`mp-tab-${id}`, 'roll');
  useClockSync();

  if (missing) return <div className="mx-auto mt-16 max-w-md card text-center">{t('Committee not found.')}</div>;
  if (!committee || !state) return <Spinner label={t('Loading committee…')} />;
  if (!canRun(id)) {
    return (
      <div className="mx-auto mt-16 max-w-md card text-center">
        <h2 className="text-lg font-bold">{t('Not your committee')}</h2>
        <p className="mt-2 text-sm text-slate-600">{t('You are not assigned as a chair of {name}.', { name: committee.name })}</p>
        <Link href="/dashboard" className="btn btn-primary mt-4">{t('Back to dashboard')}</Link>
      </div>
    );
  }

  const present = delegates.filter((d) => d.attendance !== 'absent').length;
  const pendingMotions = events.filter((e) => e.kind === 'motion' && e.status === 'pending').length;

  const currentSession = sessions.find((s) => s.id === state.current_session_id) || null;
  const nextSessionNumber = (sessions.reduce((m, s) => Math.max(m, s.number), 0) || 0) + 1;

  // Starting a session numbers it and saves the roll call; suspending/adjourning closes it.
  async function setStatus(status: typeof state.status) {
    if (status === 'in_session') await openSession(id);
    else if (status === 'suspended' || status === 'adjourned') await closeSession(id, status);
    refresh();
  }

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <div className="card flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-wider text-brand">{committee.abbreviation}</div>
          <h1 className="truncate text-xl font-bold">{committee.name}</h1>
          <p className="scroll-x text-sm text-slate-500">{committee.topic}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <StatusBadge status={state.status} />
            {currentSession && <span className="badge bg-brand/10 text-brand">{t('Session {n}', { n: currentSession.number })}</span>}
            {state.status === 'in_session' && <span className="badge bg-slate-100 text-slate-700">{t(MODE_LABEL[state.mode])}</span>}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {state.status !== 'in_session' && state.status !== 'adjourned' && (
              <button className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setStatus('in_session')}>
                {state.status === 'suspended' ? t('Resume session') : t('Call to order')}
              </button>
            )}
            {state.status === 'in_session' && <button className="btn btn-sm bg-amber-500 text-black hover:bg-amber-400" onClick={() => setStatus('suspended')}>{t('Suspend')}</button>}
            {state.status === 'adjourned' && <button className="btn btn-secondary btn-sm" onClick={() => setStatus('in_session')}>{t('Reopen')}</button>}
            {state.status !== 'adjourned' && (
              <button className="btn btn-secondary btn-sm" onClick={() => window.confirm(t('Adjourn this committee?')) && setStatus('adjourned')}>{t('Adjourn')}</button>
            )}
            <Link href={`/committee/${id}/display`} target="_blank" className="btn btn-primary btn-sm">{t('Open projection screen')} ↗</Link>
          </div>
        </div>
      </div>

      {state.status === 'in_session' && !currentSession && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="flex-1">{t('This committee is in session but has no session record yet, so roll call history and grading are not being saved.')}</span>
          <button className="btn btn-sm bg-amber-500 text-black hover:bg-amber-400" onClick={async () => { await openSession(id); refresh(); }}>{t('Start Session {n} now', { n: nextSessionNumber })}</button>
        </div>
      )}

      <AnnouncementBanner max={2} />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'roll', label: `${t('Roll call')} (${present}/${delegates.length})` },
          { id: 'floor', label: t('Speakers & timer') },
          { id: 'caucus', label: t('Caucus') },
          { id: 'motions', label: t('Points & motions'), count: pendingMotions },
          { id: 'voting', label: t('Voting') },
          { id: 'participation', label: t('Participation') },
          { id: 'log', label: t('Grading log') },
          { id: 'docs', label: t('Documents') },
        ]}
      />

      <div className="pt-1">
        {tab === 'roll' && <RollCall committeeId={id} state={state} />}
        {tab === 'floor' && <Speakers committeeId={id} state={state} update={update} />}
        {tab === 'caucus' && <Caucus committeeId={id} state={state} update={update} />}
        {tab === 'motions' && <Motions committeeId={id} state={state} update={update} refresh={refresh} />}
        {tab === 'voting' && <Voting committeeId={id} state={state} update={update} />}
        {tab === 'participation' && <Participation committeeId={id} state={state} />}
        {tab === 'log' && <GradingLog committeeId={id} committeeName={committee.name} />}
        {tab === 'docs' && <Documents committeeId={id} />}
      </div>
    </main>
  );
}

export default function RunPage() {
  const params = useParams<{ id: string }>();
  const { committee } = useCommittee(params.id);
  // Spanish committees translate the whole screen, header included.
  return (
    <LangProvider lang={committee?.language}>
      <AppHeader />
      <RequireAuth>
        <Console id={params.id} />
      </RequireAuth>
    </LangProvider>
  );
}
