import express from "express"
import { authenticate } from "../middleware/authenticate.js"
import { db } from "../services/storage.js"

const router = express.Router()

// Upload memory with multiple base64 images
router.post("/", authenticate, async (req, res) => {
  try {
    const { userId } = req.user
    const { title, description, location, date, selectedImages } = req.body

    if (!title || !date) {
      return res.status(400).json({ error: "Title and date are required" })
    }

    // Validate images array
    if (!selectedImages || !Array.isArray(selectedImages)) {
      return res.status(400).json({ error: "Selected images must be an array" })
    }

    // Begin transaction
    db.prepare("BEGIN TRANSACTION").run()

    try {
      // Insert the memory
      const result = db
        .prepare(`
        INSERT INTO memory_uploads (user_id, title, description, location, memory_date, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `)
        .run(userId, title, description || null, location || null, date)

      const memoryId = result.lastInsertRowid

      // Process and save each image
      const insertImage = db.prepare(`
        INSERT INTO memory_images (memory_id, image_base64)
        VALUES (?, ?)
      `)

      for (const imagePath of selectedImages) {
        // For mobile file paths, we need to convert them to base64
        // In a real implementation, you would receive the actual base64 data
        // This is a placeholder for demonstration

        // In a real implementation, the client would send base64 strings directly
        // Here we're just simulating by using the path as the "base64" content
        const base64Content = imagePath

        insertImage.run(memoryId, base64Content)
      }

      // Commit transaction
      db.prepare("COMMIT").run()

      // Get the images for the response
      const images = db
        .prepare(`
        SELECT id FROM memory_images
        WHERE memory_id = ?
        ORDER BY created_at ASC
      `)
        .all(memoryId)

      res.status(201).json({
        message: "Memory uploaded successfully",
        memoryId,
        title,
        description,
        location,
        date,
        imageCount: images.length,
        imageIds: images.map((img) => img.id),
      })
    } catch (error) {
      // Rollback transaction on error
      db.prepare("ROLLBACK").run()
      throw error
    }
  } catch (error) {
    console.error("Memory upload error:", error)
    res.status(500).json({ error: "Failed to upload memory" })
  }
})

// Get all memories
router.get("/", authenticate, async (req, res) => {
  try {
    const { userId } = req.user

    const memories = db
      .prepare(`
      SELECT id, title, description, location, memory_date, created_at
      FROM memory_uploads
      WHERE user_id = ?
      ORDER BY memory_date DESC
    `)
      .all(userId)

    // Get image counts for each memory
    const memoriesWithImages = memories.map((memory) => {
      const imageCount = db
        .prepare(`
        SELECT COUNT(*) as count FROM memory_images
        WHERE memory_id = ?
      `)
        .get(memory.id).count

      // Get first image as thumbnail if available
      const firstImage = db
        .prepare(`
        SELECT image_base64 FROM memory_images
        WHERE memory_id = ?
        ORDER BY created_at ASC
        LIMIT 1
      `)
        .get(memory.id)

      return {
        ...memory,
        imageCount,
        thumbnail: firstImage ? firstImage.image_base64 : null,
      }
    })

    res.json({ memories: memoriesWithImages })
  } catch (error) {
    console.error("Get memories error:", error)
    res.status(500).json({ error: "Failed to retrieve memories" })
  }
})

// Get a specific memory with all images
router.get("/:id", authenticate, async (req, res) => {
  try {
    const { userId } = req.user
    const { id } = req.params

    const memory = db
      .prepare(`
      SELECT id, title, description, location, memory_date, created_at
      FROM memory_uploads
      WHERE id = ? AND user_id = ?
    `)
      .get(id, userId)

    if (!memory) {
      return res.status(404).json({ error: "Memory not found" })
    }

    // Get all images for this memory
    const images = db
      .prepare(`
      SELECT id, image_base64
      FROM memory_images
      WHERE memory_id = ?
      ORDER BY created_at ASC
    `)
      .all(memory.id)

    memory.images = images

    res.json({ memory })
  } catch (error) {
    console.error("Get memory error:", error)
    res.status(500).json({ error: "Failed to retrieve memory" })
  }
})

