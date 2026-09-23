// Clean, game-style quad topology for the head: a structured grid (columns
// around the head, rows from crown to neck) shrink-wrapped onto the sculpt and
// relaxed so the quads are even. Output is triangulated for glTF, but every
// pair of triangles forms one quad of the grid.
'use strict';

function gradient(f, x, y, z, e = 1e-3) {
  const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
  const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
}

function project(f, p, iters = 4) {
  for (let i = 0; i < iters; i++) {
    const d = f(p[0], p[1], p[2]);
    const g = gradient(f, p[0], p[1], p[2]);
    p[0] -= g[0] * d; p[1] -= g[1] * d; p[2] -= g[2] * d;
    if (Math.abs(d) < 1e-6) break;
  }
  return p;
}

// Outermost surface hit along a ray (march in from far away, then bisect).
function outerHit(f, o, dir) {
  let t = 3;
  while (t > 0 && f(o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t) > 0) t -= 0.01;
  let lo = t, hi = t + 0.01;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    if (f(o[0] + dir[0] * m, o[1] + dir[1] * m, o[2] + dir[2] * m) > 0) hi = m; else lo = m;
  }
  return [o[0] + dir[0] * lo, o[1] + dir[1] * lo, o[2] + dir[2] * lo];
}

/**
 * @param f      signed distance function of the skin
 * @param opts   { cols, rows, bottomY, iters }
 */
function headGrid(f, { cols = 112, rows = 104, bottomY = -1.25, iters = 80 } = {}) {
  const B = [0, -0.05, -0.08];      // capsule top centre (inside the head)
  const A = [0, bottomY, -0.27];    // capsule bottom (inside the neck)
  const R = 1, hemi = Math.PI / 2 * R, cyl = B[1] - A[1];
  const total = hemi + cyl;
  const init = (r, c) => {
    const s = (r + 1) / rows * total;
    const th = (c / cols - 0.5) * 2 * Math.PI;
    if (s <= hemi) {
      const phi = s / R;
      return outerHit(f, B, [Math.sin(phi) * Math.sin(th), Math.cos(phi), Math.sin(phi) * Math.cos(th)]);
    }
    const t = (s - hemi) / cyl;
    return outerHit(f, [0, B[1] + (A[1] - B[1]) * t, B[2] + (A[2] - B[2]) * t], [Math.sin(th), 0, Math.cos(th)]);
  };
  return wrapGrid(f, { cols, rows, bottomY, iters, init, pole: outerHit(f, B, [0, 1, 0]) });
}

// Torso: rays from a point inside the chest, rows from the neck down to the cut.
function torsoGrid(f, { cols = 96, rows = 56, bottomY = -2.75, iters = 80, center = [0, -1.8, -0.25] } = {}) {
  const init = (r, c) => {
    const th = (c / cols - 0.5) * 2 * Math.PI;
    const el = (88 - (r + 1) / rows * 128) * Math.PI / 180;
    return outerHit(f, center, [Math.cos(el) * Math.sin(th), Math.sin(el), Math.cos(el) * Math.cos(th)]);
  };
  return wrapGrid(f, { cols, rows, bottomY, iters, init, pole: outerHit(f, center, [0, 1, 0]) });
}

function wrapGrid(f, { cols, rows, bottomY, iters, init, pole }) {
  const P = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const p = init(r, c);
    if (r === rows - 1 || p[1] < bottomY) p[1] = bottomY;
    P.push(p);
  }
  const idx = (r, c) => r * cols + ((c + cols) % cols);

  // Shrink-wrap relaxation: Laplacian step + projection back onto the surface.
  const tmp = P.map((p) => p.slice());
  for (let it = 0; it < iters; it++) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = idx(r, c);
      const up = r === 0 ? pole : P[idx(r - 1, c)];
      const dn = r === rows - 1 ? null : P[idx(r + 1, c)];
      const lf = P[idx(r, c - 1)], rt = P[idx(r, c + 1)];
      const nb = dn ? [up, dn, lf, rt] : [lf, rt];
      const q = [0, 0, 0];
      for (const n of nb) { q[0] += n[0]; q[1] += n[1]; q[2] += n[2]; }
      const k = 0.55;
      tmp[i] = [
        P[i][0] + k * (q[0] / nb.length - P[i][0]),
        P[i][1] + k * (q[1] / nb.length - P[i][1]),
        P[i][2] + k * (q[2] / nb.length - P[i][2]),
      ];
    }
    for (let i = 0; i < P.length; i++) {
      const p = project(f, tmp[i]);
      if (i >= (rows - 1) * cols) {
        // Keep the neck opening flat: slide within the cut plane.
        p[1] = bottomY;
        for (let k = 0; k < 3; k++) {
          const d = f(p[0], p[1], p[2]);
          const g = gradient(f, p[0], p[1], p[2]);
          const gl = Math.hypot(g[0], g[2]) || 1;
          p[0] -= g[0] / gl * d; p[2] -= g[2] / gl * d;
        }
      }
      P[i] = p;
    }
  }

  // Assemble with a duplicated seam column so UVs are continuous.
  const positions = [], normals = [], uvs = [], indices = [];
  const vid = (r, c) => r * (cols + 1) + c;
  for (let r = 0; r < rows; r++) for (let c = 0; c <= cols; c++) {
    const p = P[idx(r, c % cols)];
    positions.push(...p);
    normals.push(...gradient(f, p[0], p[1], p[2]));
    uvs.push(c / cols, (r + 1) / (rows + 0.5));
  }
  const poleBase = positions.length / 3;
  for (let c = 0; c < cols; c++) { // one pole vertex per column keeps UVs clean
    positions.push(...pole); normals.push(0, 1, 0); uvs.push((c + 0.5) / cols, 0);
  }
  for (let r = 0; r + 1 < rows; r++) for (let c = 0; c < cols; c++) {
    const a = vid(r, c), b = vid(r, c + 1), cc = vid(r + 1, c + 1), d = vid(r + 1, c);
    indices.push(a, d, cc, a, cc, b);
  }
  for (let c = 0; c < cols; c++) indices.push(poleBase + c, vid(0, c), vid(0, c + 1));
  return {
    positions: new Float32Array(positions), normals: new Float32Array(normals),
    uvs: new Float32Array(uvs), indices: new Uint32Array(indices),
  };
}

module.exports = { headGrid, torsoGrid, gradient, project, outerHit };
