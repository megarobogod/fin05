// main.js - sets everything up and runs the game: waves, style, the loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Level } from './level.js';
import { Player, PLAYER } from './player.js';
import { Enemies } from './enemies.js';
import { FX } from './fx.js';
import { Gore } from './gore.js';
import { HUD } from './hud.js';
import { ViewModel } from './viewmodel.js';
import { audio, sfx, initAudio, setMusic, setMuted } from './audio.js';

// ---- Tuning ----
const BASE_FOV = 78;          // vertical field of view, in degrees
const BLOOD_RANGE = 7;        // damage you do this close heals you...
const BLOOD_HEAL = 0.3;       // ...by this much of the damage
const KILL_HEAL = 10;         // and close kills heal this much more
const STYLE_PER_RANK = 100;
const RANKS = ['CONTAINED', 'CLEANSING', 'PURGING', 'SCORCHING', 'ERADICATING', 'EXTERMINATOR'];
const MAX_ALIVE = 14;         // creatures on the field at once
const WAVES = [
  { husk: 6 },
  { husk: 8, spitter: 2 },
  { husk: 10, spitter: 4, bloater: 1 },
  { husk: 14, spitter: 5, bloater: 3 },
];

const TEST = location.hash === '#test';

// ---------- Renderer, scene, camera ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x4a4824, 0.014);
scene.add(new THREE.HemisphereLight(0xd0c890, 0x3a2818, 1.7));
const sun = new THREE.DirectionalLight(0xffb070, 1.3);
sun.position.set(-240, 70, -220);
scene.add(sun);
const muzzleLight = new THREE.PointLight(0xffc070, 0, 14, 2);
scene.add(muzzleLight);

const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 900);
camera.rotation.order = 'YXZ';

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.5, 0.8);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- The game object: everything hangs off this ----------
const game = {
  scene, camera, renderer, RANKS, WAVES, test: TEST,
  state: 'menu', time: 0, hitstop: 0, shake: 0, fovKick: 0, muzzle: 0, freeze: false,
  style: 0, bestRank: 0, score: 0, kills: 0,
  wave: -1, queue: [], spawnT: 0, breakT: 0,
  pickups: [], multi: { t: -9, n: 0 },
};
game.level = new Level(scene);
game.fx = new FX(scene, game.level);
game.gore = new Gore(game);
game.enemies = new Enemies(game);
game.player = new Player(game);
game.vm = new ViewModel();
game.hud = new HUD(game);
window.game = game;

game.rankIndex = () => Math.min(RANKS.length - 1, Math.floor(game.style / STYLE_PER_RANK));

game.addStyle = (pts, label) => {
  const before = game.rankIndex();
  game.style = Math.min(STYLE_PER_RANK * RANKS.length - 1, game.style + pts);
  const r = game.rankIndex();
  game.bestRank = Math.max(game.bestRank, r);
  if (r > before) sfx.rank();
  if (label) game.hud.feed('+ ' + label);
};

// Called whenever a creature takes damage.
game.onDamage = (e, amount, info) => {
  if (!info.fromPlayer) return;
  const p = game.player;
  if (e.pos.distanceTo(p.pos) < BLOOD_RANGE) p.heal(amount * BLOOD_HEAL);
  game.hud.hit(info.head);
  sfx.hit(info.head);
};

// Called when a creature dies.
game.onKill = (e, info) => {
  if (info.weapon === 'self') return; // a bloater that burst on its own doesn't count
  const p = game.player;
  game.kills++;
  game.score += Math.round(e.cfg.score * (1 + game.rankIndex() * 0.5));
  let pts = 40;
  const labels = [];
  if (info.head) { pts += 30; labels.push('HEADSHOT'); }
  if (info.gib) { pts += 30; labels.push('GIBBED'); }
  if (info.weapon === 'punch') { pts += 40; labels.push('KNOCKOUT'); }
  if (info.weapon === 'parry') { pts += 50; labels.push('RETURN TO SENDER'); }
  if (info.chain) { pts += 40; labels.push('CHAIN REACTION'); }
  if (!p.onGround) { pts += 20; labels.push('AIRBORNE'); }
  if (p.sliding) { pts += 15; labels.push('SLIDING'); }
  if (game.time - game.multi.t < 0.6) game.multi.n++; else game.multi.n = 1;
  game.multi.t = game.time;
  if (game.multi.n >= 2) { pts += 25 * game.multi.n; labels.push(['', '', 'DOUBLE KILL', 'TRIPLE KILL'][game.multi.n] || 'MASSACRE'); }
  game.addStyle(pts, labels.length ? labels.join(' + ') : 'KILL');
  if (e.pos.distanceTo(p.pos) < BLOOD_RANGE) p.heal(KILL_HEAL);
  game.hitstop = Math.max(game.hitstop, info.gib ? 0.07 : 0.04);
  game.shake = Math.max(game.shake, 0.3);
  sfx.kill();
  if (e.type !== 'husk' || Math.random() < 0.35) game.spawnPickup(e.pos);
};

