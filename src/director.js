// director.js - runs a level's script: walking onto a trigger shows a hint,
// saves a checkpoint, or starts a fight that locks the doors until every
// creature is dead. It also puts out the pickups and watches for you
// reaching the evac beacon.
import * as THREE from 'three';
import { sfx } from './audio.js';

// ---- Tuning ----
const SPAWN_GAP = 0.35;     // seconds between creatures crawling out
const WAVE_GAP = 1.2;       // pause before the next wave of a fight
const SAFE_SPAWN = 9;       // creatures don't crawl out of a hive closer to you than this
const EXIT_RADIUS = 2.2;    // how close to the beacon counts as reaching it

export class Director {
  constructor(game, data) {
    this.game = game;
    this.data = data;
    this.fired = new Set();     // triggers already used
    this.fight = null;          // the fight going on now, if any
    this.goal = '';             // objective shown at the top
    this.calmGoal = '';         // the objective outside of fights
    const L = game.level;
    this.checkpoint = { pos: L.start.clone(), yaw: 0 };
    for (const it of L.items) game.spawnPickup(it.pos, it.type, true);
  }

  // The game has just started.
  begin() {
    const s = this.data.start;
    if (s.hint) this.game.hud.hint(s.hint);
    if (s.goal) this.setGoal(s.goal);
    this.game.hud.banner(this.data.name, s.goal || '', 3);
  }

  setGoal(text) { this.goal = text; if (!this.fight) this.calmGoal = text; }

  // The words at the top of the screen.
  objective() {
    if (!this.fight) return this.goal;
    return `${this.goal}  ·  ${this.fightLeft()} LEFT`;
  }

  update(dt) {
    const g = this.game, p = g.player, L = g.level;
    if (p.dead) return;
    // stepped on a trigger?
    const t = L.triggerAt(p.pos.x, p.pos.z);
    if (t && !this.fired.has(t) && !this.fight) this.fire(t);
    if (this.fight) this.updateFight(dt);
    // made it to the beacon?
    if (L.exit && Math.hypot(p.pos.x - L.exit.x, p.pos.z - L.exit.z) < EXIT_RADIUS && p.pos.y < 2) g.win();
  }

  fire(letter) {
    const g = this.game, def = this.data.triggers[letter] || {};
    this.fired.add(letter);
    if (def.checkpoint) {
      // come back here, the middle of the trigger's squares, facing the way you came in
      const cells = g.level.zones[letter];
      const mid = cells.reduce((a, c) => a.add(c), new THREE.Vector3()).divideScalar(cells.length);
      this.checkpoint = { pos: mid, yaw: g.player.yaw };
      g.hud.feed('CHECKPOINT', 'ammo');
    }
    if (def.hint) g.hud.hint(def.hint);
    if (def.goal) this.setGoal(def.goal);
    if (def.fight) this.startFight(letter, def.fight);
  }

  // ---------- fights ----------

  startFight(letter, def) {
    const g = this.game;
    this.fight = { letter, def, wave: -1, queue: [], spawnT: 0, waitT: 0, members: [] };
    for (const n of def.lock) g.level.setDoor(n, false);
    if (def.lock.length) sfx.door();
    g.hud.banner('CONTACT', 'purge the rot', 1.6);
    sfx.wave();
    this.nextWave();
  }

  nextWave() {
    const f = this.fight;
    f.wave++;
    f.queue = [...f.def.waves[f.wave]];
    // shuffle so they don't always come out in the same order
    for (let i = f.queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [f.queue[i], f.queue[j]] = [f.queue[j], f.queue[i]]; }
    f.spawnT = f.wave === 0 ? 0.6 : 0;
    if (f.wave > 0) this.game.hud.banner('MORE ROT', '', 1.4);
  }

  // How many creatures this fight still has: alive, waiting, and in later waves.
  fightLeft() {
    const f = this.fight;
    let n = f.queue.length + f.members.filter(e => !e.dead).length;
    for (let w = f.wave + 1; w < f.def.waves.length; w++) n += f.def.waves[w].length;
    return n;
  }

  updateFight(dt) {
    const g = this.game, f = this.fight, p = g.player;
    f.spawnT -= dt;
    if (f.queue.length && f.spawnT <= 0) {
      // crawl out of one of this fight's hives, not right next to you
      const hives = g.level.hiveCells[f.letter] || [g.level.start];
      const far = hives.filter(h => Math.hypot(h.x - p.pos.x, h.z - p.pos.z) > SAFE_SPAWN);
      const list = far.length ? far : hives;
      const h = list[Math.floor(Math.random() * list.length)];
      const e = g.enemies.spawn(f.queue.pop(), h.x + (Math.random() - 0.5) * 2, h.z + (Math.random() - 0.5) * 2);
      f.members.push(e);
      f.spawnT = SPAWN_GAP;
    }
    f.members = f.members.filter(e => !e.dead);
    if (f.queue.length || f.members.length) { f.waitT = WAVE_GAP; return; }
    // this wave is dead
    f.waitT -= dt;
    if (f.waitT > 0) return;
    if (f.wave < f.def.waves.length - 1) this.nextWave();
    else this.endFight();
  }

  endFight() {
    const g = this.game, def = this.fight.def;
    this.fight = null;
    for (const n of def.unlock) g.level.setDoor(n, true);
    if (def.unlock.length) sfx.door();
    g.hud.banner('CLEARED', def.unlock.length ? 'a door has opened' : '', 2);
    if (def.hint) g.hud.hint(def.hint);
    this.setGoal(def.goal || this.calmGoal);
  }

  // ---------- dying ----------

  // Back to the last checkpoint. A fight you died in starts again from
  // scratch next time you walk into it.
  respawn() {
    const g = this.game;
    if (this.fight) {
      for (const n of this.fight.def.lock) g.level.setDoor(n, true);
      this.fired.delete(this.fight.letter);
      this.fight = null;
    }
    g.enemies.clear();
    this.goal = this.calmGoal;
    g.player.respawn(this.checkpoint.pos, this.checkpoint.yaw);
  }
}
