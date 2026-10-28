'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { BrandMark, useSettings } from '@/components/BrandProvider';
import { LiveTimer } from '@/components/LiveTimer';
import { useActiveAnnouncements } from '@/components/AnnouncementBanner';
import { APP_CONFIG, MODE_LABEL, MOTION_TYPES, SESSION_STATUS_LABEL, codeFor, labelFor } from '@/lib/config';
import { useClockSync, useCommittee, useCommitteeState, useRows, useTick } from '@/lib/hooks';
import { THRESHOLD_LABEL, tally, voteOutcome } from '@/lib/session';
import { Delegate, EventRow, SessionRow, SpeakerEntry, VoteRecord, VoteRow } from '@/lib/types';
import { useT } from '@/lib/i18n';
import { CommitteeProvider, useCommitteeType } from '@/lib/committeeContext';
import { GroupBadge } from '@/components/Flag';
import { Flag } from '@/components/Flag';

// Read-only, clutter-free projection screen for delegates. No controls, no login.
// Press "F" for fullscreen.
export default function DisplayPage() {
  const { id } = useParams<{ id: string }>();
  const { committee } = useCommittee(id);
  return (
    <CommitteeProvider committee={committee}>
      <Display id={id} />
    </CommitteeProvider>
  );
}

function Display({ id }: { id: string }) {
  const t = useT();
  const type = useCommitteeType();
  const { settings } = useSettings();
  const { committee, missing } = useCommittee(id);
  const { state } = useCommitteeState(id);
  const { rows: delegates } = useRows<Delegate>('delegates', id, 'country');
  const { rows: entries } = useRows<SpeakerEntry>('speakers_list', id, 'position');
  const { rows: events } = useRows<EventRow>('events', id, 'created_at', false);
  const { rows: votes } = useRows<VoteRow>('votes', id, 'created_at', false);
  const { rows: records } = useRows<VoteRecord>('vote_records', id, 'id');
  const { rows: sessions } = useRows<SessionRow>('sessions', id, 'number');
  const announcements = useActiveAnnouncements();
  useClockSync();
  useTick(1000);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'f') {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen?.().catch(() => {});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const byId = useMemo(() => new Map(delegates.map((d) => [d.id, d])), [delegates]);
  const queue = entries.filter((e) => e.status === 'queued' && e.source === 'gsl');
  const openVote = votes.find((v) => v.status === 'open');
  const lastClosed = votes.find((v) => v.status === 'closed' && v.closed_at && Date.now() - new Date(v.closed_at).getTime() < 60_000);
  const pendingMotions = events.filter((e) => e.kind === 'motion' && e.status === 'pending');
  // Delegates who asked to explain their vote on the latest substantive vote and haven't yet.
  const lastSubstantive = votes.find((v) => v.status === 'closed' && v.kind === 'substantive');
  const explanations = lastSubstantive
    ? records.filter((r) => r.vote_id === lastSubstantive.id && r.explanation === 'requested')
    : [];
  const present = delegates.filter((d) => d.attendance !== 'absent').length;
  const quorum = Math.ceil(delegates.length * APP_CONFIG.quorum.debateFraction);

  if (missing) return <div className="flex min-h-screen items-center justify-center bg-stage text-2xl text-white">{t('Committee not found')}</div>;
  if (!committee || !state) return <div className="flex min-h-screen items-center justify-center bg-stage text-xl text-slate-400">{t('Connecting…')}</div>;

  const speaker = state.current_speaker_id ? byId.get(state.current_speaker_id) : null;
  const sessionNumber = sessions.find((s) => s.id === state.current_session_id)?.number;
  const live = state.status === 'in_session';

  return (
    <div className="flex min-h-screen flex-col bg-stage text-white">
      {/* Header */}
      <header className="flex items-center gap-5 border-b border-stage-line px-8 py-4">
        <BrandMark size={52} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">{settings.conference_name}</div>
          <h1 className="truncate text-3xl font-extrabold">{committee.name}</h1>
          <p className="scroll-x text-lg text-slate-300">{t('Topic')}: {type.secret_topic ? t('Confidential') : committee.topic}</p>
        </div>
        <div className="text-right">
          <div
            className={`inline-block rounded-full px-4 py-1.5 text-sm font-bold uppercase tracking-wider ${
              live ? 'bg-emerald-500 text-black' : state.status === 'suspended' ? 'bg-amber-400 text-black' : 'bg-slate-700 text-slate-200'
            }`}
          >
            {t(SESSION_STATUS_LABEL[state.status])}{live && sessionNumber ? ` · ${t('Session {n}', { n: sessionNumber })}` : ''}
          </div>
          {live && <div className="mt-2 text-sm text-slate-400">{t(MODE_LABEL[state.mode])}</div>}
        </div>
      </header>

      {/* Main */}
      <main className="grid flex-1 gap-6 p-8 lg:grid-cols-3">
        <section className="flex flex-col items-center justify-center rounded-3xl border border-stage-line bg-stage-raised p-8 text-center lg:col-span-2">
          {!live ? (
            <div>
              <div className="text-6xl font-extrabold">{state.status === 'not_started' ? t('Session will begin shortly') : state.status === 'suspended' ? t('Session suspended') : t('Session adjourned')}</div>
              <div className="mt-4 text-2xl text-slate-400">{t('{present} of {total} delegates present', { present, total: delegates.length })}</div>
            </div>
          ) : state.mode === 'voting' && openVote ? (
            <VotePanel vote={openVote} records={records} />
          ) : state.mode === 'unmoderated' ? (
            <div>
              <div className="text-xl font-semibold uppercase tracking-[0.25em] text-accent">{t('Unmoderated caucus')}</div>
              <div className="mt-2 text-3xl text-slate-200">{state.caucus_topic}</div>
              <LiveTimer timer={state.caucus_timer} className="mt-6 block font-mono text-[11rem] font-black leading-none" />
            </div>
          ) : (
            <div className="w-full">
              {state.mode === 'moderated' && (
                <div className="mb-6">
                  <div className="text-lg font-semibold uppercase tracking-[0.25em] text-accent">{t('Moderated caucus')} · {t('{n}s per speaker', { n: state.caucus_speaking_sec || 0 })}</div>
                  <div className="mt-1 text-2xl text-slate-200">{state.caucus_topic}</div>
                  <div className="mt-2 text-slate-400">{t('Caucus time remaining')} <LiveTimer timer={state.caucus_timer} className="font-mono text-3xl font-bold text-white" /></div>
                </div>
              )}
              <div className="text-lg font-semibold uppercase tracking-[0.25em] text-slate-400">{speaker ? t('Now speaking') : t('Floor is open')}</div>
              <div className="mt-2 flex items-center justify-center gap-5 text-7xl font-black leading-tight">
                {speaker && <Flag country={speaker.country} flag={speaker.flag} group={speaker.group_key} className="!text-6xl" />}
                <span>{speaker ? speaker.country : '—'}</span>
                {speaker && <GroupBadge groupKey={speaker.group_key} className="!px-4 !py-1.5 !text-2xl" full />}
              </div>
              <LiveTimer timer={state.speaker_timer} className="mt-6 block font-mono text-[9rem] font-black leading-none" />
            </div>
          )}
          {lastClosed && state.mode !== 'voting' && <ResultBanner vote={lastClosed} />}
        </section>

        <aside className="flex flex-col gap-6">
          {explanations.length > 0 && state.mode !== 'voting' && (
            <div className="rounded-3xl border border-accent/60 bg-accent/10 p-5">
              <div className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-accent">{t('Right of explanation')}</div>
              <ul className="space-y-1.5">
                {explanations.map((r) => (
                  <li key={r.id} className="text-xl">
                    <span className="inline-flex items-center gap-2 font-bold"><Flag country={byId.get(r.delegate_id)?.country || ''} flag={byId.get(r.delegate_id)?.flag} group={byId.get(r.delegate_id)?.group_key} />{byId.get(r.delegate_id)?.country}</span>
                    <span className={r.choice === 'for' ? 'text-emerald-300' : r.choice === 'against' ? 'text-red-300' : 'text-slate-300'}> · {r.choice === 'for' ? t('In favor') : r.choice === 'against' ? t('Against') : t('Abstention')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pendingMotions.length > 0 && (
            <div className="rounded-3xl border border-accent/60 bg-accent/10 p-5">
              <div className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-accent">{t('Motions on the floor')}</div>
              <ul className="space-y-2">
                {pendingMotions.slice(0, 4).map((m) => (
                  <li key={m.id} className="text-lg">
                    <span className="mr-2 rounded bg-accent/20 px-1.5 py-0.5 font-mono text-sm font-bold text-accent">{codeFor(MOTION_TYPES, m.type)}</span>
                    <span className="font-bold">{t(labelFor(MOTION_TYPES, m.type))}</span>
                    {m.delegate_id && <span className="text-slate-300"> · {byId.get(m.delegate_id)?.country}</span>}
                    {(m.duration_sec || m.speaking_sec) && (
                      <span className="text-slate-400">
                        {' '}({m.duration_sec ? t('{n} min', { n: m.duration_sec / 60 }) : ''}{m.duration_sec && m.speaking_sec ? ' / ' : ''}{m.speaking_sec ? `${m.speaking_sec}s` : ''})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex-1 rounded-3xl border border-stage-line bg-stage-raised p-5">
            <div className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-slate-400">{t('Speakers’ list')}</div>
            {queue.length === 0 ? (
              <div className="text-lg text-slate-500">{t('No speakers on the list')}</div>
            ) : (
              <ol className="space-y-2">
                {queue.slice(0, 8).map((e, i) => (
                  <li key={e.id} className="flex items-center gap-3 text-2xl">
                    <span className="w-8 text-right font-mono text-slate-500">{i + 1}</span>
                    <span className={`inline-flex items-center gap-3 ${i === 0 ? 'font-bold text-white' : 'text-slate-200'}`}><Flag country={byId.get(e.delegate_id)?.country || ''} flag={byId.get(e.delegate_id)?.flag} group={byId.get(e.delegate_id)?.group_key} className="!text-xl" />{byId.get(e.delegate_id)?.country}<GroupBadge groupKey={byId.get(e.delegate_id)?.group_key} /></span>
                  </li>
                ))}
                {queue.length > 8 && <li className="pl-11 text-slate-500">{t('+ {n} more', { n: queue.length - 8 })}</li>}
              </ol>
            )}
          </div>
        </aside>
      </main>

      {/* Footer */}
      <footer className="flex items-center gap-6 overflow-hidden border-t border-stage-line px-8 py-3 text-sm text-slate-300">
        <div className="shrink-0">
          {t('Present')} <b className="text-white">{present}</b>/{delegates.length}
          <span className={`ml-3 ${present >= quorum && delegates.length > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {t('Quorum')} {present >= quorum && delegates.length > 0 ? t('met') : t('not met')}
          </span>
        </div>
        <div className="relative min-w-0 flex-1 overflow-hidden whitespace-nowrap">
          {announcements.length > 0 && (
            <div className="inline-block animate-ticker">
              {announcements.map((a) => (
                <span key={a.id} className={`mr-16 ${a.severity === 'urgent' ? 'font-bold text-red-300' : ''}`}>
                  {a.severity === 'urgent' ? '⚠ ' : '📢 '}{a.message}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 text-slate-500">{t('Press F for fullscreen')}</div>
      </footer>
    </div>
  );
}

function VotePanel({ vote, records }: { vote: VoteRow; records: VoteRecord[] }) {
  const tr = useT();
  const t = tally(records.filter((r) => r.vote_id === vote.id));
  return (
    <div className="w-full">
      <div className="text-lg font-semibold uppercase tracking-[0.25em] text-accent">{tr('Voting procedure')} · {tr(vote.kind)}{vote.label ? ` · ${vote.label}` : ''}</div>
      <div className="mt-2 text-5xl font-black leading-tight">{vote.title}</div>
      <div className="mt-1 text-xl text-slate-400">{tr('{what} required', { what: tr(THRESHOLD_LABEL[vote.threshold]) })}</div>
      <div className={`mt-10 grid gap-6 ${vote.kind === 'substantive' ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <Big label={tr('In favor')} n={t.for} tone="text-emerald-400" />
        <Big label={tr('Against')} n={t.against} tone="text-red-400" />
        {vote.kind === 'substantive' && <Big label={tr('Abstention')} n={t.abstain} tone="text-slate-300" />}
      </div>
    </div>
  );
}

function Big({ label, n, tone }: { label: string; n: number; tone: string }) {
  return (
    <div className="rounded-2xl bg-black/25 py-6">
      <div className={`font-mono text-[8rem] font-black leading-none tabular-nums ${tone}`}>{n}</div>
      <div className="mt-2 text-xl font-semibold uppercase tracking-widest text-slate-400">{label}</div>
    </div>
  );
}

function ResultBanner({ vote }: { vote: VoteRow }) {
  const tr = useT();
  const passed = vote.result === 'passed' || (vote.result == null && voteOutcome({ for: vote.final_for || 0, against: vote.final_against || 0 }, vote.threshold) === 'passed');
  return (
    <div className={`mt-8 rounded-2xl px-8 py-4 text-2xl font-bold ${passed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
      {vote.label ? `${vote.label} · ` : ''}{vote.title}: {passed ? tr('PASSED') : tr('FAILED')} ({tr('{n} in favor', { n: vote.final_for ?? 0 })}, {tr('{n} against', { n: vote.final_against ?? 0 })}{vote.kind === 'substantive' ? `, ${tr(vote.final_abstain === 1 ? '{n} abstention' : '{n} abstentions', { n: vote.final_abstain ?? 0 })}` : ''})
    </div>
  );
}
