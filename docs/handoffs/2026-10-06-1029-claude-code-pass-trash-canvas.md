---
date: 2026-10-06 10:29 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: feat/pass-trashes-gmail (pushed from temporary clones in the session scratchpad; the main checkout held another session's work)
pr: https://github.com/eikerd/jobbylooky/pull/12
state: merged (four Codex rounds, all findings fixed; CodeRabbit rate-limited, Copilot out of quota)
deployed: Chungus deploy of the merge commit follows in this session; the md5 result is in the closing message to the owner
loose_ends: 4 (listed below)
supersedes: none (2026-10-06-1019-claude-code-map-locations covers the maps commits on this same PR)
---

# Pass deletes from Gmail; compact layout from the design canvas

## What changed, and why

**Pass → Gmail Trash.** The owner: "when i pass on an opportunity delete it from my inbox", and, asked which inbox, "Gmail too".

- `server/gmail-trash.mjs` finds the pitch's Message-IDs in Gmail INBOX over IMAP (imapflow, the same app password replies use, `SMTP_USER`/`SMTP_PASS`) and moves them to Gmail Trash, which Gmail keeps for 30 days.
- A PATCH to `Passed` triggers it. The status saves even when Gmail fails; the UI shows the failure and says "Click Pass again to retry".
- `trashPending` on a row: set before IMAP starts, cleared only on success, set again when mail sync adds a new message to a passed pitch. A Pass on a row with `trashPending` retries. Rows passed before this feature are left alone.
- Pasted emails (local UUID, no Message-ID) never contact Gmail. `MAIL_SEND_MODE=preview` touches nothing.

**Compact layout.** The owner: "lets design the whole site", then "I want you to use your design fucking tool", not Figma. The current site was rebuilt as editable artboards on the Jobbylooky redesign canvas (https://claude.ai/artifact/B2dirf2Tcaeu2RJiD2aUHB), the owner rearranged it there, and approved a render of the real app before the commit ("approved, commit and push it").

- Cards: sender, location, fit and green/red count pills (matches / mismatches) on one row.
- Detail: "Group with another job" is a button top right; age · sender · date on one line; facts are one unlabeled row, pay first ("Company not stated" etc. when missing); fit reasons are short tags with the full sentence on hover; Pursue, Maybe, Pass and the three reply buttons share one row; the Reply heading is gone.
- Every screener reason carries a short `label` (tested).
- `jobbylooky-sample` launch config plus `tests/fixtures/sample-inbox.json`: renders with a synthetic inbox, never the owner's mail.

**Review fixes in the other session's maps commits** (Codex round 4): one street name in two cities is two offices; office maps render only on real company pages, not Unassigned or relay.

**CI:** `npm audit` began failing on a new high advisory for `source-map-js`; bumped to 1.2.2.

## What is deployed

See the closing message: it records the Chungus deploy of the merge commit, built from a fresh `origin/main` clone, with the md5 comparison.

## Loose ends

1. **Live Gmail:** Pass → Trash has not been exercised against the real Gmail account; the first real Pass after deploy is the live test.
2. **PR #13** (`feat/phrase-colors`, another session) touches `app.html`/`app.css`/`screen.mjs`; it must merge `main` in and resolve conflicts with this PR's layout.
3. **Figma:** the owner rejected Figma for this work; the design record is the canvas above. An empty Figma file "Jobbylooky" (eike's team, drafts) was created by mistake before the owner redirected and is still there.
4. **Unanswered design questions:** whether `?` (unknown) count pills should come back in amber; whether count pills need a ✓/× glyph for colour-blind readers; whether the "name @ company" sender and dateless cards the owner hand-edited on the Reply artboard should apply everywhere (not applied).

## Next agent: start here

1. A Pass that left mail in Gmail: check the row's `trashPending` in `data/opportunities.json` and the server's IMAP error in the UI notice; `server/gmail-trash.mjs` searches INBOX by `Message-ID` header.
2. More layout changes: edit the canvas first, show a render of the real app (`jobbylooky-sample` preview), then commit.

## Decided by the owner

- "when i pass on an opportunity delete it from my inbox" → "Gmail too".
- "These should all be on one line", "Put the pay column first… we don't need labels for that", "all the buttons can be on one row", "the checks and Xs should have a red and green pill with a single digit inside".
- "approved, commit and push it"; "once it's clean, merge and deploy".

## Proposed rule changes

- `rules/landing.md` / the no-worktrees memory: when the main checkout is dirty with another session's work and worktrees are unwanted, say whether a temporary clone in the session scratchpad (pushed, then deleted in the same turn) is acceptable. This session used one for every push on 2026-10-06.