game.onPlayerDeath = () => {
  game.state = 'dead';
  setMusic(false);
  showEnd('YOU ROTTED', 'The planet keeps you.');
};

// ---------- Pickups (scattergun shells) ----------
// a little bundle of three glowing shells
const shellGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8);
const capGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.07, 8);
const shellMat = new THREE.MeshStandardMaterial({ color: 0xc02a1a, emissive: 0xff4010, emissiveIntensity: 0.8, flatShading: true });
const capMat = new THREE.MeshStandardMaterial({ color: 0xd8a040, emissive: 0xff9020, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.3, flatShading: true });
function shellBundle() {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.08, 0], [0.08, 0], [0, 0.13]]) {
    const s = new THREE.Mesh(shellGeo, shellMat); s.position.set(x, 0, z);
    const c = new THREE.Mesh(capGeo, capMat); c.position.set(x, -0.17, z);
    g.add(s, c);
  }
  g.rotation.x = 0.4;
  return g;
}
game.spawnPickup = (pos) => {
  const m = shellBundle();
  m.position.set(pos.x, Math.max(pos.y, game.level.heightAt(pos.x, pos.z) < 0.5 ? 0 : pos.y) + 0.5, pos.z);
  scene.add(m);
  game.pickups.push({ mesh: m, t: 0, base: m.position.y });
};
function updatePickups(dt) {
  const p = game.player;
  for (const k of game.pickups) {
    k.t += dt;
    const m = k.mesh;
    m.rotation.y += dt * 3;
    const dx = p.pos.x - m.position.x, dy = p.pos.y + 0.8 - m.position.y, dz = p.pos.z - m.position.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 5 && p.shells < PLAYER.maxShells) {
      // pulled towards you
      m.position.x += dx / d * dt * 14; m.position.y += dy / d * dt * 14; m.position.z += dz / d * dt * 14;
    } else m.position.y = k.base + Math.sin(k.t * 3) * 0.15;
    if (d < 1.3 && p.shells < PLAYER.maxShells) {
      p.shells = Math.min(PLAYER.maxShells, p.shells + 6);
      game.hud.feed('+6 SHELLS', 'ammo');
      sfx.pickup();
      k.dead = true;
    }
    if (k.t > 40) k.dead = true;
    if (k.dead) scene.remove(m);
  }
  game.pickups = game.pickups.filter(k => !k.dead);
}

// ---------- Waves ----------
function startWave(i) {
  game.wave = i;
  game.queue = [];
  for (const [type, n] of Object.entries(WAVES[i])) for (let k = 0; k < n; k++) game.queue.push(type);
  for (let k = game.queue.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [game.queue[k], game.queue[j]] = [game.queue[j], game.queue[k]]; }
  game.spawnT = 1.2;
  game.hud.banner(`WAVE ${i + 1}`, i === 0 ? 'PURGE THE ROT' : i === WAVES.length - 1 ? 'FINAL WAVE' : 'THEY KEEP COMING');
  sfx.wave();
}

function pickSpawn() {
  const p = game.player.pos;
  const far = game.level.spawns.filter(s => s.distanceTo(p) > 18);
  const list = far.length ? far : game.level.spawns;
  return list[Math.floor(Math.random() * list.length)];
}

function updateWaves(dt) {
  if (game.breakT > 0) {
    game.breakT -= dt;
    if (game.breakT <= 0) startWave(game.wave + 1);
    return;
  }
  game.spawnT -= dt;
  if (game.queue.length && game.spawnT <= 0 && game.enemies.list.length < MAX_ALIVE) {
    const s = pickSpawn();
    game.enemies.spawn(game.queue.pop(), s.x + (Math.random() - 0.5) * 2, s.z + (Math.random() - 0.5) * 2);
    game.spawnT = 0.35 + Math.random() * 0.6;
  }
  if (!game.queue.length && game.enemies.list.length === 0) {
    if (game.wave >= WAVES.length - 1) {
      game.state = 'won';
      setMusic(false);
      showEnd('SECTOR PURGED', 'The rot is gone from here. For now.');
    } else {
      game.breakT = 4;
      game.hud.banner('WAVE CLEARED', 'more rot is rising');
    }
  }
}

// ---------- Input ----------
const input = { keys: new Set(), pressed: new Set(), mx: 0, my: 0, wheel: 0, fire: false, firePressed: false, punch: false };
game.input = input;
const locked = () => document.pointerLockElement === canvas;

