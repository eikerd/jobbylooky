---
date: 2026-11-13 10:35 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: feat/gone-from-gmail
pr: https://github.com/eikerd/jobbylooky/pull/40
state: merged
deployed: the Chungus deploy of the merge commit follows this note's merge in the same session; its md5 result is in the closing message to the owner
loose_ends: 3 (listed below)
supersedes: docs/handoffs/2026-10-30-1520-claude-code-passed-mail-leaves-inbox.md
---

# A pitch whose emails were deleted in Gmail leaves the list

## What changed, and why

The owner: "when i delete emails in gmail i still see them in jobbylooky". The feature was written on 2026-11-02 as draft PR #40 and never merged, so the Pi ran without it. Every 10 minutes jobbylooky now asks Gmail's All Mail, read-only, whether each New or Maybe pitch's emails still exist, sent replies included. A pitch whose emails are all gone is passed with `goneFromGmail: { at, from }` and shows "🗑 Gmail". Nothing is queued for deletion.

The review rounds hardened it:

- New mail in a gone thread brings the pitch back to its old status and is never trashed.
- Only the rows that were checked can be passed.
- Mail jobbylooky deleted itself (`trashedIds`, recorded by `settleTrash`) never counts as the owner deleting it.
- Pitches the owner moved back from a delete-phrase, reject-rule, repeat or closed-posting pass are not asked about.

## Where it is

- Commits:
  - 79a02d5 the feature (rebased from eb03ea5)
  - b18239f review round 1 (Copilot)
  - fc424ad review round 2 (Codex)
- Files that matter: `server/gone-mail.mjs`, `server/store.mjs` (`threadMailIds`, `askableIds`, `reviveGone`, `passGone`, `settleTrash`), `server/gmail-trash.mjs` (`createPresence`), `server/groups.mjs`, `server/index.mjs`.
- Verified by:
  - `npm test`: 351 pass. `npm run build` is clean. Use Node 22 (`~/.nvm/versions/node/v22.23.2`); the default Node 20 cannot run the tests.
  - A read-only dry run against a copy of the Pi's `opportunities.json` and `link-checks.json` and the real Gmail. Of 59 New/Maybe pitches (85 ids), 17 ids were missing and 14 pitches would leave. All 14 were untouched New pitches from Nov 10 to Nov 13.
- Scorecard: `reports/pr-40.html`.

## What is deployed

See the closing message. The first check runs 10 minutes after the container starts.

## Loose ends

1. Pitches the owner passed by hand and then moved back to New before this deploy have no `trashedIds`. If all their mail is in Trash, the first check passes them again. The dry run found none among the 14.
2. `docs/comp/` is untracked in the main checkout. It belongs to the compensation-tool session, carried over from earlier notes.
3. PR #39 "Thread reads newest first" is still open. It may be superseded by the merged #42.

## Next agent: start here

1. If the owner reports a pitch vanishing that they did not delete, look for `goneFromGmail` on its row in `/app/data/opportunities.json`.

## Decided by the owner

- "when i delete emails in gmail i still see them in jobbylooky": a deletion in Gmail should take the pitch off the list.
- From the 2026-11-02 PR: "I'd like for a delete from the emails to remove it from jobbylooky in a reasonable amount of time."

## Proposed rule changes

None.
