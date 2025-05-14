import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path
const dbPath = path.join(__dirname, '..', 'data', 'diary.db');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Initialize database
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Setup database schema
function setupDatabase() {
  // Create users table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Create user settings table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      ai_friend_name TEXT DEFAULT 'AI Friend',
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `).run();

  // Create diary entries table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS diary_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT DEFAULT NULL,
      entry TEXT NOT NULL,
      mood TEXT DEFAULT 'neutral',
      mood_emoji TEXT DEFAULT '😐',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `).run();

  // Create conversations table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_message TEXT NOT NULL,
      ai_response TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `).run();
  
  // Create index for faster conversation retrieval by date
  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_conversations_user_date
    ON conversations (user_id, created_at)
  `).run();

  // Create memory table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      fact TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `).run();

  // Create memory uploads table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS memory_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      image_path TEXT,
      memory_date DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `).run();

  // Create quotes table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote TEXT NOT NULL,
      author TEXT
    )
  `).run();

  // Insert some default quotes if the table is empty
  const quotesCount = db.prepare('SELECT COUNT(*) as count FROM quotes').get();
  
  if (quotesCount.count === 0) {
    const defaultQuotes = [
      { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
      { quote: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
      { quote: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
      { quote: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
      { quote: "You are never too old to set another goal or to dream a new dream.", author: "C.S. Lewis" },
      { quote: "The only limit to our realization of tomorrow will be our doubts of today.", author: "Franklin D. Roosevelt" },
      { quote: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
      { quote: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
      { quote: "The secret of getting ahead is getting started.", author: "Mark Twain" },
      { quote: "Your time is limited, don't waste it living someone else's life.", author: "Steve Jobs" }
    ];
    
    const insertQuote = db.prepare('INSERT INTO quotes (quote, author) VALUES (?, ?)');
    
    for (const q of defaultQuotes) {
      insertQuote.run(q.quote, q.author);
    }
  }

   db.prepare(`
    CREATE TABLE IF NOT EXISTS memory_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id INTEGER NOT NULL,
      image_base64 TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (memory_id) REFERENCES memory_uploads (id) ON DELETE CASCADE
    )
  `).run()

  // Temporarily disable foreign key checks
  db.pragma('foreign_keys = OFF');

  db.prepare(`
    CREATE TABLE IF NOT EXISTS memory_uploads_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      memory_date DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `).run();

  db.prepare(`
    INSERT INTO memory_uploads_new (id, user_id, title, description, location, memory_date, created_at)
    SELECT id, user_id, title, description, location, memory_date, created_at FROM memory_uploads
  `).run();

  db.prepare(`DROP TABLE IF EXISTS memory_uploads`).run();

  db.prepare(`ALTER TABLE memory_uploads_new RENAME TO memory_uploads`).run();

  // Re-enable foreign key checks
  db.pragma('foreign_keys = ON');

  console.log('Database setup completed');
}

export { db, setupDatabase };