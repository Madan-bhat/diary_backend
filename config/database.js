import path from "path"
import { fileURLToPath } from "url"
import fs from "fs"

// Get directory name (ESM equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Database path
const dbPath = path.join(__dirname, "..", "data", "data.db")

// Ensure data directory exists
const dataDir = path.join(__dirname, "..", "data")
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "..", "uploads")
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

export { dbPath, uploadsDir }
