// level.js - the arena: a text map turned into 3D, plus collision, line of
// sight and the path map the creatures follow.
import * as THREE from 'three';
import { textures } from './textures.js';

// ---- Tuning ----
export const CELL = 4;          // each map character is a 4 x 4 metre square
export const WALL_H = 10;       // arena walls and tall pillars
const OUT_H = 1000;             // outside the map counts as an endless wall
const HEIGHTS = { '#': WALL_H, 'T': WALL_H, 'B': 3, 'b': 1.2 };

// Map key:
//   #  arena wall           T  tall pillar
//   B  big block (3 m)      b  low block (1.2 m, you can jump on it)
//   ~  rot pool (burns you, creatures don't care)
//   e  hive where creatures crawl out     P  where you start
//   .  open ground
export const MAP = [
  '##########################',
  '#e..........##..........e#',
  '#...........##...........#',
  '#...BB.............BB....#',
  '#...BB....b....b...BB....#',
  '#........................#',
  '#..~~~......TT......~~~..#',
  '#..~~~......TT......~~~..#',
  '#........................#',
  '##.....b..........b.....##',
  '#e.......BBB..BBB.......e#',
  '#........B......B........#',
  '#...T....B..bb..B....T...#',
  '#...T.......bb.......T...#',
  '#........B......B........#',
  '#........BBB..BBB........#',
  '##.....b....P.....b.....##',
  '#........................#',
  '#..~~~......TT......~~~..#',
  '#..~~~......TT......~~~..#',
  '#........................#',
  '#...BB....b....b...BB....#',
  '#...BB.............BB....#',
  '#...........##...........#',
  '#e..........##..........e#',
  '##########################',
];

