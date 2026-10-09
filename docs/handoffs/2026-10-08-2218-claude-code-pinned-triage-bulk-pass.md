---
date: 2026-10-08 22:18 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: feat/pinned-triage-bulk-pass (main checkout, no worktree), deleted after merge
pr: https://github.com/eikerd/jobbylooky/pull/18
state: merged (three review rounds, scorecard reports/pr-18.html)
deployed: the Chungus deploy of the merge commit follows the merge in this session; the result (md5 against origin/main) is in the closing message to the owner
loose_ends: 4 (listed below)
supersedes: none
---

# Triage buttons pinned to the top; tick rows to Pass several at once

## What changed, and why

The owner triages by passing (deleting) many pitches in a row. The Pursue / Maybe / Pass / Reply buttons sat below the title, facts and fit tags, so they moved for every pitch. The owner also wanted to tick several pitches and delete them at once.

- **Pinned triage bar.** `.decisions` is now the first thing in the detail pane. It is `position: sticky` and flush with the pane's top edge, so it sits at the same pixel for every pitch and while the email scrolls. Chromium measures sticky offsets from inside the scroller's padding, so `top` is `-var(--pad-y)`, not `0`. A `0` leaves a 24px drop as soon as the pane scrolls. At ≤620px the page scrolls instead of the pane, so `.workspace` uses `overflow: clip` (not `hidden`) and the bar uses `top: 0` against the viewport.
- **Tick boxes.** Each queue row is wrapped in `.queue-item`, with a checkbox over the row's left padding. A `<button>` cannot contain a checkbox. Ticking never opens the row. Passed rows get no tick box.
- **"Pass N selected" bar.** It floats at the foot of the queue, not the top, so the list doesn't shift when the first box is ticked. It runs every ticked row through the same Pass path as a single Pass.
- **Refactor.** `pass()` is now `passRows(rows)` plus `savePass(row, fields)`. `collectTrash` returns its outcome, and `toastTrash` gives one toast per Pass action: the pitch's title for one, "N pitches" for several, and counts per outcome when they differ. The banner names every pitch whose Pass failed to save.
- **Shortcut.** P now works while a tick box has focus.

## Where it is

- Commits: 8c9522e (feature), 4cb0b04 (round 1 fixes), d83c502 (round 2), 48b4294 and 4b78a13 (round 3), then this note and `reports/pr-18.html`.
- Files that matter: `src/app/app.ts` (`checked`, `checkedRows`, `toggleChecked`, `passChecked`, `passRows`, `savePass`, `collectTrash`, `toastTrash`, `shortcut`), `src/app/app.html` (queue row wrapper, bulk bar, `.decisions` moved), `src/app/bulk.css` (new).
- Verified by:
  - `npm test` 136/136 and `ng build` clean on every commit.
  - Sample server (`MAIL_SEND_MODE=preview`, port 4318), at 1440x900:
    - The bar's top was 83px before and after scrolling the pane, the same as the pane's top.
    - Bulk Pass of 4 ticked rows, including the open one: all hidden; the next remaining row opened; one toast, "Preview: Gmail not touched · 4 pitches".
    - P with focus on a tick box passed the open pitch and kept the tick.
    - Passed rows have no tick box in Passed or in All opportunities.
  - Sample server at 375px: the bar's top was 0 after the page scrolled 900px.

## What is deployed

See the closing message. The deploy follows the README's Chungus steps from a clean `origin/main` checkout after the merge.

## Loose ends

1. **Figma:** jobbylooky still has no Figma file (deferred by the owner on 2026-10-01). This PR moves the triage bar and adds tick boxes, so a Figma file would need both once one exists.
2. **Reviewer coverage:** Copilot was out of quota. CodeRabbit is on the Free plan and writes only a summary, with no line-by-line review. The reviewers were Codex (three rounds) and independent code-review agents (rounds 1 and 3).
3. **Open PR #17** (voicemail sweep, another session) edits the same `.decisions` block and the queue row markup in `app.html`, plus `select()`/`open()` in `app.ts`. It needs a merge of main after this lands. Its Voicemails section sat just above `.decisions`, and `.decisions` is now at the top of the pane.
4. **`agent-sweep.sh` hung** for over two minutes at session end with only its date line printed. The sweep was done by hand: open PRs #17 and #18, no worktrees, no stashes, no uncommitted files.

## Next agent: start here

1. When merging #17, keep `.decisions` as the first child of `@if (selected(); as row)` in the detail pane. Keep the `.queue-item` wrapper and `.pick` label around the row `<button>`, and change `select(row)` to `open(row)` inside it.

## Decided by the owner

- "The buttons need to go at the top so I can delete many of them in a row and not have to have the buttons jump around… multi-select emails to delete, maybe like a checkbox." Settled the feature.
- Pinned at the top of the detail pane, "Pass selected" as the only bulk action, and waiting for the voicemail session to commit rather than using a worktree. All chosen from proposed options.
- On the render: "Yes, looks great. Ship it." The bulk bar's move from top to foot was shown in that render and explained before approval.

## Proposed rule changes

- None.
