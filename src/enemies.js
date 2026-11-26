// enemies.js - the rot creatures: how they look, think, move and die.
//   Husk     fast, rushes you and claws, sometimes leaps at you
//   Spitter  keeps its distance and spits slow glowing bile you can dodge or punch back
//   Bloater  big and slow, swells up and bursts next to you. Shoot it near a crowd!
import * as THREE from 'three';
import { COLORS } from './fx.js';
import { sfx } from './audio.js';
import { makeModel, pose } from './models.js';

// ---- Tuning ----
// parts: [height, radius, isHead, forward] spheres the bullets can hit
// (forward = how far in front of its feet, because the husk hunches over)
export const TYPES = {
  husk: { hp: 35, speed: 10.5, accel: 45, radius: 0.5, eye: 1.6, score: 100, dmg: 12, reach: 2.4, parts: [[0.5, 0.4], [1.15, 0.42, 0, 0.12], [1.5, 0.36, 0, 0.3], [1.78, 0.25, 1, 0.45]] },
  spitter: { hp: 60, speed: 6, accel: 25, radius: 0.55, eye: 2.3, score: 150, range: [10, 22], fireGap: [1.8, 3.2], orbSpeed: 21, orbDmg: 14, parts: [[0.7, 0.42], [1.65, 0.45], [2.05, 0.3, 0, 0.12], [2.48, 0.28, 1, 0.06]] },
  bloater: { hp: 180, speed: 3.8, accel: 12, radius: 1.15, eye: 2.4, score: 300, blastR: 6, blastDmg: 40, parts: [[1.38, 1.25], [2.35, 0.36, 1, 0.5]] },
};
const GRAVITY = 28;
const CLOUD_TIME = 5;       // how long the gas from a bloater lingers
const CLOUD_R = 3.5;
const CLOUD_DPS = 10;

// Turn smoothly from angle a towards angle b.
function turn(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

// Where along a ray (origin o, direction d) it hits a sphere, or null.
function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < 0) t = -b + s;
  return t < 0 ? null : t;
}

