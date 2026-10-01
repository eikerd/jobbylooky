# Continue Jobbylooky — Codex or Claude

Read the newest `docs/handoffs/` note first; older notes describe snapshots, not current state. The application source is this repository. Do not recreate it from the original chat or staging folder.

## Run

Use Node 22.23.2 (`.nvmrc`), not the machine's default Node 20.

```sh
npm ci
npm test
npm run build
MAIL_DATABASE_URL=http://192.168.42.180:8082 npm start
```

Preview: http://127.0.0.1:4317/jobby/. Check for an existing listener before starting another process. `npm run dev` watches the Angular build; the HTTP server is separate. Backend changes require restarting the server. Data is re-screened on startup without changing saved decisions.

For a fresh clone without the private cache, omit MAIL_DATABASE_URL and paste a synthetic email to test. Never copy the owner's inbox into a fixture, issue, PR, screenshot, or source archive. `data/` holds the private cache and original imports; it is intentionally not in GitHub. Existing data remains on this Mac at `/Users/ernestoikerd/repos/work/jobbylooky/data/`.

## Architecture

- Angular standalone components: `src/app/app.*` manages folders, pitches, notes and imports; `profiles*` manages recruiter/company views.
- `server/index.mjs`: native Node HTTP API, static files under `/jobby/`, host/origin checks and minute-based mail sync.
- `server/mail-worker.mjs`: SELECT-only reads from the existing libsql mail log, with old/new schema compatibility.
- `server/store.mjs`: atomic JSON replacement, deduplication, decisions, grouping overrides and startup re-screening.
- `server/screen.mjs`: deterministic explanations, employment type, geographic preferences and tentative employer clues.
- `server/groups.mjs`: conservative pairwise job grouping and observed message history.
- `email-body.ts`: readable, single-line metadata while preserving original prose.
- `location-map.ts`: street-address thumbnails only. City names do not produce maps. Addresses found in email bodies are labeled separately from the job location.
- `source-icon*`: sender-domain icons; these identify a source, not an employer.

The app sends email only when the owner writes a reply from a pitch (optionally attaching the resume in `resume/`); it does not alter Gmail labels, archive messages, or automatically triage the owner’s mail. Deterministic matches are clues, not verified employers or vacancies.

## Preferences already implemented

- Compact hacker-dark UI, small type, target favicon. Newest received first; days old before dates.
- Angular plus Node.js, remote first; Dallas and nearby cities remain reviewable. Westlake TX is specifically interesting even when the stack does not fit.
- Java and Microsoft development stacks can be skill mismatches. AT&T, Chase and Bank of America are caution notes, not automatic rejections.
- Fidelity clues require at least two of Westlake TX, Merrimack NH and Smithfield RI. Chase clues require Raleigh plus Ohio. These are owner-supplied, unverified correlations; explicit client names are never overwritten.
- Explicit full-time/permanent roles are blue. Contracts, hourly, freelance, contract-to-hire and unclear terms retain normal styling. W-2 by itself is insufficient.
- Grouped jobs retain each original recruiter pitch, notes and status. Email history is not proof of a continuous vacancy.

## Work not implemented / limitations

- Calendar heatmap plus job posting timeline was proposed, not built or approved as a final layout. Ask what to build next instead of implying it already exists.
- Exterior/front-door photos are not implemented. Two small street/satellite map iframes and an external Maps link are implemented. Google embed behavior and street-address extraction are heuristic; verify matches. No city-only maps.
- The owner broadened interest to DFW; location screening remains a conservative city heuristic rather than a geographic metro boundary. Denton and other unlisted suburbs need a dedicated follow-up.
- Newsletters imported before newer ingestion exclusions can still exist in the private cache. Preserve decisions; do not silently delete historical entries.
- No authentication beyond private-network host/origin checks. Do not expose publicly.
- No deployed Jobbylooky instance was established during this handoff. GitHub main is not a deployment.

## Resume

The owner's resume lives in several places (Google Docs, `resume/` here, LinkedIn, two Indeed accounts, Dice). Any resume change follows [docs/resume/UPDATE-WORKFLOW.md](resume/UPDATE-WORKFLOW.md), which lists every location and how to log in to each.

## Companion repository and deployment

The companion `eikerd/chungus` change adds full job-body retention, truncation/thread fields, and an nginx `/jobs/` route (moved to `/jobby/`, behind basic auth, in the follow-up Chungus PR). It does not alter finance extraction. The latest handoff links both PRs.

For deployment, follow this README and Chungus's own instructions. Use clean merged source, inspect actual server files for drift, and preserve private state. A fresh Docker volume will not contain this Mac's historical imports or decisions; plan that migration explicitly before switching the owner's daily use.
