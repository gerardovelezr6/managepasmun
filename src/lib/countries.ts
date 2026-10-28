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

// Formal / legal names that do not reduce to the short name by dropping a title like "Republic of".
const FORMAL: Record<string, string> = {
  'french republic': 'fr', 'italian republic': 'it', 'portuguese republic': 'pt', 'hellenic republic': 'gr', 'republic of hungary': 'hu',
  'federal republic of germany': 'de', 'bundesrepublik deutschland': 'de', 'kingdom of spain': 'es', 'reino de espana': 'es',
  'hashemite kingdom of jordan': 'jo', 'arab republic of egypt': 'eg', 'republica arabe de egipto': 'eg', 'people s republic of china': 'cn',
  'republica popular china': 'cn', 'republica popular de china': 'cn', 'russian federation': 'ru', 'federacion de rusia': 'ru',
  'federative republic of brazil': 'br', 'republica federativa del brasil': 'br', 'republica federativa de brasil': 'br',
  'united mexican states': 'mx', 'estados unidos mexicanos': 'mx', 'united states of america': 'us',
  'united kingdom of great britain and northern ireland': 'gb', 'reino unido de gran bretana e irlanda del norte': 'gb',
  'commonwealth of australia': 'au', 'dominion of canada': 'ca', 'federal republic of nigeria': 'ng', 'republic of india': 'in',
  'bolivarian republic of venezuela': 've', 'republica bolivariana de venezuela': 've', 'plurinational state of bolivia': 'bo',
  'estado plurinacional de bolivia': 'bo', 'oriental republic of uruguay': 'uy', 'republica oriental del uruguay': 'uy',
  'argentine republic': 'ar', 'republica argentina': 'ar', 'islamic republic of iran': 'ir', 'republica islamica de iran': 'ir',
  'islamic republic of pakistan': 'pk', 'islamic republic of afghanistan': 'af', 'islamic republic of mauritania': 'mr',
  'democratic socialist republic of sri lanka': 'lk', 'people s republic of bangladesh': 'bd', 'socialist republic of viet nam': 'vn',
  'socialist republic of vietnam': 'vn', 'lao people s democratic republic': 'la', 'democratic people s republic of korea': 'kp',
  'republic of korea': 'kr', 'kingdom of saudi arabia': 'sa', 'reino de arabia saudita': 'sa', 'sultanate of oman': 'om',
  'state of qatar': 'qa', 'state of kuwait': 'kw', 'state of israel': 'il', 'state of libya': 'ly', 'state of palestine': 'ps',
  'kingdom of bahrain': 'bh', 'syrian arab republic': 'sy', 'republica arabe siria': 'sy', 'lebanese republic': 'lb', 'republic of iraq': 'iq',
  'republic of yemen': 'ye', 'republic of turkiye': 'tr', 'republic of turkey': 'tr', 'republica de turquia': 'tr',
  'kingdom of the netherlands': 'nl', 'reino de los paises bajos': 'nl', 'kingdom of belgium': 'be', 'grand duchy of luxembourg': 'lu',
  'gran ducado de luxemburgo': 'lu', 'principality of monaco': 'mc', 'principality of liechtenstein': 'li', 'principality of andorra': 'ad',
  'principado de andorra': 'ad', 'swiss confederation': 'ch', 'confederacion suiza': 'ch', 'republic of austria': 'at',
  'kingdom of denmark': 'dk', 'kingdom of sweden': 'se', 'kingdom of norway': 'no', 'republic of finland': 'fi', 'republic of iceland': 'is',
  'czech republic': 'cz', 'slovak republic': 'sk', 'republic of poland': 'pl', 'republic of croatia': 'hr', 'republic of serbia': 'rs',
  'republic of north macedonia': 'mk', 'republic of albania': 'al', 'republic of bulgaria': 'bg', 'republic of moldova': 'md',
  'independent state of papua new guinea': 'pg', 'independent state of samoa': 'ws', 'commonwealth of the bahamas': 'bs',
  'commonwealth of dominica': 'dm', 'federation of saint christopher and nevis': 'kn', 'federation of saint kitts and nevis': 'kn',
  'republic of trinidad and tobago': 'tt', 'republic of the philippines': 'ph', 'republic of indonesia': 'id',
  'federation of malaysia': 'my', 'republic of the union of myanmar': 'mm', 'union of the comoros': 'km', 'united republic of tanzania': 'tz',
  'federal democratic republic of ethiopia': 'et', 'federal republic of somalia': 'so', 'arab republic of syria': 'sy',
  'democratic republic of the congo': 'cd', 'republic of the congo': 'cg', 'democratic republic of sao tome and principe': 'st',
  'democratic republic of timor leste': 'tl', 'kingdom of eswatini': 'sz', 'kingdom of lesotho': 'ls', 'kingdom of morocco': 'ma',
  'reino de marruecos': 'ma', 'kingdom of thailand': 'th', 'reino de tailandia': 'th', 'kingdom of cambodia': 'kh', 'kingdom of bhutan': 'bt',
  'kingdom of tonga': 'to', 'federal republic of the comoros': 'km', 'republic of cote d ivoire': 'ci', 'togolese republic': 'tg',
  'republic of the gambia': 'gm', 'republic of the sudan': 'sd', 'republic of south sudan': 'ss', 'republic of cabo verde': 'cv',
  'state of eritrea': 'er', 'republic of the marshall islands': 'mh', 'republic of palau': 'pw', 'republic of nauru': 'nr',
  'republic of kiribati': 'ki', 'republic of fiji': 'fj', 'republic of vanuatu': 'vu', 'solomon islands': 'sb',
  'tuvalu': 'tv', 'federated states of micronesia': 'fm', 'republic of cyprus': 'cy', 'republic of malta': 'mt',
  'republic of san marino': 'sm', 'most serene republic of san marino': 'sm', 'vatican city state': 'va', 'state of the vatican city': 'va',
  'republic of kazakhstan': 'kz', 'kyrgyz republic': 'kg', 'republic of tajikistan': 'tj', 'republic of uzbekistan': 'uz',
  'republic of azerbaijan': 'az', 'republic of armenia': 'am', 'republic of belarus': 'by', 'republic of lithuania': 'lt',
  'republic of latvia': 'lv', 'republic of estonia': 'ee', 'republic of slovenia': 'si', 'republic of montenegro': 'me',
  'republic of kosovo': 'xk', 'bosnia and herzegovina': 'ba', 'republic of mauritius': 'mu', 'republic of seychelles': 'sc',
  'republic of maldives': 'mv', 'republic of singapore': 'sg', 'republic of the fiji islands': 'fj', 'republic of china': 'tw',
  'mongolia': 'mn', 'democratic republic of the congo (kinshasa)': 'cd', 'republic of equatorial guinea': 'gq', 'gabonese republic': 'ga',
  'republic of cameroon': 'cm', 'republic of chad': 'td', 'republic of niger': 'ne', 'republic of mali': 'ml', 'burkina faso': 'bf',
  'republic of senegal': 'sn', 'republic of guinea': 'gn', 'republic of guinea bissau': 'gw', 'republic of sierra leone': 'sl',
  'republic of liberia': 'lr', 'republic of ghana': 'gh', 'republic of benin': 'bj', 'republic of angola': 'ao',
  'republic of zambia': 'zm', 'republic of zimbabwe': 'zw', 'republic of malawi': 'mw', 'republic of mozambique': 'mz',
  'republic of namibia': 'na', 'republic of botswana': 'bw', 'republic of south africa': 'za', 'republic of madagascar': 'mg',
  'republic of rwanda': 'rw', 'republic of burundi': 'bi', 'republic of uganda': 'ug', 'republic of kenya': 'ke', 'republic of djibouti': 'dj',
  'republic of tunisia': 'tn', 'people s democratic republic of algeria': 'dz', 'republica argelina democratica y popular': 'dz',
  'republic of cuba': 'cu', 'dominican republic': 'do', 'republic of haiti': 'ht', 'republic of colombia': 'co', 'republic of ecuador': 'ec',
  'republic of peru': 'pe', 'republic of chile': 'cl', 'republic of paraguay': 'py', 'republic of suriname': 'sr',
  'co operative republic of guyana': 'gy', 'cooperative republic of guyana': 'gy', 'republic of panama': 'pa',
  'republic of costa rica': 'cr', 'republic of nicaragua': 'ni', 'republic of honduras': 'hn', 'republic of el salvador': 'sv',
  'republic of guatemala': 'gt', 'belize': 'bz', 'barbados': 'bb', 'jamaica': 'jm', 'grenada': 'gd', 'saint lucia': 'lc',
  'saint vincent and the grenadines': 'vc', 'antigua and barbuda': 'ag', 'federal republic of yugoslavia': 'rs', 'republic of ireland': 'ie',
  'republic of congo': 'cg', 'congo brazzaville': 'cg', 'congo kinshasa': 'cd',
  'japan': 'jp', 'new zealand': 'nz', 'ireland': 'ie', 'romania': 'ro', 'ukraine': 'ua', 'georgia': 'ge',
};
// Titles that can be dropped from the front of a name ("Republic of X" → "X").
const TITLES = [
  'democratic socialist republic of', 'socialist republic of', 'federal democratic republic of', 'democratic republic of', 'people s republic of',
  'people s democratic republic of', 'federal republic of', 'federative republic of', 'islamic republic of', 'arab republic of', 'bolivarian republic of',
  'oriental republic of', 'united republic of', 'co operative republic of', 'cooperative republic of', 'republic of the', 'republic of', 'republica de', 'republica del', 'republica de la',
  'hashemite kingdom of', 'kingdom of the', 'kingdom of', 'reino de los', 'reino de la', 'reino del', 'reino de', 'sultanate of', 'sultanato de', 'emirate of',
  'principality of', 'principado de', 'grand duchy of', 'state of the', 'state of', 'estado de la', 'estado del', 'estado de', 'commonwealth of the', 'commonwealth of',
  'commonwealth de', 'dominion of', 'federation of', 'federacion de', 'union of the', 'union of', 'independent state of', 'plurinational state of',
  'estado plurinacional de', 'united mexican states', 'confederation of', 'territory of', 'territorio de',
];
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
  for (const [k, c] of Object.entries(FORMAL)) m.set(norm(k), c);
  for (const k of AMBIGUOUS) m.delete(k);
  return m;
}

// Flag code for a country name, or null when we are not sure (a wrong flag is worse than none).
export function guessFlag(country: string | null | undefined): string | null {
  if (!country) return null;
  index ||= buildIndex();
  const n = norm(country);
  const hit = index.get(n);
  if (hit) return hit;
  // "Republic of X, ..." / "X, Republic of": try without a leading title, and with a trailing ", Republic of".
  const stripped = n.replace(/^(?:the )/, '');
  for (const t of TITLES) {
    if (stripped.startsWith(t + ' ')) {
      const rest = stripped.slice(t.length + 1);
      const h = index.get(rest);
      if (h) return h;
    }
  }
  const tail = stripped.match(/^(.*) (?:republic|kingdom|state|commonwealth|federation) of$/);
  if (tail && index.get(tail[1])) return index.get(tail[1])!;
  return null;
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
