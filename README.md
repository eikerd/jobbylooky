# 🎯 Jobbylooky

**Agent handoff:** start with [docs/START-HERE.md](docs/START-HERE.md) and the newest note in [docs/handoffs](docs/handoffs/).

A small Angular + Node.js job-opportunity inbox prioritizing fully remote Angular work, including Node.js, followed by Dallas. Plano and Frisco are conditional options. Node.js is a desired growth area and does not lower an otherwise strong remote Angular fit; backend depth still needs assessment. Dallas roles are potential fits, while hybrid or conditional remote arrangements need review. Stated AT&T, Chase/JPMorgan, or Bank of America clients are caution flags for review, never automatic mismatches or eliminations; incidental mentions need client verification. Plano is also conditional, not an automatic rejection. All flagged pitches retain their full email and user-controlled status. Banking in Plano gets an explicit client warning. Required Java and Microsoft development stacks (.NET, C#, ASP.NET/ASP) are mismatches. Optional Microsoft skills or consuming an existing .NET API need review; Azure, VS Code, and Microsoft tooling alone do not disqualify an Angular role. Unknown locations, nearby cities, truncated email, job-board summaries and multi-role messages need human review. Screening is deterministic and explains its reasons; it is not a claim of eligibility or a replacement for the job description.

## Run locally

Use the Node version in `.nvmrc` (22.23.2), then:

```sh
npm ci
npm test
npm run build
MAIL_DATABASE_URL=http://192.168.42.180:8082 npm start
```

Open http://127.0.0.1:4317/jobby/. `npm run dev` rebuilds the Angular app while the separate Node server runs. The production build is mounted at `/jobby/` locally and on Chungus; `/jobs/` (the path before 2026-09-18) redirects there. The default bind is loopback.

Without `MAIL_DATABASE_URL`, the app still supports pasted emails and previously imported messages, but automatic monitoring is disabled. `PUBLIC_ORIGIN` defaults to the local origin and accepts a comma-separated list; `BIND_HOST`, `PORT`, and `DATA_DIR` are optional deployment settings.

## Replying to recruiters

A pitch's **Reply** box sends a threaded answer through Gmail SMTP (`In-Reply-To`/`References` with the thread root first, so the mail-worker files the recruiter's answer under the same row). The recipient always comes from the stored pitch. When a later message in that thread arrives from someone else, the row gets a "↩ replied" badge and moves from New or Pursue to Maybe; other statuses are left alone.

