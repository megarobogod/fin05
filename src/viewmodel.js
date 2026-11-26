// viewmodel.js - the guns, gloved hands and armoured fist you see in front
// of you. They live in their own little scene, drawn on top of the world so
// they never poke into walls.
//
// The guns are low-poly models built from side outlines: each body part
// (stock, receiver, grip, handguard...) is drawn as a flat 2D outline and
// "extruded" (pushed out) to its thickness, with the edges chamfered.
//
// Gun coordinates: x runs from the butt (0) to the muzzle (about 1),
// y is up, w is sideways (+ is to the right).
import * as THREE from 'three';
import { textures } from './textures.js';

const PI = Math.PI;
const GUN_SCALE = 0.62;   // how big the guns look in your hands
const mat = (color, rough = 0.5, metal = 0.5, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: true, ...extra });
const glowMat = (color, i = 3) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: i, flatShading: true });

// shared materials
const M = {
  polymer: mat(0x1f2326, 0.75, 0.15),
  metal: mat(0x6a7178, 0.4, 0.45),
  darkMetal: mat(0x3e444a, 0.5, 0.4),
  armor: mat(0x4b5b35, 0.6, 0.3),
  armorDark: mat(0x323d24, 0.65, 0.3),
  glove: mat(0x26231f, 0.85, 0.05),
  hole: mat(0x070707, 0.9, 0),
  brass: mat(0xb08a3a, 0.4, 0.5),
  shell: mat(0x9a2020, 0.6, 0.1),
  wood: mat(0x4a3022, 0.7, 0.05),
  cyan: glowMat(0x40e8ff),
};

