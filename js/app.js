/**
 * 主控：两幕场景
 *   幕1 便签爱心（浅粉）→ 幕2 星河蛋糕（深空）
 */
import * as THREE from '../vendor/three.module.min.js';
import { createNoteTexture, noteLayout } from './cards.js';
import { createSparkField, createOrbitStreams, createAssemble, createNebulaField, createGalaxyBand, Smoke, Fireworks, setSparkTime, setSparkProjection } from './particles.js';
import { createCake, CAKE_SIZE } from './cake.js';
import { BloomComposer } from './postfx.js';

const CFG = window.BIRTHDAY_CONFIG || {};
const cards = CFG.cards || [{ short: '生日快乐', full: '生日快乐' }];

const qs = new URLSearchParams(location.search);

// device=mobile / device=pc 可强制切换版本；不填则自动识别
const forceDevice = qs.get('device') || qs.get('v');
const autoMobile =
  matchMedia('(max-width: 820px)').matches ||
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const isMobile = forceDevice ? /^(m|mobile|phone)$/i.test(forceDevice) : autoMobile;

const NOTE_COUNT = isMobile ? 38 : 54;
const HEART_SCALE = isMobile ? 2.62 : 3.30;
const DPR_CAP = isMobile ? 1.5 : 2;

const dom = {
  canvas: document.getElementById('scene'),
  gate: document.getElementById('gate'),
  gateTo: document.getElementById('gateTo'),
  btnStart: document.getElementById('btnStart'),
  hudTo: document.getElementById('hudTo'),
  hint: document.getElementById('hint'),
  cta: document.getElementById('btnBlow'),
  bigWish: document.getElementById('bigWish'),
  modal: document.getElementById('cardModal'),
  modalNo: document.querySelector('.modal-no'),
  modalTitle: document.querySelector('.modal-title'),
  modalText: document.querySelector('.modal-text'),
  modalFrom: document.querySelector('.modal-from'),
  modalClose: document.querySelector('.modal-close'),
  loading: document.getElementById('loading'),
  btnSound: document.getElementById('btnSound'),
  btnReplay: document.getElementById('btnReplay'),
  centerCard: document.getElementById('centerCard'),
  btnToCake: document.getElementById('btnToCake'),
  script: document.getElementById('scriptWord'),
  photoModal: document.getElementById('photoModal'),
  photoImg: document.getElementById('photoImg'),
  photoPlaceholder: document.getElementById('photoPlaceholder'),
  photoCaption: document.getElementById('photoCaption'),
  photoClose: document.getElementById('photoClose'),
  blackout: document.getElementById('blackout'),
  videoStage: document.getElementById('videoStage'),
  introCanvas: document.getElementById('introCanvas'),
  introVideo: document.getElementById('introVideo')
};

// ---------- 配置文案注入 ----------
const toName = qs.get('to') || CFG.to || '朋友';
const fromName = qs.get('from') || CFG.from || '我';
dom.gateTo.textContent = toName;
dom.hudTo.textContent = toName;
dom.modalFrom.textContent = '—— ' + fromName;
dom.cta.textContent = CFG.blowText || '吹蜡烛，许个愿';
document.title = '生日快乐 · ' + toName;

// ---------- 渲染器 ----------
const renderer = new THREE.WebGLRenderer({
  canvas: dom.canvas,
  antialias: !isMobile,
  alpha: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, DPR_CAP));
renderer.setClearColor(0x000000, 0);
// 真实投影：托盘要有"蛋糕压上去"的明暗关系
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

/* 环境反射贴图：给托盘金属面一层"星空反射"（WebGL 里最接近光追观感的做法） */
function makeEnvironment() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S / 2;
  const ctx = c.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#101a4a');
  g.addColorStop(0.45, '#0b1130');
  g.addColorStop(1, '#03040c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, c.height);

  // 几处高光斑：反射到托盘上会形成亮条
  const blobs = [
    ['rgba(180,210,255,.85)', 0.22, 0.30, 0.16],
    ['rgba(255,190,220,.60)', 0.62, 0.22, 0.12],
    ['rgba(255,215,150,.55)', 0.80, 0.42, 0.10],
    ['rgba(140,255,240,.40)', 0.42, 0.55, 0.09]
  ];
  blobs.forEach(([color, cx, cy, rr]) => {
    const rg = ctx.createRadialGradient(
      cx * S, cy * c.height, 0,
      cx * S, cy * c.height, rr * S
    );
    rg.addColorStop(0, color);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, S, c.height);
  });

  // 细星点
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + Math.random() * 0.5) + ')';
    ctx.beginPath();
    ctx.arc(Math.random() * S, Math.random() * c.height * 0.8, Math.random() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromEquirectangular(tex);
  pmrem.dispose();
  tex.dispose();
  return rt.texture;
}

const scene = new THREE.Scene();
scene.environment = makeEnvironment();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);

// 泛光后处理：参考画面那种"亮部溢出柔光 + 整体朦胧"的观感，靠这个才做得出来
const bloom = new BloomComposer(renderer, scene, camera, isMobile
  ? { threshold: 0.86, strength: 0.52, hazeAmount: 0.006, vignette: 0.46, renderScale: 0.80 }
  : { threshold: 0.80, strength: 0.72, hazeAmount: 0.010, vignette: 0.44, renderScale: 1.0 });

// ---------- 灯光 ----------
// 暗环境 + 冷暖对比：原来 ambient 1.15 把所有面照得一样亮，蛋糕没有体积感
scene.add(new THREE.AmbientLight(0x6f7fd0, 0.34));

const keyLight = new THREE.PointLight(0xffd9ef, 4.2, 30, 2);
keyLight.position.set(-4.5, 4.6, 6.8);
scene.add(keyLight);

// 轮廓光从右后方打，勾出蛋糕右缘与托盘边
const rimLight = new THREE.PointLight(0x9fd8ff, 4.0, 26, 2);
rimLight.position.set(4.8, 2.4, -1.8);
scene.add(rimLight);

