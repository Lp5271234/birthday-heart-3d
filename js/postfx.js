/**
 * 泛光后处理（朦胧光感）
 *
 * 为什么必须做真的后处理：
 *   贴图/sprite 只能让"某个物体"发光，做不出"亮的地方向四周溢出柔光"的效果。
 *   参考画面那种朦胧感，是亮部经过高斯扩散后叠回原图得到的。
 *
 * 流程（全部在 GPU 上，低分辨率链路，手机也能跑）：
 *   1. 场景渲染到 sceneRT（1x）
 *   2. 亮度提取（软膝阈值）→ 1/2 分辨率
 *   3. 两轮可分离高斯模糊（水平+垂直）→ 1/4 分辨率
 *   4. 合成：sceneRT + bloom*strength，另加雾气抬升与暗角，最后 linear → sRGB
 */
import * as THREE from '../vendor/three.module.min.js';

const QUAD_VERT = [
  'varying vec2 vUv;',
  'void main(){',
  '  vUv = uv;',
  '  gl_Position = vec4(position.xy, 0.0, 1.0);',
  '}'
].join('\n');

const BRIGHT_FRAG = [
  'precision highp float;',
  'uniform sampler2D tDiffuse;',
  'uniform float uThreshold;',
  'uniform float uKnee;',
  'varying vec2 vUv;',
  'void main(){',
  '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
  '  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));',
  '  float knee = uThreshold * uKnee + 1e-5;',
  '  float soft = clamp(lum - uThreshold + knee, 0.0, 2.0 * knee);',
  '  soft = soft * soft / (4.0 * knee + 1e-5);',
  '  float contrib = max(soft, lum - uThreshold) / max(lum, 1e-5);',
  '  gl_FragColor = vec4(c * max(contrib, 0.0), 1.0);',
  '}'
].join('\n');

const BLUR_FRAG = [
  'precision highp float;',
  'uniform sampler2D tDiffuse;',
  'uniform vec2 uDir;',
  'varying vec2 vUv;',
  'void main(){',
  '  vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.227027;',
  '  sum += (texture2D(tDiffuse, vUv + uDir * 1.3846).rgb',
  '        + texture2D(tDiffuse, vUv - uDir * 1.3846).rgb) * 0.3162162;',
  '  sum += (texture2D(tDiffuse, vUv + uDir * 3.2308).rgb',
  '        + texture2D(tDiffuse, vUv - uDir * 3.2308).rgb) * 0.0702702;',
  '  gl_FragColor = vec4(sum, 1.0);',
  '}'
].join('\n');

const COMPOSITE_FRAG = [
  'precision highp float;',
  'uniform sampler2D tScene;',
  'uniform sampler2D tBloom;',
  'uniform float uStrength;',
  'uniform vec3 uHaze;',
  'uniform float uHazeAmount;',
  'uniform float uVignette;',
  'varying vec2 vUv;',
  'void main(){',
  '  vec3 base = texture2D(tScene, vUv).rgb;',
  '  vec3 bloom = texture2D(tBloom, vUv).rgb;',
  '  vec3 col = base + bloom * uStrength;',
  // 雾气：把暗部整体抬一点，画面才有"朦胧"而不是死黑
  '  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));',
  '  col += uHaze * uHazeAmount * (1.0 - smoothstep(0.0, 0.55, lum));',
  // 暗角
  '  float d = distance(vUv, vec2(0.5));',
  '  col *= 1.0 - smoothstep(0.42, 0.98, d) * uVignette;',
  // linear -> sRGB（渲染到 RT 时 three 不做输出色彩空间转换）
  '  col = pow(max(col, 0.0), vec3(1.0 / 2.2));',
  '  gl_FragColor = vec4(col, 1.0);',
  '}'
].join('\n');

