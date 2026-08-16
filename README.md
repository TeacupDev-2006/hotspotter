# HotSpotter 热点雷达站

> 🎓 **大学生的个人 AI 项目** · 作者：[小小红茶杯](https://github.com/TeacupDev-2006)（产品设计与验收）× [ZCode / GLM](https://z.ai)（AI 结对编程实现）
>
> 💡 项目灵感与产品形态参考了 [鱼皮的「AI 热点监控平台」项目](https://www.codefather.cn/course/2026625439052627970)（编程导航 AI 编程实战课），代码实现为本项目独立完成。

个人热点监控系统：多源采集 · AI 判真 · 实时推送。

面向不想手动刷新闻的你——添加几个监控关键词，雷达站自动扫描 Google News、Bing News 与 X（Twitter），由 AI 过滤噪音、聚类事件、评估真伪与热度，新情报实时推送到网页与邮箱。

## 功能

- **关键词监控**：添加任意关键词，相关新闻/推文出现即捕获，AI 判断相关性后推送
- **定时热点搜集**：默认每 30 分钟自动扫描一轮（可配），兴趣话题（`TOPICS`）持续追踪
- **AI 判真**（OpenRouter）：跨语言聚类同一事件；真伪三档判定（已验证 / 待印证 / 存疑，基于多源交叉验证）；置信度与热度评分；中文摘要
- **通知渠道**：站内通知中心 + SSE 实时推送 + 浏览器系统通知 + QQ 邮箱摘要（高置信事件即时告警 + 每日 08:00/20:00 简报）
- **Agent Skill**：内置 `skill/hotspotter` 技能，让 Claude/ZCode 等 AI 助手直接帮你监控热点（见下文）

## 快速开始

```bash
npm install
npm start          # http://localhost:3210
```

首次启动会自动扫描一轮。开发模式：`npm run dev`（文件变动自动重启）。

## 配置（.env）

复制 `.env.example` 为 `.env` 并填写：

| 变量 | 说明 |
|---|---|
| `OPENROUTER_API_KEY` | [OpenRouter](https://openrouter.ai/keys) 的 key，AI 判断必需 |
| `AI_MODEL` | 模型名，默认 `nvidia/nemotron-3-super-120b-a12b:free`（免费档）；充值后可换 `z-ai/glm-4.6` 等 |
| `TWITTER_API_KEY` | [twitterapi.io](https://twitterapi.io) 的 key（X 数据源） |
| `PROXY_URL` | 本地代理，如 Clash 的 `http://127.0.0.1:7897`；访问 Google News 需要；代理离线自动回退直连 |
| `SCAN_INTERVAL_MINUTES` | 自动扫描间隔（分钟），默认 30 |
| `TOPICS` | 兴趣话题，逗号分隔，如 `AI大模型,人工智能` |

### 邮件配置（QQ 邮箱）

1. 登录 QQ 邮箱网页版 → 设置 → 账户 → 开启「POP3/IMAP/SMTP 服务」
2. 按提示获取**授权码**（16位字母，不是QQ密码）
3. 填入 `.env`：

```env
SMTP_USER=你的QQ号@qq.com
SMTP_PASS=授权码
MAIL_TO=接收通知的邮箱
```

未配置时邮件自动跳过，不影响其他功能。

## 信息源与频率控制

| 源 | 方式 | 说明 |
|---|---|---|
| Google News | RSS | 免 key；需代理（国内直连不通） |
| Bing News | RSS | 免 key；直连可用 |
| X (Twitter) | twitterapi.io API | 需 key；免费层 1 请求/5秒（已内置节流）；`since_time` 增量抓取省额度 |

所有源内置：随机 UA、随机延时、URL 哈希去重、单源失败自动降级。

## API（供集成）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/state` | 关键词、统计、扫描状态、配置 |
| POST | `/api/keywords` | `{term}` 添加关键词 |
| DELETE | `/api/keywords/:id` | 删除关键词 |
| POST | `/api/scan` | 手动触发扫描（结果经 SSE 推送） |
| GET | `/api/events?limit=&keyword=` | 情报事件列表 |
| GET | `/api/notifications?unread=1` | 通知列表 |
| POST | `/api/notifications/read` | `{ids:[...]}` 标记已读 |
| GET | `/api/stream` | SSE：`scan_started` / `scan_done` / `new_events` |

## Agent Skill（让其他 AI 帮你盯热点）

`skill/hotspotter/` 是一个标准 Agent Skill，无需启动 Web 服务即可使用：

```bash
# 监控某关键词最近的动态（采集+AI分析，输出 Markdown 报告）
npm run skill -- watch "GPT-5" --hours 24

# 生成今日热点简报
npm run skill -- brief
```

安装到 AI 助手（以 ZCode / Claude Code 为例）：把 `skill/hotspotter` 目录复制到 `~/.agents/skills/`（用户级）或项目 `.zcode/skills/`（项目级），之后对话里说「帮我监控 XX 的热点」「看看今天有什么热点」即可触发。

## 项目结构

```
server/
  index.js            Express 入口（API + 静态托管 + SSE）
  config.js / db.js   配置 / SQLite（node:sqlite，零原生依赖）
  pipeline.js         扫描全流程：采集→去重→AI→事件→通知
  scheduler.js        node-cron 定时扫描 + 邮件简报
  collectors/         三路采集器（googleNews / bingNews / twitter）
  ai/                 openrouter 客户端 + analyzer 分析引擎
  notifiers/          站内+SSE / 邮件
public/               前端（磷光雷达风格，原生三件套）
skill/hotspotter/     Agent Skill（SKILL.md + CLI）
```

## 测试脚本

```bash
npm run test:collectors   # 三路采集器真实请求验证
npm run test:ai           # 采集→AI 分析→事件 全链路验证
```

## 常见问题

- **Google 源一直失败**：国内网络需在 `.env` 配置 `PROXY_URL`（Clash 默认 `http://127.0.0.1:7897`，v2rayN 常见 `10809`）
- **OpenRouter 402**：账户余额不足，换免费模型（模型名带 `:free` 后缀）或充值
- **twitterapi.io 429**：免费层限速，已内置 5 秒节流；频繁报错说明额度将尽
- **邮件不发**：确认 `SMTP_USER/SMTP_PASS/MAIL_TO` 三项都填了，授权码不是 QQ 密码
