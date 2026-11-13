/**
 * 主控：两幕场景
 *   幕1 便签爱心（浅粉）→ 幕2 星河蛋糕（深空）
 */
import * as THREE from '../vendor/three.module.min.js';
import { createNoteTexture, noteLayout } from './cards.js';
import { createConfetti, createStarfield, Smoke, Fireworks } from './particles.js';
import { createCake } from './cake.js';

const CFG = window.BIRTHDAY_CONFIG || {};
const cards = CFG.cards || [{ short: '生日快乐', full: '生日快乐' }];

const isMobile =
  matchMedia('(max-width: 820px)').matches ||
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

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
  script: document.getElementById('scriptWord')
};

// ---------- 配置文案注入 ----------
const qs = new URLSearchParams(location.search);
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
scene.add(heartGroup);

const noteW = isMobile ? 0.46 : 0.62;
const noteH = noteW * (298 / 224);

const notes = [];
layout.notes.forEach((n, i) => {
  const data = cards[i % cards.length];
  const tex = createNoteTexture(data, i);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  mat.opacity = 0;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(noteW, noteH), mat);
  mesh.position.set(0, 0, -1);
  mesh.rotation.z = n.rot;
  mesh.scale.setScalar(0.4);
  heartGroup.add(mesh);
  notes.push({
    mesh,
    home: new THREE.Vector3(n.x, n.y, n.z),
    rot: n.rot,
    delay: i * 0.022,
    index: i,
    data
  });
});

// 中心白卡（DOM）由 start() 控制显示

// ---------- 蛋糕 ----------
const cake = createCake();
cake.visible = false;
cake.scale.setScalar(isMobile ? 1.12 : 1.0);
scene.add(cake);
const cakeData = cake.userData;

// ---------- 粒子 ----------
const confetti = createConfetti(isMobile ? 420 : 900, 14);
confetti.visible = false;
scene.add(confetti);

const starfield = createStarfield(isMobile ? 500 : 1200);
starfield.visible = false;
scene.add(starfield);

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
    cakeTargetYaw += dx * 0.007;
    inertia = dx * 0.007;
    cakePitch = THREE.MathUtils.clamp(cakePitch + dy * 0.0018, -0.3, 0.4);
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
  if (state === 'cake') {
    pick(e.clientX, e.clientY);
    const hits = raycaster.intersectObject(cake, true);
    if (hits.length) blowOut();
  }
});

function openCard(note) {
  dom.modalNo.textContent = 'NO. ' + String(note.index + 1).padStart(2, '0');
  dom.modalTitle.textContent = note.data.short;
  dom.modalText.textContent = note.data.full;
  dom.modal.hidden = false;
}

dom.modalClose.addEventListener('click', () => { dom.modal.hidden = true; });
dom.modal.addEventListener('click', e => {
  if (e.target === dom.modal) dom.modal.hidden = true;
});

// ---------- 开场 ----------
function start() {
  if (state !== 'idle') return;
  state = 'heart';
  dom.gate.classList.add('gone');
  dom.loading.classList.add('gone');
  heartGroup.visible = true;
  camera.position.z = dHeart;
  dom.hint.classList.add('on');
  setTimeout(() => dom.centerCard.classList.add('show'), 700);
  setTimeout(() => dom.hint.classList.remove('on'), 6000);
}

// 真实手势（pointerdown）才创建 AudioContext，避免自动播放策略告警
dom.btnStart.addEventListener('pointerdown', () => music.tryStart(), { once: true });

dom.btnStart.addEventListener('click', start);

// ---------- 进入蛋糕幕 ----------
function goCake() {
  if (state !== 'heart') return;
  state = 'cake';
  dom.centerCard.classList.remove('show');
  dom.hint.classList.remove('on');
  dom.script.style.opacity = '0';
  document.body.classList.add('dark');

  heartGroup.visible = false;
  cake.visible = true;
  cake.scale.setScalar(0.4);
  cake.position.y = -3;
  confetti.visible = true;
  starfield.visible = true;
  camera.position.z = dCake;
  camera.position.y = dCake * 0.24;
  camera.lookAt(0, 0, 0);
  dom.cta.classList.add('on');
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
  const dtRaw = Math.min(0.05, (now - last) / 1000);
  last = now;

  // 手机 40fps / 桌面 62fps 节流
  const targetFps = isMobile ? 40 : 62;
  acc += dtRaw;
  if (acc < 1 / targetFps) return;
  const dt = acc;
  acc = 0;

  const t = now * 0.001;

  // 幕1：便签飞出 + 轻微呼吸
  if (heartGroup.visible) {
    heartT = Math.min(1, heartT + dt * 0.85);
    for (const n of notes) {
      const p = THREE.MathUtils.clamp((heartT - n.delay) / (1 - n.delay || 1), 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      n.mesh.position.lerpVectors(new THREE.Vector3(0, 0, -1), n.home, e);
      const breathe = 1 + Math.sin(t * 1.2 + n.index * 0.35) * 0.012;
      n.mesh.scale.setScalar((0.4 + 0.6 * e) * breathe);
      n.mesh.rotation.z = n.rot + Math.sin(t * 0.5 + n.index * 0.2) * 0.012;
      n.mesh.material.opacity = e;
    }
    heartGroup.rotation.y = Math.sin(t * 0.25) * 0.06 + heartSpin;
    heartGroup.rotation.x = Math.sin(t * 0.18) * 0.03;
    heartSpin += (heartSpinTarget - heartSpin) * 0.12;
  }

  // 幕2：蛋糕
  if (cake.visible) {
    const grow = Math.min(1, (cake.userData.growT = (cake.userData.growT || 0) + dt * 1.2));
    const ge = 1 - Math.pow(1 - grow, 3);
    const base = isMobile ? 1.12 : 1.0;
    cake.scale.setScalar(base * (0.4 + 0.6 * ge));
    cake.position.y = -3 + 3 * ge;

    cakeTargetYaw += dt * 0.2 + inertia;
    inertia *= 0.93;
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
