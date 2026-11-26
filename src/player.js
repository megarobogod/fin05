// player.js - you: fast momentum movement, dash, slide, wall jumps, health,
// and pulling the trigger.
import * as THREE from 'three';
import { sfx } from './audio.js';
import { shoot, punch } from './combat.js';

// ---- Tuning ----
export const PLAYER = {
  radius: 0.45, eye: 1.6, step: 0.45,
  speed: 15,            // running speed (metres per second)
  accel: 110,           // how fast you reach it on the ground
  airAccel: 35,         // steering in the air (keeps your momentum)
  jump: 9.8, gravity: 28,
  dashSpeed: 34, dashTime: 0.16, dashCharges: 3, dashRecharge: 1.0,
  slideSpeed: 20, slideEye: 0.8,
  wallJumps: 3, wallPush: 11,
  // parkour
  wallRunSpeed: 17,     // you run along walls at least this fast
  wallRunTime: 1.6,     // seconds before you slip off
  wallRunGravity: 0.2,  // share of normal gravity while wall running
  mantleReach: 2.2,     // how far above your feet a ledge can be to climb up it
  vaultHeight: 1.3,     // run into a block this low and you hop straight over it
  slamSpeed: 48,        // diving down (C / Ctrl in the air)
  slamRadius: 5, slamDmg: 25,
  slamJump: 1.6,        // jump just after a slam lands: this many times higher
  maxHP: 100,
  poolDamage: 14,       // per second, standing in rot
  sens: 0.0022,         // mouse sensitivity
  maxShells: 40, startShells: 16,
};