// 顶部暖光：模拟烛光从上方压下来，照亮顶面与奶油边，并投出蛋糕在托盘上的影子
const topLight = new THREE.SpotLight(0xffd8c0, 8, 18, 0.72, 0.55, 1.8);
topLight.position.set(0.3, 6.4, 2.6);
topLight.target.position.set(0, 0, 0);
topLight.castShadow = true;
topLight.shadow.mapSize.set(isMobile ? 512 : 1024, isMobile ? 512 : 1024);
topLight.shadow.camera.near = 1;
topLight.shadow.camera.far = 18;
topLight.shadow.bias = -0.0016;
topLight.shadow.radius = 3;
scene.add(topLight);
scene.add(topLight.target);

// ---------- 便签爱心 ----------
const layout = noteLayout(NOTE_COUNT, HEART_SCALE);
const heartGroup = new THREE.Group();
heartGroup.visible = false;   // 开场前不渲染，避免便签动画提前跑完
scene.add(heartGroup);

const noteW = isMobile ? 0.46 : 0.62;
const noteH = noteW * (298 / 224);

// 便签投影贴图（让便签看起来"浮"在背景上）
function makeShadowTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.08, s / 2, s / 2, s * 0.52);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}
const shadowTex = makeShadowTexture();

const notes = [];
// 爱心便签幕已由开场视频替代：保留代码但不再构建，省内存
const ENABLE_HEART = false;
if (ENABLE_HEART) layout.notes.forEach((n, i) => {
  const data = cards[i % cards.length];
  const tex = createNoteTexture(data, i);

  const faceMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  faceMat.opacity = 0;
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xf1e7ee, transparent: true });
  edgeMat.opacity = 0;
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    color: 0x000000,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });

  // 有厚度的便签（0.02 板厚），正面贴图、侧面米白
  const geo = new THREE.BoxGeometry(noteW, noteH, 0.02);
  const mesh = new THREE.Mesh(geo, [edgeMat, edgeMat, edgeMat, edgeMat, faceMat, edgeMat]);
  mesh.position.set(0, 0, -1);
  mesh.rotation.z = n.rot;
  mesh.scale.setScalar(0.4);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(noteW * 1.2, noteH * 1.2), shadowMat);
  shadow.position.set(0.035, -0.045, -0.028);
  mesh.add(shadow);

  heartGroup.add(mesh);
  const prev = layout.notes[(i - 1 + layout.notes.length) % layout.notes.length];
  notes.push({
    mesh,
    shadowMat,
    home: new THREE.Vector3(n.x, n.y, n.z),
    // 沿路径生长：从上一张便签的位置滑出，第一张就地出现
    from: i === 0 ? new THREE.Vector3(n.x, n.y, n.z) : new THREE.Vector3(prev.x, prev.y, prev.z),
    rot: n.rot,
    index: i,
    data
  });
});

// 画笔光点：沿心形路径移动，便签在它经过时展开
function makePenTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,190,225,.95)');
  g.addColorStop(0.55, 'rgba(255,120,190,.35)');
  g.addColorStop(1, 'rgba(255,90,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let pen = null;
if (ENABLE_HEART) {
  pen = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makePenTexture(),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  pen.scale.set(0.6, 0.6, 1);
  heartGroup.add(pen);
}

// 中心白卡（DOM）由 start() 控制显示

// ---------- 蛋糕 ----------
const cake = createCake();
cake.visible = false;
cake.scale.setScalar(isMobile ? 1.12 : 1.0);
scene.add(cake);
const cakeData = cake.userData;

// 蛋糕登场：粒子从四周聚合到蛋糕表面
const assemble = createAssemble(1.12, 1.46, isMobile ? 380 : 640);
assemble.mesh.visible = false;
cake.add(assemble.mesh);
let assembleT = 1;

// 蛋糕上方的光柱（增强"星河"氛围）
function makeBeamTexture() {
  const w = 64, h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0, 'rgba(255,210,245,0)');
  g.addColorStop(0.14, 'rgba(255,200,240,.55)');
  g.addColorStop(0.5, 'rgba(200,160,255,.22)');
  g.addColorStop(1, 'rgba(160,130,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-in';
  const hg = ctx.createLinearGradient(0, 0, w, 0);
  hg.addColorStop(0, 'rgba(255,255,255,0)');
  hg.addColorStop(0.5, 'rgba(255,255,255,1)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const beam = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeBeamTexture(),
  transparent: true,
  opacity: 0.6,
  blending: THREE.AdditiveBlending,
  depthWrite: false
}));
beam.scale.set(1.7, 5.4, 1);
beam.position.y = 3.1;
cake.add(beam);

// ---------- 气球（独立于蛋糕，不随旋转） ----------
const balloonColors = [0xff8fc7, 0xc9a7ff, 0xffd76e, 0x9fe8ff, 0xffa9a0];
const balloons = [];
// 气球必须始终高于这个高度（由 buildBalloons 按设备算出）
let BALLOON_MIN_Y = 0;

function createBalloon(color, x, y, z, scale) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.16,
    metalness: 0.02,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.48
  });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 20), mat);
  body.scale.set(1, 1.24, 1);
  group.add(body);

  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.1, 8), mat);
  knot.position.y = -0.4;
  knot.rotation.x = Math.PI;
  group.add(knot);

  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  return group;
}

