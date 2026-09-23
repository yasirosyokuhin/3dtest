// Narrow-band SDF sampling + Surface Nets meshing with vertex projection.
'use strict';

// Sample f on a regular grid. Values far from the surface come from a coarse
// pass (trilinear), so expensive SDFs are only evaluated near the zero set.
function sampleGrid(f, bounds, h, coarse = 4) {
  const [x0, y0, z0, x1, y1, z1] = bounds;
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, nz = Math.ceil((z1 - z0) / h) + 1;
  const H = h * coarse;
  const cx = Math.ceil((nx - 1) / coarse) + 1, cy = Math.ceil((ny - 1) / coarse) + 1, cz = Math.ceil((nz - 1) / coarse) + 1;
  const C = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++)
    C[i + cx * (j + cy * k)] = f(x0 + i * H, y0 + j * H, z0 + k * H);

  const F = new Float32Array(nx * ny * nz);
  const band = H * 1.8;
  let evals = 0;
  for (let k = 0; k < nz; k++) {
    const fk = k / coarse, k0 = Math.min(cz - 2, Math.floor(fk)), tk = fk - k0;
    for (let j = 0; j < ny; j++) {
      const fj = j / coarse, j0 = Math.min(cy - 2, Math.floor(fj)), tj = fj - j0;
      for (let i = 0; i < nx; i++) {
        const fi = i / coarse, i0 = Math.min(cx - 2, Math.floor(fi)), ti = fi - i0;
        const c = (a, b, cc) => C[(i0 + a) + cx * ((j0 + b) + cy * (k0 + cc))];
        const v =
          ((c(0, 0, 0) * (1 - ti) + c(1, 0, 0) * ti) * (1 - tj) + (c(0, 1, 0) * (1 - ti) + c(1, 1, 0) * ti) * tj) * (1 - tk) +
          ((c(0, 0, 1) * (1 - ti) + c(1, 0, 1) * ti) * (1 - tj) + (c(0, 1, 1) * (1 - ti) + c(1, 1, 1) * ti) * tj) * tk;
        const idx = i + nx * (j + ny * k);
        if (Math.abs(v) < band) { F[idx] = f(x0 + i * h, y0 + j * h, z0 + k * h); evals++; }
        else F[idx] = v;
      }
    }
  }
  return { F, nx, ny, nz, x0, y0, z0, h, evals };
}

