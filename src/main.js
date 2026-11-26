// main.js - where the game starts. For now it just draws a test picture
// and runs a game loop, so there's something to build on.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

let last = performance.now();
let t = 0;

function update(dt) {
  t += dt;
}

function draw() {
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, W, H);

  // A square bobbing up and down, to show the loop is running.
  const y = H / 2 + Math.sin(t * 2) * 40;
  ctx.fillStyle = '#eee';
  ctx.fillRect(W / 2 - 10, y - 10, 20, 20);
}

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); // seconds, capped so a lag spike can't break things
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
