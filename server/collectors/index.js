import * as googleNews from './googleNews.js';
import * as bingNews from './bingNews.js';
import * as twitter from './twitter.js';
import { politeDelay } from '../lib.js';

export const collectors = { google_news: googleNews, bing_news: bingNews, twitter };

/**
 * 多源聚合采集：单源失败自动降级，不影响其他源。
 * 返回 { items, errors: [{source, error}] }
 */
export async function collectAll(keyword, opts = {}) {
  const results = await Promise.allSettled(
    Object.entries(collectors).map(async ([name, c], idx) => {
      if (idx > 0) await politeDelay(300); // 源间错峰
      return [name, await c.collect(keyword, opts)];
    })
  );
  const items = [];
  const errors = [];
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value[1]);
    else errors.push({ source: r.reason?.message || String(r.reason) });
  }
  return { items, errors };
}
