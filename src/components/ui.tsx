'use client';
import { useEffect, useState } from 'react';
import { SESSION_STATUS_LABEL } from '@/lib/config';
import { useT } from '@/lib/i18n';

const STATUS_TONE: Record<string, string> = {
  not_started: 'bg-slate-100 text-slate-600',
  in_session: 'bg-emerald-100 text-emerald-700',
  suspended: 'bg-amber-100 text-amber-800',
  adjourned: 'bg-slate-800 text-slate-100',
};

export function StatusBadge({ status }: { status?: string | null }) {
  const t = useT();
  const s = status || 'not_started';
  return (
    <span className={`badge ${STATUS_TONE[s] || STATUS_TONE.not_started}`}>
      {s === 'in_session' && <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
      {t(SESSION_STATUS_LABEL[s] || s)}
    </span>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string; count?: number }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px whitespace-nowrap border-b-[3px] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] transition-colors duration-200 ${
            value === t.id ? 'border-brand text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-10 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
      {label}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Seg<T extends string>({ value, options, onChange, disabled }: { value: T; options: { value: T; label: string; tone?: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white text-xs font-medium">
      {options.map((o) => (
        <button
          key={o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 transition ${value === o.value ? o.tone || 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-50'} ${o.value !== options[0].value ? 'border-l border-slate-300' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function useConfirm() {
  return (msg: string) => (typeof window === 'undefined' ? false : window.confirm(msg));
}

export function useLocalState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setV(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [key]);
  const set = (next: T) => {
    setV(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  return [v, set] as const;
}
