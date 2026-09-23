#!/usr/bin/env node
// Generates output/anime_head.glb (+ albedo PNGs) from the procedural sculpt.
'use strict';
const fs = require('fs');
const path = require('path');
const { skin } = require('./head');
const { headGrid } = require('./topo');
const { buildHair } = require('./hair');
const { buildBody } = require('./body');
const { sampleGrid, gridSampler } = require('./mesher');
const { bakeTexture } = require('./bake');
const { skinShader, hairShader, clothShader } = require('./paint');
const { encodePNG } = require('./png');
const { writeGLB } = require('./glb');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const RES = parseFloat(args.res || '0.014'); // SDF grid used for AO only
const TEX = parseInt(args.tex || '2048', 10);
const OUT = path.resolve(args.out || path.join(__dirname, '..', 'output'));
const log = (...m) => console.log(`[${(process.uptime()).toFixed(1)}s]`, ...m);

const BOUNDS = [-1.85, -2.85, -1.45, 1.85, 1.6, 1.35];

function bakeAO(mesh, scene, { rays = 32, maxDist = 0.55 } = {}) {
  const P = mesh.positions, N = mesh.normals, nv = P.length / 3;
  const ao = new Float32Array(nv);
  // Fixed cosine-weighted directions in tangent space (Fibonacci hemisphere).
  const dirs = [];
  for (let i = 0; i < rays; i++) {
    const r = Math.sqrt((i + 0.5) / rays), a = i * 2.39996;
    dirs.push([r * Math.cos(a), r * Math.sin(a), Math.sqrt(1 - r * r)]);
  }
  for (let v = 0; v < nv; v++) {
    const nx = N[3 * v], ny = N[3 * v + 1], nz = N[3 * v + 2];
    // Orthonormal basis around the normal.
    const tx0 = Math.abs(nx) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let bx = ny * tx0[2] - nz * tx0[1], by = nz * tx0[0] - nx * tx0[2], bz = nx * tx0[1] - ny * tx0[0];
    const bl = Math.hypot(bx, by, bz); bx /= bl; by /= bl; bz /= bl;
    const cx = ny * bz - nz * by, cy = nz * bx - nx * bz, cz = nx * by - ny * bx;
    let occ = 0;
    for (const [a, b, c] of dirs) {
      const dx = a * bx + b * cx + c * nx, dy = a * by + b * cy + c * ny, dz = a * bz + b * cz + c * nz;
      let t = 0.03;
      while (t < maxDist) {
        const d = scene(P[3 * v] + dx * t, P[3 * v + 1] + dy * t, P[3 * v + 2] + dz * t);
        if (d < 0.004) { occ += 1 - (t / maxDist) * 0.5; break; }
        t += Math.max(d * 0.9, 0.01);
      }
    }
    ao[v] = 1 - occ / rays;
  }
  return ao;
}

// Laplacian smoothing of a per-vertex scalar (removes ray-pattern noise in AO).
function smoothScalar(mesh, val, iters) {
  const I = mesh.indices, n = val.length;
  const sum = new Float32Array(n), cnt = new Float32Array(n);
  for (let it = 0; it < iters; it++) {
    sum.fill(0); cnt.fill(0);
    for (let t = 0; t < I.length; t += 3) for (let c = 0; c < 3; c++) {
      const a = I[t + c], b = I[t + (c + 1) % 3];
      sum[a] += val[b]; cnt[a]++; sum[b] += val[a]; cnt[b]++;
    }
    for (let v = 0; v < n; v++) if (cnt[v]) val[v] = 0.5 * val[v] + 0.5 * sum[v] / cnt[v];
  }
  return val;
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const face = headGrid(skin, { bottomY: -1.6 });
  log(`face: ${face.positions.length / 3} verts, ${face.indices.length / 3} tris (quad grid)`);
  const hair = buildHair();
  log(`hair: ${hair.strands.length} clumps, ${hair.positions.length / 3} verts, ${hair.indices.length / 3} tris`);

  const body = buildBody();
  log(`hoodie: ${body.hoodie.indices.length / 3} tris, accessories: ${body.acc.indices.length / 3} tris`);
  const scene = gridSampler(sampleGrid((x, y, z) => Math.min(skin(x, y, z), hair.sdf(x, y, z), body.sdf(x, y, z)), BOUNDS, RES));
  const aoFace = smoothScalar(face, bakeAO(face, scene, { rays: 48 }), 3);
  const aoHair = smoothScalar(hair, bakeAO(hair, scene, { rays: 32 }), 2);
  const aoHoodie = smoothScalar(body.hoodie, bakeAO(body.hoodie, scene, { rays: 32 }), 2);
  const aoAcc = bakeAO(body.acc, scene, { rays: 24 });
  log('ambient occlusion baked');

  const skinTex = encodePNG(TEX, TEX, bakeTexture(face, { ao: aoFace }, TEX, skinShader()));
  log('face texture baked');
  const hairTex = encodePNG(TEX, TEX, bakeTexture(hair, { ao: aoHair, t: hair.attrs.t, a: hair.attrs.a, id: hair.attrs.id }, TEX, hairShader()));
  log('hair texture baked');
  const hoodieTex = encodePNG(TEX, TEX, bakeTexture(body.hoodie, { ao: aoHoodie, part: body.hoodie.part }, TEX, clothShader()));
  const accTex = encodePNG(512, 512, bakeTexture(body.acc, { ao: aoAcc, part: body.acc.part }, 512, clothShader()));
  log('hoodie textures baked');
  fs.writeFileSync(path.join(OUT, 'anime_head_hoodie.png'), hoodieTex);
  fs.writeFileSync(path.join(OUT, 'anime_head_skin.png'), skinTex);
  fs.writeFileSync(path.join(OUT, 'anime_head_hair.png'), hairTex);

  const meshes = [
    { name: 'Face', positions: face.positions, normals: face.normals, uvs: face.uvs, indices: face.indices, png: skinTex, roughness: 0.7 },
    { name: 'Hair', positions: hair.positions, normals: hair.normals, uvs: hair.uvs, indices: hair.indices, png: hairTex, roughness: 0.5 },
    { name: 'Hoodie', positions: body.hoodie.positions, normals: body.hoodie.normals, uvs: body.hoodie.uvs, indices: body.hoodie.indices, png: hoodieTex, roughness: 0.85 },
    { name: 'Straps', positions: body.acc.positions, normals: body.acc.normals, uvs: body.acc.uvs, indices: body.acc.indices, png: accTex, roughness: 0.6 },
  ];
  meshes.scale = 0.12; // ~24 cm crown-to-chin, in metres
  const glb = writeGLB(meshes);
  fs.writeFileSync(path.join(OUT, 'anime_head.glb'), glb);
  const tris = meshes.reduce((n, m) => n + m.indices.length / 3, 0);
  log(`wrote ${path.join(OUT, 'anime_head.glb')} (${(glb.length / 1e6).toFixed(1)} MB, ${tris} tris)`);
}

main();
