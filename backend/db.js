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

// ===== Visits / Analytics =====
db.exec(`
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT,
    path TEXT,
    referrer TEXT,
    source TEXT,
    city TEXT,
    user_agent TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )
`);

try { db.exec('CREATE INDEX IF NOT EXISTS idx_visits_created ON visits(created_at)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_visits_ip ON visits(ip)'); } catch {}

const insertVisitStmt = db.prepare(
  'INSERT INTO visits (ip, path, referrer, source, city, user_agent) VALUES (?, ?, ?, ?, ?, ?)'
);
const getAnalyticsSummaryStmt = db.prepare(`
  SELECT
    COUNT(*) as pageviews,
    COUNT(DISTINCT ip) as unique_visitors,
    COUNT(DISTINCT CASE WHEN created_at >= ? THEN ip END) as visitors_today
  FROM visits
`);
const getTopSourcesStmt = db.prepare(`
  SELECT source, COUNT(*) as count
  FROM visits
  WHERE created_at >= ?
  GROUP BY source
  ORDER BY count DESC
  LIMIT ?
`);
const getTopCitiesStmt = db.prepare(`
  SELECT city, COUNT(DISTINCT ip) as count
  FROM visits
  WHERE created_at >= ? AND city IS NOT NULL AND city != ''
  GROUP BY city
  ORDER BY count DESC
  LIMIT ?
`);
const getDailyVisitsStmt = db.prepare(`
  SELECT strftime('%Y-%m-%d', created_at, 'unixepoch', 'localtime') as day, COUNT(DISTINCT ip) as visitors
  FROM visits
  WHERE created_at >= ?
  GROUP BY day
  ORDER BY day ASC
`);
const getTopPathsStmt = db.prepare(`
  SELECT path, COUNT(*) as count
  FROM visits
  WHERE created_at >= ?
  GROUP BY path
  ORDER BY count DESC
  LIMIT ?
`);
const getDeviceBreakdownStmt = db.prepare(`
  SELECT
    SUM(CASE WHEN user_agent LIKE '%Mobile%' OR user_agent LIKE '%Android%' OR user_agent LIKE '%iPhone%' OR user_agent LIKE '%iPad%' OR user_agent LIKE '%iPadOS%' THEN 1 ELSE 0 END) as mobile,
    SUM(CASE WHEN user_agent LIKE '%Tablet%' OR user_agent LIKE '%Tab%' THEN 1 ELSE 0 END) as tablet,
    SUM(CASE WHEN user_agent NOT LIKE '%Mobile%' AND user_agent NOT LIKE '%Android%' AND user_agent NOT LIKE '%iPhone%' AND user_agent NOT LIKE '%iPad%' AND user_agent NOT LIKE '%iPadOS%' AND user_agent NOT LIKE '%Tablet%' AND user_agent NOT LIKE '%Tab%' THEN 1 ELSE 0 END) as desktop
  FROM visits
  WHERE created_at >= ?
`);
const getReturningVisitorsStmt = db.prepare(`
  SELECT COUNT(*) as count FROM (
    SELECT ip
    FROM visits
    WHERE created_at >= ?
    GROUP BY ip
    HAVING COUNT(*) > 1
  )
`);
const getSearchTermsStmt = db.prepare(`
  SELECT referrer, COUNT(*) as count
  FROM visits
  WHERE created_at >= ? AND referrer != ''
    AND (referrer LIKE '%baidu.%' OR referrer LIKE '%google.%' OR referrer LIKE '%bing.%'
         OR referrer LIKE '%sogou.%' OR referrer LIKE '%so.com%' OR referrer LIKE '%360.cn%'
         OR referrer LIKE '%sm.cn%')
  ORDER BY count DESC
  LIMIT 20
`);

function addVisit(ip, pathName, referrer, source, city, userAgent) {
  return insertVisitStmt.run(ip || '', pathName || '', referrer || '', source || 'direct', city || '', userAgent || '');
}

