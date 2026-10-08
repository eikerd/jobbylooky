import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Voicemails pushed from the owner's Mac (mac/voicemail-sweep.mjs), each tied to the pitches
// it belongs to. Kept apart from opportunities.json: the mail sync rewrites that file often,
// and voicemails are only ever added by the sweep.

const ID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const KINDS = ['voicemail', 'live'];
const SOURCES = ['apple', 'local', null];
const MATCHED_BY = ['number', 'name'];

/** North American numbers in text, as 10 digits. Recruiter signatures are where they live. */
export function phoneNumbers(text) {
  const found = new Set();
  for (const match of String(text ?? '').matchAll(/(?:\+?1[\s.-]?)?\(?\b([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/g))
    found.add(match[1] + match[2] + match[3]);
  return [...found];
}

/** A caller ID such as "+15028900699" as 10 digits, or '' when it is not a NANP number. */
export function normalizeNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return /^[2-9]\d{9}$/.test(ten) ? ten : '';
}

const invalid = (message) => Object.assign(new Error(message), { status: 400 });

function validVoicemail(input, pitchExists) {
  if (!input || typeof input !== 'object') throw invalid('A voicemail is an object.');
  const { id, from, receivedAt, durationSeconds, kind, transcript, transcriptSource, matches } = input;
  if (typeof id !== 'string' || !ID.test(id)) throw invalid('A voicemail needs its UUID id.');
  if (typeof from !== 'string' || from.length > 40) throw invalid('Invalid caller.');
  if (typeof receivedAt !== 'string' || Number.isNaN(Date.parse(receivedAt))) throw invalid('Invalid receivedAt.');
  if (typeof durationSeconds !== 'number' || !(durationSeconds >= 0 && durationSeconds <= 3600)) throw invalid('Invalid duration.');
  if (!KINDS.includes(kind)) throw invalid('Invalid voicemail kind.');
  if (!(transcript === null || (typeof transcript === 'string' && transcript.length <= 20000))) throw invalid('Invalid transcript.');
  if (!SOURCES.includes(transcriptSource ?? null)) throw invalid('Invalid transcript source.');
  if (!Array.isArray(matches) || !matches.length || matches.length > 20) throw invalid('A voicemail needs 1–20 matching pitches.');
  for (const match of matches) {
    if (typeof match?.pitchId !== 'string' || !pitchExists(match.pitchId)) throw invalid(`Unknown pitch ${match?.pitchId}.`);
    if (!MATCHED_BY.includes(match.by)) throw invalid('A match is by number or by name.');
    if (match.note !== undefined && (typeof match.note !== 'string' || match.note.length > 300)) throw invalid('Invalid match note.');
  }
  return {
    id,
    from,
    receivedAt: new Date(Date.parse(receivedAt)).toISOString(),
    durationSeconds,
    kind,
    transcript: transcript || null,
    transcriptSource: transcript ? transcriptSource : null,
    matches: matches.map(({ pitchId, by, note }) => (note ? { pitchId, by, note } : { pitchId, by })),
  };
}

export function createVoicemails(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'voicemails.json');
  const audioDir = join(directory, 'voicemail-audio');
  let voicemails = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).voicemails : [];
  function commit(next) {
    writeFileSync(`${path}.tmp`, JSON.stringify({ voicemails: next }, null, 2), { mode: 0o600 });
    renameSync(`${path}.tmp`, path);
    voicemails = next;
  }
  const audioPath = (id) => join(audioDir, `${id}.m4a`);
  return {
    list: () => structuredClone(voicemails),
    /**
     * Adds a voicemail, or adds pitches to one already known. A new pitch match pins it again;
     * matches already seen stay seen. Never removes a match.
     */
    upsert(input, pitchExists) {
      const incoming = validVoicemail(input, pitchExists);
      const existing = voicemails.find((row) => row.id === incoming.id);
      if (!existing) {
        commit([...voicemails, { ...incoming, seen: false, audio: false, addedAt: new Date().toISOString() }]);
        return structuredClone(voicemails.at(-1));
      }
      const known = new Set(existing.matches.map((match) => match.pitchId));
      const added = incoming.matches.filter((match) => !known.has(match.pitchId));
      const updated = {
        ...existing,
        transcript: existing.transcript ?? incoming.transcript,
        transcriptSource: existing.transcript ? existing.transcriptSource : incoming.transcriptSource,
        matches: [...existing.matches, ...added],
        seen: added.length ? false : existing.seen,
      };
      commit(voicemails.map((row) => (row.id === updated.id ? updated : row)));
      return structuredClone(updated);
    },
    setAudio(id, bytes) {
      if (!voicemails.some((row) => row.id === id)) throw Object.assign(new Error('Voicemail not found.'), { status: 404 });
      if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) throw invalid('Audio must be 1 byte to 10 MB.');
      // An .m4a starts with an ftyp box; anything else is not what the sweep sends.
      if (bytes.subarray(4, 8).toString('latin1') !== 'ftyp') throw invalid('Audio must be an .m4a file.');
      mkdirSync(audioDir, { recursive: true, mode: 0o700 });
      writeFileSync(`${audioPath(id)}.tmp`, bytes, { mode: 0o600 });
      renameSync(`${audioPath(id)}.tmp`, audioPath(id));
      commit(voicemails.map((row) => (row.id === id ? { ...row, audio: true } : row)));
    },
    /** The stored audio file and its size, or null. */
    audioFile(id) {
      if (!ID.test(id) || !voicemails.some((row) => row.id === id && row.audio) || !existsSync(audioPath(id))) return null;
      return { path: audioPath(id), size: statSync(audioPath(id)).size };
    },
    /** Opening a pitch unpins it: its voicemails count as seen. */
    markSeen(pitchId) {
      const touched = voicemails.some((row) => !row.seen && row.matches.some((match) => match.pitchId === pitchId));
      if (touched)
        commit(voicemails.map((row) => (row.matches.some((match) => match.pitchId === pitchId) ? { ...row, seen: true } : row)));
      return touched;
    },
    /** Each pitch with its voicemails (newest first) and whether any is unseen. */
    attach(rows) {
      return rows.map((row) => {
        const own = voicemails
          .filter((voicemail) => voicemail.matches.some((match) => match.pitchId === row.id))
          .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
          .map(({ matches, addedAt, ...voicemail }) => ({
            ...voicemail,
            matchedBy: matches.find((match) => match.pitchId === row.id).by,
            note: matches.find((match) => match.pitchId === row.id).note,
          }));
        return own.length ? { ...row, voicemails: own, voicemailUnseen: own.some((voicemail) => !voicemail.seen) } : row;
      });
    },
  };
}
