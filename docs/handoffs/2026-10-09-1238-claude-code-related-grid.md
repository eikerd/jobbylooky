---
date: 2026-10-09 12:38 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: compact-related-grid (temporary clone in the session's scratch folder, deleted after merge), deleted after merge
pr: https://github.com/eikerd/jobbylooky/pull/22
state: merged (three review rounds, scorecard reports/pr-22.html)
deployed: the Chungus deploy of the merge commit follows the merge in this session; the result (md5 against origin/main) is in the closing message to the owner
loose_ends: 3 (listed below)
supersedes: none
---

# Related pitches as one sortable grid

## What changed, and why

The owner, looking at a three-pitch job in the detail pane: "This section is needlessly gigantic … it repeats the same information twice … all of this can be like five or six lines … just show the three with all the metadata in a grid table."

About twenty lines became five:

- **Removed:** the posting summary (first seen, latest, "N emails over N days · longest gap"), the Posting timeline dropdown, the 30-day "ongoing search" insight, the stacked pitch cards, the evidence line, and "Status and notes below apply to the selected pitch."
- **Header:** one line. The title is "Likely same job" or "Same job", or "Emails" when a single pitch was sent more than once. "Keep this pitch separate" sits on the same line.
- **Grid:** Received · Sender · Pay · Fit · Status, with one row per email in the group's timeline.
  - Each column sorts ascending, then descending, with an arrow and `aria-sort`. Blanks sort last in both directions, and ties go newest first.
  - Rows stay on one line, and long text ends in an ellipsis. On a narrow pane the table scrolls sideways inside its own box.
  - Clicking a row opens that pitch.
  - A pitch the server's timeline skipped (an unreadable date, or a repeated message id) still gets a `pitch:<id>` row.
- **Age heat:** the age is coloured on a 30-day gradient (`ageHeat` in `age.ts`, tokens `--heat-hot` and `--heat-cold` in `theme.css`). This follows the owner's standing rule that every date shows its age, heat-mapped over 30 days. So far only this grid uses it.

## Where it is

- Commits:
  - `bb956f0` feature
  - `a31b42e` round 1 fixes
  - `5a7a292` round 2 fixes
  - `470eab8` round 3 fixes and README
  - then this note and `reports/pr-22.html`
- Files that matter:
  - `src/app/related-grid.ts` (new: rows, sorting, columns)
  - the `.related` section of `src/app/app.html`
  - `relatedSort`, `related`, `ariaSort`, `ageColor` and `isDate` in `src/app/app.ts`
  - `src/app/groups.css`, `src/app/theme.css`, `src/app/age.ts`
  - `tests/related-grid.test.ts`
- Verified by:
  - `npm test`: 152/152.
  - `ng build`: clean, no style-budget warning.
  - Ran a copy of the local data at 1500×950 on the owner's three-pitch job (port 4327, preview mode). No cell clips its text, and header clicks flip the arrow and `aria-sort`. The console shows no errors.

## What is deployed

See the closing message. The deploy follows the README's Chungus steps from a clean `origin/main` checkout after the merge.

## Loose ends

1. **The owner's main checkout has uncommitted work from another session:** `src/app/app.html`, `src/app/app.ts` and a new `src/app/place-links.component.ts`. Not touched.
2. **PRs from other sessions:**
   - Open PRs #20 (right-justified fit pills) and #21 (daily link sweep) need a merge of main after this lands.
   - #20 edits the queue rows in `app.html`, not this section, so a clean merge is likely.
3. **Coverage gaps:**
   - Copilot was out of quota, and CodeRabbit wrote only a summary.
   - The reviewers were Codex (three rounds, no findings) and three independent review agents (15 findings, 12 fixed, 3 declined).
   - The round 3 fixes (`470eab8`) were not re-reviewed by a bot.
   - No Figma file exists for this project; the owner deferred Figma on 2026-10-01. This layout is in no design file.

## Next agent: start here

1. To extend the age heat to other dates (queue rows, the detail header, profiles), call `ageColor(receivedAt)` as `[style.color]` on the age text.

## Decided by the owner

- "Just show related, show the three with all the metadata in a grid table." This settled the grid.
- "remoe this text" (about the "Matching location and overlapping job requirements" line) removed the evidence line.
- "ok coniniue", on the render, approved the commit and the landing.

## Proposed rule changes

None.
