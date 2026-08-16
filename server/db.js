import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

export const db = new DatabaseSync(config.dbFile);

db.exec(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS raw_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  keyword TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  metrics TEXT NOT NULL DEFAULT '{}',
  hash TEXT NOT NULL UNIQUE,
  analyzed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  confidence INTEGER NOT NULL DEFAULT 0,
  heat INTEGER NOT NULL DEFAULT 0,
  verdict TEXT NOT NULL DEFAULT 'unverified',
  source_urls TEXT NOT NULL DEFAULT '[]',
  matched_keywords TEXT NOT NULL DEFAULT '[]',
  raw_item_ids TEXT NOT NULL DEFAULT '[]',
  first_seen TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_raw_analyzed ON raw_items(analyzed);
CREATE INDEX IF NOT EXISTS idx_events_last_seen ON events(last_seen);
`);

export function insertKeyword(term) {
  return db
    .prepare('INSERT OR IGNORE INTO keywords (term) VALUES (?)')
    .run(term.trim());
}

export function deleteKeyword(id) {
  db.prepare('DELETE FROM keywords WHERE id = ?').run(id);
}

export function listKeywords() {
  return db.prepare('SELECT * FROM keywords ORDER BY id').all();
}

/** 插入采集条目，按 hash 去重。返回 true 表示新条目 */
export function insertRawItem(item) {
  try {
    db.prepare(
      `INSERT INTO raw_items (source, keyword, url, title, content, author, published_at, metrics, hash)
       VALUES (@source, @keyword, @url, @title, @content, @author, @published_at, @metrics, @hash)`
    ).run(item);
    return true;
  } catch (e) {
    if (String(e).includes('UNIQUE')) return false;
    throw e;
  }
}

export function listUnanalyzedItems(limit = 40) {
  return db
    .prepare(
      'SELECT * FROM raw_items WHERE analyzed = 0 ORDER BY id DESC LIMIT ?'
    )
    .all(limit);
}

export function markAnalyzed(ids) {
  const stmt = db.prepare('UPDATE raw_items SET analyzed = 1 WHERE id = ?');
  db.exec('BEGIN');
  try {
    for (const id of ids) stmt.run(id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** 按标题相似度找已有事件（同一事件的追加证据），简单 Jaccard */
function similarEvent(title) {
  const events = db
    .prepare('SELECT * FROM events ORDER BY last_seen DESC LIMIT 60')
    .all();
  const tokens = new Set(title.toLowerCase().split(/\W+/).filter(Boolean));
  for (const ev of events) {
    const evTokens = new Set(ev.title.toLowerCase().split(/\W+/).filter(Boolean));
    let inter = 0;
    for (const t of tokens) if (evTokens.has(t)) inter++;
    const union = new Set([...tokens, ...evTokens]).size;
    if (union > 0 && inter / union >= 0.45) return ev;
  }
  return null;
}

export function upsertEvent(ev) {
  const existing = similarEvent(ev.title);
  if (existing) {
    const urls = new Set([...JSON.parse(existing.source_urls), ...ev.source_urls]);
    const kws = new Set([...JSON.parse(existing.matched_keywords), ...ev.matched_keywords]);
    const ids = [...new Set([...JSON.parse(existing.raw_item_ids), ...ev.raw_item_ids])];
    db.prepare(
      `UPDATE events SET title=?, summary=?, confidence=?, heat=?, verdict=?,
       source_urls=?, matched_keywords=?, raw_item_ids=?, last_seen=datetime('now','localtime')
       WHERE id=?`
    ).run(
      ev.title, ev.summary, ev.confidence, ev.heat, ev.verdict,
      JSON.stringify([...urls]), JSON.stringify([...kws]), JSON.stringify(ids),
      existing.id
    );
    return { id: existing.id, isNew: false };
  }
  const r = db.prepare(
    `INSERT INTO events (title, summary, confidence, heat, verdict, source_urls, matched_keywords, raw_item_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    ev.title, ev.summary, ev.confidence, ev.heat, ev.verdict,
    JSON.stringify(ev.source_urls), JSON.stringify(ev.matched_keywords),
    JSON.stringify(ev.raw_item_ids)
  );
  return { id: Number(r.lastInsertRowid), isNew: true };
}

export function listEvents({ limit = 50, keyword = '' } = {}) {
  let rows = db
    .prepare('SELECT * FROM events ORDER BY last_seen DESC LIMIT ?')
    .all(limit);
  if (keyword) {
    const kw = keyword.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.title.toLowerCase().includes(kw) ||
        r.summary.toLowerCase().includes(kw) ||
        r.matched_keywords.toLowerCase().includes(kw)
    );
  }
  return rows.map((r) => ({
    ...r,
    source_urls: JSON.parse(r.source_urls),
    matched_keywords: JSON.parse(r.matched_keywords),
  }));
}

export function addNotification(n) {
  db.prepare(
    'INSERT INTO notifications (event_id, channel, title, body) VALUES (?, ?, ?, ?)'
  ).run(n.event_id, n.channel, n.title, n.body);
}

export function listNotifications({ unreadOnly = false, limit = 50 } = {}) {
  const where = unreadOnly ? 'WHERE read = 0' : '';
  return db
    .prepare(`SELECT * FROM notifications ${where} ORDER BY id DESC LIMIT ?`)
    .all(limit);
}

export function markNotificationsRead(ids) {
  const stmt = db.prepare('UPDATE notifications SET read = 1 WHERE id = ?');
  db.exec('BEGIN');
  try {
    for (const id of ids) stmt.run(id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function stats() {
  const one = (sql) => db.prepare(sql).get().c;
  return {
    keywords: one('SELECT COUNT(*) c FROM keywords'),
    rawItems: one('SELECT COUNT(*) c FROM raw_items'),
    events: one('SELECT COUNT(*) c FROM events'),
    unread: one('SELECT COUNT(*) c FROM notifications WHERE read = 0'),
  };
}