function buildBalloons() {
  // 穿模的真实成因不是"三维距离不够"，而是**投影重叠**：
  // 手机端蛋糕被整体放大 1.12 倍（托盘外沿 1.43），而竖屏可视半宽只有约 1.75，
  // 气球根本没法靠"横向绕开"蛋糕；一旦气球中心和蛋糕顶面在同一高度，
  // 近处的气球被透视放大后，屏幕上就压进蛋糕轮廓里。
  // 所以判据改成垂直分离：所有气球整体浮在蛋糕顶面之上。
  const TOP_Y = (isMobile ? 1.12 : 1.0) * (CAKE_SIZE.HEIGHT / 2 + CAKE_SIZE.CREAM_H);
  const MIN_Y = TOP_Y + (isMobile ? 0.78 : 0.66); // 球半径 + 间隙 + 透视放大余量
  BALLOON_MIN_Y = MIN_Y;

  const raw = [
    { x: -1.28, y: 1.95, z: 0.72, s: 0.95 },   // 左前
    { x: 1.26, y: 2.18, z: 0.48, s: 0.90 },    // 右前
    { x: -1.16, y: 2.55, z: -0.92, s: 0.82 },  // 左后
    { x: 1.12, y: 2.72, z: -1.06, s: 0.76 },   // 右后
    { x: -0.18, y: 3.20, z: -1.48, s: 0.64 }   // 正后高
  ];

  const spots = raw.map(p => ({
    x: p.x,
    y: Math.max(MIN_Y, p.y),
    z: p.z,
    s: p.s,
    // 绳子朝气球上方出画（原来锚点在下方，弦会横穿蛋糕）
    ax: p.x * 1.75,
    ay: p.y + 1.70,
    az: p.z * 1.1 + 0.6
  }));

  spots.forEach((s, i) => {
    const group = createBalloon(balloonColors[i % balloonColors.length], s.ax, s.ay, s.az, s.s);
    group.visible = false;
    scene.add(group);

    // 参考画面里的气球没有绳子（细白线横穿画面很像划痕），不建绳子节点
    const string = null;

    balloons.push({
      group,
      string,
      anchor: new THREE.Vector3(s.ax, s.ay, s.az),
      target: new THREE.Vector3(s.x, s.y, s.z),
      baseY: s.y,
      phase: Math.random() * 6.28,
      alive: true,
      color: balloonColors[i % balloonColors.length],
      scaleBase: s.s,
      grow: 0,
      enter: 0
    });
  });
}
buildBalloons();

function popBalloon(b) {
  if (!b.alive) return;
  b.alive = false;
  b.group.visible = false;
  if (b.string) b.string.visible = false;
  const p = b.group.position.clone();
  fireworks.burst(p, { color: b.color, count: isMobile ? 70 : 110, power: 1.0, ttl: 1.5 });
  fireworks.burst(p, { color: 0xffffff, count: 26, power: 0.6, ttl: 1.1, size: 0.08 });
  openPhoto();
  // 照片关掉后气球重新出现，可反复点
  const restore = () => {
    if (dom.photoModal.hidden) {
      b.alive = true;
      b.group.visible = true;
      b.enter = 0;
      if (b.string) b.string.visible = true;
    } else {
      setTimeout(restore, 400);
    }
  };
  setTimeout(restore, 900);
}

// ---------- 粒子 ----------
// 星尘雾：几千颗小尺寸光点（大量 1px 级微尘 + 少量亮星），靠闪烁与景深出层次，
// 不再用"彩色大圆点"那种卡通画法
const stardust = createSparkField({
  count: isMobile ? 5200 : 12000,
  rMin: 1.9,
  rMax: isMobile ? 15 : 19,
  yScale: 0.92,
  zOffset: -1.6,
  sizeMin: 0.008,
  sizeMax: isMobile ? 0.030 : 0.038,
  drift: 0.10,
  twinkleRate: 0.85,
  colorMix: 0.34
});
stardust.visible = false;
scene.add(stardust);

// 远景星点（更远、更暗、更慢）
const starfield = createSparkField({
  count: isMobile ? 1400 : 3200,
  rMin: 13,
  rMax: 40,
  yScale: 0.8,
  zOffset: -9,
  sizeMin: 0.028,
  sizeMax: 0.075,
  drift: 0.035,
  twinkleRate: 0.5,
  colorMix: 0.20
});
starfield.visible = false;
scene.add(starfield);

// 背景星云 + 银河带（星河感）
const nebulaField = createNebulaField();
nebulaField.visible = false;
scene.add(nebulaField);

const galaxyBand = createGalaxyBand(isMobile ? 520 : 900);
galaxyBand.visible = false;
scene.add(galaxyBand);

// 环绕蛋糕的光流（静点再多也不如一条会跑的光流）
const streams = createOrbitStreams({
  orbits: 3,
  perOrbit: isMobile ? 520 : 1000,
  rBase: isMobile ? 1.40 : 1.62,
  rStep: isMobile ? 0.34 : 0.42
});
streams.visible = false;
scene.add(streams);

const smoke = new Smoke(scene);
const fireworks = new Fireworks(scene);

// ---------- 相机自适应 ----------
let dHeart = 12;
let dCake = 7;

function fitCamera() {
  const w = Math.max(1, innerWidth);
  const h = Math.max(1, innerHeight);
  const aspect = w / h;
  renderer.setSize(w, h, false);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();

  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  const heartW = layout.width + (isMobile ? 0.7 : 1.0);
  const heartH = layout.height + (isMobile ? 1.4 : 1.0);
  const dByW = heartW / (2 * tan * aspect);
  const dByH = heartH / (2 * tan);
  dHeart = Math.max(dByW, dByH);

  // 取景高度要留够"蛋糕 + 奶油 + 蜡烛 + 火焰"的竖直空间，
  // 否则桌面横屏下火苗顶部会被裁出画面（看起来就像"没有火焰"）
  const cakeW = isMobile ? 3.9 : 4.8;
  const cakeH = isMobile ? 5.2 : 5.6;
  const cByW = cakeW / (2 * tan * aspect);
  const cByH = cakeH / (2 * tan);
  dCake = Math.max(cByW, cByH);

  // 点精灵的像素尺寸换算：drawingBuffer 高度 / (2*tan(fov/2))
  // 光点大小必须跟随真实投影，否则换设备就变成"一片大圆点"
  setSparkProjection((h * renderer.getPixelRatio()) / (2 * tan));

  // 后处理的 RT 尺寸要跟真实 drawingBuffer 对齐
  const dbs = renderer.getDrawingBufferSize(new THREE.Vector2());
  bloom.setSize(dbs.x, dbs.y);

  // 相机位置统一由动画循环平滑跟随（fitCamera 只负责距离计算与投影更新）
}

