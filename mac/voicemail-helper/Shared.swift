import Foundation

let fm = FileManager.default
let home = fm.homeDirectoryForCurrentUser
/// Everything the helper hands back. Holds transcripts and audio, so owner-only.
let outDir = home.appendingPathComponent("Library/Application Support/JobbyVoicemail")

struct HelperError: Error, CustomStringConvertible {
  let description: String
  init(_ description: String) { self.description = description }
}

func write(_ name: String, _ object: Any) throws {
  try ensureDirectory(outDir)
  let data = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys])
  try data.write(to: outDir.appendingPathComponent(name), options: .atomic)
}

func ensureDirectory(_ url: URL) throws {
  try fm.createDirectory(at: url, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
}

let isoFormatter: ISO8601DateFormatter = {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime]
  return formatter
}()
