'use strict';
// Mansion layout: rooms on a tile grid (1 tile = 2 m), doors, props, lights, items, enemies and notes.
const TILE = 2, WALL_H = 3.2, MAP_W = 30, MAP_H = 24;
const MAT = { PLAIN: 0, WOOD: 1, MARBLE: 2, PAPER: 3, STONE: 4, CARPET: 5, METAL: 6, EMIT: 7, BOOKS: 8, CLOTH: 9, BLOOD: 10 };

// rects are inclusive tile ranges [x0, z0, x1, z1]. cams: fixed camera per zone (world coords).
const ROOMS = [
  {
    key: 'hall', name: '玄関ホール', rects: [[11, 12, 18, 21]],
    floor: [MAT.MARBLE, [0.62, 0.58, 0.52]], wall: [MAT.PAPER, [0.42, 0.1, 0.09]], ceil: [0.16, 0.13, 0.12],
    amb: [0.07, 0.06, 0.055], windows: true,
    cams: [{ r: [11, 12, 18, 16], p: [37.3, 3.0, 43.3] }, { r: [11, 17, 18, 21], p: [22.7, 3.0, 24.7] }],
    lights: [
      { p: [30, 2.85, 34], c: [1.0, 0.72, 0.45], r: 14, f: 0.05 },
      { p: [22.9, 1.3, 38], c: [0.9, 0.55, 0.28], r: 5, f: 0.12 },
      { p: [37.1, 1.3, 38], c: [0.9, 0.55, 0.28], r: 5, f: 0.12 },
    ],
  },
  {
    key: 'dining', name: '食堂', rects: [[2, 13, 9, 20]],
    floor: [MAT.WOOD, [0.42, 0.26, 0.14]], wall: [MAT.PAPER, [0.14, 0.25, 0.16]], ceil: [0.14, 0.12, 0.1],
    amb: [0.05, 0.05, 0.045], windows: true,
    cams: [{ r: [2, 13, 9, 20], p: [19.3, 3.0, 26.7] }],
    lights: [
      { p: [12, 1.3, 31], c: [1.0, 0.62, 0.3], r: 6.5, f: 0.25 },
      { p: [12, 1.3, 37], c: [1.0, 0.62, 0.3], r: 6.5, f: 0.25 },
      { p: [5.9, 0.8, 34], c: [1.2, 0.5, 0.14], r: 8, f: 0.45 },
    ],
  },
  {
    key: 'corridor', name: '東の廊下', rects: [[20, 15, 27, 17], [25, 3, 27, 14]],
    floor: [MAT.CARPET, [0.36, 0.06, 0.06]], wall: [MAT.PAPER, [0.45, 0.38, 0.26]], ceil: [0.15, 0.13, 0.1],
    amb: [0.045, 0.045, 0.05], windows: true,
    cams: [{ r: [20, 15, 27, 17], p: [55.3, 3.0, 35.3] }, { r: [25, 3, 27, 14], p: [50.7, 3.0, 6.7] }],
    lights: [
      { p: [44, 2.3, 30.4], c: [0.9, 0.62, 0.38], r: 7, f: 0.1 },
      { p: [52, 2.3, 35.6], c: [0.9, 0.62, 0.38], r: 7, f: 0.1 },
      { p: [50.4, 2.3, 19], c: [0.9, 0.62, 0.38], r: 7, f: 0.35 },
      { p: [50.4, 2.3, 9], c: [0.9, 0.62, 0.38], r: 7, f: 0.1 },
      { p: [55.2, 1.8, 17], c: [0.22, 0.28, 0.5], r: 7, f: 0 },
    ],
  },
  {
    key: 'storage', name: '倉庫', rects: [[20, 10, 23, 13]],
    floor: [MAT.STONE, [0.35, 0.34, 0.32]], wall: [MAT.STONE, [0.32, 0.3, 0.27]], ceil: [0.12, 0.12, 0.11],
    amb: [0.03, 0.03, 0.03],
    cams: [{ r: [20, 10, 23, 13], p: [40.7, 3.0, 20.7] }],
    lights: [{ p: [44, 2.75, 24], c: [1.0, 0.85, 0.55], r: 8, f: 0.55 }],
  },
  {
    key: 'library', name: '書庫', rects: [[14, 2, 23, 8]],
    floor: [MAT.WOOD, [0.3, 0.18, 0.1]], wall: [MAT.PAPER, [0.12, 0.14, 0.24]], ceil: [0.1, 0.1, 0.12],
    amb: [0.04, 0.04, 0.05],
    cams: [{ r: [19, 2, 23, 8], p: [28.7, 3.0, 17.3] }, { r: [14, 2, 18, 8], p: [47.3, 3.0, 4.7] }],
    lights: [
      { p: [34, 2.85, 8], c: [0.8, 0.62, 0.4], r: 9, f: 0.05 },
      { p: [42.3, 1.25, 12.3], c: [0.6, 0.9, 0.55], r: 5.5, f: 0.03 },
      { p: [38, 2.85, 15], c: [0.8, 0.62, 0.4], r: 8, f: 0.08 },
    ],
  },
  {
    key: 'lab', name: '地下研究室', rects: [[2, 2, 12, 10]],
    floor: [MAT.METAL, [0.42, 0.45, 0.48]], wall: [MAT.STONE, [0.5, 0.53, 0.55]], ceil: [0.28, 0.3, 0.32],
    amb: [0.05, 0.06, 0.07],
    cams: [{ r: [7, 2, 12, 10], p: [4.7, 3.0, 21.3] }, { r: [2, 2, 6, 10], p: [25.3, 3.0, 4.7] }],
    lights: [
      { p: [10, 3.0, 10], c: [0.55, 0.75, 1.0], r: 11, f: 0.06 },
      { p: [20, 3.0, 16], c: [0.55, 0.75, 1.0], r: 11, f: 0.7 },
      { p: [13, 1.4, 6.6], c: [0.2, 0.7, 0.55], r: 5, f: 0.1 },
    ],
  },
];

