import { fetchWithTimeout, randomUA, decodeEntities, stripHtml, makeItem } from '../lib.js';

const CD = (s) => String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

function pick(re, xml) {
  const m = xml.match(re);
  return m ? decodeEntities(CD(m[1])).trim() : '';
}

/** Bing News 链接是 apiclick 跳转，解出真实文章 URL（用于跨源交叉验证） */
function unwrapLink(link = '') {
  const m = link.match(/[?&]url=([^&]+)/i);
  if (m) {
    try {
      const real = decodeURIComponent(m[1]);
      if (/^https?:\/\//.test(real)) return real;
    } catch { /* fallthrough */ }
  }
  return link;
}

/** Bing News RSS 搜索（免 key，format=RSS 为官方输出）。返回标准条目数组 */
export async function collect(keyword, { limit = 15 } = {}) {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(keyword)}&format=RSS`;
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': randomUA(), Accept: 'application/rss+xml, application/xml, text/xml' },
  });
  if (!res.ok) throw new Error(`bingNews HTTP ${res.status}`);
  const xml = await res.text();

  const items = [];
  const blocks = xml.split(/<item>/i).slice(1);
  for (const raw of blocks.slice(0, limit)) {
    const block = raw.split(/<\/item>/i)[0];
    const title = pick(/<title>([\s\S]*?)<\/title>/i, block);
    const link = unwrapLink(pick(/<link>([\s\S]*?)<\/link>/i, block));
    const desc = stripHtml(pick(/<description>([\s\S]*?)<\/description>/i, block));
    const source = pick(/<News:Source>([\s\S]*?)<\/News:Source>/i, block);
    const pubDate = pick(/<pubDate>([\s\S]*?)<\/pubDate>/i, block);
    if (!title || !link) continue;
    items.push(
      makeItem({
        source: 'bing_news',
        keyword,
        url: link,
        title,
        content: desc,
        author: source,
        published_at: pubDate ? new Date(pubDate).toISOString() : null,
        metrics: {},
      })
    );
  }
  return items;
}
