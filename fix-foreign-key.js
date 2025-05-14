import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path - adjust this to match your actual database path
const dbPath = path.join(__dirname, 'data', 'data.db');

console.log(`Attempting to connect to database at: ${dbPath}`);

try {
  // Connect to the database
  const db = new Database(dbPath);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Check if user ID 2 exists
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(2);
  
  if (!user) {
    console.log('User ID 2 does not exist in the database. This is causing the foreign key constraint error.');
    
    // Create user ID 2
    console.log('Creating user ID 2...');
    
    // Hash a simple password (in a real app, use bcrypt)
    const hashedPassword = 'password_hash_placeholder';
    
    // Insert the user
    const result = db.prepare(
      'INSERT INTO users (id, username, password, created_at) VALUES (?, ?, ?, ?)'
    ).run(2, 'madan', hashedPassword, new Date().toISOString());
    
    console.log('User created successfully:', result);
    
    // Create user settings
    db.prepare(
      'INSERT INTO user_settings (user_id, ai_friend_name) VALUES (?, ?)'
    ).run(2, 'AI Friend');
    
    console.log('User settings created successfully');
  } else {
    console.log('User ID 2 exists in the database:', user);
    
    // Check for other potential foreign key issues
    console.log('\nChecking for other potential issues:');
    
    // Check user_settings
    const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(2);
    if (!settings) {
      console.log('User settings for user ID 2 do not exist. This could cause issues.');
      console.log('Creating user settings...');
      db.prepare(
        'INSERT INTO user_settings (user_id, ai_friend_name) VALUES (?, ?)'
      ).run(2, 'AI Friend');
      console.log('User settings created successfully');
    } else {
      console.log('User settings exist:', settings);
    }
  }
  
  // Check for any tables with foreign key constraints to users
  console.log('\nChecking for foreign key constraints:');
  
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `).all();
  
  for (const table of tables) {
    const tableInfo = db.prepare(`PRAGMA table_info(${table.name})`).all();
    const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${table.name})`).all();
    
    for (const fk of foreignKeys) {
      if (fk.table === 'users') {
        console.log(`Table ${table.name} has a foreign key to users table (${fk.from} -> ${fk.to})`);
      }
    }
  }
  
  console.log('\nFix complete. The foreign key constraint error should be resolved.');
  console.log('If you continue to experience issues, consider properly implementing JWT authentication');
  console.log('or ensuring that the hardcoded user ID exists in your database.');
  
} catch (error) {
  console.error('Error:', error);
}