const DOORS = [
  { tiles: [[10, 16]] },
  { tiles: [[19, 16]] },
  { tiles: [[24, 12]] },
  { tiles: [[24, 5]], lock: 'key_sword', lockMsg: '鍵がかかっている。扉には剣の紋章が刻まれている。' },
  { tiles: [[13, 5]], lock: 'key_shield', lockMsg: '鉄の扉だ。鍵がかかっている。盾の紋章が刻まれている。', col: [0.3, 0.32, 0.35] },
  { tiles: [[14, 22], [15, 22]], lock: 'key_main', exit: true, wide: true, col: [0.3, 0.16, 0.08],
    lockMsg: '玄関の扉は固く閉ざされている。頑丈な錠前には大きな鍵穴がある。' },
];

const ITEM_INFO = {
  herb: { name: 'グリーンハーブ', desc: '傷を癒やす薬草。体力を回復する。', pick: 'グリーンハーブを手に入れた。' },
  ammo: { name: 'ハンドガンの弾', desc: '9mm弾。ハンドガンに使える。', pick: 'ハンドガンの弾を15発手に入れた。' },
  shells: { name: 'ショットガンの弾', desc: '12ゲージ散弾。', pick: 'ショットガンの弾を6発手に入れた。' },
  shotgun: { name: 'ショットガン', desc: '至近距離で絶大な威力を持つ散弾銃。', pick: 'ショットガンを手に入れた！ [Q]で持ち替え' },
  key_sword: { name: '剣の鍵', desc: '持ち手に剣の紋章が刻まれた鍵。', pick: '剣の鍵を手に入れた。' },
  key_shield: { name: '盾の鍵', desc: '持ち手に盾の紋章が刻まれた鍵。', pick: '盾の鍵を手に入れた。' },
  key_main: { name: '玄関の鍵', desc: '重く大きな真鍮の鍵。玄関の扉を開けられそうだ。', pick: '玄関の鍵を手に入れた！' },
  note: { name: 'ファイル', desc: '', pick: 'ファイルを手に入れた。' },
};

