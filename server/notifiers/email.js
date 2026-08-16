import nodemailer from 'nodemailer';
import { config } from '../config.js';

export function smtpConfigured() {
  return !!(config.smtp.user && config.smtp.pass && config.smtp.to);
}

function transporter() {
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
}

function verdictLabel(v) {
  return { verified: '✓ 已验证', unverified: '? 待验证', suspicious: '⚠ 存疑' }[v] || v;
}

function eventsToHtml(events, heading) {
  const cards = events
    .map(
      (ev) => `
    <div style="margin:0 0 18px;padding:14px 16px;border:1px solid #2a3f2a;border-left:4px solid ${
        ev.verdict === 'verified' ? '#4caf50' : ev.verdict === 'suspicious' ? '#e65100' : '#ffb300'
      };border-radius:8px;background:#101a10;">
      <div style="font-size:16px;font-weight:700;color:#e8f5e9;margin-bottom:6px;">${esc(ev.title)}</div>
      <div style="color:#b0bec5;font-size:13px;line-height:1.7;">${esc(ev.summary)}</div>
      <div style="margin-top:8px;font-size:12px;color:#8aa08a;">
        ${verdictLabel(ev.verdict)} · 置信度 ${ev.confidence}% · 热度 ${ev.heat} · 来源 ${ev.source_urls.length} 个
      </div>
    </div>`
    )
    .join('');
  return `<div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;background:#0d1420;padding:24px;border-radius:12px;">
    <h2 style="color:#69f0ae;margin:0 0 16px;">${esc(heading)}</h2>${cards}
    <div style="color:#546e7a;font-size:12px;text-align:center;margin-top:8px;">HotSpotter 热点雷达站</div>
  </div>`;
}

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function send(subject, html) {
  if (!smtpConfigured()) {
    console.log('[email] SMTP 未配置，跳略发送:', subject);
    return false;
  }
  const t = transporter();
  await t.sendMail({
    from: `"HotSpotter 热点雷达站" <${config.smtp.user}>`,
    to: config.smtp.to,
    subject,
    html,
  });
  console.log('[email] 已发送:', subject);
  return true;
}

/** 高置信度新事件的即时告警 */
export function sendEventAlert(events) {
  return send(`🔴 情报警报：${events[0]?.title?.slice(0, 30) || '新热点'} 等 ${events.length} 条`, eventsToHtml(events, '关键词监控触发了新的热点事件'));
}

/** 定期摘要 */
export function sendDigest(events) {
  return send(`📡 热点简报：近 12 小时 ${events.length} 条情报`, eventsToHtml(events, '热点雷达站 · 定期简报'));
}
