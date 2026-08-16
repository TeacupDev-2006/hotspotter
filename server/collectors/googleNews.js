import { fetchWithTimeout, randomUA, decodeEntities, stripHtml, makeItem } from '../lib.js';

const CD = (s) => String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

function pick(re, xml) {
  const m = xml.match(re);
  return m ? decodeEntities(CD(m[1])).trim() : '';
}

/** Google News RSS 搜索（免 key）。返回标准条目数组 */
export async function collect(keyword, { limit = 15 } = {}) {
  const q = encodeURIComponent(keyword);
  const url = `https://news.google.com/rss/search?q=${q}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': randomUA(), Accept: 'application/rss+xml, application/xml, text/xml' },
  });
  if (!res.ok) throw new Error(`googleNews HTTP ${res.status}`);
  const xml = await res.text();

  const items = [];
  const blocks = xml.split(/<item>/i).slice(1);
  for (const raw of blocks.slice(0, limit)) {
    const block = raw.split(/<\/item>/i)[0];
    let title = pick(/<title>([\s\S]*?)<\/title>/i, block);
    // Google News 标题带 " - 媒体名" 后缀
    const src = pick(/<source[^>]*>([\s\S]*?)<\/source>/i, block);
    if (src && title.endsWith(` - ${src}`)) title = title.slice(0, -` - ${src}`.length);
    const link = pick(/<link>([\s\S]*?)<\/link>/i, block);
    const pubDate = pick(/<pubDate>([\s\S]*?)<\/pubDate>/i, block);
    const desc = stripHtml(pick(/<description>([\s\S]*?)<\/description>/i, block));
    if (!title || !link) continue;
    items.push(
      makeItem({
        source: 'google_news',
        keyword,
        url: link,
        title,
        content: desc,
        author: src,
        published_at: pubDate ? new Date(pubDate).toISOString() : null,
        metrics: {},
      })
    );
  }
  return items;
}
