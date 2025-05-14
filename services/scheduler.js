import schedule from 'node-schedule';
import { db } from './storage.js';
import { detectMood, generateTitle, generateDiaryEntry } from './ai.js';

// Generate diary entry for a user
async function generateUserDiaryEntry(userId, date) {
  try {
    // Get the day's conversations
    const conversations = db.prepare(`
      SELECT user_message, ai_response, created_at
      FROM conversations
      WHERE user_id = ? AND date(created_at) = date(?)
      ORDER BY created_at ASC
    `).all(userId, date);
    
    if (conversations.length === 0) {
      console.log(`No conversations found for user ${userId} on ${date}`);
      return null;
    }
    
    // Extract just the user messages for a more authentic diary
    const userMessages = conversations.map(conv => conv.user_message);
    
    // Generate diary entry
    const diaryEntry = await generateDiaryEntry(userMessages);
    
    // Detect mood with emoji
    const { mood, emoji } = await detectMood(diaryEntry);
    
    // Generate title
    const title = await generateTitle(diaryEntry);
    
    // Save diary entry
    const insertResult = db.prepare(`
      INSERT INTO diary_entries (user_id, title, entry, mood, mood_emoji, created_at)
      VALUES (?, ?, ?, ?, ?, datetime(?))
    `).run(userId, title, diaryEntry, mood, emoji, `${date}T23:59:59.999Z`);
    
    console.log(`Auto-generated diary entry for user ${userId} on ${date}`);
    
    return {
      entryId: insertResult.lastInsertRowid,
      title,
      entry: diaryEntry,
      mood,
      mood_emoji: emoji,
      date
    };
  } catch (error) {
    console.error(`Error generating diary entry for user ${userId} on ${date}:`, error);
    return null;
  }
}

// Schedule daily diary entry generation
function scheduleDailyEntryGeneration() {
  // Schedule to run at 11:59 PM every day
  const job = schedule.scheduleJob('59 23 * * *', async function() {
    try {
      console.log('Running scheduled diary entry generation...');
      
      const today = new Date().toISOString().split('T')[0];
      
      // Get all users
      const users = db.prepare('SELECT id FROM users').all();
      
      for (const user of users) {
        // Check if a diary entry already exists for today
        const existingEntry = db.prepare(`
          SELECT id FROM diary_entries 
          WHERE user_id = ? AND date(created_at) = date(?)
        `).get(user.id, today);
        
        if (!existingEntry) {
          // Generate diary entry for this user
          await generateUserDiaryEntry(user.id, today);
        }
      }
      
      console.log('Scheduled diary entry generation completed');
    } catch (error) {
      console.error('Error in scheduled diary entry generation:', error);
    }
  });
  
  console.log('Daily diary entry generation scheduled');
  return job;
}

// Function to manually trigger diary entry generation for testing
async function generateMissingEntries(date = null) {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    console.log(`Generating missing diary entries for ${targetDate}...`);
    
    // Get all users
    const users = db.prepare('SELECT id FROM users').all();
    
    let generatedCount = 0;
    
    for (const user of users) {
      // Check if a diary entry already exists for the target date
      const existingEntry = db.prepare(`
        SELECT id FROM diary_entries 
        WHERE user_id = ? AND date(created_at) = date(?)
      `).get(user.id, targetDate);
      
      if (!existingEntry) {
        // Check if there are conversations for this date
        const conversationsExist = db.prepare(`
          SELECT COUNT(*) as count
          FROM conversations
          WHERE user_id = ? AND date(created_at) = date(?)
        `).get(user.id, targetDate);
        
        if (conversationsExist.count > 0) {
          // Generate diary entry for this user
          const result = await generateUserDiaryEntry(user.id, targetDate);
          if (result) generatedCount++;
        }
      }
    }
    
    console.log(`Generated ${generatedCount} missing diary entries for ${targetDate}`);
    return generatedCount;
  } catch (error) {
    console.error('Error generating missing entries:', error);
    return 0;
  }
}

export { scheduleDailyEntryGeneration, generateMissingEntries, generateUserDiaryEntry };