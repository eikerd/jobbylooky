/**
 * Google map embeds for the places a pitch names.
 *
 * A job maps its "Location:" field only. The street addresses in an email belong to the
 * recruiting company that sent it (its signature), so they map on the company's page instead.
 */

export interface MapPlace {
  /** The text sent to Google, cleaned of conditions like "(Hybrid)" or ": 3 days onsite". */
  query: string;
  /** Where the place came from: "Job location" or "Office". */
  source: string;
  region: string;
  zoom: number;
  link: string;
  /** The street-map embed; at these zooms a satellite view shows nothing a street map does not. */
  embed: string;
}

export interface ZoomRule {
  region: string;
  zoom: number;
  applies: (place: string) => boolean;
}

const MAX_MAPS = 5;
const STATE_CODES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
const STATE_NAMES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'];
// Names first so "North Carolina" is never read as a city called "North" in a state called "Carolina".
const STATE = `(?:${[...STATE_NAMES, ...STATE_CODES].join('|')})`;
const ZIP = '\\d{5}(?:-\\d{4})?';
/** "Texas" → "TX": the two lists run in the same order. */
const STATE_CODE = new Map(STATE_NAMES.map((name, index) => [name.toLowerCase(), STATE_CODES[index]]));
/** The two-letter code for a state written either way: "North Carolina" and "nc" are both "NC". */
export function stateCode(state: string) {
  return STATE_CODE.get(state.trim().toLowerCase()) ?? state.trim().toUpperCase();
}
/** "Plano, TX", "Plano TX 75024", "Durham, North Carolina". Case-sensitive: "or" and "in" are words, OR and IN are states. */
const cityState = new RegExp(`([A-Z][A-Za-z.'’-]*(?:[ -][A-Za-z.'’-]+){0,3}),?\\s+(${STATE})\\b(\\s+${ZIP})?`, 'g');
/** The state a place ends with, allowing a ZIP and a country after it. */
const trailingState = new RegExp(`[\\s,]+(${STATE})(?:\\s+${ZIP})?(?:,?\\s*(?:USA?|United States))?\\s*$`);
const streetAddress = /\b\d{1,6}\s+(?:[A-Za-z0-9.'’-]+\s+){1,7}(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|parkway|pkwy|lane|ln|way|highway|hwy|court|ct|circle|cir|terrace|ter)\b/i;
/** Template placeholders, links and email addresses are never a place. */
const unsafe = /\{|https?:|@|[<>}]/i;

const northTexasCity = /\b(?:dallas|fort worth|ft\.? worth|dfw|north texas|plano|frisco|irving|las colinas|richardson|addison|carrollton|mckinney|allen|denton|arlington|garland|grand prairie|lewisville|flower mound|southlake|westlake|grapevine|coppell|the colony|mesquite|rockwall|wylie|prosper|little elm|farmers branch)\b/i;

export function stateOf(place: string) {
  return trailingState.exec(place)?.[1] ?? null;
}

/** North Texas: a Dallas–Fort Worth ZIP when there is one, otherwise a metroplex city in Texas or with no state at all. */
export function isNorthTexas(place: string) {
  const state = stateOf(place);
  if (state && state !== 'TX' && state !== 'Texas') return false;
  const zip = /\b(7[5-9]\d{3})\b/.exec(place);
  if (zip) return /^(?:75[0-4]|76[0-2])/.test(zip[1]);
  return northTexasCity.test(place);
}

/**
 * Zoom per region; the first rule that applies wins, and anywhere else gets STATE_ZOOM.
 * The thumbnails are 200px wide. At Dallas' latitude zoom 10 spans about 16 miles side to side,
 * an 8-mile radius and the integer zoom nearest the 10 miles asked for; zoom 6 spans about
 * 250 miles, the state and its neighbours. Add a row here for the next region.
 */
export const ZOOM_RULES: ZoomRule[] = [{ region: 'North Texas', zoom: 10, applies: isNorthTexas }];
export const STATE_ZOOM = { region: 'State', zoom: 6 };

export function zoomFor(place: string) {
  const rule = ZOOM_RULES.find((candidate) => candidate.applies(place));
  return rule ? { region: rule.region, zoom: rule.zoom } : STATE_ZOOM;
}

export function placeMap(query: string, source: string): MapPlace {
  const { region, zoom } = zoomFor(query);
  return {
    query,
    source,
    region,
    zoom,
    link: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
    embed: `https://maps.google.com/maps?${new URLSearchParams({ q: query, t: 'm', z: String(zoom), output: 'embed' })}`,
  };
}

function cleanQuery(text: string) {
  return text
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s*[:–]\s*\d+\s*days?.*$/i, '')
    .replace(/\s*\|\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '');
}

function unique(queries: string[]) {
  const seen = new Set<string>();
  return queries.filter((query) => {
    const key = query.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Maps for a job's "Location:" field. A street address maps as written; otherwise every
 * "City, ST" in the field maps separately, so a multi-city requisition shows each city.
 * Remote, "Not stated" and conditions in parentheses produce nothing.
 */
export function mapLocations(location: string): MapPlace[] {
  if (!location || unsafe.test(location)) return [];
  const embedded = location.match(/\(([^)]*)\)/);
  if (embedded && streetAddress.test(embedded[1]))
    return [placeMap(cleanQuery(`${embedded[1]}, ${location.slice(0, embedded.index).trim()}`), 'Job location')];
  const text = cleanQuery(location.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\bremote\b/gi, ' '));
  if (streetAddress.test(text)) return [placeMap(text, 'Job location')];
  const pairs = [...text.matchAll(cityState)].map((match) => `${match[1].trim()}, ${match[2]}${match[3] ?? ''}`);
  if (pairs.length) return unique(pairs).slice(0, MAX_MAPS).map((query) => placeMap(query, 'Job location'));
  // "Plano" on its own is the metroplex city, not Plano, Illinois.
  const city = northTexasCity.exec(text);
  if (city) return [placeMap(`${city[0]}, TX`, 'Job location')];
  if (text.includes(',') && /[A-Za-z]/.test(text)) return [placeMap(text, 'Job location')];
  return [];
}

export type WorkMode = 'Remote' | 'Hybrid' | 'Onsite';

// "Remote is not allowed" must not read as Remote (Codex, PR #23 round 3).
const notRemote =
  /\b(?:no|not|non)[\s-]+remote\b|\bremote(?:\s+work)?\s+(?:(?:is|are)\s+not|isn['’]t|aren['’]t|not)\s+(?:allowed|available|possible|permitted|offered|an\s+option)\b/gi;
const officeDays = /\bon[\s-]?site\b|\bin[\s-]?(?:the\s+)?(?:client\s+)?office\b|\b\d\s*days?\s*(?:a|per|\/)\s*week\b|\boffice\s+\d\s*days?\b/i;

/**
 * How the job is worked, when the location says so: "Hybrid" for hybrid or a remote/office
 * mix ("Onsite 4 days, 1 day remote"), "Onsite" for office days or "no remote", "Remote" for
 * remote with nothing on site. Null when the location does not say.
 */
export function workMode(location: string): WorkMode | null {
  const text = location.replace(notRemote, ' onsite ');
  const remote = /\bremote\b/i.test(text);
  const onsite = officeDays.test(text) || text !== location;
  // A remote mention left after the "no remote" phrases are gone is a remote day beside office ones.
  if (/\bhybrid\b/i.test(text) || (remote && onsite)) return 'Hybrid';
  if (onsite) return 'Onsite';
  return remote ? 'Remote' : null;
}

/**
 * What the received line shows for a location none of which maps: "Remote" for a remote or
 * unknown one (the owner, 2026-10-09), otherwise the text as written ("Austin", "Hybrid").
 * Template placeholders and links are unknown, never text to show.
 */
export function unmappedLocation(location: string) {
  const text = location.trim();
  return !text || text === 'Not stated' || unsafe.test(text) || workMode(text) === 'Remote' ? 'Remote' : text;
}

/** Lines that state where the job is; an address on one belongs to the job, not the sender. */
const jobLocationLine = /^\s*(?:\*\*)?(?:Locations?|Work (?:location|setting)|Job location|Client location|Onsite location)\b/i;

/** Street addresses written in an email, usually the sender's signature, with the "City, ST ZIP" line below each. */
export function signatureAddresses(body: string) {
  const lines = body.split('\n');
  const found: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].replace(/\[https?:\/\/[^\]]*\]|https?:\/\/\S+/g, '').trim();
    if (jobLocationLine.test(line)) continue;
    const match = streetAddress.exec(line);
    if (!match) continue;
    let text = line.slice(match.index);
    // An address inside parentheses ends at the closing one: "(401 Las Colinas Blvd) – ON SITE".
    const close = text.indexOf(')');
    if (close !== -1 && (text.indexOf('(') === -1 || text.indexOf('(') > close)) text = text.slice(0, close);
    const next = lines[index + 1]?.trim() || '';
    if (new RegExp(`^[A-Za-z .'-]+,?\\s+[A-Z]{2}\\s+${ZIP}$`).test(next)) text += `, ${next}`;
    const query = cleanQuery(text);
    if (streetAddress.test(query) && !unsafe.test(query)) found.push(query);
  }
  return found;
}

