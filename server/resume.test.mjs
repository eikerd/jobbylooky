import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, utimesSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { latestResume } from './resume.mjs';

test('picks the most recently modified resume and ignores other files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'resume-'));
  for (const [name, seconds] of [['old.pdf', 1000], ['new.docx', 3000], ['notes.txt', 9000], ['.hidden.pdf', 9000]]) {
    writeFileSync(join(dir, name), 'x');
    utimesSync(join(dir, name), seconds, seconds);
  }
  mkdirSync(join(dir, 'folder.pdf'));
  const latest = latestResume(dir);
  assert.equal(latest.name, 'new.docx');
  assert.equal(latest.path, join(dir, 'new.docx'));
});

test('a missing or empty folder means no resume', () => {
  assert.equal(latestResume(join(tmpdir(), 'no-such-resume-folder')), null);
  assert.equal(latestResume(mkdtempSync(join(tmpdir(), 'resume-'))), null);
});

test('a dangling link in the folder is skipped rather than failing the lookup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'resume-'));
  writeFileSync(join(dir, 'real.pdf'), 'x');
  symlinkSync(join(dir, 'gone.pdf'), join(dir, 'broken.pdf'));
  assert.equal(latestResume(dir).name, 'real.pdf');
});
