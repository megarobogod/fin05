// gore.js - the meat.
//   Corpses: a creature killed in one piece drops, slides, bleeds a pool and
//            lies there for a while. Shoot a corpse enough and it bursts.
//   Severing: arms come off when you blast one side of a creature, heads
//            come off on headshot kills. The stump sprays blood.
//   Gibbing: big kills tear the whole body apart into limbs and chunks.
//   Screen blood: kill something up close and it splatters your visor.
import * as THREE from 'three';
import { COLORS } from './fx.js';
import { goreGeos, pose } from './models.js';
import { sfx } from './audio.js';

// ---- Tuning ----
const MAX_CORPSES = 14;      // bodies lying around before the oldest sinks away
const CORPSE_TIME = 10;      // seconds a body lies there before it sinks
const CORPSE_HP = 45;        // shoot a body this much and it bursts
const MAX_PIECES = 110;      // flying limbs and chunks at once
const PIECE_TIME = 9;        // seconds a chunk lies there before it sinks
const SINK_TIME = 1.5;       // seconds to sink into the floor at the end
const FOUNTAIN_TIME = 2.5;   // how long a stump sprays before it just drips
const FOUNTAIN_RATE = 70;    // drops a second while spraying
const POOL_SIZE = 1.3;       // how wide the blood pool under a body grows
const SCREEN_RANGE = 5;      // kills closer than this splatter your visor
const GRAVITY = 22;

// the joints to tear off when a whole body bursts, in order
const GIB_BONES = ['head', 'sac', 'armL', 'armR', 'legL', 'legR', 'spine', 'hips'];

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), box = new THREE.Box3();
const rnd = (a, b) => a + Math.random() * (b - a);

