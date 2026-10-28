// Committee categories and committee types. Everything here is data: High Command edits it in
// "Types & categories" (stored in settings.committee_catalog), so new kinds of committee, parties,
// sides, colours and logos can be added later without touching code.
export type FlagSource = 'country' | 'country_in_text' | 'us_state' | 'group_logo' | 'none';
export type BulkColumn = 'country' | 'name' | 'group';

export interface Group {
  key: string;
  name: string;
  name_es?: string;
  short: string; // shown in the small badge, e.g. "PAN"
  color: string; // hex
  logo?: string; // optional image URL (uploaded by High Command)
  aliases?: string[]; // other ways to type it in the bulk-add box
}
export interface Category {
  key: string;
  name: string;
  name_es?: string;
  color: string;
}
export interface CommitteeType {
  key: string;
  name: string;
  name_es?: string;
  default_category?: string | null;
  label_field: string; // what the main column is called: Country, State...
  label_field_es?: string;
  flag: FlagSource;
  group_label?: string; // Party, Side...
  group_label_es?: string;
  groups: Group[];
  group_required?: boolean;
  secret_topic?: boolean; // topic hidden from everyone but High Command, advisors and (once the conference starts) assigned chairs
  bulk: BulkColumn[]; // order of the columns when adding delegates in bulk
}
export interface Catalog {
  categories: Category[];
  types: CommitteeType[];
}

export const DEFAULT_CATALOG: Catalog = {
  categories: [
    { key: 'ecosoc', name: 'Economic and Social Council', name_es: 'Consejo Económico y Social', color: '#059669' },
    { key: 'general_assembly', name: 'General Assembly', name_es: 'Asamblea General', color: '#2563eb' },
    { key: 'security_council', name: 'Security Council', name_es: 'Consejo de Seguridad', color: '#dc2626' },
    { key: 'junior_high', name: 'Junior High', name_es: 'Secundaria', color: '#d97706' },
    { key: 'specialized', name: 'Specialized Committees', name_es: 'Comités Especializados', color: '#7c3aed' },
  ],
  types: [
    { key: 'standard', name: 'Standard', name_es: 'Estándar', default_category: null, label_field: 'Country', label_field_es: 'País', flag: 'country', groups: [], bulk: ['country', 'name'] },
    { key: 'specialized', name: 'Specialized', name_es: 'Especializado', default_category: 'specialized', label_field: 'Country', label_field_es: 'País', flag: 'country', groups: [], bulk: ['country', 'name'] },
    {
      key: 'us_senate', name: 'US Senate', name_es: 'Senado de EE. UU.', default_category: 'specialized',
      label_field: 'Senator (State)', label_field_es: 'Senador (Estado)', flag: 'us_state', group_label: 'Party', group_label_es: 'Partido', group_required: true, bulk: ['country', 'group', 'name'],
      groups: [
        { key: 'democrat', name: 'Democratic Party', name_es: 'Partido Demócrata', short: 'D', color: '#1d4ed8', aliases: ['democrat', 'democratic', 'dem'] },
        { key: 'republican', name: 'Republican Party', name_es: 'Partido Republicano', short: 'R', color: '#dc2626', aliases: ['republican', 'rep', 'gop'] },
      ],
    },
    {
      key: 'mx_senate', name: 'Senado de México', name_es: 'Senado de México', default_category: 'specialized',
      label_field: 'Entidad', label_field_es: 'Entidad', flag: 'group_logo', group_label: 'Partido', group_label_es: 'Partido', group_required: true, bulk: ['country', 'group', 'name'],
      groups: [
        { key: 'morena', name: 'MORENA', short: 'MORENA', color: '#8c1d2f', logo: '/logos/mx/morena.png' },
        { key: 'pvem', name: 'PVEM', short: 'PVEM', color: '#16a34a', logo: '/logos/mx/pvem.png' },
        { key: 'pan', name: 'PAN', short: 'PAN', color: '#1d4ed8', logo: '/logos/mx/pan.png' },
        { key: 'pt', name: 'PT', short: 'PT', color: '#e11d48', logo: '/logos/mx/pt.png' },
        { key: 'mc', name: 'MC', short: 'MC', color: '#ea580c', logo: '/logos/mx/mc.png' },
        { key: 'pri', name: 'PRI', short: 'PRI', color: '#15803d', logo: '/logos/mx/pri.png' },
      ],
    },
    {
      key: 'icc', name: 'ICC', name_es: 'CPI', default_category: 'specialized',
      label_field: 'Country', label_field_es: 'País', flag: 'country_in_text', group_label: 'Side', group_label_es: 'Parte', group_required: true, bulk: ['group', 'name', 'country'],
      groups: [
        { key: 'prosecution', name: 'Prosecution', name_es: 'Fiscalía', short: 'PRO', color: '#b45309' },
        { key: 'defense', name: 'Defense', name_es: 'Defensa', short: 'DEF', color: '#0f766e' },
        { key: 'judges', name: 'Judges', name_es: 'Jueces', short: 'JDG', color: '#4338ca' },
      ],
    },
    { key: 'crisis', name: 'Crisis committee', name_es: 'Comité de crisis', default_category: 'specialized', label_field: 'Country', label_field_es: 'País', flag: 'country', secret_topic: true, groups: [], bulk: ['country', 'name'] },
  ],
};

export const STANDARD_TYPE = DEFAULT_CATALOG.types[0];

export const catalogOf = (s?: { committee_catalog?: Catalog | null } | null): Catalog => {
  const c = s?.committee_catalog;
  return c && Array.isArray(c.types) && Array.isArray(c.categories) ? c : DEFAULT_CATALOG;
};
export const typeOf = (cat: Catalog, key?: string | null): CommitteeType => cat.types.find((t) => t.key === key) || cat.types.find((t) => t.key === 'standard') || STANDARD_TYPE;
export const categoryOf = (cat: Catalog, key?: string | null) => cat.categories.find((c) => c.key === key) || null;
export const nameIn = (x: { name: string; name_es?: string }, lang: 'en' | 'es') => (lang === 'es' && x.name_es) || x.name;
export const groupOf = (type: CommitteeType, key?: string | null) => type.groups.find((g) => g.key === key) || null;
export const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'item';

// Match a typed group ("pan", "Prosecution", "Fiscalía") to a group of the type.
export function matchGroup(type: CommitteeType, text: string): Group | null {
  const q = slug(text);
  if (!q) return null;
  const bare = (v: string) => slug(v).replace(/^partido_/, '').replace(/_party$/, '').replace(/_partido$/, '');
  return type.groups.find((g) => [g.key, g.name, g.name_es || '', g.short, ...(g.aliases || [])].some((v) => slug(v) === q || bare(v) === bare(text))) || null;
}
