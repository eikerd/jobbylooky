---
date: 2026-10-01 22:13 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: restyle-warm-paper (worktree ../jobbylooky-wt-warm-paper), deleted after merge
pr: https://github.com/eikerd/jobbylooky/pull/9
state: merged
deployed: Chungus deploy of the merge commit follows in this session; the result (md5 against origin/main) is in the closing message to the owner, not here
loose_ends: 4 (listed below)
supersedes: none (the 2026-10-01 notes cover other work)
---

# Warm paper theme: a light, readable restyle

## What changed, and why

The owner found the dark green-on-black monospace UI "too dark and hard to read with tiny bad fonts" and asked for a restyle "as a 37signals product". I mocked up three directions (Warm paper / Basecamp-like, Loud and bold / HEY-like, Quiet reader / Writebook-like) and the owner picked A. I applied it to the real app and the owner approved a render before the first commit.

- Cream page, tan sidebar, white cards, green actions, yellow selection, blue for full-time roles.
- System sans replaces monospace. Body and email text are 15–16px; nothing is under 13px.
- Rounded queue cards, pill buttons and fit chips.

Layout proportions grew with the type (sidebar 220px, was 172px; more padding). Wording, data and behavior are unchanged.

Review rounds fixed five contrast problems, each re-rendered and approved before its commit. Every grey text pair is now at least 4.6:1, and inputs, secondary buttons and the selection edge are at least 3:1 (`--control-border`, darker `--select-edge`).

Earlier in the same session, PR 6 (an optional `receivedAt` on `POST /api/import` with strict validation, plus a backfill script for the 16 Yahoo pitches) was closed as superseded by PR 4, which landed the same feature. The live data was verified correct and nothing was run against it.

## Where it is

- Commits:
  - 6ef4def style: warm paper theme
  - 5292eaa fix: theme contrast (self-review)
  - b7a1293 fix: 3:1 boundaries for inputs and the selected card (Copilot)
  - f7a143b fix: secondary buttons use the 3:1 control border (Codex)
- Files that matter:
  - `src/app/theme.css`: every color token, on the App `:host`. Custom properties inherit into `Profiles`, `Highlight` and `SourceIcon`.
  - `src/app/app.css`, `groups.css` (split out to stay under the 12 kB component-style budget), `phrases.css`, `reply.css`, `profiles.css`, `src/styles.css`, `index.html` and `manifest.webmanifest` theme colors.
- Verified by:
  - `npm test` 108/108; `npm run build` clean with no budget warnings.
  - Renders of the real app on a temp `DATA_DIR` with made-up pitches: inbox, reader, recruiters, the Add email form, and 375px phone width with no horizontal scroll.
  - WCAG contrast computed for every token pair.

## What is deployed

See the closing message: it records the Chungus deploy of the merge commit, built from a clean `origin/main` checkout, with the md5 comparison.

## Loose ends

- **Figma:** jobbylooky has no Figma file. The owner said "we can hold off on figma", so this visual change is not in any design file yet.
- **PR 5** (another session, `../jobbylooky-wt-java-scripting`, 1 uncommitted file) is still open. It makes the global `styles.css` load under the CSP. This theme does not depend on it: the tokens live in component styles. `styles.css` was updated so it matches once PR 5 lands.
- **Stricter `receivedAt` validation and a "Received" field in the Add email form:** both were offered and the owner did not answer. Main accepts any `Date.parse`-able string (`9/30/2026`, zone-less times read as UTC, Feb 30 rolling into March) and up to 24 h in the future, with no before-2000 check. The stricter version and its tests are in closed PR 6, commit 10689d0, ready to salvage onto a fresh branch.
- **Reviewers:** Copilot reviewed only round 1 and did not pick up two re-requests, most likely its daily quota. CodeRabbit is on the free plan: walkthrough only, no line review.

## Next agent: start here

1. Ask the owner about salvaging PR 6's validation and form field (above) before starting other import work.

## Decided by the owner

- "can we restyle this as a 37signals product? would you offer me 3 UI themes": led to the three mockups.
- "yes i agree A": settled the Warm paper direction.
- "we can hold off on figma approved otherwise": the theme render was approved and Figma is deferred.
- "when i say land i mean stand up a pr and do 3 review rounds": defines "land" as PR, three rounds, then merge.
- Each review fix (round 1 self and Copilot, round 2 Codex) was approved on a render before its commit.

## Proposed rule changes

- In `rules/handoffs.md` or the landing docs: say that the owner's "land" means "open a PR, run three review rounds, then merge and deploy", not "merge now". This session first read "push to chungus and land pr" as a go-ahead to merge immediately.
