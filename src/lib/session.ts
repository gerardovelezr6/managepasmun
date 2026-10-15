import { supabase } from './supabase';
import { nowMs } from './clock';
import { emptyTimer, resetTimer, startTimer } from './timer';
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
export function motionPatch(ev: EventRow): Partial<CommitteeState> | null {
  switch (ev.type) {
    case 'moderated_caucus':
      return {
        mode: 'moderated',
        caucus_topic: ev.details || 'Moderated caucus',
        caucus_speaking_sec: ev.speaking_sec || 60,
        caucus_timer: emptyTimer((ev.duration_sec || 600) * 1000),
        speaker_timer: emptyTimer((ev.speaking_sec || 60) * 1000),
        current_speaker_id: null,
      };
    case 'unmoderated_caucus':
      return {
        mode: 'unmoderated',
        caucus_topic: ev.details || 'Unmoderated caucus',
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