export class Level {
  constructor(scene) {
    this.scene = scene;
    this.w = Math.max(...MAP.map(r => r.length));
    this.rows = MAP.map(r => r.padEnd(this.w, '#'));
    this.h = this.rows.length;
    this.hgt = new Float32Array(this.w * this.h);
    this.pool = new Uint8Array(this.w * this.h);
    this.spawns = [];
    this.start = new THREE.Vector3(this.w * CELL / 2, 0, this.h * CELL / 2);
    for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) {
      const ch = this.rows[z][x], i = z * this.w + x;
      this.hgt[i] = HEIGHTS[ch] || 0;
      if (ch === '~') this.pool[i] = 1;
      const c = new THREE.Vector3((x + 0.5) * CELL, 0, (z + 0.5) * CELL);
      if (ch === 'e') this.spawns.push(c);
      if (ch === 'P') this.start.copy(c);
    }
    this.dist = new Int16Array(this.w * this.h);
    this.queue = new Int32Array(this.w * this.h);
    this.flowFrom = -1;
    this.center = new THREE.Vector3(this.w * CELL / 2, 0, this.h * CELL / 2);
    this.build();
  }

  // ---------- Asking about the map ----------
  cellH(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return OUT_H;
    return this.hgt[cz * this.w + cx];
  }
  heightAt(x, z) { return this.cellH(Math.floor(x / CELL), Math.floor(z / CELL)); }
  isPool(x, z) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return false;
    return this.pool[cz * this.w + cx] === 1;
  }

  // Would a circle (radius r, feet at height y) at x,z be inside something
  // too tall to step onto?
  blocked(x, z, r, y, step) {
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      if (this.cellH(cx, cz) <= y + step) continue;
      const px = Math.max(cx * CELL, Math.min(x, (cx + 1) * CELL));
      const pz = Math.max(cz * CELL, Math.min(z, (cz + 1) * CELL));
      if ((x - px) ** 2 + (z - pz) ** 2 < r * r) return true;
    }
    return false;
  }

  // The highest surface under a circle that is no higher than maxY.
  groundUnder(x, z, r, maxY) {
    let g = 0;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const h = this.cellH(cx, cz);
      if (h <= g || h > maxY) continue;
      const px = Math.max(cx * CELL, Math.min(x, (cx + 1) * CELL));
      const pz = Math.max(cz * CELL, Math.min(z, (cz + 1) * CELL));
      if ((x - px) ** 2 + (z - pz) ** 2 < r * r) g = h;
    }
    return g;
  }

  // Move a body (pos, vel) for dt seconds, sliding along walls and landing
  // on floors. Used by the player and the creatures. Fast things move in
  // small steps so they can't pass through walls.
  moveBody(pos, vel, r, dt, step) {
    const n = Math.max(1, Math.ceil(Math.hypot(vel.x, vel.y, vel.z) * dt / 0.2));
    const s = dt / n;
    let wall = null, landed = false, impact = 0;
    for (let i = 0; i < n; i++) {
      const nx = pos.x + vel.x * s;
      if (this.blocked(nx, pos.z, r, pos.y, step)) { wall = { x: -Math.sign(vel.x), z: 0 }; vel.x = 0; } else pos.x = nx;
      const nz = pos.z + vel.z * s;
      if (this.blocked(pos.x, nz, r, pos.y, step)) { wall = { x: 0, z: -Math.sign(vel.z) }; vel.z = 0; } else pos.z = nz;
      pos.y += vel.y * s;
      const g = this.groundUnder(pos.x, pos.z, r * 0.8, pos.y + step);
      if (pos.y <= g) {
        if (vel.y < 0) { impact = Math.min(impact, vel.y); vel.y = 0; }
        pos.y = g; landed = true;
      }
    }
    const g = this.groundUnder(pos.x, pos.z, r * 0.8, pos.y + step);
    const onGround = landed || (pos.y - g < 0.03 && vel.y <= 0);
    if (onGround) pos.y = g;
    return { onGround, wall, impact };
  }

  // Shoot a ray from o in direction d (both {x,y,z}, d normalised). Returns
  // { t, nx, ny, nz } for the first wall, block or floor it hits, or null.
  // It steps square by square across the map grid (a "DDA" walk).
  raycast(o, d, maxT) {
    const tFloor = d.y < 0 ? -o.y / d.y : Infinity;
    const limit = Math.min(maxT, tFloor);
    let cx = Math.floor(o.x / CELL), cz = Math.floor(o.z / CELL);
    const sx = d.x > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
    const dX = d.x !== 0 ? Math.abs(CELL / d.x) : Infinity;
    const dZ = d.z !== 0 ? Math.abs(CELL / d.z) : Infinity;
    let tX = d.x !== 0 ? ((d.x > 0 ? (cx + 1) * CELL - o.x : o.x - cx * CELL) / Math.abs(d.x)) : Infinity;
    let tZ = d.z !== 0 ? ((d.z > 0 ? (cz + 1) * CELL - o.z : o.z - cz * CELL) / Math.abs(d.z)) : Infinity;
    let t0 = 0, nx = 0, nz = 0;
    for (let guard = 0; guard < 400 && t0 < limit; guard++) {
      const t1 = Math.min(tX, tZ, limit);
      const h = this.cellH(cx, cz);
      if (h > 0) {
        const y0 = o.y + d.y * t0, y1 = o.y + d.y * t1;
        if (y0 < h) return { t: t0, nx, ny: 0, nz };
        if (y1 < h) return { t: t0 + (y0 - h) / -d.y, nx: 0, ny: 1, nz: 0 };
      }
      if (t1 >= limit) break;
      if (tX < tZ) { cx += sx; t0 = tX; tX += dX; nx = -sx; nz = 0; }
      else { cz += sz; t0 = tZ; tZ += dZ; nx = 0; nz = -sz; }
    }
    if (tFloor <= maxT) return { t: tFloor, nx: 0, ny: 1, nz: 0 };
    return null;
  }

  // Can a point see another point?
  lineClear(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz) || 0.001;
    return !this.raycast({ x: ax, y: ay, z: az }, { x: dx / len, y: dy / len, z: dz / len }, len);
  }

  // ---------- Path map ----------
  // A "flood fill" out from the player's square: every walkable square gets
  // its number of steps to the player. Creatures walk downhill on it, which
  // takes them round blocks and pillars.
  walkable(i) { return this.hgt[i] < 0.5; }

  updateFlow(px, pz) {
    const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return;
    const start = cz * this.w + cx;
    if (start === this.flowFrom) return;
    this.flowFrom = start;
    const { dist, queue, w } = this;
    dist.fill(-1);
    dist[start] = 0;
    let head = 0, tail = 0;
    queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++], x = i % w, z = (i - x) / w;
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ox, nz = z + oz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= this.h) continue;
        const j = nz * w + nx;
        if (dist[j] !== -1 || !this.walkable(j)) continue;
        dist[j] = dist[i] + 1;
        queue[tail++] = j;
      }
    }
  }

  // Which way to walk from x,z to get closer to the player. null if unknown.
  flowDir(x, z) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), w = this.w;
    if (cx < 0 || cz < 0 || cx >= w || cz >= this.h) return null;
    const here = this.dist[cz * w + cx];
    if (here === 0) return null;
    let best = here >= 0 ? here : 1e9, bx = 0, bz = 0, found = false;
    for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oz) continue;
      const nx = cx + ox, nz = cz + oz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= this.h) continue;
      const j = nz * w + nx, d = this.dist[j];
      if (d < 0 || d >= best) continue;
      // don't cut diagonally past a corner
      if (ox && oz && (!this.walkable(cz * w + nx) || !this.walkable(nz * w + cx))) continue;
      best = d; bx = (nx + 0.5) * CELL; bz = (nz + 0.5) * CELL; found = true;
    }
    if (!found) return null;
    const dx = bx - x, dz = bz - z, l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  }

  // ---------- Building the 3D world ----------
  build() {
    const scene = this.scene;
    const W = this.w * CELL, H = this.h * CELL;

    // the ground, stretching away past the arena walls
    const gTex = textures.ground.clone();
    gTex.repeat.set(75, 75); gTex.needsUpdate = true;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({ map: gTex, roughness: 0.95, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(W / 2, 0, H / 2);
    scene.add(ground);

    // walls and blocks: one InstancedMesh per kind (fast to draw)
    const kinds = [
      { chars: '#T', h: WALL_H, tex: textures.wall, rep: [1, WALL_H / 4] },
      { chars: 'B', h: 3, tex: textures.block, rep: [1, 0.75] },
      { chars: 'b', h: 1.2, tex: textures.block, rep: [1, 0.3] },
    ];
    for (const k of kinds) {
      const cells = [];
      for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) if (k.chars.includes(this.rows[z][x])) cells.push([x, z]);
      if (!cells.length) continue;
      const tex = k.tex.clone(); tex.repeat.set(...k.rep); tex.needsUpdate = true;
      const geo = new THREE.BoxGeometry(CELL, k.h, CELL); geo.translate(0, k.h / 2, 0);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0.25 }), cells.length);
      const m = new THREE.Matrix4();
      cells.forEach(([x, z], i) => mesh.setMatrixAt(i, m.makeTranslation((x + 0.5) * CELL, 0, (z + 0.5) * CELL)));
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
    }

    // rot pools: glowing goo with green lights over some of them
    this.gooTex = textures.goo.clone(); this.gooTex.needsUpdate = true;
    const gooMat = new THREE.MeshStandardMaterial({ map: this.gooTex, emissiveMap: this.gooTex, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.2 });
    const poolGeo = new THREE.PlaneGeometry(CELL, CELL); poolGeo.rotateX(-Math.PI / 2);
    let lights = 0;
    for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) {
      if (this.rows[z][x] !== '~') continue;
      const m = new THREE.Mesh(poolGeo, gooMat);
      m.position.set((x + 0.5) * CELL, 0.04, (z + 0.5) * CELL);
      scene.add(m);
      // one light in the middle of each 3x2 pool
      if (this.rows[z][x - 1] === '~' && this.rows[z][x + 1] === '~' && this.rows[z - 1]?.[x] !== '~' && lights < 8) {
        const l = new THREE.PointLight(0x9cff30, 60, 16, 2);
        l.position.set((x + 0.5) * CELL, 1.2, (z + 1) * CELL);
        scene.add(l); lights++;
      }
    }

    // hives: pulsing rings of flesh where creatures crawl out
    this.hives = [];
    const ringMat = new THREE.MeshStandardMaterial({ map: textures.flesh, color: 0x7a4a48, roughness: 0.6 });
    for (const s of this.spawns) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.35, 8, 20), ringMat);
      ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.1, s.z);
      const core = new THREE.Mesh(new THREE.CircleGeometry(1.3, 20),
        new THREE.MeshBasicMaterial({ color: 0xd6ff3a }));
      core.rotation.x = -Math.PI / 2; core.position.set(s.x, 0.06, s.z);
      scene.add(ring, core);
      this.hives.push(core);
    }

    this.buildSky();
    this.buildOutside();
    this.buildSpores();
  }

  // A sickly sky dome and a dying red sun. They follow the camera.
  buildSky() {
    this.sky = new THREE.Group();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x0c0e08) },
        mid: { value: new THREE.Color(0x4a4824) },
        bottom: { value: new THREE.Color(0x24220f) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top, mid, bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.55)) : mix(mid, bottom, min(1.0, -h * 4.0)); gl_FragColor = vec4(c, 1.0); }',
    });
    this.sky.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat));
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.glow, color: 0xff6a28, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
    sun.scale.set(140, 140, 1); sun.position.set(-240, 70, -220);
    const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.dot, color: 0xff9a50, fog: false, depthWrite: false }));
    disc.scale.set(34, 34, 1); disc.position.copy(sun.position);
    this.sky.add(sun, disc);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
  }

  // Rock spires and giant rotting tendrils beyond the walls.
  buildOutside() {
    const r = (a, b) => a + Math.random() * (b - a);
    const rock = new THREE.MeshStandardMaterial({ color: 0x2b2720, roughness: 1, flatShading: true });
    const c = this.center;
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, d = r(75, 230), h = r(18, 70);
      const m = new THREE.Mesh(new THREE.ConeGeometry(r(4, 14), h, 6), rock);
      m.position.set(c.x + Math.cos(a) * d, h / 2 - 1, c.z + Math.sin(a) * d);
      m.rotation.set(r(-0.15, 0.15), r(0, 6), r(-0.15, 0.15));
      this.scene.add(m);
    }
    const flesh = new THREE.MeshStandardMaterial({ map: textures.flesh, color: 0x6e4a3e, roughness: 0.55 });
    const pus = new THREE.MeshBasicMaterial({ color: 0xc8ff3a });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + r(-0.2, 0.2), d = r(65, 120);
      const bx = c.x + Math.cos(a) * d, bz = c.z + Math.sin(a) * d;
      const pts = [];
      for (let k = 0; k <= 5; k++) {
        const f = k / 5;
        pts.push(new THREE.Vector3(bx + Math.cos(a + 1.5) * f * 25 + r(-5, 5), Math.sin(f * Math.PI) * r(25, 55) - 2, bz + Math.sin(a + 1.5) * f * 25 + r(-5, 5)));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      this.scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, r(2, 4), 8, false), flesh));
      for (let k = 0; k < 8; k++) {
        const p = curve.getPoint(Math.random());
        const b = new THREE.Mesh(new THREE.SphereGeometry(r(0.8, 1.6), 8, 6), pus);
        b.position.set(p.x + r(-2, 2), p.y + r(-1, 2), p.z + r(-2, 2));
        this.scene.add(b);
      }
    }
  }

  // Glowing spores drifting through the air.
  buildSpores() {
    const n = 600, pos = new Float32Array(n * 3);
    const W = this.w * CELL, H = this.h * CELL;
    for (let i = 0; i < n; i++) { pos[i * 3] = Math.random() * W; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = Math.random() * H; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.spores = new THREE.Points(geo, new THREE.PointsMaterial({ map: textures.glow, color: 0xd8ff6a, size: 0.14, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.spores.frustumCulled = false;
    this.scene.add(this.spores);
  }

  update(dt, time, camera) {
    this.sky.position.copy(camera.position);
    this.gooTex.offset.set(Math.sin(time * 0.2) * 0.1, time * 0.03);
    const pulse = 0.6 + Math.sin(time * 3) * 0.4;
    for (const h of this.hives) h.material.color.setRGB(0.84 * pulse, pulse, 0.23 * pulse);
    const p = this.spores.geometry.attributes.position, a = p.array;
    for (let i = 0; i < a.length; i += 3) {
      a[i] += Math.sin(time * 0.7 + i) * dt * 0.3;
      a[i + 1] += dt * 0.35;
      if (a[i + 1] > 14) a[i + 1] = 0;
    }
    p.needsUpdate = true;
  }
}
