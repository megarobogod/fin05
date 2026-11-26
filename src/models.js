// models.js - low-poly creature models, sculpted in code.
//
// How a model is made:
//   1. Start from a simple shape (ball, tube, cone, or a "lathe": a side
//      outline spun round like a vase).
//   2. Squash it, then push its corners in and out with noise so it looks
//      lumpy and hand-made rather than perfectly round.
//   3. Paint every triangle its own colour (base colour, rot patches,
//      darker underneath) - that faceted look is what makes it "low poly".
//   4. Hang the pieces on a skeleton of joints (hips, spine, neck, head,
//      jaw, shoulders, elbows, hips, knees...) so enemies.js can animate them.
// Pieces on the same joint are merged into one mesh so they draw fast.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI;

// ---------- Noise (smooth random bumps) ----------
function hash(x, y, z, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440662683) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise3(x, y, z, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = (t) => t * t * (3 - 2 * t);
  const fx = u(x - xi), fy = u(y - yi), fz = u(z - zi);
  const L = (a, b, t) => a + (b - a) * t;
  const h = (i, j, k) => hash(xi + i, yi + j, zi + k, s);
  return L(
    L(L(h(0, 0, 0), h(1, 0, 0), fx), L(h(0, 1, 0), h(1, 1, 0), fx), fy),
    L(L(h(0, 0, 1), h(1, 0, 1), fx), L(h(0, 1, 1), h(1, 1, 1), fx), fy), fz);
}
let seed = 1;
const rand = () => hash(seed++, 7, 13, 99);

// ---------- Basic shapes ----------
export const ball = (r, sx = 1, sy = 1, sz = 1, detail = 1) => new THREE.IcosahedronGeometry(r, detail).scale(sx, sy, sz);
// a tapered tube hanging DOWN from its joint (r0 at the joint, r1 at the end)
export const limb = (r0, r1, len, sides = 6) => new THREE.CylinderGeometry(r0, r1, len, sides, 2).translate(0, -len / 2, 0);
// a tapered tube standing UP from its joint
export const post = (r0, r1, len, sides = 6) => new THREE.CylinderGeometry(r1, r0, len, sides, 2).translate(0, len / 2, 0);
// a spike with its base at the origin, pointing up (+y)
export const spike = (r, len, sides = 4) => new THREE.ConeGeometry(r, len, sides).translate(0, len / 2, 0);
// spin an outline [[radius, height], ...] round the y axis
export const lathe = (pts, sides = 8) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), sides);
export const ring = (r, tube, arc = PI * 2, sides = 8) => new THREE.TorusGeometry(r, tube, 3, sides, arc);

// ---------- Sculpting and painting ----------
const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();

// Make a shape lumpy and faceted. jit = random poke per corner, lumps =
// smooth bulges (size set by freq).
function sculpt(geo, jit, lumps, freq) {
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  let g = mergeVertices(geo, 1e-4);
  if (jit || lumps) {
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    const p = g.attributes.position, s = seed++;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const dx = x - c.x, dy = y - c.y, dz = z - c.z, l = Math.hypot(dx, dy, dz) || 1;
      const a = (noise3(x * freq, y * freq, z * freq, s) - 0.5) * 2 * lumps + (rand() - 0.5) * 2 * jit;
      p.setXYZ(i, x + dx / l * a, y + dy / l * a, z + dz / l * a);
    }
  }
  g = g.toNonIndexed();
  g.computeVertexNormals(); // on separate triangles this gives the flat, faceted look
  return g;
}