export class BloomComposer {
  constructor(renderer, scene, camera, opts = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.threshold = opts.threshold ?? 0.62;
    this.knee = opts.knee ?? 0.55;
    this.strength = opts.strength ?? 1.15;
    this.hazeAmount = opts.hazeAmount ?? 0.055;
    this.vignette = opts.vignette ?? 0.34;
    // 场景 RT 相对 drawingBuffer 的缩放：手机用 0.8 换回帧率
    this.renderScale = opts.renderScale ?? 1.0;
    this.hazeColor = new THREE.Color(opts.haze ?? 0x2a2a6a);

    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this.brightMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: this.threshold },
        uKnee: { value: this.knee }
      },
      vertexShader: QUAD_VERT,
      fragmentShader: BRIGHT_FRAG,
      depthTest: false,
      depthWrite: false
    });

    this.blurMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDir: { value: new THREE.Vector2(1, 0) }
      },
      vertexShader: QUAD_VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false
    });

    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uStrength: { value: this.strength },
        uHaze: { value: this.hazeColor },
        uHazeAmount: { value: this.hazeAmount },
        uVignette: { value: this.vignette }
      },
      vertexShader: QUAD_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false
    });

    this.sceneRT = null;
    this.brightRT = null;
    this.blurA = null;
    this.blurB = null;
    this.size = new THREE.Vector2(1, 1);
  }

  setSize(width, height) {
    const w = Math.max(2, Math.floor(width));
    const h = Math.max(2, Math.floor(height));
    if (w === this.size.x && h === this.size.y && this.sceneRT) return;
    this.size.set(w, h);

    const dispose = rt => { if (rt) rt.dispose(); };

    const make = (rw, rh) => new THREE.WebGLRenderTarget(
      Math.max(2, Math.floor(rw)),
      Math.max(2, Math.floor(rh)),
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        type: THREE.HalfFloatType,
        depthBuffer: true,
        stencilBuffer: false
      }
    );

    dispose(this.sceneRT);
    dispose(this.brightRT);
    dispose(this.blurA);
    dispose(this.blurB);

    this.sceneRT = make(w * this.renderScale, h * this.renderScale);
    this.brightRT = make(w / 2, h / 2);
    this.blurA = make(w / 4, h / 4);
    this.blurB = make(w / 4, h / 4);
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  render() {
    const r = this.renderer;
    if (!this.sceneRT) {
      r.render(this.scene, this.camera);
      return;
    }

    // 1. 场景 → sceneRT
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(this.scene, this.camera);

    // 2. 亮度提取 → 1/2
    this.brightMat.uniforms.tDiffuse.value = this.sceneRT.texture;
    this.pass(this.brightMat, this.brightRT);

    // 3. 水平 + 垂直模糊，跑两轮（1/4 分辨率）
    const texel = new THREE.Vector2(1 / this.blurA.width, 1 / this.blurA.height);

    this.blurMat.uniforms.tDiffuse.value = this.brightRT.texture;
    this.blurMat.uniforms.uDir.value.set(texel.x, 0);
    this.pass(this.blurMat, this.blurA);

    this.blurMat.uniforms.tDiffuse.value = this.blurA.texture;
    this.blurMat.uniforms.uDir.value.set(0, texel.y);
    this.pass(this.blurMat, this.blurB);

    this.blurMat.uniforms.tDiffuse.value = this.blurB.texture;
    this.blurMat.uniforms.uDir.value.set(texel.x * 1.8, 0);
    this.pass(this.blurMat, this.blurA);

    this.blurMat.uniforms.tDiffuse.value = this.blurA.texture;
    this.blurMat.uniforms.uDir.value.set(0, texel.y * 1.8);
    this.pass(this.blurMat, this.blurB);

    // 4. 合成到屏幕
    this.compositeMat.uniforms.tScene.value = this.sceneRT.texture;
    this.compositeMat.uniforms.tBloom.value = this.blurB.texture;
    this.quad.material = this.compositeMat;
    r.setRenderTarget(null);
    r.clear();
    r.render(this.quadScene, this.quadCamera);
  }
}
