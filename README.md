# ROTSTRIKE (fin05)

A fast 3D boomer shooter in the browser. You're a space soldier sent to a dying alien planet to burn out the rot.

Level 1, **LANDFALL**, teaches every move as you go, through locked-room fights, to the evac beacon. Levels live in `src/levels/` as text maps you can edit.

Plain HTML, CSS and JavaScript with Three.js. No build step.

## Run it locally

```
node serve.mjs
```

Then open http://localhost:5176

## Controls

| Key | Does |
| --- | --- |
| Mouse | Look |
| W A S D | Move |
| Space | Jump (again against a wall to wall-jump) |
| W into a wall in the air | Wall run along it (Space to jump off) |
| W into a ledge | Climb up onto it (low blocks: just run at them) |
| Shift | Dash (you can't be hit while dashing) |
| C or Ctrl | Slide. In the air: ground slam (jump as you land to fly high) |
| Left click | Shoot |
| F or right click | Punch (hit glowing bile to send it back) |
| 1 / 2 or wheel | Pulse rifle / Scattergun |
| M | Mute |
