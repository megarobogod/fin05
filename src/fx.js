// fx.js - the juice: gore, sparks, splats on the floor, flying chunks,
// bullet tracers and explosions.
import * as THREE from 'three';
import { textures } from './textures.js';

// ---- Tuning ----
const GORE_MAX = 1500;     // blood/ichor droplets at once
const GLOW_MAX = 1200;     // glowing sparks at once
const DECALS = 180;        // splats on the floor before old ones get reused
const CHUNKS = 60;         // flying gibs
const TRACERS = 40;

export const COLORS = {
  blood: [0.42, 0.03, 0.03],
  rot: [0.45, 0.6, 0.08],
  dark: [0.12, 0.06, 0.04],
  spark: [1, 0.75, 0.35],
  bile: [0.75, 1, 0.2],
  cyan: [0.3, 0.9, 1],
};

// A big pool of points that fly, fall and die. Additive ones glow and fade.
class Particles {
  constructor(scene, n, additive, size) {
    this.n = n; this.next = 0; this.additive = additive;
    this.pos = new Float32Array(n * 3).fill(-9999);
    this.col = new Float32Array(n * 3);
    this.base = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.splat = new Uint8Array(n);
    const geo = new THREE.BufferGeometry();
    this.pAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.cAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pAttr);
    geo.setAttribute('color', this.cAttr);
    const mat = new THREE.PointsMaterial({
      size, map: additive ? textures.glow : textures.dot, vertexColors: true, transparent: true,
      depthWrite: false, alphaTest: additive ? 0 : 0.4,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, c, life, grav, splat) {
    const i = this.next; this.next = (i + 1) % this.n;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.base[k] = c[0]; this.base[k + 1] = c[1]; this.base[k + 2] = c[2];
    this.col[k] = c[0]; this.col[k + 1] = c[1]; this.col[k + 2] = c[2];
    this.life[i] = this.max[i] = life; this.grav[i] = grav; this.splat[i] = splat ? 1 : 0;
  }

  update(dt, fx) {
    const L = fx.level;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[k + 1] = -9999; continue; }
      this.vel[k + 1] -= this.grav[i] * dt;
      const oy = this.pos[k + 1];
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const gy = L.heightAt(this.pos[k], this.pos[k + 2]);
      if (this.pos[k + 1] < gy) {
        // landed on top of something (not hit the side of a wall): maybe leave a splat
        if (this.splat[i] && oy >= gy - 0.05 && Math.random() < 0.3) fx.decal(this.pos[k], gy, this.pos[k + 2], 0.15 + Math.random() * 0.35, this.base.subarray(k, k + 3));
        this.life[i] = 0; this.pos[k + 1] = -9999; continue;
      }
      if (this.additive) {
        const f = this.life[i] / this.max[i];
        this.col[k] = this.base[k] * f; this.col[k + 1] = this.base[k + 1] * f; this.col[k + 2] = this.base[k + 2] * f;
      }
    }
    this.pAttr.needsUpdate = true;
    this.cAttr.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, level) {
    this.scene = scene; this.level = level;
    this.gore = new Particles(scene, GORE_MAX, false, 0.16);
    this.glow = new Particles(scene, GLOW_MAX, true, 0.22);

    // floor splats
    this.decals = []; this.decalNext = 0;
    const dGeo = new THREE.CircleGeometry(0.5, 10); dGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < DECALS; i++) {
      const m = new THREE.Mesh(dGeo, new THREE.MeshStandardMaterial({ color: 0x400000, roughness: 0.3, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.visible = false; m.renderOrder = 1;
      scene.add(m); this.decals.push(m);
    }

    // gibs
    this.chunks = [];
    const cGeo = new THREE.BoxGeometry(0.22, 0.16, 0.18);
    const cMat = new THREE.MeshStandardMaterial({ map: textures.flesh, color: 0x8a3a30, roughness: 0.5 });
    for (let i = 0; i < CHUNKS; i++) {
      const m = new THREE.Mesh(cGeo, cMat);
      m.visible = false; scene.add(m);
      this.chunks.push({ mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }
    this.chunkNext = 0;

    // tracers: thin glowing boxes stretched from gun to target
    this.tracers = [];
    const tGeo = new THREE.BoxGeometry(1, 1, 1); tGeo.translate(0, 0, 0.5);
    for (let i = 0; i < TRACERS; i++) {
      const m = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; scene.add(m);
      this.tracers.push({ mesh: m, life: 0, max: 0.08 });
    }
    this.tracerNext = 0;

    // explosions: growing glowing spheres, and one light that flashes
    this.blasts = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({ color: 0xc8ff40, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; scene.add(m);
      this.blasts.push({ mesh: m, life: 0, r: 1 });
    }
    this.blastLight = new THREE.PointLight(0xb0ff40, 0, 30, 2);
    scene.add(this.blastLight);
  }

  // ---- things other code calls ----
  burst(p, n, color, speed, opt = {}) {
    const pool = opt.glow ? this.glow : this.gore;
    const d = opt.dir;
    for (let i = 0; i < n; i++) {
      let vx = (Math.random() - 0.5) * 2, vy = Math.random() * 1.4 - 0.3, vz = (Math.random() - 0.5) * 2;
      if (d) { vx = vx * 0.6 + d.x * 1.4; vy = vy * 0.6 + d.y * 1.4 + 0.3; vz = vz * 0.6 + d.z * 1.4; }
      const s = speed * (0.4 + Math.random() * 0.8);
      const c = Array.isArray(color[0]) ? color[(Math.random() * color.length) | 0] : color;
      pool.emit(p.x, p.y, p.z, vx * s, vy * s, vz * s, c, opt.life ?? (0.5 + Math.random() * 0.6), opt.grav ?? 16, !opt.glow);
    }
  }

  decal(x, y, z, size, c) {
    const m = this.decals[this.decalNext]; this.decalNext = (this.decalNext + 1) % DECALS;
    m.visible = true;
    m.position.set(x, y + 0.02 + (this.decalNext % 7) * 0.002, z);
    m.scale.setScalar(size * 2);
    m.rotation.y = Math.random() * 6;
    m.material.color.setRGB(c[0] * 0.7, c[1] * 0.7, c[2] * 0.7);
  }

  gibs(p, n) {
    for (let i = 0; i < n; i++) {
      const c = this.chunks[this.chunkNext]; this.chunkNext = (this.chunkNext + 1) % CHUNKS;
      c.mesh.visible = true; c.mesh.position.copy(p);
      c.mesh.scale.setScalar(0.6 + Math.random() * 1.2);
      c.vel.set((Math.random() - 0.5) * 14, 4 + Math.random() * 9, (Math.random() - 0.5) * 14);
      c.spin.set(Math.random() * 15, Math.random() * 15, Math.random() * 15);
      c.life = 4 + Math.random() * 2;
    }
  }

  tracer(from, to, color, width) {
    const t = this.tracers[this.tracerNext]; this.tracerNext = (this.tracerNext + 1) % TRACERS;
    const len = from.distanceTo(to);
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    t.mesh.scale.set(width, width, len);
    t.mesh.material.color.setHex(color);
    t.mesh.material.opacity = 1;
    t.mesh.visible = true;
    t.life = t.max = 0.07;
  }

  explosion(p, r, color = 0xc8ff40) {
    const b = this.blasts.find(b => b.life <= 0) || this.blasts[0];
    b.mesh.position.copy(p); b.mesh.visible = true; b.mesh.material.color.setHex(color);
    b.life = 0.4; b.r = r;
    this.blastLight.position.copy(p); this.blastLight.position.y += 1.5;
    this.blastLight.color.setHex(color);
    this.blastLight.intensity = 400;
    this.burst(p, 60, [COLORS.bile, COLORS.spark], 14, { glow: true, grav: 4, life: 0.7 });
    this.burst(p, 40, [COLORS.rot, COLORS.blood, COLORS.dark], 10);
  }

  update(dt) {
    this.gore.update(dt, this);
    this.glow.update(dt, this);
    const L = this.level;
    for (const c of this.chunks) {
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) { c.mesh.visible = false; continue; }
      c.vel.y -= 22 * dt;
      const m = c.mesh;
      m.position.addScaledVector(c.vel, dt);
      m.rotation.x += c.spin.x * dt; m.rotation.y += c.spin.y * dt;
      const gy = L.heightAt(m.position.x, m.position.z);
      if (m.position.y < gy + 0.08) {
        if (gy > 2 && m.position.y < gy - 0.5) { c.vel.x *= -0.4; c.vel.z *= -0.4; m.position.addScaledVector(c.vel, dt * 2); continue; }
        m.position.y = gy + 0.08;
        if (c.vel.y < -3) this.decal(m.position.x, gy, m.position.z, 0.3 + Math.random() * 0.3, COLORS.blood);
        c.vel.y *= -0.3; c.vel.x *= 0.6; c.vel.z *= 0.6; c.spin.multiplyScalar(0.6);
      }
    }
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / t.max);
      if (t.life <= 0) t.mesh.visible = false;
    }
    for (const b of this.blasts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      const f = 1 - b.life / 0.4;
      b.mesh.scale.setScalar(0.5 + f * b.r);
      b.mesh.material.opacity = Math.max(0, 1 - f) * 0.8;
      if (b.life <= 0) b.mesh.visible = false;
    }
    this.blastLight.intensity = Math.max(0, this.blastLight.intensity - dt * 1200);
  }
}
