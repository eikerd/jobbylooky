---
date: 2026-10-09 13:31 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: inline-location (main checkout)
pr: https://github.com/eikerd/jobbylooky/pull/23
state: pr-open. The scorecard, merge and deploy are handed to the "Open in Gmail fix" session, which the owner asked to land every open PR with override mode on.
deployed: no (the landing session deploys after it merges)
loose_ends: 3 (listed below)
supersedes: none
---

# Job location inline; resume replies mark Pursue

## What changed, and why

### 1. Job location sits in the received line

The owner, on the location block: it "wastes so much vertical space … just show two days old Irving, Texas, then the email … Irving, Texas is a link … when we click it, it shows the map … if you don't know the location or if it's remote, just put the word remote there."

- **Removed:** the "Job location: … ↗" line and the **Show map** button.
- **New component:** `src/app/place-links.component.ts` puts each mapped city in `.received-detail`, after the age and before the sender. Each city is a toggle button.
  - Clicking a city opens its map under the line (`order:1; flex-basis:100%`), and clicking again closes it.
  - No iframe exists before the click, so the built-in browser's per-action prompts stay off.
- **When nothing maps,** `unmappedLocation()` (in `location-map.ts`) decides what shows:
  - "Remote" for an empty, `Not stated` or remote value, and for template text or links.
  - Otherwise the text as written ("Austin", "Hybrid").
- **Work mode:** `workMode()` adds Remote, Hybrid or Onsite after the city links when the location states one. For example, "Plano, TX –(Onsite-Hybrid)" reads Plano, TX · Hybrid. The owner chose this one-word form during review.
- **Facts row:** it no longer repeats the location, and drops from three columns to two.
- **Unchanged:** the office maps on the company page (`app-location-maps`).

### 2. A sent resume reply marks the pitch Pursue

The owner: "if I reply with a resume, automatically mark it as pursued if it's not pursued."

- In `server/store.mjs`, `recordReply` moves New, Maybe or Passed to Pursue when a non-preview reply carries an `attachment`. Leaving Passed also clears `trashPending`.
- Pursue, Applied, Interviewing and Offer stay as they are.
- `noteReplyBack` no longer drops Pursue to Maybe when a resume was sent. The owner chose this; the row is still badged.
- `sendReply()` in `app.ts` syncs `editStatus`, so a later save can't send the old status back. A status picked in the form but not saved still wins.

## Where it is

- **Commits:**
  - `d182ca0` inline location
  - `1e19665` round 1 fixes
  - `59cc430` round 2 fixes
  - plus two merges of main and this note
- **Verified by:**
  - `npm test`: 196/196 after merging main.
  - `npm run build`: clean.
  - Local preview on the Chungus mail DB at port 4317. The owner saw three renders and approved each one: the multi-city links with a map open, "Remote", and "Plano, TX · Hybrid".

## Reviews

- **Round 1:**
  - Copilot was out of quota.
  - CodeRabbit was rate-limited.
  - Codex raised 2 P1s: the stale `editStatus`, and unmappable locations reading Remote. Both were fixed.
  - A review agent found the same location issue plus a missing `trashPending` assertion. Both were fixed.
- **Round 2:**
  - Codex raised a P2: a mapped city dropped its work mode. Fixed with the owner's approval.
  - A review agent found:
    - an unsaved status being overwritten (fixed);
    - "Hybrid, N days remote" reading Remote (fixed);
    - raw template text or URLs (fixed);
    - a stale comment (fixed).
- **Round 3:** Codex was asked to review `59cc430`. A third review agent was stopped when the landing session took over the PR.

## Loose ends

1. **Round 3 is incomplete.** Codex's round-3 result on `59cc430` was not collected here. The landing session should read it before merging.
2. **An untracked `docs/comp/` sits in the main checkout.** It is not from this session and was not touched.
3. **No Figma file exists for jobbylooky.** The owner deferred Figma on 2026-10-01, so the new received line is in no design file.

## Next agent: start here

1. Read Codex's latest review on #23, then write the scorecard, merge and deploy.

## Decided by the owner

- "Commit, drop the repeat": the location appears once, in the top line.
- "Resume replies stay Pursue": an answer to a resume reply keeps Pursue.
- "Add the one word": the work mode shows beside a mapped city.

## Proposed rule changes

None.
