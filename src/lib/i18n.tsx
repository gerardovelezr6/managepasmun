'use client';
import { createContext, useCallback, useContext } from 'react';
import { ES } from './es';

// Per-committee language. English text is the key; Spanish (Mexico) comes from the ES dictionary.
// A missing entry simply shows the English text. {name} placeholders are filled from `vars`.
export type Lang = 'en' | 'es';

export function translate(lang: Lang, text: string, vars?: Record<string, string | number>) {
  let out = lang === 'es' ? ES[text] ?? text : text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

export const LOCALE: Record<Lang, string> = { en: 'en-US', es: 'es-MX' };

const Ctx = createContext<Lang>('en');

export function LangProvider({ lang, children }: { lang?: Lang | null; children: React.ReactNode }) {
  return <Ctx.Provider value={lang === 'es' ? 'es' : 'en'}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);

export function useT() {
  const lang = useContext(Ctx);
  return useCallback((text: string, vars?: Record<string, string | number>) => translate(lang, text, vars), [lang]);
}

// Rubric wording in the committee's language (falls back to English when no translation was entered).
export function rubricText(lang: Lang, l: { label: string; description: string; label_es?: string | null; description_es?: string | null }) {
  return lang === 'es' ? { label: l.label_es || l.label, description: l.description_es || l.description } : { label: l.label, description: l.description };
}