export class Gore {
  constructor(game) {
    this.game = game;
    this.corpses = [];
    this.pieces = [];     // anything flying or lying about: limbs, heads, chunks
    this.fountains = [];  // stumps spraying blood
    const g = goreGeos();
    this.chunkGeos = g.chunks;
    this.stumpGeo = g.stump;
    this.meat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.35 });
    this.screen = new ScreenBlood(document.getElementById('screenblood'));
  }

  // ---------- things enemies.js and combat.js call ----------

  // A creature died in one piece. Headshots take the head off first.
  corpse(e, info) {
    const m = e.model, b = m.bones, g = m.group;
    if (info.head) this.decapitate(e, info.dir);
    for (const f of m.flesh) f.emissive.setRGB(0, 0, 0);
    // which way it falls: away from the hit
    const dir = info.dir ? v1.set(info.dir.x, 0, info.dir.z).normalize() : v1.set(-Math.sin(e.yaw), 0, -Math.cos(e.yaw));
    const facing = Math.sin(e.yaw) * dir.x + Math.cos(e.yaw) * dir.z;
    const push = { shotgun: 9, punch: 13, blast: 10, parry: 10 }[info.weapon] || 4;
    const c = {
      e, model: m, group: g,
      pos: e.pos.clone(),
      vel: new THREE.Vector3(e.vel.x * 0.5 + dir.x * push, Math.max(0, e.vel.y) + push * 0.35, e.vel.z * 0.5 + dir.z * push),
      side: facing > 0 ? 1 : -1,    // +1 falls on its face, -1 on its back
      fall: 0, t: CORPSE_TIME, hp: CORPSE_HP, pool: -1, poolT: 0, bleed: 1.5,
    };
    g.rotation.order = 'YXZ';       // turn to face, then tip over
    // go limp: arms flop out, legs loosen, jaw drops
    pose(b.armL, rnd(-0.6, 0.2), rnd(0.4, 1.1)); pose(b.armR, rnd(-0.6, 0.2), -rnd(0.4, 1.1));
    pose(b.elbowL, rnd(-0.6, 0)); pose(b.elbowR, rnd(-0.6, 0));
    pose(b.legL, rnd(-0.3, 0.2), 0.15); pose(b.legR, rnd(-0.3, 0.2), -0.15);
    pose(b.kneeL, rnd(0, 0.5)); pose(b.kneeR, rnd(0, 0.5));
    pose(b.spine, -0.3); pose(b.head, rnd(-0.4, 0.4), rnd(-0.5, 0.5)); pose(b.jaw, 0.7);
    if (b.sac) b.sac.scale.setScalar(1);
    this.corpses.push(c);
    if (this.corpses.length > MAX_CORPSES) {
      const old = this.corpses.find(o => o.t > SINK_TIME);
      if (old) old.t = SINK_TIME;
    }
  }

  // Tear the whole creature apart: every limb flies off, plus a heap of chunks.
  gib(e, info) {
    const m = e.model, centre = v2.set(e.pos.x, e.pos.y + (e.type === 'bloater' ? 1.3 : 1.1), e.pos.z).clone();
    const d = info.dir || { x: 0, y: 0, z: 0 };
    m.group.updateMatrixWorld(true);
    for (const name of GIB_BONES) {
      if (!m.bones[name]) continue;
      this.sever(m, name, (from) => {
        const out = from.clone().sub(centre).setY(0).normalize();
        return new THREE.Vector3(out.x * rnd(4, 9) + d.x * 8, rnd(5, 11), out.z * rnd(4, 9) + d.z * 8);
      }, false);
    }
    this.game.scene.remove(m.group);
    this.disposeModel(m);
    const big = e.type === 'bloater';
    this.chunks(centre, big ? 22 : 12, big ? 13 : 10, d);
    this.game.fx.burst(centre, big ? 60 : 30, [COLORS.blood, COLORS.dark], 13, { dir: d });
    this.screenSplat(centre, 7, 1.2);
  }

  // A side took too much damage: that arm comes off.
  loseArm(e, side, dir) {
    const name = 'arm' + side;
    if (!e.model.bones[name]) return false;
    e.model.group.updateMatrixWorld(true);
    const out = side === 'L' ? 1 : -1;
    // the arm's own outward direction (the creature's left or right)
    const sx = Math.cos(e.yaw) * out, sz = -Math.sin(e.yaw) * out;
    this.sever(e.model, name, () => new THREE.Vector3(sx * rnd(4, 7) + dir.x * 5, rnd(4, 7), sz * rnd(4, 7) + dir.z * 5), true);
    sfx.sever();
    return true;
  }

  decapitate(e, dir) {
    if (!e.model.bones.head) return;
    e.model.group.updateMatrixWorld(true);
    const d = dir || { x: 0, z: 0 };
    this.sever(e.model, 'head', () => new THREE.Vector3(d.x * 6 + rnd(-1.5, 1.5), rnd(8, 12), d.z * 6 + rnd(-1.5, 1.5)), true);
    sfx.sever();
  }

  // Splash `n` meat chunks out from point p.
  chunks(p, n, speed, dir = { x: 0, y: 0, z: 0 }) {
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.chunkGeos[(Math.random() * this.chunkGeos.length) | 0], this.meat);
      const s = rnd(0.7, 1.7);
      mesh.scale.setScalar(s);
      mesh.position.set(p.x + rnd(-0.3, 0.3), p.y + rnd(-0.3, 0.3), p.z + rnd(-0.3, 0.3));
      mesh.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
      this.game.scene.add(mesh);
      const vel = new THREE.Vector3(rnd(-1, 1) * speed + dir.x * 6, rnd(4, 12), rnd(-1, 1) * speed + dir.z * 6);
      this.addPiece(mesh, vel, 0.1 * s, Math.random() < 0.6 ? 1.2 : 0, false);
    }
  }

  // Bullets don't stop at the living: which corpse does a ray hit first?
  hitCorpse(o, d, maxT) {
    let best = null;
    for (const c of this.corpses) {
      if (c.fall < 0.5 || c.t < SINK_TIME) continue;
      this.corpseCentre(c, v1);
      const ox = o.x - v1.x, oy = o.y - v1.y, oz = o.z - v1.z;
      const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - 0.6 * 0.6;
      const disc = b * b - cc;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < maxT && (!best || t < best.t)) best = { corpse: c, t };
    }
    return best;
  }

  shootCorpse(c, dmg, dir) {
    c.hp -= dmg;
    c.vel.x += dir.x * 2; c.vel.z += dir.z * 2;
    c.bleed = Math.max(c.bleed, 0.4);
    if (c.hp > 0) return;
    // burst it
    this.corpses.splice(this.corpses.indexOf(c), 1);
    this.gib({ model: c.model, pos: c.pos, type: c.e.type, yaw: c.e.yaw }, { dir });
    sfx.gib();
  }

  // Blood on your visor if p is within `range`.
  screenSplat(p, range = SCREEN_RANGE, power = 1) {
    const pl = this.game.player.pos;
    const d = Math.hypot(p.x - pl.x, p.y - pl.y - 1.4, p.z - pl.z);
    if (d < range) this.screen.splat(power * (1 - d / range * 0.7));
  }

  // ---------- inner workings ----------

  // Pull a joint (and everything hanging off it) off a body and throw it.
  // velFrom(worldPos) says how fast it flies. With stump = true a lump of
  // raw meat is left on the body, spraying blood.
  sever(model, name, velFrom, stump) {
    const bone = model.bones[name];
    const parent = bone.parent;
    const at = bone.position.clone();          // where the joint was, on the parent
    // forget this joint and the ones below, so the animation leaves them alone
    bone.traverse(o => { if (o.name && model.bones[o.name] === o) delete model.bones[o.name]; });
    // wrap it in a group sitting at its middle, so it tumbles round its middle
    box.setFromObject(bone);
    if (box.isEmpty()) { parent.remove(bone); return; }
    const mid = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const wrap = new THREE.Group();
    wrap.position.copy(mid);
    this.game.scene.add(wrap);
    wrap.attach(bone);                           // keeps it exactly where it was in the world
    // its own materials, so it stops flashing when the body gets hit
    bone.traverse(o => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      if (o.material.emissive && o.userData.kind === 'flesh') o.material.emissive.setRGB(0, 0, 0);
    });
    const r = Math.max(0.08, Math.min(size.x, size.y, size.z) * 0.5);
    this.addPiece(wrap, velFrom(mid), r, 1.5, true);
    // a burst of blood from the joint
    const fx = this.game.fx;
    const j = parent.localToWorld(at.clone());
    fx.burst(j, 35, [COLORS.blood, COLORS.dark], 7);
    if (stump) {
      const s = new THREE.Mesh(this.stumpGeo, this.meat);
      s.position.copy(at);
      parent.add(s);
      this.fountains.push({ bone: parent, at, root: model.group, t: FOUNTAIN_TIME });
    }
  }

  addPiece(obj, vel, r, bleed, own) {
    this.pieces.push({ obj, vel, r, bleed, own, t: PIECE_TIME + Math.random(), spin: new THREE.Vector3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)) });
    // too many? the oldest starts sinking, and if things are piling up
    // faster than they can sink, the oldest just goes
    if (this.pieces.length > MAX_PIECES) {
      const old = this.pieces.find(p => p.t > SINK_TIME);
      if (old) old.t = SINK_TIME;
    }
    if (this.pieces.length > MAX_PIECES + 30) this.removePiece(this.pieces.shift());
  }

  removePiece(p) {
    this.game.scene.remove(p.obj);
    if (p.own) p.obj.traverse(m => { if (m.isMesh) m.material.dispose(); });
  }

  disposeModel(m) {
    m.flesh.forEach(f => f.dispose()); m.glow.dispose(); m.sac.dispose();
  }

  // the middle of a lying body (its feet stay put, the rest is laid out from them)
  corpseCentre(c, out) {
    const yaw = c.e.yaw, f = c.side * 0.75 * c.fall;
    return out.set(c.pos.x + Math.sin(yaw) * f, c.pos.y + 0.35 + (1 - c.fall) * 0.6, c.pos.z + Math.cos(yaw) * f);
  }

  update(dt) {
    const g = this.game, L = g.level, fx = g.fx;

    // ---- corpses ----
    for (const c of this.corpses) {
      c.t -= dt;
      if (c.t <= 0) { g.scene.remove(c.group); this.disposeModel(c.model); continue; }
      if (c.t < SINK_TIME) { c.group.position.y -= dt * 0.5; continue; }
      // slide along the floor (and off ledges)
      c.vel.y -= GRAVITY * dt;
      const res = L.moveBody(c.pos, c.vel, 0.35, dt, 0.3);
      if (res.onGround) { const k = 1 - Math.min(1, dt * 5); c.vel.x *= k; c.vel.z *= k; }
      if (c.pos.y < -5) c.pos.y = 0;
      // tip over
      c.fall = Math.min(1, c.fall + dt * 2.6);
      const ease = c.fall * c.fall;
      c.group.position.set(c.pos.x, c.pos.y + 0.22 * ease, c.pos.z);
      c.group.rotation.set(c.side * Math.PI / 2 * ease * 0.97, c.e.yaw, 0);
      if (c.fall >= 1 && c.poolT === 0) {
        c.poolT = 0.001;
        sfx.splat(g.enemies.volume(c.pos));
      }
      // bleed, and grow a pool underneath
      this.corpseCentre(c, v1);
      if (c.bleed > 0) {
        c.bleed -= dt;
        if (Math.random() < dt * 40) fx.gore.emit(v1.x, v1.y + 0.2, v1.z, rnd(-1, 1), rnd(1, 3), rnd(-1, 1), COLORS.blood, 0.8, 16, true);
      }
      if (c.poolT > 0 && c.poolT < 4 && res.onGround) {
        if (c.pool < 0) c.pool = fx.decal(v1.x, L.heightAt(v1.x, v1.z), v1.z, 0.2, [0.32, 0.02, 0.02]);
        c.poolT += dt;
        fx.growDecal(c.pool, POOL_SIZE * Math.min(1, c.poolT / 4) * (c.e.type === 'spitter' ? 1.2 : 1));
      }
    }
    this.corpses = this.corpses.filter(c => c.t > 0);

    // ---- flying and lying pieces ----
    for (const p of this.pieces) {
      p.t -= dt;
      const o = p.obj;
      if (p.t <= 0) { this.removePiece(p); continue; }
      if (p.t < SINK_TIME) { o.position.y -= dt * 0.3; continue; }
      if (p.rest) continue;
      p.vel.y -= GRAVITY * dt;
      const ox = o.position.x, oz = o.position.z;
      o.position.addScaledVector(p.vel, dt);
      o.rotation.x += p.spin.x * dt; o.rotation.y += p.spin.y * dt; o.rotation.z += p.spin.z * dt;
      const gy = L.heightAt(o.position.x, o.position.z);
      if (o.position.y - p.r < gy) {
        if (gy - (o.position.y + p.r) > -0.1 && L.heightAt(ox, oz) < gy) {
          // hit the side of a wall: bounce back off it and leave a splat
          if (p.bleed > 0) fx.wallHit(ox, oz, o.position.x, o.position.y, o.position.z, 0.3, COLORS.blood);
          if (L.heightAt(ox, o.position.z) <= o.position.y) p.vel.x *= -0.35; else p.vel.z *= -0.35;
          o.position.x = ox; o.position.z = oz;
        } else {
          // hit the floor: thud, splat, bounce a little, settle
          o.position.y = gy + p.r;
          if (p.vel.y < -5) {
            fx.decal(o.position.x, gy, o.position.z, rnd(0.2, 0.45), COLORS.blood);
            if (p.own || Math.random() < 0.3) sfx.splat(g.enemies.volume(o.position) * 0.7);
          }
          p.vel.y *= -0.25; p.vel.x *= 0.55; p.vel.z *= 0.55; p.spin.multiplyScalar(0.5);
          if (Math.abs(p.vel.y) < 1.2 && Math.hypot(p.vel.x, p.vel.z) < 0.6) p.rest = true;
        }
      }
      // a trail of blood while it flies
      if (p.bleed > 0) {
        p.bleed -= dt;
        if (Math.random() < dt * 30) fx.gore.emit(o.position.x, o.position.y, o.position.z, rnd(-0.5, 0.5), rnd(0, 1), rnd(-0.5, 0.5), COLORS.blood, 0.7, 16, true);
      }
    }
    this.pieces = this.pieces.filter(p => p.t > 0);

    // ---- stumps spraying blood ----
    for (const f of this.fountains) {
      if (!f.root.parent) { f.dead = true; continue; }   // its body is gone
      f.t -= dt;
      const rate = f.t > 0 ? FOUNTAIN_RATE * (0.4 + 0.6 * f.t / FOUNTAIN_TIME) : 3;
      let n = rate * dt; n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
      if (!n) continue;
      f.bone.localToWorld(v1.copy(f.at));
      f.bone.getWorldPosition(v2);
      v2.subVectors(v1, v2).normalize();             // out of the stump
      // pulses, like a heartbeat
      const pump = f.t > 0 ? 4 + 3 * Math.max(0, Math.sin(f.t * 9)) : 1;
      for (let i = 0; i < n; i++) {
        fx.gore.emit(v1.x, v1.y, v1.z,
          (v2.x + rnd(-0.3, 0.3)) * pump, (v2.y + 0.6 + rnd(-0.2, 0.3)) * pump, (v2.z + rnd(-0.3, 0.3)) * pump,
          COLORS.blood, 1, 16, true);
      }
    }
    this.fountains = this.fountains.filter(f => !f.dead);

    this.screen.update(dt);
  }
}