addEventListener('keydown', e => {
  if (['Space', 'ControlLeft', 'ControlRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (!e.repeat) input.pressed.add(e.code);
  input.keys.add(e.code);
  if (e.code === 'KeyF' && !e.repeat) input.punch = true;
  if (e.code === 'KeyM' && !e.repeat) setMuted(!audio.muted);
});
addEventListener('keyup', e => input.keys.delete(e.code));
addEventListener('blur', () => { input.keys.clear(); input.fire = false; });
addEventListener('mousemove', e => {
  if (!locked()) return;
  input.mx += e.movementX; input.my += e.movementY;
});
canvas.addEventListener('mousedown', e => {
  if (game.state !== 'play') return;
  if (!locked() && !TEST) { start(); return; }
  if (e.button === 0) { input.fire = true; input.firePressed = true; }
  if (e.button === 2) input.punch = true;
});
addEventListener('mouseup', e => { if (e.button === 0) input.fire = false; });
addEventListener('wheel', e => { if (game.state === 'play') input.wheel = Math.sign(e.deltaY); }, { passive: true });
addEventListener('contextmenu', e => e.preventDefault());

const overlay = document.getElementById('overlay');
const endScreen = document.getElementById('end');

function start() {
  initAudio();
  if (!TEST) {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  }
  if (game.state === 'menu') { game.state = 'play'; startWave(0); }
  else if (game.state === 'paused') game.state = 'play';
  overlay.classList.add('hidden');
  game.hud.show(true);
  setMusic(true);
}
overlay.addEventListener('click', start);

document.addEventListener('pointerlockchange', () => {
  if (!locked() && game.state === 'play' && !TEST) {
    game.state = 'paused';
    input.fire = false;
    setMusic(false);
    document.getElementById('startText').textContent = 'PAUSED · CLICK TO CONTINUE';
    overlay.classList.remove('hidden');
  }
});

function showEnd(title, sub) {
  if (document.pointerLockElement) document.exitPointerLock();
  document.getElementById('endTitle').textContent = title;
  document.getElementById('endSub').textContent = sub;
  const t = Math.floor(game.time);
  document.getElementById('endStats').innerHTML =
    `Score <b>${game.score.toLocaleString()}</b> · Kills <b>${game.kills}</b> · Time <b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b><br>Best rank <b>${RANKS[game.bestRank]}</b>`;
  setTimeout(() => endScreen.classList.remove('hidden'), 900);
}
endScreen.addEventListener('click', () => location.reload());

// ---------- Update and draw ----------
function update(dt) {
  if (game.state !== 'play') return;
  if (game.hitstop > 0) {
    // a split-second freeze on big hits: the world stops, you can still look
    game.hitstop -= dt;
    game.player.look(input);
    return;
  }
  game.time += dt;
  game.player.update(dt, input);
  game.enemies.update(dt);
  game.fx.update(dt);
  game.gore.update(dt);
  updatePickups(dt);
  updateWaves(dt);
  const r = game.rankIndex();
  game.style = Math.max(0, game.style - (6 + r * 5) * dt);
  const target = Math.min(1, game.enemies.list.length / 12 * 0.5 + r / (RANKS.length - 1) * 0.6);
  audio.intensity += (target - audio.intensity) * Math.min(1, dt);
  input.pressed.clear();
  input.firePressed = false;
  input.punch = false;
}

function draw(dt) {
  const p = game.player;
  game.level.update(dt, game.time, camera);
  camera.position.set(p.pos.x, p.pos.y + p.eyeH, p.pos.z);
  if (game.shake > 0) {
    const s = game.shake * 0.25;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
    game.shake = Math.max(0, game.shake - dt * 2.5);
  }
  camera.rotation.set(p.pitch, p.yaw, p.roll);
  // the faster you go, the wider the view
  const hs = Math.hypot(p.vel.x, p.vel.z);
  const fov = BASE_FOV + Math.min(14, Math.max(0, hs - PLAYER.speed) * 0.7) + game.fovKick;
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 8);
  camera.updateProjectionMatrix();
  game.fovKick = Math.max(0, game.fovKick - dt * 40);

  muzzleLight.position.copy(camera.position);
  muzzleLight.intensity = game.muzzle * 120;
  game.muzzle = Math.max(0, game.muzzle - dt * 15);

  game.vm.update(dt, p);
  game.hud.update(dt);

  renderer.clear();
  composer.render(dt);
  renderer.clearDepth();
  renderer.render(game.vm.scene, game.vm.camera);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  game.vm.resize(w / h);
}
addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!game.freeze) update(dt);
  draw(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// For testing from the console: game.run(5) plays 5 seconds instantly.
game.run = (seconds) => {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) update(1 / 60);
  draw(1 / 60);
};
game.draw = () => draw(1 / 60);
game.start = start;

document.getElementById('startText').textContent = 'CLICK TO DEPLOY';
if (TEST) start();