/**
 * A company's offices: the signature addresses across its emails, one map per street address,
 * most often written first. Spelling variants of one address ("4 th Floor", "4th Floor") count
 * together and the commonest spelling is the one shown.
 */
export function officeLocations(bodies: string[]): MapPlace[] {
  const offices = new Map<string, Map<string, number>>();
  for (const body of bodies)
    for (const query of signatureAddresses(body)) {
      // The street plus its city and state: one street name in two cities is two offices.
      // The city is read after the street, so "West Virginia Avenue" is never a locality.
      const street = streetAddress.exec(query)!;
      const place = new RegExp(cityState.source).exec(query.slice(street.index + street[0].length));
      const locality = place ? `${place[1].toLowerCase()},${stateCode(place[2])}` : '';
      const identity = `${street[0].toLowerCase().replace(/[.,]/g, '')}|${locality}`;
      const spellings = offices.get(identity) ?? new Map<string, number>();
      spellings.set(query, (spellings.get(query) ?? 0) + 1);
      offices.set(identity, spellings);
    }
  return [...offices.values()]
    .map((spellings) => {
      const ranked = [...spellings].sort((a, b) => b[1] - a[1]);
      return { query: ranked[0][0], total: ranked.reduce((sum, [, count]) => sum + count, 0) };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX_MAPS)
    .map(({ query }) => placeMap(query, 'Office'));
}
