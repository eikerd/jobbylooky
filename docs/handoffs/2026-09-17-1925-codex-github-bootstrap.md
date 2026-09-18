---
date: 2026-09-17 19:25 America/Chicago
tool: codex
model: GPT-6
repo: eikerd/jobbylooky
branch: main (feat/bootstrap-app squash-merged and deleted)
pr: https://github.com/eikerd/jobbylooky/pull/1
state: merged
deployed: no — local preview only at http://127.0.0.1:4317/jobs/
loose_ends: deployment and product follow-ups listed below; no application worktrees or stashes
supersedes: docs/handoffs/2026-09-17-1857-codex-original-task.md
---

# Jobbylooky is in GitHub; continue here with Codex or Claude

## What changed, and why

Recovered the original task's staged source, reconciled it by checksums and imported its final handoff. Added Westlake interest, explicit full-time blue styling, tentative employer-location clues, sender icons and compact street-address maps. Bootstrapped the private repository and CI; consolidated all application work in PR 1. Read [../START-HERE.md](../START-HERE.md) before making changes.

## Where it is

- Repository: https://github.com/eikerd/jobbylooky
- Checkout: `/Users/ernestoikerd/repos/work/jobbylooky` (main).
- Companion source: https://github.com/eikerd/chungus/pull/18 — body retention, truncation/thread metadata, `/jobs/` route and mailparser dependency patch.
- App implementation commit: `20de5c3`; editor/review follow-up: `eaa4649`; the squash commit on main is the authoritative landing revision.
- Important files and operating commands: `docs/START-HERE.md` and `README.md`.
- 75 tests pass; production build passes; npm audit zero vulnerabilities. GitHub clean-install CI passed. Browser verification covered queue/profile navigation, preserved decisions, repeated posting history, maps and icons.
- Three Codex self-review passes are documented in `docs/reviews/2026-09-17-bootstrap.md`. Copilot quota was exhausted. CodeRabbit was requested but had not published substantive findings at the handoff check; do not describe this as independent approval. The owner explicitly requested the combined check-in and merge.

## What is deployed

No new server deployment. The local preview runs the recovered app against the read-only Chungus mail database. The user's private cache remains in `data/` on this Mac and is ignored by git. Main does not imply deployed. Server files and private data must be inspected before a future deployment.

## Loose ends

- New server deployment and private-cache migration remain to be done. Do not replace saved decisions with an empty Docker volume.
- Heatmap/calendar plus job timeline was discussed but not built. No final design approval was given.
- Exterior/front-door photos are not implemented. Current previews are street/satellite maps for specific street addresses, not city maps.
- DFW coverage is still a city heuristic; a robust metro boundary and additional suburbs require follow-up.
- Historical newsletter entries may remain from prior imports; do not delete them or alter triage without authorization.
- Review bots may post after this handoff; inspect both linked PRs for any late actionable feedback.
- Original scratch staging and its bundle remain in `/Users/ernestoikerd/Documents/Codex/2026-09-17/gmail-plugin-gmail-openai-curated-remote-4/`; they are historical copies, not current source.
- Unrelated Chungus PR 2 (ECC bundle) remains open and is not part of this session.

## Next agent: start here

1. Read `docs/START-HERE.md`, verify `git status` and fetch main. Keep the private cache intact.
2. Check `lsof -nP -iTCP:4317 -sTCP:LISTEN`; don't start a second server over the same data. Node must match `.nvmrc`.
3. Review the live app with the owner and choose the next feature. Keep the compact styling and visual approval process.
4. If deploying, read Chungus's current instructions and its companion handoff first. Deploy clean merged source only and validate nginx before reload.

## Decided by the owner

- "get everything merged to main and checked in" — this combined landing and handoff.
- "I just want it flagged. I don't want it automatically eliminated." — employer warnings never auto-triage.
- Maps are for specific addresses, not cities. Incidental email addresses are not automatically job sites.
- Full-time employee roles blue; ordinary contracts remain normal.
- Raleigh alone does not identify Chase; Raleigh plus Ohio is an unverified owner-supplied clue.

## Proposed rule changes

None. No instruction files were changed.