// Edit a memory
router.put("/:id", authenticate, async (req, res) => {
  try {
    const { userId } = req.user
    const { id } = req.params
    const { title, description, location, date, selectedImages, keepExistingImages } = req.body

    // Check if memory exists and belongs to user
    const existingMemory = db
      .prepare(`
      SELECT id FROM memory_uploads
      WHERE id = ? AND user_id = ?
    `)
      .get(id, userId)

    if (!existingMemory) {
      return res.status(404).json({ error: "Memory not found" })
    }

    // Begin transaction
    db.prepare("BEGIN TRANSACTION").run()

    try {
      // Update the memory
      db.prepare(`
        UPDATE memory_uploads
        SET title = ?, description = ?, location = ?, memory_date = ?
        WHERE id = ? AND user_id = ?
      `).run(title, description || null, location || null, date, id, userId)

      // Handle images
      if (keepExistingImages !== true) {
        // Delete all existing images if not keeping them
        db.prepare(`
          DELETE FROM memory_images
          WHERE memory_id = ?
        `).run(id)
      }

      // Add new images if provided
      if (selectedImages && Array.isArray(selectedImages) && selectedImages.length > 0) {
        const insertImage = db.prepare(`
          INSERT INTO memory_images (memory_id, image_base64)
          VALUES (?, ?)
        `)

        for (const imagePath of selectedImages) {
          // In a real implementation, the client would send base64 strings directly
          const base64Content = imagePath

          insertImage.run(id, base64Content)
        }
      }

      // Commit transaction
      db.prepare("COMMIT").run()

      // Get the updated memory with images
      const updatedMemory = db
        .prepare(`
        SELECT id, title, description, location, memory_date, created_at
        FROM memory_uploads
        WHERE id = ?
      `)
        .get(id)

      // Get all images for this memory
      const images = db
        .prepare(`
        SELECT id, image_base64
        FROM memory_images
        WHERE memory_id = ?
        ORDER BY created_at ASC
      `)
        .all(id)

      updatedMemory.images = images

      res.json({
        message: "Memory updated successfully",
        memory: updatedMemory,
      })
    } catch (error) {
      // Rollback transaction on error
      db.prepare("ROLLBACK").run()
      throw error
    }
  } catch (error) {
    console.error("Update memory error:", error)
    res.status(500).json({ error: "Failed to update memory" })
  }
})

// Delete a memory
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const { userId } = req.user
    const { id } = req.params

    // Check if memory exists and belongs to user
    const existingMemory = db
      .prepare(`
      SELECT id FROM memory_uploads
      WHERE id = ? AND user_id = ?
    `)
      .get(id, userId)

    if (!existingMemory) {
      return res.status(404).json({ error: "Memory not found" })
    }

    // Begin transaction
    db.prepare("BEGIN TRANSACTION").run()

    try {
      // Delete all images for this memory
      db.prepare(`
        DELETE FROM memory_images
        WHERE memory_id = ?
      `).run(id)

      // Delete the memory
      db.prepare(`
        DELETE FROM memory_uploads
        WHERE id = ? AND user_id = ?
      `).run(id, userId)

      // Commit transaction
      db.prepare("COMMIT").run()

      res.json({
        message: "Memory deleted successfully",
      })
    } catch (error) {
      // Rollback transaction on error
      db.prepare("ROLLBACK").run()
      throw error
    }
  } catch (error) {
    console.error("Delete memory error:", error)
    res.status(500).json({ error: "Failed to delete memory" })
  }
})

// Search memories
router.get("/search/:query", authenticate, async (req, res) => {
  try {
    const { userId } = req.user
    const { query } = req.params

    if (!query || query.length < 2) {
      return res.status(400).json({ error: "Search query must be at least 2 characters" })
    }

    const memories = db
      .prepare(`
      SELECT id, title, description, location, memory_date, created_at
      FROM memory_uploads
      WHERE user_id = ? AND (
        title LIKE ? OR
        description LIKE ? OR
        location LIKE ?
      )
      ORDER BY memory_date DESC
    `)
      .all(userId, `%${query}%`, `%${query}%`, `%${query}%`)

    // Get image counts and thumbnails for each memory
    const memoriesWithImages = memories.map((memory) => {
      const imageCount = db
        .prepare(`
        SELECT COUNT(*) as count FROM memory_images
        WHERE memory_id = ?
      `)
        .get(memory.id).count

      // Get first image as thumbnail if available
      const firstImage = db
        .prepare(`
        SELECT image_base64 FROM memory_images
        WHERE memory_id = ?
        ORDER BY created_at ASC
        LIMIT 1
      `)
        .get(memory.id)

      return {
        ...memory,
        imageCount,
        thumbnail: firstImage ? firstImage.image_base64 : null,
      }
    })

    res.json({
      query,
      count: memoriesWithImages.length,
      memories: memoriesWithImages,
    })
  } catch (error) {
    console.error("Search memories error:", error)
    res.status(500).json({ error: "Failed to search memories" })
  }
})

// Get a specific image from a memory
router.get("/:memoryId/images/:imageId", authenticate, async (req, res) => {
  try {
    const { userId } = req.user
    const { memoryId, imageId } = req.params

    // Check if memory exists and belongs to user
    const existingMemory = db
      .prepare(`
      SELECT id FROM memory_uploads
      WHERE id = ? AND user_id = ?
    `)
      .get(memoryId, userId)

    if (!existingMemory) {
      return res.status(404).json({ error: "Memory not found" })
    }

    // Get the image
    const image = db
      .prepare(`
      SELECT id, image_base64
      FROM memory_images
      WHERE id = ? AND memory_id = ?
    `)
      .get(imageId, memoryId)

    if (!image) {
      return res.status(404).json({ error: "Image not found" })
    }

    res.json({ image })
  } catch (error) {
    console.error("Get image error:", error)
    res.status(500).json({ error: "Failed to retrieve image" })
  }
})

export default router
