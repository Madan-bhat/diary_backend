// Validation utility functions

export function validateUsername(username) {
  if (!username || typeof username !== "string") {
    return "Username is required"
  }

  if (username.length < 3 || username.length > 30) {
    return "Username must be between 3 and 30 characters"
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return "Username can only contain letters, numbers, and underscores"
  }

  return null
}

export function validatePassword(password) {
  if (!password || typeof password !== "string") {
    return "Password is required"
  }

  if (password.length < 6) {
    return "Password must be at least 6 characters"
  }

  return null
}

export function validateRequiredString(value, fieldName) {
  if (!value || typeof value !== "string" || value.trim() === "") {
    return `${fieldName} is required`
  }

  return null
}

export function validateDate(date) {
  if (!date) {
    return "Date is required"
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(date)) {
    return "Invalid date format. Use YYYY-MM-DD"
  }

  return null
}
