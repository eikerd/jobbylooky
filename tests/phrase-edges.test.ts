import { test } from 'node:test';
import assert from 'node:assert/strict';
import { widenEnd, widenStart } from '../src/app/phrase-edges.ts';
import { phrasePattern } from '../server/screen.mjs';

/** The phrase a drag from `from` to `to` in `text` becomes, trimmed as the modal trims it. */
const picked = (text: string, from: number, to: number) => text.slice(widenStart(text, from), widenEnd(text, to)).trim();
const drag = (text: string, selected: string) => {
  const from = text.indexOf(selected);
  return picked(text, from, from + selected.length);
};

test('a drag that starts or ends mid-word becomes whole words', () => {
  const text = 'We have a full-time permanent role for a Senior Angular Developer';
  assert.equal(drag(text, 'me permanent role for a S'), 'time permanent role for a Senior');
});
test('a punctuated edge that touches a word is widened to it', () => {
  assert.equal(drag('Strong ASP.NET skills', '.NET'), 'ASP.NET');
  assert.equal(drag('Seeking a C#Developer now', 'C#'), 'C#Developer');
});
test('whitespace at an edge is trimmed, never widened into the neighbouring word', () => {
  assert.equal(drag('a Java role', ' Java '), 'Java');
  assert.equal(drag('Remote only', 'Remote '), 'Remote');
});
test('whatever the drag, the saved phrase matches the text it was picked from', () => {
  const text = 'Strong ASP.NET and C#Developer skills, full-time permanent role (Node.js)';
  for (const selected of ['.NET', 'SP.NE', 'C#', 'me perm', 'Node.', '(Node', 'll-ti']) {
    const phrase = drag(text, selected);
    assert.ok(phrasePattern(phrase).test(text), `“${selected}” became “${phrase}”, which does not match`);
  }
});
