---
date: 2026-10-02 19:05 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: resume-profiles-followup (worktree ../jobbylooky-wt-resume-followup)
pr: see the PR opened from this branch
state: pr-open
deployed: no; docs only, nothing to deploy
loose_ends: listed below
supersedes: docs/handoffs/2026-10-01-1711-claude-code-resume-workflow.md
---

# Resume profiles: Dice finished, Yahoo Indeed left as it is

## What changed, and why

The note merged in #8 listed three profile items as open. All three are now settled, and `docs/resume/UPDATE-WORKFLOW.md` is corrected to match:

- **Dice pay** is $110k/yr and $55/hr. Dice cannot hide pay (blank keeps the old value, 0 shows "$0k/yr"); the owner: "if dice REQUIRES a pay rate then put 110k 55/hr".
- **Dice skills** now include Node.js (3 years) and GraphQL (2 years), both Current, on the owner's numbers ("for NodeJs you can put 3 years", "graphql 2 years"). Dice now has 15 skills.
- **Yahoo Indeed account:** the owner changed course: "i thought we were leaveing yahoo indeed". The registry row now says to leave it as it is, and the update step that hid it is removed. Nothing was ever changed on that account; the one attempt stopped at the email-code step.

The workflow doc also records a Dice quirk found while adding the skills: the visible years box is separate from the hidden `skills.N.yearsExperience` input, and a `find` ref landed on another row's box (Illustrator's years briefly read 3; reloaded before saving, so nothing wrong was saved).

## What the next agent should do first

Nothing is pending in the repo. Before the next profile update, sign Indeed back in to the Gmail account (see loose ends).

## Loose ends

- **Indeed is signed out in Chrome** (both accounts), left over from the Yahoo attempt. The Gmail account (psylux@gmail.com), the primary one, needs a sign-in with a Gmail code before next use.

## Proposed rule changes

None.
