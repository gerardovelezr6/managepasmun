'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRubric, useRows } from '@/lib/hooks';
import { matchesCountry } from '@/lib/countries';
import { rubricText, useLang, useT } from '@/lib/i18n';
import { GRADING_CATEGORIES, GradingCategory } from '@/lib/config';
import { computeStandings, fmtPts } from '@/lib/grading';
import { openSession } from '@/lib/session';
import { toastError } from '@/lib/toast';
import {
  CommitteeState,
  Delegate,
  ParticipationEntry,
  ParticipationNote,
  RubricLevel,
  SessionAttendance,
  SessionRow,
  VoteRecord,
  WarningRow,
} from '@/lib/types';
import { useAuth } from '../AuthProvider';
import { Flag, GroupBadge } from '../Flag';
import { Empty } from '../ui';

const CATEGORY_SHORT: Record<string, string> = Object.fromEntries(GRADING_CATEGORIES.map((c) => [c.value, c.short]));

export function Participation({ committeeId, state }: { committeeId: string; state: CommitteeState }) {
  const { session: authSession } = useAuth();
  const t = useT();
  const lang = useLang();
  const { rows: delegates } = useRows<Delegate>('delegates', committeeId, 'country');
  const { rows: sessions } = useRows<SessionRow>('sessions', committeeId, 'number');
  const { rows: attendance } = useRows<SessionAttendance>('session_attendance', committeeId, 'id');
  const { rows: entries } = useRows<ParticipationEntry>('participation_entries', committeeId, 'created_at');
  const { rows: notes } = useRows<ParticipationNote>('participation_notes', committeeId, 'updated_at');
  const { rows: warnings } = useRows<WarningRow>('warnings', committeeId, 'created_at');
  const { rows: records } = useRows<VoteRecord>('vote_records', committeeId, 'id');
  const { levels, explanationPoints } = useRubric();

  const [picked, setPicked] = useState<string | null>(null);
  const [category, setCategory] = useState<GradingCategory>('sl_speech');
  const [hideAbsent, setHideAbsent] = useState(true);
  const [showRubric, setShowRubric] = useState(false);
  const [openNotes, setOpenNotes] = useState<string | null>(null);
  const [q, setQ] = useState('');

  // Follow the floor: caucus modes switch the grading category automatically.
  useEffect(() => {
    if (state.mode === 'moderated') setCategory('mc');
    else if (state.mode === 'unmoderated') setCategory('umc');
    else if (state.mode === 'formal') setCategory((c) => (c === 'mc' || c === 'umc' ? 'sl_speech' : c));
  }, [state.mode]);

  const sessionId = picked ?? state.current_session_id ?? sessions[sessions.length - 1]?.id ?? null;
  const session = sessions.find((s) => s.id === sessionId) || null;
  const isCurrent = !!session && session.id === state.current_session_id;

  const standings = useMemo(() => computeStandings(delegates, sessions, entries, records, explanationPoints), [delegates, sessions, entries, records, explanationPoints]);
  const standingBy = useMemo(() => new Map(standings.map((s) => [s.delegate.id, s])), [standings]);
  const rank = useMemo(() => new Map(standings.map((s, i) => [s.delegate.id, i + 1])), [standings]);
  const attendBy = useMemo(() => {
    const m = new Map<string, SessionAttendance>();
    for (const a of attendance) if (a.session_id === sessionId) m.set(a.delegate_id, a);
    return m;
  }, [attendance, sessionId]);

  const catLevels = useMemo(() => levels.filter((l) => l.category === category).sort((a, b) => a.sort - b.sort), [levels, category]);
  const catInfo = GRADING_CATEGORIES.find((c) => c.value === category)!;

  const rows = delegates.filter((d) => {
    if (!matchesCountry(d.country, q, d.flag)) return false;
    if (!hideAbsent) return true;
    const a = attendBy.get(d.id);
    return a ? a.attendance !== 'absent' : d.attendance !== 'absent' && isCurrent;
  });

  async function add(d: Delegate, level: RubricLevel) {
    if (!sessionId) return toastError(t('Open a session first.'));
    const { error } = await supabase().from('participation_entries').insert({
      committee_id: committeeId,
      session_id: sessionId,
      delegate_id: d.id,
      category,
      level_key: level.level_key,
      score: level.score,
      label: level.label, // stored in English; Spanish committees show the translated wording from the rubric
      created_by: authSession?.user.id,
    });
    if (error) toastError(error);
  }
  async function removeEntry(id: string) {
    const { error } = await supabase().from('participation_entries').delete().eq('id', id);
    if (error) toastError(error);
  }
  async function undoLast(d: Delegate) {
    const mine = entries.filter((e) => e.session_id === sessionId && e.delegate_id === d.id);
    const last = mine[mine.length - 1];
    if (last) await removeEntry(last.id);
  }
  async function saveNote(d: Delegate, note: string) {
    if (!sessionId) return;
    const prev = notes.find((n) => n.session_id === sessionId && n.delegate_id === d.id)?.note || '';
    if (prev === note) return;
    const { error } = await supabase()
      .from('participation_notes')
      .upsert({ committee_id: committeeId, session_id: sessionId, delegate_id: d.id, note, updated_at: new Date().toISOString() }, { onConflict: 'session_id,delegate_id' });
    if (error) toastError(error);
  }
  async function addWarning(d: Delegate, kind: WarningRow['kind']) {
    const reason = window.prompt(t(kind === 'warning' ? 'Warning for {country}. Reason:' : 'Call of attention for {country}. Reason:', { country: d.country }));
    if (reason === null) return;
    const { error } = await supabase().from('warnings').insert({ committee_id: committeeId, delegate_id: d.id, session_id: sessionId, kind, reason: reason.trim() });
    if (error) toastError(error);
  }
  async function removeWarning(id: string) {
    const { error } = await supabase().from('warnings').delete().eq('id', id);
    if (error) toastError(error);
  }
  async function renumber(n: number) {
    if (!session || !Number.isFinite(n) || n < 1 || n === session.number) return;
    const { error } = await supabase().from('sessions').update({ number: n }).eq('id', session.id);
    if (error) toastError(error);
  }

  if (sessions.length === 0) {
    return (
      <div className="mx-auto max-w-xl card text-center">
        <h3 className="font-bold">{t('No session yet')}</h3>
        <p className="mt-2 text-sm text-slate-600">{t('Participation is graded per session. Take roll call, then call the committee to order to start Session 1.')}</p>
        {state.status === 'in_session' && (
          <button className="btn btn-primary mt-4" onClick={() => openSession(committeeId)}>{t('Start Session 1 now')}</button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="label !mb-0">{t('Session')}</span>
            <select className="input w-auto" value={sessionId || ''} onChange={(e) => setPicked(e.target.value === state.current_session_id ? null : e.target.value)}>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {t('Session {n}', { n: s.number })}{s.id === state.current_session_id ? ` ${t('(open)')}` : ''}
                </option>
              ))}
            </select>
          </label>
          {session && (
            <label className="flex items-center gap-1.5 text-xs text-slate-500" title={t('Correct the session number if needed')}>
              {t('number')}
              <input
                key={session.id + session.number}
                type="number"
                min={1}
                defaultValue={session.number}
                className="input w-16 py-1"
                onBlur={(e) => renumber(Number(e.target.value))}
              />
            </label>
          )}
          {!isCurrent && <span className="badge bg-slate-100 text-slate-600">{t('Editing a past session')}</span>}
          <input
            type="search"
            className="input ml-auto w-44 py-1.5"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('Search country…')}
            aria-label={t('Search country')}
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={hideAbsent} onChange={(e) => setHideAbsent(e.target.checked)} /> {t('Hide absent')}
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {GRADING_CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${category === c.value ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              title={t(c.hint)}
            >
              {t(c.label)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            {t('Grading')} <b>{t(catInfo.label)}</b>: {t(catInfo.hint)}. {t('Tap a score to add it. Hover a score for its rubric description.')}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowRubric((v) => !v)}>{showRubric ? t('Hide rubric') : t('Show rubric')}</button>
        </div>
        {showRubric && (
          <ul className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
            {catLevels.map((l) => (
              <li key={l.id}>
                <span className="mr-2 inline-block min-w-[2.2rem] rounded bg-brand px-1.5 py-0.5 text-center text-xs font-bold text-white">{l.level_key}</span>
                <b>{rubricText(lang, l).label}.</b> <span className="text-slate-600">{rubricText(lang, l).description}</span>
              </li>
            ))}
            {catLevels.length === 0 && <li className="text-slate-500">{t('No levels defined for this category. High Command can add them under Grading rubric.')}</li>}
          </ul>
        )}
      </div>

      {/* Delegates */}
      {rows.length === 0 ? (
        <Empty>{q ? t('No country matches your search.') : t('No delegates to show. Mark delegates present on the Roll call tab, or untick “Hide absent”.')}</Empty>
      ) : (
        <ul className="space-y-2">
          {rows.map((d) => {
            const st = standingBy.get(d.id);
            const mine = entries.filter((e) => e.session_id === sessionId && e.delegate_id === d.id);
            const subtotal = mine.reduce((a, e) => a + Number(e.score), 0);
            const myWarnings = warnings.filter((w) => w.delegate_id === d.id && w.kind !== 'call_of_attention');
            const myCalls = warnings.filter((w) => w.delegate_id === d.id && w.kind === 'call_of_attention');
            const note = notes.find((n) => n.session_id === sessionId && n.delegate_id === d.id)?.note || '';
            const a = attendBy.get(d.id);
            const absent = a ? a.attendance === 'absent' : d.attendance === 'absent';
            return (
              <li key={d.id} className={`card p-4 ${absent ? 'opacity-60' : ''}`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-[10rem] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Flag country={d.country} flag={d.flag} group={d.group_key} />
                      <span className="font-bold">{d.country}</span>
                      <GroupBadge groupKey={d.group_key} />
                      {a?.late && <span className="badge bg-amber-100 text-amber-800">{t('Late')}</span>}
                      {absent && <span className="badge bg-slate-200 text-slate-600">{t('Absent')}</span>}
                      {myWarnings.length > 0 && <span title={t('Warnings')} className={`badge ${myWarnings.length >= 3 ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700'}`}>⚠ {myWarnings.length}</span>}
                      {myCalls.length > 0 && <span title={t('Calls of attention')} className="badge bg-amber-100 text-amber-800">{t('Call')} {myCalls.length}</span>}
                    </div>
                    <div className="text-xs text-slate-500">{d.name || t('Delegate name placeholder')}</div>
                  </div>
                  <div className="text-center leading-tight">
                    <div className="text-2xl font-extrabold tabular-nums">{fmtPts(subtotal)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">{t('this session')}</div>
                  </div>
                  <div className="text-center leading-tight">
                    <div className="text-lg font-bold tabular-nums text-slate-600">{fmtPts(st?.total || 0)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">{t('total')} · #{rank.get(d.id)}</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {catLevels.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => add(d, l)}
                      title={`${rubricText(lang, l).label}. ${rubricText(lang, l).description}`}
                      className="min-w-[2.6rem] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-800 transition hover:border-brand hover:bg-brand hover:text-white active:scale-95"
                    >
                      {l.level_key}
                    </button>
                  ))}
                  <button className="btn btn-ghost btn-sm ml-1" onClick={() => undoLast(d)} disabled={mine.length === 0}>{t('Undo last')}</button>
                  <button className="btn btn-ghost btn-sm ml-auto" onClick={() => addWarning(d, 'warning')}>⚠ {t('Warning')}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => addWarning(d, 'call_of_attention')}>{t('Call of attention')}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setOpenNotes(openNotes === d.id ? null : d.id)}>
                    {note ? `${t('Notes')} ●` : t('Notes')}
                  </button>
                </div>

                {(mine.length > 0 || myWarnings.length > 0 || myCalls.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {mine.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => removeEntry(e.id)}
                        title={`${(() => { const lv = levels.find((x) => x.category === e.category && x.level_key === e.level_key); return lv ? rubricText(lang, lv).label : e.label || ''; })()} (${t('click to remove')})`}
                        className="group rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-red-100 hover:text-red-700"
                      >
                        {CATEGORY_SHORT[e.category]} {e.level_key} <span className="hidden group-hover:inline">×</span>
                      </button>
                    ))}
                    {myWarnings.map((w) => (
                      <button key={w.id} onClick={() => removeWarning(w.id)} title={t('Click to remove')} className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100">
                        ⚠ {w.reason || t('warning')}
                      </button>
                    ))}
                    {myCalls.map((w) => (
                      <button key={w.id} onClick={() => removeWarning(w.id)} title={t('Click to remove')} className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100">
                        {t('Call')}: {w.reason || t('call of attention')}
                      </button>
                    ))}
                  </div>
                )}

                {openNotes === d.id && (
                  <textarea
                    key={`${sessionId}-${d.id}`}
                    className="input mt-3 h-24"
                    defaultValue={note}
                    placeholder={t('Notes for this session (observations, proposals made, behavior...)')}
                    onBlur={(e) => saveNote(d, e.target.value)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
