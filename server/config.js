import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3210', 10),
  dbFile: process.env.DB_FILE || 'hotspotter.db',
  // 访问 Google/DuckDuckGo 等境外源通常需要本地代理，留空则直连
  proxyUrl: process.env.PROXY_URL || '',

  openrouter: {
    key: process.env.OPENROUTER_API_KEY || '',
    model: process.env.AI_MODEL || 'z-ai/glm-4.6',
    baseUrl: 'https://openrouter.ai/api/v1',
  },

  twitter: {
    key: process.env.TWITTER_API_KEY || '',
    baseUrl: 'https://api.twitterapi.io',
  },

  smtp: {
    host: process.env.SMTP_HOST || 'smtp.qq.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    to: process.env.MAIL_TO || '',
  },

  scanIntervalMinutes: parseInt(process.env.SCAN_INTERVAL_MINUTES || '30', 10),
  topics: (process.env.TOPICS || 'AI大模型')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
