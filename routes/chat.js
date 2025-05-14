import express from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { quoteMiddleware } from '../middleware/quote.js';
import { db } from '../services/storage.js';
import { getUserMemory, updateUserMemory } from '../services/memory.js';
import { generateMissingEntries, generateUserDiaryEntry } from '../services/scheduler.js';
import { 
  generateChatResponse, 
  detectMood, 
  generateTitle, 
  moodEmojis 
} from '../services/ai.js';

const router = express.Router();

// AI chat response endpoint
router.post('/respond', authenticate, quoteMiddleware, async (req, res) => {
  try {
    const { userId } = req.user;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get user settings
    const settings = db.prepare('SELECT ai_friend_name FROM user_settings WHERE user_id = ?').get(userId);
    const aiFriendName = settings?.ai_friend_name || 'AI Friend';
    
    // Get user memory
    const userMemory = await getUserMemory(userId);
    
    // Generate AI response
    const aiResponse = await generateChatResponse(
      userId, 
      message, 
      aiFriendName, 
      userMemory, 
      req.motivation
    );
    
    // Store the conversation
    db.prepare(`
      INSERT INTO conversations (user_id, user_message, ai_response, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(userId, message, aiResponse);
    
    // Extract potential memory from this interaction
    await updateUserMemory(userId, message, aiResponse);
    
    res.json({
      response: aiResponse,
      aiFriendName
    });
  } catch (error) {
    console.error('Chat response error:', error);
    res.status(500).json({ error: 'Failed to generate AI response' });
  }
});

// Get today's conversations
router.get('/conversations/today', authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const today = new Date().toISOString().split('T')[0];
    
    // Get today's conversations
    const conversations = db.prepare(`
      SELECT id, user_message, ai_response, created_at
      FROM conversations
      WHERE user_id = ? AND date(created_at) = date(?)
      ORDER BY created_at ASC
    `).all(userId, today);
    
    res.json({
      date: today,
      count: conversations.length,
      conversations
    });
  } catch (error) {
    console.error('Get today conversations error:', error);
    res.status(500).json({ error: 'Failed to retrieve today\'s conversations' });
  }
});

// Get conversations by date
router.get('/conversations/date/:date', authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const { date } = req.params;
    
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    
    // Get conversations for the specified date
    const conversations = db.prepare(`
      SELECT id, user_message, ai_response, created_at
      FROM conversations
      WHERE user_id = ? AND date(created_at) = date(?)
      ORDER BY created_at ASC
    `).all(userId, date);
    
    res.json({
      date,
      count: conversations.length,
      conversations
    });
  } catch (error) {
    console.error('Get conversations by date error:', error);
    res.status(500).json({ error: 'Failed to retrieve conversations' });
  }
});

// Delete a conversation
router.delete('/conversations/:id', authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;
    
    // Check if conversation exists and belongs to user
    const conversation = db.prepare(`
      SELECT id FROM conversations
      WHERE id = ? AND user_id = ?
    `).get(id, userId);
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    // Delete the conversation
    db.prepare(`
      DELETE FROM conversations
      WHERE id = ?
    `).run(id);
    
    res.json({
      message: 'Conversation deleted successfully'
    });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// Generate diary entry from conversation
router.post('/entries', authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const { date } = req.body;
    
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    // Check if a diary entry already exists for the target date
    const existingEntry = db.prepare(`
      SELECT * FROM diary_entries 
      WHERE user_id = ? AND date(created_at) = date(?)
    `).get(userId, targetDate);
    
    if (existingEntry) {
      return res.status(409).json({ 
        error: 'A diary entry already exists for this date',
        entryId: existingEntry.id
      });
    }
    
    // Generate diary entry
    const result = await generateUserDiaryEntry(userId, targetDate);
    
    if (!result) {
      return res.status(404).json({ error: 'No conversations found for this date' });
    }
    
    res.status(201).json({
      message: 'Diary entry created successfully',
      entryId: result.entryId,
      title: result.title,
      entry: result.entry,
      mood: result.mood,
      mood_emoji: result.emoji,
      date: targetDate
    });
  } catch (error) {
    console.error('Diary generation error:', error);
    res.status(500).json({ error: 'Failed to generate diary entry' });
  }
});

// Get all diary entries
router.get('/entries', authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    
    const entries = db.prepare(`
      SELECT id, title, entry, mood, mood_emoji, created_at, updated_at
      FROM diary_entries
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId);
    
    res.json({ entries });
  } catch (error) {
    console.error('Get entries error:', error);
    res.status(500).json({ error: 'Failed to retrieve diary entries' });
  }
});

