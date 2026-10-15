'use client';
import { useEffect, useState } from 'react';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error' | 'success';
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as { message: string; tone: Toast['tone'] };
      const id = ++n;
      setItems((x) => [...x, { id, ...d }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 5000);
    };
    window.addEventListener('mp-toast', handler);
    return () => window.removeEventListener('mp-toast', handler);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-lg px-4 py-3 text-sm shadow-lg ${
            t.tone === 'error' ? 'bg-red-600 text-white' : t.tone === 'success' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