const NOTES = {
  guard: {
    title: '警備員の日誌',
    body: `9月20日
地下の研究区画で事故があったらしい。研究員たちは誰も上がってこない。所長は「問題ない」の一点張りだ。

9月21日
同僚のケンが熱を出した。腕を犬に噛まれたと言っていた。夜中、あいつの部屋から唸り声が聞こえる。

9月22日
体中がかゆい。鏡を見たら、皮膚がはがれて

9月23日
かゆい　かゆい
おなか　すいた`,
  },
  researcher: {
    title: '研究員のメモ',
    body: `H-ウイルスの感染者は大脳の機能をほぼ失い、強烈な飢餓感だけで行動する。
痛覚はない。倒れても、しばらくすると起き上がる個体がいる。死体に不用意に近づくな。

有効なのは頭部への損傷。弾を惜しむな。

試作体G-01が檻の中で暴れている。所長は研究室に籠ったまま出てこない。
玄関の鍵も所長が持ち込んだままだ。地下へ続く鉄扉の鍵は、ここの机にしまっておく。`,
  },
  director: {
    title: '所長の手記',
    body: `私の最高傑作が培養槽を破った。
G-01は完璧だ。弾丸をものともせず、疲れを知らない。

鍵はもう取り返せないだろう。あの子が私ごと呑み込んでしまったのだから。

――この手記を読む者へ。
あの子を止められるのは散弾銃くらいのものだ。
正面から、至近距離で。`,
  },
};

const EXAMINE = {
  statue: '女神像だ。台座に「真実は書庫に眠る」と刻まれている。',
  fireplace: '暖炉の火がまだ燻っている。誰かがついさっきまでここにいたようだ。',
  clock: '大きな柱時計。針は深夜0時で止まっている。',
  tank: '培養槽の中で、何かの肉塊がゆっくりと脈打っている……',
  broken: '内側から破られた培養槽だ。床に粘液が点々と続いている。',
  console: '端末には「G-01 収容違反」の赤い文字が点滅している。',
  crates: '古い木箱だ。中身は空っぽのようだ。',
  bookshelf: '古い医学書ばかりだ。何冊かに赤黒い染みがついている。',
  window: '外は激しい雷雨だ。窓は外側から板で打ち付けられている。',
};

function P(x, z, w, d, h, col, mat, o = {}) {
  const y0 = o.y0 || 0;
  return { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0, y1: y0 + h, col, mat,
    solid: o.solid !== undefined ? o.solid : y0 < 0.9, text: o.text || null };
}

const WOOD_D = [0.26, 0.15, 0.07], STONE_C = [0.45, 0.44, 0.42], STATUE = [0.6, 0.58, 0.55];
const WINDOW = [0.06, 0.08, 0.15], FRAME = [0.25, 0.16, 0.08], CANVAS = [0.18, 0.16, 0.12];

