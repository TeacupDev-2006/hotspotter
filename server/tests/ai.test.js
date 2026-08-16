/** AI 分析真实联调：node server/tests/ai.test.js [关键词] */
import { collectAll } from '../collectors/index.js';
import { insertRawItem, listUnanalyzedItems, markAnalyzed } from '../db.js';
import { analyzeItems } from '../ai/analyzer.js';

const keyword = process.argv[2] || 'GPT-5';

console.log(`▶ 采集并入库: ${keyword}`);
const { items, errors } = await collectAll(keyword, { limit: 6 });
let fresh = 0;
for (const it of items) if (insertRawItem(it)) fresh++;
console.log(`  采集 ${items.length} 条，新入库 ${fresh} 条${errors.length ? '，失败源: ' + errors.map(e => e.source).join('; ') : ''}`);

console.log(`▶ AI 分析（OpenRouter）...`);
const unanalyzed = listUnanalyzedItems(24);
const { events, discardedIds } = await analyzeItems(unanalyzed);
markAnalyzed([...events.flatMap((e) => e.raw_item_ids), ...discardedIds]);

console.log(`  丢弃噪音 ${discardedIds.length} 条，产出事件 ${events.length} 个：\n`);
for (const ev of events) {
  console.log(`  ◉ ${ev.title}`);
  console.log(`    verdict=${ev.verdict}  confidence=${ev.confidence}  heat=${ev.heat}`);
  console.log(`    ${ev.summary}`);
  console.log(`    来源 ${ev.source_urls.length} 个 | 依据条目 ${ev.raw_item_ids.length} 条 | 理由: ${ev.reason}\n`);
}
