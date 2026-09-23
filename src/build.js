#!/usr/bin/env node
// Generates output/anime_head.glb (+ albedo PNGs) from the procedural sculpt.
'use strict';
const fs = require('fs');
const path = require('path');
const { skin, makeStrands, makeHair } = require('./head');
const { sampleGrid, gridSampler, surfaceNets, relax } = require('./mesher');
const { cylindricalUVs } = require('./uv');
const { paintSkin, paintHair } = require('./paint');
const { encodePNG } = require('./png');
const { writeGLB } = require('./glb');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const RES = parseFloat(args.res || '0.011');
const TEX = parseInt(args.tex || '2048', 10);
const OUT = path.resolve(args.out || path.join(__dirname, '..', 'output'));
const log = (...m) => console.log(`[${(process.uptime()).toFixed(1)}s]`, ...m);

const BOUNDS = [-1.2, -1.62, -1.25, 1.2, 1.55, 1.25];

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
  const strands = makeStrands(7);
  const hair = makeHair(strands);
  log(`grid spacing ${RES}, ${strands.length} hair clumps`);

  const gSkin = sampleGrid(skin, BOUNDS, RES);
  log(`skin sampled (${gSkin.nx}x${gSkin.ny}x${gSkin.nz}, ${gSkin.evals} fine evals)`);
  const gHair = sampleGrid(hair, BOUNDS, RES);
  log(`hair sampled (${gHair.evals} fine evals)`);

  const skinMesh = relax(surfaceNets(gSkin, skin), skin, 3);
  log(`skin mesh: ${skinMesh.positions.length / 3} verts, ${skinMesh.indices.length / 3} tris`);
  const hairMesh = relax(surfaceNets(gHair, hair), hair, 2);
  log(`hair mesh: ${hairMesh.positions.length / 3} verts, ${hairMesh.indices.length / 3} tris`);

  const sSkin = gridSampler(gSkin), sHair = gridSampler(gHair);
  const scene = (x, y, z) => Math.min(sSkin(x, y, z), sHair(x, y, z));
  const aoSkin = smoothScalar(skinMesh, bakeAO(skinMesh, scene, { rays: 40 }), 6);
  const aoHair = smoothScalar(hairMesh, bakeAO(hairMesh, scene, { rays: 32 }), 4);
  log('ambient occlusion baked');

  // Vertex colours: AO tinted warm on skin (fake subsurface), neutral on hair.
  const colorize = (ao, tint) => {
    const c = new Float32Array(ao.length * 4);
    for (let i = 0; i < ao.length; i++) {
      const a = Math.min(1, ao[i] * 1.12);
      c[4 * i] = Math.pow(a, tint[0]); c[4 * i + 1] = Math.pow(a, tint[1]); c[4 * i + 2] = Math.pow(a, tint[2]); c[4 * i + 3] = 1;
    }
    return c;
  };
  const skinUV = cylindricalUVs(skinMesh, [{ size: 4, data: colorize(aoSkin, [0.55, 1.0, 1.05]) }]);
  const hairUV = cylindricalUVs(hairMesh, [{ size: 4, data: colorize(aoHair, [1.0, 1.05, 1.1]) }]);

  const skinTex = encodePNG(TEX, TEX, paintSkin(TEX, skin));
  log('skin texture painted');
  const hairTex = encodePNG(TEX, TEX, paintHair(TEX));
  log('hair texture painted');
  fs.writeFileSync(path.join(OUT, 'anime_head_skin.png'), skinTex);
  fs.writeFileSync(path.join(OUT, 'anime_head_hair.png'), hairTex);

  const meshes = [
    { name: 'Face', positions: skinUV.positions, normals: skinUV.normals, uvs: skinUV.uvs, colors: skinUV.extras[0], indices: skinUV.indices, png: skinTex, roughness: 0.65 },
    { name: 'Hair', positions: hairUV.positions, normals: hairUV.normals, uvs: hairUV.uvs, colors: hairUV.extras[0], indices: hairUV.indices, png: hairTex, roughness: 0.45 },
  ];
  meshes.scale = 0.12; // ~24 cm crown-to-chin, in metres
  const glb = writeGLB(meshes);
  fs.writeFileSync(path.join(OUT, 'anime_head.glb'), glb);
  log(`wrote ${path.join(OUT, 'anime_head.glb')} (${(glb.length / 1e6).toFixed(1)} MB)`);
}

main();
