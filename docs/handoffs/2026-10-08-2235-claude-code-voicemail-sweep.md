---
date: 2026-10-08 22:35 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: feat/voicemail-sweep, worked from a temporary clone in the session's scratch folder (the main checkout belonged to another session); branch deleted after merge
pr: https://github.com/eikerd/jobbylooky/pull/17
state: merged (three review rounds, scorecard reports/pr-17.html)
deployed: the Chungus deploy of the merge commit, the first real sweep and the noon/midnight routine follow the merge in this session; results (md5 against origin/main, pushed count, routine id) are in the closing message to the owner
loose_ends: 3 (listed below)
supersedes: none
---

# Recruiter voicemails pinned in Jobbylooky, swept from the Mac at noon and midnight

## What changed, and why

The owner wanted Claude on this Mac to find voicemails that belong to Jobbylooky jobs, pin those jobs with a notification, show transcripts, and sweep twice a day. macOS 26 keeps the Phone app's voicemails in FaceTime's message store behind Full Disk Access. A signed helper app, `JobbyVoicemail.app`, holds that grant and is launched with `open`, so neither Claude nor node needs it. `mac/README.md` has the store layout, the commands, and two SpeechAnalyzer pitfalls: a per-app locale reservation, and results collected in a Task.

- `mac/voicemail-helper/`: exports the last 183 days. It takes Apple's transcript when present, otherwise transcribes on-device (40 per run; failures retried after a week). It converts audio to `.m4a`.
- `mac/voicemail-sweep.mjs`: pushes voicemails whose caller number appears in a pitch's email body, with audio. It writes `candidates.json` (job-sounding, loan spam filtered) for the routine to `link` by name/company or `dismiss`.
- Server: `server/voicemails.mjs` stores `data/voicemails.json` and `data/voicemail-audio/`. Seen is recorded per pitch. Audio is served with Range support for Safari.
- UI: jobs with an unseen voicemail are pinned with a yellow ☎. The Voicemail section shows date, caller, length, a player and the transcript, marked "likely match" for name matches. Opening the pitch marks it seen.

## Where it is

- Files that matter: `mac/voicemail-helper/{Store,Audio,main}.swift`, `mac/voicemail-sweep.mjs`, `server/voicemails.mjs`, `server/index.mjs`, `src/app/app.ts` (`open`, `markVoicemailsSeen`, `withSeenHere`, `visible` sort), `src/app/voicemail.css`.
- Verified by:
  - `npm test` 143/143 and a clean `ng build`.
  - Swift compiles.
  - Against a temporary server seeded with Chungus's live pitches: 599 voicemails exported, 17 pushed by number with audio, no failures. A second sweep pushed 0. Audio Range answers 206.
  - Browser: pinned order, unpin-on-open with the job keeping its place, and audio decodes.
- Helper installed at `~/Applications/JobbyVoicemail.app`. The owner granted it Full Disk Access on 2026-10-08. It is signed with the Apple Development identity, so rebuilds keep the grant.

## Loose ends

1. **Figma:** jobbylooky still has no Figma file (deferred by the owner on 2026-10-01). This PR adds a row badge and a Voicemail section.
2. **Reviewer coverage:** Copilot was out of quota and CodeRabbit was rate-limited throughout. Codex (rounds 1 and 3) and a code-review agent (round 2) reviewed it.
3. **About 16 recordings in the 6-month window have no transcript.** Apple's engine and the on-device one both return nothing for them (likely non-English or non-speech). They show "No transcript." with the player.

## Next agent: start here

1. Routine failing? Run `node mac/voicemail-sweep.mjs sweep` by hand. `error.json` in `~/Library/Application Support/JobbyVoicemail/` holds the helper's last failure. "Cannot open the voicemail store" means Full Disk Access was turned off.
2. Never copy that folder anywhere. It holds every voicemail's transcript, not only the matched ones.

## Decided by the owner

- "only go back 6 months". Settled the 183-day window.
- Notification in Jobby only; pinned until opened; audio player, name/company matching and caller/length all wanted; backfill once (answers to the session's questions).
- Render approved: "go". Settled the layout. Claude's link reason is stored but not shown (not asked for).
- Work from a temporary clone while another session held the checkout (the owner's pick).

## Proposed rule changes

- `no-worktrees` says "stop and ask" when the shared checkout is taken. With two sessions in one repo, a temporary clone in the session's scratch folder, deleted after merge, worked without leaving a folder beside the repo. Consider writing that in as the default instead of asking.
