import { logger } from "../utils/logger.js"

export function errorHandler(err, req, res, next) {
  logger.error(err)

  // Check for specific error types
  if (err.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
    return res.status(400).json({
      error: "Database constraint error",
      message: "A database constraint was violated. This might be due to referencing a non-existent record.",
    })
  }

  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation error",
      message: err.message,
    })
  }

  // Default error response
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : "Something went wrong",
  })
}
