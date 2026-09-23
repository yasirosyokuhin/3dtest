// Cylindrical UV layout shared by the mesh and the texture painter.
// U is warped so the face (theta ~ 0) gets ~1.6x more texels than the back.
'use strict';

const Y_MIN = -1.6, Y_MAX = 1.6;
const WARP = 0.6;

function thetaToU(t) { return 0.5 + (t + WARP * Math.sin(t)) / (2 * Math.PI); }

function uToTheta(u) {
  const target = (u - 0.5) * 2 * Math.PI;
  let t = target / (1 + WARP);
  for (let i = 0; i < 8; i++) t -= (t + WARP * Math.sin(t) - target) / (1 + WARP * Math.cos(t));
  return t;
}

function yToV(y) { return (y - Y_MIN) / (Y_MAX - Y_MIN); }
function vToY(v) { return Y_MIN + v * (Y_MAX - Y_MIN); }

// Per-vertex UVs; triangles that straddle the back seam get duplicated vertices
// with u shifted by +1 (the sampler repeats in U).
function cylindricalUVs(mesh, extraAttrs = []) {
  const P = mesh.positions, N = mesh.normals, I = mesh.indices;
  const nv = P.length / 3;
  const uv = new Float32Array(nv * 2);
  for (let i = 0; i < nv; i++) {
    uv[2 * i] = thetaToU(Math.atan2(P[3 * i], P[3 * i + 2]));
    uv[2 * i + 1] = 1 - yToV(P[3 * i + 1]); // glTF: v=0 is the top of the image
  }
  const pos = Array.from(P), nor = Array.from(N), uvs = Array.from(uv);
  const extras = extraAttrs.map((a) => ({ size: a.size, data: Array.from(a.data) }));
  const dupe = new Map();
  const idx = new Uint32Array(I);
  for (let t = 0; t < idx.length; t += 3) {
    const u0 = uv[2 * idx[t]], u1 = uv[2 * idx[t + 1]], u2 = uv[2 * idx[t + 2]];
    if (Math.max(u0, u1, u2) - Math.min(u0, u1, u2) < 0.5) continue;
    for (let c = 0; c < 3; c++) {
      const v = idx[t + c];
      if (uv[2 * v] >= 0.5) continue;
      let nvI = dupe.get(v);
      if (nvI === undefined) {
        nvI = pos.length / 3;
        pos.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]);
        nor.push(N[3 * v], N[3 * v + 1], N[3 * v + 2]);
        uvs.push(uv[2 * v] + 1, uv[2 * v + 1]);
        for (const e of extras) for (let k = 0; k < e.size; k++) e.data.push(e.data[e.size * v + k]);
        dupe.set(v, nvI);
      }
      idx[t + c] = nvI;
    }
  }
  return {
    positions: new Float32Array(pos), normals: new Float32Array(nor), uvs: new Float32Array(uvs), indices: idx,
    extras: extras.map((e) => new Float32Array(e.data)),
  };
}

module.exports = { thetaToU, uToTheta, yToV, vToY, cylindricalUVs, Y_MIN, Y_MAX };
