import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientLabel, clientsByPitch, fingerprintKey, fingerprintRows, pitchCities, pitchFingerprint, sortFingerprints, type Client } from '../src/app/clients.ts';
import type { Opportunity } from '../src/app/models.ts';

const pitch = (id: string, location: string, receivedAt = '2026-10-10T12:00:00Z', from = 'Pat <pat@agency.example>') =>
  ({ id, location, receivedAt, from, title: 'Angular Developer', company: 'Not stated', status: 'New' }) as Opportunity;
const fidelity: Client = { id: 'c1', name: 'Fidelity', cities: ['Westlake, TX', 'Merrimack, NH', 'Smithfield, RI'], addedAt: '2026-10-01T00:00:00Z' };

test('the cities a location names, each once, however the pitch wrote them', () => {
  assert.deepEqual(pitchCities('Charlotte, NC/ Iselin, NJ/ Irving, TX (Hybrid Onsite)'), ['Charlotte, NC', 'Iselin, NJ', 'Irving, TX']);
  assert.deepEqual(pitchCities('Pittsburgh, PA || Dallas, TX || Cleveland, OH || Miamisburg, OH (Onsite)'), ['Pittsburgh, PA', 'Dallas, TX', 'Cleveland, OH', 'Miamisburg, OH']);
  assert.deepEqual(pitchCities('Irving TX, Charlotte NC, Minneapolis MN, Chandler AZ – Hybrid'), ['Irving, TX', 'Charlotte, NC', 'Minneapolis, MN', 'Chandler, AZ']);
  assert.deepEqual(pitchCities('Durham, North Carolina (Locals Only with NC DL)'), ['Durham, NC']);
  assert.deepEqual(pitchCities('Dallas, TX 75201 or Dallas, Texas'), ['Dallas, TX']);
  assert.deepEqual(pitchCities('Plano'), ['Plano, TX']);
  assert.deepEqual(pitchCities('Pittsburgh PA or Dallas, TX, Strongsville OH or Denver, CO'), ['Pittsburgh, PA', 'Dallas, TX', 'Strongsville, OH', 'Denver, CO']);
  assert.deepEqual(pitchCities('Malvern, PA OR Charlotte, NC OR Dallas, TX'), ['Malvern, PA', 'Charlotte, NC', 'Dallas, TX']);
  assert.deepEqual(pitchCities('Plano or Frisco'), ['Plano, TX', 'Frisco, TX']);
  assert.deepEqual(pitchCities('Boston, MA or Minneapolis, MN'), ['Boston, MA', 'Minneapolis, MN']);
});

test('remote, unknown, template and street-address locations name no city set', () => {
  for (const location of ['Remote', 'Not stated', '', '{JobPosting : city}, Texas', '5000 Legacy Dr, Plano, TX', 'Remote – (East coast Only, Preferred Miami, FL)'])
    assert.deepEqual(pitchCities(location), [], location);
  // An address in parentheses is the office; the city before it is still the city.
  assert.deepEqual(pitchCities('Plano, TX (5000 Legacy Dr)'), ['Plano, TX']);
});

test('every city counts, past the five the maps show, and work-mode words are not a city (Codex, PR #30)', () => {
  const six = 'Plano, TX, Raleigh, NC, Reston, VA, Richardson, TX, Tempe, AZ, Columbus, OH';
  assert.deepEqual(pitchCities(six), ['Plano, TX', 'Raleigh, NC', 'Reston, VA', 'Richardson, TX', 'Tempe, AZ', 'Columbus, OH']);
  assert.notEqual(pitchFingerprint(pitch('a', six))?.key, pitchFingerprint(pitch('b', six.replace(', Columbus, OH', ', Boise, ID')))?.key);
  assert.deepEqual(pitchCities('Onsite in Dallas, TX / Charlotte, NC'), ['Dallas, TX', 'Charlotte, NC']);
  assert.equal(pitchFingerprint(pitch('a', 'Onsite in Dallas, TX / Charlotte, NC'))?.key, pitchFingerprint(pitch('b', 'Dallas, TX / Charlotte, NC'))?.key);
  assert.deepEqual(pitchCities('Hybrid – Downtown Dallas, TX and Fort Worth, TX'), ['Dallas, TX', 'Fort Worth, TX']);
});

test('a ZIP does not hide a city, and a preference in parentheses is not a city set (Greptile, PR #30)', () => {
  assert.deepEqual(pitchCities('Plano, TX 75024 / Charlotte, NC 28202'), ['Plano, TX', 'Charlotte, NC']);
  assert.equal(pitchFingerprint(pitch('a', 'Plano, TX 75024 / Charlotte, NC 28202'))?.key, pitchFingerprint(pitch('b', 'Charlotte, NC, Plano, TX'))?.key);
  assert.deepEqual(pitchCities('Remote (Miami, FL and Tampa, FL)'), []);
  assert.deepEqual(pitchCities('Remote [Boston, MA or Austin, TX preferred]'), []);
});

test('a state written "Ma" still counts, but a word like "Or" is never a state (Codex, PR #30)', () => {
  assert.deepEqual(pitchCities('Boston, Ma / Minneapolis, MN'), ['Boston, MA', 'Minneapolis, MN']);
  assert.deepEqual(pitchCities('Plano, Tx 75024, Charlotte, Nc'), ['Plano, TX', 'Charlotte, NC']);
  // "Or" is a word, not Oregon: Dallas falls back to the metroplex rule, Denver names nothing.
  assert.deepEqual(pitchCities('Dallas, Or Remote'), ['Dallas, TX']);
  assert.deepEqual(pitchCities('Denver, Or Remote'), []);
  assert.deepEqual(pitchCities('Plano, TX Or Frisco, TX'), ['Plano, TX', 'Frisco, TX']);
  assert.deepEqual(pitchCities('Chicago, Il or Dallas, Tx'), ['Chicago, IL', 'Dallas, TX']);
});

