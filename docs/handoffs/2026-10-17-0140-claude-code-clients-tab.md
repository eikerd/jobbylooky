---
date: 2026-10-17 01:40 America/Chicago
tool: claude-code
model: claude-fable-5-1
repo: eikerd/jobbylooky
branch: feat/clients-location-fingerprints
pr: https://github.com/eikerd/jobbylooky/pull/30
state: merged
deployed: the Chungus deploy of the merge commit follows this note's merge in the same session; its md5 result is in the closing message to the owner
loose_ends: 4 (listed below)
supersedes: none
---

# Clients tab: name the end client by the set of cities a posting lists

## What changed, and why

A recruiter's pitch rarely says who the client is, but a client lists the same offices every
time. The owner (2026-10-17): "if they have locations in like Plano, Charlotte, and like
Seattle … I can reply and say, what company is it? When I'm told, we can log that association
of those three cities specifically as a fingerprint of the identity of that company and
therefore every time we see a posting with those cities, we know who it is."

The new **Clients** tab (sidebar, between Companies and Phrases) lists every set of two or
more cities any pitch names, with how many pitches and recruiters carry it and when it was
last seen; the owner types a name on a row once a recruiter has answered, and from then on
every pitch naming exactly that set shows the client in its header as **Chase Plano** by
location: the name plus the North Texas office. This makes data of what `server/screen.mjs`
still carries as two hard-coded clues ("Possible Fidelity", "Possible Chase").

Review found eleven real defects before merge, all fixed: the city parser reused the map
helper and lost cities past its five-map cap; work-mode prose ("Onsite in"), ZIPs, a
preference in parentheses, title-case and dotted state codes each broke matching; typed
names were lost on leaving the tab; a long name hid Remove; the view lacked button styles.

## Where it is

- Commits: e634d70 (feature), 8c8bb6b, 30fdddf, 2112084, 1314fd0 (review fixes), then this
  note and reports/pr-30.html.
- Files that matter: server/clients.mjs (validation, fingerprint key), server/store.mjs
  (`clients`, addClient 409 on a taken set, removeClient), server/index.mjs (`/api/clients`),
  src/app/clients.ts (rows, matching, sorting, `clientLabel`), src/app/clients.component.ts +
  clients.html + clients.css, src/app/location-map.ts (`cityStates`, `stateCode`: one city
  parser for maps and fingerprints), src/app/models.ts (`Client`), tsconfig.json
  (`rewriteRelativeImportExtensions`, so a node-tested module may import a sibling by its
  `.ts` name), tests/clients.test.ts, server/clients-store.test.mjs.
- Verified by: `node --experimental-strip-types --test server/*.test.mjs tests/*.test.ts` on
  Node 22: 295 pass (22 new); `ng build` clean; CI `validate` green on every push; the tab,
  the naming flow, the header label, drafts surviving a pitch visit, and Remove beside a
  34-character name all checked in a browser against a copy of the real data (39 city sets).

## What is deployed

See the closing message: the merge commit is deployed to the jobbylooky container on Chungus
(README "Chungus deployment": rsync a clean `origin/main` checkout, then
`docker compose -f deploy/docker-compose.yml up -d --build`) and md5-checked against
origin/main after this note merges.

## Loose ends

1. `docs/comp/` is still untracked in the main checkout (the compensation-tool session's work).
2. Greptile reviewed only the first commit (six findings, all fixed) and posted nothing on the
   four later pushes; Copilot was out of quota for the day; CodeRabbit's Free plan gives a
   walkthrough with no line findings. Codex carried the later rounds (three rounds and a
   fourth pass). The scorecard says so.
3. Figma: jobbylooky has no Figma file (the owner deferred it), so this visual change reached
   no Figma file.
4. The two hard-coded clues in server/screen.mjs ("Possible Fidelity" on two of Westlake TX /
   Merrimack NH / Smithfield RI, "Possible Chase" on Raleigh + Ohio) still fire beside the new
   data. A follow-up card exists in the owner's app ("Seed Fidelity and Chase fingerprints,
   retire the hard-coded clues"); its first attempt stopped correctly because this PR was not
   on main yet.

## Next agent: start here

1. Run the follow-up above once this is on `origin/main`: seed the two clients in the store
   the way DEFAULT_TRACKED_PHRASES is seeded, remove the two clue blocks and their tests, and
   ask the owner whether a two-city Fidelity variant is wanted (the old rule fired on two of
   three cities; the tab matches the exact set).
2. A single-city fingerprint is refused on purpose (`MIN_CITIES = 2`: Dallas is everyone's).
   If the owner wants a one-city client (Merrimack, NH alone is Fidelity), that constant and
   the server validator are the two places to change.

## Decided by the owner

- "Wait for PR 29 to land" — the shared checkout belonged to the delete-phrases session; the
  tab was built and rendered in a scratch copy, then wired after the merge.
- "Clients" — the tab's name; Companies already means recruiting companies.
- "Same set of cities" — a posting matches a saved fingerprint on the exact set, not on two
  shared cities.
- Columns: Pitches (count), Last seen (heat age), Recruiters (count); the client's name shows
  beside the company in the pitch header.
- "if it's a multi-location place like Chase and it's got different locations like Plano,
  Pittsburgh, or something, just show Chase Plano. Like, we just care about the local version."
- "The Clients tab renders are approved; commit them as shown once PR 29 has merged."

## Proposed rule changes

None.
