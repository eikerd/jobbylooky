import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapLocations } from '../src/app/location-map.ts';

test('city and remote locations do not create address thumbnails', () => {
  for (const location of ['Remote', 'Remote (US)', 'Not stated', 'Westlake, Texas', 'Dallas, TX, Salt Lake City, UT', 'Plano (Hybrid 3 days onsite)', '{JobPosting: city}, Texas']) {
    assert.deepEqual(mapLocations(location), []);
  }
});
test('street addresses use fixed encoded Google URLs and two map views', () => {
  const map = mapLocations('815 Kirkley Blvd, Belton, TX 76513')[0];
  assert.equal(new URL(map.embed).searchParams.get('t'), 'k');
  assert.equal(new URL(map.streetMap).searchParams.get('t'), 'm');
  assert.equal(new URL(map.link).searchParams.get('query'), map.query);
  assert.equal(map.source, 'Job location');
  assert.deepEqual(mapLocations('815 Kirkley Blvd <script>'), []);
});
test('retains workplace addresses in parentheses', () => {
  assert.equal(mapLocations('Plano (8181 Communications Pkwy Bldg B): 5 days onsite')[0].query, '8181 Communications Pkwy Bldg B, Plano');
});
test('incidental email addresses are distinct from a verified workplace', () => {
  const result = mapLocations('Remote', 'Thanks\nRecruiter\n123 Main Street\nDallas, TX 75201');
  assert.equal(result[0].query, '123 Main Street, Dallas, TX 75201');
  assert.equal(result[0].source, 'Address in email');
  assert.equal(mapLocations('123 Main Street, Dallas, TX', 'Office: 123 Main Street, Dallas, TX').length, 1);
});
