const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { dbPath } = require('./config');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS authors (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  phone TEXT, city TEXT, joined_date TEXT
);
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES authors(id),
  title TEXT NOT NULL, isbn TEXT, genre TEXT, publication_date TEXT, status TEXT NOT NULL,
  mrp INTEGER, royalty_per_copy INTEGER, copies_sold INTEGER DEFAULT 0,
  royalty_earned INTEGER DEFAULT 0, royalty_paid INTEGER DEFAULT 0, royalty_pending INTEGER DEFAULT 0,
  last_payout_date TEXT, print_partner TEXT, available_on TEXT DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('author','admin')), name TEXT NOT NULL,
  author_id TEXT REFERENCES authors(id)
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id TEXT NOT NULL REFERENCES authors(id),
  book_id TEXT REFERENCES books(id),            -- NULL = General / Account Level
  subject TEXT NOT NULL, description TEXT NOT NULL, attachment_name TEXT,
  category TEXT, category_source TEXT DEFAULT 'pending',   -- pending | ai | rules | admin
  priority TEXT, priority_source TEXT DEFAULT 'pending',
  status TEXT NOT NULL DEFAULT 'Open',
  assignee_id INTEGER REFERENCES users(id),
  ai_draft TEXT, ai_draft_status TEXT DEFAULT 'none',      -- none | ready | failed
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL, sender_name TEXT NOT NULL, body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notes (   -- internal, never returned to authors
  id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  admin_name TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tickets_author ON tickets(author_id);
CREATE INDEX IF NOT EXISTS idx_tickets_queue ON tickets(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_ticket ON messages(ticket_id);
`);

module.exports = db;
