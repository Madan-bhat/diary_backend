import { db } from '../services/storage.js';

export const quoteMiddleware = (req, res, next) => {
  try {
    // Get a random quote from the database
    const quote = db.prepare('SELECT quote, author FROM quotes ORDER BY RANDOM() LIMIT 1').get();
    
    if (quote) {
      req.motivation = `${quote.quote} - ${quote.author}`;
    } else {
      req.motivation = 'Every day is a new beginning.';
    }
    
    next();
  } catch (error) {
    console.error('Quote middleware error:', error);
    req.motivation = 'Every day is a new beginning.';
    next();
  }
};