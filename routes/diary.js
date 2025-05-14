import express from "express"
import { authenticate } from "../middleware/authenticate.js"
import { logger } from "../utils/logger.js"
import { getAllDiaryEntries, getDiaryEntry, updateDiaryEntry, deleteDiaryEntry } from "../services/diary.js"
import dotenv from 'dotenv'


dotenv.config()

const router = express.Router()
// Get all diary entries
router.get("/entries", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user
    const entries = await getAllDiaryEntries(userId)
    res.json({ entries })
  } catch (error) {
    logger.error("Get diary entries error:", error)
    next(error)
  }
})

// Get a specific diary entry
router.get("/entries/:id", authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user
    const { id } = req.params

    const entry = getDiaryEntry(id, userId)

    if (!entry) {
      return res.status(404).json({ error: "Diary entry not found" })
    }

    res.json({ entry })
  } catch (error) {
    logger.error("Get diary entry error:", error)
    next(error)
  }
})

// Update a diary entry
router.put('/entries/:id', authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;
    const { title, entry, mood, mood_emoji } = req.body;

    // Validate required fields
    if (!entry) {
      return res.status(400).json({ error: 'Entry content is required' });
    }

    // Check if entry exists and belongs to user
    const existingEntry = getDiaryEntry(id, userId);

    if (!existingEntry) {
      return res.status(404).json({ error: 'Diary entry not found' });
    }

    // Update the entry
    const updatedEntry = updateDiaryEntry(id, userId, {
      title,
      entry,
      mood,
      mood_emoji
    });

    res.json({
      message: 'Diary entry updated successfully',
      entry: updatedEntry
    });
  } catch (error) {
    logger.error('Update diary entry error:', error);
    next(error);
  }
});

// Delete a diary entry
router.delete('/entries/:id', authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;
    
    // Check if entry exists and belongs to user
    const existingEntry = getDiaryEntry(id, userId);
    
    if (!existingEntry) {
      return res.status(404).json({ error: 'Diary entry not found' });
    }
    
    // Delete the entry
    const deleted = deleteDiaryEntry(id, userId);
    
    if (!deleted) {
      return res.status(500).json({ error: 'Failed to delete diary entry' });
    }
    
    res.json({
      message: 'Diary entry deleted successfully'
    });
  } catch (error) {
    logger.error('Delete diary entry error:', error);
    next(error);
  }
});

export default router;
