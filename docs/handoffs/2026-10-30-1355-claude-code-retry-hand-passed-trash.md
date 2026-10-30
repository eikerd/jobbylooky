---
date: 2026-10-30 13:55 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: fix/retry-hand-passed-trash
pr: https://github.com/eikerd/jobbylooky/pull/35
state: merged
deployed: the Chungus deploy of the merge commit follows this note's merge in the same session; its md5 result and whether the 8 pending deletes cleared are in the closing message to the owner
loose_ends: 1 (listed below)
supersedes: docs/handoffs/2026-10-30-1340-claude-code-voicemail-tel-link.md
---

# Pending Gmail deletes retry on every mail check, however the pitch was passed

## What changed, and why

The owner asked whether delete phrases reach mail already received: "I want to make sure that these delete phrases retroactively affect the inbox and emails that I've already gotten."

**They do.** On the live data, all 29 phrases carry a `sweptAt`. "Java Architect" was swept 3 s after it was added and passed 2 emails. No untouched pitch carries a phrase without having been passed.

**The audit found 8 hand-passed pitches** whose Gmail delete had stayed pending, two since August. All were `mail-worker` rows with real Message-IDs. Two paths leave a hand pass pending:

- A later email arrives in a thread already passed. `server/store.mjs` sets `trashPending`, and its comment said "the next Pass deletes it".
- A Pass whose IMAP delete failed or was cut off by a restart.

`trashAutoPassed()` in `server/index.mjs` retries pending deletes on every sync, but only for reject-rule, delete-phrase and repeat passes. Nothing retried a hand pass, and the page told the owner to "Click Pass again".

Now:

- `awaitingTrash(rows)` in `server/pass-trash.mjs` selects every `Passed` + `trashPending` pitch that has Gmail Message-IDs. `trashAutoPassed()` enqueues all of them on every mail check (60 s) and after a delete phrase is added.
- `trashFailureText()` builds the connection-banner line. A hand pass reads "You passed …". A closed-posting pass reads "… after its postings closed", but only while the owner has not kept the pitch (Greptile, round 1).
- The error text on the page and from `GET …/trash` now says "It retries on every mail check".

## Review

| Round | Commit | Result |
|---|---|---|
| 1 | 269babf | Greptile: 1 finding (banner blamed a closed posting for a hand re-pass), fixed in 205886d. Codex: none. CodeRabbit rate-limited. Copilot out of quota. |
| 2 | 205886d | Greptile (requested) and Codex: none. |
| 3 | 205886d | Greptile (requested) and Codex: none. |

Scorecard: `reports/pr-35.html`.

## Loose ends

1. `docs/comp/` is untracked in the main checkout. It is the compensation-tool session's work, carried from earlier notes, and this PR left it alone.

## Owner decisions

- "Yes, look into it" — on the 8 pending deletes.

## Proposed rule changes

None.
