// combat.js - what happens when you pull the trigger or throw a punch.
import * as THREE from 'three';
import { WEAPONS } from './player.js';
import { COLORS } from './fx.js';
import { sfx } from './audio.js';

// ---- Tuning ----
const PUNCH_RANGE = 2.8;
const PUNCH_DMG = 30;
const PARRY_RANGE = 3.8;     // how close a bile orb must be to punch it back
const PARRY_SPEED = 45;
const PARRY_DMG = 90;
const PARRY_HEAL = 25;

const o = new THREE.Vector3(), f = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
const muzzle = new THREE.Vector3(), end = new THREE.Vector3(), d = new THREE.Vector3();

// Fire the gun in your hands: one bullet for the rifle, a spray of pellets
// for the scattergun. Bullets are instant ("hitscan").
export function shoot(game) {
  const p = game.player, w = WEAPONS[p.weapon];
  p.eyePos(o); p.forward(f);
  right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
  up.crossVectors(right, f);
  muzzle.copy(o).addScaledVector(f, 0.7).addScaledVector(right, 0.22).addScaledVector(up, -0.18);
  const pellets = w.pellets || 1;
  for (let i = 0; i < pellets; i++) {
    // a random spread, bunched towards the middle
    const a = Math.random() * Math.PI * 2, s = w.spread * Math.sqrt(Math.random());
    d.copy(f).addScaledVector(right, Math.cos(a) * s).addScaledVector(up, Math.sin(a) * s).normalize();
    fireRay(game, w, i % 3 === 0);
  }
  game.vm.fire(w.key);
  game.muzzle = w.key === 'shotgun' ? 1 : 0.6;
  game.shake = Math.max(game.shake, w.key === 'shotgun' ? 0.25 : 0.05);
  if (w.key === 'shotgun') sfx.shotgun(); else sfx.rifle();
}

function fireRay(game, w, drawTracer) {
  const wall = game.level.raycast(o, d, w.range);
  const maxT = wall ? wall.t : w.range;
  const hit = game.enemies.hitscan(o, d, maxT);
  // missed every creature? maybe it hit a body lying on the floor
  const body = hit ? null : game.gore.hitCorpse(o, d, maxT);
  const t = hit ? hit.t : body ? body.t : maxT;
  end.copy(o).addScaledVector(d, t);
  if (drawTracer) game.fx.tracer(muzzle, end, w.key === 'rifle' ? 0x60f0ff : 0xffa040, w.key === 'rifle' ? 0.04 : 0.025);
  if (hit) {
    let dmg = w.dmg;
    if (w.falloff && t > w.falloff) dmg *= Math.max(0.25, 1 - (t - w.falloff) / 35);
    if (hit.head) dmg *= w.headMult;
    // blood: a puff where it went in, and a spray out of the back
    game.fx.burst(end, hit.head ? 14 : 7, [COLORS.blood, COLORS.rot], 5, { dir: d });
    game.fx.burst(end, hit.head ? 16 : 8, [COLORS.blood, COLORS.dark], 11, { dir: d, life: 0.9 });
    if (Math.random() < (w.pellets ? 0.2 : 0.5)) game.fx.sprayBehind(end, d, 5, 0.25 + Math.random() * 0.3);
    game.enemies.damage(hit.enemy, dmg, { fromPlayer: true, weapon: w.key, head: hit.head, dist: t, dir: d.clone(), point: end.clone(), knock: w.key === 'shotgun' ? 1.2 : 0.3 });
  } else if (body) {
    game.fx.burst(end, 10, [COLORS.blood, COLORS.dark], 6, { dir: d });
    game.gore.shootCorpse(body.corpse, w.dmg, d.clone());
  } else if (wall) {
    game.fx.burst(end, 6, COLORS.spark, 6, { glow: true, life: 0.25, grav: 20, dir: { x: wall.nx, y: wall.ny, z: wall.nz } });
  }
}

// Punch: knocks creatures back, and punches spitters' bile orbs straight
// back where you're looking (a PARRY: big damage, and it heals you).
export function punch(game) {
  const p = game.player;
  p.eyePos(o); p.forward(f);
  let hitSomething = false;

  for (const orb of game.enemies.parryable()) {
    d.copy(orb.pos).sub(o);
    const dist = d.length();
    if (dist < PARRY_RANGE && d.dot(f) > dist * 0.4) {
      orb.friendly = true;
      orb.mesh.material = game.enemies.orbMatFriendly;
      orb.vel.copy(f).multiplyScalar(PARRY_SPEED);
      orb.dmg = PARRY_DMG; orb.life = 3;
      hitSomething = true;
      game.hitstop = Math.max(game.hitstop, 0.12);
      game.addStyle(80, 'PARRY');
      p.heal(PARRY_HEAL);
      game.fx.burst(orb.pos, 25, COLORS.cyan, 8, { glow: true, grav: 4 });
      sfx.parry();
    }
  }

  for (const e of game.enemies.list) {
    if (e.dead) continue;
    d.set(e.pos.x - o.x, e.pos.y + 1.1 - o.y, e.pos.z - o.z);
    const dist = d.length();
    if (dist < PUNCH_RANGE + e.cfg.radius && d.dot(f) > dist * 0.35) {
      const dir = new THREE.Vector3(f.x, 0, f.z).normalize();
      e.stun = 0.5;
      e.vel.y = e.type === 'bloater' ? 2 : 5; e.onGround = false;
      game.enemies.damage(e, PUNCH_DMG, { fromPlayer: true, weapon: 'punch', dir, knock: e.type === 'bloater' ? 6 : 16, dist });
      const at = new THREE.Vector3(e.pos.x, e.pos.y + 1.2, e.pos.z);
      game.fx.burst(at, 20, [COLORS.blood, COLORS.rot], 7, { dir });
      game.gore.screenSplat(at, 4, 0.5);
      hitSomething = true;
      game.hitstop = Math.max(game.hitstop, 0.06);
      game.shake = Math.max(game.shake, 0.25);
    }
  }
  if (hitSomething) sfx.punch(); else sfx.whoosh();
}
