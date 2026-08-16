import { config } from './config.js';
import { collectAll } from './collectors/index.js';
import { analyzeItems } from './ai/analyzer.js';
import {
  insertRawItem, listUnanalyzedItems, markAnalyzed, upsertEvent,
  addNotification, listKeywords, listEvents,
} from './db.js';
import { broadcast } from './notifiers/inapp.js';
import { sendEventAlert, smtpConfigured } from './notifiers/email.js';
import { politeDelay } from './lib.js';

let scanning = false;
let lastScan = null;

export function getScanState() {
  return { scanning, lastScan };
}

/**
 * 完整扫描流程：多源采集 → 入库去重 → AI 分析 → 事件合并 → 通知。
 * 关键词 + 兴趣话题（TOPICS）都会被采集。
 */
export async function runScan({ notify = true } = {}) {
  if (scanning) return { skipped: true, reason: '已有扫描在进行中' };
  scanning = true;
  broadcast('scan_started', {});
  const startedAt = Date.now();
  try {
    const keywords = listKeywords().filter((k) => k.active).map((k) => k.term);
    const targets = [...new Set([...keywords, ...config.topics])];

    let collected = 0, fresh = 0;
    const errors = [];
    const sinceUnix = Math.floor(Date.now() / 1000) - 24 * 3600; // Twitter 增量窗口

    for (const kw of targets) {
      try {
        const { items, errors: errs } = await collectAll(kw, { limit: 8, sinceUnix });
        collected += items.length;
        for (const it of items) if (insertRawItem(it)) fresh++;
        errors.push(...errs.map((e) => ({ target: kw, ...e })));
      } catch (e) {
        errors.push({ target: kw, error: e.message });
      }
      await politeDelay(600);
    }

    const unanalyzed = listUnanalyzedItems(42);
    const { events, discardedIds } = await analyzeItems(unanalyzed);
    const allIds = [...new Set([...events.flatMap((e) => e.raw_item_ids), ...discardedIds])];
    if (allIds.length) markAnalyzed(allIds);

    const newEvents = [];
    for (const ev of events) {
      const r = upsertEvent(ev);
      if (r.isNew) newEvents.push({ ...ev, id: r.id });
    }

    lastScan = {
      at: new Date().toISOString(),
      durationSec: Math.round((Date.now() - startedAt) / 1000),
      targets: targets.length,
      collected, fresh,
      analyzed: unanalyzed.length,
      discarded: discardedIds.length,
      events: events.length,
      newEvents: newEvents.length,
      errors,
    };

    if (notify && newEvents.length) {
      for (const ev of newEvents) {
        addNotification({ event_id: ev.id, channel: 'inapp', title: ev.title, body: ev.summary });
      }
      broadcast('new_events', {
        events: newEvents.map((e) => ({
          id: e.id, title: e.title, summary: e.summary,
          verdict: e.verdict, confidence: e.confidence, heat: e.heat,
          source_count: e.source_urls.length,
        })),
      });
      const hot = newEvents.filter((e) => e.verdict === 'verified' && e.confidence >= 70);
      if (hot.length && smtpConfigured()) {
        sendEventAlert(hot).catch((e) => console.error('[email]', e.message));
      }
    }

    broadcast('scan_done', lastScan);
    return lastScan;
  } catch (e) {
    console.error('[scan] 扫描失败:', e.message);
    lastScan = {
      ...lastScan,
      at: new Date().toISOString(),
      durationSec: lastScan?.durationSec ?? 0,
      targets: lastScan?.targets ?? 0,
      collected: lastScan?.collected ?? 0,
      fresh: lastScan?.fresh ?? 0,
      analyzed: lastScan?.analyzed ?? 0,
      discarded: lastScan?.discarded ?? 0,
      events: lastScan?.events ?? 0,
      newEvents: lastScan?.newEvents ?? 0,
      errors: [...(lastScan?.errors || []), { source: 'pipeline', error: e.message }],
    };
    broadcast('scan_done', lastScan);
    return lastScan;
  } finally {
    scanning = false;
  }
}

/** 供定时简报使用 */
export function recentEventsForDigest(limit = 20) {
  return listEvents({ limit });
}