function getAnalyticsSummary(days = 7) {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const rawReferrers = getSearchTermsStmt.all(since);
  const searchTerms = new Map();
  for (const item of rawReferrers) {
    try {
      const url = new URL(item.referrer);
      const term = url.searchParams.get('wd') || url.searchParams.get('word') || url.searchParams.get('query') || url.searchParams.get('q') || url.searchParams.get('keyword');
      if (term) searchTerms.set(term, (searchTerms.get(term) || 0) + item.count);
    } catch {}
  }
  return {
    ...getAnalyticsSummaryStmt.get(Math.floor(Date.now() / 1000) - 86400 + 1),
    topSources: getTopSourcesStmt.all(since, 8),
    topCities: getTopCitiesStmt.all(since, 10),
    topPaths: getTopPathsStmt.all(since, 10),
    devices: getDeviceBreakdownStmt.get(since),
    returningVisitors: getReturningVisitorsStmt.get(since).count,
    searchTerms: Array.from(searchTerms.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([term, count]) => ({ term, count })),
    dailyVisitors: getDailyVisitsStmt.all(since)
  };
}

// ===== Reports =====
db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    reporter_nickname TEXT,
    partner_nickname TEXT,
    partner_ip TEXT,
    reason TEXT,
    messages_snapshot TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )
`);

// Migration: add partner_ip if missing
try { db.exec("ALTER TABLE reports ADD COLUMN partner_ip TEXT"); } catch {}

const insertReport = db.prepare(
  'INSERT INTO reports (room_id, reporter_nickname, partner_nickname, partner_ip, reason, messages_snapshot) VALUES (?, ?, ?, ?, ?, ?)'
);

const getReportsStmt = db.prepare(
  'SELECT * FROM reports ORDER BY created_at DESC LIMIT ?'
);

const getReportCountStmt = db.prepare(
  "SELECT COUNT(*) as count FROM reports WHERE partner_ip = ? AND partner_ip != '' AND created_at > ?"
);

function addReport(roomId, reporter, partner, partnerIp, reason, snapshot) {
  return insertReport.run(roomId, reporter, partner, partnerIp || '', reason, snapshot);
}

function getReports(limit = 50) {
  return getReportsStmt.all(limit);
}

function getReportCount(ip, hours = 24) {
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  return getReportCountStmt.get(ip, since).count;
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

// Migration: add expires_at if missing
try { db.exec("ALTER TABLE banned_ips ADD COLUMN expires_at INTEGER"); } catch {}

const banIpStmt = db.prepare('INSERT OR REPLACE INTO banned_ips (ip, reason, expires_at) VALUES (?, ?, ?)');
const isBannedStmt = db.prepare("SELECT 1 FROM banned_ips WHERE ip = ? AND (expires_at IS NULL OR expires_at > strftime('%s','now'))");
const unbanIpStmt = db.prepare('DELETE FROM banned_ips WHERE ip = ?');
const getBannedStmt = db.prepare("SELECT * FROM banned_ips WHERE expires_at IS NULL OR expires_at > strftime('%s','now') ORDER BY created_at DESC");
const cleanExpiredStmt = db.prepare("DELETE FROM banned_ips WHERE expires_at IS NOT NULL AND expires_at <= strftime('%s','now')");

function banIp(ip, reason, durationSeconds) {
  const expiresAt = durationSeconds ? Math.floor(Date.now() / 1000) + durationSeconds : null;
  banIpStmt.run(ip, reason, expiresAt);
}

function getBanCount(ip) {
  return db.prepare('SELECT COUNT(*) as count FROM banned_ips WHERE ip = ?').get(ip).count;
}

function isIpBanned(ip) {
  return !!isBannedStmt.get(ip);
}
function cleanExpiredBans() { cleanExpiredStmt.run(); }
function unbanIp(ip) { unbanIpStmt.run(ip); }
function getBannedIps() { return getBannedStmt.all(); }

module.exports = {
  db, saveMessage, getMessages, cleanup,
  addVisit, getAnalyticsSummary,
  addReport, getReports, getReportCount,
  banIp, isIpBanned, unbanIp, getBannedIps, getBanCount, cleanExpiredBans
};
