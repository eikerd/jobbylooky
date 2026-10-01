---
date: 2026-10-01 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: resume-workflow-docs (worktree ../jobbylooky-wt-resume-docs)
pr: https://github.com/eikerd/jobbylooky/pull/8
state: merged (override mode, owner's word: "Override, merge now")
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

- Checked at 17:25: the 16 Yahoo pitches imported on 2026-10-01 now carry their real received dates (Apr 21 – Sep 22), fixed by another session.

- The approved PDF (send copy, Google Doc 1w3rLlRnn5y8PPVfM00XlVcbuH-ggiWhl0cBLWQn5aDI) is in `/app/data/resume/` in the `jobbylooky` container on Chungus (owned by node; md5 matches) and in `data/resume/` in the Mac's main checkout.
- LinkedIn headline and the Indeed Gmail account's headline and resume upload are updated to the new wording.
- Dice, later the same evening, under the owner's rule "only claim what's on the resume … take it off. Including that outdated pay": resume replaced with the approved PDF; Work History is now the resume's eight jobs (the Interphase "Graphics Specialist" entry is gone); Skills cut from 29 to 13 (ColdFusion, Flash, Fireworks, Dreamweaver, InDesign, Windows XP, Mac OS, JSP, jQuery, QA, Mobile, IT management, e-commerce and three generic ones removed), with the ones he uses today marked Current; preferred title "senior software engineer". Profile basics were saved earlier: Dallas 75214, 18 years, LinkedIn URL.

## Loose ends

- **Dice pay still shows $60k/yr · $35/hr.** Dice cannot hide pay (blank keeps the old value; 0 shows "$0k/yr"), so the owner needs to name a number or accept it. Saving 0 was tried and reverted.
- **Dice skills lack Node.js and GraphQL.** Both are on the resume, but Dice requires a years number for each skill; the owner should give one.
- **The Indeed Yahoo account is still visible to employers**; the owner wants it hidden. The email-code prompt timed out at the sign-in step. Indeed is now signed out in Chrome (both accounts); sign back in to the Gmail account after.
- Local branch `pr7-salvage` in the main checkout exists only to recover the doc; delete it after this merges.

## Proposed rule changes

None.
