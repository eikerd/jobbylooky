---
date: 2026-10-08 22:15 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: feat/fit-tags-fails-first (built in a scratchpad clone, not the shared checkout), deleted after merge
pr: https://github.com/eikerd/jobbylooky/pull/19
state: merged (three review rounds; the owner said "go" after the render, and earlier "get reviews 3 rounds then merge prs")
deployed: Chungus deploy of the merge commit follows in this session; the result (md5 against origin/main) is in the closing message to the owner, not here
loose_ends: 2 (listed below)
supersedes: docs/handoffs/2026-10-06-1245-claude-code-compact-fit-tags.md (same session, PR #15)
---

# × fit tags first in "How it fits"

## What changed, and why

#15 capped the fit-tags strip at two rows, with the rest scrolling inside it. The session reviewing #15 pointed out that a × tag in a third row was out of sight. `fitTags(row)` now stable-sorts `fail` tags to the front, and every other tag keeps its screening order. The change is display-only.

## Where it is

- Commit: feat: × fit tags first, so the two-line strip never hides a mismatch
- File: `src/app/app.ts` (`fitTags`).
- Verified by:
  - `npm test` 136/136 after merging `main` (#16), `ng build` clean, CI `validate` green.
  - Live-page preview (a DOM reorder on Chungus): on a 7-tag pitch, all three × tags sit on line one and only a `?` tag falls to row three. The owner said "go".

## What is deployed

See the closing message: the deploy runs after this note is merged.

## Loose ends

- Open PRs #17 (voicemail sweep, draft) and #18 (pinned triage, bulk Pass) belong to other sessions and also touch `src/app/app.ts`. This change is confined to `fitTags`, so a conflict, if any, is a one-hunk merge.
- Carried from earlier notes: the owner's unanswered "i still don't see a lot of UI fixes that I wanted" (ask for the list), and #13's declined Codex point that same-kind crayon writes are not serialised.

## Next agent: start here

1. Ask the owner which UI fixes they still expect; none are known to this session.

## Decided by the owner

- "yes, sort the × tags first" — this PR.
- "go" — after the live-page render.

## Proposed rule changes

- None beyond the one in the 2026-10-06-1030 note (a scratchpad clone as the escape hatch when the main checkout is live with another session's work).
