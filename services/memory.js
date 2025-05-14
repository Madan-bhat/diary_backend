import { db } from './storage.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Get user memory
async function getUserMemory(userId) {
  try {
    const memories = db.prepare('SELECT fact FROM memory WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').all(userId);
    return memories.map(m => m.fact);
  } catch (error) {
    console.error('Get user memory error:', error);
    return [];
  }
}

// Extract potential memory from conversation
async function extractMemory(userMessage, aiResponse) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `
      Based on this conversation, extract ONE important fact about the user that would be useful to remember for future conversations.
      If there's nothing important to remember, respond with "NONE".
      
      User: "${userMessage}"
      AI: "${aiResponse}"
      
      Extract ONE important fact (or "NONE"):
    `;
    
    const result = await model.generateContent(prompt);
    const memory = result.response.text().trim();
    
    if (memory === 'NONE' || memory.toLowerCase().includes('none')) {
      return null;
    }
    
    return memory;
  } catch (error) {
    console.error('Memory extraction error:', error);
    return null;
  }
}

// Update user memory
async function updateUserMemory(userId, userMessage, aiResponse) {
  try {
    const memory = await extractMemory(userMessage, aiResponse);
    
    if (memory) {
      // Check if this memory already exists (avoid duplicates)
      const existingMemory = db.prepare('SELECT id FROM memory WHERE user_id = ? AND fact = ?').get(userId, memory);
      
      if (!existingMemory) {
        // Insert new memory
        db.prepare('INSERT INTO memory (user_id, fact) VALUES (?, ?)').run(userId, memory);
        console.log(`Added new memory for user ${userId}: ${memory}`);
      }
    }
    
    return memory;
  } catch (error) {
    console.error('Update user memory error:', error);
    return null;
  }
}

export { getUserMemory, updateUserMemory };