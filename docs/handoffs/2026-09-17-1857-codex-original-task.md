# Jobbylooky — project continuation brief

Destination supplied by the owner: https://chatgpt.com/s/cx_6aac7c304be08191beb7efdc741a82a1
Prepared September 17, 2026. This is a handoff artifact, not evidence of a message sent to that conversation.

## Purpose and user requirements

Continue the existing app that monitors, evaluates, triages, and manages Gmail job opportunities. Reuse the existing YNAB mail-worker pipeline. The intended deployment is Chungus; do not scaffold a replacement before inspecting the existing implementation.

Screening preferences:
- Angular developer building Node.js skills. Fully remote Angular/Node.js work is the first priority, Dallas next, Plano or Frisco conditional.
- Required Java development is a mismatch. Required .NET, C#, ASP.NET, or ASP development is also a mismatch. Optional skills or consuming existing APIs warrant clarification. Microsoft tooling alone does not disqualify a role.
- Flag AT&T, Chase/JPMorgan/JPMC, and Bank of America/BofA clients for review only. The owner clarified: "I just want it flagged. I don't want it automatically eliminated." These employer and Plano flags must never automatically reject, hide, pass, or remove a pitch; preserve full email access and user-controlled status. Extra scrutiny for banking in Plano, especially unnamed clients. Distinguish a stated hiring client from incidental experience requirements or recruiter signatures.
- Hybrid, travel, delayed remote, or geographically restricted remote arrangements need review. Do not silently equate them with fully remote work.
- Node.js should be a positive match, without claiming proficiency the owner has not stated. Current staged implementation still reviews Node-only roles.
- Fit assessments must explain their evidence. Do not automatically pass, delete, archive, or contact anyone on the user's behalf.

User interface:
- Compact, discreet hacker-dark UI: near-black/green, small monospace text, no giant cards. Target favicon chosen by owner: 🎯.
- Opportunities sorted newest first, independent of fit. Show days old prominently and retain actual dates.
- Clicking a pitch shows the entire available email body, including links and signatures, as inert text. Make missing/truncated source content explicit.
- Email metadata reads on one line: `Position: UI/Angular developer`, `Location: Remote`, `Duration: 12 months contract TO HIRE`. Preserve prose and all source content. Long fields may scroll horizontally.
- Aggregate likely identical vacancies across recruiters, preserving each original pitch's sender, rates, notes, status, and email. Provide manual grouping/separation controls. Generic matching titles alone are insufficient.
- Show repeated outreach over time: first/latest observed message, age/span, gaps and linked message history. A month-separated repeat suggests ongoing or renewed search; it does not prove continuous vacancy duration.
- Recruiter profiles use stated names and normalized emails. Group recruiting companies by sender email domain; distinguish hiring clients, personal addresses, and unverified job-board relays such as Dice. Show agents, offerings, frequency, and overlapping jobs.
- Gmail organization proposal uses the existing WORK OPPORTUNITY label. No Gmail settings were changed. The current worker watches INBOX, so do not introduce skip-inbox filtering without adapting ingestion.

## Existing implementation

Primary project: `/Users/ernestoikerd/repos/work/jobbylooky/`
Staged copy: `/Users/ernestoikerd/Documents/Codex/2026-09-17/gmail-plugin-gmail-openai-curated-remote-4/work/jobbylooky-review/`
Existing local preview: `http://127.0.0.1:4317/jobs/`
Intended deployed URL: `https://chungus.tail1d505c.ts.net/jobs/`

Angular 22 frontend and Node 22.23.2 native HTTP server. Use the version in `.nvmrc`; the default Node 20 is incompatible. `npm test`, `npm run build`, and `npm start` are the main commands. The build has `/jobs/` as its base path.

Key files:
- `server/screen.mjs`: deterministic fit rules and evidence; keeps screening text separate from the full displayed body.
- `server/store.mjs`: atomic private JSON persistence, import deduplication, grouping overrides, user decisions, and startup re-screening that preserves decisions.
- `server/groups.mjs`: conservative matching of job requirements, client/location conflicts, dated recurrence history, and stricter matching across long gaps.
- `server/mail-worker.mjs`: read-only integration with the existing libsql mail log.
- `src/app/app.*`: compact queue, job details, triage, grouping, and profile navigation.
- `src/app/profiles*`: recruiter/company identities and views.
- `src/app/email-body.ts`: joins split metadata into single-line key/value fields.

The worker sync reads shared mail data; app decisions are separate private state. Preserve `data/opportunities.json`, originals/import data, user notes, statuses, follow-up dates, and grouping decisions. Never upload these private data files with a code patch.

A companion worker/nginx change was prepared in `/Users/ernestoikerd/repos/servers/chungus-wt-jobbylooky`, branch `feat/jobbylooky-mail`. It preserves full job-mail bodies, records truncation/thread identity, and prepares the `/jobs/` route. Reinspect this checkout and its current ownership/status before changing it. No deployment was completed by this session.

## Exact pending work and verification

At the last comparison, the original project's profile, posting-history, and email-formatting files matched the staged copy. The remaining patch contains only README.md, server/screen.mjs, server/screen.test.mjs, and server/store.test.mjs: the latest location/stack/employer preferences and regression coverage.

`jobbylooky-profiles-and-history.patch` is the cumulative patch filename retained from earlier work; despite its name, only the four files above currently remain. `jobbylooky-patch-manifest.json` records before/after SHA-256 hashes. It is a patch against the existing project, not a complete application.

64 tests passed after the latest screening change. The preceding Angular production build passed with no warnings; no frontend source changed in the latest screening step. Restricted-environment native caching required temporarily disabling Angular CLI cache during that build, then restoring configuration. That workaround is not in the patch. The latest screening patch passed `git apply --check` against the original project.

The session cannot write to the original project: repeated temporary-file probes returned EPERM. Reattaching the folder did not grant access. Starting a staged preview server was also denied. Latest screening changes are therefore staged, not live. Current live UI build was not reverified. No commit, PR, merge, or deployment was made for this pending patch.

## First actions in the project context

1. Inspect current repository status, applicable instructions, handoffs, and active work. Confirm project write access; do not keep retrying a denied sandbox operation.
2. Compare original file hashes against the supplied manifest. If they match, check and apply the patch in the authorized project checkout/worktree. If source has moved, review and reconcile rather than overwrite.
3. Run tests with Node 22.23.2. Preserve all private state; verify cached opportunities re-screen without losing user decisions.
4. Build and render the actual project. Verify recruiter/company navigation, full email metadata formatting, recurrence history, newest-first order, and updated fit reasons. Report honestly what is live versus merely prepared.
5. The owner requires visual approval before committing visual changes. Follow the project's existing review, PR, and deployment requirements. Deploy only clean merged source; pushing is not deployment.

If the destination conversation cannot access local files, attach this bundle and provide the existing project source separately through the project environment. This bundle intentionally excludes inbox content, credentials, node_modules, and a full source archive.
