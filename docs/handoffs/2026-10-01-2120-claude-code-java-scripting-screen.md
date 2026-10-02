---
date: 2026-10-01 21:20 America/Chicago
tool: claude-code
model: claude-opus-5-5
repo: eikerd/jobbylooky
branch: fix-java-scripting-screen (worktree ../jobbylooky-wt-java-scripting)
pr: https://github.com/eikerd/jobbylooky/pull/5
state: merged
deployed: the Chungus deploy of the merge commit follows in this session; its md5 check against origin/main and the two rows' new fit are in the closing message to the owner, not here
loose_ends: 5 (listed below)
supersedes: none (the 2026-10-01 16:43 and 17:11 notes cover different work)
---

# "Java scripting" no longer screens as Java; styles.css applies under the CSP

## What changed, and why

The Java-requirement rule in `server/screen.mjs` matched the bare word `java`. As a result, "Should have hands on experience of Web Application development using advanced HTML designing and Java scripting." failed with **Requires Java development.** and forced Mismatch on two Angular UI Developer pitches imported 2026-10-01 (Technocraftsol, Tekintegral). The rule now ignores Java when the next whole word is `script`, `scripts` or `scripting` (space or hyphen), unless "API" follows. One matcher serves the title check, the per-sentence check and the Angular-title classification. Real requirements (Java 11, Spring Boot, ScriptEngine, scriptlet, Java Scripting API) still fail as Java.

While clearing a red `npm audit` CI check, the Angular 22.2.1 bump showed that the global `src/styles.css` had never applied on screen. Angular's critical-CSS inliner loads it as `media="print"` and switches it with an inline `onload` handler (22.1) or inline `<script>` (22.2). The server's CSP (`script-src 'self'`) blocks both. The live site therefore had a browser-blue focus ring instead of green, no selection colour, and no inherited font on form controls. `angular.json` production now sets `inlineCritical: false`, so the stylesheet is a plain `<link>`. The Angular bump itself landed on main through PR 4, so this PR's final diff is `server/screen.mjs`, `server/screen.test.mjs` and `angular.json`.

## Where it is

- Commits: c25e68d (the fix), f2cc3bc (round 1: whole-word only; Angular titles), bd4c43d (Angular bump + angular.json, committed by another session's cleanup, see Loose ends), de037e3 (merge of main), 2f99854 (round 2: Java Scripting API), 86007d2 (round 3: plural APIs), plus this note and `reports/pr-5.html`.
- Verified by: `npm test` 111/111; `npm run build`; `npm audit --audit-level=high` 0. A read-only before/after diff over the 136-row local cache showed no fit changes; two rows now cite their real Java sentence and one spurious "Java is mentioned" check is gone. Rendered on a local server with a synthetic pitch (Strong fit; green focus ring), owner approved.

## Existing rows: no resync needed

`server/store.mjs` (`rescreen`, run when the store opens) re-screens every cached row and saves only if something changed; saved decisions are untouched. The container rebuild on deploy re-screens the two Chungus rows (`manual:ab3d7761…` Technocraftsol and `manual:82c39181…` Tekintegral, both Mismatch / New before). Verify after deploy: both should read Strong fit or Review, with no "Requires Java development." reason.

## What is deployed

Before this PR, Chungus ran origin/main 2a1de73 (md5 of server/screen.mjs, store.mjs and index.mjs equal to main, checked 21:05). Deploy per README "Chungus deployment": rsync a clean origin/main checkout, then `docker compose -f deploy/docker-compose.yml up -d --build`. The result is in the closing message.

## Loose ends

- At about 17:06 another session's cleanup committed this session's three uncommitted files (package.json, package-lock.json, angular.json) as bd4c43d, pushed them, and removed `../jobbylooky-wt-java-scripting` while this session was waiting on the owner. Nothing was lost; the worktree was recreated from the branch. Two commit messages explaining the bump and the CSP fix were lost; the PR description carries that explanation.
- Figma: this project has no Figma file. The restored green focus ring and selection colour (already in styles.css, now applied) are not recorded in one.
- Sweep at 22:12: PR 9 "Restyle: warm paper theme" (another session; worktree `/Users/ernestoikerd/repos/work/jobbylooky-wt-warm-paper`, branch restyle-warm-paper) is open and rewrites `src/styles.css`. There is no file overlap, but it depends on this PR. Without `inlineCritical: false`, its `:focus-visible`, `::selection` and form-font rules would be dropped in the production build (they apply in its dev-server render, where optimization is off). Once PR 9 merges, its production render should match the approved one.
- CodeRabbit could not review the final commits: its included allowance (1/hour, shared across this account's PRs) was spent, and "@coderabbitai review" at 22:07 was rate-limited too.
- Copilot reviewed only round 1. Re-requests (POST, `gh pr edit --add-reviewer @copilot`, DELETE then POST) were silently ignored, with no new `review_requested` event. Probably the daily Copilot quota; PR 4's note saw the same.

## Next agent: start here

1. Nothing pending for this fix. If another JavaScript spelling slips through, add it to the regression test in `server/screen.test.mjs` next to the "Java scripting" case.

## Decided by the owner

- Chose "Include both (Recommended)": the Angular bump plus `inlineCritical: false` in this PR, after seeing the before/after render of the focus ring.

## Proposed rule changes

- `rules/landing.md` / `shared-awareness.md`: a session's cleanup should not commit, push or remove another live session's worktree. It should list it as a loose end, as the 16:43 note did, and leave it. Committing someone else's half-finished files under a generic message loses their commit split and messages, and removing their folder mid-task breaks the session's working directory.
