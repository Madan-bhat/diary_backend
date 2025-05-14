import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Mood emoji mapping
const moodEmojis = {
  "very_positive": "😄", // Very happy
  "positive": "🙂",      // Happy
  "neutral": "😐",       // Neutral
  "negative": "😔",      // Sad
  "very_negative": "😢", // Very sad
  "anxious": "😰",       // Anxious
  "angry": "😠",         // Angry
  "excited": "🤩",       // Excited
  "grateful": "🙏",      // Grateful
  "tired": "😴",         // Tired
  "confused": "🤔",      // Confused
  "hopeful": "🌟",       // Hopeful
  "proud": "💪",         // Proud
  "loved": "❤️",         // Loved
  "peaceful": "😌"       // Peaceful
};

// Generate AI chat response
async function generateChatResponse(userId, message, aiFriendName, userMemory, motivationalQuote) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const memoryContext = userMemory.length > 0 
      ? `Important things to remember about this user: ${userMemory.join('. ')}.` 
      : '';
    
    const quoteContext = motivationalQuote 
      ? `Consider using this quote if appropriate: "${motivationalQuote}"` 
      : '';
    
    const prompt = `
      You are ${aiFriendName}, a supportive and empathetic friend who helps the user with their daily journaling.
      ${memoryContext}
      
      IMPORTANT INSTRUCTIONS:
      1. Respond in a casual, friendly, and supportive way.
      2. Keep your response VERY concise (under 50 words).
      3. Be direct and clear. Avoid unnecessary elaboration.
      4. ALWAYS follow the user's lead on conversation topics.
      5. If the user changes the topic, immediately adapt and respond to the new topic.
      6. Do NOT try to steer the conversation back to previous topics unless the user brings them up.
      7. Treat each message as potentially a new topic or direction.
      
      ${quoteContext}
      
      User's message: "${message}"
    `;
    
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error('AI chat response error:', error);
    throw new Error('Failed to generate AI response');
  }
}

// Detect mood from text
async function detectMood(text) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `
      Analyze the following diary entry and determine the overall mood.
      Return ONLY one of these values:
      "very_positive", "positive", "neutral", "negative", "very_negative", 
      "anxious", "angry", "excited", "grateful", "tired", 
      "confused", "hopeful", "proud", "loved", "peaceful"
      
      Choose the mood that best represents the emotional state in the text.
      
      Diary entry: "${text}"
      
      Mood:
    `;
    
    const result = await model.generateContent(prompt);
    const response = result.response.text().trim().toLowerCase();
    
    // Check if the response is one of our defined moods
    if (Object.keys(moodEmojis).includes(response)) {
      return {
        mood: response,
        emoji: moodEmojis[response]
      };
    }
    
    // Default fallback
    return {
      mood: "neutral",
      emoji: "😐"
    };
  } catch (error) {
    console.error('Mood detection error:', error);
    // Default fallback on error
    return {
      mood: "neutral",
      emoji: "😐"
    };
  }
}

// Generate a title for a diary entry
async function generateTitle(text) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `
      Generate a short, engaging title (5-7 words) for this diary entry.
      The title should capture the main theme or emotion of the entry.
      
      Diary entry: "${text.substring(0, 500)}..."
      
      Title:
    `;
    
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('Title generation error:', error);
    // Default fallback on error
    return "My Diary Entry";
  }
}

// Generate diary entry from user messages
async function generateDiaryEntry(userMessages) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `
      Write an authentic personal diary entry based on these thoughts and experiences:
      ${userMessages.join('\n')}
      
      IMPORTANT GUIDELINES:
      1. Write in first person as if the person wrote it themselves.
      2. Focus ONLY on the actual experiences, thoughts, and feelings expressed.
      3. DO NOT mention any AI, chatbot, or conversation with an assistant.
      4. DO NOT exaggerate or embellish beyond what's actually expressed.
      5. Make it sound like a natural diary entry a person would write.
      6. Keep it between 200-300 words and make it feel personal and reflective.
      7. Only include topics and feelings that were actually mentioned.
      8. Maintain a consistent tone throughout the entry.
      
      Diary entry:
    `;
    
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error('Diary generation error:', error);
    throw new Error('Failed to generate diary entry');
  }
}

export { 
  generateChatResponse, 
  detectMood, 
  generateTitle, 
  generateDiaryEntry, 
  moodEmojis 
};