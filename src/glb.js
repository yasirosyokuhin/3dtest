// Minimal glTF 2.0 binary (.glb) writer: indexed triangle meshes with
// POSITION / NORMAL / TEXCOORD_0 / COLOR_0 and one embedded PNG per material.
'use strict';

function pad4(buf, fill = 0) {
  const r = buf.length % 4;
  return r ? Buffer.concat([buf, Buffer.alloc(4 - r, fill)]) : buf;
}

function writeGLB(meshes, { generator = 'anime-head-generator' } = {}) {
  const gltf = {
    asset: { version: '2.0', generator },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'AnimeHead', children: [] }],
    meshes: [], materials: [], textures: [], images: [], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 33071 }],
    accessors: [], bufferViews: [], buffers: [],
  };
  const chunks = [];
  let offset = 0;
  const addView = (buf, target) => {
    const b = pad4(buf);
    gltf.bufferViews.push(Object.assign({ buffer: 0, byteOffset: offset, byteLength: buf.length }, target ? { target } : {}));
    chunks.push(b); offset += b.length;
    return gltf.bufferViews.length - 1;
  };
  const addAccessor = (typed, type, componentType, target, extra = {}) => {
    const view = addView(Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength), target);
    gltf.accessors.push(Object.assign({ bufferView: view, componentType, count: typed.length / { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type], type }, extra));
    return gltf.accessors.length - 1;
  };

  for (const m of meshes) {
    const P = m.positions;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i += 3) for (let c = 0; c < 3; c++) {
      min[c] = Math.min(min[c], P[i + c]); max[c] = Math.max(max[c], P[i + c]);
    }
    const attributes = {
      POSITION: addAccessor(P, 'VEC3', 5126, 34962, { min, max }),
      NORMAL: addAccessor(m.normals, 'VEC3', 5126, 34962),
      TEXCOORD_0: addAccessor(m.uvs, 'VEC2', 5126, 34962),
    };
    if (m.colors) attributes.COLOR_0 = addAccessor(m.colors, 'VEC4', 5126, 34962);
    const indices = addAccessor(m.indices, 'SCALAR', 5125, 34963);

    const imgView = addView(m.png);
    gltf.images.push({ name: m.name + '_albedo', mimeType: 'image/png', bufferView: imgView });
    gltf.textures.push({ sampler: 0, source: gltf.images.length - 1 });
    gltf.materials.push({
      name: m.name,
      pbrMetallicRoughness: {
        baseColorTexture: { index: gltf.textures.length - 1 },
        metallicFactor: 0, roughnessFactor: m.roughness ?? 0.6,
      },
    });
    gltf.meshes.push({ name: m.name, primitives: [{ attributes, indices, material: gltf.materials.length - 1 }] });
    gltf.nodes.push({ name: m.name, mesh: gltf.meshes.length - 1 });
    gltf.nodes[0].children.push(gltf.nodes.length - 1);
  }
  if (meshes.scale) gltf.nodes[0].scale = [meshes.scale, meshes.scale, meshes.scale];

  const bin = Buffer.concat(chunks);
  gltf.buffers.push({ byteLength: bin.length });
  const json = pad4(Buffer.from(JSON.stringify(gltf)), 0x20);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, json, bh, bin]);
}

module.exports = { writeGLB };
