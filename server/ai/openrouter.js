import { config } from '../config.js';
import { fetchWithTimeout } from '../lib.js';

/** OpenRouter Chat Completions 封装：JSON 输出 + 解析容错 + 重试 */
export async function chatJson(messages, { temperature = 0.2, maxTokens = 8000, retries = 2 } = {}) {
  if (!config.openrouter.key) throw new Error('openrouter: missing OPENROUTER_API_KEY');

  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchWithTimeout(
        `${config.openrouter.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.openrouter.key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/hotspotter/local',
            'X-Title': 'HotSpotter',
          },
          body: JSON.stringify({
            model: config.openrouter.model,
            messages,
            temperature,
            max_tokens: maxTokens,
            response_format: { type: 'json_object' },
          }),
        },
        120000
      );
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`openrouter HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';
      return parseJsonLoose(content);
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

/** 容错解析：剥离 markdown 围栏、截取最外层花括号、必要时修复截断 */
function parseJsonLoose(text) {
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch { /* 继续 */ }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch { /* 继续 */ }
  }
  const repaired = repairTruncated(t.slice(start >= 0 ? start : 0));
  if (repaired) return repaired;
  throw new Error('openrouter: 无法解析 JSON 输出');
}

/** 截断 JSON 兜底：截到最后一个字符串外的逗号，再按括号栈闭合 */
function repairTruncated(t) {
  const stack = [];
  let inStr = false, esc = false, lastComma = -1;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
    else if (ch === ',') lastComma = i;
  }
  if (inStr || !stack.length) return null;
  let s = lastComma > 0 ? t.slice(0, lastComma) : t;
  s = s.replace(/[,\s]+$/, '').replace(/"[^"]*"\s*:?\s*$/, '');
  for (let i = stack.length - 1; i >= 0; i--) s += stack[i] === '{' ? '}' : ']';
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
