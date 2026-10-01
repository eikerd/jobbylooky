---
date: 2026-10-01 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: resume-workflow-docs (worktree ../jobbylooky-wt-resume-docs)
pr: see the PR opened from this branch
state: pr-open
deployed: docs only; separately, the approved resume PDF was copied into the Chungus container's /app/data/resume (md5 6ac7b25a9d13bb14dce7002aa905051b), and GET /jobby/api/resume reports it
loose_ends: listed below
supersedes: docs/handoffs/2026-10-01-1533-claude-code-resume-snapshot.md
---

# Resume update workflow, and the resume folder filled

## What changed, and why

The owner asked for "a resume update workflow that involves like copying the latest resume into our Jobby app location and then updating all the LinkedIn and everybody else with one password logins, browser automation, whatever it takes." `docs/resume/UPDATE-WORKFLOW.md` lists every place the resume lives (Google Docs working draft and send copy, the jobbylooky resume folder, the Markdown snapshot, LinkedIn, the Indeed Gmail and Yahoo accounts, Dice) and the update and login steps, with the site quirks found on 2026-10-01. `docs/START-HERE.md` points to it, and its stale "does not send emails" line is corrected.

This was first written on PR #7 (attach-resume checkbox, PDF committed in the repo). The owner chose #4's design instead (newest file in `RESUME_DIR`, a "Reply with resume" button), so #7 was closed and its worktree removed by #4's session. The workflow is salvaged here and rewritten for the folder design.

The Markdown snapshot now carries the owner's new headline, "Senior Software Engineer — Front-End Focused, Full-Stack" ("I want to emphasize as much as I can that I have done some full stack development").

## Done outside the repo

- The approved PDF (send copy, Google Doc 1w3rLlRnn5y8PPVfM00XlVcbuH-ggiWhl0cBLWQn5aDI) is in `/app/data/resume/` in the `jobbylooky` container on Chungus (owned by node; md5 matches) and in `data/resume/` in the Mac's main checkout.
- LinkedIn headline and the Indeed Gmail account's headline and resume upload are updated to the new wording.

## Loose ends

- Dice still shows Plano 75075, 10 years, a stale "Graphics Specialist at Interphase" title and $60K/$35hr pay. The owner's rule: only what's on the resume, and hide pay. Dice's forms need Chrome in front for real keystrokes.
- The Indeed Yahoo account is still visible to employers; the owner wants it hidden (needs a Yahoo email code).
- The 16 Yahoo pitches imported on 2026-10-01 still show their import time as their age, unless #4's "real dates for pasted mail" or the receivedAt session backfilled them; check before telling the owner it's fixed.
- Local branch `pr7-salvage` in the main checkout exists only to recover the doc; delete it after this merges.

## Proposed rule changes

None.