// ---------- 状态机 ----------
let state = 'idle'; // idle | heart | cake | blown
let clock = new THREE.Clock();
let heartT = 0;      // 便签飞出进度
let sceneFade = 0;   // 幕间过渡
let cakeYaw = 0;
let cakeTargetYaw = 0;
let cakePitch = 0;
let drag = { active: false, x: 0, y: 0 };
let burnT = 0;
let fwTimer = 0;
let bgReveal = 0;   // 星河从黑到亮

// ---------- 交互：拖动旋转 / 缩放 / 点击 ----------
const pointers = new Map();
let pinchStart = 0;
let pinchZoomStart = 1;
let zoom = 1;
let inertia = 0;
let heartSpin = 0;
let heartSpinTarget = 0;
let downInfo = { x: 0, y: 0, moved: 0 };

dom.canvas.addEventListener('pointerdown', e => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    pinchZoomStart = zoom;
    return;
  }

  drag.active = true;
  drag.x = e.clientX;
  drag.y = e.clientY;
  inertia = 0;
  downInfo = { x: e.clientX, y: e.clientY, moved: 0 };
  try { dom.canvas.setPointerCapture(e.pointerId); } catch (_) {}
});

dom.canvas.addEventListener('pointermove', e => {
  if (pointers.has(e.pointerId)) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  // 双指缩放
  if (pointers.size === 2 && pinchStart > 0) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    zoom = THREE.MathUtils.clamp(pinchZoomStart * (pinchStart / d), 0.68, 1.7);
    return;
  }

  if (!drag.active) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  downInfo.moved += Math.abs(dx) + Math.abs(dy);

  if (state === 'heart' || state === 'idle') {
    // 爱心幕：左右滑动让便签立体转一下
    heartSpinTarget = THREE.MathUtils.clamp(heartSpinTarget + dx * 0.0016, -0.55, 0.55);
  } else {
    cakeTargetYaw += dx * 0.0032;
    inertia = dx * 0.0032;
    cakePitch = THREE.MathUtils.clamp(cakePitch + dy * 0.0012, -0.25, 0.3);
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart = 0;
  drag.active = false;
}

dom.canvas.addEventListener('pointerup', endPointer);
dom.canvas.addEventListener('pointercancel', endPointer);
dom.canvas.addEventListener('pointerleave', endPointer);

// 滚轮缩放（桌面）
dom.canvas.addEventListener('wheel', e => {
  if (state !== 'cake' && state !== 'blown') return;
  e.preventDefault();
  zoom = THREE.MathUtils.clamp(zoom + e.deltaY * 0.0009, 0.68, 1.7);
}, { passive: false });

// 键盘：左右旋转、上下缩放
addEventListener('keydown', e => {
  if (state !== 'cake' && state !== 'blown') return;
  if (e.key === 'ArrowLeft') cakeTargetYaw -= 0.18;
  if (e.key === 'ArrowRight') cakeTargetYaw += 0.18;
  if (e.key === 'ArrowUp') zoom = THREE.MathUtils.clamp(zoom - 0.08, 0.68, 1.7);
  if (e.key === 'ArrowDown') zoom = THREE.MathUtils.clamp(zoom + 0.08, 0.68, 1.7);
});

// ---------- 点击拾取 ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function pick(clientX, clientY) {
  const rect = dom.canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

dom.canvas.addEventListener('click', e => {
  // 拖动过就不算点击，避免旋转时误弹卡片
  if (downInfo.moved > 10) return;

  if (state === 'heart') {
    pick(e.clientX, e.clientY);
    const hits = raycaster.intersectObjects(heartGroup.children, false);
    if (hits.length) {
      const idx = notes.findIndex(n => n.mesh === hits[0].object);
      if (idx >= 0) openCard(notes[idx]);
    }
    return;
  }
  if (state === 'cake' || state === 'blown') {
    pick(e.clientX, e.clientY);

    // 优先检测气球：点爆气球才弹照片
    const balloonMeshes = balloons.map(b => b.group);
    const bHits = raycaster.intersectObjects(balloonMeshes, true);
    if (bHits.length) {
      let target = bHits[0].object;
      while (target.parent && !balloons.some(b => b.group === target)) target = target.parent;
      const b = balloons.find(x => x.group === target);
      if (b) { popBalloon(b); return; }
    }

    // 点蛋糕只做涟漪反馈，不弹窗
    const hits = raycaster.intersectObject(cake, true);
    if (hits.length) spawnRipple(hits[0].point);
    return;
  }
});

function openCard(note) {
  dom.modalNo.textContent = 'NO. ' + String(note.index + 1).padStart(2, '0');
  dom.modalTitle.textContent = note.data.short;
  dom.modalText.textContent = note.data.full;
  dom.modal.hidden = false;
}

// ---------- 点击蛋糕弹图片（图片在 config.js 里预留） ----------
function openPhoto() {
  const url = CFG.photo;
  if (url) {
    dom.photoImg.src = url;
    dom.photoImg.alt = CFG.photoAlt || '生日照片';
    dom.photoImg.hidden = false;
    dom.photoPlaceholder.hidden = true;
  } else {
    dom.photoImg.hidden = true;
    dom.photoPlaceholder.hidden = false;
  }
  dom.photoCaption.textContent = CFG.photoCaption || '';
  dom.photoModal.hidden = false;
}

dom.photoClose.addEventListener('click', () => { dom.photoModal.hidden = true; });
dom.photoModal.addEventListener('click', e => {
  if (e.target === dom.photoModal) dom.photoModal.hidden = true;
});

// ---------- 点击涟漪 ----------
const ripples = [];
const rippleGeo = new THREE.RingGeometry(0.08, 0.135, 48);

function spawnRipple(point) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd9f4,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(rippleGeo, mat);
  mesh.position.copy(point);
  mesh.lookAt(camera.position);
  scene.add(mesh);
  ripples.push({ mesh, life: 0, ttl: 1.05 });
}

