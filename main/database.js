const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

const dbPath = path.join(app.getPath('userData'), 'snapcut.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// ── Schema ──
db.exec(`
  CREATE TABLE IF NOT EXISTS snippets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shortcut TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    usage_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// ── Categories Table ──
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#6366f1',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Seed one default "General" category if table is empty
const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get();
if (catCount.c === 0) {
  db.prepare('INSERT INTO categories (name, color, sort_order) VALUES (?, ?, ?)').run('General', '#6366f1', 0);
}

// ── Settings Table ──
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Default WPM
const wpmRow = db.prepare("SELECT value FROM settings WHERE key = 'wpm'").get();
if (!wpmRow) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('wpm', '40')").run();
}

// ── Expansion Log Table ──
db.exec(`
  CREATE TABLE IF NOT EXISTS expansion_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snippet_id INTEGER NOT NULL,
    shortcut TEXT NOT NULL,
    chars_expanded INTEGER DEFAULT 0,
    chars_shortcut INTEGER DEFAULT 0,
    expanded_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (snippet_id) REFERENCES snippets(id) ON DELETE CASCADE
  );
`);

// ── CRUD ──
function getAllSnippets() {
  return db.prepare('SELECT * FROM snippets ORDER BY usage_count DESC, updated_at DESC').all();
}

function createSnippet({ shortcut, title, body, category }) {
  const stmt = db.prepare(
    'INSERT INTO snippets (shortcut, title, body, category) VALUES (?, ?, ?, ?)'
  );
  const info = stmt.run(shortcut, title, body, category || 'General');
  return db.prepare('SELECT * FROM snippets WHERE id = ?').get(info.lastInsertRowid);
}

function updateSnippet(id, { shortcut, title, body, category }) {
  db.prepare(
    `UPDATE snippets SET shortcut = ?, title = ?, body = ?, category = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(shortcut, title, body, category, id);
  return db.prepare('SELECT * FROM snippets WHERE id = ?').get(id);
}

function deleteSnippet(id) {
  return db.prepare('DELETE FROM snippets WHERE id = ?').run(id);
}

function searchSnippets(query) {
  return db
    .prepare(
      `SELECT * FROM snippets WHERE shortcut LIKE ? OR title LIKE ? OR body LIKE ? ORDER BY usage_count DESC`
    )
    .all(`%${query}%`, `%${query}%`, `%${query}%`);
}

function getCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, name ASC').all();
}

function createCategory(name, color) {
  const stmt = db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)');
  const info = stmt.run(name.trim(), color || '#6366f1');
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid);
}

function deleteCategory(id) {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (cat && cat.name === 'General') return { error: 'Cannot delete General category' };
  // Move snippets in this category to General
  if (cat) {
    db.prepare('UPDATE snippets SET category = ? WHERE category = ?').run('General', cat.name);
  }
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return { success: true };
}

