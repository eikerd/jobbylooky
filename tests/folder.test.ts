import { test } from 'node:test';
import assert from 'node:assert/strict';
import { folderRows } from '../src/app/folder.ts';

const pitch = (id: string, receivedAt: string, extra = {}) => ({ id, status: 'Pursue', receivedAt, ...extra });
const group = (...pitches: object[]) => ({ id: (pitches[0] as { id: string }).id, pitches }) as never;

test('a folder lists jobs newest first, an unseen voicemail does not jump the queue', () => {
  const rows = folderRows(
    [
      group(pitch('old-voicemail', '2026-10-01T10:00:00Z', { voicemailUnseen: true })),
      group(pitch('today', '2026-11-05T10:00:00Z')),
      group(pitch('mid', '2026-10-20T10:00:00Z', { voicemailUnseen: true })),
      group(pitch('yesterday', '2026-11-04T10:00:00Z')),
    ],
    'Pursuing',
  );
  assert.deepEqual(rows.map((row) => row.representative.id), ['today', 'yesterday', 'mid', 'old-voicemail']);
});

test('a job is placed by its newest pitch in that folder, not an older match or another folder\'s pitch', () => {
  const rows = folderRows(
    [
      group(
        pitch('a-new', '2026-11-05T10:00:00Z', { status: 'New' }),
        pitch('a-pursue', '2026-10-01T10:00:00Z'),
        pitch('a-older', '2026-09-01T10:00:00Z', { status: 'Applied' }),
      ),
      group(pitch('b-pursue', '2026-10-15T10:00:00Z')),
    ],
    'Pursuing',
  );
  assert.deepEqual(rows.map((row) => row.representative.id), ['b-pursue', 'a-pursue']);
});
