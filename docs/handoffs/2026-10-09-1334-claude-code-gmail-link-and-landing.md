---
date: 2026-10-09 13:34 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: main (fix/gmail-link merged and deleted; this note lands with inline-location)
pr: https://github.com/eikerd/jobbylooky/pull/24 (also landed #20, #25, #23)
state: merged
deployed: jobbylooky container on chungus.local; #20, #24 and #25 at f8f843e, md5-checked. The #23 deploy follows this note's merge in the same session; its md5 result is in the closing message to the owner
loose_ends: 5 (listed below)
supersedes: none
---

# Open in Gmail opens the real thread; every open PR landed

## What changed, and why

"Open in Gmail" on mail-worker pitches built `#search/rfc822msgid:<Message-ID>`. Gmail splits an
unquoted search term at `=` and `+`, so `CAP=06rDR=HaxZQ8…@mail.gmail.com` searched for `haxzq8…`
as a person. The link now hits `GET /api/opportunities/:id/gmail`. That route looks the Message-ID up
over IMAP (All Mail, then Trash, then Spam), reads `X-GM-THRID`, and redirects to `#all/<hex>` in the
owner's account. Found threads are cached in memory. If the lookup fails, the fallback is a quoted
`in:anywhere` search.

Eight sessions were sharing one checkout, and their PRs kept conflicting. The owner asked this
session to land all of them at once, with override mode on. Order: #20, #24, #25, #23. Before each
merge, main was merged in, then tests, build and CI ran, then the scorecard was written.

## Where it is

- #24: 88c6c2e (fix), plus a merge of main and the scorecard. Files: `server/gmail-link.mjs`,
  `server/gmail-link.test.mjs`, `server/gmail-trash.mjs` (`imapOpener()` is now shared),
  `server/index.mjs`, `src/app/app.ts`.
- #25: this session resolved its app.ts import conflict (1264e8f) and merged it as f8f843e.
- #23: this session merged main in (app.ts imports: `PlaceLinks` replaces `LocationMaps`,
  `SelectionPhrase` stays). The corrected `reports/pr-25.html` (9 found / 9 fixed) lands with it.
- Verified: 187 tests on #24, 191 on #25, 196 on #23, `ng build` clean each time, and CI
  `validate` green before each merge (#20 and #24 were merged while CI was still running, then
  confirmed green). Live: the Dallas pitch's link redirected to `#all/1a11baf0cdc92b60`.

## What is deployed

The jobbylooky container on chungus.local was rebuilt from a clean origin/main at f8f843e (#20, #24,
#25). md5 matches origin/main for server/index.mjs, server/gmail-link.mjs, src/app/app.ts and
src/app/selection-phrase.component.ts. #23 deploys after this note merges.

## Loose ends

1. `docs/comp/` is untracked in the main checkout. It is likely the "Compensation comparison tool"
   session's work; nothing has claimed it.
2. #25, Minor findings from its round-2 review agent, not fixed (all in
   `src/app/selection-phrase.component.ts`):
   (a) `keyed()`: any keyup, including Tab, Escape and typing in a field, re-shows the Track button
   while an old range is held.
   (b) `choose()`: if the dialog is cancelled and reopened during a save, the late success closes
   the new dialog. Needs a per-open token.
   (c) Widening only looks inside the start and end text nodes, so a word split across inline
   elements isn't widened.
   (d) `placeAtSelection()` doesn't clamp the bottom edge, so on touch, after a scroll, the button
   can land off screen.
3. `src/app/location-maps.component.ts` is no longer imported anywhere since #23. It's probably dead.
4. The Gmail-thread cache lives in memory, so the first click after a restart takes 2–11 s.
5. Figma: jobbylooky has no Figma file (the owner deferred it). #20's and #23's visual changes
   reached no Figma file.

## Next agent: start here

1. Cut from a freshly fetched `origin/main`, never from the checkout's local `main`. #25 was cut
   from a local main 16 commits behind, and that caused today's conflicts.

## Decided by the owner

- "Please fix branch 23 … Fix all of the PRs." Then they chose "Land all now, one by one": override
  mode on, the remaining review rounds skipped.

## Proposed rule changes

- The sweep should flag a branch whose merge base is more than a few commits behind origin/main.
- When several sessions share one checkout, one session should own merging (a landing queue).
  Today, separate sessions each ran review rounds and pushes on branches that overlapped.
