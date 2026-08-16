---
name: hotspotter
description: 热点监控技能。当用户想监控某个关键词的新闻动态（如"帮我盯着 GPT-5 的消息"）、询问某话题最近有什么热点（如"AI大模型最近有什么更新"）、或想要一份今日热点简报时使用。多源采集（Google News / Bing News / X），AI 判断真伪与热度，输出中文报告。
---

# HotSpotter 热点监控

多源采集 + AI 判真的热点发现工具。独立于 Web 服务运行，直接输出 Markdown 报告。

## 何时使用

- 用户想**持续/即时监控**某关键词的动态 → `watch`
- 用户想了解某话题**最近的热点**（一次性查询） → `watch`（该关键词）
- 用户想要**今日/近期简报** → `brief`

## 用法

在项目根目录（`D:\ZCode\HotSpotter`）执行：

```bash
# 监控关键词（最近 24 小时，可调）
node skill/hotspotter/scripts/hotspot.js watch "GPT-5" --hours 24

# 近期热点简报（读取已积累的情报库，秒出）
node skill/hotspotter/scripts/hotspot.js brief
```

输出为 Markdown：每个事件含中文标题、摘要、真伪判定（已验证/待印证/存疑）、置信度、热度、来源链接。真伪判定基于多源交叉验证——**重要信息请优先采信「已验证」且置信度 ≥70 的事件，并点击来源链接核实**。

## 环境要求

- Node.js ≥ 20，项目已 `npm install`
- `.env` 需配置 `OPENROUTER_API_KEY`（AI 判断）、`TWITTER_API_KEY`（X 源）
- 国内网络建议配置 `PROXY_URL`（Google 源需要；未配置时 Google 源自动降级，不影响其他源）

## 注意

- `watch` 会真实请求外部信息源（耗时约 30-90 秒）并消耗 OpenRouter/twitterapi.io 免费额度，同一关键词短时间内不要重复调用
- `brief` 只读本地数据库，无网络请求，可随意调用
- 采集结果会写入本地 `hotspotter.db`，与 Web 端（`npm start`）共享情报库
