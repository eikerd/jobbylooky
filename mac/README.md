# Voicemail sweep (runs on the owner's Mac)

Matches the Mac's visual voicemail to Jobbylooky pitches and pushes the matches, with
transcript and audio, to the deployed app. A scheduled Claude routine runs it at noon and
midnight. Only matched voicemails leave the Mac.

## Where the voicemails are

macOS 26 keeps the Phone app's voicemails in FaceTime's message store, not in the Phone
container or `CallHistoryDB`:

```
~/Library/Group Containers/group.com.apple.FaceTime/com.apple.facetimemessagestored/Data Store/
  FaceTimeMessageStore-local.sqlitedb   ZSTOREDMESSAGE: one row per voicemail
  Assets/<first 2 chars>/<record UUID>.amr|.MOV
```

- `ZFILETYPE` `amr` is carrier visual voicemail; `MOV` is iOS Live Voicemail.
- `ZMAILBOXTYPE` 2 is "Deleted Voicemails". `ZDATECREATED` is seconds since 2001-01-01.
- `ZTRANSCRIPTDATA` is Apple's transcript as a protobuf: repeated field 1, text in field 2.
  About one voicemail in six has none (Apple could not transcribe it).
- The audio file is named by `ZRECORDUUID`, not by the UUID inside `ZMESSAGEFILE`.

The folder is behind Full Disk Access, which is why the helper exists.

## The helper: `voicemail-helper/`

`JobbyVoicemail.app` is the only process with Full Disk Access. `run.sh` launches it with
`open`, so macOS checks the helper's own grant rather than Claude's or node's. It writes
to `~/Library/Application Support/JobbyVoicemail/` (owner-only), never to stdout.

```bash
mac/voicemail-helper/build.sh            # build, sign, install to ~/Applications
mac/voicemail-helper/run.sh probe        # file list + table layouts, no contents
mac/voicemail-helper/run.sh export --days 183
mac/voicemail-helper/run.sh audio ID...  # .m4a copies for upload
```

First install: System Settings → Privacy & Security → Full Disk Access → add
`~/Applications/JobbyVoicemail.app`. It is signed with the Apple Development identity, so
rebuilding keeps the grant (an ad-hoc signature would lose it on every build).

On-device transcription (`SpeechAnalyzer`) of voicemails Apple did not transcribe needs no
permission prompt, but two things were not obvious:

- The helper must `AssetInventory.reserve(locale:)`. Installed models alone give zero results.
- Results are collected in a `Task` started before analysis. An `async let` reduce returned
  empty text for every file.

Recordings Apple's engine could not read usually stay unreadable here too (same model).
Transcripts are cached per voicemail in `transcripts/`, empty ones included; at most 40 are
transcribed per run.

## The sweep: `voicemail-sweep.mjs`

```bash
node mac/voicemail-sweep.mjs sweep                    # export, push number matches, list candidates
node mac/voicemail-sweep.mjs link VM_ID PITCH_ID "why" # a candidate matched by name/company
node mac/voicemail-sweep.mjs dismiss VM_ID...          # candidates that are not about a pitch
```

`JOBBY_URL` overrides the target (default `https://chungus.tail1d505c.ts.net/jobby`).

- A voicemail matches by number when the caller's number appears in a pitch's email body.
- `candidates.json` lists unmatched, unreviewed voicemails whose transcript sounds like a
  job and not like a loan robocall, plus every pitch's title, company and sender, for Claude
  to judge. `link` and `dismiss` record the decision in `sweep-state.json` so a candidate is
  offered once.
- The window is the last 183 days (the owner: "only go back 6 months").
- Pushing is idempotent: the server's index says what it already has.

# Link sweep (runs on the owner's Mac, 4am daily)

Checks the links in every pitch not yet passed and reports to the deployed app, which passes a
**New** pitch once all of its postings have closed. Its emails go to Gmail Trash like any
Pass. Pitches marked Maybe, Pursue or later are only flagged. A pitch passed this way is never
passed again, so moving it back to New sticks.

```bash
node mac/link-sweep.mjs --dry-run    # check and print, report nothing
mac/link-sweep-install.sh            # install or update the launchd agent (after a merge)
tail ~/Library/Logs/jobbylooky-link-sweep.log
```

- **Which links:** `server/job-links.mjs` decides. Links that do something when opened are
  never visited: Unsubscribe, opt-out, preferences, surveys, "click here if interested", and
  Indeed's Yes/No/Maybe, profile and pay links. Unlabelled click trackers are skipped too,
  since they hide where they lead. A *posting* link (Indeed "View job", ATS pages, LinkedIn
  job views) can close a pitch. Any other link is only checked for being dead.
- **Indeed** refuses plain fetches (401) and headless Chrome (403). The sweep opens each job
  page in the Mac's Google Chrome, in a visible window with a fresh profile per page. Once
  Indeed's cookies are set (its front page sets them, and so does a first job page), the
  next job page is a sign-in wall. A first visit may get a 401 "Authenticating…" script that
  reloads into the job, so the sweep waits for the job's data. The data is
  `"showExpiredHeader":true|false` (`isJobExpired` is only on some templates), with
  `datePosted` in the JSON-LD. Expired pages drop `datePosted`, so a job's age comes from the
  date stored while it was still open.
- Each `cts.indeed.com` tracker is resolved once, by reading its redirect, to the job key
  `jk`. The server keeps the key, and later sweeps go straight to `viewjob?jk=`.
- **Dead** means 404/410 or a domain that no longer exists, on two sweeps in a row. Refusals
  (403, 429, LinkedIn's 999), timeouts and certificate errors prove nothing and change nothing.
- The installer copies the sweep into `~/Library/Application Support/JobbyLinkSweep/` with
  its own `playwright-core`, so the repo checkout's branch does not matter at 4am. If the Mac
  is asleep at 4am, launchd runs the sweep when it wakes. It needs the owner logged in (the
  Chrome window); logged out, it does not run.
