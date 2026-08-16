#!/usr/bin/env node
/**
 * HotSpotter Agent Skill CLI
 * 用法：
 *   node skill/hotspotter/scripts/hotspot.js watch "关键词" [--hours 24]
 *   node skill/hotspotter/scripts/hotspot.js brief
 * 输出 Markdown 报告到 stdout，供 AI 助手或终端使用。
 */
import { parseArgs } from 'node:util';

const verdictLabel = { verified: '✅ 已验证', unverified: '❓ 待印证', suspicious: '⚠️ 存疑' };

// 复用 server 核心（相对本文件解析；config.js 内的 dotenv 会加载 .env）
const { collectAll } = await import('../../../server/collectors/index.js');
const { analyzeItems } = await import('../../../server/ai/analyzer.js');
const { insertRawItem, listUnanalyzedItems, markAnalyzed, upsertEvent, listEvents } =
  await import('../../../server/db.js');

const { positionals, values: opts } = parseArgs({
  allowPositionals: true,
  options: {
    hours: { type: 'string', default: '24' },
  },
});

const command = positionals[0];

if (command === 'watch') {
  const keyword = positionals[1];
  if (!keyword) {
    console.error('用法: hotspot.js watch "关键词" [--hours 24]');
    process.exit(1);
  }
  await watch(keyword, Number(opts.hours) || 24);
} else if (command === 'brief') {
  await brief();
} else {
  console.error('用法:\n  hotspot.js watch "关键词" [--hours 24]\n  hotspot.js brief');
  process.exit(1);
}

async function watch(keyword, hours) {
  const sinceUnix = Math.floor(Date.now() / 1000) - hours * 3600;
  process.stderr.write(`[hotspotter] 采集「${keyword}」最近 ${hours} 小时动态...\n`);

  const { items, errors } = await collectAll(keyword, { limit: 10, sinceUnix });
  let fresh = 0;
  for (const it of items) if (insertRawItem(it)) fresh++;

  process.stderr.write(`[hotspotter] 采集 ${items.length} 条（新 ${fresh}），AI 分析中...\n`);
  const unanalyzed = listUnanalyzedItems(28);
  const { events } = await analyzeItems(unanalyzed);
  const allIds = [...new Set(events.flatMap((e) => e.raw_item_ids))];
  if (allIds.length) markAnalyzed(allIds);
  // 写入共享情报库（Web 端可见）
  for (const ev of events) upsertEvent(ev);

  process.stderr.write(`[hotspotter] 完成，产出 ${events.length} 个事件\n\n`);
  printReport(keyword, hours, events, errors, fresh);
}

async function brief() {
  const events = listEvents({ limit: 20 });
  printBrief(events);
}

/* ═══════ Markdown 输出 ═══════ */

function printReport(keyword, hours, events, errors, fresh) {
  const sorted = [...events].sort((a, b) => b.heat - a.heat);
  console.log(`# 「${keyword}」热点监控报告`);
  console.log(`\n> 时间窗口：最近 ${hours} 小时 · 新采集 ${fresh} 条 · 产出事件 ${events.length} 个`);
  if (errors?.length) {
    console.log(`> ⚠ 部分信息源失败：${errors.map((e) => e.source).join('、')}（其余源正常）`);
  }
  if (!sorted.length) {
    console.log(`\n未发现与「${keyword}」相关的新动态。`);
    return;
  }
  for (const ev of sorted) {
    console.log(`\n## ${verdictLabel[ev.verdict] || ev.verdict} · ${ev.title}`);
    console.log(`置信度 ${ev.confidence}/100 · 热度 ${ev.heat}/100 · 来源 ${ev.source_urls.length} 个`);
    console.log(`\n${ev.summary}`);
    if (ev.reason) console.log(`\n*判定依据：${ev.reason}*`);
    for (const u of ev.source_urls.slice(0, 5)) console.log(`- ${u}`);
  }
  console.log(`\n---\n*真伪说明：✅ 已验证 = ≥2 独立可靠来源交叉印证；❓ 待印证 = 单一来源；⚠️ 存疑 = 营销号/夸大/无信源特征。重要信息请点击来源链接核实。*`);
}

function printBrief(events) {
  if (!events.length) {
    console.log('# 热点简报\n\n情报库为空。先运行 `watch` 采集，或启动 Web 服务 `npm start` 自动扫描。');
    return;
  }
  console.log(`# 热点简报（最近 ${events.length} 条情报）\n`);
  const verified = events.filter((e) => e.verdict === 'verified');
  const others = events.filter((e) => e.verdict !== 'verified');
  if (verified.length) {
    console.log('## ✅ 已验证事件\n');
    for (const ev of verified) console.log(`- **${ev.title}**（置信 ${ev.confidence} · 热度 ${ev.heat}）\n  ${ev.summary}`);
  }
  if (others.length) {
    console.log('\n## 其他情报（未完全验证）\n');
    for (const ev of others.slice(0, 12)) {
      console.log(`- ${verdictLabel[ev.verdict]} **${ev.title}**（置信 ${ev.confidence}）`);
    }
  }
  console.log(`\n---\n*数据来自本地情报库（与 Web 端共享）。运行 \`watch "关键词"\` 可即时采集新动态。*`);
}