// Give every triangle a colour: the base colour, varied a little per face,
// with patches of a second colour (rot, bruises) and darker underneath.
function paint(geo, o) {
  const p = geo.attributes.position, n = p.count;
  const col = new Float32Array(n * 3);
  geo.computeBoundingBox();
  const bb = geo.boundingBox, hy = Math.max(0.001, bb.max.y - bb.min.y);
  const base = new THREE.Color(o.c ?? 0x888888);
  const spotC = o.spot !== undefined ? new THREE.Color(o.spot) : null;
  const s = seed++;
  for (let i = 0; i < n; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    tmpC.copy(base);
    if (spotC) {
      const f = o.spotFreq ?? 6;
      const v = noise3(cx * f, cy * f, cz * f, s);
      const t = Math.min(1, Math.max(0, (v - (1 - (o.spotAmt ?? 0.3))) * 5));
      tmpC.lerp(spotC, t);
    }
    if (o.shade) tmpC.multiplyScalar(1 - o.shade * (1 - (cy - bb.min.y) / hy));
    tmpC.multiplyScalar(1 + (rand() - 0.5) * (o.vary ?? 0.22));
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = tmpC.r; col[(i + k) * 3 + 1] = tmpC.g; col[(i + k) * 3 + 2] = tmpC.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

const UP = new THREE.Vector3(0, 1, 0);
// Sculpt, turn, place and paint one piece.
//   s: scale [x,y,z] (before sculpting)    jit / lumps / freq: sculpting
//   r: turn [x,y,z] in radians (x first, then y, then z)
//   dir: point the shape's "up" along this direction instead
//   p: position [x,y,z]    c / spot / spotAmt / shade / vary: painting
export function part(geo, o = {}) {
  if (o.s) geo.scale(...o.s);
  const g = sculpt(geo, o.jit || 0, o.lumps || 0, o.freq || 3);
  if (o.r) { g.rotateX(o.r[0]); g.rotateY(o.r[1] || 0); g.rotateZ(o.r[2] || 0); }
  if (o.dir) g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(...o.dir).normalize()));
  if (o.p) g.translate(...o.p);
  return paint(g, o);
}

// ---------- Skeleton ----------
class Rig {
  constructor(name) {
    this.root = new THREE.Group();
    this.root.name = name;
    this.bones = { root: this.root };
    this.pieces = []; // [bone, kind, geometry]
  }
  // a joint: name, parent joint, position, and how it is turned at rest
  bone(name, parent, x, y, z, rx = 0, rz = 0) {
    const b = new THREE.Group();
    b.name = name; b.position.set(x, y, z); b.rotation.set(rx, 0, rz);
    b.userData.rest = { x: rx, z: rz, y: y };
    this.bones[parent].add(b);
    this.bones[name] = b;
    return b;
  }
  add(bone, geo, kind = 'flesh') { this.pieces.push([bone, kind, geo]); }
  finish() {
    const groups = new Map();
    for (const [bone, kind, geo] of this.pieces) {
      const k = bone + '|' + kind;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(geo);
    }
    for (const [k, geos] of groups) {
      const [bone, kind] = k.split('|');
      const m = new THREE.Mesh(mergeGeometries(geos), PLACEHOLDER[kind]);
      m.userData.kind = kind;
      this.bones[bone].add(m);
    }
    return this.root;
  }
}
const PLACEHOLDER = { flesh: new THREE.MeshStandardMaterial(), glow: new THREE.MeshStandardMaterial(), sac: new THREE.MeshStandardMaterial() };

// A point on the outside of a squashed ball, for placing boils and spikes.
function onBall(cx, cy, cz, rx, ry, rz, a, b, out = 1) {
  return [cx + Math.cos(b) * Math.sin(a) * rx * out, cy + Math.sin(b) * ry * out, cz + Math.cos(b) * Math.cos(a) * rz * out];
}

// ---------- Colours ----------
const BONE = 0xd9cdb0, DARK = 0x24140f, BLOOD = 0x6e1a18, ROT = 0x76902a, GLOW = 0xd6ff40;

