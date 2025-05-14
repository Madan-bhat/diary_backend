import { db } from "./storage.js"
db.prepare("PRAGMA foreign_keys = ON").run()
import { GoogleGenerativeAI } from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// Get user memory
async function getUserMemory(userId) {
  try {
    const memories = db
      .prepare("SELECT fact FROM memory WHERE user_id = ? ORDER BY created_at DESC LIMIT 10")
      .all(userId)
    return memories.map((m) => m.fact)
  } catch (error) {
    console.error("Get user memory error:", error)
    return []
  }
}

// Extract potential memory from conversation
async function extractMemory(userMessage, aiResponse) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

    const prompt = `
      Based on this conversation, extract ONE important fact about the user that would be useful to remember for future conversations.
      If there's nothing important to remember, respond with "NONE".
      
      User: "${userMessage}"
      AI: "${aiResponse}"
      
      Extract ONE important fact (or "NONE"):
    `

    const result = await model.generateContent(prompt)
    const memory = result.response.text().trim()

    if (memory === "NONE" || memory.toLowerCase().includes("none")) {
      return null
    }

    return memory
  } catch (error) {
    console.error("Memory extraction error:", error)
    return null
  }
}

// Update user memory
async function updateUserMemory(userId, userMessage, aiResponse) {
  try {
    const memory = await extractMemory(userMessage, aiResponse)

    if (memory) {
      // Check if this memory already exists (avoid duplicates)
      const existingMemory = db.prepare("SELECT id FROM memory WHERE user_id = ? AND fact = ?").get(userId, memory)

      if (!existingMemory) {
        // Insert new memory
        db.prepare("INSERT INTO memory (user_id, fact) VALUES (?, ?)").run(userId, memory)
        console.log(`Added new memory for user ${userId}: ${memory}`)
      }
    }

    return memory
  } catch (error) {
    console.error("Update user memory error:", error)
    return null
  }
}

// Database functions for memory uploads with base64 images

// Upload a new memory with multiple images
function uploadMemory({userId, title, description, location, date, selectedImages}) {
  try {
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

      console.log("images detected",selectedImages)

      if (selectedImages && Array.isArray(selectedImages)) {
        console.log("Received images count:", selectedImages.length);
        for (const image of selectedImages) {
          const base64 = image.split(',')[1] || image; 
          console.log("Storing image with base64 length:", base64.length);
          insertImage.run(memoryId, base64);
        }
      }

      // Commit transaction
      db.prepare("COMMIT").run()

      return {
        success: true,
        memoryId,
        imageCount: selectedImages ? selectedImages.length : 0,
      }
    } catch (error) {
      // Rollback transaction on error
      db.prepare("ROLLBACK").run()
      throw error
    }
  } catch (error) {
    console.error("Memory upload error:", error)
    return { success: false, error: error.message }
  }
}

// Get all memories for a user
function getMemories(userId) {
  try {
    const memories = db
      .prepare(`
      SELECT id, title, description, location, memory_date, created_at
      FROM memory_uploads
      WHERE user_id = ?
      ORDER BY memory_date DESC
    `)
      .all(userId)

    // Get image counts and first image for each memory
    return memories.map((memory) => {
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
  } catch (error) {
    console.error("Get memories error:", error)
    return []
  }
}

// Get a specific memory with all images
function getMemory(userId, memoryId) {
  try {
    const memory = db
      .prepare(`
      SELECT id, title, description, location, memory_date, created_at
      FROM memory_uploads
      WHERE id = ? AND user_id = ?
    `)
      .get(memoryId, userId)

    if (!memory) {
      return null
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

    return memory
  } catch (error) {
    console.error("Get memory error:", error)
    return null
  }
}

// Update a memory
function updateMemory(userId, memoryId, title, description, location, date, images, keepExistingImages) {
  try {
    // Check if memory exists and belongs to user
    const existingMemory = db
      .prepare(`
      SELECT id FROM memory_uploads
      WHERE id = ? AND user_id = ?
    `)
      .get(memoryId, userId)

    if (!existingMemory) {
      return { success: false, error: "Memory not found" }
    }

    // Begin transaction
    db.prepare("BEGIN TRANSACTION").run()

    try {
      // Update the memory
      db.prepare(`
        UPDATE memory_uploads
        SET title = ?, description = ?, location = ?, memory_date = ?
        WHERE id = ? AND user_id = ?
      `).run(title, description || null, location || null, date, memoryId, userId)

      // Handle images
      if (keepExistingImages !== true) {
        // Delete all existing images if not keeping them
        db.prepare(`
          DELETE FROM memory_images
          WHERE memory_id = ?
        `).run(memoryId)
      }

      // Add new images if provided
      if (images && Array.isArray(images) && images.length > 0) {
        const insertImage = db.prepare(`
          INSERT INTO memory_images (memory_id, image_base64)
          VALUES (?, ?)
        `)

        for (const image of images) {
          insertImage.run(memoryId, image)
        }
      }

      // Commit transaction
      db.prepare("COMMIT").run()

      return { success: true, memoryId }
    } catch (error) {
      // Rollback transaction on error
      db.prepare("ROLLBACK").run()
      throw error
    }
  } catch (error) {
    console.error("Update memory error:", error)
    return { success: false, error: error.message }
  }
}

// Delete a memory
function deleteMemory(userId, memoryId) {
  try {
    // Check if memory exists and belongs to user
    const existingMemory = db
      .prepare(`
      SELECT id FROM memory_uploads
      WHERE id = ? AND user_id = ?
    `)
      .get(memoryId, userId)

    if (!existingMemory) {
      return { success: false, error: "Memory not found" }
    }

    // Begin transaction
    db.prepare("BEGIN TRANSACTION").run()

    try {
      // Delete all images for this memory
      db.prepare(`
        DELETE FROM memory_images
        WHERE memory_id = ?
      `).run(memoryId)

      // Delete the memory
      db.prepare(`
        DELETE FROM memory_uploads
        WHERE id = ? AND user_id = ?
      `).run(memoryId, userId)

      // Commit transaction
      db.prepare("COMMIT").run()

      return { success: true }
    } catch (error) {
      // Rollback transaction on error
      db.prepare("ROLLBACK").run()
      throw error
    }
  } catch (error) {
    console.error("Delete memory error:", error)
    return { success: false, error: error.message }
  }
}

// Search memories
function searchMemories(userId, query) {
  try {
    if (!query || query.length < 2) {
      return { success: false, error: "Search query must be at least 2 characters" }
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

    return {
      success: true,
      query,
      count: memoriesWithImages.length,
      memories: memoriesWithImages,
    }
  } catch (error) {
    console.error("Search memories error:", error)
    return { success: false, error: error.message }
  }
}

export {
  getUserMemory,
  updateUserMemory,
  uploadMemory,
  getMemories,
  getMemory,
  updateMemory,
  deleteMemory,
  searchMemories,
}
