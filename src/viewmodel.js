// viewmodel.js - the guns and the fist you see in your hands. They live in
// their own little scene, drawn on top of the world so they never poke into walls.
import * as THREE from 'three';
import { textures } from './textures.js';

const metal = (c, r = 0.45, m = 0.75) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const armor = new THREE.MeshStandardMaterial({ color: 0x3d4a2e, roughness: 0.7, metalness: 0.25 });

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m;
}
function tube(r, len, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat);
  m.rotation.x = Math.PI / 2; m.position.set(x, y, z); return m;
}
function flash(tipZ) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({
    map: textures.glow, color: 0xffd080, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.set(0, 0.015, tipZ); m.visible = false;
  return m;
}

function buildRifle() {
  const g = new THREE.Group();
  const body = metal(0x2c3136), dark = metal(0x15181b, 0.6, 0.5);
  const glow = new THREE.MeshStandardMaterial({ color: 0x40e8ff, emissive: 0x40e8ff, emissiveIntensity: 3 });
  const barrel = metal(0x3a3f44, 0.35, 0.9); barrel.emissive = new THREE.Color(0xff4010); barrel.emissiveIntensity = 0;
  g.add(box(0.09, 0.12, 0.46, body, 0, 0, -0.1));
  g.add(box(0.06, 0.04, 0.36, dark, 0, 0.08, -0.12));
  g.add(tube(0.024, 0.36, barrel, 0, 0.015, -0.5));
  g.add(tube(0.036, 0.14, dark, 0, 0.015, -0.36));
  g.add(box(0.004, 0.025, 0.3, glow, 0.047, 0.01, -0.12), box(0.004, 0.025, 0.3, glow, -0.047, 0.01, -0.12));
  const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.12, 10), glow); cell.position.set(0, -0.1, -0.12); g.add(cell);
  const grip = box(0.06, 0.15, 0.07, dark, 0, -0.11, 0.06); grip.rotation.x = -0.3; g.add(grip);
  g.add(box(0.1, 0.1, 0.13, armor, 0, -0.16, 0.08));
  g.add(box(0.13, 0.13, 0.45, armor, 0.03, -0.2, 0.34));
  const fl = flash(-0.72); g.add(fl);
  g.position.set(0.24, -0.25, -0.5);
  return { group: g, base: g.position.clone(), flash: fl, barrel, glow };
}

function buildShotgun() {
  const g = new THREE.Group();
  const body = metal(0x3a3430, 0.5, 0.6), dark = metal(0x161414, 0.6, 0.5);
  const vent = new THREE.MeshStandardMaterial({ color: 0xff7a20, emissive: 0xff6a10, emissiveIntensity: 1 });
  g.add(box(0.15, 0.15, 0.42, body, 0, 0, -0.06));
  g.add(tube(0.038, 0.42, dark, 0.037, 0.03, -0.42), tube(0.038, 0.42, dark, -0.037, 0.03, -0.42));
  g.add(box(0.13, 0.08, 0.18, metal(0x5a5048, 0.5, 0.5), 0, -0.06, -0.36));
  for (let i = 0; i < 3; i++) g.add(box(0.155, 0.02, 0.03, vent, 0, 0.05, -0.15 + i * 0.07));
  const grip = box(0.07, 0.16, 0.08, dark, 0, -0.13, 0.1); grip.rotation.x = -0.35; g.add(grip);
  g.add(box(0.11, 0.1, 0.13, armor, 0, -0.18, 0.12));
  g.add(box(0.14, 0.14, 0.45, armor, 0.03, -0.22, 0.38));
  const fl = flash(-0.68); fl.scale.setScalar(1.8); g.add(fl);
  g.position.set(0.25, -0.27, -0.48);
  g.visible = false;
  return { group: g, base: g.position.clone(), flash: fl, vent };
}

function buildFist() {
  const g = new THREE.Group();
  g.add(box(0.14, 0.13, 0.16, armor, 0, 0, 0));
  g.add(box(0.15, 0.06, 0.05, metal(0x6a6e72, 0.3, 0.9), 0, 0.02, -0.09));
  g.add(box(0.12, 0.12, 0.4, armor, 0.02, -0.02, 0.27));
  g.add(box(0.03, 0.03, 0.2, new THREE.MeshStandardMaterial({ color: 0x40e8ff, emissive: 0x40e8ff, emissiveIntensity: 2 }), 0.065, 0.03, 0.25));
  return g;
}

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xd8d4b0, 0x302418, 1.4));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.6); sun.position.set(1, 2, 1); this.scene.add(sun);
    this.light = new THREE.PointLight(0xffc070, 0, 3, 2); this.light.position.set(0.2, -0.1, -0.9); this.scene.add(this.light);
    this.guns = [buildRifle(), buildShotgun()];
    for (const gun of this.guns) this.scene.add(gun.group);
    this.fist = buildFist(); this.scene.add(this.fist);
    this.fistRest = new THREE.Vector3(-0.35, -0.6, -0.25);
    this.fistOut = new THREE.Vector3(-0.08, -0.16, -0.6);
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
