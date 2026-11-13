/**
 * 便签卡片：纹理生成 + 扇形层叠心形布局
 * 对应参考画面：淡色便签、顶部打孔、×记号、扇形压边围成爱心
 */
import * as THREE from '../vendor/three.module.min.js';

const NOTE_STYLES = [
  { a: '#dcf3e8', b: '#bfe8d6', ink: '#2c5a46', line: 'rgba(255,255,255,.9)' }, // 薄荷
  { a: '#ffe2ec', b: '#ffc8da', ink: '#6b2741', line: 'rgba(255,255,255,.92)' }, // 藕粉
  { a: '#e8deff', b: '#d4c3ff', ink: '#3a2a65', line: 'rgba(255,255,255,.9)' },  // 淡紫
  { a: '#fff5d6', b: '#ffe9ab', ink: '#6b4b13', line: 'rgba(255,255,255,.95)' }, // 奶油黄
  { a: '#dfeeff', b: '#c7ddff', ink: '#22425f', line: 'rgba(255,255,255,.92)' }  // 天蓝
];

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function heartSmall(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.7);
  ctx.bezierCurveTo(cx + s * 1.3, cy - s * 0.35, cx + s * 0.48, cy - s * 1.1, cx, cy - s * 0.36);
  ctx.bezierCurveTo(cx - s * 0.48, cy - s * 1.1, cx - s * 1.3, cy - s * 0.35, cx, cy + s * 0.7);
  ctx.closePath();
}

/** 一张便签的贴图 */
export function createNoteTexture(item, index) {
  const W = 224, H = 298;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const st = NOTE_STYLES[index % NOTE_STYLES.length];

  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, st.a);
  g.addColorStop(1, st.b);
  roundRect(ctx, 3, 3, W - 6, H - 6, 14);
  ctx.fillStyle = g;
  ctx.fill();

  // 内描边
  roundRect(ctx, 9, 9, W - 18, H - 18, 10);
  ctx.strokeStyle = st.line;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // 顶部打孔点
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  [W * 0.3, W * 0.7].forEach(x => {
    ctx.beginPath();
    ctx.arc(x, 22, 3.4, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.strokeStyle = 'rgba(120,110,130,.35)';
  ctx.lineWidth = 1;
  [W * 0.3, W * 0.7].forEach(x => {
    ctx.beginPath();
    ctx.arc(x, 22, 5.4, 0, Math.PI * 2);
    ctx.stroke();
  });

  // 右上角 ×
  ctx.strokeStyle = 'rgba(90,80,100,.32)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(W - 30, 18);
  ctx.lineTo(W - 20, 28);
  ctx.moveTo(W - 20, 18);
  ctx.lineTo(W - 30, 28);
  ctx.stroke();

  // 短句：自动换行 + 缩字号
  const maxW = W - 44;
  let size = 26;
  let lines;
  const layout = () => {
    ctx.font = '700 ' + size + 'px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    lines = [];
    let cur = '';
    for (const ch of item.short) {
      if (ctx.measureText(cur + ch).width > maxW && cur) {
        lines.push(cur);
        cur = ch;
      } else {
        cur += ch;
      }
    }
    if (cur) lines.push(cur);
  };
  do {
    layout();
    if (lines.length <= 2) break;
    size -= 2;
  } while (size > 15);

  ctx.fillStyle = st.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const startY = H * 0.44 - ((lines.length - 1) * size * 1.35) / 2;
  lines.forEach((ln, i) => ctx.fillText(ln, W / 2, startY + i * size * 1.35));

  // 分隔线 + 小爱心
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 22, H * 0.68);
  ctx.lineTo(W / 2 + 22, H * 0.68);
  ctx.stroke();

  ctx.fillStyle = st.ink;
  ctx.globalAlpha = 0.55;
  heartSmall(ctx, W / 2, H * 0.8, 8);
  ctx.fill();
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** 心形参数方程（与参考作品同源） */
export function heartPoint(t, scale) {
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  return { x: (x / 17) * scale, y: (y / 17) * scale };
}

/**
 * 等弧长取点，并按"径向朝外 + 逐张前后叠压"生成便签扇形布局
 */
export function noteLayout(count, scale) {
  const SAMPLES = 1400;
  const pts = [];
  let total = 0;
  let prev = null;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = (i / SAMPLES) * Math.PI * 2;
    const p = heartPoint(t, scale);
    if (prev) total += Math.hypot(p.x - prev.x, p.y - prev.y);
    pts.push({ x: p.x, y: p.y, d: total });
    prev = p;
  }

  const raw = [];
  for (let i = 0; i < count; i++) {
    const target = (i / count) * total;
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].d < target) lo = mid + 1; else hi = mid;
    }
    raw.push(pts[lo]);
  }

  const minX = Math.min(...raw.map(p => p.x));
  const maxX = Math.max(...raw.map(p => p.x));
  const minY = Math.min(...raw.map(p => p.y));
  const maxY = Math.max(...raw.map(p => p.y));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const notes = raw.map((p, i) => {
    const x = p.x - cx;
    const y = p.y - cy;
    // 从中心指向卡片的极角 → 卡片顶部朝外
    let rot = Math.atan2(y, x) - Math.PI / 2;
    // 归一化到 [-90°, 90°]，避免底部出现倒置卡片造成"断裂感"
    if (rot > Math.PI / 2) rot -= Math.PI;
    if (rot < -Math.PI / 2) rot += Math.PI;
    return {
      x,
      y,
      rot,
      // 逐张单向递增深度，形成便签叠瓦
      z: 0.002 + i * 0.0016,
      order: i
    };
  });

  return {
    notes,
    width: maxX - minX,
    height: maxY - minY
  };
}
