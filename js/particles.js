/**
 * 粒子系统 v2
 *
 * 改造目标：去掉"卡通圆点"感
 *   旧版：单层径向渐变贴图 + 高饱和纯色 + 尺寸统一 + CPU 每帧改 position
 *   新版：核心/外晕双层衰减 + 低饱和高明度色 + 逐粒子尺寸与闪烁差异
 *         + 距离景深 + 环绕流光 + 全部在 GPU 里算（CPU 零逐帧写 position）
 *
 * 对外导出保持兼容（createConfetti / createStarfield / createAssemble /
 * createNebulaField / createGalaxyBand / Smoke / Fireworks），
 * 并新增 createSparkField / createOrbitStreams。
 */
import * as THREE from '../vendor/three.module.min.js';

/* ============================================================
 * 共享 uniform：全场只更新一次 time / proj，省去逐材质赋值
 * ============================================================ */
export const SHARED = {
  time: { value: 0 },
  // 投影系数 = drawingBufferHeight / (2 * tan(fov/2))，由 app.js 在 resize 时写入
  proj: { value: 800 }
};

export function setSparkTime(t) {
  SHARED.time.value = t;
}

export function setSparkProjection(v) {
  if (v > 0) SHARED.proj.value = v;
}

/* ============================================================
 * 光点贴图：亮核 + 柔和外晕（关键——这一张图决定了"像光"还是"像圆点"）
 * ============================================================ */
function makeSparkTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const r = S / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0.00, 'rgba(255,255,255,1)');
  g.addColorStop(0.06, 'rgba(255,255,255,0.94)');
  g.addColorStop(0.13, 'rgba(255,246,253,0.52)');
  g.addColorStop(0.26, 'rgba(255,224,246,0.20)');
  g.addColorStop(0.45, 'rgba(232,206,255,0.075)');
  g.addColorStop(0.68, 'rgba(206,182,255,0.022)');
  g.addColorStop(1.00, 'rgba(190,165,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

export const SPARK = makeSparkTexture();
const DOT = SPARK; // 兼容旧名（Smoke / Fireworks 用）

/* ============================================================
 * 公共 GLSL
 * ============================================================ */
const VERT_HEAD = [
  'precision highp float;',
  'attribute vec3 aColor;',
  'attribute float aSize;',
  'attribute float aPhase;',
  'attribute float aSeed;',
  'uniform float uDrift;',
  'uniform float uTwinkleRate;',
  'uniform vec3 uCenterOffset;',
  'varying vec3 vColor;',
  'varying float vTw;',
  'varying float vFade;'
].join('\n');

const VERT_TAIL = [
  'void main(){',
  '  vec3 p = position;',
  // 缓慢三维漂移：一层大振幅 + 一层小振幅，避免所有粒子同步摆动
  '  p.x += sin(uTime * 0.19 + aPhase) * uDrift;',
  '  p.y += sin(uTime * 0.15 + aPhase * 1.7) * uDrift * 1.15;',
  '  p.z += cos(uTime * 0.17 + aPhase * 1.31) * uDrift;',
  '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
  '  float dist = max(0.55, -mv.z);',
  // 逐粒子独立闪烁，指数放大对比：大多数时候偏暗，偶尔闪亮
  '  float tw = 0.5 + 0.5 * sin(uTime * uTwinkleRate * (0.55 + fract(aSeed) * 1.75) + aPhase * 5.0);',
  '  vTw = pow(tw, 2.2);',
  '  vColor = aColor;',
  // 距离景深：远处的星点更暗，近处更实，形成层次而不是一片均匀噪点
  '  vFade = clamp(1.0 - (dist - 5.0) / 30.0, 0.12, 1.0);',
  '  gl_PointSize = clamp(aSize * uProj / dist, 1.0, 30.0);',
  '  gl_Position = projectionMatrix * mv;',
  '}'
].join('\n');

const FRAG = [
  'precision highp float;',
  'uniform sampler2D uMap;',
  'uniform float uOpacity;',
  'varying vec3 vColor;',
  'varying float vTw;',
  'varying float vFade;',
  'void main(){',
  '  vec4 tex = texture2D(uMap, gl_PointCoord);',
  '  float a = tex.a;',
  '  if (a < 0.003) discard;',
  // 核心用更高次幂压出来，边缘交给原图衰减 —— 这样才是"发光点"而不是"糊团"
  '  float core = pow(a, 1.65);',
  '  float alpha = (core * 0.62 + a * 0.38) * uOpacity * vFade * (0.26 + vTw * 0.94);',
  '  if (alpha < 0.0015) discard;',
  '  gl_FragColor = vec4(vColor * (0.70 + vTw * 1.10), alpha);',
  '}'
].join('\n');

function makeSparkMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: SPARK },
      uOpacity: { value: 1 },
      uTime: SHARED.time,
      uProj: SHARED.proj,
      uDrift: { value: 0.1 },
      uTwinkleRate: { value: 1.0 },
      uCenterOffset: { value: new THREE.Vector3(0, 0, 0) }
    },
    vertexShader: VERT_HEAD + '\nuniform float uTime, uProj;\n' + VERT_TAIL,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending
  });
}

