---
date: 2026-10-06 13:03 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: feat/instant-pass-toast (main checkout, no worktree), deleted after merge
pr: https://github.com/eikerd/jobbylooky/pull/16
state: merged (three review rounds, scorecard reports/pr-16.html)
deployed: the Chungus deploy of the merge commit and the retry of three pending Gmail deletes follow the merge in this session; results (md5 against origin/main, deletes) are in the closing message to the owner
loose_ends: 4 (listed below)
supersedes: none (2026-10-06-1232-claude-code-pr12-late-findings.md is a separate task; its "first live Pass" note is answered below)
---

# Pass is instant, Gmail deletes queue behind it, a yellow toast confirms

## What changed, and why

The owner found Pass slow ("as a user experience is very frustrating"). They wanted the pitch to vanish at once, a small yellow toast once Gmail had actually deleted it, and robust rapid passing. Pass now hides the pitch and opens the next one immediately. The PATCH saves `Passed` + `trashPending` and returns without waiting on IMAP. `server/pass-trash.mjs` runs the Gmail deletes one at a time, because Gmail caps concurrent IMAP sessions per account. The page collects each outcome in order from `GET /api/opportunities/:id/trash` and toasts `Deleted from Gmail · <title>`. **P** passes the open pitch when no field has focus.

The first live Pass on Chungus (owner, 12:44 CDT) answered the previous note's open question. Gmail refused the IMAP login. ImapFlow also emitted that refusal as an `'error'` event that nothing listened for, so **the whole server crashed** and restarted. That bug came from #12 and is fixed here (`client.on('error')` in `gmail-trash.mjs`). A login test from inside the container a few minutes later succeeded, both with the stored app password and with its spaces stripped, so the refusal looks transient. The likely cause is a concurrent-connection limit, since mail-worker uses the same account.

## Where it is

- Commits: a3bfc83 (feature), ed5895e (crash fix), de7a3cc (repeat Pass joins the queued delete; current row on failure), 950047c (round 1 client fixes), f5d9b7c (round 2), a819f06 (round 3: every failed pitch named in the banner), then `reports/pr-16.html` and this note.
- Files that matter: `server/pass-trash.mjs`, `server/gmail-trash.mjs`, `server/index.mjs` (PATCH + `GET …/trash`), `src/app/app.ts` (`pass`, `collectTrash`, `reportTrashFailure`, `shortcut`), `src/app/toast.css`.
- Verified by: `npm test` 136/136 and `npm run build` clean on Node 22.23.2. The crash regression test fails with `uncaughtException` when only the listener line is removed. On the sample server (preview mode), seven rapid Passes by click and by P all saved with nothing pending, and `p` typed into Next action did nothing. On a server with no Gmail credentials, three quick Passes put all three pitches in the error banner.

## What is deployed

See the closing message. Before the merge, Chungus ran main at bcd2af7 (#14) and had three pitches `Passed` + `trashPending` with their mail still in the inbox: "Javascript Developer: Nokē and Fox Corporation…", "Band 1 DSS Engineer", "Remote/WFH - UI/UX Developer…" (1 of 2). The owner said to delete them once the fix is deployed.

## Loose ends

1. **Figma:** jobbylooky still has no Figma file (deferred by the owner on 2026-10-01). This PR adds a toast and changes no other layout.
2. **Reviewer coverage:** Copilot was out of quota and CodeRabbit was rate-limited again. Codex (three rounds) and one independent code-review agent (round 1) were the reviewers.
3. **Codex thread 4198765482 declined in part.** A failed Pass's note draft is lost when the next pitch already has its own draft. The error now says so, and keeping both drafts would need per-pitch drafts.
4. **Open PR #15** (compact "How it fits" tags, another session) edits `app.ts`/`app.html`/`app.css`. It will need a rebase onto this merge, though the conflicts should be small.

## Next agent: start here

1. If Gmail refuses logins again, check whether mail-worker holds IMAP sessions on the same account. The banner now names every pitch left pending, and Pass in the Passed folder retries.

## Decided by the owner

- "I'd rather have the pass button instantly make the thing appear to disappear… a small yellow toast… delete a lot of them one after the other. So let's make that robust." Settled the design.
- "yes, add the job name and the p shortcut." Settled the toast text and the shortcut. A keyboard hint was not added to the button.
- Ship timing: "Finish all 3 rounds". Retry the three stuck deletes after deploy: "Yes, delete them".

## Proposed rule changes

- None.
