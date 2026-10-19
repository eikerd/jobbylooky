---
date: 2026-10-19 09:36 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: feat/delete-phrases-rescan
pr: https://github.com/eikerd/jobbylooky/pull/31
state: merged
deployed: the Chungus deploy of the merge commit follows this note's merge in the same session; its md5 result is in the closing message to the owner
loose_ends: 4 (listed below)
supersedes: docs/handoffs/2026-10-17-0140-claude-code-clients-tab.md
---

# Delete phrases reach the mail already here

## What changed, and why

The owner reported that delete phrases were not saved and were not filtering mail. They also asked that saving one "trigger a re-scan of the current emails too".

**Diagnosis.** The phrases *were* saved. Chungus's nginx log showed:

- "Java Full Stack Developer" saved at 14:12Z and removed by a Remove click at 14:14Z;
- ".Net Developer" saved at 14:15Z and still on the list.

PR 29 dated each phrase and applied it only to mail that arrived afterwards. So neither phrase touched a single pitch already in the inbox, and the page looked inert.

**Fix.**

- **No date cutoff.** `deletePhraseMatch` drops the `addedAt` check. A phrase matches mail whenever it was added.
- **Saving a phrase:**
  1. `addDeletePhrase` passes every untouched New pitch carrying it, pending its Gmail delete.
  2. The route starts the Gmail deletes (`trashAutoPassed`).
  3. It asks for a mail check (`syncSoon`). A check that is already running queues one more, so the phrase is read straight after.
  4. The page refreshes.
- **What the mail check does with a new phrase.** It replays the 60-day log.
  - Each known email is matched on its own subject and body against phrases not yet swept. A stored thread keeps only its first subject, so this is the only way to see a later email's subject.
  - Only then is the phrase marked `sweptAt`.
  - Non-job mail carrying a phrase becomes a passed row, as before, but now regardless of date.
- **A restored body is checked too.** A truncated body that a later check restores is matched against every phrase.
- **Never passed, as before:**
  - a pitch the owner touched: a decision past New, a reply, a note, a next step, a follow-up date, or an undone automatic pass;
  - a pasted email;
  - an answer to the owner;
  - a pitch kept after a closed-posting pass, or one with a voicemail. These live in `linkChecks` and `voicemails`; `ownedPitches()` in `server/index.mjs` passes them as `exclude`.
- **The dialog** now says the mail goes "to Gmail Trash now, and new emails with it as they arrive". Its count is the New pitches it will pass. The owner approved the render.

## Where it is

- Commits:
  - a0b6275: the feature;
  - 57ba80d: round 1, owned pitches and the queued check;
  - 0064727: round 2, the restored body;
  - 89bc0a3: round 3, per-email matching and `sweptAt` after the mail check;
  - then this note and the scorecard.
- Files: `server/delete-phrases.mjs`, `server/store.mjs` (`engaged`, `sweepable`, `sweepRows`, the `import` changes, `addDeletePhrase`), `server/index.mjs` (`ownedPitches`, `syncSoon`, the POST route), `src/app/app.html`, `src/app/app.ts`.
- Verified:
  - `node --test`: 301/301 (Node 22; the nvm default Node 20 lacks `--experimental-strip-types`).
  - `ng build` and CI `validate` pass.
  - Rendered on sample data with a fake Gmail account: a 14-day-old pitch was passed the moment the phrase was saved.

## What deploy does on Chungus

".Net Developer" has no `sweptAt`, so the first mail check after deploy runs it over the mail here:

- one untouched New pitch carries it ("Hiring || Full-Time || .Net Developer || Jersey City, NJ", 2026-10-19);
- the preview counted 11 emails in the 60-day log, most of them pitches the owner had already passed.

## Loose ends

1. `docs/comp/` is untracked in the main checkout. It is the compensation-tool session's work, carried from earlier notes; this PR left it alone.
2. A `node server/index.mjs` started at 09:22 today holds port 4318, the `jobbylooky-sample` launch port. It is not this session's and was left running. This session rendered on port 4321 instead.
3. Figma: jobbylooky has no Figma file (the owner deferred one). The changed dialog wording reached no Figma file.
4. Copilot could not review: the requester's quota was exhausted. CodeRabbit (Free plan) gave a summary only and then hit its hourly limit.

## Next agent: start here

1. On Chungus, check that `deletePhrases[0].sweptAt` is set in `/app/data/opportunities.json`, and that the Jersey City ".Net Developer" pitch is Passed with `deletedBy`.

## Decided by the owner

- "setting thses should trigger a re-scan of the current emails too": phrases reach the mail already here.
- Approved the render of the new dialog wording and the immediate pass ("Approved — commit, PR, review rounds, merge and deploy.").

## Proposed rule changes

None.
