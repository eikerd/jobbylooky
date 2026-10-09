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
