---
date: 2026-10-06 12:32 America/Chicago
tool: claude-code
model: claude-fable-5-1, then claude-opus-5-5 (owner switched mid-session)
repo: eikerd/jobbylooky
branch: fix/trash-race-and-office-identity (main checkout, no worktree), deleted after merge
pr: https://github.com/eikerd/jobbylooky/pull/14
state: merged (three review rounds, scorecard reports/pr-14.html)
deployed: see the closing message to the owner; the Chungus deploy of the merge commit follows the merge in this session, with md5 against origin/main
loose_ends: 2 (listed below)
supersedes: 2026-10-06-1019-claude-code-map-locations.md (same session, earlier task)
---

# PR #12's two late review findings, fixed in #14

## What changed, and why

The owner asked to "review and merge PR 12". It had already been squash-merged at 10:30 by the Pass→Trash session, which wrote `reports/pr-12.html` and deployed main to Chungus (md5 of `server/index.mjs`, `server/gmail-trash.mjs`, `src/app/location-map.ts` matched main). Codex posted two more P2 findings at 10:33, after the merge, and nobody answered them. Both were real:

- **Mail synced while Gmail is deleting lost its retry.** The Pass handler cleared `trashPending` unconditionally once IMAP finished. `store.settleTrash(id, batch)` now clears it only when the batch handed to the trasher covers every Message-ID the pitch has afterwards.
- **Spelled-out states merged offices.** Office identity read the locality with a two-letter state pattern. It now uses the job-location `cityState` pattern, normalises "Texas" to "TX" (`STATE_CODE`), and reads the city only after the matched street, so "West Virginia Avenue" is never a locality (Codex, round 1 of #14).
- `reports/pr-12.html` now shows those two findings as open at merge (found 8, fixed 6, grade B+), and both #12 threads link to #14.

## Where it is

- Commits on #14: c9fc24b (settle guard), 0d69be4 (state names), d399b03 (pr-12 scorecard correction), 01d548e (locality after the street), then this note and `reports/pr-14.html`.
- Review: Codex round 1 found one issue (fixed), round 2 clean (👍). Round 3 was an independent code-review agent: approve, three low notes left as they are (overlapping Pass requests can re-flag mail already trashed and self-heal; a settle 404 would read as a Gmail error but no path deletes rows; "Elm Avenue South, Washington, DC" vs "…, Washington, PA" merge). Copilot was out of quota and CodeRabbit rate-limited on every round.
- Verified: `npm test` 129/129, `npm run build` clean on Node 22.23.2. Each new test fails on the commit before its fix.

## Loose ends

1. **Figma:** jobbylooky still has no Figma file (deferred by the owner on 2026-10-01). This PR changes no pixels.
2. **Reviewer coverage:** Copilot's quota and CodeRabbit's hourly limit were exhausted for both #12 and #14; Codex was the only bot reviewer.

## Next agent: start here

1. Pass→Trash has still not been exercised against live Gmail (the #12 session said so). The first real Pass on Chungus is that test; check the item leaves the Gmail inbox and lands in Trash.

## Decided by the owner

- "review and merge PR 12", then "continue review and merge after 3 rounds". #12 was already merged, so its open review findings were fixed in #14 and #14 merged after three rounds.

## Proposed rule changes

- `docs/pr-workflow.md`: after a merge, check for review comments posted after the merge commit's time. Codex finished a review three minutes after #12 merged and its findings would otherwise have been lost.
