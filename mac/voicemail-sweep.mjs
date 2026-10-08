#!/usr/bin/env node
// Pushes the Mac's voicemails that belong to Jobbylooky pitches. Run by the noon/midnight
// Claude routine; see mac/README.md.
//
//   node mac/voicemail-sweep.mjs sweep [--days 183]
//       Exports voicemails (via the JobbyVoicemail helper), pushes every one whose caller's
//       number appears in a pitch, and writes candidates.json: unmatched, not yet reviewed
//       voicemails that sound like a job, for Claude to judge by name or company.
//   node mac/voicemail-sweep.mjs link VOICEMAIL_ID PITCH_ID "why"
//       Pushes a voicemail Claude matched by name/company; shown in Jobby as a likely match.
//   node mac/voicemail-sweep.mjs dismiss VOICEMAIL_ID...
//       Marks candidates Claude judged unrelated, so they are not offered again.
//
// Only matched voicemails ever leave the Mac; the rest stay in the helper's folder.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeNumber } from '../server/voicemails.mjs';

const BASE = (process.env.JOBBY_URL || 'https://chungus.tail1d505c.ts.net/jobby').replace(/\/$/, '');
const OUT = join(homedir(), 'Library/Application Support/JobbyVoicemail');
const RUN = fileURLToPath(new URL('./voicemail-helper/run.sh', import.meta.url));
const STATE = join(OUT, 'sweep-state.json');
// The owner, 2026-10-08: "only go back 6 months".
const DEFAULT_DAYS = 183;
const JOB_WORDS = /\b(position|role|opportunit\w*|resume|recruit\w*|developer|engineer|angular|front[- ]?end|full[- ]?stack|contract|w-?2|c2c|end client|requirement|interview|staffing|job)\b/i;

// Most voicemails here are loan robocalls that also say "opportunity"; they never reach Claude.
const SPAM_WORDS = /\b(loan|financing|pre-?approv\w*|credit (card|score)|debt|apr|interest rate|monthly payment|car warranty|medicare)\b/i;
const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback);
const state = readJson(STATE, { reviewed: {} });
const saveState = () => writeFileSync(STATE, JSON.stringify(state, null, 2), { mode: 0o600 });

function helper(...args) {
  execFileSync(RUN, args, { stdio: ['ignore', 'ignore', 'inherit'] });
}

async function api(path, init = {}) {
  const response = await fetch(`${BASE}/api/${path}`, { ...init, signal: AbortSignal.timeout(60000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method || 'GET'} ${path}: HTTP ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

function exportVoicemails(days) {
  helper('export', '--days', String(days));
  return readJson(join(OUT, 'voicemails.json'), { voicemails: [] });
}

/** Pushes voicemails with their matches, then their audio. Returns how many were pushed. */
async function push(entries, known) {
  const needAudio = entries.filter(({ voicemail }) => voicemail.hasAudio && !known.get(voicemail.id)?.audio);
  if (needAudio.length) helper('audio', ...needAudio.map(({ voicemail }) => voicemail.id));
  const audio = readJson(join(OUT, 'audio.json'), { files: {} }).files;
  for (const { voicemail, matches } of entries) {
    const { id, from, receivedAt, durationSeconds, kind, transcript, transcriptSource } = voicemail;
    await api('voicemails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, from, receivedAt, durationSeconds, kind, transcript, transcriptSource, matches }),
    });
    if (audio[id]) {
      await api(`voicemails/${id}/audio`, { method: 'PUT', headers: { 'Content-Type': 'audio/mp4' }, body: readFileSync(audio[id]) });
    }
  }
  return entries.length;
}

async function sweep(days) {
  const { voicemails } = exportVoicemails(days);
  const index = await api('voicemails/index');
  const known = new Map(index.voicemails.map((row) => [row.id, row]));
  const byNumber = new Map();
  for (const pitch of index.pitches)
    for (const phone of pitch.phones) byNumber.set(phone, [...(byNumber.get(phone) ?? []), pitch.id]);

  const toPush = [];
  const candidates = [];
  for (const voicemail of voicemails) {
    const pitchIds = byNumber.get(normalizeNumber(voicemail.from)) ?? [];
    const pushed = new Set(known.get(voicemail.id)?.pitchIds ?? []);
    const fresh = pitchIds.filter((id) => !pushed.has(id));
    if (fresh.length) toPush.push({ voicemail, matches: fresh.map((pitchId) => ({ pitchId, by: 'number' })) });
    else if (!pitchIds.length && !known.has(voicemail.id) && !state.reviewed[voicemail.id] && JOB_WORDS.test(voicemail.transcript ?? '') && !SPAM_WORDS.test(voicemail.transcript ?? ''))
      candidates.push(voicemail);
  }
  const pushed = await push(toPush, known);
  writeFileSync(
    join(OUT, 'candidates.json'),
    JSON.stringify({
      candidates: candidates.map(({ id, from, receivedAt, durationSeconds, transcript }) => ({ id, from, receivedAt, durationSeconds, transcript })),
      pitches: index.pitches.map(({ id, title, company, from, status, receivedAt }) => ({ id, title, company, from, status, receivedAt })),
    }, null, 2),
    { mode: 0o600 },
  );
  state.lastSweepAt = new Date().toISOString();
  saveState();
  return { voicemails: voicemails.length, pushedByNumber: pushed, candidates: candidates.length, candidatesFile: join(OUT, 'candidates.json') };
}

async function link(voicemailId, pitchId, note) {
  if (!voicemailId || !pitchId || !note) throw new Error('Usage: link VOICEMAIL_ID PITCH_ID "why it matches"');
  const { voicemails } = readJson(join(OUT, 'voicemails.json'), { voicemails: [] });
  const voicemail = voicemails.find((row) => row.id === voicemailId);
  if (!voicemail) throw new Error(`Voicemail ${voicemailId} is not in the last export; run sweep first.`);
  const index = await api('voicemails/index');
  const known = new Map(index.voicemails.map((row) => [row.id, row]));
  await push([{ voicemail, matches: [{ pitchId, by: 'name', note: note.slice(0, 300) }] }], known);
  state.reviewed[voicemailId] = 'linked';
  saveState();
  return { linked: voicemailId, pitchId };
}

function dismiss(ids) {
  for (const id of ids) state.reviewed[id] = 'dismissed';
  saveState();
  return { dismissed: ids.length };
}

const [command = 'sweep', ...rest] = process.argv.slice(2);
const daysAt = rest.indexOf('--days');
try {
  const result =
    command === 'sweep' ? await sweep(daysAt >= 0 ? Number(rest[daysAt + 1]) : DEFAULT_DAYS)
    : command === 'link' ? await link(rest[0], rest[1], rest[2])
    : command === 'dismiss' ? dismiss(rest)
    : (() => { throw new Error(`Unknown command ${command}.`); })();
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
