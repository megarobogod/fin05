// fx.js - the juice: blood droplets, sparks, splats on floors and walls,
// bullet tracers and explosions. (Bodies, limbs and chunks are in gore.js.)
import * as THREE from 'three';
import { textures } from './textures.js';
import { CELL } from './level.js';

// ---- Tuning ----
const GORE_MAX = 1500;     // blood/ichor droplets at once
const GLOW_MAX = 1200;     // glowing sparks at once
const DECALS = 1200;       // splats on floors and walls before old ones get reused
const WALL_SPLAT = 0.35;   // chance a droplet that hits a wall leaves a splat
const TRACERS = 40;

export const COLORS = {
  blood: [0.42, 0.03, 0.03],
  rot: [0.45, 0.6, 0.08],
  dark: [0.12, 0.06, 0.04],
  spark: [1, 0.75, 0.35],
  bile: [0.75, 1, 0.2],
  cyan: [0.3, 0.9, 1],
};

const UP = new THREE.Vector3(0, 1, 0), FACE = new THREE.Vector3(0, 0, 1);
const tmpN = new THREE.Vector3(), tmpScale = new THREE.Vector3(), tmpMatrix = new THREE.Matrix4();
const spinQ = new THREE.Quaternion(), tmpColor = new THREE.Color();

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
      const ox = this.pos[k], oy = this.pos[k + 1], oz = this.pos[k + 2];
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const gy = L.heightAt(this.pos[k], this.pos[k + 2]);
      if (this.pos[k + 1] < gy) {
        const c = this.base.subarray(k, k + 3);
        if (this.splat[i]) {
          // landed on top of something: maybe leave a splat on the floor
          if (oy >= gy - 0.05) { if (Math.random() < 0.3) fx.decal(this.pos[k], gy, this.pos[k + 2], 0.15 + Math.random() * 0.35, c); }
          // flew into the side of a wall: splat on the wall
          else if (Math.random() < WALL_SPLAT) fx.wallHit(ox, oz, this.pos[k], this.pos[k + 1], this.pos[k + 2], 0.12 + Math.random() * 0.25, c);
        }
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

    // splats on floors and walls: hundreds of flat squares with the splat
    // texture, all drawn in one go (an InstancedMesh). Each one has its own
    // place, turn, size and colour. Hidden ones have size 0.
    const dMat = new THREE.MeshStandardMaterial({
      map: textures.splat, transparent: true, depthWrite: false, roughness: 0.25,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), dMat, DECALS);
    this.decals.frustumCulled = false;
    this.decals.renderOrder = 1;
    this.decalCount = 0;                         // how many splats ever made
    this.decalInfo = [];                         // where each one is, so pools can grow
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < DECALS; i++) {
      this.decals.setMatrixAt(i, zero);
      this.decals.setColorAt(i, new THREE.Color(0, 0, 0));
      this.decalInfo.push({ p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 0 });
    }
    scene.add(this.decals);

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

  // A splat at (x, y, z) facing out along normal n (straight up for floors).
  // Returns a ticket you can pass to growDecal to make it bigger later.
  decal(x, y, z, size, c, n = UP) {
    const ticket = this.decalCount++;
    const i = ticket % DECALS, d = this.decalInfo[i];
    // lift it a hair off the surface (newer ones a bit more) so they don't flicker
    const lift = 0.012 + (ticket % 8) * 0.002;
    d.p.set(x + n.x * lift, y + n.y * lift, z + n.z * lift);
    d.q.setFromUnitVectors(FACE, n).multiply(spinQ.setFromAxisAngle(FACE, Math.random() * 6.3));
    d.s = size * 2;
    tmpColor.setRGB(c[0] * 0.7, c[1] * 0.7, c[2] * 0.7);
    this.decals.setColorAt(i, tmpColor);
    this.decals.instanceColor.needsUpdate = true;
    this.placeDecal(i);
    return ticket;
  }

  growDecal(ticket, size) {
    if (this.decalCount - ticket > DECALS) return; // already reused for another splat
    const i = ticket % DECALS;
    this.decalInfo[i].s = size * 2;
    this.placeDecal(i);
  }

  placeDecal(i) {
    const d = this.decalInfo[i];
    this.decals.setMatrixAt(i, tmpMatrix.compose(d.p, d.q, tmpScale.setScalar(d.s)));
    this.decals.instanceMatrix.needsUpdate = true;
  }

  // Something flew from (ox, oz) into the wall at (x, y, z): splat on the
  // face of that wall. We work out which side it came in through.
  wallHit(ox, oz, x, y, z, size, c) {
    const L = this.level;
    if (L.heightAt(ox, z) <= y) {
      // moving only along z is fine, so the wall was crossed along x
      const cx = Math.floor(x / CELL), sx = x > ox ? 1 : -1;
      this.decal(sx > 0 ? cx * CELL : (cx + 1) * CELL, y, z, size, c, tmpN.set(-sx, 0, 0));
    } else {
      const cz = Math.floor(z / CELL), sz = z > oz ? 1 : -1;
      this.decal(x, y, sz > 0 ? cz * CELL : (cz + 1) * CELL, size, c, tmpN.set(0, 0, -sz));
    }
  }

  // Blood flying on from a wound: if a wall or floor is close behind, splat it.
  sprayBehind(p, dir, reach, size, c = COLORS.blood) {
    const hit = this.level.raycast(p, dir, reach);
    if (!hit) return;
    this.decal(p.x + dir.x * hit.t, p.y + dir.y * hit.t, p.z + dir.z * hit.t, size, c, tmpN.set(hit.nx, hit.ny, hit.nz));
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
