import { Profile } from './types';

// Roles from most to least important; lists of people follow this order.
export const ROLE_ORDER = ['advisor', 'high_command', 'chair', 'pending'] as const;
export const ROLE_LABEL: Record<string, string> = { advisor: 'Advisor', high_command: 'High Command', chair: 'Chair', pending: 'No access' };
export const ROLE_GROUP_LABEL: Record<string, string> = { advisor: 'Advisors', high_command: 'High Command', chair: 'Chairs', pending: 'No access' };
const rank = (r: string) => { const i = ROLE_ORDER.indexOf(r as any); return i < 0 ? ROLE_ORDER.length : i; };

export function sortByRole<T extends Pick<Profile, 'role' | 'full_name' | 'email'>>(list: T[]): T[] {
  return [...list].sort((a, b) => rank(a.role) - rank(b.role) || (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''));
}

// Sorted people split into role sections: [{ role, label, items }].
export function groupByRole<T extends Pick<Profile, 'role' | 'full_name' | 'email'>>(list: T[]) {
  const sorted = sortByRole(list);
  return ROLE_ORDER.map((role) => ({ role, label: ROLE_GROUP_LABEL[role], items: sorted.filter((u) => u.role === role) })).filter((g) => g.items.length);
}
