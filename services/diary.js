import { db } from "./storage.js"
import { logger } from "../utils/logger.js"
import { detectMood, generateTitle, generateDiaryFromConversations } from "./ai.js"

// Get today's conversations for a user
async function getTodayConversations(userId) {
  try {
    const today = new Date().toISOString().split("T")[0]

    const conversations = db
      .prepare(`
      SELECT id, user_message, ai_response, created_at
      FROM conversations
      WHERE user_id = ? AND date(created_at) = date(?)
      ORDER BY created_at ASC
    `)
      .all(userId, today)

    return {
      date: today,
      count: conversations.length,
      conversations,
    }
  } catch (error) {
    logger.error("Get today conversations error:", error)
    throw error
  }
}

// Get conversations for a specific date
async function getConversationsByDate(userId, date) {
  try {
    const conversations = db
      .prepare(`
      SELECT id, user_message, ai_response, created_at
      FROM conversations
      WHERE user_id = ? AND date(created_at) = date(?)
      ORDER BY created_at ASC
    `)
      .all(userId, date)

    return {
      date,
      count: conversations.length,
      conversations,
    }
  } catch (error) {
    logger.error("Get conversations by date error:", error)
    throw error
  }
}

// Store a conversation
async function storeConversation(userId, userMessage, aiResponse) {
  try {
    const result = db
      .prepare(`
      INSERT INTO conversations (user_id, user_message, ai_response, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `)
      .run(userId, userMessage, aiResponse)

    return result.lastInsertRowid
  } catch (error) {
    logger.error("Store conversation error:", error)
    throw error
  }
}

// Generate and store a diary entry from today's conversations
async function generateDiaryEntry(userId) {
  try {
    // Check if a diary entry already exists for today
    const today = new Date().toISOString().split("T")[0]
    const existingEntry = db
      .prepare(`
      SELECT * FROM diary_entries 
      WHERE user_id = ? AND date(created_at) = date(?)
    `)
      .get(userId, today)

    if (existingEntry) {
      return {
        exists: true,
        entryId: existingEntry.id,
        entry: existingEntry,
      }
    }

    // Get today's conversations
    const { conversations } = await getTodayConversations(userId)

    if (conversations.length === 0) {
      throw new Error("No conversations found for today")
    }

    // Generate diary entry
    const diaryEntry = await generateDiaryFromConversations(conversations)

    // Detect mood with emoji
    const { mood, emoji } = await detectMood(diaryEntry)

    // Generate title
    const title = await generateTitle(diaryEntry)

    // Save diary entry
    const insertResult = db
      .prepare(`
      INSERT INTO diary_entries (user_id, title, entry, mood, mood_emoji, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `)
      .run(userId, title, diaryEntry, mood, emoji)

    return {
      exists: false,
      entryId: insertResult.lastInsertRowid,
      entry: {
        id: insertResult.lastInsertRowid,
        title,
        entry: diaryEntry,
        mood,
        mood_emoji: emoji,
        created_at: new Date().toISOString(),
      },
    }
  } catch (error) {
    logger.error("Generate diary entry error:", error)
    throw error
  }
}

// Get all diary entries for a user
async function getAllDiaryEntries(userId) {
  try {
    const entries = db
      .prepare(`
      SELECT id, title, entry, mood, mood_emoji, created_at, updated_at
      FROM diary_entries
      WHERE user_id = ?
      ORDER BY created_at DESC
    `)
      .all(userId)

    return entries
  } catch (error) {
    logger.error("Get all diary entries error:", error)
    throw error
  }
}

// Get a specific diary entry
function getDiaryEntry(entryId, userId) {
  try {
    const entry = db
      .prepare(`
      SELECT id, title, entry, mood, mood_emoji, created_at, updated_at
      FROM diary_entries
      WHERE id = ? AND user_id = ?
    `)
      .get(entryId, userId)

    return entry
  } catch (error) {
    logger.error("Get diary entry error:", error)
    throw error
  }
}

// Update a diary entry
function updateDiaryEntry(entryId, userId, updates) {
  try {
    const { title, entry, mood, mood_emoji } = updates

    db.prepare(`
      UPDATE diary_entries
      SET title = ?, entry = ?, mood = ?, mood_emoji = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(title || null, entry, mood || "neutral", mood_emoji || "😐", entryId, userId)

    return getDiaryEntry(entryId, userId)
  } catch (error) {
    logger.error("Update diary entry error:", error)
    throw error
  }
}

// Delete a diary entry
function deleteDiaryEntry(entryId, userId) {
  try {
    const result = db
      .prepare(`
      DELETE FROM diary_entries
      WHERE id = ? AND user_id = ?
    `)
      .run(entryId, userId)

    return result.changes > 0
  } catch (error) {
    logger.error("Delete diary entry error:", error)
    throw error
  }
}

export {
  getTodayConversations,
  getConversationsByDate,
  storeConversation,
  generateDiaryEntry,
  getAllDiaryEntries,
  getDiaryEntry,
  updateDiaryEntry,
  deleteDiaryEntry,
}
