import countries from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json';
import es from 'i18n-iso-countries/langs/es.json';

countries.registerLocale(en);
countries.registerLocale(es);

// Extra flags that are not ISO countries but appear in MUN rosters (all exist in the flag set).
const EXTRA: Record<string, { en: string; es: string }> = {
  xk: { en: 'Kosovo', es: 'Kosovo' },
  eu: { en: 'European Union', es: 'Unión Europea' },
  un: { en: 'United Nations', es: 'Naciones Unidas' },
};

// Common alternative names (normalised: lowercase, no accents/punctuation).
const ALIASES: Record<string, string> = {
  russia: 'ru', usa: 'us', 'u s a': 'us', 'united states': 'us', america: 'us', 'estados unidos': 'us', eeuu: 'us', eua: 'us',
  'estados unidos de america': 'us', uk: 'gb', 'u k': 'gb', 'great britain': 'gb', britain: 'gb', england: 'gb', 'reino unido': 'gb',
  'north korea': 'kp', dprk: 'kp', 'corea del norte': 'kp', 'south korea': 'kr', 'corea del sur': 'kr', 'republic of korea': 'kr',
  iran: 'ir', syria: 'sy', laos: 'la', vietnam: 'vn', bolivia: 'bo', venezuela: 've', tanzania: 'tz', moldova: 'md', brunei: 'bn',
  'cape verde': 'cv', 'cabo verde': 'cv', czechia: 'cz', 'czech republic': 'cz', turkey: 'tr', turkiye: 'tr', 'ivory coast': 'ci',
  'cote d ivoire': 'ci', 'costa de marfil': 'ci', swaziland: 'sz', eswatini: 'sz', myanmar: 'mm', burma: 'mm', palestine: 'ps',
  'state of palestine': 'ps', 'estado de palestina': 'ps', 'holy see': 'va', vatican: 'va', 'vatican city': 'va', 'santa sede': 'va',
  taiwan: 'tw', 'democratic republic of the congo': 'cd', 'democratic republic of congo': 'cd', drc: 'cd', 'dr congo': 'cd',
  'republica democratica del congo': 'cd', 'republic of the congo': 'cg', 'republica del congo': 'cg', micronesia: 'fm', macedonia: 'mk',
  'north macedonia': 'mk', 'macedonia del norte': 'mk', 'east timor': 'tl', 'timor leste': 'tl', 'timor oriental': 'tl', bahamas: 'bs',
  gambia: 'gm', 'the gambia': 'gm', netherlands: 'nl', 'the netherlands': 'nl', holland: 'nl', 'paises bajos': 'nl', 'hong kong': 'hk',
  kosovo: 'xk', 'european union': 'eu', 'union europea': 'eu', 'united nations': 'un', 'naciones unidas': 'un', rusia: 'ru',
  'republica checa': 'cz', 'emiratos arabes unidos': 'ae', uae: 'ae', 'united arab emirates': 'ae', 'saudi arabia': 'sa',
  'arabia saudita': 'sa', 'arabia saudi': 'sa', 'new zealand': 'nz', 'south africa': 'za', sudafrica: 'za',
  'iran islamic republic of': 'ir', 'viet nam': 'vn', 'lao pdr': 'la', 'lao people s democratic republic': 'la',
  'bolivia plurinational state of': 'bo', 'venezuela bolivarian republic of': 've', 'united republic of tanzania': 'tz',
  'republic of moldova': 'md', 'micronesia federated states of': 'fm', 'korea republic of': 'kr',
  'korea democratic people s republic of': 'kp', 'democratic people s republic of korea': 'kp',
};
// Names that could mean two countries never get a flag automatically (pick one with "Change flag").
const AMBIGUOUS = ['congo', 'korea'];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(the|el|la|los|las) /, '')
    .trim();

let index: Map<string, string> | null = null;
function buildIndex() {
  const m = new Map<string, string>();
  for (const code of Object.keys(countries.getAlpha2Codes())) {
    const c = code.toLowerCase();
    for (const lang of ['en', 'es'] as const) {
      const names = countries.getName(code, lang, { select: 'all' }) as unknown as string[] | string | undefined;
      for (const n of Array.isArray(names) ? names : names ? [names] : []) m.set(norm(n), c);
    }
  }
  for (const [c, n] of Object.entries(EXTRA)) {
    m.set(norm(n.en), c);
    m.set(norm(n.es), c);
  }
  for (const [k, c] of Object.entries(ALIASES)) m.set(k, c);
  for (const k of AMBIGUOUS) m.delete(k);
  return m;
}

// Flag code for a country name, or null when we are not sure (a wrong flag is worse than none).
export function guessFlag(country: string | null | undefined): string | null {
  if (!country) return null;
  index ||= buildIndex();
  return index.get(norm(country)) || null;
}

// Override rules: null/undefined = automatic, 'none' = hide, otherwise a specific ISO code.
export function flagFor(country: string | null | undefined, override?: string | null): string | null {
  if (override === 'none') return null;
  if (override) return override.toLowerCase();
  return guessFlag(country);
}

// Sorted list for the "change flag" picker.
export function flagOptions(lang: 'en' | 'es'): { code: string; name: string }[] {
  const list = Object.entries(countries.getNames(lang, { select: 'official' })).map(([code, name]) => ({ code: code.toLowerCase(), name }));
  for (const [c, n] of Object.entries(EXTRA)) list.push({ code: c, name: n[lang] });
  return list.sort((a, b) => a.name.localeCompare(b.name, lang));
}

// Country name matching for search boxes (accent-insensitive, English or Spanish names).
export function matchesCountry(country: string, query: string, override?: string | null) {
  const q = norm(query);
  if (!q) return true;
  if (norm(country).includes(q)) return true;
  const code = flagFor(country, override);
  if (!code) return false;
  for (const lang of ['en', 'es'] as const) {
    const n = (countries.getName(code.toUpperCase(), lang) as string | undefined) || EXTRA[code]?.[lang];
    if (n && norm(n).includes(q)) return true;
  }
  return false;
}
