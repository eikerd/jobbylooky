---
date: 2026-10-30 15:20 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: fix/passed-mail-leaves-inbox
pr: https://github.com/eikerd/jobbylooky/pull/38
state: merged
deployed: the Chungus deploy of the merge commit follows this note's merge in the same session; its md5 result and how far the Gmail backfill got are in the closing message to the owner
loose_ends: 3 (listed below)
supersedes: docs/handoffs/2026-10-30-1450-claude-code-delete-phrase-modal.md
---

# Passed pitches leave the Gmail inbox unless they answer me

## What changed, and why

The owner: "i still see emails in my gmail with delete phrases in jobbylooky, i want al those phraese to clean out m inbox when they are added". Then: "when I pass on an opportunity in jobbylooky I really don't want to see it in my inbox unless they reply", "I don't care if they have a voicemail, many wront matches leave vmails", and "For these, we're only focused on ones that are work opportunities."

**Cause.** Every recent match checked in Gmail was a pitch already **Passed** with no `deletedBy` and no `trashPending`. Examples: "Urgent Hiring for Java Full Stack Developer" and "JBD Local to WA - Java Developer". These pitches were passed before a Pass deleted Gmail mail, so their mail was never trashed. `sweepable()` only passes untouched New pitches, so a delete phrase never reached them. All 53 delete phrases already had `sweptAt`, and none had a delete pending.

**Fix.**

- `server/store.mjs`, a one-time step `passedMailSwept`:
  - Every Passed pitch that is not a pasted email is marked `trashPending`. On live data that is 570 pitches: 553 from the mail worker and 17 from the Gmail import.
  - Every delete phrase loses its `sweptAt`, so the next mail check sweeps each phrase again without the voicemail exemption. This was Greptile's round-1 finding.
  - A pitch the owner moved back to New keeps `deletedBy`, so it is not passed again.
  - The existing `trashAutoPassed()` queue moves the mail to Gmail Trash one pitch at a time on each mail check, and retries failures.
- `noteReplyBack`: when the sender answers the owner's reply in a passed thread, the pitch moves to Maybe and its pending delete is dropped. Any other later mail in a passed thread is still trashed.
- `server/index.mjs`: delete phrases take `phraseExempt()`, which excludes pitches kept or auto-passed after a closed posting. Voicemails no longer exempt a pitch. Repeats still use `ownedPitches()`.

Pursue and Maybe pitches are untouched. Non-job mail is not newly reached.

## Review

| Round | Commit | Result |
|---|---|---|
| 1 | e627a9d | Greptile: 1 P1. A New pitch skipped for its voicemail stayed skipped because its phrase was already swept. Fixed in 5b3d031. Codex: none. CodeRabbit rate-limited. Copilot out of quota. |
| 2 | 5b3d031 | Greptile: 3 files, 0 comments. Codex: none. |
| 3 | 5b3d031 | Greptile (requested): 3 files, 0 comments. Codex: none. CI green. |

Scorecard: `reports/pr-38.html`.

## Loose ends

1. Gmail still had some job mail older than the app's 60-day window, for example Iris Software "Sr. Java Developer" from 2025. The app never saw that mail, so this change cannot reach it. The owner believes mail older than 60 days was already cleared. Re-check Gmail after the backfill drains.
2. `docs/comp/` is untracked in the main checkout. It belongs to the compensation-tool session, carried over from earlier notes.
3. Another session holds the main checkout on `fix/thread-newest-first`, with uncommitted edits to `app.ts`, `app.html`, `thread.*` and `tests/thread.test.ts`. This session worked from scratchpad clones and did not touch it.

## Owner decisions

- Passed pitches leave the inbox "unless they reply". If an answer brings the earlier messages back from Trash, "that's fine".
- Voicemails do not protect a pitch from a delete phrase.
- Only work opportunities are in scope.

## Proposed rule changes

None.
