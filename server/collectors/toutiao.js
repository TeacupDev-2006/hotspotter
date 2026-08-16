import { fetchWithTimeout, randomUA, decodeEntities, stripHtml, makeItem } from '../lib.js';

/** JSON 字符串安全反转义（\uXXXX、\" 等） */
function unesc(s) {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return decodeEntities(s);
  }
}

/** 头条 jump 链接双层解码出真实文章 URL */
function unwrapJump(u = '') {
  let cur = u;
  for (let i = 0; i < 3; i++) {
    const m = cur.match(/[?&]url=([^&"\\]+)/);
    if (!m) break;
    try {
      cur = decodeURIComponent(m[1]);
    } catch {
      break;
    }
  }
  return /^https?:\/\//.test(cur) ? cur : '';
}

/**
 * 今日头条搜索（国内直连可用；HTML 内嵌 JSON 数据）。
 * 作为 Bing News 在国内服务器被重定向禁用时的中文新闻源。
 */
export async function collect(keyword, { limit = 12 } = {}) {
  const url = `https://so.toutiao.com/search?keyword=${encodeURIComponent(keyword)}&dvpf=pc`;
  const res = await fetchWithTimeout(
    url,
    { headers: { 'User-Agent': randomUA(), Accept: 'text/html', 'Accept-Language': 'zh-CN,zh;q=0.9' } },
    20000
  );
  if (!res.ok) throw new Error(`toutiao HTTP ${res.status}`);
  const html = await res.text();

  const items = [];
  const seen = new Set();
  const normKey = (t) => t.replace(/[\s:：,，.。!！?？'"'"]/g, '');
  const titleRe = /"title":"((?:[^"\\]|\\.){8,200})"/g;
  let m;
  while ((m = titleRe.exec(html)) && items.length < limit) {
    const title = stripHtml(unesc(m[1])).replace(/\s+/g, ' ').trim();
    if (!title) continue;
    const key = normKey(title);
    if (seen.has(key)) continue;

    // 在 title 之后、下一个 title 之前的窗口里找配套字段
    const windowEnd = Math.min(html.length, titleRe.lastIndex + 4000);
    const seg = html.slice(m.index, windowEnd);

    const sumM = seg.match(/"summary":"((?:[^"\\]|\\.)*)"/);
    const srcM = seg.match(/"source":"((?:[^"\\]|\\.)*)"/);
    const jumpM = seg.match(/https:\/\/sou\.toutiao\.com\/search\/jump\?url=[^"'\\ ]+/);
    const artM = seg.match(/(?:www\.toutiao\.com|m\.toutiao\.com)\/(a\d{10,})/);

    let link = jumpM ? unwrapJump(jumpM[0]) : '';
    if (!link && artM) link = `https://www.toutiao.com/${artM[1]}/`;
    if (!link) continue; // 没有可点击链接的条目（广告/推荐位）跳过

    seen.add(key);
    items.push(
      makeItem({
        source: 'toutiao',
        keyword,
        url: link,
        title,
        content: sumM ? stripHtml(unesc(sumM[1])).slice(0, 800) : '',
        author: srcM ? stripHtml(unesc(srcM[1])) : '',
        published_at: null,
        metrics: {},
      })
    );
  }
  return items;
}
