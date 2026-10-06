import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapLocations, officeLocations, signatureAddresses, isNorthTexas, zoomFor, STATE_ZOOM } from '../src/app/location-map.ts';

test('remote, unstated and templated locations create no maps', () => {
  for (const location of ['Remote', 'Remote (US)', 'Not stated', '', 'Remote – (East coast Only, Preferred Miami, FL due to client visits)', '{JobPosting : city}, Texas', 'Dallas, TX 75214 - https://cts.indeed.com/v3/abc', 'Hybrid', 'Fully Remote', 'Multiple locations']) {
    assert.deepEqual(mapLocations(location), [], location);
  }
});
test('a city location maps the city, with conditions in parentheses dropped', () => {
  const cases: Record<string, string[]> = {
    'Dallas, TX': ['Dallas, TX'],
    'Whippany, NJ (Hybrid Onsite)': ['Whippany, NJ'],
    'Westlake, Texas (Hybrid 3 days a week onsite)': ['Westlake, Texas'],
    'Plano, TX –(Onsite-Hybrid from Day 1)': ['Plano, TX'],
    'Austin, TX ONSITE (Relocation works)': ['Austin, TX'],
    'Columbus, OH (Onsite) – Relocation is acceptable': ['Columbus, OH'],
    'Durham, North Carolina (Locals Only with NC DL)': ['Durham, North Carolina'],
    'Dallas Metroplex, TX (Hybrid, 3 days onsite)': ['Dallas Metroplex, TX'],
    'Issaquah, WA (3 Days)': ['Issaquah, WA'],
  };
  for (const [location, queries] of Object.entries(cases)) {
    assert.deepEqual(mapLocations(location).map((map) => map.query), queries, location);
    assert.equal(mapLocations(location)[0].source, 'Job location');
  }
});
test('every city in a multi-city location gets its own map', () => {
  const cases: Record<string, string[]> = {
    'Dallas, TX, Salt lake City, UT': ['Dallas, TX', 'Salt lake City, UT'],
    'Frisco, TX or Kansas City, KS (Hybrid)': ['Frisco, TX', 'Kansas City, KS'],
    'Charlotte, NC/ Iselin, NJ/ Irving, TX (Hybrid Onsite)': ['Charlotte, NC', 'Iselin, NJ', 'Irving, TX'],
    'Irving TX, Charlotte NC, Minneapolis MN, Chandler AZ – Hybrid': ['Irving, TX', 'Charlotte, NC', 'Minneapolis, MN', 'Chandler, AZ'],
    'Newark, DE, Plano TX, Charlotte NC': ['Newark, DE', 'Plano, TX', 'Charlotte, NC'],
    'Pittsburgh, PA || Dallas, TX || Cleveland, OH || Miamisburg, OH (Onsite)': ['Pittsburgh, PA', 'Dallas, TX', 'Cleveland, OH', 'Miamisburg, OH'],
    'Boston, MA or Minneapolis, MN': ['Boston, MA', 'Minneapolis, MN'],
    'Richardson, TX / Plano, TX': ['Richardson, TX', 'Plano, TX'],
    'McLean, VA/ Chicago, IL (Hybrid Onsite)': ['McLean, VA', 'Chicago, IL'],
  };
  for (const [location, queries] of Object.entries(cases)) {
    assert.deepEqual(mapLocations(location).map((map) => map.query), queries, location);
  }
  assert.equal(mapLocations('A, TX, B, TX, C, TX, D, TX, E, TX, F, TX').length, 5);
});
test('a metroplex city with no state is the Texas one', () => {
  assert.deepEqual(mapLocations('Plano').map((map) => map.query), ['Plano, TX']);
  assert.deepEqual(mapLocations('Plano (Hybrid 3 days onsite)').map((map) => map.query), ['Plano, TX']);
  assert.deepEqual(mapLocations('Dallas, Tx').map((map) => map.query), ['Dallas, TX']);
});
test('street addresses use a fixed, encoded Google street-map embed', () => {
  const map = mapLocations('815 Kirkley Blvd, Belton, TX 76513')[0];
  assert.equal(map.query, '815 Kirkley Blvd, Belton, TX 76513');
  assert.equal(new URL(map.embed).origin, 'https://maps.google.com');
  assert.equal(new URL(map.embed).searchParams.get('t'), 'm');
  assert.equal(new URL(map.embed).searchParams.get('q'), map.query);
  assert.equal(new URL(map.link).searchParams.get('query'), map.query);
  assert.equal(map.source, 'Job location');
  assert.deepEqual(mapLocations('815 Kirkley Blvd <script>'), []);
});
test('retains workplace addresses in parentheses', () => {
  assert.equal(mapLocations('Plano (8181 Communications Pkwy Bldg B): 5 days onsite')[0].query, '8181 Communications Pkwy Bldg B, Plano');
});
test('North Texas maps at a 10-mile radius and everywhere else at the state', () => {
  for (const place of ['Dallas, TX', 'Plano, TX', 'Fort Worth, TX', 'Westlake, Texas', 'Frisco, TX', 'Irving, TX', 'Dallas Metroplex, TX', 'Plano', '8181 Communications Pkwy Bldg B, Plano', 'Richardson, TX 75080', '100 Main St, Flower Mound, TX 75028']) {
    assert.equal(isNorthTexas(place), true, place);
    assert.equal(zoomFor(place).zoom, 10, place);
    assert.equal(zoomFor(place).region, 'North Texas', place);
  }
  for (const place of ['Austin, TX', 'Houston, TX', 'Arlington, VA', 'Westlake, OH', 'Whippany, NJ', 'Salt lake City, UT', 'Belton, TX 76513', '123 Allen Parkway, Houston, TX 77019', '100 Franklin Square Drive, 4th Floor, Somerset, NJ 08873', '330 Washington St, Hoboken, NJ 07030, United States', '75 Bayly Street West, Ajax, Ontario, L1S7K7, Canada']) {
    assert.equal(isNorthTexas(place), false, place);
    assert.deepEqual(zoomFor(place), STATE_ZOOM, place);
  }
  assert.equal(new URL(mapLocations('Dallas, TX')[0].embed).searchParams.get('z'), '10');
  assert.equal(new URL(mapLocations('Whippany, NJ')[0].embed).searchParams.get('z'), '6');
});
test('addresses in an email are the sender’s office, never the job', () => {
  const signature = 'Thanks\nRecruiter\n100 Franklin Square Drive – 4 th Floor | Somerset, NJ 08873\nwww.example.test';
  assert.deepEqual(mapLocations('Remote'), []);
  assert.deepEqual(signatureAddresses(signature), ['100 Franklin Square Drive – 4 th Floor, Somerset, NJ 08873']);
  assert.deepEqual(signatureAddresses('Thanks\nRecruiter\n123 Main Street\nDallas, TX 75201'), ['123 Main Street, Dallas, TX 75201']);
  assert.deepEqual(signatureAddresses('See https://example.test/123 Main Street\nno address here'), []);
});
test('the job’s own location line is never the sender’s office', () => {
  const body = 'Location: Irving, TX (401 Las Colinas Blvd W Bldg A) – MUST BE LOCAL – ON SITE\nDuration: 12 months\nThanks\n72 Van Reipen Avenue pmb# 255, Jersey City, NJ 07306 |';
  assert.deepEqual(signatureAddresses(body), ['72 Van Reipen Avenue pmb# 255, Jersey City, NJ 07306']);
  assert.deepEqual(signatureAddresses('Client site (8181 Communications Pkwy Bldg B) – 5 days onsite'), ['8181 Communications Pkwy Bldg B']);
  const job = mapLocations('Irving, TX (401 Las Colinas Blvd W Bldg A) – MUST BE LOCAL – ON SITE')[0];
  assert.equal(job.query, '401 Las Colinas Blvd W Bldg A, Irving, TX');
  assert.equal(job.zoom, 10);
});
test('a company’s offices merge spellings of one address and rank by how often it is written', () => {
  const bodies = [
    'Sig\n100 Franklin Square Drive – 4 th Floor | Somerset, NJ 08873',
    'Sig\n100 Franklin Square Drive – 4th Floor | Somerset, NJ 08873',
    'Sig\n100 Franklin Square Drive – 4th Floor | Somerset, NJ 08873',
    'Sig\n72 Van Reipen Avenue pmb# 255, Jersey City, NJ 07306 |',
    'No address at all',
  ];
  const offices = officeLocations(bodies);
  assert.deepEqual(offices.map((office) => office.query), ['100 Franklin Square Drive – 4th Floor, Somerset, NJ 08873', '72 Van Reipen Avenue pmb# 255, Jersey City, NJ 07306']);
  assert.equal(offices[0].source, 'Office');
  assert.equal(offices[0].zoom, 6);
  assert.deepEqual(officeLocations([]), []);
  assert.equal(officeLocations(['100 Main Street, Dallas, TX 75201', '100 Main Street, Austin, TX 78701']).length, 2);
  assert.equal(officeLocations(['1 A St\n2 B St\n3 C St\n4 D St\n5 E St\n6 F St'].map((s) => s.replace(/St/g, 'Street'))).length, 5);
});