// a side outline pushed out sideways to `depth`, centred on w
function ext(points, depth, material, w = 0, holes = [], bevel = 0.004) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(s, { depth, steps: 1, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(PI / 2); // outline x â†’ forward (-z), thickness â†’ sideways
  const m = new THREE.Mesh(g, material);
  m.position.x = w;
  return m;
}
// a box: from x0 to x1 along the gun, centred at y and w
function blk(x0, x1, y, w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(d, h, x1 - x0), material);
  m.position.set(w, y, -(x0 + x1) / 2);
  return m;
}
// a tube along the gun from x0 to x1
function tube(x0, x1, y, w, r, material, sides = 8, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, x1 - x0, sides);
  g.rotateX(-PI / 2);
  const m = new THREE.Mesh(g, material);
  m.position.set(w, y, -(x0 + x1) / 2);
  return m;
}
// a tapered tube between two points (gun coords [x, y, w])
function seg(a, b, r0, r1, material, sides = 7) {
  const A = new THREE.Vector3(a[2], a[1], -a[0]), B = new THREE.Vector3(b[2], b[1], -b[0]);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r1, r0, len, sides);
  g.translate(0, len / 2, 0);
  const m = new THREE.Mesh(g, material);
  m.position.copy(A);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
  return m;
}
function flash(x) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({
    map: textures.glow, color: 0xffd080, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.set(0, 0.015, -x); m.visible = false;
  return m;
}

// The right hand round a pistol grip at x = gx, and the arm going back.
function rightHand(g, gx) {
  g.add(blk(gx - 0.05, gx + 0.04, -0.11, 0.04, 0.09, 0.028, M.glove));               // palm, right side of the grip
  g.add(blk(gx - 0.035, gx + 0.03, -0.095, 0.056, 0.06, 0.012, M.armorDark));         // armour on the back of the hand
  for (let i = 0; i < 4; i++) g.add(blk(gx + 0.03, gx + 0.058, -0.065 - i * 0.026, 0.004, 0.022, 0.07, M.glove)); // fingers wrapped round the front
  g.add(blk(gx - 0.04, gx + 0.04, -0.04, -0.03, 0.022, 0.024, M.glove));             // thumb over the left side
  g.add(seg([gx - 0.04, -0.15, 0.045], [gx - 0.5, -0.33, 0.13], 0.045, 0.062, M.armor));
  g.add(seg([gx - 0.08, -0.12, 0.05], [gx - 0.36, -0.24, 0.1], 0.035, 0.045, M.armorDark, 5));
  g.add(seg([gx - 0.07, -0.165, 0.08], [gx - 0.3, -0.27, 0.13], 0.006, 0.006, M.cyan, 4));
}
// The left hand under the handguard at x = gx, and the arm going back left.
function leftHand(g, gx, gy) {
  g.add(blk(gx - 0.05, gx + 0.05, gy, 0, 0.026, 0.075, M.glove));                    // palm under the gun
  for (let i = 0; i < 4; i++) g.add(blk(gx - 0.045 + i * 0.026, gx - 0.025 + i * 0.026, gy + 0.03, 0.043, 0.04, 0.016, M.glove)); // fingers up the right side
  g.add(blk(gx - 0.04, gx + 0.03, gy + 0.025, -0.043, 0.035, 0.016, M.glove));       // thumb on the left side
  g.add(seg([gx - 0.03, gy - 0.02, -0.01], [gx - 0.45, gy - 0.32, -0.3], 0.042, 0.06, M.armor));
  g.add(seg([gx - 0.1, gy - 0.04, -0.03], [gx - 0.34, gy - 0.22, -0.22], 0.032, 0.04, M.armorDark, 5));
}

// ---------- PULSE RIFLE ----------
function buildRifle() {
  const g = new THREE.Group();
  const barrelMat = mat(0x6a7076, 0.35, 0.5, { emissive: 0xff4010, emissiveIntensity: 0 });
  const glow = glowMat(0x40e8ff);
  // stock with a thumb hole
  g.add(ext([[0, -0.075], [0, 0.045], [0.03, 0.06], [0.2, 0.04], [0.2, -0.02], [0.12, -0.03], [0.05, -0.05], [0.03, -0.085]], 0.045, M.polymer, 0,
    [[[0.08, -0.012], [0.08, 0.018], [0.15, 0.024], [0.15, -0.008]]]));
  // receiver
  g.add(ext([[0.18, -0.045], [0.18, 0.055], [0.24, 0.07], [0.53, 0.07], [0.56, 0.045], [0.56, -0.035], [0.48, -0.05]], 0.075, M.darkMetal));
  g.add(blk(0.3, 0.42, 0.03, 0.04, 0.025, 0.006, M.hole));                       // ejection port
  g.add(blk(0.25, 0.5, -0.015, 0.041, 0.006, 0.004, M.metal));                   // trim line
  // pistol grip and trigger guard
  g.add(ext([[0.25, -0.045], [0.32, -0.045], [0.3, -0.18], [0.235, -0.19], [0.215, -0.17]], 0.045, M.polymer));
  g.add(ext([[0.32, -0.045], [0.41, -0.045], [0.41, -0.095], [0.33, -0.095]], 0.014, M.metal, 0,
    [[[0.335, -0.052], [0.335, -0.085], [0.4, -0.085], [0.4, -0.052]]], 0.002));
  // energy cell with a glowing window
  g.add(ext([[0.42, -0.045], [0.51, -0.045], [0.5, -0.175], [0.43, -0.175]], 0.05, M.polymer));
  g.add(blk(0.44, 0.49, -0.11, 0, 0.085, 0.054, glow));
  // handguard with vents and glow strips
  g.add(ext([[0.55, -0.045], [0.55, 0.055], [0.84, 0.05], [0.87, 0.025], [0.87, -0.03], [0.83, -0.05]], 0.068, M.armor));
  for (const w of [-1, 1]) {
    for (let i = 0; i < 4; i++) g.add(blk(0.6 + i * 0.055, 0.63 + i * 0.055, 0.015, w * 0.037, 0.035, 0.004, M.hole));
    g.add(blk(0.57, 0.83, -0.028, w * 0.037, 0.008, 0.003, glow));
  }
  // barrel and muzzle brake
  g.add(tube(0.86, 1.0, 0.012, 0, 0.017, barrelMat, 8));
  g.add(tube(0.98, 1.07, 0.012, 0, 0.028, M.metal, 6));
  for (const w of [-1, 1]) g.add(blk(1.0, 1.05, 0.012, w * 0.026, 0.012, 0.006, M.hole));
  // top rail with notches, holo sight, front sight
  g.add(blk(0.2, 0.55, 0.078, 0, 0.012, 0.03, M.metal));
  for (let i = 0; i < 11; i++) g.add(blk(0.21 + i * 0.03, 0.225 + i * 0.03, 0.086, 0, 0.006, 0.034, M.darkMetal));
  g.add(blk(0.29, 0.4, 0.093, 0, 0.012, 0.04, M.darkMetal));
  g.add(ext([[0.33, 0.095], [0.38, 0.095], [0.38, 0.15], [0.36, 0.155], [0.35, 0.155], [0.33, 0.15]], 0.045, M.darkMetal, 0,
    [[[0.337, 0.1], [0.373, 0.1], [0.373, 0.146], [0.337, 0.146]]], 0.002));
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.034, 0.044), new THREE.MeshBasicMaterial({ color: 0x40e8ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  lens.position.set(0, 0.123, -0.355); g.add(lens);
  g.add(blk(0.82, 0.84, 0.068, 0, 0.03, 0.01, M.metal));
  rightHand(g, 0.27);
  leftHand(g, 0.71, -0.068);
  const fl = flash(1.1); g.add(fl);
  g.scale.setScalar(GUN_SCALE);
  g.position.set(0.19, -0.17, -0.12);
  return { group: g, base: g.position.clone(), flash: fl, barrel: barrelMat, glow };
}

// ---------- SCATTERGUN ----------
function buildShotgun() {
  const g = new THREE.Group();
  const vent = glowMat(0xff6a10, 1);
  g.add(ext([[0, -0.085], [0, 0.05], [0.04, 0.065], [0.2, 0.048], [0.2, -0.03], [0.05, -0.065]], 0.055, M.polymer));
  g.add(ext([[0.18, -0.055], [0.18, 0.065], [0.22, 0.088], [0.48, 0.088], [0.51, 0.06], [0.51, -0.055]], 0.1, mat(0x5e5246, 0.5, 0.4)));
  for (let i = 0; i < 3; i++) g.add(blk(0.27 + i * 0.065, 0.3 + i * 0.065, 0.091, 0, 0.01, 0.075, vent));
  for (const w of [-1, 1]) for (let i = 0; i < 4; i++) g.add(blk(0.24 + i * 0.05, 0.265 + i * 0.05, 0.01, w * 0.053, 0.08, 0.008, M.darkMetal));
  g.add(ext([[0.25, -0.05], [0.33, -0.05], [0.31, -0.19], [0.24, -0.2], [0.22, -0.18]], 0.05, M.polymer));
  g.add(ext([[0.33, -0.05], [0.42, -0.05], [0.42, -0.1], [0.34, -0.1]], 0.014, M.metal, 0,
    [[[0.345, -0.056], [0.345, -0.09], [0.41, -0.09], [0.41, -0.056]]], 0.002));
  // two fat barrels, bands, and dark bores at the end
  for (const w of [-1, 1]) {
    g.add(tube(0.5, 1.0, 0.04, w * 0.036, 0.034, M.darkMetal, 8));
    g.add(tube(0.995, 1.006, 0.04, w * 0.036, 0.024, M.hole, 8));
  }
  for (const x of [0.74, 0.96]) g.add(blk(x, x + 0.025, 0.04, 0, 0.078, 0.15, M.metal));
  g.add(tube(0.5, 0.95, -0.012, 0, 0.026, M.metal, 8));
  // pump with grip grooves
  g.add(ext([[0.55, -0.015], [0.55, -0.045], [0.58, -0.075], [0.8, -0.075], [0.82, -0.045], [0.82, -0.015]], 0.09, M.wood));
  for (let i = 0; i < 6; i++) g.add(blk(0.6 + i * 0.035, 0.612 + i * 0.035, -0.077, 0, 0.006, 0.094, M.polymer));
  // spare shells on the left side
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.055, 8), M.shell);
    s.position.set(-0.063, 0.0, -(0.24 + i * 0.033)); g.add(s);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.014, 8), M.brass);
    b.position.set(-0.063, -0.033, -(0.24 + i * 0.033)); g.add(b);
  }
  g.add(blk(0.225, 0.4, -0.01, -0.055, 0.04, 0.008, M.polymer));
  rightHand(g, 0.28);
  leftHand(g, 0.69, -0.098);
  const fl = flash(1.06); fl.scale.setScalar(1.8); g.add(fl);
  g.scale.setScalar(GUN_SCALE);
  g.position.set(0.195, -0.175, -0.11);
  g.visible = false;
  return { group: g, base: g.position.clone(), flash: fl, vent };
}

