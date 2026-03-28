const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'chat.db');

// Ensure data directory exists
const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Performance pragmas
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT DEFAULT '',
    created_at DATETIME DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
`);

// Add image_url column if missing (migration)
try { db.exec("ALTER TABLE messages ADD COLUMN image_url TEXT DEFAULT ''"); } catch {}

// Prepared statements
const insertMessage = db.prepare(
  'INSERT INTO messages (room_id, nickname, content, image_url) VALUES (?, ?, ?, ?)'
);

const getMessagesByRoom = db.prepare(
  'SELECT nickname, content, image_url, created_at FROM messages WHERE room_id = ? ORDER BY created_at ASC LIMIT 200'
);

const deleteOldMessages = db.prepare(
  "DELETE FROM messages WHERE created_at < datetime('now', '-7 days')"
);

function saveMessage(roomId, nickname, content, imageUrl) {
  return insertMessage.run(roomId, nickname, content, imageUrl || '');
}

function getMessages(roomId) {
  return getMessagesByRoom.all(roomId);
}

function cleanup() {
  const result = deleteOldMessages.run();
  if (result.changes > 0) {
    console.log(`[db] Cleaned up ${result.changes} old messages`);
  }
  return result.changes;
}

// ===== Reports =====
db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    reporter_nickname TEXT,
    partner_nickname TEXT,
    reason TEXT,
    messages_snapshot TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )
`);

const insertReport = db.prepare(
  'INSERT INTO reports (room_id, reporter_nickname, partner_nickname, reason, messages_snapshot) VALUES (?, ?, ?, ?, ?)'
);

const getReportsStmt = db.prepare(
  'SELECT * FROM reports ORDER BY created_at DESC LIMIT ?'
);

const getReportCountStmt = db.prepare(
  "SELECT COUNT(*) as count FROM reports WHERE partner_nickname = ? AND created_at > ?"
);

function addReport(roomId, reporter, partner, reason, snapshot) {
  return insertReport.run(roomId, reporter, partner, reason, snapshot);
}

function getReports(limit = 50) {
  return getReportsStmt.all(limit);
}

function getReportCount(nickname, hours = 24) {
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  return getReportCountStmt.get(nickname, since).count;
}

// ===== Banned IPs =====
db.exec(`
  CREATE TABLE IF NOT EXISTS banned_ips (
    ip TEXT PRIMARY KEY,
    reason TEXT,
    expires_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )
`);

const banIpStmt = db.prepare('INSERT OR REPLACE INTO banned_ips (ip, reason, expires_at) VALUES (?, ?, ?)');
const isBannedStmt = db.prepare("SELECT 1 FROM banned_ips WHERE ip = ? AND (expires_at IS NULL OR expires_at > strftime('%s','now'))");
const unbanIpStmt = db.prepare('DELETE FROM banned_ips WHERE ip = ?');
const getBannedStmt = db.prepare("SELECT * FROM banned_ips WHERE expires_at IS NULL OR expires_at > strftime('%s','now') ORDER BY created_at DESC");
const cleanExpiredStmt = db.prepare("DELETE FROM banned_ips WHERE expires_at IS NOT NULL AND expires_at <= strftime('%s','now')");

function banIp(ip, reason, durationSeconds) {
  const expiresAt = durationSeconds ? Math.floor(Date.now() / 1000) + durationSeconds : null;
  banIpStmt.run(ip, reason, expiresAt);
}
function isIpBanned(ip) {
  cleanExpiredStmt.run();
  return !!isBannedStmt.get(ip);
}
function unbanIp(ip) { unbanIpStmt.run(ip); }
function getBannedIps() { return getBannedStmt.all(); }

module.exports = {
  db, saveMessage, getMessages, cleanup,
  addReport, getReports, getReportCount,
  banIp, isIpBanned, unbanIp, getBannedIps
};