export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.orbs = [];
    this.clouds = [];
    this.orbGeo = new THREE.SphereGeometry(0.28, 10, 8);
    this.orbMat = new THREE.MeshBasicMaterial({ color: 0xd0ff30 });
    this.orbMatFriendly = new THREE.MeshBasicMaterial({ color: 0x50f0ff });
  }

  spawn(type, x, z) {
    const cfg = TYPES[type];
    const model = makeModel(type);
    this.game.scene.add(model.group);
    const e = {
      type, cfg, model, hp: cfg.hp,
      pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(),
      yaw: Math.random() * 6, t: Math.random() * 10,
      state: 'spawn', stateT: 0.8, stun: 0, flash: 0, onGround: true,
      los: false, losT: 0, fireT: 1 + Math.random() * 2, leapCd: 1 + Math.random() * 2,
      strafe: Math.random() < 0.5 ? 1 : -1, swell: 0, dead: false, hitPlayer: false,
    };
    model.group.position.set(x, -3, z);
    this.list.push(e);
    const p = new THREE.Vector3(x, 0.3, z);
    this.game.fx.burst(p, 30, [COLORS.rot, COLORS.dark, COLORS.blood], 7);
    this.game.fx.burst(p, 20, COLORS.bile, 6, { glow: true, grav: -2, life: 1 });
    sfx.portal(this.volume(p));
    return e;
  }

  // Quieter the further away from the player.
  volume(p) {
    const d = p.distanceTo(this.game.player.pos);
    return Math.max(0.15, 1 - d / 60);
  }

  // The closest creature along a ray, within maxT.
  hitscan(o, d, maxT) {
    let best = null;
    for (const e of this.list) {
      if (e.dead) continue;
      const s = 1 + e.swell * 0.35;
      for (const part of e.cfg.parts) {
        const fwd = (part[3] || 0) * s;
        const t = raySphere(o, d, e.pos.x + Math.sin(e.yaw) * fwd, e.pos.y + part[0] * s, e.pos.z + Math.cos(e.yaw) * fwd, part[1] * s);
        if (t !== null && t < maxT && (!best || t < best.t)) best = { enemy: e, t, head: !!part[2] };
      }
    }
    return best;
  }

  damage(e, amount, info = {}) {
    if (e.dead) return;
    e.hp -= amount;
    e.flash = 1;
    if (info.dir && info.knock) { e.vel.x += info.dir.x * info.knock; e.vel.z += info.dir.z * info.knock; }
    this.game.onDamage(e, amount, info);
    if (e.hp <= 0) this.kill(e, info);
  }

  kill(e, info = {}) {
    if (e.dead) return;
    e.dead = true;
    const fx = this.game.fx;
    this.game.scene.remove(e.model.group);
    const c = e.pos.clone(); c.y += e.type === 'bloater' ? 1.3 : 1.1;
    info.gib = info.weapon === 'blast' || e.hp < -25 || (info.weapon === 'shotgun' && info.dist < 4.5);
    const big = e.type === 'bloater' ? 2 : 1;
    fx.burst(c, (info.gib ? 90 : 45) * big, [COLORS.blood, COLORS.rot, COLORS.dark], info.gib ? 11 : 7, { dir: info.dir });
    fx.burst(c, 15 * big, COLORS.bile, 5, { glow: true, grav: 6 });
    fx.decal(e.pos.x, this.game.level.heightAt(e.pos.x, e.pos.z) > e.pos.y + 0.1 ? 0 : e.pos.y, e.pos.z, 0.8 + Math.random() * 0.6 * big, Math.random() < 0.5 ? COLORS.blood : COLORS.rot);
    if (info.gib) { fx.gibs(c, 6 * big); sfx.gib(); }
    this.game.onKill(e, info);
    if (e.type === 'bloater') this.explode(c, e.cfg.blastR, e.cfg.blastDmg, e);
  }

  // A bloater bursting: hurts everything near, chains into other bloaters,
  // and leaves a cloud of rot gas behind.
  explode(p, r, dmg, source) {
    const g = this.game, pl = g.player;
    g.fx.explosion(p, r);
    sfx.boom(this.volume(p));
    g.shake = Math.max(g.shake, Math.max(0.2, 1 - p.distanceTo(pl.pos) / 25));
    const d = Math.hypot(pl.pos.x - p.x, pl.pos.y + 1 - p.y, pl.pos.z - p.z);
    if (d < r) pl.hurt(dmg * (1 - (d / r) * 0.6), p);
    for (const e of this.list) {
      if (e.dead || e === source) continue;
      const de = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      if (de < r + e.cfg.radius) {
        const dir = new THREE.Vector3(e.pos.x - p.x, 0, e.pos.z - p.z).normalize();
        e.vel.y = 6; e.onGround = false; e.stun = 0.4;
        this.damage(e, 80 * (1 - de / (r * 1.5)), { weapon: 'blast', dir, knock: 12, dist: 99, fromPlayer: true, chain: true });
      }
    }
    this.clouds.push({ x: p.x, z: p.z, t: CLOUD_TIME });
  }

  fireOrb(e) {
    const p = this.game.player, cfg = e.cfg;
    const mouth = new THREE.Vector3(e.pos.x + Math.sin(e.yaw) * 0.5, e.pos.y + 2.15, e.pos.z + Math.cos(e.yaw) * 0.5);
    const target = new THREE.Vector3(p.pos.x, p.pos.y + 1, p.pos.z);
    const lead = mouth.distanceTo(target) / cfg.orbSpeed * 0.6;
    target.x += p.vel.x * lead; target.z += p.vel.z * lead;
    const base = target.sub(mouth).normalize();
    for (const spread of [-0.13, 0, 0.13]) {
      const dir = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
      const m = new THREE.Mesh(this.orbGeo, this.orbMat);
      m.position.copy(mouth);
      this.game.scene.add(m);
      this.orbs.push({ mesh: m, pos: m.position, vel: dir.multiplyScalar(cfg.orbSpeed), life: 5, friendly: false, dmg: cfg.orbDmg, dodged: false });
    }
    sfx.spit(this.volume(e.pos));
  }

  update(dt) {
    const g = this.game, p = g.player, L = g.level;
    L.updateFlow(p.pos.x, p.pos.z);

    for (const e of this.list) {
      if (e.dead) continue;
      const cfg = e.cfg;
      e.t += dt; e.stateT -= dt; e.stun -= dt;
      e.flash = Math.max(0, e.flash - dt * 6);
      const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      e.losT -= dt;
      if (e.losT <= 0) {
        e.losT = 0.2 + Math.random() * 0.1;
        e.los = L.lineClear(e.pos.x, e.pos.y + cfg.eye, e.pos.z, p.pos.x, p.pos.y + 1.4, p.pos.z);
      }
      // which way to go: straight at you if it can see you, else follow the path map
      let mx = dx / dist, mz = dz / dist;
      if (!e.los) { const f = L.flowDir(e.pos.x, e.pos.z); if (f) { mx = f.x; mz = f.z; } }
      let want = 0;

      if (e.state === 'spawn') {
        if (e.stateT <= 0) e.state = 'chase';
      } else if (p.dead) {
        want = 0;
      } else if (e.type === 'husk') {
        if (e.state === 'chase') {
          want = cfg.speed;
          e.leapCd -= dt;
          if (dist < 1.9) { e.state = 'windup'; e.stateT = 0.3; }
          else if (e.los && dist > 5 && dist < 12 && e.leapCd <= 0 && e.onGround && Math.random() < dt * 1.5) {
            e.vel.x = mx * 15; e.vel.z = mz * 15; e.vel.y = 7.5; e.onGround = false;
            e.state = 'leap'; e.stateT = 0.15; e.leapCd = 3; e.hitPlayer = false;
            sfx.screech(this.volume(e.pos));
          }
        } else if (e.state === 'windup') {
          want = 2;
          if (e.stateT <= 0) {
            if (dist < cfg.reach && Math.abs(p.pos.y - e.pos.y) < 2) p.hurt(cfg.dmg, e.pos);
            e.state = 'recover'; e.stateT = 0.45;
          }
        } else if (e.state === 'recover') {
          want = 3;
          if (e.stateT <= 0) e.state = 'chase';
        } else if (e.state === 'leap') {
          if (!e.hitPlayer && dist < 1.4 && Math.abs(p.pos.y - e.pos.y) < 1.8) { e.hitPlayer = true; p.hurt(10, e.pos); }
          if (e.onGround && e.stateT <= 0) e.state = 'chase';
        }
      } else if (e.type === 'spitter') {
        if (e.state === 'chase') {
          e.fireT -= dt;
          const [near, far] = cfg.range;
          if (!e.los || dist > far) want = cfg.speed;
          else if (dist < near) { want = cfg.speed; mx = -dx / dist; mz = -dz / dist; }
          else {
            want = cfg.speed * 0.7;
            mx = -dz / dist * e.strafe; mz = dx / dist * e.strafe;
            if (Math.random() < dt * 0.4) e.strafe *= -1;
          }
          if (e.los && dist < 35 && e.fireT <= 0) { e.state = 'charge'; e.stateT = 0.55; sfx.charge(this.volume(e.pos)); }
        } else if (e.state === 'charge') {
          want = 0;
          if (e.stateT <= 0) {
            this.fireOrb(e);
            e.state = 'chase';
            e.fireT = cfg.fireGap[0] + Math.random() * (cfg.fireGap[1] - cfg.fireGap[0]);
          }
        }
      } else if (e.type === 'bloater') {
        if (e.state === 'chase') {
          want = cfg.speed;
          if (dist < 2.8) { e.state = 'swell'; e.stateT = 0.9; sfx.charge(1); }
        } else if (e.state === 'swell') {
          e.swell = 1 - Math.max(0, e.stateT) / 0.9;
          if (e.stateT <= 0) this.kill(e, { weapon: 'self' });
        }
      }
      if (e.dead) continue;

      // steer (only with feet on the ground, and not while knocked about)
      if (e.onGround && e.stun <= 0) {
        const a = cfg.accel * dt;
        e.vel.x += Math.max(-a, Math.min(a, mx * want - e.vel.x));
        e.vel.z += Math.max(-a, Math.min(a, mz * want - e.vel.z));
      }
      e.vel.y -= GRAVITY * dt;
      const r = L.moveBody(e.pos, e.vel, cfg.radius, dt, 0.45);
      e.onGround = r.onGround;
      if (e.onGround && e.stun > 0) { e.vel.x *= 1 - Math.min(1, dt * 4); e.vel.z *= 1 - Math.min(1, dt * 4); }
      // fell in a hole or got stuck somewhere weird: put it back on the ground
      if (e.pos.y < -5) e.pos.y = 0;
      e.yaw = turn(e.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8));
    }

    // creatures push each other (and get pushed by you) so they don't stack up
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = a.cfg.radius + b.cfg.radius;
        if (d < min && d > 0.001) {
          const push = (min - d) * 8;
          a.vel.x -= dx / d * push * dt * 10; a.vel.z -= dz / d * push * dt * 10;
          b.vel.x += dx / d * push * dt * 10; b.vel.z += dz / d * push * dt * 10;
        }
      }
      const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z, d = Math.hypot(dx, dz), min = a.cfg.radius + 0.45;
      if (d < min && d > 0.001 && Math.abs(a.pos.y - p.pos.y) < 1.8) { a.vel.x += dx / d * (min - d) * 40 * dt * 10; a.vel.z += dz / d * (min - d) * 40 * dt * 10; }
    }

    this.animate(dt);
    this.updateOrbs(dt);
    this.updateClouds(dt);
    this.list = this.list.filter(e => !e.dead);
  }

  animate(dt) {
    for (const e of this.list) {
      if (e.dead) continue;
      const m = e.model;
      const rise = e.state === 'spawn' ? Math.max(0, e.stateT / 0.8) * 2.8 : 0;
      m.group.position.set(e.pos.x, e.pos.y - rise, e.pos.z);
      m.group.rotation.y = e.yaw;
      const b = m.bones;
      const sp = Math.hypot(e.vel.x, e.vel.z);
      // walk cycle: w goes round faster the faster it moves
      const w = e.t * (5 + sp * 0.9), swing = Math.min(1, sp / 6) * (e.type === 'bloater' ? 0.5 : 0.8);
      const airborne = !e.onGround;
      for (const [side, ph] of [['L', 0], ['R', Math.PI]]) {
        const s = Math.sin(w + ph);
        if (airborne) { pose(b['leg' + side], -0.6); pose(b['knee' + side], 0.9); }
        else {
          pose(b['leg' + side], s * swing);
          // the knee bends as the leg swings forward
          pose(b['knee' + side], Math.max(0, Math.sin(w + ph + 1.6)) * swing * 1.3);
        }
        pose(b['ankle' + side], -Math.max(0, s) * swing * 0.5);
      }
      if (b.hips) b.hips.position.y = b.hips.userData.rest.y + Math.abs(Math.sin(w)) * 0.05 * swing;

      // arms: [shoulder L, shoulder R, elbow], jaw open, head tilt, spine bend
      let armL = -0.9 + Math.sin(w) * 0.35 * swing, armR = -0.9 - Math.sin(w) * 0.35 * swing, elbow = -0.5;
      let jaw = 0.1 + Math.sin(e.t * 2.3) * 0.08, head = Math.sin(e.t * 1.7) * 0.06, spine = 0;
      if (e.type === 'husk') {
        if (e.state === 'windup') { armL = armR = -2.8; elbow = -0.9; jaw = 0.75; spine = -0.15; }
        else if (e.state === 'recover') { armL = armR = -0.3; elbow = -0.1; jaw = 0.4; spine = 0.2; }
        else if (e.state === 'leap') { armL = armR = -1.7; elbow = -0.2; jaw = 0.85; spine = -0.3; }
        else if (e.stun > 0) { armL = armR = 0.3; elbow = -0.2; jaw = 0.6; spine = -0.4; }
      } else if (e.type === 'spitter') {
        armL = -0.3 + Math.sin(w) * 0.3 * swing; armR = -0.3 - Math.sin(w) * 0.3 * swing; elbow = -0.8;
        const charge = e.state === 'charge' ? 1 - Math.max(0, e.stateT) / 0.55 : 0;
        head = -charge * 0.55;             // rears its head back...
        spine = -charge * 0.25;
        armL -= charge * 0.8; armR -= charge * 0.8;
        b.sac.scale.setScalar(1 + charge * 0.7 + Math.sin(e.t * 4) * 0.05);
        m.sac.emissiveIntensity = 0.4 + charge * 6;
      } else if (e.type === 'bloater') {
        const s = 1 + e.swell * 0.35 + Math.sin(e.t * 30) * 0.05 * e.swell;
        b.body.scale.setScalar(s);
        b.body.rotation.z = Math.sin(w * 0.5) * 0.05 * swing;
        armL = -0.5 + Math.sin(w) * 0.3; armR = -0.5 - Math.sin(w) * 0.3; elbow = -0.4;
        jaw = 0.15 + e.swell * 0.5;
        m.glow.emissiveIntensity = 1 + e.swell * 10 + Math.sin(e.t * 3) * 0.4;
      }
      pose(b.armL, armL, 0.15); pose(b.armR, armR, -0.15);
      pose(b.elbowL, elbow); pose(b.elbowR, elbow);
      pose(b.jaw, jaw); pose(b.head, head); pose(b.spine, spine);
      for (const f of m.flesh) f.emissive.setRGB(e.flash, e.flash * 0.9, e.flash * 0.8);
    }
  }

  updateOrbs(dt) {
    const g = this.game, p = g.player, L = g.level;
    for (const o of this.orbs) {
      o.life -= dt;
      o.vel.y -= 2.5 * dt;
      o.pos.addScaledVector(o.vel, dt);
      if (Math.random() < 0.6) g.fx.glow.emit(o.pos.x, o.pos.y, o.pos.z, 0, 0.3, 0, o.friendly ? COLORS.cyan : COLORS.bile, 0.3, 0, false);
      let pop = o.life <= 0 || o.pos.y < L.heightAt(o.pos.x, o.pos.z) || o.pos.y < 0;
      if (!pop && !o.friendly) {
        const d = Math.hypot(p.pos.x - o.pos.x, p.pos.y + 0.9 - o.pos.y, p.pos.z - o.pos.z);
        if (d < 0.85 && !p.dead) {
          if (p.safeT > 0) { if (!o.dodged) { o.dodged = true; g.addStyle(25, 'DODGE'); } }
          else { p.hurt(o.dmg, o.pos); pop = true; }
        }
      } else if (!pop && o.friendly) {
        for (const e of this.list) {
          if (e.dead) continue;
          const d = Math.hypot(e.pos.x - o.pos.x, e.pos.y + 1.2 - o.pos.y, e.pos.z - o.pos.z);
          if (d < e.cfg.radius + 0.8) {
            this.damage(e, o.dmg, { weapon: 'parry', fromPlayer: true, dir: o.vel.clone().normalize(), knock: 8, dist: 99 });
            pop = true; break;
          }
        }
      }
      if (pop) {
        o.dead = true;
        g.scene.remove(o.mesh);
        g.fx.burst(o.pos, 18, o.friendly ? COLORS.cyan : COLORS.bile, 5, { glow: true, grav: 6 });
        g.fx.burst(o.pos, 8, COLORS.rot, 4);
        if (o.friendly) {
          // a returned orb bursts and hurts anything near it
          g.fx.explosion(o.pos, 3, 0x50f0ff);
          sfx.boom(0.5);
          for (const e of this.list) {
            if (e.dead) continue;
            if (Math.hypot(e.pos.x - o.pos.x, e.pos.z - o.pos.z) < 3.5) this.damage(e, 35, { weapon: 'parry', fromPlayer: true, dist: 99 });
          }
        }
      }
    }
    this.orbs = this.orbs.filter(o => !o.dead);
  }

  updateClouds(dt) {
    const g = this.game, p = g.player;
    for (const c of this.clouds) {
      c.t -= dt;
      if (Math.random() < dt * 30) {
        const a = Math.random() * 6.3, r = Math.random() * CLOUD_R;
        g.fx.glow.emit(c.x + Math.cos(a) * r, 0.2 + Math.random() * 1.5, c.z + Math.sin(a) * r, 0, 0.4, 0, [0.35, 0.5, 0.08], 1.5, -0.2, false);
      }
      if (!p.dead && Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < CLOUD_R && p.pos.y < 3) p.hurt(CLOUD_DPS * dt, null, true);
    }
    this.clouds = this.clouds.filter(c => c.t > 0);
  }

  // Bloaters swelling and spitters' orbs: things the punch can interact with.
  parryable() { return this.orbs.filter(o => !o.friendly && !o.dead); }
}
