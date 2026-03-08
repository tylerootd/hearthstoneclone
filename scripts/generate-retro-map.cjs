/**
 * Generates an 80x100 Tiled-compatible JSON map using the gigantic_pack tileset.
 *
 * gigantic_pack.png is 480x224 → 30 cols × 14 rows of 16×16 tiles (420 tiles).
 *
 * Tile IDs (1-indexed for Tiled):
 *   Row 0  (y=208 in Unity, top row in screen): tiles 1-30
 *   Row 1  (y=192): tiles 31-60
 *   ...
 *   Row 13 (y=0,  bottom row in screen): tiles 391-420
 *
 * We pick IDs by visual inspection of the asset:
 *   Grass:  1  (top-left, solid green)
 *   Dirt:   3
 *   Path:   5
 *   Wall (tree canopy): 61 (row 2)
 */

const fs = require('fs');
const path = require('path');

const W = 80, H = 100;
const GRASS = 1;
const GRASS2 = 2;
const DIRT = 3;
const PATH_TILE = 4;
const TREE = 31;
const WALL_TOP = 61;
const FENCE = 62;

function fill(val) { return new Array(W * H).fill(val); }

function idx(x, y) { return y * W + x; }

// Below Player: grass everywhere with some dirt patches
const below = fill(GRASS);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if ((x + y) % 7 === 0) below[idx(x, y)] = GRASS2;
  }
}

// Horizontal main road
for (let x = 0; x < W; x++) {
  for (let dy = -1; dy <= 1; dy++) {
    const ry = 50 + dy;
    if (ry >= 0 && ry < H) below[idx(x, ry)] = DIRT;
  }
}

// Vertical main road
for (let y = 0; y < H; y++) {
  for (let dx = -1; dx <= 1; dx++) {
    const rx = 40 + dx;
    if (rx >= 0 && rx < W) below[idx(rx, y)] = DIRT;
  }
}

// Town square around spawn (640/16=40, 800/16=50)
for (let y = 46; y <= 54; y++) {
  for (let x = 36; x <= 44; x++) {
    below[idx(x, y)] = PATH_TILE;
  }
}

// World layer: borders + trees + collision objects
const world = fill(0);

// Border walls
for (let x = 0; x < W; x++) {
  world[idx(x, 0)] = TREE;
  world[idx(x, 1)] = TREE;
  world[idx(x, H - 1)] = TREE;
  world[idx(x, H - 2)] = TREE;
}
for (let y = 0; y < H; y++) {
  world[idx(0, y)] = TREE;
  world[idx(1, y)] = TREE;
  world[idx(W - 1, y)] = TREE;
  world[idx(W - 2, y)] = TREE;
}

// Tree clusters
const treeClusters = [
  { cx: 15, cy: 20, r: 4 },
  { cx: 65, cy: 20, r: 3 },
  { cx: 15, cy: 75, r: 5 },
  { cx: 65, cy: 80, r: 4 },
  { cx: 10, cy: 50, r: 3 },
  { cx: 70, cy: 50, r: 3 },
  { cx: 40, cy: 10, r: 3 },
  { cx: 40, cy: 90, r: 4 },
];
for (const c of treeClusters) {
  for (let dy = -c.r; dy <= c.r; dy++) {
    for (let dx = -c.r; dx <= c.r; dx++) {
      if (dx * dx + dy * dy <= c.r * c.r) {
        const tx = c.cx + dx, ty = c.cy + dy;
        if (tx >= 2 && tx < W - 2 && ty >= 2 && ty < H - 2) {
          world[idx(tx, ty)] = TREE;
        }
      }
    }
  }
}

// Fence around town square
for (let x = 34; x <= 46; x++) {
  if (x < 38 || x > 42) {
    world[idx(x, 44)] = FENCE;
    world[idx(x, 56)] = FENCE;
  }
}
for (let y = 44; y <= 56; y++) {
  if (y < 48 || y > 52) {
    world[idx(34, y)] = FENCE;
    world[idx(46, y)] = FENCE;
  }
}

// Above Player: empty
const above = fill(0);

// Collision properties for border/tree/fence tiles
const tileProps = [];
for (let id = 0; id < 420; id++) {
  const collides = (id + 1 === TREE || id + 1 === WALL_TOP || id + 1 === FENCE);
  tileProps.push({
    id,
    properties: [{ name: 'collides', type: 'bool', value: collides }]
  });
}

const map = {
  height: H,
  width: W,
  infinite: false,
  layers: [
    { data: below, height: H, id: 1, name: 'Below Player', opacity: 1, type: 'tilelayer', visible: true, width: W, x: 0, y: 0 },
    { data: world, height: H, id: 2, name: 'World', opacity: 1, type: 'tilelayer', visible: true, width: W, x: 0, y: 0 },
    { data: above, height: H, id: 3, name: 'Above Player', opacity: 1, type: 'tilelayer', visible: true, width: W, x: 0, y: 0 },
    {
      draworder: 'topdown', id: 4, name: 'Objects', opacity: 1, type: 'objectgroup', visible: false, x: 0, y: 0,
      objects: [
        { height: 0, id: 1, name: 'Spawn Point', point: true, rotation: 0, type: '', visible: true, width: 0, x: 640, y: 800 }
      ]
    }
  ],
  nextlayerid: 5,
  nextobjectid: 2,
  orientation: 'orthogonal',
  renderorder: 'right-down',
  tiledversion: '1.10.2',
  tileheight: 16,
  tilesets: [{
    columns: 30,
    firstgid: 1,
    image: '../Super_Retro_Collection/Resources/Environments/TilePalette_updates/2.7.0/gigantic_pack.png',
    imageheight: 224,
    imagewidth: 480,
    margin: 0,
    name: 'gigantic_pack',
    spacing: 0,
    tilecount: 420,
    tileheight: 16,
    tilewidth: 16,
    tiles: tileProps
  }],
  tilewidth: 16,
  type: 'map',
  version: '1.10'
};

const outPath = path.join(__dirname, '..', 'public', 'maps', 'super-retro-town.json');
fs.writeFileSync(outPath, JSON.stringify(map));
console.log(`Wrote ${outPath} (${W}x${H}, ${W * H} tiles/layer)`);