dom.modalClose.addEventListener('click', () => { dom.modal.hidden = true; });
dom.modal.addEventListener('click', e => {
  if (e.target === dom.modal) dom.modal.hidden = true;
});

// ---------- 开场 ----------

/* 开场视频画面：全部由 canvas 逐帧绘制
 * 为什么不用 <video> 直接显示：只要 video 参与可见渲染，手机浏览器（iOS Safari、
 * 安卓各家 WebView、微信内置浏览器）就可能在视频控件层上冒出进度条/播放按钮，
 * ::-webkit-media-controls 那套 CSS 在被系统接管时不生效。
 * 这里把 video 压成 2px 透明只当解码器，画面交给 canvas —— 浏览器没有可画控件的目标。
 */
let introRaf = 0;
let introFrameCb = 0;

function sizeIntroCanvas() {
  const cv = dom.introCanvas;
  if (!cv) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.round(innerWidth * dpr));
  cv.height = Math.max(1, Math.round(innerHeight * dpr));
  const ctx = cv.getContext('2d', { alpha: false });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cv.width, cv.height);
}

function stopIntroPaint() {
  const v = dom.introVideo;
  if (introFrameCb && v && v.cancelVideoFrameCallback) {
    try { v.cancelVideoFrameCallback(introFrameCb); } catch (_) {}
  }
  introFrameCb = 0;
  if (introRaf) { cancelAnimationFrame(introRaf); introRaf = 0; }
}

function scheduleIntroFrame() {
  const v = dom.introVideo;
  if (!v) return;
  if (typeof v.requestVideoFrameCallback === 'function') {
    introFrameCb = v.requestVideoFrameCallback(() => {
      introFrameCb = 0;
      paintIntroFrame();
    });
  } else {
    introRaf = requestAnimationFrame(paintIntroFrame);
  }
}

function paintIntroFrame() {
  if (state !== 'video' || !dom.introVideo || !dom.introCanvas) return;
  const v = dom.introVideo;
  const cv = dom.introCanvas;
  const ctx = cv.getContext('2d', { alpha: false });
  const w = cv.width;
  const h = cv.height;
  const vw = v.videoWidth || 720;
  const vh = v.videoHeight || 318;
  if (vw > 0 && vh > 0) {
    // 等价于 object-fit: cover —— 铺满、居中裁切
    const k = Math.max(w / vw, h / vh);
    const sw = w / k;
    const sh = h / k;
    try {
      ctx.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, w, h);
    } catch (_) {}
  }
  scheduleIntroFrame();
}

function start() {
  if (state !== 'idle') return;
  state = 'video';
  dom.gate.classList.add('gone');
  dom.loading.classList.add('gone');

  const v = dom.introVideo;
  if (!v) { enterCakeAfterVideo(); return; }

  dom.videoStage.hidden = false;
  sizeIntroCanvas();
  stopIntroPaint();
  // 视频本身静默，muted 让自动播放策略直接放行（画到 canvas 也不受手势限制）
  try { v.muted = true; } catch (_) {}
  // 视频播放期间把 3D 停掉，GPU 全留给视频解码，避免卡顿
  dom.canvas.style.visibility = 'hidden';
  // 手势内先解锁音频元素，否则视频放完（11 秒后）音乐会被浏览器拦掉
  music.prime();
  try { v.currentTime = 0; } catch (_) {}
  const p = v.play();
  if (p && p.catch) p.catch(() => enterCakeAfterVideo());
  v.addEventListener('ended', enterCakeAfterVideo, { once: true });
  scheduleIntroFrame();
}

// 视频结束后：进入星河蛋糕幕，这时才开始放背景音乐（不与视频声音重叠）
function enterCakeAfterVideo() {
  if (state !== 'video') return;
  state = 'cake-pending';
  stopIntroPaint();
  dom.videoStage.hidden = true;
  dom.canvas.style.visibility = '';
  const v = dom.introVideo;
  if (v) { try { v.pause(); } catch (_) {} }
  last = performance.now();
  goCake();
  music.tryStart();
  // 若浏览器把音乐拦了（长视频播完后手势已过期），等下一次点击补上
  if (!music.on) {
    addEventListener('pointerdown', () => { if (!music.on) music.tryStart(); }, { once: true });
  }
}

dom.btnStart.addEventListener('click', start);

// ---------- 进入蛋糕幕 ----------
function goCake() {
  if (state === 'cake' || state === 'blown') return;
  state = 'cake';
  dom.centerCard.classList.remove('show');
  dom.hint.classList.remove('on');
  dom.script.style.opacity = '0';
  document.body.classList.add('dark');
  // 黑场：先暗下来，再让星海浮现
  dom.blackout.classList.add('on');
  setTimeout(() => dom.blackout.classList.remove('on'), 420);

  heartGroup.visible = false;
  cake.visible = true;
  cake.scale.setScalar(0.4);
  cake.position.y = -3;
  stardust.visible = true;
  starfield.visible = true;
  nebulaField.visible = true;
  galaxyBand.visible = true;
  streams.visible = true;
  bgReveal = 0;
  stardust.userData.setOpacity(0);
  starfield.userData.setOpacity(0);
  streams.userData.setOpacity(0);
  galaxyBand.material.uniforms.uOpacity.value = 0;
  nebulaField.children.forEach(sp => { sp.material.opacity = 0; });
  assembleT = 0;
  assemble.mesh.visible = true;
  assemble.update(0);
  camera.position.z = dCake;
  camera.position.y = dCake * 0.24;
  camera.lookAt(0, 0, 0);
  dom.cta.classList.add('on');

  balloons.forEach(b => {
    b.alive = true;
    b.group.visible = true;
    b.enter = 0;
    if (b.string) b.string.visible = true;
  });
}

