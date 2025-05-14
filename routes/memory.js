import express from "express"
import { authenticate } from "../middleware/authenticate.js"
import { uploadMemory, getMemories, getMemory, updateMemory, deleteMemory, searchMemories } from "../services/memory.js"

const router = express.Router()

// Upload memory with multiple base64 images
router.post("/", authenticate, async (req, res) => {
  try {
    const { userId } = req.user
    const { title, description, location, date, selectedImages } = req.body

    if (!title || !date) {
      return res.status(400).json({ error: "Title and date are required" })
    }


    console.log('selected images',selectedImages)
    // Process the images - in a real implementation, you'd validate the base64 strings
    const result = uploadMemory({

   userId, title, description, location, date, selectedImages
    })

    if (!result.success) {
      return res.status(500).json({ error: result.error || "Failed to upload memory" })
    }

    res.status(201).json({
      message: "Memory uploaded successfully",
      memoryId: result.memoryId,
      title,
      description,
      location,
      date,
      imageCount: result.imageCount,
    })
  } catch (error) {
    console.error("Memory upload error:", error)
    res.status(500).json({ error: "Failed to upload memory" })
  }
})

// Get all memories
router.get("/", authenticate, async (req, res) => {
  try {
    const { userId } = req.user
    const memories = getMemories(userId)

    res.json({ memories })
  } catch (error) {
    console.error("Get memories error:", error)
    res.status(500).json({ error: "Failed to retrieve memories" })
  }
})

// Get a specific memory
router.get("/:id", authenticate, async (req, res) => {
  try {
    const { userId } = req.user
    const { id } = req.params

    const memory = getMemory(userId, id)

    if (!memory) {
      return res.status(404).json({ error: "Memory not found" })
    }

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

    if (!title || !date) {
      return res.status(400).json({ error: "Title and date are required" })
    }

    const result = updateMemory(userId, id, title, description, location, date, selectedImages, keepExistingImages)

    if (!result.success) {
      return res.status(result.error === "Memory not found" ? 404 : 500).json({
        error: result.error || "Failed to update memory",
      })
    }

    // Get the updated memory
    const updatedMemory = getMemory(userId, id)

    res.json({
      message: "Memory updated successfully",
      memory: updatedMemory,
    })
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

    const result = deleteMemory(userId, id)

    if (!result.success) {
      return res.status(result.error === "Memory not found" ? 404 : 500).json({
        error: result.error || "Failed to delete memory",
      })
    }

    res.json({
      message: "Memory deleted successfully",
    })
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

    const result = searchMemories(userId, query)

    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    res.json({
      query: result.query,
      count: result.count,
      memories: result.memories,
    })
  } catch (error) {
    console.error("Search memories error:", error)
    res.status(500).json({ error: "Failed to search memories" })
  }
})

export default router
