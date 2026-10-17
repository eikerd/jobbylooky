/**
 * Clients: the end client behind a posting, known by its fingerprint — the set of cities the
 * posting names. A pitch rarely says who the client is, but a client lists the same offices
 * every time, so once the owner has asked a recruiter and been told, that city set names the
 * client on every later posting that carries it.
 *
 * Mirrors src/app/clients.ts, which reads the cities out of a pitch's location and matches
 * them as the page renders. The server keeps only what the page has already parsed.
 */

/** One city never identifies a client: Dallas is everyone's. */
export const MIN_CITIES = 2;
export const NAME_LENGTH = { min: 1, max: 80 };
/** "Plano, TX": a city and a two-letter state, as the page writes them. */
const city = /^[A-Za-z][A-Za-z .'’-]{0,60}, [A-Z]{2}$/;

/** One key for one set of cities, whatever their order, case or spacing. */
export function fingerprintKey(cities) {
  return [...new Set(cities.map((name) => name.replace(/\s+/g, ' ').trim().toLowerCase()))].sort().join(' | ');
}

const bad = (message) => Object.assign(new Error(message), { status: 400 });

/** The name and cities a client is saved with, or a 400 saying what is wrong with them. */
export function cleanClient(input) {
  const name = String(input?.name ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < NAME_LENGTH.min || name.length > NAME_LENGTH.max)
    throw bad(`A client name is ${NAME_LENGTH.min}–${NAME_LENGTH.max} characters.`);
  const raw = Array.isArray(input?.cities) ? input.cities : [];
  const seen = new Set();
  const cities = [];
  for (const entry of raw) {
    const text = String(entry ?? '').replace(/\s+/g, ' ').trim();
    if (!city.test(text)) throw bad('Each city is written "City, ST".');
    if (seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    cities.push(text);
  }
  if (cities.length < MIN_CITIES) throw bad(`A fingerprint is at least ${MIN_CITIES} cities.`);
  return { name, cities };
}