function gridSampler(G) {
  const { F, nx, ny, nz, x0, y0, z0, h } = G;
  return function (x, y, z) {
    let fx = (x - x0) / h, fy = (y - y0) / h, fz = (z - z0) / h;
    if (fx < 0 || fy < 0 || fz < 0 || fx >= nx - 1 || fy >= ny - 1 || fz >= nz - 1) return 1;
    const i = fx | 0, j = fy | 0, k = fz | 0;
    const tx = fx - i, ty = fy - j, tz = fz - k;
    const b = i + nx * (j + ny * k), sy = nx, sz = nx * ny;
    const c00 = F[b] * (1 - tx) + F[b + 1] * tx;
    const c10 = F[b + sy] * (1 - tx) + F[b + sy + 1] * tx;
    const c01 = F[b + sz] * (1 - tx) + F[b + sz + 1] * tx;
    const c11 = F[b + sy + sz] * (1 - tx) + F[b + sy + sz + 1] * tx;
    return (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
  };
}

function surfaceNets(G, f) {
  const { F, nx, ny, nz, x0, y0, z0, h } = G;
  const cellIdx = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float64Array(8);
  const at = (i, j, k) => F[i + nx * (j + ny * k)];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      v[c] = at(i + corners[c][0], j + corners[c][1], k + corners[c][2]);
      if (v[c] < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t;
      sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t;
      sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t;
      n++;
    }
    cellIdx[i + (nx - 1) * (j + (ny - 1) * k)] = pos.length / 3;
    pos.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
  }

  const cid = (i, j, k) => cellIdx[i + (nx - 1) * (j + (ny - 1) * k)];
  const quads = [];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = at(i, j, k) < 0;
    // Edge along x from (i,j,k): shared by cells in the j/k neighbourhood.
    if (j > 0 && k > 0 && (at(i + 1, j, k) < 0) !== a)
      quads.push([cid(i, j - 1, k - 1), cid(i, j, k - 1), cid(i, j, k), cid(i, j - 1, k)], a ? 0 : 1, 0);
    if (i > 0 && k > 0 && (at(i, j + 1, k) < 0) !== a)
      quads.push([cid(i - 1, j, k - 1), cid(i - 1, j, k), cid(i, j, k), cid(i, j, k - 1)], a ? 0 : 1, 1);
    if (i > 0 && j > 0 && (at(i, j, k + 1) < 0) !== a)
      quads.push([cid(i - 1, j - 1, k), cid(i, j - 1, k), cid(i, j, k), cid(i - 1, j, k)], a ? 0 : 1, 2);
  }

  // Project vertices onto the true zero set of the analytic SDF.
  const nv = pos.length / 3;
  const P = new Float32Array(pos);
  const N = new Float32Array(nv * 3);
  const e = h * 0.25;
  for (let q = 0; q < nv; q++) {
    let x = P[3 * q], y = P[3 * q + 1], z = P[3 * q + 2];
    let gx = 0, gy = 0, gz = 0;
    for (let it = 0; it < 4; it++) {
      const d = f(x, y, z);
      gx = f(x + e, y, z) - f(x - e, y, z);
      gy = f(x, y + e, z) - f(x, y - e, z);
      gz = f(x, y, z + e) - f(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1;
      gx /= gl; gy /= gl; gz /= gl;
      const step = Math.max(-h * 0.7, Math.min(h * 0.7, d));
      x -= gx * step; y -= gy * step; z -= gz * step;
      if (Math.abs(d) < 1e-5) break;
    }
    P[3 * q] = x; P[3 * q + 1] = y; P[3 * q + 2] = z;
    N[3 * q] = gx; N[3 * q + 1] = gy; N[3 * q + 2] = gz;
  }

  // Triangulate quads, orient triangles to agree with the SDF gradient.
  const idx = [];
  for (let q = 0; q < quads.length; q += 3) {
    let [a, b, c, d] = quads[q];
    if (quads[q + 1]) { const t = b; b = d; d = t; }
    const len2 = (u, w) => (P[3 * u] - P[3 * w]) ** 2 + (P[3 * u + 1] - P[3 * w + 1]) ** 2 + (P[3 * u + 2] - P[3 * w + 2]) ** 2;
    const tris = len2(a, c) < len2(b, d) ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
    for (const [p0, p1, p2] of tris) {
      const ux = P[3 * p1] - P[3 * p0], uy = P[3 * p1 + 1] - P[3 * p0 + 1], uz = P[3 * p1 + 2] - P[3 * p0 + 2];
      const wx = P[3 * p2] - P[3 * p0], wy = P[3 * p2 + 1] - P[3 * p0 + 1], wz = P[3 * p2 + 2] - P[3 * p0 + 2];
      const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
      const nd = cx * (N[3 * p0] + N[3 * p1] + N[3 * p2]) + cy * (N[3 * p0 + 1] + N[3 * p1 + 1] + N[3 * p2 + 1]) + cz * (N[3 * p0 + 2] + N[3 * p1 + 2] + N[3 * p2 + 2]);
      if (nd >= 0) idx.push(p0, p1, p2); else idx.push(p0, p2, p1);
    }
  }
  return { positions: P, normals: N, indices: new Uint32Array(idx) };
}

// A few passes of Taubin smoothing (no shrink) to relax Surface-Nets faceting,
// followed by re-projection onto the surface.
function relax(mesh, f, iters = 4) {
  const { positions: P, indices: I } = mesh;
  const nv = P.length / 3;
  const nbr = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    nbr[a].add(b); nbr[a].add(c); nbr[b].add(a); nbr[b].add(c); nbr[c].add(a); nbr[c].add(b);
  }
  const adj = nbr.map((s) => Array.from(s));
  const tmp = new Float32Array(P.length);
  const pass = (lam) => {
    for (let v = 0; v < nv; v++) {
      const A = adj[v];
      if (!A.length) { tmp[3 * v] = P[3 * v]; tmp[3 * v + 1] = P[3 * v + 1]; tmp[3 * v + 2] = P[3 * v + 2]; continue; }
      let sx = 0, sy = 0, sz = 0;
      for (const u of A) { sx += P[3 * u]; sy += P[3 * u + 1]; sz += P[3 * u + 2]; }
      const m = A.length;
      for (let c = 0; c < 3; c++) {
        const s = c === 0 ? sx : c === 1 ? sy : sz;
        tmp[3 * v + c] = P[3 * v + c] + lam * (s / m - P[3 * v + c]);
      }
    }
    P.set(tmp);
  };
  for (let i = 0; i < iters; i++) { pass(0.5); pass(-0.53); }
  // Project back and recompute normals from the SDF.
  const N = mesh.normals, e = 1e-3;
  for (let q = 0; q < nv; q++) {
    let x = P[3 * q], y = P[3 * q + 1], z = P[3 * q + 2];
    for (let it = 0; it < 2; it++) {
      const d = f(x, y, z);
      let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1;
      gx /= gl; gy /= gl; gz /= gl;
      x -= gx * d; y -= gy * d; z -= gz * d;
      N[3 * q] = gx; N[3 * q + 1] = gy; N[3 * q + 2] = gz;
    }
    P[3 * q] = x; P[3 * q + 1] = y; P[3 * q + 2] = z;
  }
  return mesh;
}

module.exports = { sampleGrid, gridSampler, surfaceNets, relax };