// Get a specific diary entry
router.get('/entries/:id', authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;
    
    const entry = db.prepare(`
      SELECT id, title, entry, mood, mood_emoji, created_at, updated_at
      FROM diary_entries
      WHERE id = ? AND user_id = ?
    `).get(id, userId);
    
    if (!entry) {
      return res.status(404).json({ error: 'Diary entry not found' });
    }
    
    res.json({ entry });
  } catch (error) {
    console.error('Get entry error:', error);
    res.status(500).json({ error: 'Failed to retrieve diary entry' });
  }
});

// Edit a diary entry
router.put('/entries/:id', authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;
    const { title, entry, mood, mood_emoji } = req.body;
    
    // Validate required fields
    if (!entry) {
      return res.status(400).json({ error: 'Entry content is required' });
    }
    
    // Check if entry exists and belongs to user
    const existingEntry = db.prepare(`
      SELECT id FROM diary_entries
      WHERE id = ? AND user_id = ?
    `).get(id, userId);
    
    if (!existingEntry) {
      return res.status(404).json({ error: 'Diary entry not found' });
    }
    
    // Update the entry
    db.prepare(`
      UPDATE diary_entries
      SET title = ?, entry = ?, mood = ?, mood_emoji = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(
      title || null,
      entry,
      mood || 'neutral',
      mood_emoji || '😐',
      id,
      userId
    );
    
    // Get the updated entry
    const updatedEntry = db.prepare(`
      SELECT id, title, entry, mood, mood_emoji, created_at, updated_at
      FROM diary_entries
      WHERE id = ?
    `).get(id);
    
    res.json({
      message: 'Diary entry updated successfully',
      entry: updatedEntry
    });
  } catch (error) {
    console.error('Update entry error:', error);
    res.status(500).json({ error: 'Failed to update diary entry' });
  }
});

// Delete a diary entry
router.delete('/entries/:id', authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;
    
    // Check if entry exists and belongs to user
    const entry = db.prepare(`
      SELECT id FROM diary_entries
      WHERE id = ? AND user_id = ?
    `).get(id, userId);
    
    if (!entry) {
      return res.status(404).json({ error: 'Diary entry not found' });
    }
    
    // Delete the entry
    db.prepare(`
      DELETE FROM diary_entries
      WHERE id = ?
    `).run(id);
    
    res.json({
      message: 'Diary entry deleted successfully'
    });
  } catch (error) {
    console.error('Delete entry error:', error);
    res.status(500).json({ error: 'Failed to delete diary entry' });
  }
});

// Get motivational quote
router.get('/quote', authenticate, quoteMiddleware, (req, res) => {
  res.json({ quote: req.motivation });
});

// Get available mood emojis
router.get('/moods', authenticate, (req, res) => {
  try {
    const moods = Object.entries(moodEmojis).map(([mood, emoji]) => ({
      mood,
      emoji
    }));
    
    res.json({ moods });
  } catch (error) {
    console.error('Get moods error:', error);
    res.status(500).json({ error: 'Failed to retrieve moods' });
  }
});

// Generate a title for an entry
router.post('/generate-title', authenticate, async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text content is required' });
    }
    
    const title = await generateTitle(text);
    
    res.json({ title });
  } catch (error) {
    console.error('Title generation error:', error);
    res.status(500).json({ error: 'Failed to generate title' });
  }
});

// Admin endpoint to manually generate missing diary entries
router.post('/generate-entries', authenticate, async (req, res) => {
  try {
    const { date } = req.body;
    
    const generatedCount = await generateMissingEntries(date);
    
    res.json({
      message: `Generated ${generatedCount} missing diary entries`,
      date: date || new Date().toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Generate entries error:', error);
    res.status(500).json({ error: 'Failed to generate diary entries' });
  }
});

export default router;