Sending needs the Gmail app password, from 1Password (the mail-worker's item), in the environment:

```bash
SMTP_USER="$(op read op://chungus/mail-worker/IMAP_USER)" SMTP_PASS="$(op read op://chungus/mail-worker/IMAP_PASS)" MAIL_DATABASE_URL=http://192.168.42.180:8082 npm start
```

Without them the Reply box says sending is not set up. `MAIL_SEND_MODE=preview` records replies without sending anything, for rendering and testing.

## Existing mail-worker integration

Gmail → Chungus's existing IMAP mail-worker → `budget-lens_mail_messages` → Jobbylooky.

The Node process checks the existing libsql mail log once a minute and reads only matching technical job subjects from the last 60 days. Every request to that shared database is SELECT or schema inspection. Decisions, notes, next actions and follow-up dates are stored independently in `data/opportunities.json` using atomic replacement. They remain when the worker's mail-log retention removes older messages. A database error leaves existing opportunities and the last successful check intact and is surfaced in the UI.

The companion Chungus change preserves full job bodies while retaining the existing 16 KiB cap for other mail, records truncation explicitly, and keeps the root RFC Message-ID from reply headers. It does not change finance extraction or enable an LLM call. Jobbylooky supports both the old and new schema during deployment. Legacy 1,024-character records are marked incomplete; previously lost body text cannot be restored by replay. Original messages can be restored through the user's existing Gmail connector into the private, ignored local cache. An incomplete stored body is explicitly marked in the reader.

Repeated messages deduplicate by RFC Message-ID. New worker mail with References/In-Reply-To headers groups into a conversation; Gmail-imported messages can group by Gmail thread. Legacy worker mail lacks thread headers and remains separate. Cross-recruiter matches appear as derived job groups, preserving every original pitch and its own status, notes, pay and email. Automatic groups are labeled likely and require compatible locations, no explicit client/requisition conflict, substantial overlapping requirements, and stricter requirement matching when pitches are more than 45 days apart; generic titles alone do not qualify. Every member must match every other member to avoid accidental transitive merges. Grouping overrides and separations persist in the private cache, survive reimports, and can be reverted. Folder membership and actions remain pitch-specific; each folder shows a job once when at least one pitch belongs there, sorted by its newest matching pitch. Multi-role emails remain one clearly flagged review item.

The UI refreshes every 30 seconds. Every folder sorts newest received first, regardless of fit. Age is shown before the date and counts local calendar days since receipt, rather than claiming to know when the vacancy was posted. Selecting an opportunity displays the complete available email as inert plain text, including signatures and URLs. Screening uses a separate cleaned copy. Pursue/Maybe/Pass and all application stages are local decisions: the app never sends mail on its own, deletes, archives, marks mail read, or alters labels. The one exception is a reply you write and send yourself from a pitch (see Replying to recruiters). Follow-up dates are shown in the queue; no reminder messages are sent.

## Recruiter profiles and posting history

Recruiters are grouped by normalized sender email and sorted by the sender's stated name. Recruiting-company views group sender domains; personal email addresses are explicitly unassigned, and known relay addresses are labeled unverified. Hiring clients remain separate from recruiting firms. No name or corporate identity is invented from an address. Profiles show imported pitch counts, distinct job groups, trailing-30-day pitch frequency, the imported date range, and linked offerings newest first.

Each job group includes first and latest observed email dates, the number of dated emails, its observed span in Dallas calendar days, the longest gap between emails, and a timeline linking to the original pitches. Strong matches may recur across months. A month-spanning group is evidence of repeated outreach or a renewed search, not proof of continuous vacancy duration. Previously stored thread messages without individual dates are not assigned invented historical dates; original imports can restore their dated history. New messages retain their individual source and receipt time, and replay deduplicates them by message ID.

## Gmail organization

The user's existing `WORK OPPORTUNITY` label is the proposed Gmail view. A label adds organization without removing messages from INBOX, which is the mailbox the current worker watches. **Do not add a filter that skips INBOX** without also adapting the worker's ingestion. Gmail does not support custom category tabs; the label can be used in a Multiple Inboxes section. No Gmail filters, labels, or inbox settings were changed during development.

## Chungus deployment

URL: http://chungus.local/jobby/ (canonical: https://chungus.tail1d505c.ts.net/jobby/)

The app has its own Docker Compose project in `deploy/docker-compose.yml`, joins the existing `chungus_chungus-network`, and publishes no host port. Chungus nginx forwards `/jobby/` to `jobbylooky:4317` behind HTTP basic auth (credentials in 1Password, item `chungus / jobbylooky`; the htpasswd file lives only on the Pi). `PUBLIC_ORIGIN` lists every origin the app answers on; Host and Origin are checked and cross-site requests rejected.

Deploy only clean, merged source:

1. `rsync` a clean `origin/main` checkout to `/home/eikerd/jobbylooky/`, excluding `.git`, `node_modules`, `work`, `data`, `dist`, `.angular` and `deploy/.env`.
2. `deploy/render-env.sh` renders `SMTP_USER`/`SMTP_PASS` from 1Password into `/home/eikerd/jobbylooky/deploy/.env` (mode 600). Without it the app runs with replies switched off.
3. `docker compose -f deploy/docker-compose.yml up -d --build` on the Pi.
4. First deploy only: copy the private cache (`data/opportunities.json`, `data/import.json`) into the `jobbylooky-data` volume while the container is stopped, owned by the `node` user. Never replace an existing volume's cache with an older one.
5. Chungus nginx: `nginx -t`, then reload. Verify `/jobby/` asks for the password, loads, and shows the connection status.

Private cache files and email text are gitignored and excluded from the image.

## Verification

`npm test` covers screening, HTML-to-text conversion, pay periods, location ambiguity, multi-role email, duplicate imports, restart persistence, validation, libsql pagination, legacy schema fallback and reader failures. Browser checks cover the rendered queue, triage, editing, persistence, and narrow layouts. The companion worker tests check body retention without changing finance classification. See the session's review notes for actual results and outstanding deployment steps.