function buildProps() {
  const a = [];
  // --- Hall
  a.push(P(30, 30, 1.6, 1.6, 1.0, STONE_C, MAT.STONE, { text: 'statue' }));
  a.push(P(30, 30, 0.7, 0.5, 1.1, STATUE, MAT.STONE, { y0: 1.0, solid: false }));
  a.push(P(30, 30, 0.32, 0.32, 0.35, STATUE, MAT.STONE, { y0: 2.1, solid: false }));
  a.push(P(30, 30.3, 1.3, 0.14, 0.14, STATUE, MAT.STONE, { y0: 1.75, solid: false }));
  a.push(P(30, 36, 3, 16, 0.02, [0.36, 0.05, 0.05], MAT.CARPET, { solid: false }));
  for (const x of [22.9, 37.1]) {
    a.push(P(x, 38, 1.0, 1.8, 0.8, WOOD_D, MAT.WOOD));
    a.push(P(x, 38, 0.08, 0.08, 0.25, [0.6, 0.5, 0.2], MAT.PLAIN, { y0: 0.8, solid: false }));
    a.push(P(x, 38, 0.34, 0.34, 0.25, [1.0, 0.72, 0.4], MAT.EMIT, { y0: 1.05, solid: false }));
  }
  a.push(P(37, 30, 0.9, 2.2, 0.5, WOOD_D, MAT.WOOD));
  for (const x of [25.5, 34.5]) a.push(P(x, 43.97, 3, 0.06, 1.6, WINDOW, MAT.EMIT, { y0: 1.1, text: 'window' }));
  a.push(P(26, 24.04, 2.2, 0.08, 1.5, FRAME, MAT.WOOD, { y0: 1.35 }));
  a.push(P(26, 24.1, 1.9, 0.04, 1.2, CANVAS, MAT.STONE, { y0: 1.5 }));
  a.push(P(34, 24.04, 2.2, 0.08, 1.5, FRAME, MAT.WOOD, { y0: 1.35 }));
  a.push(P(34, 24.1, 1.9, 0.04, 1.2, [0.14, 0.16, 0.12], MAT.STONE, { y0: 1.5 }));
  a.push(P(30, 34, 0.9, 0.9, 0.3, [0.55, 0.45, 0.2], MAT.PLAIN, { y0: 2.6, solid: false })); // chandelier
  a.push(P(30, 34, 0.5, 0.5, 0.12, [1.0, 0.8, 0.5], MAT.EMIT, { y0: 2.5, solid: false }));

  // --- Dining
  a.push(P(12, 34, 2.4, 10, 0.78, WOOD_D, MAT.WOOD));
  a.push(P(12, 34, 2.6, 10.2, 0.03, [0.72, 0.7, 0.62], MAT.CLOTH, { y0: 0.78, solid: false }));
  for (const z of [30, 32, 34, 36, 38]) for (const s of [-1, 1]) {
    const x = 12 + s * 1.75;
    a.push(P(x, z, 0.5, 0.5, 0.48, [0.3, 0.17, 0.08], MAT.WOOD));
    a.push(P(x + s * 0.21, z, 0.08, 0.5, 0.62, [0.3, 0.17, 0.08], MAT.WOOD, { y0: 0.48 }));
  }
  for (const z of [31, 37]) {
    a.push(P(12, z, 0.2, 0.2, 0.12, [0.55, 0.45, 0.2], MAT.PLAIN, { y0: 0.81, solid: false }));
    a.push(P(12, z, 0.07, 0.07, 0.22, [1.0, 0.85, 0.5], MAT.EMIT, { y0: 0.93, solid: false }));
  }
  a.push(P(4.5, 34, 1.0, 3.2, 1.8, STONE_C, MAT.STONE, { text: 'fireplace' }));
  a.push(P(5.02, 34, 0.08, 1.6, 0.7, [1.0, 0.42, 0.1], MAT.EMIT, { y0: 0.12 }));
  a.push(P(4.75, 34, 1.5, 3.6, 0.15, [0.3, 0.2, 0.12], MAT.WOOD, { y0: 1.8 }));
  a.push(P(8, 26.45, 3, 0.9, 1.3, WOOD_D, MAT.WOOD));
  a.push(P(19.6, 40, 0.8, 0.6, 2.2, [0.22, 0.12, 0.06], MAT.WOOD, { text: 'clock' }));
  a.push(P(19.18, 40, 0.04, 0.45, 0.45, [0.8, 0.75, 0.6], MAT.PLAIN, { y0: 1.5 }));
  for (const x of [8, 16]) a.push(P(x, 41.97, 2, 0.06, 1.6, WINDOW, MAT.EMIT, { y0: 1.1, text: 'window' }));

  // --- Corridor
  a.push(P(43, 30.45, 0.6, 0.6, 0.9, [0.4, 0.42, 0.5], MAT.PLAIN));
  a.push(P(48, 35.55, 0.6, 0.6, 0.9, [0.4, 0.42, 0.5], MAT.PLAIN));
  a.push(P(46, 30.04, 2.2, 0.08, 1.4, FRAME, MAT.WOOD, { y0: 1.3 }));
  a.push(P(46, 30.1, 1.9, 0.04, 1.1, [0.2, 0.12, 0.1], MAT.STONE, { y0: 1.45 }));
  a.push(P(50.04, 20, 0.08, 2, 1.3, FRAME, MAT.WOOD, { y0: 1.3 }));
  a.push(P(50.1, 20, 0.04, 1.7, 1.0, [0.12, 0.14, 0.18], MAT.STONE, { y0: 1.45 }));
  for (const z of [11, 17, 23]) a.push(P(55.97, z, 0.06, 2, 1.6, WINDOW, MAT.EMIT, { y0: 1.0, text: 'window' }));
  a.push(P(50.5, 14, 0.9, 1.4, 0.8, WOOD_D, MAT.WOOD));
  for (const [x, z] of [[44, 30.1], [52, 35.9], [50.1, 19], [50.1, 9]]) a.push(P(x, z, 0.14, 0.14, 0.2, [1.0, 0.7, 0.4], MAT.EMIT, { y0: 2.2 }));

  // --- Storage
  a.push(P(42.5, 27.55, 4, 0.8, 2.2, [0.3, 0.2, 0.12], MAT.WOOD));
  a.push(P(44.5, 22, 1, 1, 1, [0.42, 0.3, 0.16], MAT.WOOD, { text: 'crates' }));
  a.push(P(45.6, 22.3, 0.9, 0.9, 0.9, [0.38, 0.27, 0.14], MAT.WOOD, { text: 'crates' }));
  a.push(P(44.5, 22, 0.7, 0.7, 0.7, [0.4, 0.29, 0.15], MAT.WOOD, { y0: 1.0 }));
  a.push(P(47.2, 27.2, 0.8, 0.8, 1.0, [0.2, 0.25, 0.22], MAT.METAL));
  a.push(P(44, 24, 0.16, 0.16, 0.2, [1.0, 0.9, 0.6], MAT.EMIT, { y0: 2.7 }));

  // --- Library
  a.push(P(33, 4.45, 6, 0.9, 2.8, WOOD_D, MAT.BOOKS, { text: 'bookshelf' }));
  a.push(P(42, 4.45, 5, 0.9, 2.8, WOOD_D, MAT.BOOKS, { text: 'bookshelf' }));
  a.push(P(33, 9.5, 5, 0.8, 1.1, WOOD_D, MAT.BOOKS, { text: 'bookshelf' }));
  a.push(P(33, 13.3, 5, 0.8, 1.1, WOOD_D, MAT.BOOKS, { text: 'bookshelf' }));
  a.push(P(38, 17.55, 6, 0.9, 2.8, WOOD_D, MAT.BOOKS, { text: 'bookshelf' }));
  a.push(P(41.5, 12.5, 2.4, 1.2, 0.8, [0.28, 0.15, 0.07], MAT.WOOD));
  a.push(P(42.3, 12.2, 0.05, 0.05, 0.3, [0.5, 0.45, 0.2], MAT.PLAIN, { y0: 0.8 }));
  a.push(P(42.3, 12.2, 0.3, 0.3, 0.15, [0.4, 0.95, 0.55], MAT.EMIT, { y0: 1.1 }));

  // --- Lab
  for (const x of [9, 13, 17]) {
    a.push(P(x, 5.2, 1.6, 1.6, 0.4, [0.3, 0.32, 0.35], MAT.METAL, { text: 'tank' }));
    a.push(P(x, 5.2, 1.3, 1.3, 2.0, [0.1, 0.38, 0.33], MAT.EMIT, { y0: 0.4 }));
    a.push(P(x, 5.2, 0.5, 0.5, 0.8, [0.35, 0.2, 0.2], MAT.PLAIN, { y0: 1.0, solid: false }));
    a.push(P(x, 5.2, 1.6, 1.6, 0.3, [0.3, 0.32, 0.35], MAT.METAL, { y0: 2.4 }));
  }
  a.push(P(21, 5.2, 1.6, 1.6, 0.4, [0.3, 0.32, 0.35], MAT.METAL, { text: 'broken' }));
  a.push(P(20.5, 5.2, 0.3, 1.2, 0.9, [0.05, 0.1, 0.1], MAT.PLAIN, { y0: 0.4 }));
  a.push(P(21.6, 4.8, 0.2, 0.5, 0.5, [0.05, 0.1, 0.1], MAT.PLAIN, { y0: 0.4 }));
  a.push(P(21, 5.2, 1.6, 1.6, 0.3, [0.3, 0.32, 0.35], MAT.METAL, { y0: 2.4 }));
  a.push(P(15, 16, 6, 1.1, 1.0, [0.5, 0.52, 0.55], MAT.METAL));
  for (const x of [13, 15.5]) a.push(P(x, 16.1, 0.8, 0.1, 0.5, [0.15, 0.55, 0.4], MAT.EMIT, { y0: 1.0 }));
  a.push(P(4.55, 13, 1.1, 3, 1.1, [0.35, 0.37, 0.4], MAT.METAL, { text: 'console' }));
  a.push(P(5.12, 13, 0.04, 2.4, 0.6, [0.6, 0.12, 0.1], MAT.EMIT, { y0: 1.2 }));
  for (const [x, z] of [[10, 10], [20, 16]]) a.push(P(x, z, 1.8, 0.25, 0.08, [0.8, 0.9, 1.0], MAT.EMIT, { y0: 3.1 }));
  return a;
}

