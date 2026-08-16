import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { api } from './routes/api.js';
import { startScheduler } from './scheduler.js';
import { collectors } from './collectors/index.js';
import { runScan } from './pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use('/api', api);
app.use(express.static(path.join(__dirname, '..', 'public')));

// 启动即扫一轮（异步，不阻塞服务）
runScan({ notify: false }).catch((e) => console.error('[boot-scan]', e.message));

startScheduler();

app.listen(config.port, () => {
  console.log(`\n  ⦿ HotSpotter 热点雷达站已启动`);
  console.log(`  ➜ http://localhost:${config.port}`);
  console.log(`  ➜ AI 模型: ${config.openrouter.model}`);
  console.log(`  ➜ 信息源: ${Object.keys(collectors).join(' / ')}\n`);
});
