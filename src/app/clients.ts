/**
 * Clients: the end client behind a posting, known by its fingerprint — the set of cities the
 * posting names. A pitch rarely says who the client is, but a client lists the same offices
 * every time, so once the owner has asked a recruiter and been told, that city set names the
 * client on every later posting that carries it. Mirrors server/clients.mjs.
 */
import { isNorthTexas, mapLocations, stateCode } from './location-map.ts';
import { senderIdentity } from './profiles.ts';
import type { Client, Opportunity } from './models';

export type { Client };

/** A set of cities seen on pitches, with the client it is known as, if any. */
export interface FingerprintRow {
  key: string;
  cities: string[];
  /** Newest first. */
  pitches: Opportunity[];
  /** How many different senders pitched it: several recruiters, one set, is one client. */
  recruiters: number;
  lastSeen: string;
  client: Client | null;
}

export type FingerprintColumn = 'client' | 'cities' | 'pitches' | 'recruiters' | 'lastSeen';

/** One city never identifies a client: Dallas is everyone's. */
export const MIN_CITIES = 2;

/** "Durham, North Carolina 27701" → "Durham, NC": one spelling for one city, whichever the pitch used. */
function cityName(query: string) {
  const comma = query.lastIndexOf(',');
  const city = query.slice(0, comma).replace(/\s+/g, ' ').trim();
  return `${city}, ${stateCode(query.slice(comma + 1).replace(/\d{5}(?:-\d{4})?/, ''))}`;
}

/** "Pittsburgh PA or Dallas, TX": each side of an "or", a slash or a bar is its own place. */
const either = /\s+(?:or|and)\s+|\s*[/|;]\s*/i;

/**
 * The cities a posting's location names, each once, in the order written. A street address
 * is one office, not a fingerprint, and "Remote" names nowhere.
 */
export function pitchCities(location: string): string[] {
  const seen = new Set<string>();
  const cities: string[] = [];
  for (const place of location.split(either).flatMap((part) => mapLocations(part))) {
    if (/\d/.test(place.query) || !place.query.includes(',')) continue;
    const name = cityName(place.query);
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    cities.push(name);
  }
  return cities;
}

/** One key for one set of cities, whatever their order, case or spacing. */
export function fingerprintKey(cities: string[]) {
  return [...new Set(cities.map((name) => name.replace(/\s+/g, ' ').trim().toLowerCase()))].sort().join(' | ');
}

/** The fingerprint a pitch carries, or null when its location names fewer than two cities. */
export function pitchFingerprint(row: Pick<Opportunity, 'location'>) {
  const cities = pitchCities(row.location || '');
  return cities.length >= MIN_CITIES ? { key: fingerprintKey(cities), cities } : null;
}

const newestFirst = (a: Opportunity, b: Opportunity) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt);

/**
 * Every set of two or more cities any pitch names, and every saved client, one row each: the
 * owner's job is to name the sets that have no client yet. A client with no pitch left is
 * still a row, so it can be removed.
 */
export function fingerprintRows(rows: Opportunity[], clients: Client[]): FingerprintRow[] {
  const byKey = new Map<string, FingerprintRow>();
  for (const client of clients)
    byKey.set(fingerprintKey(client.cities), { key: fingerprintKey(client.cities), cities: client.cities, pitches: [], recruiters: 0, lastSeen: '', client });
  for (const row of rows) {
    const print = pitchFingerprint(row);
    if (!print) continue;
    const entry = byKey.get(print.key) ?? { ...print, pitches: [], recruiters: 0, lastSeen: '', client: null };
    byKey.set(print.key, { ...entry, pitches: [...entry.pitches, row].sort(newestFirst), lastSeen: row.receivedAt > entry.lastSeen ? row.receivedAt : entry.lastSeen });
  }
  return [...byKey.values()].map((row) => ({ ...row, recruiters: new Set(row.pitches.map((pitch) => senderIdentity(pitch.from, pitch.id).id)).size }));
}

/** The client each pitch is known to be for, by its id; pitches with no known fingerprint are absent. */
export function clientsByPitch(rows: Opportunity[], clients: Client[]): ReadonlyMap<string, Client> {
  const known = new Map(clients.map((client) => [fingerprintKey(client.cities), client]));
  const result = new Map<string, Client>();
  for (const row of rows) {
    const client = known.get(pitchFingerprint(row)?.key ?? '');
    if (client) result.set(row.id, client);
  }
  return result;
}

/**
 * What a pitch calls its client: the name and the local office, "Chase Plano", because the
 * owner cares about the version of a multi-city client that is near Dallas (the owner,
 * 2026-10-17). The bare name when none of its cities is local.
 */
export function clientLabel(client: Pick<Client, 'name' | 'cities'>) {
  const local = client.cities.find((city) => isNorthTexas(city));
  return local ? `${client.name} ${local.slice(0, local.lastIndexOf(','))}` : client.name;
}

const compareText = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' });

/** Sorted by one column; a row with nothing in that column sorts last whichever way. */
export function sortFingerprints(rows: FingerprintRow[], column: FingerprintColumn, descending: boolean): FingerprintRow[] {
  const empty = (row: FingerprintRow) => (column === 'client' ? !row.client : column === 'lastSeen' ? !row.lastSeen : false);
  const compare = (a: FingerprintRow, b: FingerprintRow) => {
    switch (column) {
      case 'client': return compareText(a.client?.name ?? '', b.client?.name ?? '');
      case 'cities': return compareText(a.cities.join(', '), b.cities.join(', '));
      case 'pitches': return a.pitches.length - b.pitches.length;
      case 'recruiters': return a.recruiters - b.recruiters;
      case 'lastSeen': return Date.parse(a.lastSeen) - Date.parse(b.lastSeen);
    }
  };
  return [...rows].sort((a, b) => {
    if (empty(a) !== empty(b)) return empty(a) ? 1 : -1;
    return (descending ? -compare(a, b) : compare(a, b)) || compareText(a.key, b.key);
  });
}
