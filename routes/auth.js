import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../services/storage.js';
import { authenticate } from '../middleware/authenticate.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Register a new user
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }
    
    // Check if username already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert user
    const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashedPassword);
    const userId = result.lastInsertRowid;
    
    // Create default user settings
    db.prepare('INSERT INTO user_settings (user_id, ai_friend_name) VALUES (?, ?)').run(userId, 'AI Friend');
    
    // Generate JWT
    const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    
    res.status(201).json({
      message: 'User registered successfully',
      userId,
      username,
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Find user
    const user = db.prepare('SELECT id, username, password FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    // Generate JWT
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    
    res.json({
      message: 'Login successful',
      userId: user.id,
      username: user.username,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Get user profile
router.get('/profile', authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    
    // Get user data
    const user = db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user settings
    const settings = db.prepare('SELECT ai_friend_name FROM user_settings WHERE user_id = ?').get(userId);
    
    res.json({
      user: {
        id: user.id,
        username: user.username,
        created_at: user.created_at
      },
      settings: {
        aiFriendName: settings?.ai_friend_name || 'AI Friend'
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// Update AI friend name
router.put('/settings', authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const { aiFriendName } = req.body;
    
    if (!aiFriendName) {
      return res.status(400).json({ error: 'AI friend name is required' });
    }
    
    // Update settings
    db.prepare('UPDATE user_settings SET ai_friend_name = ? WHERE user_id = ?').run(aiFriendName, userId);
    
    res.json({
      message: 'Settings updated successfully',
      settings: {
        aiFriendName
      }
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Update username
router.put('/username', authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const { username } = req.body;
    
    // Validate input
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    
    // Check if username already exists (excluding current user)
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, userId);
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    
    // Update username
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, userId);
    
    // Generate new JWT with updated username
    const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    
    res.json({
      message: 'Username updated successfully',
      userId,
      username,
      token
    });
  } catch (error) {
    console.error('Update username error:', error);
    res.status(500).json({ error: 'Failed to update username' });
  }
});

// Change password
router.put('/password', authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const { currentPassword, newPassword } = req.body;
    
    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long' });
    }
    
    // Get current user
    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, userId);
    
    res.json({
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

export default router;