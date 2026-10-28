import { supabase } from './supabase';
import { nowMs } from './clock';
import { emptyTimer, resetTimer, startTimer } from './timer';
import { toastError } from './toast';
import { CommitteeState, EventRow, VoteRecord, VoteRow } from './types';

type Updater = (patch: Partial<CommitteeState>) => Promise<boolean>;

export async function endSpeech(committeeId: string, state: CommitteeState, update: Updater) {
  await supabase().from('speakers_list').update({ status: 'spoke' }).eq('committee_id', committeeId).eq('status', 'speaking');
  await update({ current_speaker_id: null, speaker_timer: resetTimer(state.speaker_timer) });
}

// Recognise a delegate from the floor (moderated caucus) and start their speaking timer.
export async function recognizeSpeaker(committeeId: string, delegateId: string, seconds: number, state: CommitteeState, update: Updater) {
  const sb = supabase();
  await sb.from('speakers_list').update({ status: 'spoke' }).eq('committee_id', committeeId).eq('status', 'speaking');
  await sb.from('speakers_list').insert({ committee_id: committeeId, delegate_id: delegateId, status: 'speaking', source: 'caucus', position: Date.now() });
  await update({ current_speaker_id: delegateId, speaker_timer: startTimer(emptyTimer(seconds * 1000), nowMs()) });
}

// What a passed motion does to the live committee state.
export function motionPatch(ev: EventRow, t: (s: string) => string = (s) => s): Partial<CommitteeState> | null {
  switch (ev.type) {
    case 'moderated_caucus':
      return {
        mode: 'moderated',
        caucus_topic: ev.details || t('Moderated caucus'),
        caucus_speaking_sec: ev.speaking_sec || 60,
        caucus_timer: emptyTimer((ev.duration_sec || 600) * 1000),
        speaker_timer: emptyTimer((ev.speaking_sec || 60) * 1000),
        current_speaker_id: null,
      };
    case 'unmoderated_caucus':
      return {
        mode: 'unmoderated',
        caucus_topic: ev.details || t('Unmoderated caucus'),
        caucus_timer: emptyTimer((ev.duration_sec || 600) * 1000),
        current_speaker_id: null,
      };
    case 'set_speaking_time':
      return ev.speaking_sec ? { speaking_time_sec: ev.speaking_sec } : null;
    case 'suspend_session':
      return { status: 'suspended' };
    case 'adjourn':
      return { status: 'adjourned' };
    default:
      return null;
  }
}

export function tally(records: Pick<VoteRecord, 'choice'>[]) {
  const t = { for: 0, against: 0, abstain: 0 };
  for (const r of records) t[r.choice]++;
  return t;
}

// Abstentions do not count toward the threshold. Adjust here if your rules differ.
export function voteOutcome(t: { for: number; against: number }, threshold: VoteRow['threshold']): 'passed' | 'failed' {
  const decided = t.for + t.against;
  if (decided === 0) return 'failed';
  if (threshold === 'two_thirds') return t.for * 3 >= decided * 2 ? 'passed' : 'failed';
  return t.for > t.against ? 'passed' : 'failed';
}

export const THRESHOLD_LABEL: Record<string, string> = { simple: 'Simple majority', two_thirds: 'Two-thirds majority' };

export function countryOf(delegates: { id: string; country: string; name: string }[], id: string | null | undefined) {
  if (!id) return null;
  return delegates.find((d) => d.id === id) || null;
}

// ───────── Sessions ─────────
// Opening a session numbers it, snapshots the roll call and puts the committee in session.
export async function openSession(committeeId: string) {
  const { error } = await supabase().rpc('open_session', { p_committee: committeeId });
  if (error) toastError(error);
  return !error;
}

// Closing a session (suspend / adjourn) saves its roll call; the next session starts with a fresh roll call.
export async function closeSession(committeeId: string, status: 'suspended' | 'adjourned') {
  const { error } = await supabase().rpc('close_session', { p_committee: committeeId, p_status: status });
  if (error) toastError(error);
  return !error;
}

// Runs the effect of a motion that just passed. Returns a short message for the chair, or null.
export async function applyMotionEffects(
  ev: EventRow,
  committeeId: string,
  state: CommitteeState,
  update: (patch: Partial<CommitteeState>) => Promise<boolean>,
  refresh: () => void,
  t: (s: string) => string = (s) => s
): Promise<string | null> {
  switch (ev.type) {
    case 'open_session':
      if (state.status === 'in_session' && state.current_session_id) return 'A session is already open. Suspend it first to open the next one.';
      if (await openSession(committeeId)) {
        refresh();
        return 'Session opened. Remember to take roll call.';
      }
      return null;
    case 'suspend_session':
      if (await closeSession(committeeId, 'suspended')) {
        refresh();
        return 'Session suspended and saved. The next session starts with a new roll call.';
      }
      return null;
    case 'adjourn':
      if (await closeSession(committeeId, 'adjourned')) {
        refresh();
        return 'Meeting adjourned and session saved.';
      }
      return null;
    case 'open_debate':
      await update({ mode: 'formal', caucus_topic: null, caucus_speaking_sec: null });
      return 'Debate opened: back to the speakers\u2019 list.';
    case 'close_debate':
      return 'Debate closed. Open the vote in the Voting tab.';
    case 'finish_reading_pp':
      return 'Motion passed: finish reading position papers.';
    case 'extraordinary_questions':
      return 'Motion passed: extraordinary session of questions.';
    default: {
      const patch = motionPatch(ev, t);
      if (patch) {
        await update(patch);
        return ev.type.includes('caucus') ? 'Motion passed. Caucus is ready on the Caucus tab.' : 'Motion passed and applied.';
      }
      return null;
    }
  }
}
