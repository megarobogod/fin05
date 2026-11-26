// textures.js - every texture in the game is painted here, in code, on a canvas.
// No image files. Each one tiles (the edges wrap round) so it can repeat.
import * as THREE from 'three';

// A random number generator that gives the same numbers every time (seeded),
// so the textures look the same on every load.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;

// Make a canvas, let `draw` paint on it, and turn it into a texture.
function make(size, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// A soft round blob. It is drawn again on the far side when it crosses an
// edge, which is what makes the texture tile without a seam.
function spot(g, size, x, y, r, color, alpha) {
  for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
    const cx = x + ox, cy = y + oy;
    if (cx + r < 0 || cx - r > size || cy + r < 0 || cy - r > size) continue;
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grd.addColorStop(0, rgba(color, alpha));
    grd.addColorStop(1, rgba(color, 0));
    g.fillStyle = grd;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
}

// Speckle every pixel a little lighter or darker, for grit.
function grain(g, size, amount, rand) {
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// A wandering line (cracks, veins).
function wander(g, rand, x, y, steps, len, color, width) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(x, y);
  let a = rand() * Math.PI * 2;
  for (let i = 0; i < steps; i++) {
    a += (rand() - 0.5) * 1.2;
    x += Math.cos(a) * len; y += Math.sin(a) * len;
    g.lineTo(x, y);
  }
  g.stroke();
}

// The dying ground: grey-brown dirt, rot patches, cracks and pustules.
function ground() {
  return make(512, (g, s) => {
    const r = rng(11);
    g.fillStyle = '#2e2a22'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) spot(g, s, r() * s, r() * s, 10 + r() * 50, r() < 0.5 ? [20, 18, 14] : [70, 62, 48], 0.35);
    for (let i = 0; i < 45; i++) spot(g, s, r() * s, r() * s, 15 + r() * 60, r() < 0.6 ? [78, 92, 28] : [60, 40, 50], 0.5);
    for (let i = 0; i < 35; i++) wander(g, r, r() * s, r() * s, 14, 8, 'rgba(12,10,6,0.8)', 1 + r() * 2);
    for (let i = 0; i < 160; i++) spot(g, s, r() * s, r() * s, 1.5 + r() * 3, [200, 230, 70], 0.9);
    grain(g, s, 22, r);
  });
}

// Arena walls: rusty metal panels with rot dripping down them.
function wall() {
  return make(512, (g, s) => {
    const r = rng(23);
    g.fillStyle = '#383c3e'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 120; i++) spot(g, s, r() * s, r() * s, 10 + r() * 40, r() < 0.5 ? [30, 32, 34] : [80, 84, 86], 0.25);
    for (let i = 0; i < 25; i++) spot(g, s, r() * s, r() * s, 10 + r() * 35, [100, 58, 30], 0.55);
    // panel seams and rivets
    for (let p = 0; p <= s; p += s / 4) {
      g.fillStyle = 'rgba(10,10,10,0.8)'; g.fillRect(0, p - 2, s, 4); g.fillRect(p - 2, 0, 4, s);
      g.fillStyle = 'rgba(140,140,140,0.3)'; g.fillRect(0, p + 2, s, 1); g.fillRect(p + 2, 0, 1, s);
    }
    for (let x = s / 8; x < s; x += s / 4) for (let y = s / 8; y < s; y += s / 4) {
      for (const [ox, oy] of [[-48, -48], [48, -48], [-48, 48], [48, 48]]) {
        g.fillStyle = '#1b1c1d'; g.beginPath(); g.arc(x + ox, y + oy, 4, 0, 7); g.fill();
        g.fillStyle = '#6a6d70'; g.beginPath(); g.arc(x + ox - 1, y + oy - 1, 2, 0, 7); g.fill();
      }
    }
    // rot drips
    for (let i = 0; i < 30; i++) {
      const x = r() * s, y = r() * s, w = 3 + r() * 9, h = 40 + r() * 200;
      const grd = g.createLinearGradient(0, y, 0, y + h);
      grd.addColorStop(0, 'rgba(95,115,30,0.8)'); grd.addColorStop(1, 'rgba(60,45,30,0)');
      g.fillStyle = grd; g.fillRect(x, y, w, h);
    }
    grain(g, s, 18, r);
  });
}

// Raised blocks: old colony concrete gone dark and diseased.
function block() {
  return make(256, (g, s) => {
    const r = rng(37);
    g.fillStyle = '#4b4337'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 80; i++) spot(g, s, r() * s, r() * s, 6 + r() * 30, r() < 0.5 ? [30, 26, 20] : [95, 85, 70], 0.35);
    for (let i = 0; i < 12; i++) spot(g, s, r() * s, r() * s, 8 + r() * 25, [90, 110, 30], 0.5);
    g.strokeStyle = 'rgba(15,12,8,0.9)'; g.lineWidth = 10; g.strokeRect(0, 0, s, s);
    g.strokeStyle = 'rgba(200,190,150,0.15)'; g.lineWidth = 2; g.strokeRect(8, 8, s - 16, s - 16);
    for (let i = 0; i < 10; i++) wander(g, r, r() * s, r() * s, 8, 9, 'rgba(15,12,8,0.7)', 1.5);
    grain(g, s, 20, r);
  });
}

// Glowing rot goo for the pools.
function goo() {
  return make(256, (g, s) => {
    const r = rng(41);
    g.fillStyle = '#4e7a0e'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) spot(g, s, r() * s, r() * s, 8 + r() * 40, r() < 0.5 ? [180, 240, 50] : [30, 55, 8], 0.6);
    for (let i = 0; i < 30; i++) {
      g.strokeStyle = 'rgba(230,255,140,0.6)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(r() * s, r() * s, 2 + r() * 6, 0, 7); g.stroke();
    }
  });
}

// Skin for the creatures. Light, so each creature's colour tints it.
function flesh() {
  return make(256, (g, s) => {
    const r = rng(53);
    g.fillStyle = '#c4ad96'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) spot(g, s, r() * s, r() * s, 6 + r() * 30, r() < 0.5 ? [160, 90, 85] : [130, 150, 80], 0.5);
    for (let i = 0; i < 40; i++) wander(g, r, r() * s, r() * s, 10, 7, 'rgba(110,35,60,0.7)', 1 + r() * 1.5);
    grain(g, s, 25, r);
  });
}

// A round soft dot (for particles and glows). Not colour-managed: it's a mask.
function dot(size, hard) {
  return make(size, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(hard ? 0.6 : 0.2, 'rgba(255,255,255,' + (hard ? 1 : 0.6) + ')');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  }, false);
}

export const textures = {
  ground: ground(),
  wall: wall(),
  block: block(),
  goo: goo(),
  flesh: flesh(),
  dot: dot(64, true),
  glow: dot(128, false),
};