// ---------- Blood on your visor ----------
// A see-through canvas over the game. Splats land near the edges, then
// drip down and fade.
class ScreenBlood {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.drops = []; this.dirty = false;
    const fit = () => { canvas.width = innerWidth >> 1; canvas.height = innerHeight >> 1; };
    fit(); addEventListener('resize', fit);
  }

  splat(power) {
    const W = this.c.width, H = this.c.height;
    const n = Math.round(3 + power * 7);
    for (let i = 0; i < n; i++) {
      // mostly around the edges so you can still see what you're shooting
      const a = Math.random() * Math.PI * 2, d = rnd(0.35, 0.95);
      const x = W / 2 + Math.cos(a) * d * W / 2, y = H / 2 + Math.sin(a) * d * H / 2;
      const r = H * rnd(0.01, 0.04) * (0.5 + power);
      // a few lumps round the middle, and specks flung further out
      const blobs = [];
      for (let k = 0; k < 5; k++) blobs.push([rnd(-1, 1) * r, rnd(-1, 1) * r, r * rnd(0.3, 0.8)]);
      for (let k = 0; k < 6; k++) { const a = rnd(0, 7), d = r * rnd(1.4, 3); blobs.push([Math.cos(a) * d, Math.sin(a) * d, r * rnd(0.08, 0.22)]); }
      this.drops.push({ x, y, y0: y, r, blobs, vy: Math.random() < 0.6 ? rnd(8, 30) : 0, life: rnd(1.8, 3.2), max: 0 });
      this.drops[this.drops.length - 1].max = this.drops[this.drops.length - 1].life;
    }
    if (this.drops.length > 80) this.drops.splice(0, this.drops.length - 80);
  }

  update(dt) {
    if (!this.drops.length) {
      if (this.dirty) { this.g.clearRect(0, 0, this.c.width, this.c.height); this.dirty = false; }
      return;
    }
    const g = this.g;
    g.clearRect(0, 0, this.c.width, this.c.height);
    for (const d of this.drops) {
      d.life -= dt;
      d.y += d.vy * dt;
      d.vy *= 1 - dt * 0.3;
      const a = Math.min(1, d.life / (d.max * 0.5)) * 0.85;
      if (a <= 0) continue;
      // the run down the glass
      if (d.y > d.y0 + 1) {
        g.fillStyle = `rgba(90,4,4,${a * 0.8})`;
        g.fillRect(d.x - d.r * 0.18, d.y0, d.r * 0.36, d.y - d.y0);
      }
      g.fillStyle = `rgba(105,6,6,${a})`;
      g.beginPath(); g.arc(d.x, d.y, d.r, 0, 7); g.fill();
      for (const [bx, by, br] of d.blobs) { g.beginPath(); g.arc(d.x + bx, d.y0 + by, br, 0, 7); g.fill(); }
      // a wet shine
      g.fillStyle = `rgba(220,70,60,${a * 0.35})`;
      g.beginPath(); g.arc(d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.3, 0, 7); g.fill();
    }
    this.drops = this.drops.filter(d => d.life > 0);
    this.dirty = true;
  }
}
