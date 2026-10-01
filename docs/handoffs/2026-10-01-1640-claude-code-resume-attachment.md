---
date: 2026-10-01 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: resume-attachment (worktree ../jobbylooky-wt-resume-attach)
pr: https://github.com/eikerd/jobbylooky/pull/7
state: pr-open
deployed: no
loose_ends: listed below
supersedes: none
---

# Attach the resume to recruiter replies

## What changed, and why

The owner asked that replies to recruiters carry his resume as an attachment. The Reply box has an "Attach resume" checkbox, ticked by default (owner's choice: "Checkbox, on by default"), shown only when the server has a resume file. The server attaches `resume/Ernesto-Ikerd-Resume.pdf` (`RESUME_PATH` overrides) only when the request says `attachResume: true`, records the filename on the reply, and answers 409 without sending if the box is ticked but the file is missing. The Docker image now copies `resume/`.

## Where it is

- Files: `server/mailer.mjs` (`findResume`, `reply(..., { attachment })`), `server/index.mjs` (`resumePath`, `/reply-to` reports `resume`, `/reply` attaches), `src/app/app.ts` + `app.html` + `reply.css` (checkbox), `Dockerfile`, `resume/Ernesto-Ikerd-Resume.pdf`.
- The PDF is the owner-approved send copy exported from Google Doc 1w3rLlRnn5y8PPVfM00XlVcbuH-ggiWhl0cBLWQn5aDI ("Ernesto Ikerd Resume (send copy, 2026-10-01)"): v3 minus its questions page and every [Q#] placeholder. When the working doc's questions are answered, re-export and replace this file.
- Verified: `npm test` 94 pass (new mailer test), `npm run build` clean, render on :4319 against a scratch copy of the private cache approved by the owner, preview-mode replies via the API (ticked → PDF recorded as attached; unticked → none). No real email was sent.

## Also in this PR

- `docs/resume/UPDATE-WORKFLOW.md`: every place the resume lives (Google Docs working draft and send copy, `resume/`, the Markdown snapshot, LinkedIn, Indeed Gmail and Yahoo accounts, Dice) and the update/login workflow. `docs/START-HERE.md` points to it; its stale "does not send emails" line is corrected.
- Headline/summary reframed per the owner: "Senior Software Engineer — Front-End Focused, Full-Stack" ("I want to emphasize as much as I can that I have done some full stack development"). PDF and snapshot updated to match.

## Decided by the owner

- "put my latest resume in the jobbylooky folder it needs to send them as attachments"
- "make a note of a resume update workflow that involves like copying the latest resume into our Jobby app location and then updating all the LinkedIn and everybody else with one password logins, browser automation, whatever it takes."
- PDF format; checkbox on by default; clean send copy now; "Approved, ship it" (full three review rounds).

## Next agent

- Finish the review rounds, scorecard, merge, then deploy per README "Chungus deployment" from merged main (the image must be rebuilt so `resume/` is inside it).

## Loose ends

- Copilot did not register as a requested reviewer on PR #7 (request API returned the PR with no reviewer listed).
- Two other jobbylooky sessions are in flight: "Let jobbylooky import keep the original date" (also edits server/index.mjs, /api/import route) and "Fix jobbylooky Java scripting false mismatch" (server/screen.mjs). PR #4 (email-url-truncation) is open from another session.

## Proposed rule changes

None.
