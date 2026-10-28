'use client';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/hooks';
import { APP_CONFIG } from '@/lib/config';
import { toast, toastError } from '@/lib/toast';
import { Absence, Attendance, CommitteeState, Delegate, SessionAttendance, SessionRow } from '@/lib/types';
import { LOCALE, useLang, useT } from '@/lib/i18n';
import { flagOptions, resolveFlag } from '@/lib/countries';
import { useCommitteeType } from '@/lib/committeeContext';
import { matchGroup, nameIn } from '@/lib/catalog';
import { Flag, GroupBadge } from '../Flag';
import { Empty, Seg, Spinner } from '../ui';


export function RollCall({ committeeId, state }: { committeeId: string; state: CommitteeState }) {
  const t = useT();
  const lang = useLang();
  const type = useCommitteeType();
  const mainLabel = (lang === 'es' && type.label_field_es) || type.label_field;
  const groupLabel = (lang === 'es' && type.group_label_es) || type.group_label || '';
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString(LOCALE[lang], { hour: 'numeric', minute: '2-digit' });
  const { rows: delegates, loading } = useRows<Delegate>('delegates', committeeId, 'country');
  const { rows: sessions } = useRows<SessionRow>('sessions', committeeId, 'number');
  const { rows: attendance } = useRows<SessionAttendance>('session_attendance', committeeId, 'id');
  const { rows: absences } = useRows<Absence>('delegate_absences', committeeId, 'left_at');
  const [bulk, setBulk] = useState('');
  const [showManage, setShowManage] = useState(false);

  const session = sessions.find((s) => s.id === state.current_session_id) || null;
  const nextNumber = (sessions.reduce((m, s) => Math.max(m, s.number), 0) || 0) + 1;
  const lateBy = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const a of attendance) if (session && a.session_id === session.id) m.set(a.delegate_id, a.late);
    return m;
  }, [attendance, session]);
  const outBy = useMemo(() => {
    const m = new Map<string, Absence>();
    for (const a of absences) if (!a.returned_at) m.set(a.delegate_id, a);
    return m;
  }, [absences]);
  const stepOuts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of absences) if (session && a.session_id === session.id) m.set(a.delegate_id, (m.get(a.delegate_id) || 0) + 1);
    return m;
  }, [absences, session]);

  const total = delegates.length;
  const present = delegates.filter((d) => d.attendance !== 'absent').length;
  const voting = delegates.filter((d) => d.attendance === 'present_and_voting').length;
  const late = delegates.filter((d) => lateBy.get(d.id) && d.attendance !== 'absent').length;
  const debateQuorum = Math.ceil(total * APP_CONFIG.quorum.debateFraction);
  const majority = Math.floor(total * APP_CONFIG.quorum.majorityFraction) + 1;

  async function mark(id: string, attendance: Attendance) {
    const { error } = await supabase().from('delegates').update({ attendance }).eq('id', id);
    if (error) toastError(error);
  }
  async function markAll(attendance: Attendance) {
    const { error } = await supabase().from('delegates').update({ attendance }).eq('committee_id', committeeId);
    if (error) toastError(error);
  }
  async function toggleLate(d: Delegate) {
    if (!session) return;
    const { error } = await supabase()
      .from('session_attendance')
      .update({ late: !lateBy.get(d.id) })
      .eq('session_id', session.id)
      .eq('delegate_id', d.id);
    if (error) toastError(error);
  }
  async function stepOut(d: Delegate) {
    const { error } = await supabase().from('delegate_absences').insert({ committee_id: committeeId, delegate_id: d.id });
    if (error) toastError(error);
  }
  async function returned(a: Absence) {
    const { error } = await supabase().from('delegate_absences').update({ returned_at: new Date().toISOString() }).eq('id', a.id);
    if (error) toastError(error);
  }
  async function addBulk() {
    // One delegate per line, columns in the order this committee type uses (e.g. "Country, Name" or "Side, Name, Country").
    // Names may contain commas only in the last column; the extra text stays with it.
    const cols = type.bulk;
    const bad: string[] = [];
    const rows = bulk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const parts = l.split(',').map((x) => x.trim());
        const head = parts.slice(0, cols.length - 1);
        const last = parts.slice(cols.length - 1).join(', ');
        const cells = [...head, last];
        const get = (c: string) => cells[cols.indexOf(c as any)] || '';
        const g = cols.includes('group') ? matchGroup(type, get('group')) : null;
        if (cols.includes('group') && type.group_required && !g) bad.push(l);
        return { committee_id: committeeId, country: get('country'), name: get('name'), group_key: g?.key ?? null };
      })
      .filter((r) => r.country || r.name);
    if (bad.length) return toastError(new Error(t('Unknown {group} on: {line}', { group: groupLabel.toLowerCase() || 'group', line: bad[0] })));
    if (!rows.length) return;
    const { error } = await supabase().from('delegates').insert(rows);
    if (error) return toastError(error);
    setBulk('');
    toast(t('Added {n} delegate(s)', { n: rows.length }), 'success');
  }
  async function setGroup(d: Delegate, group_key: string) {
    const { error } = await supabase().from('delegates').update({ group_key: group_key || null }).eq('id', d.id);
    if (error) toastError(error);
  }
  async function remove(d: Delegate) {
    if (!window.confirm(t('Remove {country}?', { country: d.country }))) return;
    const { error } = await supabase().from('delegates').delete().eq('id', d.id);
    if (error) toastError(error);
  }
  async function setFlag(d: Delegate, flag: string) {
    const { error } = await supabase().from('delegates').update({ flag: flag || null }).eq('id', d.id);
    if (error) toastError(error);
  }
  const flags = flagOptions(lang, type.flag);
  const colName = (c: string) => (c === 'country' ? mainLabel : c === 'name' ? t('Delegate name') : groupLabel || t('Group'));
  const bulkExample = type.bulk.map((c) => (c === 'group' ? nameIn(type.groups[0] || { name: 'Group' }, lang) : c === 'country' ? mainLabel : t('Delegate name'))).join(', ');

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        {session ? (
          <>
            <b>{t('Session {n}', { n: session.number })}</b> {t('is open. Delegates who arrive after it opened are flagged')} <span className="font-semibold text-amber-700">{t('late')}</span> {t('automatically.')}
          </>
        ) : (
          <>
            {t('Taking roll call for')} <b>{t('Session {n}', { n: nextNumber })}</b>. {t('Press')} <b>{t('Call to order')}</b> {t('(or pass an Open session motion) to start it and save this roll call.')}
          </>
        )}
        <span className="block text-xs text-slate-500">{t('Roll call is saved per session and resets when a session is suspended or adjourned.')}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label={t('Present')} value={`${present} / ${total}`} />
        <Stat label={t('Present & voting')} value={String(voting)} />
        <Stat label={t('Late')} value={String(late)} />
        <Stat label={`${t('Debate quorum')} (${debateQuorum})`} value={present >= debateQuorum && total > 0 ? t('Met') : t('Not met')} good={present >= debateQuorum && total > 0} />
        <Stat label={`${t('Majority')} (${majority})`} value={present >= majority && total > 0 ? t('Present') : t('Short')} good={present >= majority && total > 0} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-secondary btn-sm" onClick={() => markAll('present')}>{t('Mark all present')}</button>
        <button className="btn btn-secondary btn-sm" onClick={() => markAll('absent')}>{t('Reset to absent')}</button>
        <button className="btn btn-ghost btn-sm ml-auto" onClick={() => setShowManage((v) => !v)}>{showManage ? t('Hide delegate list') : t('Manage delegate list')}</button>
      </div>

      {showManage && (
        <div className="card space-y-2">
          <label className="label">{t('Add delegates (one per line)')}: {type.bulk.map(colName).join(', ')}</label>
          <textarea className="input h-28 font-mono" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={`${bulkExample}\n${bulkExample}`} />
          {type.groups.length > 0 && <p className="text-xs text-slate-500">{groupLabel}: {type.groups.map((g) => nameIn(g, lang)).join(', ')}</p>}
          <button className="btn btn-primary btn-sm" onClick={addBulk} disabled={!bulk.trim()}>{t('Add to roll')}</button>
          <p className="text-xs text-slate-400">{type.flag === 'none' || type.flag === 'group_logo' ? '' : t('Flags are picked automatically from the country name. Change one with the flag menu next to each delegate below.')}</p>
        </div>
      )}

      {total === 0 ? (
        <Empty>{t('No delegates yet. Use “Manage delegate list” to add the roll.')}</Empty>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {delegates.map((d) => {
            const out = outBy.get(d.id);
            const isPresent = d.attendance !== 'absent';
            return (
              <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Flag country={d.country} flag={d.flag} group={d.group_key} />
                    <span className="truncate font-semibold">{d.country}</span>
                    <GroupBadge groupKey={d.group_key} />
                    {isPresent && lateBy.get(d.id) && <span className="badge bg-amber-100 text-amber-800">{t('Late')}</span>}
                    {out && <span className="badge bg-red-100 text-red-700">{t('Out since {time}', { time: hhmm(out.left_at) })}</span>}
                    {!out && (stepOuts.get(d.id) || 0) > 0 && <span className="text-xs text-slate-400">{t('stepped out {n}×', { n: stepOuts.get(d.id) || 0 })}</span>}
                  </div>
                  <div className="truncate text-xs text-slate-500">{d.name || t('Delegate name placeholder')}</div>
                </div>
                {isPresent && session && (
                  <button className={`btn btn-sm ${lateBy.get(d.id) ? 'bg-amber-100 text-amber-800' : 'btn-ghost'}`} onClick={() => toggleLate(d)} title={t('Toggle late flag')}>
                    {t('Late')}
                  </button>
                )}
                {isPresent && (out ? (
                  <button className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => returned(out)}>{t('Returned')}</button>
                ) : (
                  <button className="btn btn-secondary btn-sm" onClick={() => stepOut(d)} title={t('Log that this delegate left the room')}>{t('Step out')}</button>
                ))}
                <Seg<Attendance>
                  value={d.attendance}
                  onChange={(v) => mark(d.id, v)}
                  options={[
                    { value: 'absent', label: t('Absent'), tone: 'bg-slate-700 text-white' },
                    { value: 'present', label: t('Present'), tone: 'bg-emerald-600 text-white' },
                    { value: 'present_and_voting', label: t('P&V'), tone: 'bg-brand text-white' },
                  ]}
                />
                {showManage && (
                  <>
                    {type.groups.length > 0 && (
                      <select className="input w-auto max-w-[9rem] py-1 text-xs" value={d.group_key || ''} onChange={(e) => setGroup(d, e.target.value)} aria-label={groupLabel} title={groupLabel}>
                        <option value="">{groupLabel || t('Group')}: —</option>
                        {type.groups.map((g) => <option key={g.key} value={g.key}>{nameIn(g, lang)}</option>)}
                      </select>
                    )}
                    {type.flag !== 'none' && type.flag !== 'group_logo' && <select
                      className="input w-auto max-w-[9rem] py-1 text-xs"
                      value={d.flag || ''}
                      onChange={(e) => setFlag(d, e.target.value)}
                      aria-label={t('Flag')}
                      title={t('Flag')}
                    >
                      <option value="">{resolveFlag(type.flag, d.country) ? `${t('Automatic')} (${resolveFlag(type.flag, d.country)!.toUpperCase()})` : t('Automatic (none found)')}</option>
                      <option value="none">{t('No flag')}</option>
                      {flags.map((f) => <option key={f.code} value={f.code}>{f.name}</option>)}
                    </select>}
                    <button className="btn btn-ghost btn-sm text-red-600" onClick={() => remove(d)}>{t('Remove')}</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${good === undefined ? '' : good ? 'text-emerald-600' : 'text-amber-600'}`}>{value}</div>
    </div>
  );
}
