import dotenv from "dotenv"

dotenv.config()

// JWT configuration
export const jwtConfig = {
  secret: process.env.JWT_SECRET || "your-secret-key-for-development-only",
  expiresIn: "7d",
}
