'use client';
import { resolveFlag } from '@/lib/countries';
import { useCommitteeType } from '@/lib/committeeContext';
import { CommitteeType, groupOf } from '@/lib/catalog';
import { useLang } from '@/lib/i18n';
import { nameIn } from '@/lib/catalog';

// Small flag shown before a delegation's name. What counts as "the flag" depends on the committee type
// (country flag, US state flag, none...). Renders nothing when nothing is recognised.
export function Flag({ country, flag, className = '' }: { country: string; flag?: string | null; className?: string }) {
  const type = useCommitteeType();
  const code = resolveFlag(type.flag, country, flag);
  if (!code) return null;
  if (code.startsWith('us-')) {
    return <span aria-hidden className={`inline-block aspect-[4/3] h-[1em] shrink-0 overflow-hidden rounded-[2px] ring-1 ring-black/10 ${className}`}><img src={`/flags/us/${code.slice(3)}.svg`} alt="" className="h-full w-full object-contain" /></span>;
  }
  return <span aria-hidden className={`fi fi-${code} shrink-0 rounded-[2px] ring-1 ring-black/10 ${className}`} />;
}

// Party / side badge (colour chip with the short name, or the uploaded logo). Nothing for types without groups.
export function GroupBadge({ groupKey, type: typeProp, className = '', full = false }: { groupKey?: string | null; type?: CommitteeType; className?: string; full?: boolean }) {
  const ctxType = useCommitteeType();
  const lang = useLang();
  const type = typeProp || ctxType;
  const g = groupOf(type, groupKey);
  if (!g) return null;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-white ${className}`} style={{ background: g.color }} title={nameIn(g, lang)}>
      {g.logo && <img src={g.logo} alt="" className="h-[1.6em] w-auto max-w-[3.5em] rounded-[3px] bg-white object-contain p-[1px]" />}
      {full ? nameIn(g, lang) : g.short}
    </span>
  );
}
