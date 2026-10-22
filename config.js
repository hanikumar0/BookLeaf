require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set in production');

module.exports = {
  port: Number(process.env.PORT) || 3000,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret',
  dbPath: process.env.DB_PATH || './data/bookleaf.db',
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.AI_MODEL || 'claude-haiku-5-5',
    timeoutMs: 15000,
    maxRetries: 1,
  },
};
