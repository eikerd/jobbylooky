---
date: 2026-10-06 10:19 America/Chicago
tool: claude-code
model: claude-fable-5-1
repo: eikerd/jobbylooky
branch: feat/pass-trashes-gmail (main checkout, no worktree; shared with the Pass→Gmail-trash and compact-layout work)
pr: https://github.com/eikerd/jobbylooky/pull/12 (draft, opened by the 2026-10-05 session; these commits join it under the one-open-PR rule)
state: pr-open
deployed: no
loose_ends: 3 (listed below)
supersedes: none (2026-10-04-2347 covers the maps-on-click change this builds on)
---

# Maps follow the job's Location field; agency pages map their offices; zoom by region

## What changed, and why

The owner: "The EMAIL address lookup triggers off the incorrect address. it maps whatever agency is presenting and their office address which is irrelevant." The old map scanned the whole email for street addresses, so a pitch for Plano showed the recruiter's office in Somerset, NJ.

Sanity check of the stored mail before changing anything: 146 of 195 pitches carry a `Location:` / `Locations:` / `Work setting:` line, and the server already stores that line as the pitch's `location`. 83 pitches have a street address somewhere in the body; nearly all are agency signatures (Empower's Somerset office 27 times, Tanisha's Iselin office 7 times, Apetan's three New Jersey and Ontario offices).

- **A pitch maps only its Location field.** Each "City, ST" in a multi-city field gets its own map ("Charlotte, NC / Iselin, NJ / Irving, TX" shows three). A street address in parentheses wins ("Irving, TX (401 Las Colinas Blvd W Bldg A)"). Remote, "Not stated" and template junk map nothing. A bare "Plano" is Plano, TX.
- **An agency page maps the offices its recruiters sign with.** Spellings of one address merge ("4 th Floor" and "4th Floor"), the commonest spelling is shown, up to five offices. A job's own `Location:` line is never an office.
- **Zoom is a rule table** in `src/app/location-map.ts` (`ZOOM_RULES`, `STATE_ZOOM`). North Texas → zoom 10; anywhere else → zoom 6. The thumbnails are 200px wide, so at Dallas' latitude zoom 10 spans about 16 miles side to side (an 8-mile radius, the integer zoom nearest the 10 miles asked for) and zoom 6 about 250 miles, the state and its neighbours. North Texas is a Dallas–Fort Worth ZIP when there is one, otherwise a metroplex city in Texas or with no state; "Arlington, VA" and "Belton, TX 76513" are not. The next region is one more row.
- **One street-map thumbnail per place**, revealed on click as before (a foreign iframe makes Claude's browser ask per action). The satellite view showed nothing at these zooms and was dropped after the render. The markup moved from `app.html` into a shared `app-location-maps` component used by the pitch detail and the company page; revealed maps are remembered per pitch or company.

## Where it is

- Commits on `feat/pass-trashes-gmail`, rebased onto the branch's three newer server commits:
  - 38c40f5 feat: maps follow the job's Location field; agency pages map their offices; zoom by region
  - 5669b09 docs: handoff note from the 2026-10-04 maps-on-click session, which was left untracked
- Files: `src/app/location-map.ts` (parsing, offices, zoom rules), `src/app/location-maps.component.ts` (the on-click maps), `src/app/app.html` / `app.ts` / `app.css` (use the component), `src/app/profiles.component.ts` / `profiles.html` (offices on the company page), `tests/location-map.test.ts`.
- `profiles.ts` stays free of runtime imports on purpose: the Node test runner (`--experimental-strip-types`) resolves no extension-less import between source files, so the company's offices are derived in the component, not in `buildProfiles`.
- PR #12's description gained a "Maps follow the job" section.
- Verified by: `npm test` 124/124 and `npm run build` on Node 22.23.2 (after `npm ci` for the branch's source-map-js bump). Local preview on the Chungus mail database: the Plano pitch shows "Job location: Plano, TX" with one map at `z=10` (Plano, Allen, Fairview, Murphy in frame) and no agency address; the apetan.com company page lists four offices and maps Rutherford, NJ at `z=6` (New Jersey, New York, Connecticut in frame). The owner saw the Plano and apetan renders and said "ok pls fix".

## What is deployed

Nothing from this branch. PR #12 is a draft carrying three sessions' work (Pass→Gmail trash, compact layout, maps); the deploy follows its merge (README "Chungus deployment": rsync a clean `origin/main` checkout to `/home/eikerd/jobbylooky/`, then `docker compose -f deploy/docker-compose.yml up -d --build`).

## Loose ends

1. **Two open PRs in the repo:** #12 (this branch) and #13 (`feat/phrase-colors`, five phrase kinds with a crayon picker), against the one-open-PR rule. #13 was opened by the "Tracked phrases neutral yellow setting" session while this one ran; its changes were uncommitted in this checkout at session start, vanished from the working tree at 10:00 when that session switched branches, and are on #13, not lost. Nothing here touched them.
2. **PR #12 is still a draft.** No review rounds or scorecard yet. The Pass→Trash session owns it and its description says Pass→Trash is not yet exercised against live Gmail; this session did not mark it ready.
3. **Figma:** jobbylooky has no Figma file (deferred by the owner on 2026-10-01). The office maps on the company page and the single-thumbnail layout are in no design file.

## Next agent: start here

1. A map in the wrong place: read `mapLocations` in `src/app/location-map.ts`. Order of precedence: a parenthetical street address, then the field as a street address, then "City, ST" pairs, then a metroplex city without a state, then any comma-separated text; everything else maps nothing.
2. A new zoom region: add a row to `ZOOM_RULES` with a `region`, a `zoom` and an `applies(place)` test. The first matching rule wins.
3. On Chungus, maps still need a click, and each revealed iframe brings back the per-action prompt in Claude's built-in browser (see the 2026-10-04 note).

## Decided by the owner

- "it maps whatever agency is presenting and their office address which is irrelevant. We should update each company with its office location, and add the [map] view on each of the agency detail page views but for jobs it should key off the 'Location: ' key thats usually in the text, do a quick sanity check of past emails to be sure."
- "IF its in North Texas, show a map zoomed at the level of showing a 10 mile radius, if its in another place show the zoom at the state level. we might have other settings later"
- "ok pls fix", after the two renders and the question whether to drop the satellite thumbnail: taken as approval of the renders and of the switch to one street map. The question whether office maps also belong on a recruiter's page went unanswered, so they are on the agency page only.

## Proposed rule changes

- `rules/landing.md`: say what a second session does when another session's draft PR is already open in the repo. This session joined #12 under the one-open-PR rule; the other session opened #13 at the same time. The rule as written cannot be followed by both.
- `rules/handoffs.md` names `templates/handoff.md` in `eikerd/central`, but no copy is installed on this Mac (`~/.claude/` has none, and `~/repos/eikerd/central` is not checked out). Install it beside the rules so a session can copy it instead of mirroring the previous note.
