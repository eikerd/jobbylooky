---
date: 2026-10-30 14:50 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: feat/delete-phrase-from-selection
pr: https://github.com/eikerd/jobbylooky/pull/37
state: merged
deployed: the Chungus deploy of the merge commit follows this note's merge in the same session; its md5 result is in the closing message to the owner
loose_ends: 2 (listed below)
supersedes: docs/handoffs/2026-10-30-1355-claude-code-retry-hand-passed-trash.md
---

# Delete phrase from the Track phrase modal

## What changed, and why

The owner: "the Track Phrase modal should have a another option for Delete Phrase also".

To open the modal, select text in a pitch and click **+ Track phrase**. It now has a red **🗑 Delete phrase** button below the tracked kinds:

- Clicking it runs the existing delete-phrase check ("Delete mail with …?", which shows the email and pitch counts). The check opens over the modal.
- **Cancel** returns to the modal unchanged, with no error shown. **Add delete phrase** saves the phrase, shows a toast, refreshes, and closes both dialogs.
- The button is disabled, with "Already a delete phrase.", when the draft is already on the delete list. A tracked phrase can still become a delete phrase, because the two lists stay separate (`server/delete-phrases.mjs`).

Code:

- `src/app/app.ts`: the Delete phrases page form (`addDeletePhrase`) and the modal (`deleteSelection`) share one `saveDeletePhrase`, which runs check → confirm → POST → toast → refresh. `checkDeletePhrase` now returns `''` on cancel instead of `'Not added.'`.
- `src/app/phrase-modal.ts`: `cleanPhrase`, `onList` (draft already on a list, case-blind) and `afterSave` (null closes, `''` stays silent, anything else is shown). Tested in `tests/phrase-modal.test.ts`.
- `src/app/selection-phrase.component.ts`: new `deletePhrases` / `saveDelete` inputs, `canDelete`, `chooseDelete`. Both choose paths share `settle()`.

No server change.

## Review

| Round | Commit | Result |
|---|---|---|
| 1 | 15cbc82 | Greptile: 1 P2 (no tests for the delete flow), fixed in d794afd. Codex: none. CodeRabbit skipped the draft, then rate-limited (Free plan). Copilot out of quota. |
| 2 | d794afd | Greptile: 5 files, 0 comments. Codex: none. CI green. |
| 3 | d794afd | Greptile (requested): 5 files, 0 comments. Codex: none. |

Scorecard: `reports/pr-37.html`.

## Loose ends

1. `docs/comp/` is untracked in the main checkout. It belongs to the compensation-tool session (carried over from earlier notes); this PR left it alone.
2. Figma: jobbylooky has no Figma file key recorded, so the new button is not in Figma.

## Owner decisions

- "Approved, ship it": on the rendered modal, the confirm stacked over it, and the disabled state.

## Proposed rule changes

None.
