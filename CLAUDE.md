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
- **Parkour** (`player.js`, the "parkour moves" section): **wall run**: in the air, holding W, moving along a tall wall (`findRunWall` probes the four grid directions); gravity drops to `wallRunGravity`, the camera tilts away, Space jumps off keeping your speed, kills while on the wall score WALLRUNNING. **Mantle**: holding W into a ledge within `mantleReach` above your feet hauls you up onto it; on the ground, low blocks (`vaultHeight`) are hopped onto just by running at them. **Ground slam**: C/Ctrl in the air dives at `slamSpeed`; landing throws nearby creatures up and hurts them (more the further you fell, SLAMMED/GROUND SLAM style), and jumping within 0.3 s of landing is a **slam jump** (`slamJump` x height).
- **Weapons** (`player.js` `WEAPONS`, `combat.js`): pulse rifle (infinite, overheats) and scattergun (12 pellets, shells drop from creatures, kick shoves you back). F or right click punches: knocks creatures back, and punches spitter bile back where you look (PARRY).
- **Creatures** (`enemies.js` `TYPES`): husk (rushes, claws, leaps), spitter (keeps distance, spits 3 dodgeable bile orbs), bloater (swells and bursts near you; bursting hurts other creatures too, chains, and leaves rot gas).
- **Blood heals** (`main.js` `BLOOD_RANGE`, `BLOOD_HEAL`, `KILL_HEAL`): damage you do up close heals you, so the game pushes you forward.
- **Style** (`main.js` `RANKS`): kills, headshots, gibs, parries, dodges, mid-air and multi-kills fill a meter that drains; ranks CONTAINED to EXTERMINATOR multiply your score. Getting hit costs style.
- **Waves** (`main.js` `WAVES`): 4 waves, up to `MAX_ALIVE` creatures at once; clear them all to win.
- **Juice**: hitstop on kills/parries, screen shake, FOV widens with speed, bloom, blood droplets, tracers (`fx.js`).
- **Splats** (`fx.js` `decal`): one InstancedMesh of squares with a splat texture, on floors AND walls (each has its own facing). Droplets that fly into a wall splat on its face (`wallHit`); hits spray onto whatever is close behind (`sprayBehind`). `DECALS` is how many before the oldest get reused.
- **Gore** (`gore.js`): kills drop a **corpse** that tips over away from the hit, slides, bleeds and grows a pool, then sinks after `CORPSE_TIME`. Bullets hit corpses too and burst them at `CORPSE_HP`. Headshot kills take the **head** off; enough damage high on one side takes that **arm** off (`LIMB_DAMAGE` in `enemies.js`, +DISARMED style). Severing (`sever`) lifts a joint off the skeleton and throws it, leaving a meat stump that pumps blood. Big kills and every bloater **gib**: all the limbs fly off plus low-poly meat/bone/gut chunks (`goreGeos` in `models.js`). Up-close kills and punches splatter **blood on your visor** (a canvas over the game).
- **Creature models** (`models.js`): low-poly, sculpted in code. Each piece starts as a ball, tube, spike or lathe outline, is squashed, pushed in and out with noise (`sculpt`), and every triangle is painted its own colour with rot/bruise patches and darker undersides (`paint`), drawn with flat shading. Pieces hang on a skeleton (`Rig`: hips, spine, neck, head, jaw, arms, elbows, legs, knees, ankles) and are merged per joint. Each type is built once and cloned; `pose(bone, x, z)` turns a joint on top of its resting angle, and `animate` in `enemies.js` drives the walk cycles, attacks and jaws. Hit spheres in `TYPES.parts` match the models (with a forward offset for the hunched husk).
- **Guns on screen** (`viewmodel.js`): low-poly guns made from side outlines extruded to thickness with chamfered edges (`ext`), plus tubes and blocks; gloved hands and armoured forearms; an armoured fist for the punch. `GUN_SCALE` sets their size. Keep gun metalness low (there's no environment map, so shiny metal renders black). Their own scene is drawn after the world, with bob, sway, recoil, switching and the punch.
- **Sound** (`audio.js`): Web Audio synth effects and a 168 BPM soundtrack that gets heavier with more creatures and a higher style rank. M mutes.

## Ideas for next
- More levels: hive caverns, a dead colony, a boss.
- A grappling hook or a rocket launcher.
- Enemy variety: flyers, an armoured brute.
