---
date: 2026-10-30 13:40 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: feat/voicemail-tel-link
pr: https://github.com/eikerd/jobbylooky/pull/34
state: merged
deployed: the Chungus deploy of the merge commit follows this note's merge in the same session; its md5 result is in the closing message to the owner
loose_ends: 2 (listed below)
supersedes: docs/handoffs/2026-10-29-1935-claude-code-card-colors-thread-tree.md
---

# Voicemail caller numbers dial from the Mac

## What changed, and why

The owner: "Phone number should be clickable on the Mac and ready to dial for the Mac phone."

- The caller number in a pitch's Voicemail section is a `tel:+1…` link. On the Mac a click hands it to FaceTime / iPhone.
- `src/app/phone.ts` holds the NANP check. `phoneText()` (the display) and `telHref()` (the link) both use it. It applies the same test as the server's `normalizeNumber`, except that an explicit country code other than +1 is rejected. Such a caller stays plain text and keeps its stored form.
- That rejection came from Greptile in round 1: `+45 20123456` had become `tel:+14520123456`, which dials a stranger.
- The link takes `--accent-ink`, the existing link colour. No labels or tooltips were added.
- `tests/phone.test.ts` covers US forms, other country codes, short codes and impossible area codes.

Since the number is now a link, selecting it for "Track phrase" takes an Option-drag.

## How it was rendered

- `data/` holds no `voicemails.json`; the voicemails live on Chungus. For the render, the session POSTed one test voicemail to the `jobbylooky-copy` preview (port 4319, a temp data dir). Nothing reached `data/` or Chungus.
- The render ran in the built-in preview pane. Chrome's extension navigation sends `Sec-Fetch-Site: cross-site`, which the server refuses with a 403.

## Review

| Round | Commit | Result |
|---|---|---|
| 1 | 065a6eb | Greptile: 1 finding (the country code), fixed in f723e78. Codex: none. CodeRabbit: summary only (free plan). Copilot: quota exhausted. |
| 2 | f723e78 | Codex: none. Greptile did not re-run on the push. CodeRabbit skipped (hourly allowance spent). |
| 3 | f723e78 | Greptile (requested by comment) and Codex: none. |

Scorecard: `reports/pr-34.html`.

## Loose ends

1. `docs/comp/` is untracked in the main checkout. It is the compensation-tool session's work, carried from earlier notes, and this PR left it alone.
2. The repo names no Figma file for jobbylooky, so the link's styling was not recorded in Figma.

## Owner decisions

- Approved the render: "Yes, ship it".

## Proposed rule changes

None.