// ---------- ARMOURED FIST ----------
function buildFist() {
  const g = new THREE.Group();
  const box = (w, h, d, m, x, y, z, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.x = rx; g.add(b); };
  box(0.1, 0.085, 0.1, M.glove, 0, 0, 0);                          // back of the hand
  box(0.112, 0.04, 0.045, M.metal, 0, 0.025, -0.055);              // knuckle plate
  for (let i = 0; i < 4; i++) {
    const x = -0.036 + i * 0.024;
    const stud = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.022, 4), M.darkMetal);
    stud.rotation.x = -PI / 2; stud.position.set(x, 0.028, -0.085); g.add(stud);
    box(0.022, 0.042, 0.035, M.glove, x, -0.012, -0.068);          // curled fingers
    box(0.022, 0.032, 0.035, M.glove, x, -0.045, -0.045, 0.4);
  }
  box(0.065, 0.026, 0.03, M.glove, 0.012, -0.052, -0.075, 0.2);    // thumb across the front
  box(0.07, 0.02, 0.07, M.armorDark, 0, 0.05, 0.0);                // plate on the back of the hand
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.06, 7), M.metal);
  cuff.rotation.x = PI / 2; cuff.position.z = 0.08; g.add(cuff);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.006, 3, 14), M.cyan);
  ring.position.z = 0.07; g.add(ring);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.068, 0.38, 7), M.armor);
  arm.rotation.x = PI / 2; arm.position.z = 0.29; g.add(arm);
  box(0.06, 0.02, 0.24, M.armorDark, 0, 0.065, 0.27);
  return g;
}

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xd8d4b0, 0x302418, 1.3));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.8); sun.position.set(1, 2, 0.5); this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xb0ff60, 0.8); rim.position.set(-1, 0.5, -1); this.scene.add(rim);
    this.light = new THREE.PointLight(0xffc070, 0, 3, 2); this.light.position.set(0.2, -0.1, -0.9); this.scene.add(this.light);
    this.guns = [buildRifle(), buildShotgun()];
    for (const gun of this.guns) this.scene.add(gun.group);
    this.fist = buildFist(); this.scene.add(this.fist);
    this.fistRest = new THREE.Vector3(-0.35, -0.6, -0.25);
    this.fistOut = new THREE.Vector3(-0.08, -0.15, -0.55);
    this.fist.position.copy(this.fistRest);
    this.current = 0; this.next = 0;
    this.kick = 0; this.flashT = 0; this.switchT = 0; this.punchT = 0;
    this.bobT = 0; this.swayX = 0; this.swayY = 0; this.tilt = 0;
  }

  resize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
  fire(kind) { this.kick = kind === 'shotgun' ? 1 : 0.35; this.flashT = 0.05; this.light.intensity = kind === 'shotgun' ? 8 : 4; }
  punch() { this.punchT = 0.28; }
  switchTo(i) { this.next = i; this.switchT = 0.3; }

  update(dt, p) {
    const hs = Math.hypot(p.vel.x, p.vel.z);
    const walking = p.onGround && !p.sliding;
    if (walking) this.bobT += dt * hs * 0.7;
    const bob = walking ? Math.min(1, hs / 15) : 0;
    this.swayX += (Math.max(-0.05, Math.min(0.05, -p.lookDX * 0.0008)) - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (Math.max(-0.04, Math.min(0.04, -p.vel.y * 0.003)) - this.swayY) * Math.min(1, dt * 8);
    this.kick = Math.max(0, this.kick - dt * 6);
    this.tilt += ((p.sliding ? 0.3 : 0) - this.tilt) * Math.min(1, dt * 10);

    // switching: lower the old gun, swap at the bottom, raise the new one
    let drop = 0;
    if (this.switchT > 0) {
      this.switchT -= dt;
      if (this.switchT <= 0.15 && this.current !== this.next) {
        this.guns[this.current].group.visible = false;
        this.current = this.next;
        this.guns[this.current].group.visible = true;
      }
      drop = this.switchT > 0.15 ? (0.3 - this.switchT) / 0.15 : Math.max(0, this.switchT) / 0.15;
    }

    const gun = this.guns[this.current], gp = gun.group.position;
    gp.copy(gun.base);
    gp.x += Math.sin(this.bobT) * 0.014 * bob + this.swayX;
    gp.y += -Math.abs(Math.cos(this.bobT)) * 0.018 * bob - drop * 0.35 + this.swayY;
    gp.z += this.kick * 0.09;
    gun.group.rotation.set(this.kick * 0.2, 0, this.tilt);

    this.flashT -= dt;
    gun.flash.visible = this.flashT > 0;
    if (gun.flash.visible) gun.flash.rotation.z = Math.random() * 6;
    this.light.intensity = Math.max(0, this.light.intensity - dt * 60);

    // the rifle barrel glows hotter as it heats up
    const rifle = this.guns[0];
    rifle.barrel.emissiveIntensity = p.heat * 2.5 * (p.overheated ? 0.7 + Math.random() * 0.6 : 1);
    rifle.glow.emissiveIntensity = p.overheated ? 0.3 : 3;
    this.guns[1].vent.emissiveIntensity = 0.8 + (this.current === 1 ? this.kick * 6 : 0);

    // the fist shoots out and comes back
    if (this.punchT > 0) {
      this.punchT -= dt;
      const t = 1 - Math.max(0, this.punchT) / 0.28;
      const out = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
      this.fist.position.lerpVectors(this.fistRest, this.fistOut, Math.max(0, out));
      this.fist.rotation.set(0, 0, -0.3 * out);
    } else this.fist.position.copy(this.fistRest);
  }
}
