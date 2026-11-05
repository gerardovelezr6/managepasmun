'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { APP_CONFIG } from '@/lib/config';
import { Settings } from '@/lib/types';

const fallback: Settings = {
  id: 1,
  conference_name: APP_CONFIG.fallbackConferenceName,
  short_name: APP_CONFIG.fallbackShortName,
  tagline: APP_CONFIG.fallbackTagline,
  conference_dates: '[Placeholder dates]',
  venue: '[Placeholder venue]',
  logo_url: null,
  primary_color: APP_CONFIG.fallbackPrimary,
  accent_color: APP_CONFIG.fallbackAccent,
  default_speaking_sec: APP_CONFIG.defaultSpeakingSec,
  explanation_points: 1,
};

const Ctx = createContext<{ settings: Settings; reload: () => void }>({ settings: fallback, reload: () => {} });
export const useSettings = () => useContext(Ctx);

function hexToRgbTriplet(hex: string, fb: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '') || /^#?([0-9a-f]{6})$/i.exec(fb);
  const n = parseInt(m![1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(fallback);
  // Hold a loading screen until the real settings arrive, so default colours and placeholder text never flash.
  const [ready, setReady] = useState(false);

  const load = async () => {
    try {
      const { data } = await supabase().from('settings').select('*').eq('id', 1).maybeSingle();
      if (data) setSettings({ ...fallback, ...(data as Settings) });
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    load();
    const bail = setTimeout(() => setReady(true), 6000); // never trap the user behind the loader
    const sb = supabase();
    const ch = sb
      .channel(`settings-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, load)
      .subscribe();
    return () => {
      clearTimeout(bail);
      sb.removeChannel(ch);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--brand', hexToRgbTriplet(settings.primary_color, APP_CONFIG.fallbackPrimary));
    root.style.setProperty('--accent', hexToRgbTriplet(settings.accent_color, APP_CONFIG.fallbackAccent));
    // Every dark tone (headings, projection screen) is the brand colour darkened, so the whole app follows the logo's colour.
    const [r, g, b] = hexToRgbTriplet(settings.primary_color, APP_CONFIG.fallbackPrimary).split(' ').map(Number);
    const dark = (k: number) => `${Math.round(r * k)} ${Math.round(g * k)} ${Math.round(b * k)}`;
    root.style.setProperty('--ink', dark(0.45));
    root.style.setProperty('--ink2', dark(0.65));
    root.style.setProperty('--stage', dark(0.22));
    root.style.setProperty('--stage-raised', dark(0.32));
    root.style.setProperty('--stage-line', dark(0.5));
    document.title = `${settings.short_name || 'MUN'} · ${APP_CONFIG.appName}`;
  }, [settings]);

  return (
    <Ctx.Provider value={{ settings, reload: load }}>
      {children}
      <div
        aria-hidden={ready}
        role="status"
        className={`fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-white transition-opacity duration-300 ${ready ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      >
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-500" />
        <span className="sr-only">Loading…</span>
      </div>
    </Ctx.Provider>
  );
}

export function BrandMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  const { settings } = useSettings();
  if (settings.logo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={settings.logo_url} alt={`${settings.short_name} logo`} style={{ height: size, width: 'auto', maxWidth: size * 3 }} className={`object-contain ${className}`} />;
  }
  return (
    <div
      style={{ height: size, width: size }}
      className={`flex shrink-0 items-center justify-center rounded-lg bg-brand text-xs font-bold text-white ${className}`}
      aria-label="Logo placeholder"
    >
      {(settings.short_name || 'MUN').slice(0, 3).toUpperCase()}
    </div>
  );
}
