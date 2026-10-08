// Reads voicemails from FaceTime's message store (ZSTOREDMESSAGE), which the
// Phone app shows as its Voicemails list on macOS 26.

import Foundation
import SQLite3

struct Voicemail {
  let id: String
  let from: String
  let receivedAt: Date
  let durationSeconds: Double
  /// "voicemail" is the carrier's visual voicemail (.amr); "live" is iOS Live Voicemail (.MOV).
  let kind: String
  let read: Bool
  /// Apple's own transcript, when it made one.
  let appleTranscript: String?
  let audio: URL?
}

enum VoicemailStore {
  static let dataStore = storeRoots[0].appendingPathComponent("Data Store")
  static let database = dataStore.appendingPathComponent("FaceTimeMessageStore-local.sqlitedb")
  /// ZMAILBOXTYPE 2 is the Phone app's "Deleted Voicemails".
  static let deletedMailbox = 2

  static func load(since: Date) throws -> [Voicemail] {
    var db: OpaquePointer?
    // Read-only but not immutable: the WAL holds the newest voicemails.
    let uri = "file:\(database.path)?mode=ro"
    guard sqlite3_open_v2(uri, &db, SQLITE_OPEN_READONLY | SQLITE_OPEN_URI, nil) == SQLITE_OK else {
      let message = db.map { String(cString: sqlite3_errmsg($0)) } ?? "open failed"
      sqlite3_close(db)
      throw HelperError("Cannot open the voicemail store (\(message)). Is Full Disk Access on for JobbyVoicemail?")
    }
    defer { sqlite3_close(db) }

    let sql = """
      SELECT ZRECORDUUID, ZMESSAGEFILE, ZFROM, ZDATECREATED, ZDURATION, ZFILETYPE, ZISREAD, ZTRANSCRIPTDATA
      FROM ZSTOREDMESSAGE
      WHERE ZDATEDELETED IS NULL AND ZMAILBOXTYPE != ? AND ZDATECREATED >= ?
      ORDER BY ZDATECREATED DESC
      """
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
      throw HelperError("The voicemail store's layout changed: \(String(cString: sqlite3_errmsg(db)))")
    }
    defer { sqlite3_finalize(stmt) }
    sqlite3_bind_int(stmt, 1, Int32(deletedMailbox))
    sqlite3_bind_double(stmt, 2, since.timeIntervalSinceReferenceDate)

    var result: [Voicemail] = []
    while sqlite3_step(stmt) == SQLITE_ROW {
      guard let record = blob(stmt, 0), record.count == 16 else { continue }
      let fileType = text(stmt, 5) ?? ""
      let id = uuidString(record)
      result.append(
        Voicemail(
          id: id,
          from: text(stmt, 2) ?? "",
          // Core Data stores seconds since 2001-01-01.
          receivedAt: Date(timeIntervalSinceReferenceDate: sqlite3_column_double(stmt, 3)),
          durationSeconds: sqlite3_column_double(stmt, 4),
          kind: fileType.lowercased() == "amr" ? "voicemail" : "live",
          read: sqlite3_column_int(stmt, 6) != 0,
          appleTranscript: blob(stmt, 7).flatMap(transcriptText),
          audio: assetFile(names: [id] + (blob(stmt, 1).flatMap(embeddedUUID).map { [$0] } ?? []), fileType: fileType)
        ))
    }
    return result
  }

  /// Audio lives at Assets/<first 2>/<UUID>.<type>, named by the record's UUID; the UUID
  /// embedded in ZMESSAGEFILE is the fallback.
  static func assetFile(names: [String], fileType: String) -> URL? {
    for name in names {
      let folder = dataStore.appendingPathComponent("Assets").appendingPathComponent(String(name.prefix(2)))
      for ext in Set([fileType, fileType.lowercased(), fileType.uppercased()]) {
        let url = folder.appendingPathComponent("\(name).\(ext)")
        if fm.fileExists(atPath: url.path) { return url }
      }
    }
    return nil
  }

  static func embeddedUUID(_ reference: Data) -> String? {
    let ascii = String(decoding: reference.map { $0 < 128 ? $0 : 0x20 }, as: UTF8.self)
    return ascii.range(of: "[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}", options: .regularExpression)
      .map { String(ascii[$0]) }
  }

  private static func text(_ stmt: OpaquePointer?, _ column: Int32) -> String? {
    sqlite3_column_text(stmt, column).map { String(cString: $0) }
  }

  private static func blob(_ stmt: OpaquePointer?, _ column: Int32) -> Data? {
    guard sqlite3_column_type(stmt, column) == SQLITE_BLOB, let bytes = sqlite3_column_blob(stmt, column) else { return nil }
    return Data(bytes: bytes, count: Int(sqlite3_column_bytes(stmt, column)))
  }

  private static func uuidString(_ bytes: Data) -> String {
    let b = [UInt8](bytes)
    return UUID(uuid: (b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15])).uuidString
  }
}

/// ZTRANSCRIPTDATA is a protobuf: repeated field 1 holds one segment each, whose field 2 is its text.
func transcriptText(_ data: Data) -> String? {
  var segments: [String] = []
  forEachField([UInt8](data)) { field, payload in
    guard field == 1, let payload else { return }
    forEachField(payload) { inner, text in
      if inner == 2, let text, let segment = String(bytes: text, encoding: .utf8) { segments.append(segment) }
    }
  }
  let joined = segments.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
  return joined.isEmpty ? nil : joined
}

/// Calls `visit` with each field number and, for length-delimited fields, its bytes.
/// Stops at anything malformed rather than guessing.
func forEachField(_ bytes: [UInt8], _ visit: (Int, [UInt8]?) -> Void) {
  var index = 0
  func varint() -> Int? {
    var value = 0
    var shift = 0
    while index < bytes.count, shift < 64 {
      let byte = bytes[index]
      index += 1
      value |= Int(byte & 0x7f) << shift
      if byte & 0x80 == 0 { return value }
      shift += 7
    }
    return nil
  }
  while index < bytes.count, let key = varint() {
    let field = key >> 3
    switch key & 7 {
    case 0: guard varint() != nil else { return }; visit(field, nil)
    case 1: index += 8; visit(field, nil)
    case 2:
      guard let length = varint(), length >= 0, index + length <= bytes.count else { return }
      visit(field, Array(bytes[index..<index + length]))
      index += length
    case 5: index += 4; visit(field, nil)
    default: return
    }
  }
}
