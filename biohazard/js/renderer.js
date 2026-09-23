'use strict';
// Minimal WebGL2 renderer: one static world mesh + a unit cube drawn with per-draw transforms.
// Surfaces get procedural patterns (wood, marble, wallpaper...) and up to 8 point lights, fog and film grain.
const Renderer = (() => {
  const MAX_LIGHTS = 8;
  let gl, canvas, U = {}, cube, world = null;

  const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aMat;
uniform mat4 uVP, uModel;
uniform vec3 uTint;
uniform float uMat;
out vec3 vPos; out vec3 vNrm; out vec3 vCol; flat out int vMat;
void main(){
  vec4 wp = uModel * vec4(aPos, 1.0);
  vPos = wp.xyz;
  vNrm = normalize(mat3(uModel) * aNrm);
  vCol = aCol * uTint;
  vMat = int((uMat >= 0.0 ? uMat : aMat) + 0.5);
  gl_Position = uVP * wp;
}`;

  const FS = `#version 300 es
precision highp float;
in vec3 vPos; in vec3 vNrm; in vec3 vCol; flat in int vMat;
uniform vec3 uCam, uAmb, uFog;
uniform float uFogD, uTime;
uniform int uNL;
uniform vec3 uLP[${MAX_LIGHTS}];
uniform vec3 uLC[${MAX_LIGHTS}];
uniform float uLR[${MAX_LIGHTS}];
out vec4 o;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }

vec3 pattern(int m, vec3 c, vec3 p, vec3 n){
  vec2 uv = abs(n.y) > 0.5 ? p.xz : (abs(n.x) > 0.5 ? vec2(p.z, p.y) : vec2(p.x, p.y));
  if (m == 1) { // wood planks
    float row = uv.y * 3.0, id = floor(row), fr = fract(row);
    float x = uv.x + h21(vec2(id, 1.0)) * 7.0;
    float g = fbm(vec2(x * 0.7, row * 5.0)) * 0.45 + sin(x * 2.0 + fbm(vec2(x, row)) * 6.0) * 0.06;
    float seam = max(smoothstep(0.06, 0.0, fr), smoothstep(0.94, 1.0, fr));
    float plank = 0.85 + 0.3 * h21(vec2(id, floor(x / 2.3)));
    return c * (0.7 + g) * plank * (1.0 - 0.55 * seam);
  }
  if (m == 2) { // marble checker
    float chk = mod(floor(uv.x) + floor(uv.y), 2.0);
    vec3 col = mix(c, c * vec3(0.22, 0.2, 0.2), chk);
    float v = abs(sin(uv.x * 1.7 + uv.y * 0.9 + fbm(uv * 1.8) * 6.0));
    col *= 0.82 + 0.18 * smoothstep(0.0, 0.12, v);
    vec2 f = abs(fract(uv) - 0.5);
    col *= 1.0 - 0.4 * smoothstep(0.47, 0.5, max(f.x, f.y));
    return col;
  }
  if (m == 3) { // wallpaper with wainscot
    if (p.y < 1.0) {
      vec3 w = vec3(0.24, 0.13, 0.07) * (0.7 + 0.4 * fbm(vec2(uv.x * 1.5, p.y * 8.0)));
      float panel = smoothstep(0.03, 0.0, abs(fract(uv.x / 1.2) - 0.5) - 0.45);
      return w * (1.0 - 0.35 * panel) * mix(0.55, 1.0, smoothstep(0.0, 0.25, p.y));
    }
    if (p.y < 1.09) return vec3(0.3, 0.18, 0.09);
    float st = smoothstep(0.45, 0.5, abs(fract(uv.x * 2.5) - 0.5) * 2.0);
    float motif = smoothstep(0.35, 0.2, length(fract(vec2(uv.x * 2.5, p.y * 2.5 + floor(uv.x * 2.5) * 0.5)) - 0.5));
    vec3 col = c * (0.85 + 0.12 * st + 0.18 * motif);
    col *= 0.75 + 0.35 * fbm(uv * 1.3 + 7.0);
    col *= mix(1.0, 0.55, smoothstep(2.3, 3.2, p.y) * fbm(uv * 3.0)); // damp stains near ceiling
    return col;
  }
  if (m == 4) { // stone / plaster
    return c * (0.55 + 0.6 * fbm(uv * 2.2)) * (0.9 + 0.1 * vn(uv * 25.0));
  }
  if (m == 5) { // carpet
    vec2 d = abs(fract(uv * 0.8) - 0.5);
    float motif = smoothstep(0.04, 0.0, abs(d.x + d.y - 0.35));
    vec3 col = c * (0.75 + 0.3 * vn(uv * 30.0));
    return mix(col, vec3(0.55, 0.42, 0.15), motif * 0.45);
  }
  if (m == 6) { // metal tiles
    vec2 f = abs(fract(uv * 1.0) - 0.5);
    float line = smoothstep(0.46, 0.5, max(f.x, f.y));
    return c * (0.8 + 0.25 * vn(uv * 6.0) + 0.1 * vn(uv * 40.0)) * (1.0 - 0.5 * line);
  }
  if (m == 8) { // bookshelf
    if (abs(n.y) > 0.5) return c;
    float row = floor(p.y / 0.5), sh = fract(p.y / 0.5);
    float bx = uv.x * 13.0 + h21(vec2(row, 7.0)) * 10.0, bid = floor(bx);
    float r1 = h21(vec2(bid, row)), r2 = h21(vec2(bid, row + 9.0));
    vec3 bc = mix(vec3(0.38, 0.08, 0.06), vec3(0.08, 0.18, 0.12), r1);
    bc = mix(bc, vec3(0.1, 0.12, 0.28), step(0.7, r2)) * (0.6 + 0.5 * h21(vec2(bid, row + 3.0)));
    float top = 0.7 + 0.22 * r2;
    if (sh < 0.1 || p.y < 0.1) return c;
    if (sh > top) return c * 0.25;
    float edge = smoothstep(0.08, 0.0, fract(bx)) * 0.5;
    return bc * (1.0 - edge);
  }
  if (m == 9) return c * (0.82 + 0.25 * vn(p.xz * 18.0 + p.y * 18.0));
  if (m == 10) return c * (0.6 + 0.6 * vn(p.xz * 9.0));
  return c * (0.88 + 0.14 * fbm(uv * 3.0));
}

void main(){
  vec3 N = normalize(vNrm);
  vec3 base = pattern(vMat, vCol, vPos, N);
  vec3 col;
  if (vMat == 7) {
    col = base;
  } else {
    vec3 lit = uAmb * (0.65 + 0.35 * max(N.y, 0.0));
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (i >= uNL) break;
      vec3 d = uLP[i] - vPos;
      float r = length(d);
      float a = clamp(1.0 - r / uLR[i], 0.0, 1.0);
      a *= a;
      float df = max(dot(N, d / max(r, 1e-4)), 0.0) * 0.8 + 0.2;
      lit += uLC[i] * a * df;
    }
    col = base * lit;
  }
  float dist = length(vPos - uCam);
  col = mix(uFog, col, exp(-dist * uFogD));
  col = col / (1.0 + col * 0.45);
  float g = h21(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0);
  col += (g - 0.5) * 0.05;
  o = vec4(col, 1.0);
}`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function makeMesh(verts, idx) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    const stride = 40;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    return { vao, count: idx.length };
  }

  function init(cv) {
    canvas = cv;
    gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 が使えません');
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    for (const n of ['uVP', 'uModel', 'uTint', 'uMat', 'uCam', 'uAmb', 'uFog', 'uFogD', 'uTime', 'uNL', 'uLP', 'uLC', 'uLR']) {
      U[n] = gl.getUniformLocation(prog, n) || gl.getUniformLocation(prog, n + '[0]');
    }
    // Unit cube centred on the origin.
    const mb = new MeshBuilder();
    mb.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, [1, 1, 1], 0, true);
    cube = mb.build();
    gl.enable(gl.DEPTH_TEST);
  }

  function setWorld(mb) { world = mb.build(); }

  function resize(w, h) {
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
  }

  const lp = new Float32Array(MAX_LIGHTS * 3), lc = new Float32Array(MAX_LIGHTS * 3), lr = new Float32Array(MAX_LIGHTS);
  function begin(v) {
    const asp = canvas.width / canvas.height;
    const vp = M4.mul(M4.persp(v.fov * Math.PI / 180, asp, 0.08, 80), M4.lookAt(v.eye, v.target, [0, 1, 0]));
    gl.clearColor(v.fog[0], v.fog[1], v.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(U.uVP, false, vp);
    gl.uniform3fv(U.uCam, v.eye);
    gl.uniform3fv(U.uAmb, v.amb);
    gl.uniform3fv(U.uFog, v.fog);
    gl.uniform1f(U.uFogD, v.fogD);
    gl.uniform1f(U.uTime, v.time);
    const n = Math.min(v.lights.length, MAX_LIGHTS);
    for (let i = 0; i < n; i++) {
      const L = v.lights[i];
      lp.set(L.p, i * 3); lc.set(L.c, i * 3); lr[i] = L.r;
    }
    gl.uniform1i(U.uNL, n);
    gl.uniform3fv(U.uLP, lp);
    gl.uniform3fv(U.uLC, lc);
    gl.uniform1fv(U.uLR, lr);
  }

  const I = M4.ident(), ONE = new Float32Array([1, 1, 1]);
  function drawWorld() {
    if (!world) return;
    gl.uniformMatrix4fv(U.uModel, false, I);
    gl.uniform3fv(U.uTint, ONE);
    gl.uniform1f(U.uMat, -1);
    gl.bindVertexArray(world.vao);
    gl.drawElements(gl.TRIANGLES, world.count, gl.UNSIGNED_INT, 0);
  }

  function box(m, col, matId) {
    gl.uniformMatrix4fv(U.uModel, false, m);
    gl.uniform3fv(U.uTint, col);
    gl.uniform1f(U.uMat, matId || 0);
    gl.bindVertexArray(cube.vao);
    gl.drawElements(gl.TRIANGLES, cube.count, gl.UNSIGNED_INT, 0);
  }

  return { init, setWorld, resize, begin, drawWorld, box, makeMesh };
})();

// Accumulates quads (pos, normal, colour, material) for the static world.
class MeshBuilder {
  constructor() { this.v = []; this.i = []; }
  quad(a, b, c, d, n, col, m) {
    const base = this.v.length / 10;
    for (const p of [a, b, c, d]) this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], m);
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  box(x0, y0, z0, x1, y1, z1, col, m, bottom) {
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], col, m);
    if (bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], col, m);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], col, m);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], col, m);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], col, m);
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], col, m);
  }
  build() { return Renderer.makeMesh(new Float32Array(this.v), new Uint32Array(this.i)); }
}
