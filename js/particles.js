/**
 * 粒子系统：彩色纸屑 / 星空 / 烟花 / 蜡烛烟雾
 */
import * as THREE from '../vendor/three.module.min.js';

function dotTexture(inner = 'rgba(255,255,255,1)') {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, 'rgba(255,255,255,.8)');
  g.addColorStop(0.7, 'rgba(255,220,240,.25)');
  g.addColorStop(1, 'rgba(255,190,230,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const DOT = dotTexture();

/** 常驻彩色纸屑（对应参考画面里满屏漂浮的彩点） */
export function createConfetti(count = 900, spread = 16) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const palette = [
    0xff8fc7, 0xffd76e, 0x8fe3ff, 0xc9a7ff, 0xffffff, 0xffb0a0, 0x9dffcf
  ];
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const r = 2.2 + Math.random() * spread;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
    pos[i * 3 + 1] = Math.cos(ph) * r * 0.85;
    pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r * 0.8;
    c.setHex(palette[(Math.random() * palette.length) | 0]);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    seed[i] = Math.random() * 6.28;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.PointsMaterial({
    size: 0.14,
    map: DOT,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.base = pos.slice(0);
  pts.userData.seeds = seed;
  return pts;
}

/** 远景星尘 */
export function createStarfield(count = 1200) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 16 + Math.random() * 24;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph) * 0.8;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) * 0.7 - 8;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.1,
    map: DOT,
    color: 0xffd9ef,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/** 吹灭蜡烛后的一缕烟 */
export class Smoke {  constructor(scene) {
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

/** 烟花爆发 */
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

/** 蛋糕登场：黑色星海 → 漩涡汇聚 → 收成蛋糕 */
export function createAssemble(RADIUS, HEIGHT, count = 900) {
  const startAngle = new Float32Array(count);
  const startRadius = new Float32Array(count);
  const startY = new Float32Array(count);
  const targetAngle = new Float32Array(count);
  const targetRadius = new Float32Array(count);
  const targetY = new Float32Array(count);

  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  const palette = [0xffffff, 0xffe9a8, 0xff9fd0, 0x9fe8ff, 0xc9a7ff, 0xffc07a];

  for (let i = 0; i < count; i++) {
    // 星海：铺开在整个画面范围
    startAngle[i] = Math.random() * Math.PI * 2;
    startRadius[i] = 2.2 + Math.random() * 5.6;
    startY[i] = (Math.random() - 0.5) * 8.4;

    // 蛋糕表面
    targetAngle[i] = Math.random() * Math.PI * 2;
    targetRadius[i] = RADIUS * (0.98 + Math.random() * 0.06);
    targetY[i] = -HEIGHT / 2 + Math.random() * HEIGHT;

    pos[i * 3] = Math.cos(startAngle[i]) * startRadius[i];
    pos[i * 3 + 1] = startY[i];
    pos[i * 3 + 2] = Math.sin(startAngle[i]) * startRadius[i];

    c.setHex(palette[(Math.random() * palette.length) | 0]);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.075,
    map: DOT,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;

  const smooth = x => x * x * (3 - 2 * x);
  const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

  return {
    mesh: pts,
    // p: 0 → 1
    // 0.00~0.20 星海缓慢旋转
    // 0.20~0.85 螺旋汇聚成漩涡
    // 0.85~1.00 贴合蛋糕表面
    update(p) {
      const swirl = smooth(clamp01((p - 0.2) / 0.66));
      const arr = geo.attributes.position.array;

      for (let i = 0; i < count; i++) {
        const spin = startAngle[i] + swirl * Math.PI * 4.2;
        const rad = startRadius[i] * (1 - swirl) + targetRadius[i] * swirl;
        const y = startY[i] * (1 - swirl) + targetY[i] * swirl;
        // 落位时角度对齐到目标点
        const angle = spin * (1 - swirl) + (targetAngle[i] + Math.PI * 4.2) * swirl;

        arr[i * 3] = Math.cos(angle) * rad;
        arr[i * 3 + 1] = y;
        arr[i * 3 + 2] = Math.sin(angle) * rad;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = p < 0.86 ? 1 : Math.max(0, 1 - (p - 0.86) / 0.14);
    }
  };
}

/** 背景大星云（几片柔光云，缓慢漂移） */
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

/**
 * 银河带（shader 粒子）：多车道流动 + 闪烁 + 双色渐变
 * 参考 Mineradio 的星河实现思路，参数按本项目重新调过
 */
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
      uMap: { value: DOT },
      uTime: { value: 0 },
      uPixel: { value: Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2) },
      uWidth: { value: 34 },
      uHeight: { value: 11 },
      uOpacity: { value: 0.95 },
      uColorA: { value: new THREE.Color('#7f5cff') },
      uColorB: { value: new THREE.Color('#ffd7f3') }
    },
    vertexShader: [
      'precision highp float;',
      'attribute float seed, lane, depthSeed;',
      'uniform float uTime, uPixel, uWidth, uHeight;',
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
      '  gl_PointSize = clamp((0.020 + hash(seed * 12.0) * 0.050 + vGlow * 0.030) * uPixel * 150.0 / dist, 0.8, 8.5);',
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