// Fresh game contents. Everything here is plain data so it can be snapshotted with JSON.
function newWorldState() {
  let id = 0;
  const it = (type, x, z, y = 0, extra = {}) => ({ id: id++, type, x, z, y, taken: false, ...extra });
  const items = [
    it('ammo', 36.3, 25.3), it('note', 37, 30.5, 0.52, { note: 'guard' }),
    it('key_sword', 12.7, 33, 0.82), it('herb', 5.6, 40.6),
    it('ammo', 50.5, 14, 0.82), it('herb', 41, 35.2),
    it('shotgun', 45.6, 22.3, 0.92), it('ammo', 42.5, 21), it('shells', 42, 26.6), it('herb', 47.2, 21),
    it('key_shield', 41, 12.5, 0.82), it('note', 42, 12.8, 0.82, { note: 'researcher' }), it('ammo', 29.5, 5.8), it('shells', 46.5, 16.6),
    it('note', 16.5, 16, 1.02, { note: 'director' }), it('herb', 24.5, 20.5), it('ammo', 5.5, 20.5), it('shells', 24.3, 6.4),
  ];
  const en = (type, x, z, state = 'idle', yaw = rand(0, 6.28), extra = {}) => ({ type, x, z, yaw, state, ...extra });
  const enemies = [
    en('zombie', 7, 29.5), en('zombie', 16.5, 39.5, 'dormant'),
    en('zombie', 47, 33), en('zombie', 53, 21), en('zombie', 54.5, 10, 'dormant'),
    en('zombie', 42.5, 24.5, 'dormant'),
    en('dog', 34, 16), en('dog', 38, 7), en('zombie', 30.5, 16.5),
    en('boss', 10, 15, 'idle', Math.PI * 0.75),
  ];
  return { items, enemies, unlocked: DOORS.map(() => false), flags: {} };
}

