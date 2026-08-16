import crypto from 'node:crypto';
import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { config } from './config.js';

// 本地代理（如 Clash 的 http://127.0.0.1:7897），留空则直连
// 代理离线时自动回退直连（OpenRouter/Bing 直连可用，Google 源会降级）
let proxyAgent = null;
let proxyAddr = '';
if (config.proxyUrl) {
  proxyAgent = new ProxyAgent(config.proxyUrl);
  try {
    proxyAddr = new URL(config.proxyUrl).host;
  } catch { /* bad url, treated as absent */ }
}

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
];

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export const randomUA = () => UAS[Math.floor(Math.random() * UAS.length)];

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 随机停顿，避免请求过密触发反爬 */
export async function politeDelay(baseMs = 800) {
  await sleep(baseMs + Math.floor(Math.random() * baseMs));
}

function isProxyDown(e) {
  if (!proxyAgent || !proxyAddr) return false;
  const msg = String(e?.cause?.message || e?.message || '');
  return msg.includes(proxyAddr) || /ECONNREFUSED.*127\.0\.0\.1/i.test(msg);
}

export async function fetchWithTimeout(url, opts = {}, timeoutMs = 15000) {
  const doFetch = async (dispatcher) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await undiciFetch(url, { ...opts, signal: ctrl.signal, dispatcher });
    } finally {
      clearTimeout(t);
    }
  };
  try {
    return await doFetch(proxyAgent);
  } catch (e) {
    if (isProxyDown(e)) {
      console.warn(`[net] 代理 ${proxyAddr} 不可达，回退直连: ${String(url).slice(0, 80)}`);
      return await doFetch(undefined);
    }
    throw e;
  }
}

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&apos;': "'", '&nbsp;': ' ', '&#x27;': "'", '&#x2F;': '/',
};
export function decodeEntities(s = '') {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&[a-zA-Z#0-9x]*;/g, (m) => ENTITIES[m] ?? m);
}

export function stripHtml(s = '') {
  return decodeEntities(
    String(s).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

/** 基础条目构造（保证统一形状 + hash 去重键） */
export function makeItem({ source, keyword, url, title, content = '', author = '', published_at = null, metrics = {} }) {
  const u = (url || '').trim();
  const t = String(title || '').trim();
  return {
    source, keyword,
    url: u,
    title: t.slice(0, 300),
    content: String(content || '').slice(0, 2000),
    author: String(author || '').slice(0, 120),
    published_at: published_at || null,
    metrics: JSON.stringify(metrics || {}),
    hash: sha256(`${source}:${u || t}`),
  };
}
