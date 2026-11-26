# ROTSTRIKE (fin05)

A 3D boomer-shooter FPS for a parent and their son to build together and learn from.

## Ground rules
- Plain HTML, CSS and JavaScript modules. Three.js r160 comes from a CDN through the import map in `index.html` (`three` and `three/addons/`). No build step and no packages, so it deploys as a static site.
- Keep the code simple and well commented so a teenager can read and change it. Tuning numbers go at the top of each file.
- Everything (textures, models, sounds, music) is generated in code. No image, model or sound files.
- Build in small steps and test in the browser after each change. `node serve.mjs` serves it at http://localhost:5176 (it proxies Three.js at `/__lib/` and caches it in `.cdn-cache`, gitignored).
- `index.html#test` starts straight away without pointer lock. The console has `window.game` (player, enemies, level, fx, hud, vm, input), `game.run(seconds)` to simulate forward, `game.draw()`, and `game.freeze = true` to hold the picture still. The preview pane may be hidden, so animation frames don't tick: use `game.run`. Keep each javascript call short.
- When testing in the preview browser, load a NEW url each time (`?v=2#test`, `?v=3#test`...): changing only the hash doesn't reload.
- `node --check` on a copy named `.mjs` is a quick syntax check without a browser.
- GitHub: `megarobogod/fin05`. Not connected to Vercel yet. Commits are made as `megarobogod` with the GitHub no-reply email.

## Game design (from the son's prompt)
- A fast-paced 3D boomer shooter in the genre of ULTRAKILL and I AM YOUR BEAST (take the genre's feel, don't copy either game).
- You're a sci-fi space soldier sent to a hostile, dying alien planet overrun by rot and disease, to exterminate it.

## How it's built
- **Arena** (`level.js`): a text map (key at the top of the file), 4 m squares. Walls, pillars, blocks you can jump on, rot pools that burn you, hives where creatures crawl out. Sky dome, dying sun, rock spires and giant tendrils outside, drifting spores.
- **Collision** (`level.js` `moveBody`): bodies are circles against the grid of square heights, moved in small steps; you can step up 0.45 m. `raycast` walks the grid (DDA) for bullets and line of sight.
- **Path map** (`updateFlow`/`flowDir`): a flood fill from the player's square; creatures that can't see you walk downhill on it.
- **Movement** (`player.js` `PLAYER`): momentum running, jump, wall jumps (3 before landing), Shift dash (3 charges, you can't be hit while dashing), C/Ctrl slide (jump out of it to keep the speed). Air steering never slows you.
- **Weapons** (`player.js` `WEAPONS`, `combat.js`): pulse rifle (infinite, overheats) and scattergun (12 pellets, shells drop from creatures, kick shoves you back). F or right click punches: knocks creatures back, and punches spitter bile back where you look (PARRY).
- **Creatures** (`enemies.js` `TYPES`): husk (rushes, claws, leaps), spitter (keeps distance, spits 3 dodgeable bile orbs), bloater (swells and bursts near you; bursting hurts other creatures too, chains, and leaves rot gas).
- **Blood heals** (`main.js` `BLOOD_RANGE`, `BLOOD_HEAL`, `KILL_HEAL`): damage you do up close heals you, so the game pushes you forward.
- **Style** (`main.js` `RANKS`): kills, headshots, gibs, parries, dodges, mid-air and multi-kills fill a meter that drains; ranks CONTAINED to EXTERMINATOR multiply your score. Getting hit costs style.
- **Waves** (`main.js` `WAVES`): 4 waves, up to `MAX_ALIVE` creatures at once; clear them all to win.
- **Juice**: hitstop on kills/parries, screen shake, FOV widens with speed, bloom, gore particles, floor splats, gibs, tracers (`fx.js`).
- **Guns on screen** (`viewmodel.js`): their own scene drawn after the world, with bob, sway, recoil, switching and the punch.
- **Sound** (`audio.js`): Web Audio synth effects and a 168 BPM soundtrack that gets heavier with more creatures and a higher style rank. M mutes.

## Ideas for next
- More levels: hive caverns, a dead colony, a boss.
- A grappling hook or a rocket launcher.
- Enemy variety: flyers, an armoured brute.
