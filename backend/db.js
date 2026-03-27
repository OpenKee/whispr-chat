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

module.exports = { db, saveMessage, getMessages, cleanup };
