import { flagFor } from '@/lib/countries';

// Small flag shown before a delegation's name. Renders nothing when the country is not recognised.
export function Flag({ country, flag, className = '' }: { country: string; flag?: string | null; className?: string }) {
  const code = flagFor(country, flag);
  if (!code) return null;
  return <span aria-hidden className={`fi fi-${code} shrink-0 rounded-[2px] ring-1 ring-black/10 ${className}`} />;
}
