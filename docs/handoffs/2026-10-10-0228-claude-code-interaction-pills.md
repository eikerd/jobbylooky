---
date: 2026-10-10 02:28 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: feat/interaction-pills
pr: https://github.com/eikerd/jobbylooky/pull/28
state: merged
deployed: the Chungus deploy of the merge commit follows this note's merge in the same session; its md5 result is in the closing message to the owner
loose_ends: 4 (listed below)
supersedes: docs/handoffs/2026-10-09-1334-claude-code-gmail-link-and-landing.md
---

# Interaction pills on Pursuing rows

## What changed, and why

The owner asked for detailed indications on Pursuing rows of who they have emailed and which
conversations are ongoing. Each Pursuing job now has a line of pills that show only when they apply:

- ✉ Sent N (hover: date and recipient of each)
- 📄 Resume sent
- ↩ N replies
- ☎ N calls / 🎙 N voicemails
- N in thread
- Last contact Nd (on the 30-day heat colours)

`interactions()` follows the whole conversation. It starts from the job's pitches and follows
`respondsTo` links both ways: answers, answers to answers, and the pitch an answer row responds
to. Their replies are the answer rows, plus later emails on a row the owner wrote on, measured from
that row's own first send. The owner's own copies never count as theirs, and the thread counts one
per Message-ID.

## Where it is

- Commits: f9cbe86 (the feature), 0cf227d (round 1 fixes), 304637a (round 2 fixes), then the
  scorecard and this note.
- Files: `src/app/interactions.ts`, `src/app/interaction-pills.component.ts`,
  `tests/interactions.test.ts`. In `src/app/app.html` there's one hook line under the row
  (Pursuing only), and the old "↩ replied" text is hidden in Pursuing.
- Verified by:
  - `npm test`: 207/207, including 12 interaction tests.
  - `ng build` clean, CI `validate` green.
  - Rendered twice against a copy of the live Chungus data (local server, send mode preview, no
    mail sync), with no console errors. The data copy was deleted afterwards.

## What is deployed

See the header. Nothing beyond origin/main.

## Loose ends

1. `docs/comp/` is still untracked in the main checkout (the compensation-tool session's work).
2. PR #27 (conversation colours, rules, ages, one decision per job) is open from another session
   and touches the same row markup. This PR's hook is one line, so a conflict there would be small.
3. Carried from the previous note: four Minor findings on #25's selection modal are unfixed
   (keyup re-shows the button; a late save closes a reopened dialog; widening across inline
   elements; no bottom clamp on touch).
4. Figma: jobbylooky has no Figma file (the owner deferred it), so this visual change reached no
   Figma file.

## Next agent: start here

1. Cut from a freshly fetched `origin/main`. Merge from a clone, not the shared checkout:
   `gh pr merge --delete-branch` switches the branch of whatever checkout it runs in.

## Decided by the owner

- "I need incredibly detailed icons or pills or indications of who I've emailed and what
  conversations are ongoing … sent resume would be an important pill … Just any interactions."
- They picked all four pill groups (Sent + Resume, Their replies, Calls + voicemails, Thread + last
  contact), chose to build it as its own component now rather than wait for #27, and said "Yes,
  ship it" after the first render. The round-1 review fixes changed two labels ("Resume" became
  "Resume sent"; the separate "Their reply" pill became "↩ N replies"). A render of that went to
  the owner before the merge; Auto-fix pushed it.

## Proposed rule changes

- None.
