---
date: 2026-10-09 12:30 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: feat/job-link-check, worked from a temporary clone in the session's scratch folder (the main checkout held another session's uncommitted `right-justify-fit-pills` change); branch deleted after merge
pr: https://github.com/eikerd/jobbylooky/pull/21
state: merged (three review rounds, scorecard reports/pr-21.html)
deployed: the Chungus deploy of the merge commit and the launchd install on the owner's Mac follow the merge in this session; results (md5 against origin/main, agent loaded) are in the closing message to the owner
loose_ends: 5 (listed below)
supersedes: none
---

# Daily link sweep: dead links and closed jobs flagged, closed New pitches passed, postings aged

## What changed, and why

The owner, 2026-10-09: by the time they look at an Indeed or other posting, they need to know
"if the link is dead or if the job is dead … if that's the case … we can just delete them",
and for live ones "how long it's been in effect. So we have an idea of like how aged these
things can get."

- **Mac, 4am daily** (`mac/link-sweep.mjs`, launchd agent from `mac/link-sweep-install.sh`):
  checks every visitable link in unpassed pitches. Indeed job pages are read in the Mac's
  real Chrome; everything else is fetched by node. `mac/README.md` "Link sweep" has the
  mechanics and the Indeed pitfalls.
- **Which links** (`server/job-links.mjs`): links that act when opened are never visited:
  unsubscribe, opt-out, surveys, "click here if interested", Indeed's Yes/No/Maybe, profile
  and pay links, and unlabelled click trackers. Only *posting* links (Indeed "View job", ATS
  pages, LinkedIn job views) can close a pitch. Others are only checked for being dead.
- **Server** (`server/link-checks.mjs`, `data/link-checks.json`): live / closed / dead per
  link. Dead means 404/410 or a vanished domain on two sweeps in a row. A **New** pitch whose
  postings have all ended is passed, and its emails go to Gmail Trash like any Pass. Maybe,
  Pursue and later stages are flagged only. A pitch is passed automatically at most once.
  Endpoints: `GET /api/links/index`, `POST /api/links/results` (auto-pass only on the batch
  marked `final`).
- **UI**: a row chip ("open 52d" / "✕ closed" / "✕ dead link"). In the email, an ended link is
  replaced by "✕ job closed" / "✕ dead link (host)", and an open posting shows its age. The
  pitch view says "Passed automatically …" with the reason. A new **Postings** view in the
  sidebar has one sortable line per job, longest open first.
- **Review hardening:** links are default-deny. Pitches the owner engaged with or restored are
  never auto-passed. Closed or dead must be read on two different days. Web checks cannot
  reach private addresses, through DNS or a redirect (`server/safe-get.mjs`). Auto-pass is
  two-phase and recovers after a crash. Indeed visits stop for the run once Indeed blocks.

## Findings worth keeping

- Indeed: plain fetch → 401 (`from=bot-detection-anonymous`); headless Chrome → 403 "Request
  Blocked". Headful Chrome passes **only in a fresh profile per page**: after visiting the front
  page (or one job page) the cookies turn the next job page into a sign-in wall.
- `"showExpiredHeader":true|false` is on every Indeed job template; `isJobExpired` is only on
  some. Expired pages drop `datePosted`, so a closed job's age exists only if a sweep saw it
  open first.
- Ceipal `/articles/…` links in recruiter signatures are logo images, not postings.
- First real run (local copy of Chungus's 290 pitches, 26 unpassed with links): 6 Indeed jobs;
  5 open, 1 expired (General Dynamics UI/UX, status Pursue, so flagged, not passed). Two
  Inclusion Cloud jobs posted Feb 25–27 are still open after ~225 days.

## Where it is

- Files: `server/{job-links,link-checks,link-verdicts,safe-get}.mjs` (+ tests), `server/index.mjs`,
  `mac/link-sweep.mjs`, `mac/link-sweep-install.sh`, `src/app/{link-state.ts,links.css,
  postings.component.ts,postings.html,postings.css}`, `src/app/app.{ts,html}`.
- Verified by: `npm test` 181/181 and a clean `ng build`; dry and real sweeps against a local server seeded from
  Chungus; auto-pass fired once and not on the next sweep; renders approved by the owner.

## Loose ends

1. **Indeed has this Mac behind a Cloudflare challenge** ("Additional Verification Required"),
   reached after about 60 automated visits during development on 2026-10-09. The sweep never
   answers a challenge. After the first blocked page it skips Indeed for the rest of the run,
   so Indeed jobs report unknown until the block lifts. If it never lifts, the browser
   approach needs rethinking: do not add CAPTCHA solving.
2. **Figma:** jobbylooky still has no Figma file (deferred by the owner, 2026-10-01). This PR adds
   a row chip, in-email link markers, an auto-passed line and the Postings view.
3. **Reviewer coverage:** Copilot was out of quota, and CodeRabbit was rate-limited and on the
   free plan (summary only). The rounds were a code-review agent, then Codex twice.
4. **The main checkout holds another session's uncommitted `right-justify-fit-pills` change**
   (`src/app/app.{html,css}`), untouched by this session. It moves the fit pill within the
   same `.row-bottom` that now carries the job-state chip, so expect a small merge there.
5. The root `README.md` still says nginx guards `/jobby/` with basic auth. Chungus answers
   without credentials (HTTP 200), and Codex was misled by that line. Correct it in a docs PR.

## Next agent: start here

1. Sweep failing? `tail ~/Library/Logs/jobbylooky-link-sweep.log`, then
   `node mac/link-sweep.mjs --dry-run` from the repo. Indeed lines saying "sign-in or blocked"
   mean Indeed changed its bot handling; see the README before changing the browser setup.
2. After merging any change to `mac/link-sweep.mjs` or `server/link-verdicts.mjs`, re-run
   `mac/link-sweep-install.sh`: launchd runs a copy, not the repo file.

## Decided by the owner

- Dead/closed: "Auto-pass and trash email"; Maybe/Pursue flagged only (answer to the session's question).
- Boards: "Every link". Narrowed by Claude to never visit side-effecting links; said so in the session.
- Schedule: "Yes, at 4am" with a visible Chrome window.
- Renders: "Yes, commit it" (row chip and link markers); extras "Auto-passed note, Aging stats, Host on dead links", then "Yes, commit and ship".

## Proposed rule changes

- none
