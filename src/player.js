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
    if ((input.pressed.has('ShiftLeft') || input.pressed.has('ShiftRight')) && this.dashCharges >= 1) {
      this.dashCharges -= 1;
      this.dashT = P.dashTime; this.safeT = P.dashTime + 0.12;
      const dx = wl > 0 ? wx : -sin, dz = wl > 0 ? wz : -cos;
      this.vel.set(dx * P.dashSpeed, 0, dz * P.dashSpeed);
      this.sliding = false;
      g.fovKick = 10;
      sfx.dash();
    }

    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.dashT > 0) {
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
      } else if (wl > 0) {
        // in the air: steer, but never lose the speed you jumped with
        this.vel.x += wx * P.airAccel * dt; this.vel.z += wz * P.airAccel * dt;
        const h = Math.hypot(this.vel.x, this.vel.z), cap = Math.max(this.airCap, P.speed);
        if (h > cap) { this.vel.x *= cap / h; this.vel.z *= cap / h; }
      }

      // JUMP (and WALL JUMP: jump while touching a wall in the air)
      if (this.jumpBuf > 0) {
        if (this.onGround || this.coyote > 0) {
          this.vel.y = P.jump;
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
      this.vel.y -= P.gravity * dt;
    }

    // move and collide
    const wasGround = this.onGround;
    const r = g.level.moveBody(this.pos, this.vel, P.radius, dt, P.step);
    this.onGround = r.onGround;
    if (r.impact < -14) { sfx.land(); g.shake = Math.max(g.shake, 0.15); }
    if (wasGround && !this.onGround) { this.coyote = 0.1; this.airCap = Math.hypot(this.vel.x, this.vel.z); }
    if (this.onGround) this.wallJumps = P.wallJumps;
    if (r.wall && !this.onGround) { this.wallT = 0.2; this.wallN = r.wall; }

    // the rot burns
    if (this.onGround && this.pos.y < 0.1 && g.level.isPool(this.pos.x, this.pos.z)) {
      this.hurt(P.poolDamage * dt, null, true);
      if (Math.random() < 0.3) g.fx.glow.emit(this.pos.x, 0.1, this.pos.z, 0, 2, 0, [0.6, 0.9, 0.1], 0.5, 0, false);
    }

    // eye height dips when sliding
    const eyeT = this.sliding ? P.slideEye : P.eye;
    this.eyeH += (eyeT - this.eyeH) * Math.min(1, dt * 14);
    this.roll += ((this.sliding ? 0.06 : -this.strafe * 0.02) - this.roll) * Math.min(1, dt * 8);

    this.updateWeapons(dt, input);
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
