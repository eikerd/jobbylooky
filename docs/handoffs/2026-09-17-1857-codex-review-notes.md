# Recruiter profiles and repeat-posting history

Prepared against `/Users/ernestoikerd/repos/work/jobbylooky/` on September 17, 2026. The patch contains only source, configuration, documentation, and synthetic tests. Private inbox data is excluded.

## What is ready

- Recruiter profiles: normalized email identity, stated display names, importing richer names without inventing identities, pitch counts, distinct jobs, and trailing-30-day pitch frequency.
- Recruiting-company overview by sender domain, with explicit handling of personal mail and job-board relays; hiring clients remain separate.
- One job entry for matching pitches, with first/latest observed email dates, repeat counts, Dallas-calendar-day span, longest gap, and a source-linked timeline.
- Stricter matching of related requirements across gaps longer than 45 days. Long-running outreach is described as a possible ongoing or renewed search, never a verified continuous vacancy.
- Individual message dates retained for new thread messages and restored from available originals; replay does not duplicate history.

- Screening preferences now prioritize fully remote Angular/Node.js, then Dallas, with Plano/Frisco conditional. Explicit AT&T, Chase/JPMorgan, and Bank of America clients are review flags only, never automatic mismatches or eliminations; incidental mentions and unnamed Plano banking clients need review. Newest-first ordering and saved decisions are preserved. Node-only roles still require review of backend expectations.

## Validation

64 tests passed (including remote/Node.js priority, location tiers, employer aliases, ambiguous client mentions, and Plano banking). Production Angular build passed with no warnings. The restricted environment's native persistent cache aborted, so validation temporarily disabled that cache; the original cache configuration was restored. No temporary cache workaround is included in the patch.

The ServiceNow example is one group containing the September 14 and September 15 emails, with a one-day span. Tests cover a 62-day repeat, import deduplication, recruiter identity, company-versus-client separation, month-window counts, and preserving user decisions.

The reader also rejoins split email metadata into single-line key/value pairs (Position, Location, Duration, and similar fields). Prose and full email content are retained. Long field values scroll horizontally instead of wrapping. Regression tests cover the supplied screenshot, uppercase values, missing values, URLs, and long fields.

## Exact current boundary

This session can edit the staged copy but cannot write to the original project:

`/Users/ernestoikerd/Documents/Codex/2026-09-17/gmail-plugin-gmail-openai-curated-remote-4/work/jobbylooky-review/`

At final comparison, the original project's prior profile, posting-history, and email-formatting source matched the staged copy. Those earlier changes are therefore no longer in the patch. The remaining patch contains four files: the latest screening preferences, screening tests, store persistence tests, and README documentation. The owner clarified that Plano and named employers must only be flagged, not eliminated; regression coverage confirms full body, status, notes, and group visibility persist. Its checksum manifest records the current original-source base. The latest screening changes have not been applied to the original project by this session. The live preview's current build was not verified in this turn. No commit, PR, or deployment was made.

Earlier write-access requests returned no grants, and starting a staged local server was denied with EPERM. No permission bypass was attempted.

## Resume

Restore project write access and local preview-server permission. Verify the manifest's before hashes before applying the patch. Apply to the original project, build, restart its existing preview process with the existing MAIL_DATABASE_URL setting, and test recruiter → company → original-pitch navigation, narrow layout, and the ServiceNow timeline. Preserve the private inbox cache and all user decisions. Show the completed render and obtain visual approval before committing, then follow the existing review/landing/deployment requirements.
