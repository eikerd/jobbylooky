// JobbyVoicemail: the one process that holds Full Disk Access to read the
// Phone app's voicemail store. It is launched with `open`, so macOS checks
// this app's grant rather than the grant of whatever started it.
//
// Modes (first argument):
//   probe   list the voicemail stores' files and SQLite table layouts.
//           Reads no row contents.
//
// Output goes to ~/Library/Application Support/JobbyVoicemail/, never stdout:
// `open` does not connect the app's stdout to the caller.

import Foundation
import SQLite3

let fm = FileManager.default
let home = fm.homeDirectoryForCurrentUser
let outDir = home.appendingPathComponent("Library/Application Support/JobbyVoicemail")

let storeRoots = [
  "Library/Group Containers/group.com.apple.telephonyutilities.callservicesd",
  "Library/Application Support/CallHistoryDB",
  "Library/Containers/com.apple.mobilephone/Data/Library/Application Support",
].map { home.appendingPathComponent($0) }

let maxFilesPerRoot = 400

func isSQLite(_ url: URL) -> Bool {
  guard let handle = try? FileHandle(forReadingFrom: url) else { return false }
  defer { try? handle.close() }
  let magic = handle.readData(ofLength: 16)
  return magic.starts(with: Array("SQLite format 3".utf8))
}

// Table names, their CREATE statements and row counts. Never row contents.
func schema(of url: URL) -> [String: Any] {
  var db: OpaquePointer?
  let uri = "file:\(url.path)?mode=ro&immutable=1"
  guard sqlite3_open_v2(uri, &db, SQLITE_OPEN_READONLY | SQLITE_OPEN_URI, nil) == SQLITE_OK else {
    let message = db.map { String(cString: sqlite3_errmsg($0)) } ?? "open failed"
    sqlite3_close(db)
    return ["error": message]
  }
  defer { sqlite3_close(db) }

  var tables: [[String: Any]] = []
  var stmt: OpaquePointer?
  let sql = "SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name"
  guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
    return ["error": String(cString: sqlite3_errmsg(db))]
  }
  while sqlite3_step(stmt) == SQLITE_ROW {
    let name = String(cString: sqlite3_column_text(stmt, 0))
    let create = sqlite3_column_text(stmt, 1).map { String(cString: $0) } ?? ""
    tables.append(["name": name, "sql": create, "rows": rowCount(db, name)])
  }
  sqlite3_finalize(stmt)
  return ["tables": tables]
}

func rowCount(_ db: OpaquePointer?, _ table: String) -> Int {
  var stmt: OpaquePointer?
  let quoted = table.replacingOccurrences(of: "\"", with: "\"\"")
  guard sqlite3_prepare_v2(db, "SELECT count(*) FROM \"\(quoted)\"", -1, &stmt, nil) == SQLITE_OK else {
    return -1
  }
  defer { sqlite3_finalize(stmt) }
  return sqlite3_step(stmt) == SQLITE_ROW ? Int(sqlite3_column_int64(stmt, 0)) : -1
}

func probe(_ root: URL) -> [String: Any] {
  var entry: [String: Any] = ["root": root.path]
  guard let walker = fm.enumerator(
    at: root, includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey], options: [])
  else {
    entry["error"] = "cannot enumerate (missing, or Full Disk Access not granted)"
    return entry
  }

  var files: [[String: Any]] = []
  var extensionCounts: [String: Int] = [:]
  var total = 0
  for case let url as URL in walker {
    let values = try? url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
    guard values?.isRegularFile == true else { continue }
    total += 1
    extensionCounts[url.pathExtension.lowercased(), default: 0] += 1
    // Audio files can number in the thousands; count them, list the rest.
    let ext = url.pathExtension.lowercased()
    if ["amr", "m4a", "caf", "wav", "aac", "mp3", "opus"].contains(ext) { continue }
    guard files.count < maxFilesPerRoot else { continue }
    var file: [String: Any] = [
      "path": String(url.path.dropFirst(root.path.count)),
      "bytes": values?.fileSize ?? 0,
    ]
    if isSQLite(url) { file["sqlite"] = schema(of: url) }
    files.append(file)
  }
  entry["fileCount"] = total
  entry["extensions"] = extensionCounts
  entry["files"] = files
  return entry
}

func write(_ name: String, _ object: Any) throws {
  try fm.createDirectory(at: outDir, withIntermediateDirectories: true)
  let data = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys])
  let target = outDir.appendingPathComponent(name)
  try data.write(to: target, options: .atomic)
}

let mode = CommandLine.arguments.dropFirst().first ?? "probe"
do {
  switch mode {
  case "probe":
    try write("probe.json", [
      "ranAt": ISO8601DateFormatter().string(from: Date()),
      "stores": storeRoots.map(probe),
    ])
  default:
    try write("error.json", ["error": "unknown mode \(mode)"])
    exit(2)
  }
} catch {
  try? write("error.json", ["error": "\(error)"])
  exit(1)
}
