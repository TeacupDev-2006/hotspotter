import { Router } from 'express';
import { config } from '../config.js';
import { collectors } from '../collectors/index.js';
import {
  insertKeyword, deleteKeyword, listKeywords,
  listEvents, listNotifications, markNotificationsRead, stats,
} from '../db.js';
import { runScan, getScanState } from '../pipeline.js';
import { sseHandler } from '../notifiers/inapp.js';
import { smtpConfigured } from '../notifiers/email.js';

export const api = Router();

api.get('/state', (req, res) => {
  res.json({
    keywords: listKeywords(),
    stats: stats(),
    scan: getScanState(),
    config: {
      model: config.openrouter.model,
      topics: config.topics,
      smtpConfigured: smtpConfigured(),
      sources: Object.keys(collectors),
      scanIntervalMinutes: config.scanIntervalMinutes,
    },
  });
});

api.post('/keywords', (req, res) => {
  const term = String(req.body?.term || '').trim();
  if (!term || term.length > 60) return res.status(400).json({ error: '关键词不能为空且不超过60字符' });
  insertKeyword(term);
  res.json({ keywords: listKeywords() });
});

api.delete('/keywords/:id', (req, res) => {
  deleteKeyword(Number(req.params.id));
  res.json({ keywords: listKeywords() });
});

api.post('/scan', (req, res) => {
  const state = getScanState();
  if (state.scanning) return res.json({ started: false, reason: '扫描进行中' });
  runScan({ notify: true }).catch((e) => console.error('[manual-scan]', e.message));
  res.json({ started: true });
});

api.get('/events', (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 60);
  const keyword = String(req.query.keyword || '').trim();
  res.json({ events: listEvents({ limit, keyword }) });
});

api.get('/notifications', (req, res) => {
  const unreadOnly = req.query.unread === '1';
  const limit = Math.min(200, Number(req.query.limit) || 60);
  res.json({ notifications: listNotifications({ unreadOnly, limit }) });
});

api.post('/notifications/read', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  markNotificationsRead(ids);
  res.json({ ok: true, unread: listNotifications({ unreadOnly: true, limit: 1 }).length });
});

api.get('/stream', sseHandler);