const HALL_AMBUSH = [['zombie', 24, 41.5], ['zombie', 36, 41.5], ['dog', 30, 26]];

// ---------------------------------------------------------------------------------------------
const World = (() => {
  const grid = new Int16Array(MAP_W * MAP_H).fill(-1);
  const doorAt = new Int16Array(MAP_W * MAP_H).fill(-1);
  const props = buildProps();
  const solids = [];

  ROOMS.forEach((r, i) => {
    for (const [x0, z0, x1, z1] of r.rects) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) grid[z * MAP_W + x] = i;
  });
  DOORS.forEach((d, i) => { for (const [x, z] of d.tiles) doorAt[z * MAP_W + x] = i; });

  function tileRoom(tx, tz) { return tx < 0 || tz < 0 || tx >= MAP_W || tz >= MAP_H ? -1 : grid[tz * MAP_W + tx]; }
  function roomAt(x, z) { return tileRoom(Math.floor(x / TILE), Math.floor(z / TILE)); }
  function doorTile(tx, tz) { return tx < 0 || tz < 0 || tx >= MAP_W || tz >= MAP_H ? -1 : doorAt[tz * MAP_W + tx]; }

  for (const p of props) {
    p.room = roomAt((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2);
    if (p.solid) solids.push(p);
  }

  function buildMesh() {
    const mb = new MeshBuilder();
    const H = WALL_H;
    for (let tz = 0; tz < MAP_H; tz++) for (let tx = 0; tx < MAP_W; tx++) {
      const ri = tileRoom(tx, tz);
      if (ri < 0) continue;
      const R = ROOMS[ri];
      const x0 = tx * TILE, z0 = tz * TILE, x1 = x0 + TILE, z1 = z0 + TILE;
      mb.quad([x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [0, 1, 0], R.floor[1], R.floor[0]);
      mb.quad([x0, H, z0], [x1, H, z0], [x1, H, z1], [x0, H, z1], [0, -1, 0], R.ceil, MAT.STONE);
      const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dz] of sides) {
        if (tileRoom(tx + dx, tz + dz) >= 0) continue;
        let a, b, n;
        if (dx === 1) { a = [x1, z0]; b = [x1, z1]; n = [-1, 0, 0]; }
        else if (dx === -1) { a = [x0, z0]; b = [x0, z1]; n = [1, 0, 0]; }
        else if (dz === 1) { a = [x0, z1]; b = [x1, z1]; n = [0, 0, -1]; }
        else { a = [x0, z0]; b = [x1, z0]; n = [0, 0, 1]; }
        mb.quad([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], H, b[1]], [a[0], H, a[1]], n, R.wall[1], R.wall[0]);
        // Crown moulding and skirting.
        const inx = n[0], inz = n[2];
        const sk = (y0, y1, depth, col) => {
          const px0 = Math.min(a[0], b[0], a[0] + inx * depth), px1 = Math.max(a[0], b[0], a[0] + inx * depth);
          const pz0 = Math.min(a[1], b[1], a[1] + inz * depth), pz1 = Math.max(a[1], b[1], a[1] + inz * depth);
          mb.box(px0, y0, pz0, px1, y1, pz1, col, MAT.WOOD);
        };
        if (R.wall[0] === MAT.PAPER) { sk(0, 0.14, 0.05, [0.16, 0.09, 0.05]); sk(H - 0.18, H, 0.08, [0.22, 0.14, 0.08]); }
        const di = doorTile(tx + dx, tz + dz);
        if (di >= 0) {
          const D = DOORS[di];
          const w = D.wide ? 1.85 : 1.3, h = D.wide ? 2.7 : 2.4;
          const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
          const along = dx !== 0 ? [0, 1] : [1, 0];
          const put = (hw, hh, depth, col, m, y0 = 0) => {
            const ex = along[0] * hw + Math.abs(n[0]) * depth, ez = along[1] * hw + Math.abs(n[2]) * depth;
            const ox = cx + n[0] * depth, oz = cz + n[2] * depth;
            mb.box(ox - ex, y0, oz - ez, ox + ex, y0 + hh, oz + ez, col, m);
          };
          const offs = D.wide ? (tx + dx === D.tiles[0][0] && tz + dz === D.tiles[0][1] ? 0.05 : -0.05) : 0;
          put(w / 2 + 0.15, h + 0.15, 0.03, [0.12, 0.07, 0.04], MAT.WOOD);
          put(w / 2, h, 0.06, D.col || [0.34, 0.2, 0.1], MAT.WOOD);
          // knob
          const kx = cx + along[0] * (w / 2 - 0.18) * (offs < 0 ? -1 : 1) + n[0] * 0.1;
          const kz = cz + along[1] * (w / 2 - 0.18) * (offs < 0 ? -1 : 1) + n[2] * 0.1;
          mb.box(kx - 0.05, 1.0, kz - 0.05, kx + 0.05, 1.1, kz + 0.05, [0.8, 0.62, 0.25], MAT.PLAIN);
        }
      }
    }
    for (const p of props) mb.box(p.x0, p.y0, p.z0, p.x1, p.y1, p.z1, p.col, p.mat, p.y0 > 0.01);
    return mb;
  }

  function pushOut(o, r, x0, z0, x1, z1) {
    const cx = clamp(o.x, x0, x1), cz = clamp(o.z, z0, z1);
    const dx = o.x - cx, dz = o.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return false;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      o.x += dx / d * (r - d); o.z += dz / d * (r - d);
    } else {
      const pl = o.x - x0, pr = x1 - o.x, pu = o.z - z0, pd = z1 - o.z, m = Math.min(pl, pr, pu, pd);
      if (m === pl) o.x = x0 - r; else if (m === pr) o.x = x1 + r; else if (m === pu) o.z = z0 - r; else o.z = z1 + r;
    }
    return true;
  }

  function collide(o, r) {
    let hit = false;
    for (let it = 0; it < 2; it++) {
      const tx0 = Math.floor((o.x - r) / TILE), tx1 = Math.floor((o.x + r) / TILE);
      const tz0 = Math.floor((o.z - r) / TILE), tz1 = Math.floor((o.z + r) / TILE);
      for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
        if (tileRoom(tx, tz) < 0) hit = pushOut(o, r, tx * TILE, tz * TILE, tx * TILE + TILE, tz * TILE + TILE) || hit;
      }
      for (const p of solids) {
        if (o.x + r < p.x0 || o.x - r > p.x1 || o.z + r < p.z0 || o.z - r > p.z1) continue;
        hit = pushOut(o, r, p.x0, p.z0, p.x1, p.z1) || hit;
      }
    }
    return hit;
  }

  // Line of sight through walls (and optionally tall props that would stop a bullet).
  function blocked(x, z, tall) {
    if (tileRoom(Math.floor(x / TILE), Math.floor(z / TILE)) < 0) return true;
    if (tall) for (const p of solids) if (p.y1 > 1.3 && x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return true;
    return false;
  }
  function los(ax, az, bx, bz, tall = false) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.2);
    for (let i = 1; i < n; i++) { const t = i / n; if (blocked(ax + (bx - ax) * t, az + (bz - az) * t, tall)) return false; }
    return true;
  }
  function rayDist(x, z, dx, dz, max) {
    for (let t = 0.1; t < max; t += 0.05) if (blocked(x + dx * t, z + dz * t, true)) return t;
    return max;
  }

  function camFor(ri, x, z) {
    const R = ROOMS[ri], tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
    for (let i = 0; i < R.cams.length; i++) {
      const c = R.cams[i].r;
      if (tx >= c[0] && tx <= c[2] && tz >= c[1] && tz <= c[3]) return i;
    }
    return 0;
  }

  return { tileRoom, roomAt, doorTile, collide, los, rayDist, camFor, buildMesh, props };
})();