// ---------- HUSK: a hunched, rotting thing with long clawed arms ----------
function husk() {
  seed = 100;
  const R = new Rig('husk');
  const SKIN = 0xa08c72, SKIN2 = 0x7a6450;
  R.bone('hips', 'root', 0, 0.95, 0);
  R.add('hips', part(ball(0.23, 1.25, 0.7, 0.95), { jit: 0.02, c: SKIN2, spot: ROT }));
  R.bone('spine', 'hips', 0, 0.06, 0, 0.45);
  R.add('spine', part(lathe([[0.001, 0], [0.2, 0.02], [0.3, 0.17], [0.35, 0.37], [0.36, 0.55], [0.3, 0.71], [0.17, 0.82], [0.001, 0.85]], 9),
    { s: [1, 1, 0.78], jit: 0.02, lumps: 0.035, c: SKIN, spot: ROT, spotAmt: 0.35, shade: 0.35 }));
  // ribs showing through the chest
  for (let i = 0; i < 4; i++) {
    R.add('spine', part(ring(0.36 - Math.abs(i - 1.5) * 0.02, 0.02, PI * 0.9, 9), { s: [1, 0.8, 1], r: [PI / 2, 0.05 * PI, 0], p: [0, 0.3 + i * 0.11, 0.01], c: BONE }));
  }
  // bony ridge down the back
  for (let i = 0; i < 6; i++) R.add('spine', part(spike(0.04, 0.11 + (i % 2) * 0.04), { r: [-1.2, 0, 0], p: [0, 0.12 + i * 0.12, -0.25], c: BONE }));
  // a growth on the shoulder and glowing pustules
  R.add('spine', part(ball(0.15, 1, 0.9, 1), { lumps: 0.05, freq: 6, p: [0.22, 0.72, -0.06], c: 0x8a9a40, spot: BLOOD }));
  for (let i = 0; i < 8; i++) {
    const a = (rand() - 0.5) * 2.6, y = 0.25 + rand() * 0.45;
    R.add('spine', part(ball(0.03 + rand() * 0.04, 1, 1, 1, 0), { p: [Math.sin(a) * 0.35, y, Math.cos(a) * 0.29], c: GLOW }), 'glow');
  }
  // neck, head and jaw
  R.bone('neck', 'spine', 0, 0.78, 0.07, -0.25);
  R.add('neck', part(post(0.1, 0.07, 0.22), { jit: 0.01, c: SKIN2 }));
  R.bone('head', 'neck', 0, 0.2, 0.03, -0.2);
  R.add('head', part(ball(0.2, 0.82, 0.78, 1.25), { jit: 0.012, lumps: 0.02, p: [0, 0.06, 0.06], c: SKIN, spot: BLOOD, shade: 0.25 }));
  R.add('head', part(ball(0.09, 2.1, 0.45, 0.8, 0), { p: [0, 0.13, 0.2], c: SKIN2 }));
  for (const s of [-1, 1]) {
    R.add('head', part(ball(0.05, 1, 0.8, 0.6, 0), { p: [s * 0.075, 0.075, 0.23], c: DARK }));
    R.add('head', part(ball(0.032, 1, 1, 1, 0), { p: [s * 0.075, 0.075, 0.255], c: GLOW }), 'glow');
  }
  for (let i = 0; i < 7; i++) {
    const a = -0.6 + i * 0.2;
    R.add('head', part(spike(0.017, 0.07, 3), { r: [PI, 0, 0], p: [Math.sin(a) * 0.11, -0.02, 0.13 + Math.cos(a) * 0.11], c: BONE }));
  }
  R.bone('jaw', 'head', 0, -0.02, 0.0, 0.25);
  R.add('jaw', part(ball(0.13, 0.95, 0.35, 1.4), { jit: 0.01, p: [0, -0.07, 0.11], c: SKIN2, spot: BLOOD }));
  for (let i = 0; i < 6; i++) {
    const a = -0.5 + i * 0.2;
    R.add('jaw', part(spike(0.015, 0.06, 3), { p: [Math.sin(a) * 0.1, -0.05, 0.12 + Math.cos(a) * 0.1], c: BONE }));
  }
  // long arms ending in three claws
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    R.bone('arm' + side, 'spine', s * 0.33, 0.66, 0.04);
    R.add('arm' + side, part(ball(0.1, 1, 1, 1, 0), { c: SKIN2 }));
    R.add('arm' + side, part(limb(0.085, 0.06, 0.5), { jit: 0.012, c: SKIN, spot: ROT }));
    R.bone('elbow' + side, 'arm' + side, 0, -0.5, 0);
    R.add('elbow' + side, part(ball(0.065, 1, 1, 1, 0), { c: BONE }));
    R.add('elbow' + side, part(limb(0.065, 0.045, 0.48), { jit: 0.01, c: SKIN, spot: BLOOD }));
    R.add('elbow' + side, part(ball(0.06, 1, 0.6, 1.3, 0), { p: [0, -0.52, 0.02], c: SKIN2 }));
    for (let k = -1; k <= 1; k++) R.add('elbow' + side, part(spike(0.022, 0.3), { r: [PI + 0.25, 0, k * 0.15], p: [k * 0.035, -0.55, 0.04], c: BONE }));
  }
  // legs with clawed feet
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    R.bone('leg' + side, 'hips', s * 0.16, -0.04, 0);
    R.add('leg' + side, part(limb(0.1, 0.075, 0.45), { jit: 0.012, c: SKIN2, spot: ROT }));
    R.bone('knee' + side, 'leg' + side, 0, -0.45, 0);
    R.add('knee' + side, part(ball(0.07, 1, 1, 1, 0), { c: BONE }));
    R.add('knee' + side, part(limb(0.07, 0.05, 0.44), { jit: 0.01, c: SKIN }));
    R.add('knee' + side, part(ball(0.07, 1, 0.55, 1.9, 0), { p: [0, -0.46, 0.07], c: SKIN2 }));
    for (let k = -1; k <= 1; k++) R.add('knee' + side, part(spike(0.02, 0.12, 3), { r: [PI / 2, 0, 0], p: [k * 0.04, -0.47, 0.17], c: BONE }));
  }
  return R.finish();
}

