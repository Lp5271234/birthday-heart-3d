/**
 * 星河蛋糕：深蓝紫糖粒侧面 + 白奶油顶 + 发光星云顶面 + 单根大蜡烛 + 倾斜星环
 * 对齐参考画面（1280x720 那一帧）
 */
import * as THREE from '../vendor/three.module.min.js';

const SPRINKLE_PALETTE = [
  '#ffffff', '#ffe9a8', '#ff9fd0', '#9fe8ff', '#c9a7ff',
  '#ffd0e6', '#a0ffe0', '#ffc07a', '#b9c6ff'
];

/**
 * 蛋糕底色：深蓝紫 + 极细星点（只做底色，不放糖粒，糖粒由真实 3D 粒子承担）
 */
function makeBaseTexture(size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 0, size);
  bg.addColorStop(0, '#332f7e');
  bg.addColorStop(0.42, '#232058');
  bg.addColorStop(1, '#151238');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // 极细的底色星尘（不是糖粒，只是让底色不平）
  for (let i = 0; i < 620; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.05 + Math.random() * 0.14) + ')';
    ctx.beginPath();
    ctx.arc(x, y, Math.random() * 1.1, 0, Math.PI * 2);
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
 * 真 3D 糖粒：InstancedMesh 小球，贴在圆柱侧面与顶面，旋转时有真实视差
 */
