// audio.js - all sounds and the music are made with Web Audio synths.
// No sound files. sfx.something() plays a sound; the music loops while you play.
let ctx = null, master, sfxBus, musicBus, noiseBuf;
let musicOn = false, nextNote = 0, step = 0;

export const audio = { muted: false, intensity: 0 };

// ---- Tuning ----
const VOLUME = 0.7;
const MUSIC_VOLUME = 0.3;
const BPM = 168;
// The bass line: 16 steps, in semitones above the root note (E).
const BASS = [0, 0, 12, 0, 0, 0, 10, 0, 0, 0, 12, 0, 7, 0, 5, 3];
// The root note moves each bar: E, E, G, D.
const ROOTS = [0, 0, 3, -2];

// Browsers only allow sound after a click, so this is called on the first click.
export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = audio.muted ? 0 : VOLUME;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp); comp.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  setInterval(schedule, 25);
}

export function setMuted(m) {
  audio.muted = m;
  if (master) master.gain.value = m ? 0 : VOLUME;
}

export function setMusic(on) {
  musicOn = on;
  if (!ctx) return;
  musicBus.gain.setTargetAtTime(on ? MUSIC_VOLUME : 0, ctx.currentTime, 0.3);
  if (on && nextNote < ctx.currentTime) nextNote = ctx.currentTime + 0.05;
}

// A volume shape: fast rise, then fade out.
function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

