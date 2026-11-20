/**
 * 星河蛋糕 v4 —— 按用户提供的实拍参考图重做形态
 *
 * 参考图（抖音"电子蛋糕"特写）的六个硬特征，逐条对齐：
 *   1. 矮胖圆柱：高 ≈ 直径 0.55（原版 1.46/2.24 = 0.65，显得又细又高）
 *   2. 侧面是大块"水彩星云"在流淌：深蓝底 + 天蓝/青/紫/金的大柔光斑 + 细星点
 *   3. 星环是**有宽度的立体光带**（原版是 Torus 细线，像钢丝圈）
 *   4. 画面上最抢眼的是**大量大颗彩色圆点**（原版太细太克制，丢了主角）
 *   5. 蜡烛粉紫、火苗橙黄且高（≈ 蜡烛 60%）
 *   6. 顶部厚奶油层 + 边缘滴落，白色大圆托盘
 */
import * as THREE from '../vendor/three.module.min.js';
import { SPARK, SHARED } from './particles.js';

const RADIUS = 1.18;
const HEIGHT = 1.66;          // 高/直径 ≈ 0.70，对齐参考图里"挺拔"的比例
const CREAM_H = 0.02;

/** 供 app.js 计算相机取景与气球高度，避免两处重复维护尺寸 */
export const CAKE_SIZE = { RADIUS, HEIGHT, CREAM_H };

/* 彩色散景：参考图里那一片大小不一、柔和发光的彩点（不是硬边糖果点） */
const DOT_PALETTE = [
  '#5fb8ff', '#3f7dff', '#22d6ff', '#ffd24d', '#ff9a3c',
  '#ff7ab8', '#a97bff', '#7dffd8'
];

/* 五角星：只留金色系，太大太白会像贴纸 */
const STAR_PALETTE = ['#ffd84d', '#ffe89a', '#ffc061'];

/* 侧面色块：星云感，整体偏紫（蓝紫为主 + 青与金橙点睛） */
const SIDE_BLOBS = [
  ['rgba(96,72,255,.94)', 0.22, 0.30, 0.36],
  ['rgba(140,90,255,.78)', 0.62, 0.20, 0.28],
  ['rgba(126,66,255,.88)', 0.46, 0.56, 0.34],
  ['rgba(255,152,42,.58)', 0.78, 0.64, 0.22],
  ['rgba(255,86,178,.56)', 0.34, 0.84, 0.20],
  ['rgba(48,40,210,.94)', 0.10, 0.70, 0.30],
  ['rgba(198,176,255,.58)', 0.88, 0.34, 0.24],
  ['rgba(255,222,120,.46)', 0.56, 0.92, 0.18],
  ['rgba(96,42,214,.76)', 0.68, 0.88, 0.26],
  ['rgba(124,64,255,.76)', 0.94, 0.62, 0.20],
  ['rgba(255,120,228,.46)', 0.14, 0.44, 0.22],
  ['rgba(170,130,255,.50)', 0.40, 0.12, 0.20]
];

