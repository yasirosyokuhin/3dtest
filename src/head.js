// Anime head definition: one continuous skin volume + a draped hair volume.
// Units: head height (crown to chin) ~= 2.0, +Y up, +Z forward (face), +X to the model's left.
'use strict';
const { smin, smax, ellipsoid, capsule, clamp, mix, smoothstep } = require('./sdf');

// ---------------------------------------------------------------- skin ----

function skin(x, y, z) {
  const ax = Math.abs(x);

  // Cute proportions: big round cranium, short soft lower face, round cheeks.
  // Everything is one blended volume, so there are no puppet-like seams.
  const cranium = ellipsoid(x, y, z, 0, 0.12, -0.08, 0.84, 0.88, 0.88);

  let face = ellipsoid(x, y, z, 0, -0.25, 0.02, 0.72, 0.72, 0.72);
  // Soft V jawline (front view) and under-jaw plane (side view).
  face = smax(face, 0.72 * (ax - 0.70) - 0.694 * (y + 0.30), 0.2);
  face = smax(face, -0.928 * (y + 0.88) - 0.371 * (z - 0.45), 0.1);

  let d = smin(cranium, face, 0.12);
  // Round cheeks.
  d = smin(d, ellipsoid(ax, y, z, 0.30, -0.42, 0.38, 0.24, 0.2, 0.24), 0.1);
  // Shallow eye beds.
  d = smax(d, -ellipsoid(ax, y, z, 0.30, -0.22, 0.89, 0.21, 0.18, 0.18), 0.07);
  // Tiny nose.
  d = smin(d, capsule(x, y, z, 0, -0.30, 0.70, 0, -0.47, 0.745, 0.008, 0.022), 0.06);
  // Ears.
  d = smin(d, ellipsoid(ax, y, z, 0.72, -0.25, -0.12, 0.09, 0.19, 0.12), 0.05);
  // Slender neck, blended softly; open cut at the bottom (bust).
  d = smin(d, capsule(x * 0.94, y, z, 0, -0.45, -0.24, 0, -1.9, -0.28, 0.24, 0.3), 0.16);
  d = smax(d, -1.6 - y, 0.02); // buried in the hoodie collar
  return d;
}

module.exports = { skin };
