// UV-space texture baking: rasterise every triangle into the texture, hand the
// interpolated surface attributes to a shader callback, then dilate the islands
// so mip-mapping never bleeds background into the seams.
'use strict';

/**
 * @param mesh   { positions, normals, uvs, indices }
 * @param attrs  { name: Float32Array (1 value per vertex) }
 * @param size   texture size in pixels
 * @param shade  (ctx) => [r,g,b] in 0..1; ctx = { p:[x,y,z], n:[x,y,z], ...attrs }
 */
function bakeTexture(mesh, attrs, size, shade) {
  const { positions: P, normals: N, uvs: UV, indices: I } = mesh;
  const img = new Float32Array(size * size * 3);
  const filled = new Uint8Array(size * size);
  const names = Object.keys(attrs);
  const ctx = { p: [0, 0, 0], n: [0, 0, 0] };
  for (let t = 0; t < I.length; t += 3) {
    const ia = I[t], ib = I[t + 1], ic = I[t + 2];
    const ax = UV[2 * ia] * size, ay = UV[2 * ia + 1] * size;
    const bx = UV[2 * ib] * size, by = UV[2 * ib + 1] * size;
    const cx = UV[2 * ic] * size, cy = UV[2 * ic + 1] * size;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const sx = px + 0.5, sy = py + 0.5;
      const w0 = ((by - cy) * (sx - cx) + (cx - bx) * (sy - cy)) / den;
      const w1 = ((cy - ay) * (sx - cx) + (ax - cx) * (sy - cy)) / den;
      const w2 = 1 - w0 - w1;
      const eps = -0.02;
      if (w0 < eps || w1 < eps || w2 < eps) continue;
      const o = py * size + px;
      if (filled[o] === 2) continue;
      for (let k = 0; k < 3; k++) {
        ctx.p[k] = P[3 * ia + k] * w0 + P[3 * ib + k] * w1 + P[3 * ic + k] * w2;
        ctx.n[k] = N[3 * ia + k] * w0 + N[3 * ib + k] * w1 + N[3 * ic + k] * w2;
      }
      const nl = Math.hypot(ctx.n[0], ctx.n[1], ctx.n[2]) || 1;
      ctx.n[0] /= nl; ctx.n[1] /= nl; ctx.n[2] /= nl;
      for (const nm of names) { const A = attrs[nm]; ctx[nm] = A[ia] * w0 + A[ib] * w1 + A[ic] * w2; }
      const c = shade(ctx);
      img[3 * o] = c[0]; img[3 * o + 1] = c[1]; img[3 * o + 2] = c[2];
      // Pixels whose centre is strictly inside win over edge-overlap pixels.
      filled[o] = w0 >= 0 && w1 >= 0 && w2 >= 0 ? 2 : 1;
    }
  }
  // Dilate islands outward.
  for (let pass = 0; pass < 12; pass++) {
    const add = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const o = y * size + x;
      if (filled[o]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= size || Y >= size) continue;
        const q = Y * size + X;
        if (!filled[q]) continue;
        r += img[3 * q]; g += img[3 * q + 1]; b += img[3 * q + 2]; n++;
      }
      if (n) add.push(o, r / n, g / n, b / n);
    }
    for (let i = 0; i < add.length; i += 4) {
      const o = add[i];
      img[3 * o] = add[i + 1]; img[3 * o + 1] = add[i + 2]; img[3 * o + 2] = add[i + 3]; filled[o] = 1;
    }
  }
  const out = new Uint8Array(size * size * 4);
  for (let o = 0; o < size * size; o++) {
    for (let k = 0; k < 3; k++) {
      const v = Math.pow(Math.min(1, Math.max(0, img[3 * o + k])), 1); // already sRGB
      out[4 * o + k] = Math.round(v * 255);
    }
    out[4 * o + 3] = 255;
  }
  return out;
}

module.exports = { bakeTexture };
