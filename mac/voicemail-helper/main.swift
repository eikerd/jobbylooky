// JobbyVoicemail: the one process that holds Full Disk Access to read the
// Phone app's voicemail store. It is launched with `open`, so macOS checks
// this app's grant rather than the grant of whatever started it.
//
// Modes (first argument):
//   probe              list the stores' files and SQLite table layouts; no row contents.
//   export --days N    voicemails.json: the last N days of voicemails with transcripts.
//                      Apple's transcript when it made one, otherwise an on-device one.
//   audio ID...        audio.json: converts those voicemails to .m4a under audio/.
//
// Output goes to ~/Library/Application Support/JobbyVoicemail/, never stdout:
// `open` does not connect the app's stdout to the caller.

import Foundation

/// Bounds one run; the rest are transcribed on the next sweep.
let maxTranscriptionsPerRun = 40

func export(days: Int) async throws {
  let since = Date(timeIntervalSinceNow: -Double(days) * 86400)
  var transcribed = 0
  var problems: [[String: String]] = []
  var rows: [[String: Any]] = []
  for voicemail in try VoicemailStore.load(since: since) {
    var transcript = voicemail.appleTranscript
    var source: Any = transcript == nil ? NSNull() : "apple"
    if transcript == nil, let local = Audio.cachedTranscript(voicemail.id) {
      transcript = local
      source = "local"
    } else if transcript == nil, voicemail.audio != nil, transcribed < maxTranscriptionsPerRun, !Audio.failedRecently(voicemail.id) {
      transcribed += 1
      do {
        transcript = try await Audio.transcribe(voicemail)
        source = "local"
      } catch {
        Audio.recordFailure(voicemail.id, error)
        problems.append(["id": voicemail.id, "error": "\(error)"])
      }
    }
    if transcript?.isEmpty == true { transcript = nil }
    rows.append([
      "id": voicemail.id,
      "from": voicemail.from,
      "receivedAt": isoFormatter.string(from: voicemail.receivedAt),
      "durationSeconds": (voicemail.durationSeconds * 10).rounded() / 10,
      "kind": voicemail.kind,
      "read": voicemail.read,
      "transcript": transcript ?? NSNull(),
      "transcriptSource": source,
      "hasAudio": voicemail.audio != nil,
    ])
  }
  try write("voicemails.json", [
    "exportedAt": isoFormatter.string(from: Date()),
    "since": isoFormatter.string(from: since),
    "voicemails": rows,
    "transcribed": transcribed,
    "problems": problems,
  ])
}

func exportAudio(ids: [String]) async throws {
  let wanted = Set(ids)
  var files: [String: String] = [:]
  var problems: [[String: String]] = []
  for voicemail in try VoicemailStore.load(since: .distantPast) where wanted.contains(voicemail.id) {
    do {
      files[voicemail.id] = try await Audio.m4a(for: voicemail).path
    } catch {
      problems.append(["id": voicemail.id, "error": "\(error)"])
    }
  }
  for id in wanted.subtracting(files.keys) where !problems.contains(where: { $0["id"] == id }) {
    problems.append(["id": id, "error": "Not in the voicemail store (deleted?)."])
  }
  try write("audio.json", ["files": files, "problems": problems])
}

let arguments = Array(CommandLine.arguments.dropFirst())
do {
  switch arguments.first ?? "probe" {
  case "probe":
    try write("probe.json", [
      "ranAt": isoFormatter.string(from: Date()),
      "stores": storeRoots.map(probe),
    ])
  case "export":
    let daysIndex = arguments.firstIndex(of: "--days").map { $0 + 1 }
    let days = daysIndex.flatMap { $0 < arguments.count ? Int(arguments[$0]) : nil } ?? 183
    try await export(days: days)
  case "transcribe-file":
    try write("transcribe-file.json", ["text": try await Audio.transcribeFile(URL(fileURLWithPath: arguments[1]))])
  case "audio":
    try await exportAudio(ids: Array(arguments.dropFirst()))
  default:
    throw HelperError("Unknown mode \(arguments.first ?? "").")
  }
} catch {
  try? write("error.json", ["error": "\(error)"])
  exit(1)
}