test('a fingerprint is two or more cities, keyed without regard to order or case', () => {
  assert.equal(pitchFingerprint(pitch('a', 'Dallas, TX')), null);
  assert.equal(pitchFingerprint(pitch('a', 'Remote')), null);
  const print = pitchFingerprint(pitch('a', 'Seattle, WA, Plano, TX, Charlotte, NC'));
  assert.deepEqual(print?.cities, ['Seattle, WA', 'Plano, TX', 'Charlotte, NC']);
  assert.equal(print?.key, fingerprintKey(['charlotte, nc', 'PLANO, TX', 'Seattle,  WA']));
});

test('rows: one per city set, pitches newest first, a saved client named, an empty client kept', () => {
  const rows = fingerprintRows(
    [
      pitch('old', 'Plano, TX / Charlotte, NC (Hybrid)', '2026-10-01T12:00:00Z'),
      pitch('new', 'Charlotte, NC, Plano, TX', '2026-10-09T12:00:00Z', 'Sam <sam@other.example>'),
      pitch('fid', 'Merrimack, NH, Westlake, TX, Smithfield, RI'),
      pitch('one', 'Dallas, TX'),
    ],
    [fidelity, { id: 'c2', name: 'Nobody', cities: ['Boise, ID', 'Reno, NV'], addedAt: '2026-10-01T00:00:00Z' }],
  );
  assert.equal(rows.length, 3);
  const plano = rows.find((row) => row.pitches.some((item) => item.id === 'new'))!;
  assert.deepEqual(plano.pitches.map((item) => item.id), ['new', 'old']);
  assert.equal(plano.lastSeen, '2026-10-09T12:00:00Z');
  assert.deepEqual(plano.cities, ['Plano, TX', 'Charlotte, NC']);
  assert.equal(plano.client, null);
  assert.equal(plano.recruiters, 2);
  const fid = rows.find((row) => row.client?.name === 'Fidelity')!;
  assert.equal(fid.pitches[0].id, 'fid');
  assert.equal(fid.recruiters, 1);
  const nobody = rows.find((row) => row.client?.name === 'Nobody')!;
  assert.deepEqual(nobody.pitches, []);
  assert.equal(nobody.recruiters, 0);
});

test('a pitch is the client whose cities it names exactly, never a subset or superset', () => {
  const known = clientsByPitch(
    [
      pitch('exact', 'Smithfield, RI | Westlake, TX | Merrimack, NH'),
      pitch('subset', 'Westlake, TX, Merrimack, NH'),
      pitch('superset', 'Westlake, TX, Merrimack, NH, Smithfield, RI, Boston, MA'),
      pitch('remote', 'Remote'),
    ],
    [fidelity],
  );
  assert.deepEqual([...known.keys()], ['exact']);
  assert.equal(known.get('exact')?.name, 'Fidelity');
});

test('sorting by any column, empty client or date last both ways', () => {
  const rows = fingerprintRows(
    [
      pitch('a', 'Plano, TX, Charlotte, NC', '2026-10-09T12:00:00Z'),
      pitch('b', 'Plano, TX, Charlotte, NC', '2026-10-08T12:00:00Z', 'Sam <sam@other.example>'),
      pitch('c', 'Westlake, TX, Merrimack, NH, Smithfield, RI', '2026-10-05T12:00:00Z'),
      pitch('d', 'Austin, TX, Boston, MA', '2026-10-07T12:00:00Z'),
    ],
    [fidelity, { id: 'c2', name: 'Aardvark', cities: ['Boise, ID', 'Reno, NV'], addedAt: '2026-10-01T00:00:00Z' }],
  );
  const names = (sorted: typeof rows) => sorted.map((row) => row.client?.name ?? row.cities[0]);
  assert.deepEqual(names(sortFingerprints(rows, 'client', false)), ['Aardvark', 'Fidelity', 'Austin, TX', 'Plano, TX']);
  assert.deepEqual(names(sortFingerprints(rows, 'client', true)), ['Fidelity', 'Aardvark', 'Austin, TX', 'Plano, TX']);
  assert.deepEqual(names(sortFingerprints(rows, 'pitches', true)), ['Plano, TX', 'Austin, TX', 'Fidelity', 'Aardvark']);
  assert.deepEqual(names(sortFingerprints(rows, 'recruiters', false)), ['Aardvark', 'Austin, TX', 'Fidelity', 'Plano, TX']);
  assert.deepEqual(names(sortFingerprints(rows, 'lastSeen', true)), ['Plano, TX', 'Austin, TX', 'Fidelity', 'Aardvark']);
  assert.deepEqual(names(sortFingerprints(rows, 'lastSeen', false)), ['Fidelity', 'Austin, TX', 'Plano, TX', 'Aardvark']);
  assert.deepEqual(names(sortFingerprints(rows, 'cities', false)), ['Austin, TX', 'Aardvark', 'Plano, TX', 'Fidelity']);
});

test('a pitch calls a multi-city client by its local office, or by its name alone', () => {
  assert.equal(clientLabel({ name: 'Chase', cities: ['Columbus, OH', 'Plano, TX', 'Pittsburgh, PA'] }), 'Chase Plano');
  assert.equal(clientLabel({ name: 'Chase', cities: ['Columbus, OH', 'Pittsburgh, PA'] }), 'Chase');
  assert.equal(clientLabel(fidelity), 'Fidelity Westlake');
  assert.equal(clientLabel({ name: 'Toyota', cities: ['Fort Worth, TX', 'Plano, TX'] }), 'Toyota Fort Worth');
});
