// Audio conversion (browsers cannot play AMR) and on-device transcription for
// voicemails Apple did not transcribe. Nothing leaves the Mac here.

import AVFoundation
import Foundation
import Speech

enum Audio {
  static let audioDir = outDir.appendingPathComponent("audio")
  static let transcriptDir = outDir.appendingPathComponent("transcripts")

  /// AAC in an .m4a: plays in every browser, and is what SpeechAnalyzer reads.
  static func m4a(for voicemail: Voicemail) async throws -> URL {
    guard let source = voicemail.audio else { throw HelperError("No audio file for voicemail \(voicemail.id).") }
    try ensureDirectory(audioDir)
    let target = audioDir.appendingPathComponent("\(voicemail.id).m4a")
    if fm.fileExists(atPath: target.path) { return target }
    guard let session = AVAssetExportSession(asset: AVURLAsset(url: source), presetName: AVAssetExportPresetAppleM4A) else {
      throw HelperError("Cannot convert \(source.lastPathComponent).")
    }
    let partial = audioDir.appendingPathComponent("\(voicemail.id).partial.m4a")
    try? fm.removeItem(at: partial)
    try await session.export(to: partial, as: .m4a)
    try fm.moveItem(at: partial, to: target)
    return target
  }

  /// A cached local transcript, made once per voicemail.
  static func cachedTranscript(_ id: String) -> String? {
    try? String(contentsOf: transcriptDir.appendingPathComponent("\(id).txt"), encoding: .utf8)
  }

  /// A failed transcription is retried a week later, not every sweep: newest-first order would
  /// otherwise spend each run's quota on the same failures and never reach older voicemails.
  static let retryFailedAfter: TimeInterval = 7 * 86400

  static func failedRecently(_ id: String) -> Bool {
    let marker = transcriptDir.appendingPathComponent("\(id).failed")
    guard let failedAt = (try? fm.attributesOfItem(atPath: marker.path))?[.modificationDate] as? Date else { return false }
    return Date().timeIntervalSince(failedAt) < retryFailedAfter
  }

  static func recordFailure(_ id: String, _ error: Error) {
    try? ensureDirectory(transcriptDir)
    try? "\(error)".write(to: transcriptDir.appendingPathComponent("\(id).failed"), atomically: true, encoding: .utf8)
  }

  static func transcribe(_ voicemail: Voicemail) async throws -> String {
    let transcript = try await transcribeFile(try await m4a(for: voicemail))
    try ensureDirectory(transcriptDir)
    try transcript.write(to: transcriptDir.appendingPathComponent("\(voicemail.id).txt"), atomically: true, encoding: .utf8)
    return transcript
  }

  static func transcribeFile(_ audio: URL) async throws -> String {
    let locale = Locale(identifier: "en-US")
    let transcriber = SpeechTranscriber(locale: locale, preset: .transcription)
    // Installed model files are not enough: each app must reserve the locale (max 5 per app),
    // or the transcriber yields no results at all.
    if !(await AssetInventory.reservedLocales).contains(where: { $0.identifier(.bcp47) == locale.identifier(.bcp47) }) {
      try await AssetInventory.reserve(locale: locale)
    }
    if let install = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
      try await install.downloadAndInstall()
    }
    let analyzer = SpeechAnalyzer(modules: [transcriber])
    // The collector must be listening before analysis starts. An `async let` reduce
    // here returned empty text for every voicemail; a Task does not.
    let collector = Task {
      var text = ""
      for try await result in transcriber.results { text += String(result.text.characters) }
      return text
    }
    let file = try AVAudioFile(forReading: audio)
    if let end = try await analyzer.analyzeSequence(from: file) {
      try await analyzer.finalizeAndFinish(through: end)
    } else {
      try await analyzer.finalizeAndFinishThroughEndOfInput()
    }
    // Empty is cached too (silence, a hang-up), so it is not retried every sweep.
    return try await collector.value.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}
