/* 值班雷达：磷光屏 canvas 仪表
   —— 信号点 = 监控关键词（位置稳定可寻）
   —— 扫描扇区扫过时点亮余晖；捕获新情报时信号爆发脉冲环 */

const canvas = document.getElementById('radar');
const ctx = canvas.getContext('2d');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let signals = [];        // { term, angle, radius, glow }
let scanning = false;
let angle = 0;
let lastFrame = 0;

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = rect.width * dpr;
  canvas.height = rect.width * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function setSignals(terms) {
  const old = new Map(signals.map((s) => [s.term, s]));
  signals = terms.map((term) => {
    const prev = old.get(term);
    return {
      term,
      angle: prev ? prev.angle : hashStr(term) * Math.PI * 2,
      radius: prev ? prev.radius : 0.3 + hashStr(term + '#r') * 0.55,
      glow: prev ? prev.glow : 0,
    };
  });
}

export function pulse(term) {
  const s = signals.find((x) => x.term === term);
  if (s) s.glow = 1;
  else if (signals[0]) signals[0].glow = 1; // 无精确匹配时也给出反馈
}

export function setScanning(v) {
  scanning = v;
}

function draw(ts) {
  requestAnimationFrame(draw);
  const w = canvas.getBoundingClientRect().width;
  if (!w) return;
  const cx = w / 2, cy = w / 2, R = w / 2 - 6;
  const dt = lastFrame ? Math.min(50, ts - lastFrame) : 16;
  lastFrame = ts;

  const speed = scanning ? 0.0022 : 0.0009;
  if (!reduceMotion) angle = (angle + speed * dt) % (Math.PI * 2);

  ctx.clearRect(0, 0, w, w);

  // 底盘微光
  const base = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  base.addColorStop(0, 'rgba(100,232,160,0.05)');
  base.addColorStop(1, 'rgba(100,232,160,0.015)');
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  // 同心圆 + 刻度
  ctx.strokeStyle = 'rgba(100,232,160,0.16)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, (R * i) / 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
  ctx.stroke();
  // 每 30° 刻度
  ctx.strokeStyle = 'rgba(100,232,160,0.28)';
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (R - 5), cy + Math.sin(a) * (R - 5));
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.stroke();
  }

  // 扫描扇区（锥形余晖）
  const sweep = ctx.createConicalGradient
    ? ctx.createConicalGradient(angle, cx, cy)
    : null;
  if (sweep) {
    sweep.addColorStop(0, 'rgba(100,232,160,0.30)');
    sweep.addColorStop(0.12, 'rgba(100,232,160,0.0)');
    sweep.addColorStop(1, 'rgba(100,232,160,0.0)');
    ctx.fillStyle = sweep;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
  }
  // 扫描线本体
  ctx.strokeStyle = scanning ? 'rgba(232,184,75,0.75)' : 'rgba(100,232,160,0.55)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * R, cy + Math.sin(angle) * R);
  ctx.stroke();

  // 信号点
  for (const s of signals) {
    const x = cx + Math.cos(s.angle) * R * s.radius;
    const y = cy + Math.sin(s.angle) * R * s.radius;
    // 扫描线扫过时点亮
    let da = (angle - s.angle) % (Math.PI * 2);
    if (da < 0) da += Math.PI * 2;
    const passed = Math.max(0, 1 - da / 2.2);
    const bright = 0.35 + passed * 0.65 + (s.glow || 0);

    // 爆发脉冲环
    if (s.glow > 0.01) {
      ctx.strokeStyle = `rgba(100,232,160,${s.glow * 0.8})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 4 + (1 - s.glow) * 22, 0, Math.PI * 2);
      ctx.stroke();
      s.glow = reduceMotion ? 0 : Math.max(0, s.glow - dt * 0.0012);
    }

    ctx.fillStyle = `rgba(100,232,160,${Math.min(1, bright)})`;
    ctx.shadowColor = 'rgba(100,232,160,0.8)';
    ctx.shadowBlur = 4 + passed * 6 + (s.glow || 0) * 14;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 标签
    ctx.fillStyle = `rgba(201,229,211,${0.35 + passed * 0.4})`;
    ctx.font = '10px "JetBrains Mono", monospace';
    const label = s.term.length > 12 ? s.term.slice(0, 11) + '…' : s.term;
    ctx.fillText(label, x + 7, y + 3);
  }
}

resize();
addEventListener('resize', resize);
requestAnimationFrame(draw);
