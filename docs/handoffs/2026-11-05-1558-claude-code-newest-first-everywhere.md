---
date: 2026-11-05 15:58 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: fix/newest-first-everywhere
pr: https://github.com/eikerd/jobbylooky/pull/42
state: merged
deployed: the Chungus deploy of the merge commit follows this note's merge in the same session; its md5 result is in the closing message to the owner
loose_ends: 3 (listed below)
supersedes: docs/handoffs/2026-11-05-1421-claude-code-reply-signature.md
---

# Every folder lists jobs newest first

## What changed, and why

The owner, with a screenshot of Pursuing: "this isnt sorted", then "all tabs should be default sorted".

**Cause.** `visible()` in `src/app/app.ts` pinned every job with an unseen voicemail above all others. Seven older voicemail jobs (6 to 34 days old) sat above today's, 2-day and 3-day pitches.

**Fix.**

- The folder filter and sort move to `src/app/folder.ts` (`inFolder`, `folderRows`). Inbox, Pursuing, Maybe, Passed and All opportunities sort strictly by the newest pitch in that folder, newest first.
- The pin is gone: `pinnedWhileOpen` and `pinned()` are removed. An unseen voicemail keeps its yellow ☎ badge, and opening the pitch still marks it seen.
- `tests/folder.test.ts` covers the order with unseen voicemails and a job with several matching pitches.
- README and comments no longer describe the pin.
- `.claude/launch.json` gains `jobbylooky-chungus-copy`. It copies Chungus's live `opportunities.json`, `voicemails.json`, `voicemail-audio/` and `link-checks.json` to a temp dir and runs with `MAIL_SEND_MODE=preview`. It stops if the copy fails, and it deletes the temp dir when it exits.

The grid tabs were already ordered: Recruiters, Companies and Clients newest first. Postings defaults to days open, longest first, and was left alone; the owner was told.

## Where it is

- Commits: `0a05415` the fix; `d608ba1` review round 1; `7c73457` review round 2.
- Files that matter: `src/app/folder.ts`, `src/app/app.ts` (`visible`, `open`, `select`), `tests/folder.test.ts`, `.claude/launch.json`.
- Verified by: `npm test` 333/333. Pursuing rendered on a copy of live data: all 38 rows in date order, 7 unseen-voicemail jobs in place. The owner approved the render. Preview cleanup checked by stopping the server and seeing the copy gone.

## Review

| Round | Commit | Result |
|---|---|---|
| 1 | 0a05415 | Copilot: 2 Medium on the new preview config (voicemail audio not copied; no `pipefail`). Both fixed in d608ba1. Codex: none. CodeRabbit rate-limited. |
| 2 | d608ba1 | CodeRabbit: 1 Minor (temp dir never removed) and 1 nitpick (test should hold two matching pitches). Both fixed in 7c73457. Codex: none. Copilot did not re-review. |
| 3 | 7c73457 | Codex: none. CodeRabbit rate-limited. CI green. |

Scorecard: `reports/pr-42.html`.

## What is deployed

See the header.

## Loose ends

1. `docs/comp/` is untracked in the main checkout. It belongs to the compensation-tool session, carried over from earlier notes.
2. Draft PR #40 (`feat/gone-from-gmail`) and PR #39 (`fix/thread-newest-first`) are open and belong to other sessions. PR #39 also edits `src/app/app.ts`, so expect a small rebase there.
3. The main checkout is switched back to `feat/gone-from-gmail` after the merge, as it was when this session began.

## Next agent: start here

1. Nothing left for this task. If the owner wants Postings newest first too, change the default `sort` signal in `src/app/postings.component.ts`.

## Decided by the owner

- "all tabs should be default sorted" — no job jumps the queue, including for an unseen voicemail.
- "Yes, commit it" — approved the rendered Pursuing list.

## Proposed rule changes

None.