dom.btnToCake.addEventListener('click', goCake);

// ---------- 吹蜡烛 ----------
function blowOut() {
  if (state !== 'cake') return;
  state = 'blown';
  burnT = 0;
  dom.cta.classList.remove('on');
  dom.bigWish.classList.add('on');
  if (CFG.bigWish) {
    dom.bigWish.querySelector('.bw-line1').textContent = CFG.bigWish.line1;
    dom.bigWish.querySelector('.bw-line2').textContent = CFG.bigWish.line2;
  }

  // 火焰熄灭
  const flame = cakeData.flame;
  const flash = { t: 0 };
  const fade = () => {
    flash.t += 0.05;
    flame.scale.setScalar(Math.max(0, 1 - flash.t));
    cakeData.flameLight.intensity = Math.max(0, 4.2 * (1 - flash.t));
    flame.traverse(o => {
      if (o.material) {
        o.material.transparent = true;
        o.material.opacity = Math.max(0, (o.material.userData.baseOpacity ?? 1) * (1 - flash.t));
      }
    });
    if (flash.t < 1) requestAnimationFrame(fade);
    else flame.visible = false;
  };
  flame.traverse(o => {
    if (o.material) o.material.userData.baseOpacity = o.material.opacity ?? 1;
  });
  fade();

  // 烟 + 烟花
  smoke.puff(new THREE.Vector3(0, cakeData.candleTip.y + 0.1, 0));
  const palette = [0xff8fc7, 0xffd76e, 0x9fe8ff, 0xc9a7ff, 0xffffff];
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      fireworks.burst(
        new THREE.Vector3((Math.random() - 0.5) * 3.4, 0.6 + Math.random() * 1.8, (Math.random() - 0.5) * 1.6),
        { color: palette[i % palette.length], count: isMobile ? 80 : 130, power: 1.15 }
      );
    }, i * 180);
  }
  music.ding();
}

dom.cta.addEventListener('click', blowOut);

// ---------- 重播 ----------
dom.btnReplay.addEventListener('click', () => {
  location.reload();
});

// ---------- 音乐（Web Audio 分解和弦） ----------
const music = {
  ctx: null,
  timer: null,
  on: false,
  chords: [
    [261.63, 329.63, 392.00, 523.25],
    [220.00, 261.63, 329.63, 440.00],
    [174.61, 220.00, 261.63, 349.23],
    [196.00, 246.94, 293.66, 392.00]
  ],
  idx: 0,
  note: 0,
  tryStart() {
    if (this.on) return;
    if (navigator.userActivation && !navigator.userActivation.isActive) return;

    // 预留：配置了 audio 就用外部音乐文件
    if (CFG.audio) {
      try {
        if (!this.el) {
          this.el = new Audio(CFG.audio);
          this.el.loop = true;
          this.el.volume = 0.55;
        }
        this.el.play().then(() => {
          this.on = true;
          dom.btnSound.setAttribute('aria-pressed', 'true');
        }).catch(() => {});
      } catch (_) { /* 静默降级 */ }
      return;
    }

    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = this.ctx || new AC();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.on = true;
      dom.btnSound.setAttribute('aria-pressed', 'true');
      this.tick();
      this.timer = setInterval(() => this.tick(), 420);
    } catch (_) { /* 静默降级 */ }
  },
  stop() {
    this.on = false;
    dom.btnSound.setAttribute('aria-pressed', 'false');
    if (this.el) this.el.pause();
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  },

  // 在用户手势内解锁音频元素（手机 Safari 必须先 play 过一次）
  prime() {
    if (!CFG.audio || this.el) return;
    try {
      this.el = new Audio(CFG.audio);
      this.el.loop = true;
      this.el.volume = 0.55;
      this.el.preload = 'auto';
      const p = this.el.play();
      if (p && p.then) {
        p.then(() => { this.el.pause(); this.el.currentTime = 0; }).catch(() => {});
      } else {
        this.el.pause();
        this.el.currentTime = 0;
      }
    } catch (_) { /* 静默降级 */ }
  },
  tick() {
    if (!this.on || !this.ctx) return;
    const chord = this.chords[this.idx % this.chords.length];
    const f = chord[this.note % chord.length];
    this.note++;
    if (this.note % 8 === 0) this.idx++;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.05, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 1.5);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 1.6);
  },
  ding() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [1046.5, 1318.5, 1568].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.09);
      g.gain.linearRampToValueAtTime(0.09, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0005, t + i * 0.09 + 1.2);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start(t + i * 0.09);
      o.stop(t + i * 0.09 + 1.3);
    });
  }
};

dom.btnSound.addEventListener('click', () => {
  if (music.on) music.stop(); else music.tryStart();
});

// ---------- 动画循环 ----------
let last = performance.now();
let acc = 0;

