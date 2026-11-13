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

/** 蛋糕登场：粒子从四周聚合到圆柱表面 */
export function createAssemble(RADIUS, HEIGHT, count = 700) {
  const start = new Float32Array(count * 3);
  const target = new Float32Array(count * 3);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  const palette = [0xffffff, 0xffe9a8, 0xff9fd0, 0x9fe8ff, 0xc9a7ff, 0xffc07a];

  for (let i = 0; i < count; i++) {
    const r = 4 + Math.random() * 6;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    start[i * 3] = Math.sin(ph) * Math.cos(th) * r;
    start[i * 3 + 1] = Math.cos(ph) * r * 0.75;
    start[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;

    const a = Math.random() * Math.PI * 2;
    const y = -HEIGHT / 2 + Math.random() * HEIGHT;
    target[i * 3] = Math.cos(a) * RADIUS * 1.03;
    target[i * 3 + 1] = y;
    target[i * 3 + 2] = Math.sin(a) * RADIUS * 1.03;

    pos[i * 3] = start[i * 3];
    pos[i * 3 + 1] = start[i * 3 + 1];
    pos[i * 3 + 2] = start[i * 3 + 2];

    c.setHex(palette[(Math.random() * palette.length) | 0]);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.085,
    map: DOT,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;

  return {
    mesh: pts,
    update(p) {
      const e = 1 - Math.pow(1 - p, 2.4);
      const arr = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        const k = i * 3;
        arr[k] = start[k] + (target[k] - start[k]) * e;
        arr[k + 1] = start[k + 1] + (target[k + 1] - start[k + 1]) * e;
        arr[k + 2] = start[k + 2] + (target[k + 2] - start[k + 2]) * e;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = p < 0.78 ? 1 : Math.max(0, 1 - (p - 0.78) / 0.22);
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

/** 银河带：沿倾斜平面铺开的细密星点 */
export function createGalaxyBand(count = 900) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 7 + Math.random() * 16;
    const spread = (Math.random() - 0.5) * 3.4;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = spread * 1.2 + Math.sin(a) * r * 0.26;
    pos[i * 3 + 2] = Math.sin(a) * r * 0.7 - 10;
    c.setHSL(0.72 + Math.random() * 0.2, 0.7, 0.6 + Math.random() * 0.3);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.11,
    map: DOT,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}