/** 顶面贴图：深蓝星云顶（参考图的顶面就是深色星云，不是白奶油） */
function makeTopFaceTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  // 深蓝径向底
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, '#2a4ba8');
  g.addColorStop(0.45, '#1a2f7a');
  g.addColorStop(0.8, '#12194a');
  g.addColorStop(1, '#0a0e2a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // 彩色星云斑
  const blobs = [
    ['rgba(40,150,255,.75)', 0.30, 0.34, 0.30],
    ['rgba(0,225,255,.55)', 0.66, 0.26, 0.22],
    ['rgba(150,90,255,.55)', 0.48, 0.62, 0.26],
    ['rgba(255,170,60,.48)', 0.74, 0.66, 0.18],
    ['rgba(255,100,190,.34)', 0.24, 0.70, 0.18]
  ];
  blobs.forEach(([color, cx, cy, rr]) => {
    ctx.save();
    ctx.filter = 'blur(' + Math.round(size * 0.04) + 'px)';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx * size, cy * size, rr * size, rr * size * 0.85, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // 星点
  for (let i = 0; i < 380; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.pow(Math.random(), 0.6) * size * 0.5;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + Math.random() * 0.6) + ')';
    ctx.beginPath();
    ctx.arc(size / 2 + Math.cos(a) * rr, size / 2 + Math.sin(a) * rr, Math.random() * 1.7, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 星云叠加层：透明底 + 大彩色柔光斑，用加法混合贴在蛋糕表面
 * 单靠底色贴图做不出"发光的星云"，必须再加一层会叠加的光
 */
function makeCloudTexture(size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  const blobs = [
    ['rgba(120,80,255,.85)', 0.20, 0.28, 0.30],
    ['rgba(160,110,255,.62)', 0.58, 0.18, 0.24],
    ['rgba(150,80,255,.62)', 0.44, 0.52, 0.28],
    ['rgba(255,170,50,.52)', 0.80, 0.62, 0.20],
    ['rgba(255,90,190,.44)', 0.30, 0.80, 0.18],
    ['rgba(190,160,255,.48)', 0.86, 0.30, 0.18],
    ['rgba(80,40,200,.58)', 0.66, 0.90, 0.24],
    ['rgba(140,80,255,.62)', 0.10, 0.62, 0.22]
  ];

  blobs.forEach(([color, cx, cy, rr]) => {
    ctx.save();
    ctx.filter = 'blur(' + Math.round(size * 0.045) + 'px)';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(
      cx * size, cy * size,
      rr * size * (0.7 + Math.random() * 0.5),
      rr * size * (0.55 + Math.random() * 0.45),
      Math.random() * Math.PI, 0, Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  });

  // 细碎亮点，让星云里有"星"
  for (let i = 0; i < 420; i++) {
    ctx.fillStyle = 'rgba(255,255,255,' + (0.2 + Math.random() * 0.6) + ')';
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, Math.random() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** 蜡烛贴图：粉紫底 + 斜向螺旋条纹（参考图里的蜡烛是有纹路的） */
function makeCandleTexture() {
  const W = 128;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, W, 0);
  bg.addColorStop(0, '#c97ab4');
  bg.addColorStop(0.35, '#f7d3e8');
  bg.addColorStop(0.62, '#eeb2d6');
  bg.addColorStop(1, '#c07aa8');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 斜条纹（缠在圆柱上就是螺旋）
  ctx.strokeStyle = 'rgba(255,255,255,.42)';
  ctx.lineWidth = 10;
  for (let i = -2; i < 12; i++) {
    ctx.beginPath();
    ctx.moveTo(-W + i * 44, 0);
    ctx.lineTo(-W + i * 44 + 120, H);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(160,90,150,.30)';
  ctx.lineWidth = 7;
  for (let i = -2; i < 12; i++) {
    ctx.beginPath();
    ctx.moveTo(-W + i * 44 + 22, 0);
    ctx.lineTo(-W + i * 44 + 142, H);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * 蛋糕底色：油画笔触感
 *  - 底层竖向色域
 *  - 大色块用 ctx.filter 做柔化 → 像油彩晕开
 *  - 再叠随机短笔触 → 出"涂抹"的肌理
 *  - 最后细星点
 */
function makeBaseTexture(size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 0, size);
  bg.addColorStop(0, '#2a1f7a');
  bg.addColorStop(0.32, '#1e1856');
  bg.addColorStop(0.68, '#16103a');
  bg.addColorStop(1, '#08061c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // 大色块：柔化后叠上去，像油彩铺底
  SIDE_BLOBS.forEach(([color, cx, cy, rr]) => {
    ctx.save();
    ctx.filter = 'blur(' + Math.round(size * 0.035) + 'px)';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(
      cx * size, cy * size,
      rr * size * (0.7 + Math.random() * 0.6),
      rr * size * (0.55 + Math.random() * 0.5),
      Math.random() * Math.PI, 0, Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  });

  // 中号色斑：给"晕染"补层次
  for (let i = 0; i < 26; i++) {
    const color = SIDE_BLOBS[(Math.random() * SIDE_BLOBS.length) | 0][0];
    ctx.save();
    ctx.filter = 'blur(' + Math.round(size * 0.012) + 'px)';
    ctx.globalAlpha = 0.22 + Math.random() * 0.3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(
      Math.random() * size, Math.random() * size,
      size * (0.02 + Math.random() * 0.07),
      size * (0.015 + Math.random() * 0.05),
      Math.random() * Math.PI, 0, Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }

  // 短笔触：制造厚涂肌理
  const strokeColors = [
    'rgba(120,190,255,.55)', 'rgba(180,140,255,.45)',
    'rgba(255,200,120,.40)', 'rgba(90,240,255,.35)',
    'rgba(255,255,255,.30)'
  ];
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = size * (0.01 + Math.random() * 0.05);
    const ang = Math.random() * Math.PI * 2;
    ctx.save();
    ctx.filter = 'blur(2px)';
    ctx.globalAlpha = 0.25 + Math.random() * 0.45;
    ctx.strokeStyle = strokeColors[(Math.random() * strokeColors.length) | 0];
    ctx.lineWidth = 2 + Math.random() * 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
    ctx.restore();
  }

  // 细星点
  for (let i = 0; i < 1300; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.08 + Math.random() * 0.26) + ')';
    ctx.beginPath();
    ctx.arc(x, y, Math.random() * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}

/**
 * 环绕光带（参考图里的样式）：半透明发光的倾斜椭圆环
 *
 * 要点：
 *  - 环在 XZ 平面，倾斜后水平半径会在 R*cos(θ) ~ R 之间变化，
 *    取 R 让最小水平半径刚好贴住蛋糕外沿 —— 这样是"贴着绕过去"，
 *    前段在蛋糕前、后段被蛋糕挡住，才有立体环绕感，也不会像卡片套在外面
 *  - 半透明 + 加法混合（参考图里的带子是透光的）
 *  - shader 里叠一层沿环跑动的亮斑，配合 app.js 的倾角摆动 → 真的在动
 */
function makeOrbitBand(o) {
  const SEG = 480;
  const positions = [];
  const aT = [];
  const aOff = [];
  const indices = [];
  const offs = [-1, -0.4, 0.4, 1];

  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    for (let s = 0; s < 4; s++) {
      const ang = t * Math.PI * 2;
      positions.push(Math.cos(ang) * o.radius, 0, Math.sin(ang) * o.radius);
      aT.push(t);
      aOff.push(offs[s]);
    }
    if (i < SEG) {
      const b = i * 4;
      for (let s = 0; s < 3; s++) {
        indices.push(b + s, b + s + 1, b + 4 + s, b + s + 1, b + 4 + s + 1, b + 4 + s);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
  geo.setAttribute('aOff', new THREE.Float32BufferAttribute(aOff, 1));
  geo.setIndex(indices);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: SHARED.time,
      uRadius: { value: o.radius },
      uWidth: { value: o.width },
      uColorA: { value: new THREE.Color(o.colorA) },
      uColorB: { value: new THREE.Color(o.colorB) },
      uOpacity: { value: o.opacity ?? 0.85 },
      uSpeed: { value: o.speed ?? 0.3 }
    },
    vertexShader: [
      'precision highp float;',
      'attribute float aT, aOff;',
      'uniform float uTime, uRadius, uWidth, uSpeed;',
      'uniform vec3 uColorA, uColorB;',
      'varying vec3 vColor;',
      'varying float vT, vEdge;',
      'void main(){',
      '  float t = aT;',
      '  float ang = t * 6.2831853 + uTime * uSpeed;',
      // 半径做波浪：这条带子不是死板的几何圆
      '  float r = uRadius + sin(t * 6.2831853 * 2.0 + uTime * 0.7) * 0.03;',
      '  float taper = 0.55 + 0.45 * sin(t * 6.2831853 * 3.0 + 1.1);',
      '  float rr = r + aOff * uWidth * taper;',
      '  vec3 p = vec3(cos(ang) * rr, 0.0, sin(ang) * rr);',
      '  vColor = mix(uColorA, uColorB, 0.5 + 0.5 * sin(t * 6.2831853 + uTime * 0.5));',
      '  vT = t;',
      '  vEdge = 1.0 - abs(aOff);',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform float uTime, uOpacity;',
      'varying vec3 vColor;',
      'varying float vT, vEdge;',
      'void main(){',
      // 沿环跑动的亮斑
      '  float flow = fract(vT - uTime * 0.14);',
      '  float glow = pow(max(0.0, 1.0 - abs(flow - 0.5) * 2.0), 6.0);',
      // 截面上边缘淡、中心亮 → 看起来是"光带"而不是实心片
      '  float a = uOpacity * pow(vEdge, 0.55) * (0.42 + glow * 0.9);',
      '  vec3 col = vColor * (1.0 + glow * 1.2);',
      '  gl_FragColor = vec4(col, a);',
      '}'
    ].join('\n'),
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * 通用光点层（ShaderMaterial）
 * 不用 PointsMaterial：它的 size 在各设备/DPR 下表现不一致，
 * 调了半天屏幕上也只是一两个像素。这里直接按真实投影算 gl_PointSize：
 *   gl_PointSize = aSize(世界单位) * uProj / dist
 * 与 particles.js 的星尘同一套公式，尺寸可预期。
 */
function createDotLayer(n, sizeMin, sizeMax, palette, opts = {}) {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const phase = new Float32Array(n);
  const seed = new Float32Array(n);
  const color = new THREE.Color();
  const genPos = opts.genPos;

  for (let i = 0; i < n; i++) {
    const p = genPos();
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = p.y;
    pos[i * 3 + 2] = p.z;

    color.set(palette[(Math.random() * palette.length) | 0]);
    col[i * 3] = color.r;
    col[i * 3 + 1] = color.g;
    col[i * 3 + 2] = color.b;

    size[i] = sizeMin + Math.pow(Math.random(), 1.8) * (sizeMax - sizeMin);
    phase[i] = Math.random() * Math.PI * 2;
    seed[i] = Math.random() * 1000;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: opts.map || SPARK },
      uTime: SHARED.time,
      uProj: SHARED.proj,
      uOpacity: { value: opts.opacity ?? 0.95 },
      uTwinkle: { value: opts.twinkle ?? 0.35 },
      uSolid: { value: opts.solid ? 1 : 0 }
    },
    vertexShader: [
      'precision highp float;',
      'attribute vec3 aColor;',
      'attribute float aSize, aPhase, aSeed;',
      'uniform float uTime, uProj, uTwinkle;',
      'varying vec3 vColor;',
      'varying float vTw;',
      'void main(){',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  float dist = max(0.5, -mv.z);',
      '  float tw = 0.5 + 0.5 * sin(uTime * (0.7 + fract(aSeed) * 1.5) + aPhase * 4.0);',
      '  vTw = mix(1.0, 0.35 + 1.15 * pow(tw, 2.0), uTwinkle);',
      '  vColor = aColor;',
      '  gl_PointSize = clamp(aSize * uProj / dist, 1.0, 60.0);',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D uMap;',
      'uniform float uOpacity, uSolid;',
      'varying vec3 vColor;',
      'varying float vTw;',
      'void main(){',
      '  float a = texture2D(uMap, gl_PointCoord).a;',
      '  if (a < 0.004) discard;',
      '  float core = pow(a, 1.5);',
      // 实心模式下纯度更高（像一颗颗彩色糖粒），光晕模式保留柔边
      '  vec3 col = mix(vColor * (0.75 + vTw * 0.85), vColor * (1.05 + vTw * 0.35), uSolid);',
      '  float alpha = mix((core * 0.7 + a * 0.3) * uOpacity * vTw, a * uOpacity * (0.55 + vTw * 0.55), uSolid);',
      '  gl_FragColor = vec4(col, alpha);',
      '}'
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/**
 * 大颗彩色圆点（主角层）：沿螺旋带 + 外围球壳
 */
function createColorDots(count) {
  const group = new THREE.Group();

  // 螺旋带：绕蛋糕往上盘
  const spiral = (n, sizeMin, sizeMax) => createDotLayer(n, sizeMin, sizeMax, DOT_PALETTE, {
    twinkle: 0.22,
    map: ROUND_DOT,
    solid: true,
    opacity: 0.62,
    genPos: () => {
      if (Math.random() < 0.5) {
        // 环绕带：贴蛋糕外围往上盘
        const t = Math.random();
        const a = t * Math.PI * 2.6 + (Math.random() - 0.5) * 0.6;
        const r = RADIUS * (1.12 + Math.random() * 0.68);
        return {
          x: Math.cos(a) * r,
          y: -HEIGHT * 0.42 + t * HEIGHT * 1.55 + (Math.random() - 0.5) * 0.26,
          z: Math.sin(a) * r
        };
      }
      // 外围散景壳
      const a = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const r = RADIUS * (1.15 + Math.pow(Math.random(), 0.7) * 1.15);
      return {
        x: Math.sin(ph) * Math.cos(a) * r,
        y: Math.cos(ph) * r * 1.05,
        z: Math.sin(ph) * Math.sin(a) * r
      };
    }
  });

  group.add(spiral(Math.round(count * 0.62), 0.045, 0.115));
  group.add(spiral(Math.round(count * 0.38), 0.024, 0.058));
  return group;
}

/** 五角星层：贴在蛋糕表面 + 四周漂浮 */
function createStars(count) {
  return createDotLayer(count, 0.055, 0.125, STAR_PALETTE, {
    map: STAR_DOT,
    solid: false,
    twinkle: 0.30,
    opacity: 0.92,
    genPos: () => {
      if (Math.random() < 0.62) {
        // 贴在蛋糕侧面
        const a = Math.random() * Math.PI * 2;
        const r = RADIUS * (1.01 + Math.random() * 0.02);
        return {
          x: Math.cos(a) * r,
          y: -HEIGHT * 0.42 + Math.random() * HEIGHT * 0.9,
          z: Math.sin(a) * r
        };
      }
      // 四周漂浮
      const a = Math.random() * Math.PI * 2;
      const r = RADIUS * (1.25 + Math.random() * 0.55);
      return {
        x: Math.cos(a) * r,
        y: -HEIGHT * 0.35 + Math.random() * HEIGHT * 1.7,
        z: Math.sin(a) * r * 0.85
      };
    }
  });
}

/** 蛋糕表面的细密糖粒（第二层，不要抢主角） */
function createSprinkles(count) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const color = new THREE.Color();
  const cool = ['#dff0ff', '#bcd8ff', '#ffffff', '#cfe0ff', '#9fe8ff'];
  const warm = ['#ffe6a8', '#ffc987', '#ffd7ec', '#e6c7ff'];

  for (let i = 0; i < count; i++) {
    const roll = Math.random();
    let x, y, z;
    if (roll < 0.62) {
      const a = Math.random() * Math.PI * 2;
      const r = RADIUS * (0.985 + Math.random() * 0.04);
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      y = -HEIGHT / 2 + Math.random() * HEIGHT;
    } else if (roll < 0.92) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * RADIUS * 0.9;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      y = HEIGHT / 2 + CREAM_H + Math.random() * 0.03;
    } else {
      const a = Math.random() * Math.PI * 2;
      const r = RADIUS * (0.3 + Math.random() * 0.65);
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      y = -HEIGHT / 2 + Math.random() * HEIGHT;
    }
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    const warmRoll = Math.random() < 0.26;
    color.set(warmRoll ? warm[(Math.random() * warm.length) | 0] : cool[(Math.random() * cool.length) | 0]);
    col[i * 3] = color.r;
    col[i * 3 + 1] = color.g;
    col[i * 3 + 2] = color.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.028,
    map: SPARK,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  }));
  pts.frustumCulled = false;
  return pts;
}

function makeNebulaTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,253,245,1)');
  g.addColorStop(0.14, 'rgba(220,240,255,.98)');
  g.addColorStop(0.34, 'rgba(140,200,255,.86)');
  g.addColorStop(0.56, 'rgba(80,120,255,.55)');
  g.addColorStop(0.78, 'rgba(50,50,140,.28)');
  g.addColorStop(1, 'rgba(20,18,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // 蓝白/金 星点
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.pow(Math.random(), 0.55) * size * 0.47;
    const x = size / 2 + Math.cos(a) * rr;
    const y = size / 2 + Math.sin(a) * rr;
    const gold = Math.random() < 0.2;
    ctx.fillStyle = gold
      ? 'rgba(255,210,140,' + (0.45 + Math.random() * 0.5) + ')'
      : 'rgba(255,255,255,' + (0.4 + Math.random() * 0.6) + ')';
    ctx.beginPath();
    ctx.arc(x, y, Math.random() * 2.4 + 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 侧面文字：用糖粒小球在蛋糕表面"拼"出来
 *
 * 为什么不做贴图：贴一张平面在表面，无论怎么摆都像"贴上去的"，
 * 而且顶面被烛光照亮时白字直接看不见。改成把文字采样成点，
 * 再用和糖粒同样的小球实例摆到圆柱侧面上 —— 它就是蛋糕表面的一部分，
 * 会随蛋糕旋转、被灯光照出明暗、和糖粒处在同一层质感里。
 */
function createSideText(text, RADIUS, HEIGHT) {
  const W = 1024;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  let fontSize = 150;
  ctx.font = 'bold ' + fontSize + 'px "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';
  const tw = ctx.measureText(text).width || 1;
  if (tw > W * 0.92) {
    fontSize = Math.floor(fontSize * (W * 0.92) / tw);
    ctx.font = 'bold ' + fontSize + 'px "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, W / 2, H / 2);

  const data = ctx.getImageData(0, 0, W, H).data;

  // 采样：步长越大点越少；点数控制在 1300 以内
  let step = 5;
  let samples = [];
  while (step <= 14) {
    samples = [];
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        if (data[(y * W + x) * 4 + 3] > 130) {
          samples.push(x / W, y / H);
        }
      }
    }
    if (samples.length / 2 <= 1300) break;
    step++;
  }

  const count = samples.length / 2;
  if (!count) return null;

  // 贴到圆柱侧面：正面 +Z 为中心
  // 关键：字高必须按"弧长 / 画布宽高比"算，否则字会被横向拉伸或纵向压扁
  const span = 1.5;                              // 横向跨约 86°
  const arcLen = span * RADIUS;                  // 弧长（世界单位）
  const heightSpan = (arcLen * H) / W;           // 保持画布 4:1 的比例
  const yy0 = 0.10;

  const geo = new THREE.SphereGeometry(0.0145, 6, 5);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    toneMapped: false
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m4 = new THREE.Matrix4();
  const q0 = new THREE.Quaternion();
  const v3 = new THREE.Vector3();
  const s3 = new THREE.Vector3(1, 1, 1);

  for (let i = 0; i < count; i++) {
    const u = samples[i * 2];
    const v = samples[i * 2 + 1];
    const ang = (u - 0.5) * span;
    const y = yy0 + (0.5 - v) * heightSpan;
    // 贴着蛋糕表面（体半径 1.18）：留一点点间隙避免与本体 z-fighting，
    // 但不能离太远，否则看起来像漂在表面外面
    const r = RADIUS * (1.004 + Math.random() * 0.008);
    v3.set(Math.sin(ang) * r, y, Math.cos(ang) * r);
    const s = 0.9 + Math.random() * 0.7;
    s3.set(s, s, s);
    m4.compose(v3, q0, s3);
    mesh.setMatrixAt(i, m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

function makeGlowTexture(color = '255,210,240') {  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(' + color + ',1)');
  g.addColorStop(0.28, 'rgba(' + color + ',.5)');
  g.addColorStop(1, 'rgba(' + color + ',0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const RING_DOT = SPARK;

/** 实心圆点贴图：参考图里的彩色糖粒是"实心圆 + 柔边"，不是光晕雾点 */
function makeRoundDot() {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const r = S / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.70, 'rgba(255,255,255,1)');
  g.addColorStop(0.86, 'rgba(255,255,255,0.82)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

const ROUND_DOT = makeRoundDot();

/** 五角星贴图（边缘带柔光） */
function makeStarTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.translate(S / 2, S / 2);
  const spikes = 5;
  const outer = S * 0.44;
  const inner = outer * 0.42;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(255,255,255,.95)';
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

const STAR_DOT = makeStarTexture();

/* ---------- 大星芒（用户提供的两种参考图：四角交叉星、八角放射星、锋利五角星） ---------- */
function makeSparkleTexture(kind) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const R = S * 0.46;
  ctx.translate(S / 2, S / 2);

  // 用渐变填充而不是纯白：中心亮、边缘淡，配合加法混合才有"光"的质感
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.92)');
  grad.addColorStop(0.72, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0.10)');
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgba(255,255,255,.85)';
  ctx.shadowBlur = S * 0.04;

  if (kind === 'eight') {
    // 八角放射星：内半径压到很小才是"放射光芒"，否则像海星
    const spikes = 8;
    const inner = R * 0.12;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? R : inner;
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'five') {
    // 锋利五角星
    const spikes = 5;
    const inner = R * 0.28;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? R : inner;
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    // 四角星芒：quadratic 控制点越靠近圆心，星芒越细长
    const k = kind === 'cross' ? 0.095 : 0.26;
    const q = R * k;
    ctx.beginPath();
    ctx.moveTo(0, -R);
    ctx.quadraticCurveTo(q, -q, R, 0);
    ctx.quadraticCurveTo(q, q, 0, R);
    ctx.quadraticCurveTo(-q, q, -R, 0);
    ctx.quadraticCurveTo(-q, -q, 0, -R);
    ctx.closePath();
    ctx.fill();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

const BIG_STAR_TEXTURES = ['cross', 'soft', 'eight', 'five'].map(makeSparkleTexture);
const BIG_STAR_COLORS = ['#ffffff', '#ffe9b0', '#cfe4ff', '#ffd7f3', '#e8f0ff'];

/**
 * 大星芒：撒几颗明显大于背景星点的"闪光"，缓慢自转 + 呼吸
 * Sprite 有 material.rotation，可以单独转，是画星芒最省事的方式
 */
function createBigStars(count) {
  const group = new THREE.Group();
  const items = [];

  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({
      map: BIG_STAR_TEXTURES[i % BIG_STAR_TEXTURES.length],
      color: BIG_STAR_COLORS[i % BIG_STAR_COLORS.length],
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.92
    });
    const sp = new THREE.Sprite(mat);

    // 分两档摆放：大部分在蛋糕上方，少量在两侧下方，
    // 避免星芒正好压在蛋糕体正面（Sprite 永远面向相机，贴在正面会像贴纸）
    const upper = i % 5 !== 0;
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
    const r = RADIUS * (upper ? 1.15 + Math.random() * 0.32 : 1.30 + Math.random() * 0.28);
    const y = upper
      ? 1.05 + Math.random() * 1.30
      : -1.05 + Math.random() * 1.05;
    // 再按屏幕可视范围钳一下 x，并且避开中轴（否则会正好压在蜡烛上）
    let px = Math.max(-1.55, Math.min(1.55, Math.cos(a) * r));
    if (Math.abs(px) < 0.58) px = px < 0 ? -0.58 : 0.58;
    sp.position.set(px, y, Math.sin(a) * r * 0.85);

    const s = 0.14 + Math.random() * 0.20;
    sp.scale.set(s, s, 1);
    sp.userData = { base: s, phase: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.9 };
    group.add(sp);
    items.push(sp);
  }

  group.userData.update = (t) => {
    for (const sp of items) {
      const u = sp.userData;
      const breath = 0.86 + 0.14 * Math.sin(t * 1.5 + u.phase);
      sp.scale.set(u.base * breath, u.base * breath, 1);
      sp.material.rotation = u.spin * t + u.phase;
      sp.material.opacity = 0.70 + 0.26 * (0.5 + 0.5 * Math.sin(t * 2.0 + u.phase * 1.7));
    }
  };

  return group;
}

/**
 * 立体光带：沿圆环铺一条有宽度的带子（顶点色控制亮度衰减）
 * 参考图里的星环是"光带"——有宽度、端部收细、能看出在空间里绕
 */
function makeLightRibbon(radius, width, colorA, colorB, y = 0) {
  const SEG = 400;
  const positions = [];
  const colors = [];
  const indices = [];
  const cA = new THREE.Color(colorA);
  const cB = new THREE.Color(colorB);
  const tmp = new THREE.Color();

  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const a = t * Math.PI * 2;
    // 宽度沿线起伏：有点像丝带在空间里翻卷
    const w = width * (0.34 + 0.66 * Math.abs(Math.sin(a * 1.5 + 0.6)));
    const nx = Math.cos(a);
    const nz = Math.sin(a);

    positions.push(nx * (radius - w), y, nz * (radius - w));
    positions.push(nx * (radius + w), y, nz * (radius + w));

    // 亮度：靠内更亮，端部渐隐（加法混合下亮度=可见度）
    tmp.copy(cA).lerp(cB, 0.5 + 0.5 * Math.sin(a * 2.0));
    const fade = 0.30 + 0.70 * Math.abs(Math.sin(a * 1.0 + 0.4));
    colors.push(tmp.r * 0.55 * fade, tmp.g * 0.55 * fade, tmp.b * 0.55 * fade);
    colors.push(tmp.r * fade, tmp.g * fade, tmp.b * fade);

    if (i < SEG) {
      const b = i * 2;
      indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);

  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.60,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  }));
  mesh.frustumCulled = false;
  return mesh;
}

export function createCake() {
  const group = new THREE.Group();

  const base = makeBaseTexture();
  base.repeat.set(2, 1);

  const sideMat = new THREE.MeshStandardMaterial({
    map: base,
    emissiveMap: base,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.72,
    roughness: 0.42,
    metalness: 0.05
  });

  // 顶面：深蓝星云（不是白奶油盖）
  const topTex = makeTopFaceTexture();
  const topFaceMat = new THREE.MeshStandardMaterial({
    map: topTex,
    emissiveMap: topTex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 1.05,
    roughness: 0.46,
    metalness: 0.05
  });

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(RADIUS, RADIUS * 0.985, HEIGHT, 96, 1, false),
    [sideMat, topFaceMat, new THREE.MeshStandardMaterial({ color: 0x06040f, roughness: 0.95 })]
  );
  body.castShadow = true;
  group.add(body);

  // 星云叠加层：贴在侧面的加法发光，让蛋糕像"彩色星云"而不是一块深蓝
  const cloudOverlay = new THREE.Mesh(
    new THREE.CylinderGeometry(RADIUS * 1.004, RADIUS * 0.992, HEIGHT * 0.998, 96, 1, true),
    new THREE.MeshBasicMaterial({
      map: makeCloudTexture(),
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide
    })
  );
  group.add(cloudOverlay);

  const mobile = typeof matchMedia === 'function' && matchMedia('(max-width: 820px)').matches;

  // 表面细密糖粒
  group.add(createSprinkles(mobile ? 4200 : 7200));

  /* ---------- 顶面：厚而不规则的流动奶油（参考图里是一整层厚奶油 + 金色焦糖） ---------- */
  // 蜡烛位置要先生成：下面的焦糖、蜡池、文字都依赖它
  const candleX = -0.13;
  const creamMat = new THREE.MeshStandardMaterial({
    // 不要纯白：纯白 + 聚光 + 光晕会直接过曝成一坨，奶白偏暖才有油画质地
    color: 0xfff2e2,
    roughness: 0.30,
    metalness: 0.02,
    emissive: new THREE.Color(0xffd6ac),
    emissiveIntensity: 0.18,
    transparent: true,
    opacity: 0.95
  });

  // 几块大扁球叠出"流动的奶油面"：主块盖满顶面，副块只做起伏，避免出现同心圆感
  [
    { x: 0.00, z: 0.00, r: 0.95, sy: 0.080, y: -0.040 },
    { x: 0.30, z: 0.18, r: 0.60, sy: 0.070, y: -0.018 },
    { x: -0.28, z: -0.30, r: 0.56, sy: 0.060, y: -0.022 }
  ].forEach(b => {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(b.r, 28, 18), creamMat);
    blob.position.set(b.x, HEIGHT / 2 + b.y, b.z);
    blob.scale.set(1, b.sy, 1);
    group.add(blob);
  });

  // 金色焦糖：用贴面光斑而不是实心球，才像"被烛光照亮的奶油"而不是一块铜片
  const caramel = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 40),
    new THREE.MeshBasicMaterial({
      map: makeGlowTexture('255,198,124'),
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  caramel.rotation.x = -Math.PI / 2;
  caramel.position.set(candleX * 0.5, HEIGHT / 2 + 0.062, 0.04);
  group.add(caramel);

  // 淋面侧壁：贴着顶面边缘的一圈薄壁，顶沿高低起伏
  const icingGeo = new THREE.CylinderGeometry(RADIUS * 1.010, RADIUS * 1.020, 0.075, 128, 1, true);
  {
    const pa = icingGeo.attributes.position;
    const vv = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) {
      vv.fromBufferAttribute(pa, i);
      if (vv.y > 0) {
        const a = Math.atan2(vv.z, vv.x);
        const h = Math.sin(a * 6.0) * 0.016
          + Math.sin(a * 13.0 + 1.7) * 0.010
          + Math.sin(a * 23.0 + 0.4) * 0.006;
        pa.setY(i, vv.y + h);
      }
    }
    pa.needsUpdate = true;
    icingGeo.computeVertexNormals();
  }
  const icing = new THREE.Mesh(icingGeo, creamMat);
  icing.position.y = HEIGHT / 2 - 0.035;
  icing.castShadow = true;
  group.add(icing);

  // 淋面滴落
  const dripCount = mobile ? 9 : 12;
  const dripGeo = new THREE.SphereGeometry(0.026, 8, 8);
  for (let i = 0; i < dripCount; i++) {
    const a = (i / dripCount) * Math.PI * 2 + Math.random() * 0.5;
    const len = 0.05 + Math.random() * 0.14;
    const drip = new THREE.Mesh(dripGeo, creamMat);
    drip.position.set(
      Math.cos(a) * RADIUS * 1.012,
      HEIGHT / 2 - 0.035 - len * 0.5,
      Math.sin(a) * RADIUS * 1.012
    );
    drip.scale.set(1, 1 + len * 7, 1);
    group.add(drip);
  }

  // 顶面发光星云
  const nebula = new THREE.Mesh(
    new THREE.CircleGeometry(RADIUS * 0.92, 64),
    new THREE.MeshBasicMaterial({
      map: makeNebulaTexture(),
      transparent: true,
      depthWrite: false
    })
  );
  nebula.rotation.x = -Math.PI / 2;
  nebula.position.y = HEIGHT / 2 + CREAM_H + 0.008;
  group.add(nebula);

  const topGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('200,225,255'),
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  topGlow.scale.set(1.45, 1.45, 1);
  topGlow.position.y = HEIGHT / 2 + CREAM_H + 0.04;
  group.add(topGlow);

  /* ---------- 粉紫蜡烛 + 高火苗 ---------- */
  const candleH = 0.60;
  // 蜡烛：光滑浅紫（参考图里是光滑的淡紫柱，没有螺旋纹）
  const candle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.023, 0.026, candleH, 20),
    new THREE.MeshStandardMaterial({
      color: 0xdfaeea,
      roughness: 0.30,
      metalness: 0.02,
      emissive: new THREE.Color(0x7a4a90),
      emissiveIntensity: 0.28
    })
  );
  candle.position.set(candleX, HEIGHT / 2 + CREAM_H + candleH / 2, 0.02);
  group.add(candle);

  // 蜡油池：蜡烛底部融在奶油上的那一圈
  const waxMat = new THREE.MeshStandardMaterial({
    color: 0xffe6f3,
    roughness: 0.28,
    emissive: new THREE.Color(0xffb8dc),
    emissiveIntensity: 0.42
  });
  const waxPool = new THREE.Mesh(new THREE.CircleGeometry(0.072, 32), waxMat);
  waxPool.rotation.x = -Math.PI / 2;
  waxPool.position.set(candleX, HEIGHT / 2 + CREAM_H + 0.004, 0.02);
  group.add(waxPool);

  const candleTop = HEIGHT / 2 + CREAM_H + candleH;

  // 顶端融化的蜡珠
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.random() * 0.7;
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(0.011 + Math.random() * 0.007, 8, 8),
      waxMat
    );
    bead.position.set(
      candleX + Math.cos(a) * 0.020,
      candleTop - 0.010 + Math.random() * 0.012,
      0.02 + Math.sin(a) * 0.020
    );
    group.add(bead);
  }
  const wick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0035, 0.0035, 0.04, 6),
    new THREE.MeshBasicMaterial({ color: 0x2a1a22 })
  );
  wick.position.set(candleX, candleTop + 0.018, 0.02);
  group.add(wick);

  const tipY = candleTop + 0.055;

  const flame = new THREE.Group();
  flame.position.set(candleX, tipY, 0.02);

  // 白热核（短而饱满，不是细针）
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.026, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfffef0 })
  );
  core.scale.set(1, 3.8, 1);
  core.position.y = 0.11;
  flame.add(core);

  // 橙黄外焰（宽，包住白核）
  const outer = new THREE.Mesh(
    new THREE.SphereGeometry(0.060, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffa83c,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  outer.scale.set(1, 3.2, 1);
  outer.position.y = 0.13;
  flame.add(outer);

  // 顶部细焰尖
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.018, 0.20, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffd07a,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  tip.position.y = 0.34;
  flame.add(tip);

  // 焰心下方的一点点蓝
  const blueRoot = new THREE.Mesh(
    new THREE.SphereGeometry(0.020, 12, 12),
    new THREE.MeshBasicMaterial({
      color: 0x6fb4ff,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  blueRoot.scale.set(1, 1.4, 1);
  blueRoot.position.y = 0.01;
  flame.add(blueRoot);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('255,170,90'),
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  halo.scale.set(0.80, 1.85, 1);
  halo.position.y = 0.20;
  flame.add(halo);

  // 火苗照在奶油上的那一小圈暖光（参考图里奶油中心是金色焦糖感）
  const candleGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('255,196,120'),
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  candleGlow.scale.set(0.62, 0.62, 1);
  candleGlow.position.set(candleX, HEIGHT / 2 + CREAM_H + 0.03, 0.02);
  group.add(candleGlow);

  group.add(flame);

  // 火光在空气里的散射：参考图上火焰外那一大团柔和暖光 —— 这才是"朦胧感"的来源
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('255,186,112'),
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  aura.scale.set(2.7, 2.7, 1);
  aura.position.set(candleX, tipY + 0.16, 0.02);
  group.add(aura);

  const flameLight = new THREE.PointLight(0xffa451, 5.5, 7, 2);
  flameLight.position.set(candleX, tipY + 0.2, 0.12);
  group.add(flameLight);

  /* ---------- 白色大托盘（金属反射 + 接收阴影） ---------- */
  const plateMat = new THREE.MeshPhysicalMaterial({
    color: 0xf7f4ff,
    roughness: 0.10,
    metalness: 0.90,
    envMapIntensity: 1.45,
    clearcoat: 0.65,
    clearcoatRoughness: 0.08,
    emissive: new THREE.Color(0x2a2a55),
    emissiveIntensity: 0.28
  });
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(RADIUS * 1.34, RADIUS * 1.40, 0.045, 96),
    plateMat
  );
  plate.position.y = -HEIGHT / 2 - 0.03;
  plate.receiveShadow = true;
  group.add(plate);

  // 接触阴影：蛋糕压在托盘上的那圈暗影（明暗关系的关键，不依赖 shadowMap 也成立）
  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(RADIUS * 1.10, 64),
    new THREE.MeshBasicMaterial({
      map: makeGlowTexture('0,0,0'),
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.NormalBlending
    })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -HEIGHT / 2 + 0.004;
  group.add(contact);

  const plateRim = new THREE.Mesh(
    new THREE.TorusGeometry(RADIUS * 1.395, 0.006, 6, 160),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  plateRim.rotation.x = Math.PI / 2;
  plateRim.position.y = -HEIGHT / 2 - 0.012;
  group.add(plateRim);

  /* ---------- 环绕光带：4 条倾斜发光环（参考图的立体环绕感） ----------
     环倾斜 θ 后：最小水平半径 = R*cos(θ)，最高点 = R*sin(θ)。
     要"绕到蛋糕顶面上方"又"不穿进蛋糕"，两个条件同时满足：
       R*cos(θ) > 蛋糕外沿(≈1.21) 且 R*sin(θ) > 顶面高度(≈0.83)
     所以 R 取 1.50 上下、θ 取 0.6 左右 —— 这是唯一能贴着绕过去的角度组合 */
  const bandA = makeOrbitBand({
    radius: 1.50, width: 0.110, speed: 0.34, opacity: 0.95,
    colorA: '#ffffff', colorB: '#a8d4ff'
  });
  bandA.rotation.set(0.60, 0, 0.14);
  group.add(bandA);

  const bandB = makeOrbitBand({
    radius: 1.68, width: 0.090, speed: -0.28, opacity: 0.82,
    colorA: '#fff4dd', colorB: '#c9a7ff'
  });
  bandB.rotation.set(-0.52, 0.18, -0.16);
  group.add(bandB);

  // 第三条与前两条交叉，形成"漩涡"的交织感
  const bandD = makeOrbitBand({
    radius: 1.60, width: 0.075, speed: 0.45, opacity: 0.72,
    colorA: '#eaf3ff', colorB: '#8fa8ff'
  });
  bandD.rotation.set(0.68, 0, -0.22);
  group.add(bandD);

  // 第四条贴着蜡烛绕（参考图里蜡烛周围就有一个小环）
  const bandC = makeOrbitBand({
    radius: 0.60, width: 0.040, speed: 0.55, opacity: 0.88,
    colorA: '#ffffff', colorB: '#cfe4ff'
  });
  bandC.position.set(candleX, candleTop + 0.10, 0.02);
  bandC.rotation.set(0.28, 0, 0.10);
  group.add(bandC);

  // 保留细星点环（作为光带上的碎光）
  const sparkRing = new THREE.Points(
    (() => {
      const n = 620;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const cc = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 1.46 + (Math.random() - 0.5) * 0.26;
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 0.14;
        pos[i * 3 + 2] = Math.sin(a) * r;
        cc.set(DOT_PALETTE[(Math.random() * DOT_PALETTE.length) | 0]);
        col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    })(),
    new THREE.PointsMaterial({
      size: 0.05,
      map: RING_DOT,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  sparkRing.rotation.set(0.40, 0, 0.12);
  sparkRing.userData.speed = 0.26;
  sparkRing.frustumCulled = false;
  group.add(sparkRing);

  /* ---------- 彩色圆点主角层 + 漂浮星尘 + 顶面喷发 ---------- */
  const colorDots = createColorDots(mobile ? 1000 : 1200);
  group.add(colorDots);

  // 五角星（参考图里很显眼的一层）
  group.add(createStars(mobile ? 16 : 24));

  // 大星芒：几颗明显的"闪光"，作为视觉焦点
  const bigStars = createBigStars(mobile ? 10 : 15);
  group.add(bigStars);

  const dust = createFloatingDust(RADIUS, HEIGHT + CREAM_H, mobile ? 220 : 340);
  group.add(dust);

  // 侧面文字：吹灭蜡烛后浮现（文案来自 config.cakeText）
  const cfgRef = (typeof window !== 'undefined' && window.BIRTHDAY_CONFIG) || {};
  const cakeTextStr = cfgRef.cakeText || '';
  let cakeTextMesh = null;
  if (cakeTextStr) {
    cakeTextMesh = createSideText(cakeTextStr, RADIUS, HEIGHT);
    if (cakeTextMesh) group.add(cakeTextMesh);
  }

  const floorGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('150,130,255'),
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  floorGlow.scale.set(5.4, 5.4, 1);
  floorGlow.position.y = -0.72;
  group.add(floorGlow);

  group.userData = {
    ringA: bandA, ringB: bandB, ringC: bandC, ringD: bandD,
    dust, flame, flameLight, nebula, colorDots, bigStars,
    cakeTextMesh,
    flameX: candleX,
    candleTip: new THREE.Vector3(candleX, tipY, 0.02)
  };
  return group;
}

/**
 * 漂浮星尘 + 顶面向上的喷发柱
 */
function createFloatingDust(RADIUS, HEIGHT, count) {
  const wrap = new THREE.Group();

  const pos = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  const palette = ['#dceaff', '#9fe8ff', '#ffd7ec', '#e6c7ff', '#ffe6a8', '#ffffff'];

  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = RADIUS * (1.05 + Math.random() * 1.5);
    const y = -HEIGHT / 2 + (Math.random() - 0.2) * HEIGHT * 2.0;
    base[i * 3] = Math.cos(a) * r;
    base[i * 3 + 1] = y;
    base[i * 3 + 2] = Math.sin(a) * r;
    pos[i * 3] = base[i * 3];
    pos[i * 3 + 1] = base[i * 3 + 1];
    pos[i * 3 + 2] = base[i * 3 + 2];
    seeds[i] = Math.random() * 6.28;
    c.set(palette[(Math.random() * palette.length) | 0]);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.048,
    map: RING_DOT,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  pts.frustumCulled = false;
  wrap.add(pts);

  // 顶面喷发
  const en = 240;
  const ePos = new Float32Array(en * 3);
  const eSeed = new Float32Array(en);
  const ePhase = new Float32Array(en);
  const eSize = new Float32Array(en);

  for (let i = 0; i < en; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.pow(Math.random(), 0.6) * RADIUS * 0.8;
    ePos[i * 3] = Math.cos(a) * rr;
    ePos[i * 3 + 1] = HEIGHT / 2 + 0.02;
    ePos[i * 3 + 2] = Math.sin(a) * rr;
    eSeed[i] = Math.random();
    ePhase[i] = Math.random();
    eSize[i] = 0.012 + Math.random() * 0.032;
  }

  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  eGeo.setAttribute('aSeed', new THREE.BufferAttribute(eSeed, 1));
  eGeo.setAttribute('aPhase', new THREE.BufferAttribute(ePhase, 1));
  eGeo.setAttribute('aSize', new THREE.BufferAttribute(eSize, 1));

  const eMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: SPARK },
      uTime: SHARED.time,
      uProj: SHARED.proj,
      uOpacity: { value: 0.9 }
    },
    vertexShader: [
      'precision highp float;',
      'attribute float aSeed, aPhase, aSize;',
      'uniform float uTime, uProj;',
      'varying float vA;',
      'void main(){',
      '  float speed = 0.10 + fract(aSeed) * 0.13;',
      '  float life = fract(uTime * speed + aPhase);',
      '  vec3 p = position;',
      '  p.y += life * (0.70 + fract(aSeed * 7.3) * 1.10);',
      '  p.xz *= 1.0 + life * 0.55;',
      '  p.x += sin(uTime * 0.8 + aPhase * 6.28) * 0.05 * life;',
      '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
      '  float dist = max(0.5, -mv.z);',
      '  vA = (1.0 - life) * smoothstep(0.0, 0.10, life);',
      '  gl_PointSize = clamp(aSize * uProj / dist, 1.0, 22.0);',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D uMap;',
      'uniform float uOpacity;',
      'varying float vA;',
      'void main(){',
      '  float a = texture2D(uMap, gl_PointCoord).a;',
      '  if (a < 0.004) discard;',
      '  gl_FragColor = vec4(vec3(0.86, 0.93, 1.0) * 1.2, pow(a, 1.4) * vA * uOpacity);',
      '}'
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const ePts = new THREE.Points(eGeo, eMat);
  ePts.frustumCulled = false;
  wrap.add(ePts);

  wrap.update = (t) => {
    const arr = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      arr[i * 3] = base[i * 3] + Math.sin(t * 0.55 + s) * 0.22;
      arr[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.8 + s * 1.3) * 0.26;
      arr[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.6 + s * 0.8) * 0.22;
    }
    geo.attributes.position.needsUpdate = true;
  };

  return wrap;
}
