'use client';
import { resolveFlag } from '@/lib/countries';
import { useCommitteeType } from '@/lib/committeeContext';
import { CommitteeType, groupOf } from '@/lib/catalog';
import { useLang } from '@/lib/i18n';
import { nameIn } from '@/lib/catalog';

// Small flag shown before a delegation's name. What counts as "the flag" depends on the committee type
// (country flag, US state flag, none...). Renders nothing when nothing is recognised.
export function Flag({ country, flag, group, className = '' }: { country: string; flag?: string | null; group?: string | null; className?: string }) {
  const type = useCommitteeType();
  // Types such as the Senado de México show the party logo where other committees show a flag.
  if (type.flag === 'group_logo') {
    const logo = groupOf(type, group)?.logo;
    if (!logo) return null;
    // Logos are (nearly) square, so they sit in the flag's place at the same height, without a frame.
    return <img aria-hidden src={logo} alt="" className={`inline-block h-[1.15em] w-auto max-w-[1.8em] shrink-0 rounded-[3px] object-contain ${className}`} />;
  }
  const code = resolveFlag(type.flag, country, flag);
  if (!code) return null;
  if (code.startsWith('us-')) {
    return <span aria-hidden className={`inline-block aspect-[4/3] h-[1em] shrink-0 overflow-hidden rounded-[2px] ring-1 ring-black/10 ${className}`}><img src={`/flags/us/${code.slice(3)}.svg`} alt="" className="h-full w-full object-contain" /></span>;
  }
  return <span aria-hidden className={`fi fi-${code} shrink-0 rounded-[2px] ring-1 ring-black/10 ${className}`} />;
}

// Party / side badge (colour chip with the short name, or the uploaded logo). Nothing for types without groups.
export function GroupBadge({ groupKey, type: typeProp, className = '', full = false, solid = false }: { groupKey?: string | null; type?: CommitteeType; className?: string; full?: boolean; solid?: boolean }) {
  const ctxType = useCommitteeType();
  const lang = useLang();
  const type = typeProp || ctxType;
  const g = groupOf(type, groupKey);
  if (!g) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide ${solid ? 'text-white' : ''} ${className}`}
      // Soft tinted pill in the group's colour on light screens; solid on the dark projection screen.
      style={solid ? { background: g.color } : { background: `color-mix(in srgb, ${g.color} 12%, white)`, color: g.color, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${g.color} 28%, white)` }}
      title={nameIn(g, lang)}
    >
      {g.logo && type.flag !== 'group_logo' && <img src={g.logo} alt="" className="h-[1.6em] w-auto max-w-[3.5em] rounded-[3px] bg-white object-contain p-[1px]" />}
      {full ? nameIn(g, lang) : g.short}
    </span>
  );
}
