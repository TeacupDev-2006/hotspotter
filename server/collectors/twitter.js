import { config } from '../config.js';
import { fetchWithTimeout, makeItem } from '../lib.js';

// twitterapi.io 免费层限速：1 请求 / 5 秒，模块级节流
let lastRequest = 0;
async function throttle() {
  const wait = 6000 - (Date.now() - lastRequest);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
}

/**
 * twitterapi.io 高级搜索（需 key，支持增量）。
 * docs: GET /twitter/tweet/advanced_search?query=...&queryType=Latest
 * 认证：X-API-Key 头；时间范围用 since_time:<unix>
 */
export async function collect(keyword, { limit = 20, sinceUnix = null } = {}) {
  if (!config.twitter.key) throw new Error('twitter: missing TWITTER_API_KEY');
  await throttle();
  // 引号短语精确匹配 + 排除纯转发，避免 Latest 流里出现弱相关内容
  const q = `"${keyword.replace(/"/g, '')}"`;
  const parts = [q, '-filter:replies'];
  if (sinceUnix) parts.push(`since_time:${sinceUnix}`);
  const query = parts.join(' ');
  const url = `${config.twitter.baseUrl}/twitter/tweet/advanced_search?query=${encodeURIComponent(query)}&queryType=Latest&cursor=`;

  const res = await fetchWithTimeout(
    url,
    { headers: { 'X-API-Key': config.twitter.key, Accept: 'application/json' } },
    20000
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`twitter HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const tweets = data.tweets || [];

  const items = [];
  for (const t of tweets.slice(0, limit)) {
    if (!t.text) continue;
    const author = t.author || {};
    items.push(
      makeItem({
        source: 'twitter',
        keyword,
        url: t.url || `https://x.com/i/web/status/${t.id}`,
        title: t.text.replace(/\s+/g, ' ').slice(0, 200),
        content: t.text,
        author: `@${author.userName || 'unknown'}${author.isBlueVerified ? ' ✓' : ''}`,
        published_at: t.createdAt || null,
        metrics: {
          likes: t.likeCount || 0,
          retweets: t.retweetCount || 0,
          views: t.viewCount || 0,
          replies: t.replyCount || 0,
          followers: author.followers || 0,
          verified: !!author.isBlueVerified,
        },
      })
    );
  }
  return items;
}
