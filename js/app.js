/**
 * 主控：两幕场景
 *   幕1 便签爱心（浅粉）→ 幕2 星河蛋糕（深空）
 */
import * as THREE from '../vendor/three.module.min.js';
import { createNoteTexture, noteLayout } from './cards.js';
import { createConfetti, createStarfield, createAssemble, createNebulaField, createGalaxyBand, Smoke, Fireworks } from './particles.js';
import { createCake } from './cake.js';

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
const DPR_CAP = isMobile ? 1.75 : 2;

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

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);

// ---------- 灯光 ----------
scene.add(new THREE.AmbientLight(0xffffff, 1.15));
const keyLight = new THREE.PointLight(0xffd9ef, 1.5, 30);
keyLight.position.set(-4, 5, 8);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0x9fd8ff, 1.1, 30);
rimLight.position.set(5, -3, 6);
scene.add(rimLight);

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

function createBalloon(color, x, y, z, scale) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.26,
    metalness: 0.04,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.22
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
  const spread = isMobile ? 1.35 : 2.1;
  // 每个气球：目标位置 + 屏幕外的绳子锚点
  const spots = [
    { x: -spread, y: 0.7, z: 0.35, s: 1.0, ax: -3.8, ay: -1.9, az: 0.9 },
    { x: spread, y: 1.0, z: 0.15, s: 0.9, ax: 3.8, ay: -1.7, az: 0.8 },
    { x: -spread * 0.78, y: 1.95, z: -0.5, s: 0.8, ax: -3.6, ay: 0.2, az: 0.5 },
    { x: spread * 0.86, y: 2.05, z: -0.6, s: 0.74, ax: 3.6, ay: 0.5, az: 0.4 },
    { x: -spread * 0.42, y: 2.6, z: -1.0, s: 0.62, ax: -1.4, ay: 5.0, az: -0.6 }
  ];

  spots.forEach((s, i) => {
    const group = createBalloon(balloonColors[i % balloonColors.length], s.ax, s.ay, s.az, s.s);
    group.visible = false;
    scene.add(group);

    // 绳子：从屏幕外锚点连到气球底部（细圆柱，比 Line 更明显）
    const stringGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 6);
    stringGeo.translate(0, 0.5, 0);
    const string = new THREE.Mesh(stringGeo, new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.42,
      depthWrite: false
    }));
    string.visible = false;
    scene.add(string);

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
const confetti = createConfetti(isMobile ? 420 : 900, 14);
confetti.visible = false;
scene.add(confetti);

const starfield = createStarfield(isMobile ? 900 : 2200);
starfield.visible = false;
scene.add(starfield);

// 背景星云 + 银河带（星河感）
const nebulaField = createNebulaField();
nebulaField.visible = false;
scene.add(nebulaField);

const galaxyBand = createGalaxyBand(isMobile ? 520 : 900);
galaxyBand.visible = false;
scene.add(galaxyBand);

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

  const cakeW = isMobile ? 3.5 : 4.2;
  const cakeH = isMobile ? 4.4 : 4.2;
  const cByW = cakeW / (2 * tan * aspect);
  const cByH = cakeH / (2 * tan);
  dCake = Math.max(cByW, cByH);

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
function start() {
  if (state !== 'idle') return;
  state = 'video';
  dom.gate.classList.add('gone');
  dom.loading.classList.add('gone');

  const v = dom.introVideo;
  if (!v) { enterCakeAfterVideo(); return; }

  dom.videoStage.hidden = false;
  // 视频播放期间把 3D 停掉，GPU 全留给视频解码，避免卡顿
  dom.canvas.style.visibility = 'hidden';
  try { v.currentTime = 0; } catch (_) {}
  const p = v.play();
  if (p && p.catch) p.catch(() => enterCakeAfterVideo());
  v.addEventListener('ended', enterCakeAfterVideo, { once: true });
}

// 视频结束后：进入星河蛋糕幕，这时才开始放背景音乐（不与视频声音重叠）
function enterCakeAfterVideo() {
  if (state !== 'video') return;
  state = 'cake-pending';
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
  confetti.visible = true;
  starfield.visible = true;
  nebulaField.visible = true;
  galaxyBand.visible = true;
  bgReveal = 0;
  starfield.material.opacity = 0;
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
      cakeData.flame.position.x = Math.sin(t * 2.2) * 0.012;
      cakeData.flameLight.intensity = 4.2 + Math.sin(t * 17) * 0.6;
    }

    cakeData.ringA.rotation.z += dt * 0.06;
    cakeData.ringB.rotation.z -= dt * 0.04;

    // 纸屑缓慢漂浮
    const arr = confetti.geometry.attributes.position.array;
    const base3 = confetti.userData.base;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] = base3[i] + Math.sin(t * 0.6 + base3[i + 1]) * 0.28;
      arr[i + 1] = base3[i + 1] + Math.sin(t * 0.45 + base3[i]) * 0.3;
      arr[i + 2] = base3[i + 2] + Math.cos(t * 0.5 + base3[i]) * 0.22;
    }
    confetti.geometry.attributes.position.needsUpdate = true;
    confetti.rotation.y = t * 0.03;
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
      sp.material.opacity = (0.24 + Math.sin(t * 0.32 + i) * 0.07) * rv;
    }
    starfield.material.opacity = 0.72 * rv;
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
    cakeData.ringA.rotation.y += dt * (cakeData.ringA.userData.speed || 0.3);
    cakeData.ringB.rotation.y += dt * (cakeData.ringB.userData.speed || -0.2);
    cakeData.ringC.rotation.y += dt * (cakeData.ringC.userData.speed || 0.14);
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
      const px = bx - Math.sin(swing) * pivot;
      const py = by - (1 - Math.cos(swing)) * pivot + Math.sin(t * 0.85 + b.phase) * 0.06 * en;
      const pz = bz;

      b.group.position.set(px, py, pz);
      b.group.rotation.z = swing;

      // 绳子：锚点 → 气球底部（保持圆柱朝向下一个点）
      if (b.string) {
        const bottom = new THREE.Vector3(px, py - 0.42 * sc, pz);
        const dir = bottom.clone().sub(b.anchor);
        const len = dir.length();
        b.string.position.copy(b.anchor);
        b.string.scale.set(1, Math.max(0.001, len), 1);
        b.string.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        b.string.material.opacity = 0.42 * b.grow * Math.min(1, en * 2);
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

  renderer.render(scene, camera);
}

// ---------- 尺寸 ----------
let resizeTimer = null;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(fitCamera, 120);
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
