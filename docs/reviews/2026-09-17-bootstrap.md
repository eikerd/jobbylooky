# Bootstrap review record

These are Codex's own review passes, not independent or external-bot approvals. External reviewer results, if available, are recorded in the final handoff. No findings are attributed to a bot that did not post them.

## Round 1 — behavior and persistence

Inspected screening, group matching, atomic store writes, replay behavior, source icons and address parsing. Ran all 75 tests and production build. Existing tests cover preservation of notes/status on re-screening, multiple-role ambiguity, pairwise grouping, manual overrides, source history and old-schema import.

Found stale Angular scaffold launch/tasks settings pointing at ports 4200/9876 and treating tests as a watch server. Replaced with the actual Node server, a browser launch for port 4317, and one-shot build/test tasks. No product behavior changed.

## Round 2 — boundaries and private data

Inspected API Host/Origin and fetch-site guards, JSON-only mutations, allowed patch fields, body-size limit, file path containment and fixed Google iframe origins. Scanned staged paths/content for private-state directories and common credential signatures. Private inbox data, imports, scratch files, dependencies and build output are excluded. `npm audit`: zero advisories.

Known deliberate constraint: this is a private LAN/tailnet app, not a publicly authenticated service. Address extraction and employer clues are heuristics; they do not establish a verified workplace or employer. Keep these limits visible in the continuation guide.

## Round 3 — reproducibility and handoff

Checked Node version, package lock, Docker build context, compose network and persistent volume, static `/jobs/` base path, read-only mail sync and separate companion repository ownership. Added CI for clean installs/tests/build/audit. Verified local tests/build and documented that server deployment and private-data migration are still pending.

The continuation guide lists unbuilt heatmap/timeline and exterior-photo ideas, DFW heuristic limitations, old cached newsletter entries, and exact code entry points. An empty bootstrap commit supplies the initial main baseline; the entire application lands via one squash PR.
