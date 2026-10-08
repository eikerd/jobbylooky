// Probe: what is in the voicemail stores, without reading any row contents.

import Foundation
import SQLite3

// On macOS 26 the Phone app's voicemails (audio + Apple's transcripts) live
// in FaceTime's message store; CallHistoryDB holds the calls themselves.
let storeRoots = [
  "Library/Group Containers/group.com.apple.FaceTime/com.apple.facetimemessagestored",
  "Library/Group Containers/group.com.apple.telephonyutilities.callservicesd",
  "Library/Application Support/CallHistoryDB",
  "Library/Containers/com.apple.mobilephone/Data/Library/Application Support",
].map { home.appendingPathComponent($0) }

let samplesPerExtension = 3

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

  var databases: [[String: Any]] = []
  var samples: [String: [String]] = [:]
  var extensionCounts: [String: Int] = [:]
  var total = 0
  for case let url as URL in walker {
    let values = try? url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
    guard values?.isRegularFile == true else { continue }
    total += 1
    let ext = url.pathExtension.lowercased()
    extensionCounts[ext, default: 0] += 1
    let relative = String(url.path.dropFirst(root.path.count))
    if samples[ext, default: []].count < samplesPerExtension {
      samples[ext, default: []].append(relative)
    }
    if isSQLite(url) {
      databases.append(["path": relative, "bytes": values?.fileSize ?? 0, "sqlite": schema(of: url)])
    }
  }
  entry["fileCount"] = total
  entry["extensions"] = extensionCounts
  entry["samples"] = samples
  entry["databases"] = databases
  return entry
}