function renameCategory(id, newName) {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (cat) {
    db.prepare('UPDATE snippets SET category = ? WHERE category = ?').run(newName.trim(), cat.name);
    db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(newName.trim(), id);
  }
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

function incrementUsage(id) {
  db.prepare('UPDATE snippets SET usage_count = usage_count + 1 WHERE id = ?').run(id);

  // Log the expansion
  const snippet = db.prepare('SELECT * FROM snippets WHERE id = ?').get(id);
  if (snippet) {
    db.prepare(
      'INSERT INTO expansion_log (snippet_id, shortcut, chars_expanded, chars_shortcut) VALUES (?, ?, ?, ?)'
    ).run(id, snippet.shortcut, snippet.body.length, snippet.shortcut.length);
  }
}

function getStats() {
  // Total expansions
  const totalExpansions = db.prepare('SELECT COALESCE(SUM(usage_count), 0) as total FROM snippets').get().total;

  // Total characters expanded (keystrokes produced)
  const charStats = db.prepare(
    'SELECT COALESCE(SUM(chars_expanded), 0) as total_chars_expanded, COALESCE(SUM(chars_shortcut), 0) as total_chars_typed FROM expansion_log'
  ).get();

  // Keystrokes saved = chars_expanded - chars_typed for each expansion
  const keystrokesSaved = charStats.total_chars_expanded - charStats.total_chars_typed;

  // Get user's WPM setting
  const wpm = parseInt(getSetting('wpm') || '40', 10);

  // Total snippets
  const totalSnippets = db.prepare('SELECT COUNT(*) as c FROM snippets').get().c;

  // Active snippets (used at least once)
  const activeSnippets = db.prepare('SELECT COUNT(*) as c FROM snippets WHERE usage_count > 0').get().c;

  // Top snippets by usage
  const topSnippets = db.prepare(
    'SELECT id, shortcut, title, category, usage_count, body FROM snippets WHERE usage_count > 0 ORDER BY usage_count DESC LIMIT 8'
  ).all();

  // Category breakdown
  const categoryBreakdown = db.prepare(
    'SELECT category, COUNT(*) as count, COALESCE(SUM(usage_count), 0) as total_uses FROM snippets GROUP BY category ORDER BY total_uses DESC'
  ).all();

  // Expansions per day (last 30 days)
  const dailyExpansions = db.prepare(`
    SELECT DATE(expanded_at) as day, COUNT(*) as count
    FROM expansion_log
    WHERE expanded_at >= datetime('now', '-30 days')
    GROUP BY DATE(expanded_at)
    ORDER BY day ASC
  `).all();

  // Recent expansions (last 10)
  const recentExpansions = db.prepare(`
    SELECT el.shortcut, el.chars_expanded, el.chars_shortcut, el.expanded_at, s.title
    FROM expansion_log el
    LEFT JOIN snippets s ON el.snippet_id = s.id
    ORDER BY el.expanded_at DESC
    LIMIT 10
  `).all();

  // Average chars per expansion
  const avgCharsPerExpansion = totalExpansions > 0
    ? Math.round(charStats.total_chars_expanded / totalExpansions)
    : 0;

  return {
    totalExpansions,
    totalCharsExpanded: charStats.total_chars_expanded,
    totalCharsTyped: charStats.total_chars_typed,
    keystrokesSaved: Math.max(0, keystrokesSaved),
    wpm,
    totalSnippets,
    activeSnippets,
    topSnippets,
    categoryBreakdown,
    dailyExpansions,
    recentExpansions,
    avgCharsPerExpansion,
  };
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
  return { key, value: String(value) };
}

function exportAllSnippets() {
  const snippets = db.prepare('SELECT shortcut, title, body, category FROM snippets ORDER BY id ASC').all();
  const categories = db.prepare('SELECT name, color FROM categories ORDER BY sort_order ASC').all();
  return { version: 1, exportedAt: new Date().toISOString(), snippets, categories };
}

function importSnippets(data) {
  if (!data || !Array.isArray(data.snippets)) throw new Error('Invalid import format');
  let imported = 0;
  const importTx = db.transaction(() => {
    // Import categories first
    if (Array.isArray(data.categories)) {
      for (const cat of data.categories) {
        const exists = db.prepare('SELECT id FROM categories WHERE name = ?').get(cat.name);
        if (!exists) {
          db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run(cat.name, cat.color || '#6366f1');
        }
      }
    }
    // Import snippets (skip duplicates by shortcut)
    for (const s of data.snippets) {
      if (!s.shortcut || !s.title || !s.body) continue;
      const exists = db.prepare('SELECT id FROM snippets WHERE shortcut = ?').get(s.shortcut);
      if (!exists) {
        db.prepare('INSERT INTO snippets (shortcut, title, body, category) VALUES (?, ?, ?, ?)').run(
          s.shortcut, s.title, s.body, s.category || 'General'
        );
        imported++;
      }
    }
  });
  importTx();
  return { count: imported };
}

function clearExpansionHistory() {
  db.prepare('DELETE FROM expansion_log').run();
  db.prepare('UPDATE snippets SET usage_count = 0').run();
  return { success: true };
}

function getDbInfo() {
  const fs = require('fs');
  try {
    const stat = fs.statSync(dbPath);
    const bytes = stat.size;
    let size;
    if (bytes < 1024) size = bytes + ' B';
    else if (bytes < 1048576) size = (bytes / 1024).toFixed(1) + ' KB';
    else size = (bytes / 1048576).toFixed(1) + ' MB';
    return { path: dbPath, size };
  } catch {
    return { path: dbPath, size: '—' };
  }
}

module.exports = {
  getAllSnippets,
  createSnippet,
  updateSnippet,
  deleteSnippet,
  searchSnippets,
  getCategories,
  createCategory,
  deleteCategory,
  renameCategory,
  incrementUsage,
  getStats,
  getSetting,
  setSetting,
  exportAllSnippets,
  importSnippets,
  clearExpansionHistory,
  getDbInfo,
};
