---
date: 2026-10-06 10:30 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: feat/phrase-colors (built in a scratchpad clone, not the shared checkout), deleted after merge
pr: https://github.com/eikerd/jobbylooky/pull/13
state: merged (three review rounds; the owner said "run the three review rounds and merge")
deployed: Chungus deploy of the merge commit follows in this session; the result (md5 against origin/main) is in the closing message to the owner, not here
loose_ends: 4 (listed below)
supersedes: none (docs/handoffs/2026-10-04-2347-claude-code-maps-on-click.md covers different work)
---

# Five tracked-phrase kinds, each with a crayon colour picker

## What changed, and why

The Phrases tab now has five kinds. Negative and positive behave as before. Neutral, purple and pink only highlight: they colour the matched text and add a `?` reason, but never change a pitch's fit. Each kind's heading carries a swatch that opens the 48 macOS crayons. The pick is stored on the server (`GET`/`PATCH /api/phrase-colors`, persisted as `phraseColors` in `opportunities.json`), so every device shows the same colours. `src/app/crayons.ts` turns a crayon into three tones (mark, soft, ink). The ink is darkened until it reads at 4.5:1 against the mark, so Snow and Lemon stay legible. The tones are set as `--<kind>-mark/-soft/-ink` on the app host. Every tracked reason carries `tone` = its phrase kind, so the reason icons wear the crayon too.

Default crayons: Salmon (negative), Flora (positive), Lemon (neutral), Lavender (purple), Carnation (pink). Positive highlights moved from yellow to green, so neutral owns yellow.

## Where it is

- Commits (squashed on merge):
  - feat: five phrase kinds with a crayon picker for each
  - fix: tracked-phrase icons wear their kind's crayon everywhere (round 1, Codex)
  - chore: npm audit fix for source-map-js (GHSA-68fv-2mgg-jv7q), which had failed CI's `npm audit`
  - fix: concurrent crayon picks never undo a newer colour (round 2, Codex)
- Files: `server/screen.mjs` (`PHRASE_KINDS`, `HIGHLIGHT_KINDS`, `DEFAULT_PHRASE_COLORS`, reason `tone`), `server/store.mjs` (`phraseColors`, `setPhraseColor`), `server/index.mjs` (routes), `src/app/crayons.ts`, `src/app/crayon-picker.component.ts`, `src/app/app.ts` (`phraseColors`, `pickPhraseColor`, `reasonIconClass`), `src/app/highlight.component.ts`, `src/app/phrases.css`, `src/app/app.css`.
- Verified by:
  - `npm test` 113/113 on `main` plus this branch; `ng build` clean; CI `validate` green.
  - Sample-data preview (port 4318): all five highlights, the Phrases tab, the crayon box open, and a pick (Tangerine) persisted through `/jobby/api/phrase-colors`. The owner saw the render and pressed Create PR.

## What is deployed

See the closing message: the deploy runs after this note is merged.

## Loose ends

- **PR #12 (`feat/pass-trashes-gmail`, another session's draft) conflicts with this one.** It replaces the "How it fits" list with `fit-tags`. Whichever merges second must carry the tone class onto the tags: add `reason.tone` to the `<li>` class, and add `.fit-tags .neutral/.purple/.pink/.negative/.positive` rules from `--<kind>-soft` and `--<kind>-ink`.
- **The shared checkout `~/repos/work/jobbylooky` was being edited by another session the whole time** (location maps, profiles; its note is `2026-10-06-1019-claude-code-map-locations.md`). This session switched that checkout's branch for about a minute while moving its own changes. It restored the branch and both of that session's files (`src/app/location-map.ts`, `tests/location-map.test.ts`) from a patch, then did all further work in a scratchpad clone.
- **Round 3 (Codex), declined**: two rapid same-kind crayon picks can reach the server out of order and persist the older colour. The client already ignores stale answers. The fix, if it's ever seen: serialise same-kind writes in `pickPhraseColor` (hold the latest pending colour and send it once the in-flight PATCH returns).
- The sample preview server (`jobbylooky-sample`, port 4318) was left running; stopping it was blocked by a permission check.

## Next agent: start here

1. If you are merging PR #12, apply the fit-tags tone carry-over from Loose ends first.

## Decided by the owner

- "for tracked phrases do a neutral setting thats yellow" — added the neutral kind.
- "lets do 5 categories with purple and pink" — purple and pink are highlight-only, like neutral.
- "add a color picker with crayon picker for each" — one crayon box per kind, stored on the server.
- "run the three review rounds and merge" — the merge go-ahead.

## Proposed rule changes

- `rules/shared-awareness.md` and the no-worktrees memory pull against each other. When the main checkout is live with another session's uncommitted work, "branch in the main checkout" is unsafe. A clone in the session scratchpad (pushed, then deleted) worked as the escape hatch, and the rule could say so.
