---
date: 2026-09-18 15:15 America/Chicago
tool: claude-code
model: claude-opus-5
repo: eikerd/jobbylooky
branch: main (fix/late-review-findings squash-merged and deleted)
pr: https://github.com/eikerd/jobbylooky/pull/2
state: merged
deployed: no — the Chungus deploy follows in this session; its result is recorded in the eikerd/chungus handoff for PR 19
loose_ends: 4 (listed below)
supersedes: docs/handoffs/2026-09-17-1925-codex-github-bootstrap.md
---

# Late review fixes, fit icons, tracked phrases, replies to recruiters, /jobby/

## What changed, and why

Fixed the actionable CodeRabbit/Codex comments that arrived after PR 1 merged. The biggest was a mail-worker SQL prefilter that was stricter than `isOpportunity()` and silently dropped "Hiring:" subjects. Queue rows now show the ✓ ? × fit icons. A Phrases tab tracks owner-defined negative phrases (× reason, forces Mismatch, red highlight) and positive ones (✓, green, never overrides a mismatch), with match counts and matching-pitch lists. Each pitch can now send a threaded reply over Gmail SMTP. When the recruiter answers, the row moves from New/Pursue to Maybe and gets a "↩ replied" badge. The app now serves at `/jobby/`, and `/jobs` redirects.

## Where it is

- Commits: 9831c0a review fixes and row icons · b69413d / 2491c62 tracked phrases · cc6beda round 1 · 28496b2 replies · 229239d /jobby and deploy prep · 93da31a, c985b16 round 2 · c593b9a round 3 · scorecard last.
- Files that matter: `server/mailer.mjs` (threading and recipient rule), `server/store.mjs` (`trackedPhrases`, `recordReply`, `noteReplyBack`), `server/screen.mjs` (`phrasePattern`, tracked-phrase reasons), `src/app/highlight.ts`, `deploy/render-env.sh`, `deploy/jobbylooky.env.tpl`, `reports/pr-2.html`.
- Verified by: `npm test` 93 pass, `npm run build` clean, `npm audit` 0. Each visual change was rendered on :4318 against a scratch copy of the private cache and approved by the owner before commit. The reply loop was tested in `MAIL_SEND_MODE=preview` with a simulated answer: same row, New → Maybe, badge shown. No real email was sent. Redirects, the multi-host check and the cross-origin 403 were smoke-tested with curl.
- Review: three rounds (CodeRabbit + Codex), 15 findings, 15 fixed. Copilot's quota was exhausted all day. The round 3 fixes were not re-reviewed by the bots.

## What is deployed

Nothing from this PR at merge time. The private cache on the Mac (`data/opportunities.json`) now holds the owner's 5 preview decisions and 3 tracked phrases (Backend Java Engineer, Java Engineer, 100% remote). Backups of each prior version are in the session scratchpad, not the repo.

## Loose ends

- **The Gmail app password is committed in plain text in eikerd/chungus** (`AGENT_HANDOFF.md`, lines 130 and 140, on main). The owner said they would rotate it. After rotation: update `op://chungus/mail-worker/IMAP_PASS`, re-render the mail-worker env (`deploy/op/render-env.sh mail-worker`), re-render Jobbylooky's (`deploy/render-env.sh`), and scrub the file.
- eikerd/chungus PR 19 (`/jobby/` route plus basic auth) must merge before nginx is deployed.
- Replies have never been sent for real. The first real send is the owner's, from the deployed app.
- API authentication: the finding from PR 1 is covered by nginx basic auth on Chungus. The app itself still trusts anything that reaches it through the proxy.

## Next agent: start here

1. Read the eikerd/chungus handoff for PR 19 to see what is actually running at `/jobby/`.
2. Before any redeploy, check that the `jobbylooky-data` volume's `opportunities.json` is newer than the Mac copy. Never overwrite the volume with an older cache.

## Decided by the owner

- "these icons should be in the rows too", then "Make them bigger": row icons at 12px.
- "'Backend Java Engineer' or 'java engineer' needs to be flagged, boldened and highlighted as a negative. lets have a tab where we can track strings like this." Extras chosen: match counts, positive phrases, click to list pitches. "100% remote" kept as a real positive phrase.
- Replies: "Send from the app", and on the recruiter's answer "Move to Maybe + badge".
- "deploy on chungus, as chungus.local/jobby", with nginx basic auth (login in 1Password item `chungus/jobbylooky`).
- Leaked password: "I'll rotate it now."

## Proposed rule changes

- `~/.claude/report-templates/pr-report-template.html` line 569 calls `TL.sessions.map` without a guard, so a report whose `timeline` lacks `sessions` renders blank (this is how PR 1's scorecard broke). Guard it with `(TL.sessions ?? [])` in `central/claude/report-templates/src/`.
