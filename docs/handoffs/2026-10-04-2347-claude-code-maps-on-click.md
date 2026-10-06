---
date: 2026-10-04 23:47 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: maps-on-click (main checkout, no worktree), deleted after merge
pr: https://github.com/eikerd/jobbylooky/pull/11
state: merged (one review round of three; the owner said "fix and merge")
deployed: Chungus deploy of the merge commit follows in this session; the result (md5 against origin/main) is in the closing message to the owner, not here
loose_ends: 2 (listed below)
supersedes: none (the 2026-10-02 note covers resume work)
---

# Address maps load on click, so Claude's browser stops asking per action

## What changed, and why

The owner was tired of approving every action Claude's built-in browser took on `chungus.tail1d505c.ts.net`. The prompt read "Site-level permissions are disabled for this site. You'll be asked for each action."

The allow list was not the cause. That origin is already in the desktop app's allowed sites, with private-network trust pinned to `100.71.57.118`, which is what it resolves to. The app's own code (`app.asar`, the check before "This site requires per-action approval") turns off site-level trust whenever a page's frame tree contains a frame from another origin. For clicks and typing, it also does so for `about:blank`, `about:srcdoc` and `data:` frames. Every pitch with a street address rendered two `maps.google.com` iframes, and 68 of the 136 pitches have one.

- The two map iframes now render only after **Show map** is pressed. Until then the section shows the address link and a `button secondary`.
- They stay out of the DOM entirely (`@if`). `loading="lazy"` is not enough, because a lazy iframe is still a frame.
- Revealed maps live in a `shownMaps` signal keyed by pitch id and address. Nothing is persisted, so a reload starts with every map closed.
- `.claude/launch.json` runs `npm run build`, then the server under the `.nvmrc` Node with the Chungus mail database, so the desktop preview pane can start the app.

## Where it is

- Commits (squashed on merge):
  - 004c4e1 fix: load address maps on click so pages carry no foreign iframes
  - 6d00b14 chore: preview launch config for the local server
  - bc4b478 chore: preview config builds the frontend before starting the server (Codex)
- Files: `src/app/app.html` (the map section), `src/app/app.ts` (`shownMaps`, `showMap`), `.claude/launch.json`.
- Verified by:
  - `npm run build` passes and `npm test` passes 111/111 on Node 22.23.2. Three server tests had failed only because `node_modules` was stale; `npm ci` fixed them.
  - Local preview on a pitch with an address in the email: before the click, `document.querySelectorAll('iframe').length === 0` and "Show map" is visible. After the click, both maps load. The owner saw both renders.
- Not verifiable locally: the preview runs on `localhost`, where the browser does not apply this check. The real test is clicking around a pitch with an address on Chungus after the deploy.

## What is deployed

See the closing message. It records the Chungus deploy of the merge commit (README "Chungus deployment": rsync a clean `origin/main` checkout to `/home/eikerd/jobbylooky/`, then `docker compose -f deploy/docker-compose.yml up -d --build`) and the md5 comparison.

## Loose ends

- **Figma:** jobbylooky has no Figma file (the owner deferred Figma on 2026-10-01). The new "Show map" button is in no design file.
- **Reviewers:** only Codex reviewed, and it found one issue, which was fixed. Copilot could not review because the requesting account had used its quota. CodeRabbit (free plan) hit its rate limit. The ECC Tools bot posted generic taxonomy notes with nothing to act on.

## Next agent: start here

1. If Claude's browser still asks per action on a Chungus pitch page, run `document.querySelectorAll('iframe')` on that page first. Any frame from another origin, including one an email body adds, brings the prompt back. The allow list and trust pins are not the cause.

## Decided by the owner

- "Load maps on click (my recommendation). Show a "Show map" button where the maps are now, and only add the iframes when it's pressed." This chose option 1 of the three offered.
- Clicking **Create PR** after seeing the render was taken as approval of the render.
- "fix and merge and delete worktree": merge after one review round. No worktree existed; the branch lived in the main checkout and was deleted after the merge.

## Proposed rule changes

- In `rules/chungus-browser.md`: add that a page containing a frame from another origin (or `about:blank`/`srcdoc` when clicking or typing) always needs per-action approval in the built-in browser, whatever the allow list says. Check for iframes before re-adding sites or trust pins.
