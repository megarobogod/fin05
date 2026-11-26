// level1.js - LANDFALL: the first level. It teaches every move one at a
// time, then makes you use them all in a final fight.
//
// The map is seen from above. Every character is a 4 x 4 metre square.
//   #  wall                 T  tall pillar
//   B  block (3 m)          b  low block (1.2 m)       H  high wall (6 m)
//   ~  rot pool (burns)     %  deep rot (burns badly and slows you down)
//   1-9  doors: all the squares with the same number open and close together
//   P  where you start      X  the evac beacon (reach it to finish)
//   $  scattergun shells    +  health
//   a-z (not b)  a trigger: walking onto it does what `triggers` below says
//   A-Z (not B H P T X)  a hive: creatures for trigger "a" crawl out of "A"
//
// Each trigger can have:
//   hint        text shown at the bottom of the screen ([KEY] draws a key)
//   goal        the objective shown at the top
//   checkpoint  true: if you die, you come back here
//   fight       { waves: [...], lock: [doors to shut], unlock: [doors to open after],
//                 hint / goal: shown once the fight is won }
//               each wave is a list of creatures; the next wave comes when this one is dead
export const LEVEL1 = {
  name: 'LANDFALL',
  start: {
    hint: '[W][A][S][D] move  ·  [MOUSE] look.  Head north, out of the crash.',
    goal: 'REACH THE EVAC BEACON',
  },
  closedDoors: [2, 4, 6],
  map: [
    '##########################################',
    '##########################################',
    '##########################.............###',
    '##########################.+..M......M.###',
    '##########################...T.........###',
    '##########################.....BB......###',
    '##########################.............###',
    '#...........##############.............###',
    '#.K.......K.##############........M....###',
    '#...........2.n...~%%..o.3.mm......B...###',
    '#....bbb....2.n...~%%..o.3.mm......B...###',
    '#...........2.n...~%%..o.3.mm..........###',
    '#.K.......K.##############..........$..###',
    '#..T.....T..##############.....BB......###',
    '#.....$.....##############...T.......M.###',
    '#...kkkkk...##############.............###',
    '#...........###################44#########',
    '#####111#######################qq#########',
    '###.......#####################..#########',
    '###jjjjjjj#####################%%#########',
    '###.......###............######%%#########',
    '###%%%%%%%###............######%%#########',
    '###%%%%%%%###.W..~~~~..W.######%%#########',
    '###%%%%%%%###............######%%#########',
    '###.......###............######%%#########',
    '###.......###.$...W......######%%#########',
    '###ggggggg###...T....T.$.######..#########',
    '###.......###............######55#########',
    '#####...#####............#...............#',
    '#####BBB#####........wwww#....ssss....$..#',
    '#####...#####.bb..BB.wwwwH.............S.#',
    '#####ddd#####........wwwwH...............#',
    '#####...#####........wwwwH...T......bb...#',
    '#####~~~#####........wwwwH...............#',
    '#####...#####...T....TwwwH...............#',
    '#####ccc#####.+......wwww#..S.....S....S.#',
    '#####...#####............#...............#',
    '##.........##....~~~~....#################',
    '##.bb......##.W........W.#################',
    '##.........##..$.........#################',
    '##.........##............#################',
    '##.......b.######6666#####################',
    '##....P..b.####........###################',
    '##.T.......####...X....###################',
    '###############........###################',
    '##########################################',
  ],
  triggers: {
    c: { hint: '[SPACE] jump.  The glowing rot burns. Jump over it.' },
    d: { hint: 'Jump at the ledge and keep holding [W] to climb up.  Low blocks: just run at them.' },
    g: {
      checkpoint: true,
      hint: '[SHIFT] dash.  Deep rot is deadly: jump, then dash in mid-air to clear it.  Nothing can touch you mid-dash.',
    },
    j: { checkpoint: true, hint: 'Something is moving behind that door.' },
    k: {
      hint: '[LEFT CLICK] shoot.  Aim for the head.  Hurting them up close heals you, so get in close.',
      goal: 'PURGE THE ROT',
      fight: {
        waves: [['husk', 'husk', 'husk'], ['husk', 'husk', 'husk', 'husk']],
        lock: [1], unlock: [2],
        hint: '[1] [2] or [WHEEL] swap to the scattergun.  It eats shells; creatures drop more.',
        goal: 'KEEP MOVING',
      },
    },
    n: {
      checkpoint: true,
      hint: '[C] slide.  Run, slide, then [SPACE] jump out of the slide: you keep the speed and fly further.',
    },
    o: { checkpoint: true },
    m: {
      hint: 'Spitters throw glowing bile.  [F] or [RIGHT CLICK] punch it right back at them.',
      goal: 'PURGE THE ROT',
      fight: {
        waves: [['spitter', 'spitter'], ['spitter', 'spitter', 'husk', 'husk', 'husk']],
        lock: [3], unlock: [4],
        hint: 'Punch a husk to knock it flying.  The way south is open.',
        goal: 'KEEP MOVING',
      },
    },
    q: {
      checkpoint: true,
      hint: 'Jump at a wall while running and hold [W] to WALL RUN.  [SPACE] jumps you to the other wall.',
    },
    s: {
      checkpoint: true,
      hint: 'Jump, then press [C] in mid-air to GROUND SLAM down on them.',
      goal: 'PURGE THE ROT',
      fight: {
        waves: [['husk', 'husk', 'husk', 'husk', 'husk'], ['husk', 'husk', 'husk', 'husk', 'spitter', 'spitter']],
        lock: [5], unlock: [],
        hint: 'Slam, then press [SPACE] the moment you land to SLAM JUMP.  Use it to get up the high wall to the west.',
        goal: 'CLIMB THE HIGH WALL',
      },
    },
    w: {
      hint: 'Everything you have learned.  Burn it all.',
      goal: 'PURGE THE ROT',
      fight: {
        waves: [
          ['husk', 'husk', 'husk', 'husk', 'husk', 'husk'],
          ['husk', 'husk', 'husk', 'husk', 'spitter', 'spitter', 'bloater'],
          ['husk', 'husk', 'husk', 'husk', 'husk', 'husk', 'spitter', 'spitter', 'spitter', 'bloater', 'bloater'],
        ],
        lock: [], unlock: [6],
        hint: 'The way out is open.  Get to the beacon!',
        goal: 'REACH THE EVAC BEACON',
      },
    },
  },
};