// ---------- SPITTER: tall, thin, backward knees, a glowing bile sac in its throat ----------
function spitter() {
  seed = 200;
  const R = new Rig('spitter');
  const SKIN = 0x8c7c92, SKIN2 = 0x625268, FRILL = 0xa02a3a;
  R.bone('hips', 'root', 0, 1.33, 0);
  R.add('hips', part(ball(0.2, 1.2, 0.7, 0.9), { jit: 0.02, c: SKIN2, spot: ROT }));
  // backward-bending legs: thigh forward, shin back, long foot
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    R.bone('leg' + side, 'hips', s * 0.17, -0.03, 0, -0.5);
    R.add('leg' + side, part(limb(0.085, 0.06, 0.55), { jit: 0.012, c: SKIN, spot: ROT }));
    R.bone('knee' + side, 'leg' + side, 0, -0.55, 0, 1.0);
    R.add('knee' + side, part(ball(0.06, 1, 1, 1, 0), { c: BONE }));
    R.add('knee' + side, part(limb(0.06, 0.04, 0.6), { jit: 0.01, c: SKIN2 }));
    R.add('knee' + side, part(spike(0.03, 0.14), { r: [-2.2, 0, 0], p: [0, 0, -0.04], c: BONE }));
    R.bone('ankle' + side, 'knee' + side, 0, -0.6, 0, -0.5);
    R.add('ankle' + side, part(limb(0.04, 0.03, 0.32, 5), { c: SKIN }));
    for (let k = -1; k <= 1; k++) R.add('ankle' + side, part(spike(0.022, 0.16, 3), { r: [PI / 2 + 0.2, k * 0.35, 0], p: [0, -0.32, 0.02], c: BONE }));
  }
  R.bone('spine', 'hips', 0, 0.06, 0, 0.12);
  R.add('spine', part(lathe([[0.001, 0], [0.18, 0.03], [0.3, 0.22], [0.33, 0.48], [0.28, 0.75], [0.17, 0.92], [0.001, 0.96]], 8),
    { s: [1, 1, 0.75], jit: 0.018, lumps: 0.03, c: SKIN, spot: ROT, spotAmt: 0.3, shade: 0.35 }));
  for (let i = 0; i < 4; i++) R.add('spine', part(spike(0.05, 0.32 + i * 0.06, 4), { r: [-0.75, 0, 0], p: [0, 0.25 + i * 0.17, -0.17], c: BONE }));
  for (let i = 0; i < 3; i++) R.add('spine', part(ring(0.26, 0.018, PI * 0.8, 8), { s: [1, 0.75, 1], r: [PI / 2, 0.1 * PI, 0], p: [0, 0.3 + i * 0.12, 0.01], c: BONE }));
  // the bile sac, with a fleshy collar round it
  R.bone('sac', 'spine', 0, 0.62, 0.17);
  R.add('sac', part(ball(0.2, 1, 1.1, 1), { jit: 0.02, c: GLOW }), 'sac');
  R.add('spine', part(ring(0.2, 0.045, PI * 2, 10), { lumps: 0.02, p: [0, 0.62, 0.12], c: SKIN2 }));
  // head with three eyes and a frilled mouth
  R.bone('head', 'spine', 0, 0.93, 0.04, -0.12);
  R.add('head', part(ball(0.19, 0.95, 1.15, 1.05), { jit: 0.012, lumps: 0.015, p: [0, 0.12, 0.03], c: SKIN, shade: 0.3 }));
  R.add('head', part(ball(0.07, 1, 1, 0.5, 0), { p: [0, 0.03, 0.21], c: DARK }));
  for (let k = 0; k < 9; k++) {
    const a = k / 9 * PI * 2;
    R.add('head', part(spike(0.035, 0.18, 3), { dir: [Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0.6], p: [Math.cos(a) * 0.06, 0.03 + Math.sin(a) * 0.06, 0.2], c: FRILL }));
  }
  for (const [x, y] of [[0.09, 0.19], [-0.09, 0.19], [0, 0.27]]) R.add('head', part(ball(0.032, 1, 1, 1, 0), { p: [x, y, 0.18], c: GLOW }), 'glow');
  // thin arms with hooks
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    R.bone('arm' + side, 'spine', s * 0.25, 0.78, 0.02);
    R.add('arm' + side, part(limb(0.06, 0.045, 0.38), { jit: 0.01, c: SKIN }));
    R.bone('elbow' + side, 'arm' + side, 0, -0.38, 0);
    R.add('elbow' + side, part(limb(0.045, 0.035, 0.38), { c: SKIN2 }));
    R.add('elbow' + side, part(spike(0.03, 0.3), { dir: [0, -1, 0.6], p: [0, -0.38, 0], c: BONE }));
  }
  return R.finish();
}

