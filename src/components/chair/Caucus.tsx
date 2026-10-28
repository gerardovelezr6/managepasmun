'use client';
import { useState } from 'react';
import { useRows } from '@/lib/hooks';
import { APP_CONFIG } from '@/lib/config';
import { nowMs } from '@/lib/clock';
import { emptyTimer, startTimer } from '@/lib/timer';
import { endSpeech, recognizeSpeaker } from '@/lib/session';
import { CommitteeState, Delegate, TimerState } from '@/lib/types';
import { useT } from '@/lib/i18n';
import { Flag } from '../Flag';
import { Field } from '../ui';
import { TimerPanel } from '../LiveTimer';

export function Caucus({ committeeId, state, update }: { committeeId: string; state: CommitteeState; update: (p: Partial<CommitteeState>) => Promise<boolean> }) {
  const t = useT();
  const { rows: delegates } = useRows<Delegate>('delegates', committeeId, 'country');
  const [topic, setTopic] = useState('');
  const [totalMin, setTotalMin] = useState(10);
  const [speakSec, setSpeakSec] = useState(60);
  const [pick, setPick] = useState('');

  const present = delegates.filter((d) => d.attendance !== 'absent');
  const active = state.mode === 'moderated' || state.mode === 'unmoderated';
  const speaker = delegates.find((d) => d.id === state.current_speaker_id);

  async function begin(kind: 'moderated' | 'unmoderated') {
    const caucus = startTimer(emptyTimer(totalMin * 60_000), nowMs());
    await update(
      kind === 'moderated'
        ? { mode: 'moderated', caucus_topic: topic || t('Moderated caucus'), caucus_speaking_sec: speakSec, caucus_timer: caucus, speaker_timer: emptyTimer(speakSec * 1000), current_speaker_id: null }
        : { mode: 'unmoderated', caucus_topic: topic || t('Unmoderated caucus'), caucus_timer: caucus, current_speaker_id: null }
    );
  }
  async function endCaucus() {
    if (state.current_speaker_id) await endSpeech(committeeId, state, update);
    await update({ mode: 'formal', caucus_topic: null, caucus_speaking_sec: null, caucus_timer: emptyTimer(0) });
  }
  async function recognize() {
    if (!pick) return;
    await recognizeSpeaker(committeeId, pick, state.caucus_speaking_sec || speakSec, state, update);
    setPick('');
  }

  if (!active) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="card space-y-4">
          <h3 className="font-bold">{t('Start a caucus')}</h3>
          <p className="text-sm text-slate-500">
            {t('Start a caucus directly here, or pass a caucus motion under Points & Motions. A passed motion lands here ready, with the timer waiting for you to press Start.')}
          </p>
          <Field label={t('Topic / purpose')}>
            <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t('[Placeholder caucus topic]')} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('Total time (minutes)')}>
              <input type="number" min={1} className="input" value={totalMin} onChange={(e) => setTotalMin(Math.max(1, Number(e.target.value) || 1))} />
              <div className="mt-2 flex flex-wrap gap-1">
                {APP_CONFIG.caucusPresetsMin.map((m) => (
                  <button key={m} type="button" className="rounded bg-slate-100 px-2 py-0.5 text-xs hover:bg-slate-200" onClick={() => setTotalMin(m)}>{m}m</button>
                ))}
              </div>
            </Field>
            <Field label={t('Speaking time (sec, moderated)')}>
              <input type="number" min={5} className="input" value={speakSec} onChange={(e) => setSpeakSec(Math.max(5, Number(e.target.value) || 5))} />
            </Field>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" onClick={() => begin('moderated')}>{t('Start moderated caucus')}</button>
            <button className="btn btn-secondary flex-1" onClick={() => begin('unmoderated')}>{t('Start unmoderated caucus')}</button>
          </div>
        </div>
      </div>
    );
  }

  const moderated = state.mode === 'moderated';
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{moderated ? t('Moderated caucus') : t('Unmoderated caucus')}</div>
          <div className="mt-1 text-lg font-bold">{state.caucus_topic}</div>
          {moderated && <div className="text-sm text-slate-500">{t('{n}s per speaker', { n: state.caucus_speaking_sec || 0 })}</div>}
        </div>
        <TimerPanel label={t('Caucus total time')} timer={state.caucus_timer} onChange={(tm: TimerState) => update({ caucus_timer: tm })} presetsSec={[60, 180, 300, 600, 900]} />
        <button className="btn btn-danger w-full" onClick={endCaucus}>{t('End caucus & return to formal debate')}</button>
      </div>

      {moderated ? (
        <div className="space-y-4">
          <div className="card">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('Recognise a speaker')}</div>
            <div className="mt-2 flex gap-2">
              <select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">{t('Choose delegate…')}</option>
                {present.map((d) => <option key={d.id} value={d.id}>{d.country}</option>)}
              </select>
              <button className="btn btn-primary" onClick={recognize} disabled={!pick}>{t('Start')}</button>
            </div>
            <div className="mt-3 text-sm">
              {t('Now speaking')}: <b className="inline-flex items-center gap-1.5">{speaker && <Flag country={speaker.country} flag={speaker.flag} group={speaker.group_key} />}{speaker ? speaker.country : '—'}</b>
              {speaker && <button className="btn btn-ghost btn-sm ml-2" onClick={() => endSpeech(committeeId, state, update)}>{t('End speech')}</button>}
            </div>
          </div>
          <TimerPanel label={t('Speaker timer')} timer={state.speaker_timer} onChange={(tm: TimerState) => update({ speaker_timer: tm })} big={false} />
        </div>
      ) : (
        <div className="card self-start text-sm text-slate-600">{t('Delegates are in informal discussion. The projection screen shows the countdown only.')}</div>
      )}
    </div>
  );
}
