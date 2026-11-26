// hud.js - health, dashes, ammo, the style meter and messages on screen.
import { PLAYER, WEAPONS } from './player.js';

const $ = id => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {};
    for (const id of ['hud', 'hpNum', 'hpFill', 'dash', 'weaponName', 'ammo', 'heatFill', 'heatBar', 'rank', 'styleFill', 'feed', 'banner', 'bannerTitle', 'bannerSub', 'wave', 'hint', 'score', 'hurt', 'healflash', 'hitmarker'])
      this.el[id] = $(id);
    this.pips = [...this.el.dash.children];
    this.hurtA = 0; this.healA = 0; this.hitA = 0; this.bannerT = 0; this.hintT = 0; this.lastRank = -1;
  }

  show(on) { this.el.hud.classList.toggle('hidden', !on); }

  hurt(a) { this.hurtA = Math.min(1, this.hurtA + 0.35 + a); }
  heal() { this.healA = Math.min(0.5, this.healA + 0.12); }
  hit(head) { this.hitA = 1; this.el.hitmarker.classList.toggle('head', !!head); }

  feed(text, cls = '') {
    const d = document.createElement('div');
    d.textContent = text;
    if (cls) d.className = cls;
    this.el.feed.prepend(d);
    while (this.el.feed.children.length > 6) this.el.feed.lastChild.remove();
    setTimeout(() => d.classList.add('fade'), 1600);
    setTimeout(() => d.remove(), 2400);
  }

  // A tip at the bottom of the screen. [KEY] is drawn as a key.
  hint(text, time = 16) {
    const safe = text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    this.el.hint.innerHTML = safe.replace(/\[([^\]]+)\]/g, '<kbd>$1</kbd>');
    this.el.hint.classList.remove('on'); void this.el.hint.offsetWidth; this.el.hint.classList.add('on');
    this.hintT = time;
  }

  banner(title, sub = '', time = 2.5) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    this.bannerT = time;
    this.el.banner.classList.add('on');
  }

  update(dt) {
    const g = this.game, p = g.player, e = this.el;
    e.hpNum.textContent = Math.ceil(p.hp);
    e.hpFill.style.width = (p.hp / PLAYER.maxHP * 100) + '%';
    e.hpFill.classList.toggle('low', p.hp < 30);
    this.pips.forEach((pip, i) => { pip.style.setProperty('--f', Math.max(0, Math.min(1, p.dashCharges - i))); });

    const w = WEAPONS[p.weapon];
    e.weaponName.textContent = w.name;
    if (w.key === 'rifle') {
      e.ammo.textContent = p.overheated ? 'OVERHEATED' : '∞';
      e.heatBar.style.visibility = 'visible';
      e.heatFill.style.width = (p.heat * 100) + '%';
      e.heatFill.classList.toggle('hot', p.overheated);
    } else {
      e.ammo.textContent = p.shells + ' SHELLS';
      e.heatBar.style.visibility = 'hidden';
    }

    const r = g.rankIndex();
    e.rank.textContent = g.RANKS[r];
    e.rank.dataset.rank = r;
    e.styleFill.style.width = ((g.style % 100) / 100 * 100) + '%';
    if (r !== this.lastRank) { e.rank.classList.remove('pop'); void e.rank.offsetWidth; e.rank.classList.add('pop'); this.lastRank = r; }

    e.score.textContent = g.score.toLocaleString();
    e.wave.textContent = g.director.objective();
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) e.hint.classList.remove('on'); }

    this.hurtA = Math.max(0, this.hurtA - dt * 1.5);
    this.healA = Math.max(0, this.healA - dt * 1.2);
    this.hitA = Math.max(0, this.hitA - dt * 6);
    const lowHp = p.hp < 30 && !p.dead ? 0.25 + Math.sin(g.time * 6) * 0.1 : 0;
    e.hurt.style.opacity = Math.min(1, this.hurtA + lowHp);
    e.healflash.style.opacity = this.healA;
    e.hitmarker.style.opacity = this.hitA;

    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) e.banner.classList.remove('on'); }
  }
}
