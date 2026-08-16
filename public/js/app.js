/* 前端主逻辑：状态加载 / SSE 实时 / 交互 */
import { setSignals, pulse, setScanning } from './radar.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = { keywords: [], stats: {}, config: {}, events: [], filter: 'all', notifPermitted: false };

const verdictMeta = {
  verified: { label: '已验证', en: 'VERIFIED', cls: 'verified' },
  unverified: { label: '待印证', en: 'UNVERIFIED', cls: 'unverified' },
  suspicious: { label: '存疑', en: 'SUSPECT', cls: 'suspicious' },
};

const sourceName = { google_news: 'GNEWS', bing_news: 'BING', twitter: 'X' };
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return '链接'; } };

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso + (iso.includes('T') ? '' : 'Z')).getTime()) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

/* ═══════ 渲染 ═══════ */

function renderSignals() {
  const box = $('#signalChips');
  box.innerHTML = '';
  for (const kw of state.keywords) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${esc(kw.term)}<button aria-label="删除关键词 ${esc(kw.term)}" data-id="${kw.id}">×</button>`;
    box.appendChild(chip);
  }
  if (state.config.topics?.length) {
    const label = document.createElement('span');
    label.className = 'chips__label';
    label.textContent = '兴趣话题（来自配置）';
    box.appendChild(label);
    const wrap = document.createElement('span');
    wrap.className = 'chips chips--topic';
    for (const t of state.config.topics) {
      const c = document.createElement('span');
      c.className = 'chip';
      c.textContent = t;
      wrap.appendChild(c);
    }
    box.appendChild(wrap);
  }
  setSignals([...state.keywords.map((k) => k.term), ...(state.config.topics || [])]);
  updateRadarCaption();
}

function renderEvents({ prependIds = [] } = {}) {
  const list = $('#feedList');
  const counts = { all: state.events.length, verified: 0, unverified: 0, suspicious: 0 };
  for (const ev of state.events) counts[ev.verdict] = (counts[ev.verdict] || 0) + 1;
  $$('.filter span').forEach((el) => (el.textContent = counts[el.dataset.c] ?? 0));

  const shown = state.events.filter((ev) => state.filter === 'all' || ev.verdict === state.filter);
  $('#feedEmpty').hidden = shown.length > 0;
  list.innerHTML = '';

  for (const ev of shown) {
    const v = verdictMeta[ev.verdict] || verdictMeta.unverified;
    const card = document.createElement('article');
    card.className = `card card--${v.cls}`;
    if (prependIds.includes(ev.id)) card.classList.add('card--lock');

    const confCells = scaleCells(ev.confidence, 10);
    const heatCells = scaleCells(ev.heat, 5);

    card.innerHTML = `
      <div class="card__top">
        <span class="card__id">#${String(ev.id).padStart(4, '0')}</span>
        <span class="badge badge--${v.cls}">${v.en} ${v.label}</span>
        <span class="card__time">${timeAgo(ev.last_seen)}</span>
      </div>
      <h2 class="card__title">${esc(ev.title)}</h2>
      <p class="card__summary">${esc(ev.summary)}</p>
      <div class="meters">
        <div class="meter">
          <span class="meter__label">置信 CONF</span>
          <span class="scale">${confCells}</span>
          <span class="meter__val">${ev.confidence}</span>
        </div>
        <div class="meter">
          <span class="meter__label">热度 HEAT</span>
          <span class="scale">${heatCells}</span>
          <span class="meter__val">${ev.heat}</span>
        </div>
        <div class="meter">
          <span class="meter__label">交叉源 SRC</span>
          <span class="meter__val">${ev.source_urls.length}</span>
        </div>
      </div>
      <div class="card__foot">
        ${(ev.matched_keywords || []).slice(0, 4).map((k) => `<span class="card__kw">${esc(k)}</span>`).join('')}
        <div class="card__srcs">
          ${ev.source_urls.slice(0, 4).map((u) => `<a class="srcLink" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(domainOf(u))}</a>`).join('')}
        </div>
      </div>`;
    list.appendChild(card);
  }
}

function scaleCells(val, total) {
  const on = Math.round((val / 100) * total);
  return Array.from({ length: total }, (_, i) => `<i style="--i:${i}" class="${i < on ? 'on' : ''}"></i>`).join('');
}

function renderReceivers() {
  const ul = $('#receivers');
  ul.innerHTML = '';
  const lastErrors = state.lastScan?.errors || [];
  for (const src of state.config.sources || []) {
    const down = lastErrors.some((e) => String(e.source || '').includes(src)) ||
                 lastErrors.some((e) => String(e.source || '').includes(sourceName[src] || '###'));
    const bars = Array.from({ length: 5 }, (_, i) =>
      `<span class="receiver__bar ${down ? 'receiver__bar--on' : i < 4 ? 'receiver__bar--on' : ''}"></span>`).join('');
    const li = document.createElement('li');
    li.className = `receiver ${down ? 'receiver--down' : ''}`;
    li.innerHTML = `
      <span class="receiver__name">${sourceName[src] || src}</span>
      <span class="receiver__bars">${bars}</span>
      <span class="receiver__note">${down ? '无信号' : '在线'}</span>`;
    ul.appendChild(li);
  }
}

function renderLastScan() {
  const el = $('#lastScan');
  const ls = state.lastScan;
  if (!ls) return;
  el.innerHTML = `上次扫描 ${timeAgo(ls.at)} · 耗时 ${ls.durationSec}s<br>` +
    `目标 ${ls.targets} · 采集 ${ls.collected} · 新增 ${ls.fresh}<br>` +
    `AI 分析 ${ls.analyzed} · 产出事件 ${ls.events} · 新事件 ${ls.newEvents}` +
    (ls.errors?.length ? `<br><span style="color:var(--red)">告警：${esc(ls.errors.map((e) => e.source || e.error).join('；'))}</span>` : '');
}

function renderStats() {
  const s = state.stats;
  $('#feedStats').textContent = `${s.events ?? 0} 情报 · ${s.rawItems ?? 0} 原始信号 · ${s.unread ?? 0} 未读`;
}

function renderBell() {
  const n = (state.notifications || []).filter((n) => !n.read).length;
  const badge = $('#bellBadge');
  badge.hidden = n === 0;
  badge.textContent = n > 99 ? '99+' : n;
}

function renderNotifDrawer() {
  const list = $('#notifList');
  if (!state.notifications?.length) {
    list.innerHTML = '<div class="drawer__empty">还没有通知。<br>捕获新情报时会第一时间出现在这里。</div>';
    return;
  }
  list.innerHTML = '';
  for (const n of [...state.notifications].reverse()) {
    const el = document.createElement('div');
    el.className = `notif ${n.read ? '' : 'notif--unread'}`;
    el.innerHTML = `
      <div class="notif__title">${esc(n.title)}</div>
      <div class="notif__body">${esc(n.body || '')}</div>
      <div class="notif__time">${timeAgo(n.created_at)}</div>`;
    list.appendChild(el);
  }
}

function setScanningUI(on) {
  setScanning(on);
  document.body.classList.toggle('is-scanning', on);
  $('#scanBtn').disabled = on;
  $('#scanBtn').innerHTML = on
    ? '<span class="btn__lamp"></span> 扫描中…'
    : '<span class="btn__lamp"></span> 立即扫描';
  const st = $('#sysStatus');
  st.className = `topbar__status mono ${on ? 'topbar__status--scanning' : ''}`;
  st.innerHTML = on ? '<span class="blink">●</span> SCANNING' : '<span class="blink">●</span> STANDBY';
  $('#sysLamp').className = `topbar__lamp ${on ? 'topbar__lamp--amber' : ''}`;
  $('#scanline').hidden = !on;
  updateRadarCaption();
}

function updateRadarCaption() {
  const n = state.keywords.length + (state.config.topics?.length || 0);
  $('#radarCaption').textContent = document.body.classList.contains('is-scanning')
    ? '◉ 扫描中，雷达加速运转…'
    : `${n} 信号在监听 · 点击雷达立即扫描`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ═══════ 数据加载 ═══════ */

async function loadState() {
  const r = await fetch('/api/state').then((r) => r.json());
  state.keywords = r.keywords;
  state.stats = r.stats;
  state.config = r.config;
  state.lastScan = r.scan.lastScan;
  setScanningUI(r.scan.scanning);
  renderSignals();
  renderReceivers();
  renderLastScan();
  renderStats();
}

async function loadEvents() {
  const r = await fetch('/api/events?limit=80').then((r) => r.json());
  state.events = r.events;
  renderEvents();
  renderStats();
}

async function loadNotifications() {
  const r = await fetch('/api/notifications?limit=60').then((r) => r.json());
  state.notifications = r.notifications;
  renderBell();
  renderNotifDrawer();
}

/* ═══════ SSE ═══════ */

function connectSSE() {
  const es = new EventSource('/api/stream');

  es.addEventListener('scan_started', () => setScanningUI(true));

  es.addEventListener('scan_done', (e) => {
    const result = JSON.parse(e.data);
    state.lastScan = result;
    setScanningUI(false);
    renderLastScan();
    loadEvents();
    loadState();
  });

  es.addEventListener('new_events', (e) => {
    const { events } = JSON.parse(e.data);
    if (!events?.length) return;
    loadEvents().then(() => {
      const ids = events.map((ev) => ev.id);
      const list = $('#feedList');
      for (const c of list.children) {
        if (ids.includes(Number(c.querySelector('.card__id')?.textContent?.slice(1)))) c.classList.add('card--lock');
      }
    });
    for (const ev of events) pulse((ev.matched_keywords || [])[0] || state.keywords[0]?.term || '');
    loadNotifications();
    toast(`◉ 捕获 ${events.length} 条新情报`);
    notifyBrowser(events);
  });
}

function notifyBrowser(events) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  for (const ev of events.slice(0, 3)) {
    const n = new Notification(ev.title, {
      body: ev.summary.slice(0, 120),
      tag: `hotspotter-${ev.id}`,
      icon: 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="%230a1612" stroke="%2364e8a0" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="%2364e8a0"/></svg>'
      ),
    });
    setTimeout(() => n.close(), 12000);
  }
}

/* ═══════ 交互 ═══════ */

$('#addSignalForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#addSignalInput');
  const term = input.value.trim();
  if (!term) return;
  const r = await fetch('/api/keywords', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ term }),
  }).then((r) => r.json());
  if (r.error) return toast('⚠ ' + r.error);
  state.keywords = r.keywords;
  renderSignals();
  input.value = '';
  toast(`◉ 信号已添加：${term}，下轮扫描生效`);
  askNotifyPermission();
});

$('#signalChips').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  const r = await fetch(`/api/keywords/${btn.dataset.id}`, { method: 'DELETE' }).then((r) => r.json());
  state.keywords = r.keywords;
  renderSignals();
});

async function triggerScan() {
  if (document.body.classList.contains('is-scanning')) {
    toast('扫描进行中，请稍候');
    return;
  }
  askNotifyPermission();
  const r = await fetch('/api/scan', { method: 'POST' }).then((r) => r.json());
  if (r.started) {
    setScanningUI(true);
    toast('⦿ 扫描已启动，捕获后自动推送');
  } else {
    toast('扫描进行中，请稍候');
  }
}

$('#scanBtn').addEventListener('click', triggerScan);

// 点击雷达盘 = 立即扫描（Enter/Space 键盘同样触发）
const radar = $('#radar');
radar.addEventListener('click', triggerScan);
radar.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    triggerScan();
  }
});

$('#filterBar').addEventListener('click', (e) => {
  const btn = e.target.closest('.filter');
  if (!btn) return;
  state.filter = btn.dataset.f;
  $$('.filter').forEach((b) => {
    const on = b === btn;
    b.classList.toggle('filter--on', on);
    b.setAttribute('aria-selected', on);
  });
  renderEvents();
});

/* 通知抽屉 */
const drawer = $('#drawer'), mask = $('#drawerMask');
function openDrawer() {
  drawer.classList.add('drawer--open');
  drawer.setAttribute('aria-hidden', 'false');
  mask.hidden = false;
}
function closeDrawer() {
  drawer.classList.remove('drawer--open');
  drawer.setAttribute('aria-hidden', 'true');
  mask.hidden = true;
}
$('#bellBtn').addEventListener('click', openDrawer);
$('#closeDrawerBtn').addEventListener('click', closeDrawer);
mask.addEventListener('click', closeDrawer);
addEventListener('keydown', (e) => e.key === 'Escape' && closeDrawer());

$('#readAllBtn').addEventListener('click', async () => {
  const ids = (state.notifications || []).filter((n) => !n.read).map((n) => n.id);
  if (!ids.length) return;
  await fetch('/api/notifications/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  await loadNotifications();
  await loadState();
});

function askNotifyPermission() {
  if (state.notifPermitted || !('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().then((p) => (state.notifPermitted = p === 'granted'));
  } else {
    state.notifPermitted = Notification.permission === 'granted';
  }
}

/* 时钟 */
setInterval(() => {
  const d = new Date();
  $('#clock').textContent = d.toLocaleTimeString('zh-CN', { hour12: false });
}, 1000);

/* Toast */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3200);
}

/* ═══════ 启动 ═══════ */
await loadState();
await loadEvents();
await loadNotifications();
connectSSE();
