---
date: 2026-10-17 00:52 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: feat/repeats-delete-phrases-heat
pr: https://github.com/eikerd/jobbylooky/pull/29
state: merged
deployed: the Chungus deploy of the merge commit follows this note's merge in the same session; its md5 result is in the closing message to the owner
loose_ends: 3 (listed below)
supersedes: docs/handoffs/2026-10-10-0250-claude-code-land-27.md
---

# Auto-pass repeats, delete phrases, conversation heat

## What changed, and why

Three things, one PR.

1. **Repeats.** A synced pitch that is the same posting, from the same recruiter, as one already passed is passed, and its Gmail copy goes to Trash. "The same" means the same sender, the same subject or title, the same job title, and at least 90% of the job text identical. A different stated client, city or job title is a different opening. Any alike pitch the owner is weighing vetoes it: a decision past New, a reply, a note, or an automatic pass they undid. A one-time sweep covers New pitches. It skips pitches kept after a closed-posting pass and pitches with a voicemail.
2. **Delete phrases.** These are the owner's "deadly" phrases, kept apart from tracked phrases. They have their own list (`state.deletePhrases`, `server/delete-phrases.mjs`, `/api/delete-phrases`) and their own sidebar tab, and they never highlight or score anything.
   - **Rules:** a phrase is 2–4 words. Mail that arrives after the phrase was added and carries it, whole-word in the subject or body, is passed and trashed on the same mail check. That includes non-job mail: the worker query reads it word by word and it comes back `phraseOnly`.
   - **Before saving**, a check shows how many emails from the last 60 days the phrase reaches.
   - **Never deleted:** a thread that began before the phrase, one the owner engaged with, and an undone delete.
3. **Conversation heat.** Conversation cards deepen in five steps (1, 2, 3, 5 and 8+ emails, both ways). A 🗣 icon tinted by heat marks conversations in four places: the queue, the Same job grid, the profile job cards (computed per recruiter) and the Postings grid.

## Where it is

- Commits: ce553ec (repeats), ec58500 (phrases v1 + heat), 1b0fb7f / f718334 / 8823613 (round 1, and the split into a separate list), f612829 (the Delete phrases tab), 78c72fb (round 2), 41dd070 + d61642d (round 3), then the scorecard.
- Files that matter: `server/delete-phrases.mjs`, `server/store.mjs` (import loop, `passByPhrase`, `passRepeat`, `sweepRepeats`), `server/groups.mjs` (`sure`, `passedOriginal`), `server/mail-worker.mjs` (`phraseFilter`, `countPhraseMail`), `server/index.mjs` (`trashAutoPassed`, routes), `src/app/conversation.ts`, `src/app/convo-heat.component.ts`, `src/app/app.ts` / `app.html` (Delete phrases tab, check dialog).
- Verified by:
  - `npm test`: 281/281. That includes a test that runs the worker's real SQL against an in-memory SQLite mail log.
  - `ng build` of the committed tree on its own, and CI `validate`.
  - Rendered against synthetic demo data with a fake mail log; the owner approved both renders. The auto-mode classifier blocked browsing a copy of live data, so no render used it.

## What is deployed

See the header. Nothing beyond origin/main.

## Loose ends

1. `docs/comp/` is untracked in the main checkout: the compensation-tool session's work, carried over from earlier notes.
2. `server/clients.mjs` and `server/clients.test.mjs` are untracked in the main checkout. They belong to the session "Company location fingerprinting" (local_6662e8cd), which is waiting for word that PR 29 merged before it branches from main. They are not this PR's.
3. Figma: jobbylooky has no Figma file (the owner deferred one), so these visual changes (Delete phrases tab, check dialog, heat tints, 🗣 icon) reached no Figma file.

Also worth knowing:
- The 🗣 icon in the Postings grid was never seen rendered, because the demo had no link checks; it compiles.
- The SQL prefilter uses ASCII `lower()`, so a delete phrase with non-ASCII capitals can miss in the worker query. That fails safe: mail is kept, not deleted.

## Next agent: start here

1. Check on Chungus that the first sync ran `sweepRepeats` (`repeatSweepAt` is set in `opportunities.json`), and see how many pitches it passed.

## Decided by the owner

- "I'd like to add some phrases that are auto … If they're in the email, immediate deletion." — delete phrases.
- "Even in Gmail, I want them deleted as soon as the … reader sees those words." — trashed on the same mail check, including non-job mail.
- "This is another level of phrase. Don't you use our existing track phrases for this feature." — a separate list and tab, no highlighting or scoring.
- Chose "Show match count first" when asked about a guard against over-broad phrases.
- "Emails go back and forth. Each conversation changes color. On a heat map, more intense as the conversations continue" — heat steps; chose "every message, both ways".
- "An icon of a person talking, showing that there's an active conversation" — the 🗣 icon in every view.
- Chose to ship the Oct 13 repeat work in this PR.

## Proposed rule changes

None.