// ---------- BLOATER: a huge swollen sack of rot on stubby legs ----------
function bloater() {
  seed = 300;
  const R = new Rig('bloater');
  const SKIN = 0xa0a46a, SKIN2 = 0x7a6a50, BRUISE = 0x6a3a5a;
  R.bone('body', 'root', 0, 0, 0);
  R.add('body', part(new THREE.IcosahedronGeometry(1.15, 2), { s: [1, 0.95, 1.05], lumps: 0.13, freq: 1.6, jit: 0.02, p: [0, 1.38, 0], c: SKIN, spot: BRUISE, spotAmt: 0.35, spotFreq: 2.5, shade: 0.45 }));
  // a mouth in its belly
  R.add('body', part(ball(0.32, 1, 1.25, 0.4), { p: [0, 1.25, 1.08], c: DARK }));
  R.add('body', part(ball(0.12, 1, 1, 1, 0), { p: [0, 1.25, 1.02], c: GLOW }), 'glow');
  for (let k = 0; k < 11; k++) {
    const a = k / 11 * PI * 2;
    R.add('body', part(spike(0.04, 0.17, 3), { dir: [-Math.cos(a) * 0.6, -Math.sin(a) * 0.6, 0.5], p: [Math.cos(a) * 0.3, 1.25 + Math.sin(a) * 0.38, 1.12], c: BONE }));
  }
  // boils all over
  for (let i = 0; i < 20; i++) {
    const a = (rand() - 0.5) * PI * 2, b = (rand() - 0.25) * 1.4;
    if (Math.abs(a) < 0.5 && Math.abs(b) < 0.4) continue; // keep the mouth clear
    const r = 0.1 + rand() * 0.1;
    R.add('body', part(ball(r, 1, 1, 1, 0), { p: onBall(0, 1.38, 0, 1.12, 1.07, 1.17, a, b), c: 0x8a5a4a }));
    R.add('body', part(ball(r * 0.65, 1, 1, 1, 0), { p: onBall(0, 1.38, 0, 1.12, 1.07, 1.17, a, b, 1 + r * 0.7), c: GLOW }), 'glow');
  }
  // chimneys on its back that leak glowing gas
  for (const x of [-0.4, 0, 0.4]) {
    const d = [x * 0.5, 0.8, -0.6];
    R.add('body', part(post(0.13, 0.09, 0.45, 6), { dir: d, p: [x, 2.05, -0.72], jit: 0.01, c: SKIN2 }));
    const l = Math.hypot(...d);
    R.add('body', part(ball(0.08, 1, 1, 1, 0), { p: [x + d[0] / l * 0.47, 2.05 + d[1] / l * 0.47, -0.72 + d[2] / l * 0.47], c: GLOW }), 'glow');
  }
  // a small head sunk into its shoulders
  R.bone('head', 'body', 0, 2.32, 0.5);
  R.add('head', part(ball(0.3, 1, 0.85, 1.1), { jit: 0.015, lumps: 0.03, c: SKIN, spot: BRUISE, shade: 0.3 }));
  for (const s of [-1, 1]) R.add('head', part(ball(0.035, 1, 1, 1, 0), { p: [s * 0.11, 0.06, 0.29], c: GLOW }), 'glow');
  R.bone('jaw', 'head', 0, -0.05, 0.05, 0.2);
  R.add('jaw', part(ball(0.2, 1, 0.4, 1.2), { p: [0, -0.12, 0.12], c: SKIN2 }));
  for (let i = 0; i < 5; i++) R.add('jaw', part(spike(0.02, 0.07, 3), { p: [-0.12 + i * 0.06, -0.09, 0.3], c: BONE }));
  // stubby arms
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    R.bone('arm' + side, 'body', s * 1.0, 1.8, 0.25);
    R.add('arm' + side, part(limb(0.13, 0.1, 0.42), { jit: 0.012, c: SKIN }));
    R.bone('elbow' + side, 'arm' + side, 0, -0.42, 0);
    R.add('elbow' + side, part(limb(0.1, 0.08, 0.36), { c: SKIN2 }));
    for (let k = -1; k <= 1; k++) R.add('elbow' + side, part(spike(0.03, 0.18), { r: [PI + 0.2, 0, k * 0.2], p: [k * 0.05, -0.36, 0.03], c: BONE }));
  }
  // thick legs
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    R.bone('leg' + side, 'root', s * 0.55, 0.8, 0);
    R.add('leg' + side, part(limb(0.24, 0.19, 0.42, 7), { jit: 0.015, c: SKIN, spot: BRUISE }));
    R.bone('knee' + side, 'leg' + side, 0, -0.42, 0);
    R.add('knee' + side, part(limb(0.19, 0.22, 0.34, 7), { jit: 0.015, c: SKIN2 }));
    R.add('knee' + side, part(ball(0.24, 1, 0.45, 1.4, 0), { p: [0, -0.36, 0.08], c: SKIN2 }));
    for (let k = -1; k <= 1; k++) R.add('knee' + side, part(spike(0.04, 0.14, 3), { r: [PI / 2, 0, 0], p: [k * 0.12, -0.38, 0.38], c: BONE }));
  }
  return R.finish();
}