function animate(now) {
  requestAnimationFrame(animate);

  // 视频幕：完全不渲染 3D，把 GPU 让给视频
  if (state === 'video') {
    last = now;
    return;
  }

  const dtRaw = Math.min(0.05, (now - last) / 1000);
  last = now;

  // 手机 40fps / 桌面 62fps 节流
  const targetFps = isMobile ? 40 : 62;
  acc += dtRaw;
  if (acc < 1 / targetFps) return;
  const dt = acc;
  acc = 0;

  const t = now * 0.001;
  setSparkTime(t);

  // 幕1：便签沿心形路径依次展开（像一笔画出来）
  if (heartGroup.visible) {
    heartT = Math.min(1, heartT + dt * 0.26);
    const seg = 0.86 / notes.length;
    let tipIdx = 0;
    for (const n of notes) {
      const start = n.index * seg;
      const p = THREE.MathUtils.clamp((heartT - start) / (seg * 3.0), 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      n.mesh.position.lerpVectors(n.from, n.home, e);
      // 每张便签独立的轻微浮动，形成"呼吸感"
      const bob = Math.sin(t * 1.35 + n.index * 0.45) * 0.016 * e;
      n.mesh.position.y += bob;
      n.mesh.position.z += Math.sin(t * 0.9 + n.index * 0.7) * 0.01 * e;
      const breathe = 1 + Math.sin(t * 1.2 + n.index * 0.35) * 0.012;
      n.mesh.scale.setScalar((0.45 + 0.55 * e) * breathe);
      n.mesh.rotation.z = n.rot + Math.sin(t * 0.5 + n.index * 0.2) * 0.012;
      for (const m of n.mesh.material) m.opacity = e;
      n.shadowMat.opacity = 0.22 * e;
      if (heartT >= start) tipIdx = n.index;
    }

    // 画笔跟着进度走
    const head = notes[tipIdx];
    pen.position.copy(head.mesh.position);
    pen.position.z += 0.06;
    const penFade = heartT < 0.9 ? 1 : Math.max(0, (1 - heartT) / 0.1);
    pen.material.opacity = 0.9 * penFade;
    pen.scale.setScalar((0.5 + Math.sin(t * 9) * 0.06) * penFade);

    heartGroup.rotation.y = Math.sin(t * 0.25) * 0.06 + heartSpin;
    heartGroup.rotation.x = Math.sin(t * 0.18) * 0.03;
    heartSpin += (heartSpinTarget - heartSpin) * 0.12;

    // 爱心画完后再浮出中心白卡
    if (heartT > 0.9 && !dom.centerCard.classList.contains('show')) {
      dom.centerCard.classList.add('show');
    }
  }

  // 幕2：蛋糕（星海 → 漩涡 → 成型）
  if (cake.visible) {
    if (assembleT < 1) {
      assembleT = Math.min(1, assembleT + dt * 0.42);
      assemble.update(assembleT);
      if (assembleT >= 1) assemble.mesh.visible = false;
    }

    // 漩涡收拢后，蛋糕才从中心长出来（不再从下往上弹）
    const show = THREE.MathUtils.clamp((assembleT - 0.62) / 0.3, 0, 1);
    const se = 1 - Math.pow(1 - show, 3);
    const base = isMobile ? 1.12 : 1.0;
    cake.scale.setScalar(base * (0.06 + 0.94 * se));
    cake.position.y = 0;

    cakeTargetYaw += dt * 0.2 + inertia;
    inertia *= 0.9;
    cakeYaw += (cakeTargetYaw - cakeYaw) * 0.12;
    cake.rotation.y = cakeYaw;
    cake.rotation.x = cakePitch;

    if (state === 'cake') {
      const f = 1 + Math.sin(t * 13) * 0.08 + Math.sin(t * 27) * 0.04;
      cakeData.flame.scale.set(1 + Math.sin(t * 9) * 0.04, f, 1 + Math.cos(t * 11) * 0.04);
      cakeData.flame.position.x = (cakeData.flameX || 0) + Math.sin(t * 2.2) * 0.012;
      cakeData.flameLight.intensity = 4.2 + Math.sin(t * 17) * 0.6;
    }

    cakeData.ringA.rotation.z += dt * 0.06;
    cakeData.ringB.rotation.z -= dt * 0.04;

    // 星尘的漂移与闪烁全部在 shader 里算（CPU 不再逐点写 position），
    // 这里只推进整体朝向，让万千光点跟着蛋糕一起缓缓转身
    stardust.rotation.y = cakeYaw * 0.08 + t * 0.004;
    streams.rotation.y = cakeYaw * 0.55;
  }

  smoke.update(dt);
  fireworks.update(dt);

  // 背景星云漂移 + 星河渐亮（从纯黑里一点点亮起来）
  if (nebulaField.visible) {
    bgReveal = Math.min(1, bgReveal + dt * 0.34);
    const rv = bgReveal * bgReveal * (3 - 2 * bgReveal);

    for (let i = 0; i < nebulaField.children.length; i++) {
      const sp = nebulaField.children[i];
      sp.position.y = sp.userData.baseY + Math.sin(t * 0.18 + sp.userData.phase) * 0.9;
      // 星云压淡：参考画面背景接近纯黑，大片彩色雾会把蛋糕衬得发灰
      sp.material.opacity = (0.10 + Math.sin(t * 0.32 + i) * 0.035) * rv;
    }
    stardust.userData.setOpacity(0.92 * rv);
    starfield.userData.setOpacity(0.78 * rv);
    streams.userData.setOpacity(0.90 * rv);
    galaxyBand.material.uniforms.uOpacity.value = 0.95 * rv;
    galaxyBand.rotation.y = t * 0.012 + cakeYaw * 0.32;
    galaxyBand.rotation.z = Math.sin(t * 0.06) * 0.05;
    if (galaxyBand.userData.update) galaxyBand.userData.update(t);
    starfield.rotation.y = cakeYaw * 0.16;
  }

  // 涟漪扩散
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.life += dt;
    const k = r.life / r.ttl;
    r.mesh.scale.setScalar(1 + k * 7);
    r.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
    if (k >= 1) {
      scene.remove(r.mesh);
      r.mesh.material.dispose();
      ripples.splice(i, 1);
    }
  }

  // 蛋糕幕：常驻小烟花 + 星环脉动
  if (cake.visible) {
    if (state === 'cake') {
      fwTimer += dt;
      if (fwTimer > 2.6) {
        fwTimer = 0;
        const palette = [0xff8fc7, 0xffd76e, 0x9fe8ff, 0xc9a7ff, 0xffffff];
        fireworks.burst(
          new THREE.Vector3(
            (Math.random() - 0.5) * 3.4,
            0.5 + Math.random() * 2.4,
            -0.4 - Math.random() * 1.2
          ),
          {
            color: palette[(Math.random() * palette.length) | 0],
            count: isMobile ? 46 : 76,
            power: 0.8,
            ttl: 1.7
          }
        );
      }
    }
    // 三条环绕光带：倾角缓缓摆动。
    // 椭圆环绕 Y 轴旋转形状不变（看起来像静止），所以动的是倾角而不是转角
    const rock = (m, i) => {
      if (!m) return;
      if (!m.userData.baseRot) {
        m.userData.baseRot = { x: m.rotation.x, z: m.rotation.z };
      }
      m.rotation.x = m.userData.baseRot.x + Math.sin(t * 0.52 + i * 1.7) * 0.070;
      m.rotation.z = m.userData.baseRot.z + Math.cos(t * 0.44 + i * 1.1) * 0.070;
    };
    rock(cakeData.ringA, 0);
    rock(cakeData.ringB, 1);
    rock(cakeData.ringC, 2);

    cakeData.ringA.scale.setScalar(1 + Math.sin(t * 1.4) * 0.012);
    cakeData.ringB.scale.setScalar(1 + Math.sin(t * 1.1 + 1) * 0.016);
    // 大星芒：自转 + 呼吸
    if (cakeData.bigStars && cakeData.bigStars.userData.update) {
      cakeData.bigStars.userData.update(t);
    }
    cakeData.ringA.scale.setScalar(1 + Math.sin(t * 1.4) * 0.012);
    cakeData.ringB.scale.setScalar(1 + Math.sin(t * 1.1 + 1) * 0.016);
    if (cakeData.dust && cakeData.dust.update) cakeData.dust.update(t);

    // 气球：从屏幕外的锚点沿绳子滑入 + 漂浮 + 爆掉/复原
    for (const b of balloons) {
      if (!b.group.visible) continue;

      // 入场：沿锚点→目标位置的直线滑入
      b.enter = Math.min(1, b.enter + dt * 0.7);
      const en = 1 - Math.pow(1 - b.enter, 3);

      b.grow += ((b.alive ? 1 : 0) - b.grow) * 0.14;
      const sc = b.scaleBase * Math.max(0.001, b.grow);
      b.group.scale.setScalar(sc);

      const bx = b.anchor.x + (b.target.x - b.anchor.x) * en;
      const by = b.anchor.y + (b.target.y - b.anchor.y) * en;
      const bz = b.anchor.z + (b.target.z - b.anchor.z) * en;

      // 风吹摆动：绕绳子固定点做钟摆
      const gust = Math.sin(t * 0.24 + b.phase * 0.4) * 0.035;
      const swing = (Math.sin(t * 0.9 + b.phase) * 0.16 + Math.sin(t * 2.3 + b.phase * 1.6) * 0.05 + gust) * en;
      const pivot = 0.45 * sc;
      let px = bx - Math.sin(swing) * pivot;
      let py = by - (1 - Math.cos(swing)) * pivot + Math.sin(t * 0.85 + b.phase) * 0.06 * en;
      const pz = bz;

      // 硬约束：入场、摆动、缩放任何时刻都不许落到蛋糕顶面以下，
      // 否则透视放大后就会在屏幕上压进蛋糕
      if (BALLOON_MIN_Y > 0 && py < BALLOON_MIN_Y) py = BALLOON_MIN_Y;

      b.group.position.set(px, py, pz);
      b.group.rotation.z = swing;

      // 绳子：锚点 → 气球底部（保持圆柱朝向下一个点）
      if (b.string) {
        // 线系在气球顶部，向上牵出画面
        const tie = new THREE.Vector3(px, py + 0.46 * sc, pz);
        const dir = tie.clone().sub(b.anchor);
        const len = dir.length();
        b.string.position.copy(b.anchor);
        b.string.scale.set(1, Math.max(0.001, len), 1);
        b.string.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        b.string.material.opacity = 0.14 * b.grow * Math.min(1, en * 2);
      }
    }
  }

  // 相机：按幕切换距离 + 缩放，平滑跟随
  const cakeScene = state === 'cake' || state === 'blown';
  const targetZ = (cakeScene ? dCake : dHeart) * zoom;
  const targetY = cakeScene ? dCake * 0.32 : 0;
  camera.position.z += (targetZ - camera.position.z) * 0.1;
  camera.position.y += (targetY - camera.position.y) * 0.1;
  camera.lookAt(0, 0, 0);

  // 蛋糕幕走泛光后处理（朦胧光感）；其余幕直接渲染，省掉一次 RT 链路
  if (cake.visible) bloom.render();
  else renderer.render(scene, camera);
}

// ---------- 尺寸 ----------
let resizeTimer = null;

// 调试钩子：本地排查用，不影响正式行为
window.__DBG = () => ({
  state,
  assembleT: +assembleT.toFixed(3),
  cakeScale: +cake.scale.x.toFixed(3),
  cakeVis: cake.visible,
  dCake: +dCake.toFixed(2),
  camZ: +camera.position.z.toFixed(2),
  isMobile,
  balloons: balloons.map(b => ({
    x: +b.group.position.x.toFixed(2),
    y: +b.group.position.y.toFixed(2),
    z: +b.group.position.z.toFixed(2)
  }))
});
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    fitCamera();
    if (state === 'video') sizeIntroCanvas();
  }, 120);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (music.timer) { clearInterval(music.timer); music.timer = null; }
  } else if (music.on) {
    music.timer = setInterval(() => music.tick(), 420);
  }
});

// ---------- 启动 ----------
fitCamera();
requestAnimationFrame(animate);
setTimeout(() => dom.loading.classList.add('gone'), 700);