export const WEAPONS = [
  { key: 'rifle', name: 'PULSE RIFLE', dmg: 13, rate: 0.1, spread: 0.01, heat: 0.07, cool: 0.75, range: 200, headMult: 2 },
  { key: 'shotgun', name: 'SCATTERGUN', dmg: 9, pellets: 12, rate: 0.8, spread: 0.075, range: 80, falloff: 12, headMult: 1.5, shove: 7 },
];

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = game.level.start.clone();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.eyeH = PLAYER.eye;
    this.hp = PLAYER.maxHP; this.dead = false;
    this.onGround = true; this.sliding = false;
    this.dashCharges = PLAYER.dashCharges; this.dashT = 0; this.safeT = 0;
    this.coyote = 0; this.jumpBuf = 0; this.airCap = PLAYER.speed;
    this.wallT = 0; this.wallN = { x: 0, z: 0 }; this.wallJumps = PLAYER.wallJumps;
    this.weapon = 0; this.switchT = 0; this.fireCd = 0; this.punchCd = 0;
    this.heat = 0; this.overheated = false;
    this.shells = PLAYER.startShells;
    this.lookDX = 0; this.hurtSfxT = 0; this.strafe = 0;
    // parkour state
    this.wallRun = null; this.wallRunCd = 0; this.stepT = 0;  // { n: wall normal, t: time on it }
    this.mantle = null;                                       // { top, dx, dz, t, speed }
    this.slam = null; this.slamJumpT = 0;                     // { y: height it started at }
  }

  // Is there a wall tall enough to run along right next to us, on side (sx, sz)?
  wallAt(sx, sz) {
    const d = PLAYER.radius + 0.2;
    return this.game.level.heightAt(this.pos.x + sx * d, this.pos.z + sz * d) > this.pos.y + 1.6;
  }

  // A wall beside us that we're running along (not straight into). Returns
  // its normal (the way out of the wall) or null. The map is a grid, so a
  // wall always faces one of four ways.
  findRunWall() {
    const hs = Math.hypot(this.vel.x, this.vel.z) || 1;
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const into = (this.vel.x * sx + this.vel.z * sz) / hs;
      if (into > -0.2 && into < 0.75 && this.wallAt(sx, sz)) return { x: -sx, z: -sz };
    }
    return null;
  }

  // The top of a ledge just in front of us (direction dx, dz), if it's
  // climbable: higher than a step, but within reach.
  ledgeAhead(dx, dz) {
    const d = PLAYER.radius + 0.4;
    const top = this.game.level.heightAt(this.pos.x + dx * d, this.pos.z + dz * d);
    const rise = top - this.pos.y;
    return rise > PLAYER.step && rise <= PLAYER.mantleReach ? top : null;
  }

  heightAboveGround() {
    return this.pos.y - this.game.level.groundUnder(this.pos.x, this.pos.z, PLAYER.radius * 0.8, this.pos.y + PLAYER.step);
  }

  eyePos(out) { return out.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z); }
  forward(out) {
    const c = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * c, Math.sin(this.pitch), -Math.cos(this.yaw) * c);
  }

  look(input) {
    this.lookDX = input.mx;
    this.yaw -= input.mx * PLAYER.sens;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - input.my * PLAYER.sens));
    input.mx = input.my = 0;
  }

  hurt(amount, from, quiet) {
    if (this.dead || this.game.state !== 'play') return;
    if (this.safeT > 0 && !quiet) return; // dashing makes you untouchable
    this.hp -= amount;
    this.game.hud.hurt(Math.min(1, amount / 20));
    this.game.style = Math.max(0, this.game.style - amount * 3);
    if (!quiet) {
      this.game.shake = Math.max(this.game.shake, 0.35);
      if (this.hurtSfxT <= 0) { sfx.hurt(); this.hurtSfxT = 0.15; }
    }
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.game.onPlayerDeath(); }
  }

  heal(v) {
    if (this.dead || v <= 0) return;
    this.hp = Math.min(PLAYER.maxHP, this.hp + v);
    this.game.hud.heal();
  }

  update(dt, input) {
    const P = PLAYER, k = input.keys, g = this.game;
    this.look(input);
    if (this.dead) return;
    this.safeT -= dt; this.coyote -= dt; this.jumpBuf -= dt; this.wallT -= dt;
    this.fireCd -= dt; this.punchCd -= dt; this.hurtSfxT -= dt;
    this.wallRunCd -= dt; this.slamJumpT -= dt;
    this.dashCharges = Math.min(P.dashCharges, this.dashCharges + dt / P.dashRecharge);

    // which way the keys want to go, turned to match where you're looking
    const fx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const fz = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    this.strafe = fx;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = -sin * fz + cos * fx, wz = -cos * fz - sin * fx;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    if (input.pressed.has('Space')) this.jumpBuf = 0.15;
    const slideKey = k.has('KeyC') || k.has('ControlLeft') || k.has('ControlRight');

    // DASH: a burst of speed in the direction you're moving. Bullets pass through you.
    if ((input.pressed.has('ShiftLeft') || input.pressed.has('ShiftRight')) && this.dashCharges >= 1 && !this.mantle) {
      this.dashCharges -= 1;
      this.dashT = P.dashTime; this.safeT = P.dashTime + 0.12;
      const dx = wl > 0 ? wx : -sin, dz = wl > 0 ? wz : -cos;
      this.vel.set(dx * P.dashSpeed, 0, dz * P.dashSpeed);
      this.sliding = false; this.wallRun = null; this.slam = null;
      g.fovKick = 10;
      sfx.dash();
    }

    // GROUND SLAM: the slide key in the air dives you straight down
    const slidePressed = input.pressed.has('KeyC') || input.pressed.has('ControlLeft') || input.pressed.has('ControlRight');
    if (slidePressed && !this.onGround && !this.slam && !this.mantle && this.dashT <= 0 && this.heightAboveGround() > 1.2) {
      this.slam = { y: this.pos.y };
      this.wallRun = null;
      this.vel.set(this.vel.x * 0.1, -P.slamSpeed, this.vel.z * 0.1);
      g.fovKick = 6;
      sfx.dive();
    }

    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.mantle) {
      this.updateMantle(dt);
    } else if (this.slam) {
      // falling like a stone: nothing to steer
    } else if (this.dashT > 0) {
      this.dashT -= dt;
      if (this.dashT <= 0) {
        // come out of the dash still moving fast
        const keep = P.speed * 1.25;
        if (hs > keep) { this.vel.x *= keep / hs; this.vel.z *= keep / hs; }
        this.airCap = keep;
      }
    } else {
      // SLIDE: hold to skid along the ground fast and low
      if (slideKey && this.onGround && !this.sliding) {
        let dx = wl > 0 ? wx : -sin, dz = wl > 0 ? wz : -cos;
        if (hs > 2) { dx = this.vel.x / hs; dz = this.vel.z / hs; }
        const s = Math.max(hs, P.slideSpeed);
        this.vel.x = dx * s; this.vel.z = dz * s;
        this.sliding = true;
        sfx.slide();
      }
      if (!slideKey) this.sliding = false;

      if (this.sliding && this.onGround) {
        // keep sliding at full speed, steer a little
        const s = Math.max(P.slideSpeed, hs - dt * 4);
        let dx = this.vel.x / (hs || 1), dz = this.vel.z / (hs || 1);
        if (wl > 0) { dx += wx * dt * 2; dz += wz * dt * 2; const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
        this.vel.x = dx * s; this.vel.z = dz * s;
        if (Math.random() < 0.5) g.fx.glow.emit(this.pos.x, this.pos.y + 0.05, this.pos.z, (Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3, [1, 0.6, 0.2], 0.25, 10, false);
      } else if (this.onGround) {
        // running: get to full speed fast, stop fast
        const a = P.accel * dt;
        this.vel.x += Math.max(-a, Math.min(a, wx * P.speed - this.vel.x));
        this.vel.z += Math.max(-a, Math.min(a, wz * P.speed - this.vel.z));
      } else {
        // WALL RUN: in the air, holding forward, moving fast alongside a tall wall
        if (!this.wallRun && this.wallRunCd <= 0 && fz > 0 && hs > 7 && this.heightAboveGround() > 0.4) {
          const n = this.findRunWall();
          if (n) {
            this.wallRun = { n, t: 0 };
            this.vel.y = Math.max(this.vel.y * 0.5, 3);   // a little lift as you catch the wall
            this.wallJumps = P.wallJumps;
            this.stepT = 0;
          }
        }
        if (this.wallRun) this.updateWallRun(dt, fz);
        else if (wl > 0) {
          // in the air: steer, but never lose the speed you jumped with
          this.vel.x += wx * P.airAccel * dt; this.vel.z += wz * P.airAccel * dt;
          const h = Math.hypot(this.vel.x, this.vel.z), cap = Math.max(this.airCap, P.speed);
          if (h > cap) { this.vel.x *= cap / h; this.vel.z *= cap / h; }
        }
      }

      // MANTLE: pushing forward into a ledge you can reach climbs you up onto it.
      // On the ground, running into a low block hops you straight up onto it.
      if (fz > 0 && !this.wallRun) {
        const dx = -sin, dz = -cos;
        const top = this.ledgeAhead(dx, dz);
        if (top !== null && ((!this.onGround && this.vel.y < 4) || (this.onGround && top - this.pos.y <= P.vaultHeight && hs > 3))) {
          this.startMantle(top, dx, dz, hs);
        }
      }

      // JUMP (and WALL JUMP: jump while touching a wall in the air)
      if (this.jumpBuf > 0 && !this.mantle) {
        if (this.wallRun) {
          // jump off a wall run: away from the wall, keeping all your speed
          const n = this.wallRun.n;
          this.vel.x = this.vel.x * 1.05 + n.x * P.wallPush;
          this.vel.z = this.vel.z * 1.05 + n.z * P.wallPush;
          this.vel.y = P.jump;
          this.airCap = Math.hypot(this.vel.x, this.vel.z);
          this.wallRun = null; this.wallRunCd = 0.35; this.jumpBuf = 0; this.wallT = 0;
          sfx.jump();
        } else if (this.onGround || this.coyote > 0) {
          // SLAM JUMP: jump right as a slam lands to fly extra high
          const slamJump = this.slamJumpT > 0;
          this.vel.y = P.jump * (slamJump ? P.slamJump : 1);
          if (slamJump) { this.slamJumpT = 0; g.fovKick = 8; }
          if (this.sliding) { this.vel.x *= 1.1; this.vel.z *= 1.1; this.sliding = false; }
          this.airCap = Math.hypot(this.vel.x, this.vel.z);
          this.jumpBuf = 0; this.coyote = 0; this.onGround = false;
          sfx.jump();
        } else if (this.wallT > 0 && this.wallJumps > 0) {
          this.vel.y = P.jump * 0.95;
          this.vel.x += this.wallN.x * P.wallPush; this.vel.z += this.wallN.z * P.wallPush;
          this.airCap = Math.max(P.speed, Math.hypot(this.vel.x, this.vel.z));
          this.wallJumps--; this.jumpBuf = 0; this.wallT = 0;
          sfx.jump();
        }
      }
      if (!this.wallRun && !this.mantle) this.vel.y -= P.gravity * dt;
    }

    // move and collide
    const wasGround = this.onGround;
    const r = g.level.moveBody(this.pos, this.vel, P.radius, dt, P.step);
    this.onGround = r.onGround;
    if (r.impact < -14) { sfx.land(); g.shake = Math.max(g.shake, 0.15); }
    if (wasGround && !this.onGround) { this.coyote = 0.1; this.airCap = Math.hypot(this.vel.x, this.vel.z); }
    if (this.onGround) this.wallJumps = P.wallJumps;
    if (r.wall && !this.onGround) { this.wallT = 0.2; this.wallN = r.wall; }
    if (this.onGround) this.wallRun = null;
    if (this.slam && this.onGround) this.landSlam();

    // the rot burns
    if (this.onGround && this.pos.y < 0.1 && g.level.isPool(this.pos.x, this.pos.z)) {
      this.hurt(P.poolDamage * dt, null, true);
      if (Math.random() < 0.3) g.fx.glow.emit(this.pos.x, 0.1, this.pos.z, 0, 2, 0, [0.6, 0.9, 0.1], 0.5, 0, false);
    }

    // eye height dips when sliding
    // (and when climbing a ledge)
    const eyeT = this.sliding ? P.slideEye : this.mantle ? 1.15 : P.eye;
    this.eyeH += (eyeT - this.eyeH) * Math.min(1, dt * 14);
    // the camera tilts: a little when strafing, more when sliding, and away
    // from the wall when wall running
    let rollT = this.sliding ? 0.06 : -this.strafe * 0.02;
    if (this.wallRun) {
      const n = this.wallRun.n;
      const wallOnRight = -Math.cos(this.yaw) * n.x + Math.sin(this.yaw) * n.z; // +1 right, -1 left
      rollT = wallOnRight * 0.16;
    }
    this.roll += (rollT - this.roll) * Math.min(1, dt * 8);

    this.updateWeapons(dt, input);
  }

  // ---------- parkour moves ----------

  updateWallRun(dt, fz) {
    const P = PLAYER, w = this.wallRun, n = w.n, g = this.game;
    w.t += dt;
    // let go of forward, run out of time, or run off the end of the wall: drop off
    if (fz <= 0 || w.t > P.wallRunTime || !this.wallAt(-n.x, -n.z)) {
      this.wallRun = null; this.wallRunCd = 0.4;
      return;
    }
    // run along the wall: drop the part of your speed going into it or away
    const ax = -n.z, az = n.x;                        // a direction along the wall
    let along = this.vel.x * ax + this.vel.z * az;
    if (Math.abs(along) < 0.5) along = (-Math.sin(this.yaw) * ax - Math.cos(this.yaw) * az) >= 0 ? 1 : -1;
    const s = Math.sign(along) * Math.max(Math.abs(along), P.wallRunSpeed);
    this.vel.x = ax * s - n.x * 0.5;                  // press gently into the wall to stay on it
    this.vel.z = az * s - n.z * 0.5;
    // gravity barely pulls, so you slip down slowly
    this.vel.y = Math.max(this.vel.y - P.gravity * P.wallRunGravity * dt, -1.8);
    this.airCap = Math.abs(s);
    // footsteps, and sparks kicked off the wall
    this.stepT -= dt;
    if (this.stepT <= 0) { this.stepT = 0.15; sfx.wallStep(); }
    if (Math.random() < 0.6) {
      g.fx.glow.emit(this.pos.x - n.x * P.radius, this.pos.y + 0.3, this.pos.z - n.z * P.radius,
        n.x * 3 + (Math.random() - 0.5) * 2, 1.5, n.z * 3 + (Math.random() - 0.5) * 2, [1, 0.6, 0.2], 0.25, 10, false);
    }
  }

  startMantle(top, dx, dz, hs) {
    this.mantle = { top, dx, dz, t: 0, speed: Math.max(hs, PLAYER.speed * 0.7) };
    this.sliding = false; this.wallRun = null;
    sfx.mantle();
  }

  updateMantle(dt) {
    const m = this.mantle;
    m.t += dt;
    // haul yourself up the face, pressing in, so you slide over the top
    // as soon as you're high enough
    this.vel.set(m.dx * 2, 13, m.dz * 2);
    if (this.pos.y >= m.top + 0.05 || m.t > 0.35) {
      // over the top: carry on running
      this.vel.set(m.dx * m.speed, 1.5, m.dz * m.speed);
      this.airCap = m.speed;
      this.mantle = null;
    }
  }

  // The slam hits the ground: a shockwave that throws creatures up and hurts
  // them. Harder the further you fell. Jump straight away for a SLAM JUMP.
  landSlam() {
    const P = PLAYER, g = this.game;
    const drop = this.slam.y - this.pos.y;
    this.slam = null;
    const power = Math.min(1, 0.35 + drop / 8);
    this.slamJumpT = 0.3;
    g.shake = Math.max(g.shake, 0.25 + power * 0.4);
    sfx.slam();
    // a ring of sparks racing outwards, and dirt
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * Math.PI * 2;
      g.fx.glow.emit(this.pos.x, this.pos.y + 0.15, this.pos.z, Math.cos(a) * 15 * power, 1, Math.sin(a) * 15 * power, [1, 0.6, 0.25], 0.35, 0, false);
    }
    g.fx.burst(new THREE.Vector3(this.pos.x, this.pos.y + 0.1, this.pos.z), 20, [[0.2, 0.16, 0.1], [0.3, 0.25, 0.15]], 6);
    let hits = 0;
    for (const e of g.enemies.list) {
      if (e.dead) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > P.slamRadius + e.cfg.radius || Math.abs(e.pos.y - this.pos.y) > 2.5) continue;
      const dir = new THREE.Vector3(dx / (d || 1), 0, dz / (d || 1));
      e.vel.y = e.type === 'bloater' ? 3 : 8; e.onGround = false; e.stun = 0.7;
      g.enemies.damage(e, P.slamDmg * power * (1 - d / (P.slamRadius * 2)), { fromPlayer: true, weapon: 'slam', dir, knock: 10, dist: d });
      hits++;
    }
    if (hits) { g.addStyle(15 * hits, 'GROUND SLAM'); g.hitstop = Math.max(g.hitstop, 0.05); }
  }

  updateWeapons(dt, input) {
    const g = this.game;
    // switch with 1 / 2 or the mouse wheel
    let want = this.weapon;
    if (input.pressed.has('Digit1')) want = 0;
    if (input.pressed.has('Digit2')) want = 1;
    if (input.wheel) { want = (this.weapon + (input.wheel > 0 ? 1 : -1) + WEAPONS.length) % WEAPONS.length; input.wheel = 0; }
    if (want !== this.weapon) { this.weapon = want; this.switchT = 0.25; g.vm.switchTo(want); }
    this.switchT -= dt;

    // the rifle never runs out, but it overheats
    const rifle = WEAPONS[0];
    this.heat = Math.max(0, this.heat - rifle.cool * dt);
    if (this.overheated && this.heat <= 0.25) this.overheated = false;

    const w = WEAPONS[this.weapon];
    if (input.fire && this.switchT <= 0 && this.fireCd <= 0) {
      if (w.key === 'rifle') {
        if (!this.overheated) {
          this.fireCd = w.rate;
          this.heat += w.heat;
          if (this.heat >= 1) { this.heat = 1; this.overheated = true; sfx.overheat(); g.hud.feed('OVERHEATED', 'bad'); }
          shoot(g);
        }
      } else if (this.shells > 0) {
        this.shells--;
        this.fireCd = w.rate;
        shoot(g);
        // the kick shoves you backwards (try it in the air)
        const f = this.forward(new THREE.Vector3());
        this.vel.x -= f.x * w.shove; this.vel.z -= f.z * w.shove;
        if (!this.onGround) { this.vel.y -= f.y * w.shove; this.airCap = Math.max(this.airCap, Math.hypot(this.vel.x, this.vel.z)); }
      } else if (input.firePressed) {
        sfx.empty(); g.hud.feed('NO SHELLS', 'bad');
        this.fireCd = 0.3;
      }
    }
    if (input.punch && this.punchCd <= 0) {
      this.punchCd = 0.4;
      g.vm.punch();
      punch(g);
    }
  }
}
