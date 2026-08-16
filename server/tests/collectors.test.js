/** 采集器真实单测：node server/tests/collectors.test.js [关键词] */
import { collectAll } from '../collectors/index.js';

const keyword = process.argv[2] || 'GPT-5';

console.log(`▶ 采集关键词: ${keyword}\n`);
const { items, errors } = await collectAll(keyword, { limit: 8 });

const bySource = {};
for (const it of items) (bySource[it.source] ||= []).push(it);
for (const [src, list] of Object.entries(bySource)) {
  console.log(`━━ ${src} (${list.length} 条)`);
  for (const it of list.slice(0, 3)) {
    console.log(`   · ${it.title.slice(0, 70)}`);
    console.log(`     ${it.url.slice(0, 90)}`);
  }
}
if (errors.length) console.log('\n⚠ 失败源:', errors);
console.log(`\n合计 ${items.length} 条，去重前 hash 唯一数 ${new Set(items.map((i) => i.hash)).size}`);