// Filtered noise: shots, hits, explosions, hi-hats.
function noiseAt(t, dur, o = {}, bus = sfxBus) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type || 'lowpass';
  f.frequency.setValueAtTime(o.freq || 1000, t);
  if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + dur);
  f.Q.value = o.q || 0.7;
  const g = ctx.createGain();
  env(g, t, o.gain ?? 0.5, o.attack ?? 0.003, dur);
  src.connect(f); f.connect(g); g.connect(bus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

// A pitched note, optionally sliding and filtered.
function toneAt(t, freq, dur, o = {}, bus = sfxBus) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur);
  const g = ctx.createGain();
  env(g, t, o.gain ?? 0.3, o.attack ?? 0.003, dur);
  if (o.filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = o.filter; f.Q.value = o.q || 1;
    osc.connect(f); f.connect(g);
  } else osc.connect(g);
  g.connect(bus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

const now = () => (ctx ? ctx.currentTime : 0);
const noise = (dur, o, v = 1) => noiseAt(now(), dur, { ...o, gain: (o.gain ?? 0.5) * v });
const tone = (f, dur, o, v = 1, delay = 0) => toneAt(now() + delay, f, dur, { ...o, gain: (o.gain ?? 0.3) * v });

export const sfx = {
  rifle() { tone(900, 0.07, { type: 'square', gain: 0.1, slideTo: 200 }); noise(0.06, { type: 'highpass', freq: 2500, gain: 0.3 }); tone(120, 0.06, { gain: 0.3, slideTo: 60 }); },
  shotgun() { noise(0.4, { freq: 2500, gain: 0.9, sweepTo: 150 }); tone(100, 0.3, { gain: 0.9, slideTo: 35 }); noise(0.05, { type: 'highpass', freq: 4000, gain: 0.4 }); },
  empty() { tone(1200, 0.03, { type: 'square', gain: 0.08 }); },
  hit(head) { noise(0.08, { type: 'bandpass', freq: head ? 1400 : 600, q: 2, gain: 0.45 }); if (head) tone(1600, 0.08, { type: 'triangle', gain: 0.15 }); },
  kill() { noise(0.3, { freq: 900, gain: 0.7, sweepTo: 100 }); tone(180, 0.22, { type: 'sawtooth', gain: 0.12, slideTo: 45, filter: 900 }); },
  gib() { noise(0.45, { freq: 1500, gain: 0.9, sweepTo: 80 }); tone(70, 0.3, { gain: 0.7, slideTo: 30 }); },
  splat(v = 1) { noise(0.12, { type: 'bandpass', freq: 380 + Math.random() * 200, q: 1.5, gain: 0.35, sweepTo: 150 }, v); },
  sever() { noise(0.22, { type: 'bandpass', freq: 900, q: 1, gain: 0.6, sweepTo: 250 }); tone(90, 0.15, { gain: 0.4, slideTo: 40 }); },
  dash() { noise(0.22, { type: 'bandpass', freq: 700, q: 1.2, gain: 0.45, sweepTo: 3000 }); },
  jump() { tone(200, 0.1, { gain: 0.12, slideTo: 380 }); },
  land() { noise(0.08, { freq: 350, gain: 0.35 }); },
  slide() { noise(0.35, { type: 'bandpass', freq: 400, q: 0.8, gain: 0.25, sweepTo: 200 }); },
  parry() { tone(1760, 0.5, { type: 'triangle', gain: 0.35 }); tone(2637, 0.35, { type: 'triangle', gain: 0.2 }); noise(0.12, { type: 'highpass', freq: 5000, gain: 0.5 }); },
  punch() { noise(0.1, { freq: 600, gain: 0.7 }); tone(80, 0.15, { gain: 0.8, slideTo: 40 }); },
  whoosh() { noise(0.12, { type: 'bandpass', freq: 1200, q: 1, gain: 0.2, sweepTo: 500 }); },
  hurt() { tone(130, 0.22, { type: 'sawtooth', gain: 0.25, slideTo: 55, filter: 1200 }); noise(0.15, { freq: 900, gain: 0.35 }); },
  spit(v = 1) { noise(0.25, { type: 'bandpass', freq: 800, q: 4, gain: 0.4, sweepTo: 250 }, v); },
  charge(v = 1) { tone(200, 0.5, { type: 'sawtooth', gain: 0.06, slideTo: 600, filter: 1500 }, v); },
  screech(v = 1) { tone(700, 0.3, { type: 'sawtooth', gain: 0.07, slideTo: 280, filter: 2500 }, v); },
  boom(v = 1) { noise(0.9, { freq: 900, gain: 1, sweepTo: 50 }, v); tone(55, 0.7, { gain: 0.9, slideTo: 28 }, v); },
  overheat() { noise(0.6, { type: 'highpass', freq: 3500, gain: 0.3, sweepTo: 1500 }); },
  pickup() { tone(660, 0.08, { type: 'square', gain: 0.08 }); tone(990, 0.1, { type: 'square', gain: 0.08 }, 1, 0.07); },
  portal(v = 1) { tone(70, 0.7, { type: 'sawtooth', gain: 0.12, slideTo: 140, filter: 600 }, v); },
  rank() { tone(523, 0.1, { type: 'square', gain: 0.07 }); tone(784, 0.15, { type: 'square', gain: 0.07 }, 1, 0.08); },
  wave() { tone(110, 1.2, { type: 'sawtooth', gain: 0.15, slideTo: 55, filter: 800 }); noise(1, { freq: 300, gain: 0.3 }); },
};

// ---- Music ----
// Every 25 ms we schedule any notes due in the next 0.12 s. Web Audio then
// plays them at exactly the right moment, so the beat stays steady.
function schedule() {
  if (!ctx || !musicOn) return;
  const stepDur = 60 / BPM / 4;
  while (nextNote < ctx.currentTime + 0.12) {
    playStep(step, nextNote, stepDur);
    nextNote += stepDur;
    step = (step + 1) % 64;
  }
}

function playStep(s, t, stepDur) {
  const i = s % 16, bar = Math.floor(s / 16), I = audio.intensity;
  // kick drum, with an extra hit when things get hot
  if (i % 4 === 0 || (I > 0.5 && i === 14)) toneAt(t, 160, 0.2, { gain: 0.9, slideTo: 42 }, musicBus);
  // snare
  if (i === 4 || i === 12) {
    noiseAt(t, 0.15, { type: 'bandpass', freq: 1800, q: 0.8, gain: 0.55 }, musicBus);
    toneAt(t, 210, 0.08, { type: 'triangle', gain: 0.25, slideTo: 120 }, musicBus);
  }
  // hi-hats: 8ths, then 16ths when intense
  if (i % 2 === 0 || I > 0.7) noiseAt(t, 0.03, { type: 'highpass', freq: 7000, gain: i % 4 === 2 ? 0.22 : 0.1 }, musicBus);
  // bass, the filter opens up as the fight heats up
  const root = ROOTS[bar % 4];
  const f = 41.2 * 2 ** ((BASS[i] + root) / 12);
  toneAt(t, f, stepDur * 0.9, { type: 'sawtooth', gain: 0.4, filter: 350 + I * 1100, q: 4 }, musicBus);
  // stabbing chords on top when the style rank is high
  if (I > 0.45 && bar % 2 === 0 && (i === 0 || i === 3 || i === 6 || i === 10)) {
    for (const n of [0, 3, 7]) toneAt(t, 164.8 * 2 ** ((n + root) / 12), 0.12, { type: 'sawtooth', gain: 0.06, filter: 2400 }, musicBus);
  }
}
