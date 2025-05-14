import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authenticate } from '../middleware/authenticate.js';
import { db } from '../services/storage.js';

const router = express.Router();

// Configure multer for file uploads
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Create user-specific directory
    const userDir = path.join(uploadsDir, req.user.userId.toString());
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: function (req, file, cb) {
    // Create unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter to only allow images
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: fileFilter
});

// Upload memory with image
router.post('/', authenticate, upload.single('image'), async (req, res) => {
  try {
    const { userId } = req.user;
    const { title, description, location, memory_date } = req.body;
    
    if (!title || !memory_date) {
      return res.status(400).json({ error: 'Title and date are required' });
    }
    
    // Get the image path if an image was uploaded
    const imagePath = req.file ? path.relative(uploadsDir, req.file.path) : null;
    
    // Insert the memory
    const result = db.prepare(`
      INSERT INTO memory_uploads (user_id, title, description, location, image_path, memory_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      userId,
      title,
      description || null,
      location || null,
      imagePath,
      memory_date
    );
    
    res.status(201).json({
      message: 'Memory uploaded successfully',
      memoryId: result.lastInsertRowid,
      title,
      description,
      location,
      image_path: imagePath,
      memory_date
    });
  } catch (error) {
    console.error('Memory upload error:', error);
    res.status(500).json({ error: 'Failed to upload memory' });
  }
});

// Get all memories
router.get('/', authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    
    const memories = db.prepare(`
      SELECT id, title, description, location, image_path, memory_date, created_at
      FROM memory_uploads
      WHERE user_id = ?
      ORDER BY memory_date DESC
    `).all(userId);
    
    // Add full image URLs
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const memoriesWithUrls = memories.map(memory => ({
      ...memory,
      image_url: memory.image_path ? `${baseUrl}/uploads/${userId}/${memory.image_path}` : null
    }));
    
    res.json({ memories: memoriesWithUrls });
  } catch (error) {
    console.error('Get memories error:', error);
    res.status(500).json({ error: 'Failed to retrieve memories' });
  }
});

// Get a specific memory
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;
    
    const memory = db.prepare(`
      SELECT id, title, description, location, image_path, memory_date, created_at
      FROM memory_uploads
      WHERE id = ? AND user_id = ?
    `).get(id, userId);
    
    if (!memory) {
      return res.status(404).json({ error: 'Memory not found' });
    }
    
    // Add full image URL
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    memory.image_url = memory.image_path ? `${baseUrl}/uploads/${userId}/${memory.image_path}` : null;
    
    res.json({ memory });
  } catch (error) {
    console.error('Get memory error:', error);
    res.status(500).json({ error: 'Failed to retrieve memory' });
  }
});

// Edit a memory
router.put('/:id', authenticate, upload.single('image'), async (req, res) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;
    const { title, description, location, memory_date } = req.body;
    
    // Check if memory exists and belongs to user
    const existingMemory = db.prepare(`
      SELECT id, image_path FROM memory_uploads
      WHERE id = ? AND user_id = ?
    `).get(id, userId);
    
    if (!existingMemory) {
      return res.status(404).json({ error: 'Memory not found' });
    }
    
    // Get the image path if a new image was uploaded
    let imagePath = existingMemory.image_path;
    if (req.file) {
      // Delete old image if it exists
      if (existingMemory.image_path) {
        const oldImagePath = path.join(uploadsDir, userId.toString(), existingMemory.image_path);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      imagePath = path.relative(uploadsDir, req.file.path);
    }
    
    // Update the memory
    db.prepare(`
      UPDATE memory_uploads
      SET title = ?, description = ?, location = ?, image_path = ?, memory_date = ?
      WHERE id = ? AND user_id = ?
    `).run(
      title,
      description || null,
      location || null,
      imagePath,
      memory_date,
      id,
      userId
    );
    
    // Get the updated memory
    const updatedMemory = db.prepare(`
      SELECT id, title, description, location, image_path, memory_date, created_at
      FROM memory_uploads
      WHERE id = ?
    `).get(id);
    
    // Add full image URL
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    updatedMemory.image_url = updatedMemory.image_path ? `${baseUrl}/uploads/${userId}/${updatedMemory.image_path}` : null;
    
    res.json({
      message: 'Memory updated successfully',
      memory: updatedMemory
    });
  } catch (error) {
    console.error('Update memory error:', error);
    res.status(500).json({ error: 'Failed to update memory' });
  }
});

// Delete a memory
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;
    
    // Check if memory exists and belongs to user
    const existingMemory = db.prepare(`
      SELECT id, image_path FROM memory_uploads
      WHERE id = ? AND user_id = ?
    `).get(id, userId);
    
    if (!existingMemory) {
      return res.status(404).json({ error: 'Memory not found' });
    }
    
    // Delete the image if it exists
    if (existingMemory.image_path) {
      const imagePath = path.join(uploadsDir, userId.toString(), existingMemory.image_path);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    // Delete the memory
    db.prepare(`
      DELETE FROM memory_uploads
      WHERE id = ? AND user_id = ?
    `).run(id, userId);
    
    res.json({
      message: 'Memory deleted successfully'
    });
  } catch (error) {
    console.error('Delete memory error:', error);
    res.status(500).json({ error: 'Failed to delete memory' });
  }
});

// Search memories
router.get('/search/:query', authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const { query } = req.params;
    
    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    
    const memories = db.prepare(`
      SELECT id, title, description, location, image_path, memory_date, created_at
      FROM memory_uploads
      WHERE user_id = ? AND (
        title LIKE ? OR
        description LIKE ? OR
        location LIKE ?
      )
      ORDER BY memory_date DESC
    `).all(userId, `%${query}%`, `%${query}%`, `%${query}%`);
    
    // Add full image URLs
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const memoriesWithUrls = memories.map(memory => ({
      ...memory,
      image_url: memory.image_path ? `${baseUrl}/uploads/${userId}/${memory.image_path}` : null
    }));
    
    res.json({ 
      query,
      count: memoriesWithUrls.length,
      memories: memoriesWithUrls 
    });
  } catch (error) {
    console.error('Search memories error:', error);
    res.status(500).json({ error: 'Failed to search memories' });
  }
});

export default router;