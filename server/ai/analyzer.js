import { chatJson } from './openrouter.js';

const SYSTEM_PROMPT = `你是「热点雷达站」的情报分析师。用户给出若干条来自不同渠道的原始信息（新闻RSS、网页搜索、X/Twitter），以及正在监控的关键词。你的任务：

1. 相关性过滤：只保留与监控关键词高度相关的实质性信息（如模型/产品发布与更新、重大研究、重要人物/公司动态、行业大事）。丢弃广告、卖号、代充、刷屏、色情、赌博、与关键词无关的内容。
2. 事件聚类：把报道同一事件的条目归为一组（跨语言算同一事件：中文/日文/英文报道同件事要合并）。
3. 真伪判定（verdict）：
   - verified：≥2 个相互独立的可靠来源（正规媒体、官方网站、认证账号）报道且内容一致
   - unverified：单一来源，或来源可靠性一般、尚无第二来源交叉印证
   - suspicious：营销号/标题党特征、夸张声称、卖号广告、无信源、明显不实
4. 评分：confidence（对"这是真实且相关信息"的置信度，0-100）；heat（热度/重要性，结合事件影响力、时效性、讨论度，0-100）。
5. 用简体中文输出每个事件的标题（简洁有信息量）与摘要（2-3句，客观陈述已知事实与来源情况）。

只输出 JSON，schema：
{"events":[{"item_ids":[编号...],"title":"中文标题","summary":"中文摘要","verdict":"verified|unverified|suspicious","confidence":0-100,"heat":0-100,"reason":"判断理由（一句话中文）"}],"discarded_ids":[编号...]}`;

function buildUserPrompt(items) {
  const lines = items.map((it) => {
    const m = JSON.parse(it.metrics || '{}');
    const eng = [
      m.views ? `浏览${m.views}` : '',
      m.likes ? `赞${m.likes}` : '',
      m.retweets ? `转${m.retweets}` : '',
      m.followers ? `粉丝${m.followers}` : '',
      m.verified ? '认证✓' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return [
      `#编号 ${it.id}`,
      `来源: ${it.source} | 监控词: ${it.keyword} | 作者: ${it.author || '-'} | 时间: ${it.published_at || '未知'}${eng ? ' | 互动: ' + eng : ''}`,
      `标题: ${it.title}`,
      it.content && it.content !== it.title ? `内容: ${it.content.slice(0, 500)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  });
  return `监控关键词下的原始条目如下：\n\n${lines.join('\n\n')}\n\n请按系统指令分析并输出 JSON。`;
}

/** Twitter 互动数据换算 0-100 参与度分（供热度融合） */
function engagementScore(items) {
  let best = 0;
  for (const it of items) {
    try {
      const m = JSON.parse(it.metrics || '{}');
      const s =
        Math.log10(1 + (m.views || 0)) * 12 +
        Math.log10(1 + (m.likes || 0)) * 15 +
        Math.log10(1 + (m.retweets || 0)) * 10;
      best = Math.max(best, s);
    } catch { /* ignore */ }
  }
  return Math.min(100, Math.round(best));
}

// 每批分析的条目数：批次越大请求数越少（OpenRouter 免费档有每日请求上限）
const BATCH_SIZE = 28;

/**
 * 批量分析 raw_items → 事件数组（内部自动分批，防止输出截断）。
 * 输入条目须带 id（数据库主键）。返回 { events, discardedIds }，events 元素与 db.upsertEvent 兼容。
 */
export async function analyzeItems(items) {
  if (!items.length) return { events: [], discardedIds: [] };

  const allEvents = [];
  const allDiscarded = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const out = await chatJson(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(batch) },
      ],
      { maxTokens: 12000 }
    );
    const { events, discardedIds } = normalize(out, batch);
    allEvents.push(...events);
    allDiscarded.push(...discardedIds);
  }
  return { events: allEvents, discardedIds: allDiscarded };
}

function normalize(out, items) {

  const byId = new Map(items.map((it) => [it.id, it]));
  const validVerdicts = new Set(['verified', 'unverified', 'suspicious']);
  const events = [];

  for (const ev of out.events || []) {
    const ids = (ev.item_ids || []).filter((id) => byId.has(id));
    if (!ids.length) continue;
    const evItems = ids.map((id) => byId.get(id));
    const urls = [...new Set(evItems.map((i) => i.url).filter(Boolean))].slice(0, 12);
    const kws = [...new Set(evItems.map((i) => i.keyword))];
    const aiHeat = clamp01(Number(ev.heat) || 50);
    const eng = engagementScore(evItems);
    const heat = Math.round(aiHeat * 0.75 + eng * 0.25);
    events.push({
      title: String(ev.title || evItems[0].title).slice(0, 200),
      summary: String(ev.summary || '').slice(0, 800),
      confidence: clamp01(Number(ev.confidence) || 50),
      heat,
      verdict: validVerdicts.has(ev.verdict) ? ev.verdict : 'unverified',
      reason: String(ev.reason || ''),
      source_urls: urls,
      matched_keywords: kws,
      raw_item_ids: ids,
    });
  }

  const discardedIds = (out.discarded_ids || []).filter((id) => byId.has(id));
  // 未被任何事件引用且未显式丢弃的条目，视为噪音一并标记已分析
  const usedIds = new Set(events.flatMap((e) => e.raw_item_ids));
  for (const id of discardedIds) usedIds.add(id);
  const orphans = items.filter((it) => !usedIds.has(it.id)).map((it) => it.id);

  return { events, discardedIds: [...discardedIds, ...orphans] };
}

const clamp01 = (n) => Math.max(0, Math.min(100, Math.round(n)));