function createSprinkles(RADIUS, HEIGHT, count) {
  const geo = new THREE.SphereGeometry(1, 6, 4);
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const onSide = Math.random() < 0.86;
    let x, y, z, s;

    if (onSide) {
      const a = Math.random() * Math.PI * 2;
      const yy = -HEIGHT / 2 + Math.random() * HEIGHT;
      // 少量粒子微微浮出表面，增强实体感
      const r = RADIUS * (0.99 + Math.random() * 0.05);
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      y = yy;
      s = 0.008 + Math.random() * 0.019;
    } else {
      // 顶面星云里的小颗粒
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * RADIUS * 0.86;
      x = Math.cos(a) * rr;
      z = Math.sin(a) * rr;
      y = HEIGHT / 2 + 0.006 + Math.random() * 0.03;
      s = 0.007 + Math.random() * 0.015;
    }

    pos.set(x, y, z);
    scl.set(s, s, s);
    m4.compose(pos, q, scl);
    mesh.setMatrixAt(i, m4);

    col.set(SPRINKLE_PALETTE[(Math.random() * SPRINKLE_PALETTE.length) | 0]);
    mesh.setColorAt(i, col);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

function makeNebulaTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.16, 'rgba(255,236,250,.98)');
  g.addColorStop(0.38, 'rgba(240,180,255,.86)');
  g.addColorStop(0.62, 'rgba(170,120,245,.5)');
  g.addColorStop(1, 'rgba(90,60,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 150; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.pow(Math.random(), 0.55) * size * 0.47;
    const x = size / 2 + Math.cos(a) * rr;
    const y = size / 2 + Math.sin(a) * rr;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + Math.random() * 0.65) + ')';
    ctx.beginPath();
    ctx.arc(x, y, Math.random() * 2 + 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGlowTexture(color = '255,210,240') {
  const s = 256;
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

function makeRingDot() {
  const s = 32;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const RING_DOT = makeRingDot();

/** 星环：细环 + 星点 */
function makeRing(radius, count, color, opacity) {
  const group = new THREE.Group();

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.006, 6, 320),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: opacity * 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const jitter = (Math.random() - 0.5) * 0.18;
    pos[i * 3] = Math.cos(a) * (radius + jitter);
    pos[i * 3 + 1] = (Math.random() - 0.5) * 0.05;
    pos[i * 3 + 2] = Math.sin(a) * (radius + jitter);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.07,
    map: RING_DOT,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  pts.frustumCulled = false;
  group.add(pts);

  return group;
}

export function createCake() {
  const group = new THREE.Group();

  const base = makeBaseTexture();
  base.repeat.set(5, 1);

  const sideMat = new THREE.MeshStandardMaterial({
    map: base,
    emissive: new THREE.Color(0x3a2f7a),
    emissiveIntensity: 0.75,
    roughness: 0.6,
    metalness: 0.18
  });
  const topMat = new THREE.MeshStandardMaterial({
    color: 0xfffafd,
    roughness: 0.3,
    metalness: 0.03,
    emissive: new THREE.Color(0xffe9f7),
    emissiveIntensity: 0.42
  });
  const bottomMat = new THREE.MeshStandardMaterial({ color: 0x1a1740, roughness: 0.9 });

  const RADIUS = 1.12;
  const HEIGHT = 1.46;

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(RADIUS, RADIUS * 0.99, HEIGHT, 96, 1, false),
    [sideMat, topMat, bottomMat]
  );
  group.add(body);

  // 真 3D 糖粒（InstancedMesh 小球，随蛋糕旋转产生真实视差）
  const sprinkleCount = window.__SPRINKLE_COUNT || 1600;
  const sprinkles = createSprinkles(RADIUS, HEIGHT, sprinkleCount);
  group.add(sprinkles);

  // 金属托盘
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(RADIUS * 1.14, RADIUS * 1.18, 0.06, 96),
    new THREE.MeshStandardMaterial({
      color: 0xcfc4e4,
      roughness: 0.28,
      metalness: 0.72,
      emissive: new THREE.Color(0x2a2350),
      emissiveIntensity: 0.5
    })
  );
  plate.position.y = -HEIGHT / 2 - 0.04;
  group.add(plate);

  // 顶面发光星云（放在奶油之内，稍高于顶面）
  const nebula = new THREE.Mesh(
    new THREE.CircleGeometry(RADIUS * 0.86, 64),
    new THREE.MeshBasicMaterial({
      map: makeNebulaTexture(),
      transparent: true,
      depthWrite: false
    })
  );
  nebula.rotation.x = -Math.PI / 2;
  nebula.position.y = HEIGHT / 2 + 0.014;
  group.add(nebula);

  // 顶面中心辉光
  const topGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('255,220,250'),
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  topGlow.scale.set(1.9, 1.9, 1);
  topGlow.position.y = HEIGHT / 2 + 0.05;
  group.add(topGlow);

  // 奶油花边：小而密的一圈
  const puffCount = 72;
  const puffGeo = new THREE.SphereGeometry(0.047, 8, 8);
  const puffs = new THREE.InstancedMesh(puffGeo, topMat, puffCount);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < puffCount; i++) {
    const a = (i / puffCount) * Math.PI * 2;
    m4.makeTranslation(
      Math.cos(a) * RADIUS * 0.995,
      HEIGHT / 2 + 0.008,
      Math.sin(a) * RADIUS * 0.995
    );
    puffs.setMatrixAt(i, m4);
  }
  puffs.instanceMatrix.needsUpdate = true;
  group.add(puffs);

  // 蜡烛（加高，让火焰离开蛋糕面）
  const candleH = 0.66;
  const candle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.03, candleH, 14),
    new THREE.MeshStandardMaterial({
      color: 0xfffbfe,
      roughness: 0.32,
      emissive: new THREE.Color(0xb0607f),
      emissiveIntensity: 0.3
    })
  );
  candle.position.y = HEIGHT / 2 + candleH / 2;
  group.add(candle);

  const wick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.05, 6),
    new THREE.MeshBasicMaterial({ color: 0x2a1a22 })
  );
  wick.position.y = HEIGHT / 2 + candleH + 0.022;
  group.add(wick);

  const tipY = HEIGHT / 2 + candleH + 0.06;

  // 火焰：下圆上尖 + 光晕
  const flame = new THREE.Group();
  flame.position.set(0, tipY, 0);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.042, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfffbe6 })
  );
  core.scale.set(1, 3.6, 1);
  core.position.y = 0.12;
  flame.add(core);

  const outer = new THREE.Mesh(
    new THREE.SphereGeometry(0.072, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffa23c,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  outer.scale.set(1, 3.0, 1);
  outer.position.y = 0.13;
  flame.add(outer);

  // 顶部尖焰
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.032, 0.16, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  tip.position.y = 0.29;
  flame.add(tip);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('255,175,95'),
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  halo.scale.set(0.95, 1.75, 1);
  halo.position.y = 0.2;
  flame.add(halo);

  group.add(flame);

  const flameLight = new THREE.PointLight(0xffa451, 6, 7, 2);
  flameLight.position.set(0, tipY + 0.2, 0.1);
  group.add(flameLight);

  // 星环 ×3（粒子土星环，倾斜穿过蛋糕）
  const ringA = makeRing(1.62, 520, 0xbfe0ff, 0.95);
  ringA.rotation.set(0.46, 0, 0.1);
  ringA.userData.speed = 0.32;
  group.add(ringA);

  const ringB = makeRing(1.98, 620, 0xffc9ec, 0.72);
  ringB.rotation.set(-0.38, 0.26, -0.12);
  ringB.userData.speed = -0.22;
  group.add(ringB);

  const ringC = makeRing(2.38, 420, 0xffe6a8, 0.5);
  ringC.rotation.set(0.62, 0.5, 0.18);
  ringC.userData.speed = 0.14;
  group.add(ringC);

  // 蛋糕周围漂浮的彩色粒子
  const dust = createFloatingDust(RADIUS, HEIGHT, 300);
  group.add(dust);

  // 底部辉光
  const floorGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('190,150,255'),
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  floorGlow.scale.set(5.2, 5.2, 1);
  floorGlow.position.y = -0.7;
  group.add(floorGlow);

  group.userData = {
    ringA, ringB, ringC, dust, flame, flameLight, nebula,
    candleTip: new THREE.Vector3(0, tipY, 0)
  };
  return group;
}

/** 蛋糕周围缓慢漂浮的彩色粒子 */
function createFloatingDust(RADIUS, HEIGHT, count) {
  const pos = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  const palette = [0xffd76e, 0xff9fd0, 0x9fe8ff, 0xffffff, 0xffc07a, 0xc9a7ff];

  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = RADIUS * (1.15 + Math.random() * 1.6);
    const y = -HEIGHT / 2 + (Math.random() - 0.2) * HEIGHT * 2.1;
    base[i * 3] = Math.cos(a) * r;
    base[i * 3 + 1] = y;
    base[i * 3 + 2] = Math.sin(a) * r;
    pos[i * 3] = base[i * 3];
    pos[i * 3 + 1] = base[i * 3 + 1];
    pos[i * 3 + 2] = base[i * 3 + 2];
    seeds[i] = Math.random() * 6.28;
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
    map: RING_DOT,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData = { base, seeds };

  pts.update = (t) => {
    const arr = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      arr[i * 3] = base[i * 3] + Math.sin(t * 0.55 + s) * 0.22;
      arr[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.8 + s * 1.3) * 0.26;
      arr[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.6 + s * 0.8) * 0.22;
    }
    geo.attributes.position.needsUpdate = true;
  };

  return pts;
}