function bindOpacity(pts, mat) {
  pts.userData.setOpacity = v => { mat.uniforms.uOpacity.value = v; };
  pts.userData.setOpacity(mat.uniforms.uOpacity.value);
  return pts;
}

/* ============================================================
 * 星尘场：替换原来的 confetti / starfield
 *
 * 颜色策略（这是"不卡通"的另一半）：62% 极低饱和的暖白/冷白，
 * 其余才是低饱和彩色点缀；明度压在 0.70~0.98，配合 additive 才有通透感，
 * 而不是一片高饱和糖果色。
 * ============================================================ */
export function createSparkField(opts = {}) {
  const o = Object.assign({
    count: 6000,
    rMin: 2.4,
    rMax: 20,
    yScale: 0.9,
    zOffset: -1.5,
    sizeMin: 0.010,
    sizeMax: 0.042,
    drift: 0.10,
    twinkleRate: 0.9,
    opacity: 0.95,
    colorMix: 0.38
  }, opts);

  const n = o.count;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const phase = new Float32Array(n);
  const seed = new Float32Array(n);

  const hues = [0.925, 0.955, 0.075, 0.105, 0.505, 0.545, 0.755, 0.795];
  const c = new THREE.Color();

  for (let i = 0; i < n; i++) {
    const r = o.rMin + Math.pow(Math.random(), 0.62) * (o.rMax - o.rMin);
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
    pos[i * 3 + 1] = Math.cos(ph) * r * o.yScale;
    pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r * 0.82 + o.zOffset;

    const tinted = Math.random() < o.colorMix;
    const h = hues[(Math.random() * hues.length) | 0] + (Math.random() - 0.5) * 0.05;
    const s = tinted ? 0.22 + Math.random() * 0.34 : 0.02 + Math.random() * 0.11;
    const l = (tinted ? 0.74 : 0.84) + Math.random() * 0.16;
    c.setHSL((h + 1) % 1, s, Math.min(0.98, l));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;

    // 尺寸分布偏小：大量 1px 级微尘 + 少量稍大的亮星，层次靠这个撑
    size[i] = o.sizeMin + Math.pow(Math.random(), 2.4) * (o.sizeMax - o.sizeMin);
    phase[i] = Math.random() * Math.PI * 2;
    seed[i] = Math.random() * 1000;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

  const mat = makeSparkMaterial();
  mat.uniforms.uDrift.value = o.drift;
  mat.uniforms.uTwinkleRate.value = o.twinkleRate;

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return bindOpacity(pts, mat);
}

/* ============================================================
 * 环绕流光：3 条倾斜轨道上流动的光点带
 * 这是"惊艳"的主要来源 —— 静点再多也不如一条会跑的光流
 * ============================================================ */
export function createOrbitStreams(opts = {}) {
  const o = Object.assign({
    orbits: 3,
    perOrbit: 900,
    rBase: 1.92,
    rStep: 0.46,
    opacity: 0,
    colorA: '#ff9ecb',
    colorB: '#ffd9a0',
    colorC: '#9fe0ff'
  }, opts);

  const n = o.orbits * o.perOrbit;
  const pos = new Float32Array(n * 3);
  const orbit = new Float32Array(n);
  const tSeed = new Float32Array(n);
  const size = new Float32Array(n);
  const phase = new Float32Array(n);
  const seed = new Float32Array(n);

  let i = 0;
  for (let ob = 0; ob < o.orbits; ob++) {
    for (let k = 0; k < o.perOrbit; k++, i++) {
      orbit[i] = ob;
      tSeed[i] = k / o.perOrbit + (Math.random() - 0.5) * 0.004;
      // 沿轨道轻微散开，形成"带"而不是"线"
      pos[i * 3] = (Math.random() - 0.5) * 0.22;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.16;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.22;
      size[i] = 0.011 + Math.pow(Math.random(), 2.0) * 0.028;
      phase[i] = Math.random() * Math.PI * 2;
      seed[i] = Math.random() * 1000;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aOrbit', new THREE.BufferAttribute(orbit, 1));
  geo.setAttribute('aT', new THREE.BufferAttribute(tSeed, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: SPARK },
      uOpacity: { value: o.opacity },
      uTime: SHARED.time,
      uProj: SHARED.proj,
      uRBase: { value: o.rBase },
      uRStep: { value: o.rStep },
      uColorA: { value: new THREE.Color(o.colorA) },
      uColorB: { value: new THREE.Color(o.colorB) },
      uColorC: { value: new THREE.Color(o.colorC) }
    },
    vertexShader: [
      'precision highp float;',
      'attribute float aOrbit, aT, aSize, aPhase, aSeed;',
      'uniform float uTime, uProj, uRBase, uRStep;',
      'uniform vec3 uColorA, uColorB, uColorC;',
      'varying vec3 vColor;',
      'varying float vTw;',
      'varying float vFade;',
      'void main(){',
      '  float ob = aOrbit;',
      '  float rad = uRBase + ob * uRStep + position.x;',
      '  float speed = 0.38 + ob * 0.13;',
      '  float ang = aT * 6.2831853 + uTime * speed;',
      // 倾斜轨道：每条倾斜角不同，交叠出立体感
      '  float tiltA = (ob - 1.0) * 0.46;',
      '  float y = position.y + sin(ang * 1.0 + ob * 1.7) * 0.42;',
      '  float z = sin(ang) * rad + position.z;',
      '  float x = cos(ang) * rad + position.z * 0.6;',
      '  float cy = cos(tiltA), sy = sin(tiltA);',
      '  float y2 = y * cy - z * sy;',
      '  float z2 = y * sy + z * cy;',
      '  vec4 mv = modelViewMatrix * vec4(x, y2, z2, 1.0);',
      '  float dist = max(0.55, -mv.z);',
      // 沿轨道跑动的亮斑：让整条带子"活"起来
      '  float flow = pow(0.5 + 0.5 * sin(ang * 2.0 - uTime * 1.15 + ob * 2.1), 5.0);',
      '  float tw = 0.5 + 0.5 * sin(uTime * (0.8 + fract(aSeed) * 1.4) + aPhase * 4.0);',
      '  vTw = (0.22 + flow * 1.25) * (0.55 + pow(tw, 2.0) * 0.85);',
      '  vColor = mix(mix(uColorA, uColorB, 0.5 + 0.5 * sin(ang + ob * 2.0)), uColorC, flow * 0.45);',
      '  vFade = clamp(1.0 - (dist - 6.0) / 26.0, 0.28, 1.0);',
      '  gl_PointSize = clamp(aSize * (1.0 + flow * 0.85) * uProj / dist, 1.0, 26.0);',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.speedBase = 1;
  return bindOpacity(pts, mat);
}

/* ============================================================
 * 兼容旧接口
 * ============================================================ */
export function createConfetti(count = 900, spread = 16) {
  return createSparkField({
    count,
    rMin: 2.2,
    rMax: 2.2 + spread,
    yScale: 0.85,
    zOffset: -1.5,
    sizeMin: 0.008,
    sizeMax: 0.030,
    drift: 0.11,
    twinkleRate: 0.85
  });
}

export function createStarfield(count = 1200) {
  return createSparkField({
    count,
    rMin: 14,
    rMax: 38,
    yScale: 0.8,
    zOffset: -8,
    sizeMin: 0.030,
    sizeMax: 0.085,
    drift: 0.04,
    twinkleRate: 0.55,
    colorMix: 0.22
  });
}

/* ============================================================
 * 吹灭蜡烛后的一缕烟
 * ============================================================ */
export class Smoke {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  puff(origin) {
    const count = 26;
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = origin.x + (Math.random() - 0.5) * 0.05;
      pos[i * 3 + 1] = origin.y;
      pos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.05;
      vel[i * 3] = (Math.random() - 0.5) * 0.25;
      vel[i * 3 + 1] = 0.35 + Math.random() * 0.5;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.16,
      map: DOT,
      color: 0xcfc6da,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.items.push({ pts, vel, life: 0, ttl: 2.2 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life += dt;
      const arr = it.pts.geometry.attributes.position.array;
      for (let j = 0; j < arr.length; j += 3) {
        arr[j] += it.vel[j] * dt;
        arr[j + 1] += it.vel[j + 1] * dt;
        arr[j + 2] += it.vel[j + 2] * dt;
        it.vel[j] *= 1.01;
      }
      it.pts.geometry.attributes.position.needsUpdate = true;
      it.pts.material.opacity = Math.max(0, 0.55 * (1 - it.life / it.ttl));
      if (it.life >= it.ttl) {
        this.scene.remove(it.pts);
        it.pts.geometry.dispose();
        it.pts.material.dispose();
        this.items.splice(i, 1);
      }
    }
  }
}

/* ============================================================
 * 烟花爆发
 * ============================================================ */
export class Fireworks {
  constructor(scene) {
    this.scene = scene;
    this.bursts = [];
  }

  burst(origin, opts = {}) {
    const count = opts.count || 110;
    const color = new THREE.Color(opts.color || 0xff9ad2);
    const power = opts.power || 1;
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = origin.x;
      pos[i * 3 + 1] = origin.y;
      pos[i * 3 + 2] = origin.z;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const sp = (1.4 + Math.random() * 3.2) * power;
      vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
      vel[i * 3 + 1] = Math.cos(ph) * sp + 0.9;
      vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: opts.size || 0.12,
      map: DOT,
      color,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.bursts.push({ pts, vel, life: 0, ttl: opts.ttl || 2.0 });
  }

  update(dt) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life += dt;
      const arr = b.pts.geometry.attributes.position.array;
      for (let j = 0; j < arr.length; j += 3) {
        b.vel[j + 1] -= 1.7 * dt;
        b.vel[j] *= 0.985;
        b.vel[j + 1] *= 0.99;
        b.vel[j + 2] *= 0.985;
        arr[j] += b.vel[j] * dt;
        arr[j + 1] += b.vel[j + 1] * dt;
        arr[j + 2] += b.vel[j + 2] * dt;
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, 1 - b.life / b.ttl);
      if (b.life >= b.ttl) {
        this.scene.remove(b.pts);
        b.pts.geometry.dispose();
        b.pts.material.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }
}

/* ============================================================
 * 蛋糕登场：星海 → 螺旋汇聚 → 贴合蛋糕表面
 * 升级：粒子更多、沿螺旋带拖尾、落位瞬间提亮
 * ============================================================ */
export function createAssemble(RADIUS, HEIGHT, count = 900) {
  const startAngle = new Float32Array(count);
  const startRadius = new Float32Array(count);
  const startY = new Float32Array(count);
  const targetAngle = new Float32Array(count);
  const targetRadius = new Float32Array(count);
  const targetY = new Float32Array(count);
  const spinBias = new Float32Array(count);
  const bright = new Float32Array(count);

  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  const hues = [0.925, 0.955, 0.075, 0.105, 0.505, 0.755];

  for (let i = 0; i < count; i++) {
    startAngle[i] = Math.random() * Math.PI * 2;
    startRadius[i] = 2.2 + Math.pow(Math.random(), 0.7) * 6.4;
    startY[i] = (Math.random() - 0.5) * 8.4;

    targetAngle[i] = Math.random() * Math.PI * 2;
    targetRadius[i] = RADIUS * (0.98 + Math.random() * 0.06);
    targetY[i] = -HEIGHT / 2 + Math.random() * HEIGHT;

    spinBias[i] = 0.75 + Math.random() * 0.85;
    bright[i] = 0.55 + Math.random() * 0.45;

    pos[i * 3] = Math.cos(startAngle[i]) * startRadius[i];
    pos[i * 3 + 1] = startY[i];
    pos[i * 3 + 2] = Math.sin(startAngle[i]) * startRadius[i];

    const h = hues[(Math.random() * hues.length) | 0];
    c.setHSL((h + 1) % 1, 0.12 + Math.random() * 0.34, 0.78 + Math.random() * 0.18);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: SPARK },
      uTime: SHARED.time,
      uProj: SHARED.proj,
      uOpacity: { value: 1 }
    },
    vertexShader: [
      'precision highp float;',
      'attribute vec3 aColor;',
      'uniform float uTime, uProj, uOpacity;',
      'varying vec3 vColor;',
      'varying float vA;',
      'void main(){',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  float dist = max(0.55, -mv.z);',
      '  vColor = aColor;',
      '  vA = uOpacity;',
      '  gl_PointSize = clamp(0.020 * uProj / dist, 1.0, 22.0);',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D uMap;',
      'varying vec3 vColor;',
      'varying float vA;',
      'void main(){',
      '  float a = texture2D(uMap, gl_PointCoord).a;',
      '  if (a < 0.004) discard;',
      '  gl_FragColor = vec4(vColor * 1.25, pow(a, 1.5) * vA);',
      '}'
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;

  const smooth = x => x * x * (3 - 2 * x);
  const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

  return {
    mesh: pts,
    update(p) {
      const swirl = smooth(clamp01((p - 0.2) / 0.66));
      const arr = geo.attributes.position.array;
      const turns = Math.PI * 4.2;

      for (let i = 0; i < count; i++) {
        const spin = startAngle[i] + swirl * turns * spinBias[i];
        const rad = startRadius[i] * (1 - swirl) + targetRadius[i] * swirl;
        const y = startY[i] * (1 - swirl) + targetY[i] * swirl;
        const angle = spin * (1 - swirl) + (targetAngle[i] + turns * spinBias[i]) * swirl;

        arr[i * 3] = Math.cos(angle) * rad;
        arr[i * 3 + 1] = y;
        arr[i * 3 + 2] = Math.sin(angle) * rad;
      }
      geo.attributes.position.needsUpdate = true;
      // 汇聚越靠后越亮（落位瞬间的提亮），最后 14% 淡出交给蛋糕本体
      mat.uniforms.uOpacity.value = (0.55 + swirl * 0.75) * (p < 0.86 ? 1 : Math.max(0, 1 - (p - 0.86) / 0.14));
    }
  };
}

/* ============================================================
 * 背景大星云
 * ============================================================ */
export function createNebulaField() {
  const group = new THREE.Group();
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,.9)');
  g.addColorStop(0.25, 'rgba(255,255,255,.35)');
  g.addColorStop(0.6, 'rgba(255,255,255,.1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const colors = [0x8f5fff, 0xff5fa8, 0x4f8fff, 0xb46bff];
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex,
      color: colors[i % colors.length],
      transparent: true,
      opacity: 0.26 + Math.random() * 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    sp.scale.setScalar(16 + Math.random() * 14);
    sp.position.set(
      (Math.random() - 0.5) * 32,
      (Math.random() - 0.5) * 22,
      -18 - Math.random() * 12
    );
    sp.userData.phase = Math.random() * 6.28;
    sp.userData.baseY = sp.position.y;
    group.add(sp);
  }
  return group;
}

/* ============================================================
 * 银河带
 * ============================================================ */
export function createGalaxyBand(count = 900) {
  const geo = new THREE.BufferGeometry();
  const seeds = new Float32Array(count);
  const lanes = new Float32Array(count);
  const depths = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    seeds[i] = Math.random() * 1000;
    lanes[i] = Math.random();
    depths[i] = Math.random();
  }
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute('lane', new THREE.BufferAttribute(lanes, 1));
  geo.setAttribute('depthSeed', new THREE.BufferAttribute(depths, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: SPARK },
      uTime: SHARED.time,
      uPixel: { value: Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2) },
      uProj: SHARED.proj,
      uWidth: { value: 34 },
      uHeight: { value: 11 },
      uOpacity: { value: 0.95 },
      uColorA: { value: new THREE.Color('#7f5cff') },
      uColorB: { value: new THREE.Color('#ffd7f3') }
    },
    vertexShader: [
      'precision highp float;',
      'attribute float seed, lane, depthSeed;',
      'uniform float uTime, uPixel, uProj, uWidth, uHeight;',
      'varying float vSeed, vLane, vGlow;',
      'float hash(float n){ return fract(sin(n) * 43758.5453123); }',
      'void main(){',
      '  float band = floor(lane * 5.0);',
      '  float local = fract(lane * 5.0);',
      '  float speed = 0.020 + hash(seed * 1.37) * 0.050 + band * 0.004;',
      '  float flow = fract(hash(seed * 2.11) + uTime * speed);',
      '  float x = (flow - 0.5) * uWidth * (1.05 + hash(seed * 5.3) * 0.20);',
      '  float curve = sin(flow * 6.2831853 * (0.9 + hash(seed * 4.1) * 0.5) + seed * 0.07 + uTime * 0.30);',
      '  float breath = sin(uTime * (0.40 + hash(seed * 6.7) * 0.40) + seed * 0.09);',
      '  float y = (band - 2.0) * uHeight * 0.14 + curve * uHeight * (0.18 + hash(seed * 9.3) * 0.16) + (local - 0.5) * uHeight * 0.15 + breath * uHeight * 0.09;',
      '  float z = -14.0 + (depthSeed - 0.5) * 7.0 + sin(uTime * (0.15 + hash(seed) * 0.20) + seed) * 0.5;',
      '  vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);',
      '  float dist = max(0.8, -mv.z);',
      '  float edge = smoothstep(0.0, 0.16, flow) * (1.0 - smoothstep(0.84, 1.0, flow));',
      '  vSeed = seed; vLane = lane;',
      '  vGlow = edge * (0.60 + 0.40 * sin(uTime * (0.9 + hash(seed * 8.0) * 0.7) + seed));',
      '  gl_PointSize = clamp((0.020 + hash(seed * 12.0) * 0.050 + vGlow * 0.030) * uProj / dist, 1.0, 9.0);',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D uMap;',
      'uniform vec3 uColorA, uColorB;',
      'uniform float uOpacity, uTime;',
      'varying float vSeed, vLane, vGlow;',
      'void main(){',
      '  vec4 tex = texture2D(uMap, gl_PointCoord);',
      '  if (tex.a < 0.02) discard;',
      '  float tw = pow(0.5 + 0.5 * sin(uTime * (0.60 + fract(vSeed) * 0.40) + vSeed), 4.0);',
      '  vec3 col = mix(uColorA, uColorB, smoothstep(0.10, 0.90, vLane) * 0.45 + tw * 0.40 + vGlow * 0.25);',
      '  float a = tex.a * uOpacity * (0.18 + vGlow * 0.80 + tw * 0.30);',
      '  gl_FragColor = vec4(col * (0.80 + vGlow * 0.70 + tw * 0.30), a);',
      '}'
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.update = (t) => { mat.uniforms.uTime.value = t; };
  return pts;
}
