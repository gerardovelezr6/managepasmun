'use client';
import { useTick } from '@/lib/hooks';
import { nowMs } from '@/lib/clock';
import { addTime, fmtMs, pauseTimer, remainingMs, resetTimer, startTimer } from '@/lib/timer';
import { TimerState } from '@/lib/types';

export function LiveTimer({ timer, className = '', warnAtMs = 10_000 }: { timer: TimerState; className?: string; warnAtMs?: number }) {
  useTick(timer.running ? 200 : 1000);
  const ms = remainingMs(timer, nowMs());
  const expired = ms <= 0 && timer.duration_ms > 0;
  const warn = timer.running && ms <= warnAtMs;
  return (
    <span className={`tabular-nums ${expired ? 'text-red-500' : warn ? 'animate-pulseRing text-red-400' : ''} ${className}`}>{fmtMs(ms)}</span>
  );
}

// Chair-side timer with transport controls. `onChange` receives the next TimerState.
export function TimerPanel({
  label,
  timer,
  onChange,
  presetsSec = [],
  big = true,
}: {
  label: string;
  timer: TimerState;
  onChange: (t: TimerState) => void;
  presetsSec?: number[];
  big?: boolean;
}) {
  useTick(timer.running ? 200 : 1000);
  const now = nowMs();
  const ms = remainingMs(timer, now);
  const expired = ms <= 0 && timer.duration_ms > 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-950 p-4 text-white">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
        <span>{label}</span>
        <span>{expired ? 'Time elapsed' : timer.running ? 'Running' : 'Paused'}</span>
      </div>
      <div className={`py-2 text-center font-mono font-bold tabular-nums ${big ? 'text-6xl' : 'text-4xl'} ${expired ? 'text-red-500' : timer.running && ms <= 10_000 ? 'text-red-400' : ''}`}>
        {fmtMs(ms)}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {timer.running ? (
          <button className="btn btn-sm bg-amber-500 text-black hover:bg-amber-400" onClick={() => onChange(pauseTimer(timer, nowMs()))}>
            Pause
          </button>
        ) : (
          <button className="btn btn-sm bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-40" disabled={timer.duration_ms <= 0} onClick={() => onChange(startTimer(timer, nowMs()))}>
            {ms > 0 && ms < timer.duration_ms ? 'Resume' : 'Start'}
          </button>
        )}
        <button className="btn btn-sm bg-slate-700 text-white hover:bg-slate-600" onClick={() => onChange(resetTimer(timer))}>
          Reset
        </button>
        <button className="btn btn-sm bg-slate-700 text-white hover:bg-slate-600" onClick={() => onChange(addTime(timer, -15_000, nowMs()))}>
          −15s
        </button>
        <button className="btn btn-sm bg-slate-700 text-white hover:bg-slate-600" onClick={() => onChange(addTime(timer, 15_000, nowMs()))}>
          +15s
        </button>
      </div>
      {presetsSec.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          <span className="text-xs text-slate-500">Set:</span>
          {presetsSec.map((s) => (
            <button key={s} className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-200 hover:bg-slate-700" onClick={() => onChange(resetTimer(timer, s * 1000))}>
              {s >= 60 && s % 60 === 0 ? `${s / 60}m` : `${s}s`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