const BUILDERS = { husk, spitter, bloater };
const templates = {};

// Make a model for one creature. The shapes are built once per type and
// shared; each creature gets its own materials so it can flash when hit.
export function makeModel(type) {
  if (!templates[type]) templates[type] = BUILDERS[type]();
  const group = templates[type].clone(true);
  const flesh = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7, metalness: 0, emissive: 0x000000 });
  const glow = new THREE.MeshStandardMaterial({ color: GLOW, emissive: 0xb0ff20, emissiveIntensity: 1.2, flatShading: true });
  // the spitter's bile sac: see-through, and glows brighter as it charges
  const sac = new THREE.MeshStandardMaterial({ color: 0xb8ff40, emissive: 0x80d020, emissiveIntensity: 0.4, transparent: true, opacity: 0.85, flatShading: true, roughness: 0.2 });
  const bones = {};
  group.traverse(o => {
    if (o.isMesh) o.material = { glow, sac }[o.userData.kind] || flesh;
    else if (o.name) bones[o.name] = o;
  });
  return { group, bones, flesh: [flesh], glow, sac };
}

// Turn a joint by an amount on top of its resting pose.
export function pose(bone, x, z = 0) {
  if (!bone) return;
  bone.rotation.x = bone.userData.rest.x + x;
  bone.rotation.z = bone.userData.rest.z + z;
}
