import { TimerState } from './types';

export const emptyTimer = (ms = 0): TimerState => ({ duration_ms: ms, remaining_ms: ms, running: false, started_at: null });

// Timers are stored as (remaining at last start/pause, started_at). Every device derives the
// live value from the server-corrected clock, so no per-second writes are needed.
export function remainingMs(t: TimerState | null | undefined, now: number): number {
  if (!t) return 0;
  if (!t.running || !t.started_at) return Math.max(0, t.remaining_ms);
  return Math.max(0, t.remaining_ms - (now - new Date(t.started_at).getTime()));
}

export function startTimer(t: TimerState, now: number): TimerState {
  const rem = t.remaining_ms <= 0 ? t.duration_ms : t.remaining_ms;
  return { ...t, running: true, started_at: new Date(now).toISOString(), remaining_ms: rem };
}

export function pauseTimer(t: TimerState, now: number): TimerState {
  return { ...t, running: false, started_at: null, remaining_ms: remainingMs(t, now) };
}

export function resetTimer(t: TimerState, ms?: number): TimerState {
  const d = ms ?? t.duration_ms;
  return { duration_ms: d, remaining_ms: d, running: false, started_at: null };
}

export function addTime(t: TimerState, deltaMs: number, now: number): TimerState {
  const rem = Math.max(0, remainingMs(t, now) + deltaMs);
  return {
    ...t,
    duration_ms: Math.max(t.duration_ms, rem),
    remaining_ms: rem,
    started_at: t.running ? new Date(now).toISOString() : null,
  };
}

export function fmtMs(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
