// Spelregels van 2048. Puur: geen DOM, geen opslag. De random-functie wordt meegegeven (testbaar).

export const SIZE = 4;
export const WIN_VALUE = 2048;
export const DIRECTIONS = ['links', 'rechts', 'omhoog', 'omlaag'];

export function emptyGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

/**
 * Schuift één rij naar links en voegt gelijke buren samen.
 * Elke tegel voegt per zet hooguit één keer samen: [2,2,2,2] -> [4,4,0,0], [4,4,8,0] -> [8,8,0,0].
 */
export function slideLine(line) {
  const tiles = line.filter((v) => v !== 0);
  const out = [];
  const merged = [];
  let gained = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      const v = tiles[i] * 2;
      out.push(v);
      merged.push(out.length - 1);
      gained += v;
      i++; // de volgende tegel is opgegaan in deze
    } else {
      out.push(tiles[i]);
    }
  }
  while (out.length < line.length) out.push(0);
  return { line: out, gained, merged };
}

/** Coördinaten [rij, kolom] van lijn i, geordend in schuifrichting (index 0 = de kant waarheen geschoven wordt). */
function lineCoords(dir, i) {
  const idx = [0, 1, 2, 3];
  switch (dir) {
    case 'links': return idx.map((j) => [i, j]);
    case 'rechts': return idx.map((j) => [i, SIZE - 1 - j]);
    case 'omhoog': return idx.map((j) => [j, i]);
    case 'omlaag': return idx.map((j) => [SIZE - 1 - j, i]);
    default: throw new Error('Onbekende richting: ' + dir);
  }
}

/** Past een zet toe op een raster zonder nieuwe tegel. */
export function slideGrid(grid, dir) {
  const next = emptyGrid();
  let gained = 0;
  const merged = [];
  for (let i = 0; i < SIZE; i++) {
    const coords = lineCoords(dir, i);
    const res = slideLine(coords.map(([r, c]) => grid[r][c]));
    res.line.forEach((v, j) => { const [r, c] = coords[j]; next[r][c] = v; });
    gained += res.gained;
    for (const j of res.merged) merged.push(coords[j]);
  }
  const moved = next.some((row, r) => row.some((v, c) => v !== grid[r][c]));
  return { grid: next, gained, merged, moved };
}

export function emptyCells(grid) {
  const out = [];
  grid.forEach((row, r) => row.forEach((v, c) => { if (v === 0) out.push([r, c]); }));
  return out;
}

/** Plaatst een 2 (90%) of 4 (10%) op een willekeurig leeg vak. Muteert grid. */
export function addRandomTile(grid, rng = Math.random) {
  const empty = emptyCells(grid);
  if (!empty.length) return null;
  const [r, c] = empty[Math.floor(rng() * empty.length)];
  grid[r][c] = rng() < 0.9 ? 2 : 4;
  return [r, c];
}

export function canMove(grid) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = grid[r][c];
      if (v === 0) return true;
      if (c + 1 < SIZE && grid[r][c + 1] === v) return true;
      if (r + 1 < SIZE && grid[r + 1][c] === v) return true;
    }
  }
  return false;
}

export function maxTile(grid) {
  return Math.max(...grid.flat());
}

export function newGame(rng = Math.random) {
  const grid = emptyGrid();
  addRandomTile(grid, rng);
  addRandomTile(grid, rng);
  return { grid, score: 0, moves: 0, won: false, keepPlaying: false, over: false };
}

/**
 * Voert een zet uit. Een nieuwe tegel komt er alleen bij als de zet iets veranderde.
 * Geeft { state, moved, gained, merged, spawned, justWon } terug; de oude state blijft onaangeroerd.
 */
export function applyMove(state, dir, rng = Math.random) {
  if (state.over) return { state, moved: false, gained: 0, merged: [], spawned: null, justWon: false };
  const res = slideGrid(state.grid, dir);
  if (!res.moved) return { state, moved: false, gained: 0, merged: [], spawned: null, justWon: false };
  const grid = res.grid;
  const spawned = addRandomTile(grid, rng);
  const justWon = !state.won && maxTile(grid) >= WIN_VALUE;
  const next = {
    ...state,
    grid,
    score: state.score + res.gained,
    moves: state.moves + 1,
    won: state.won || justWon,
    over: !canMove(grid),
  };
  return { state: next, moved: true, gained: res.gained, merged: res.merged, spawned, justWon };
}

const isPow2 = (v) => v === 0 || (Number.isInteger(v) && v >= 2 && (v & (v - 1)) === 0);

export function validateState(s) {
  return !!s && typeof s === 'object'
    && Array.isArray(s.grid) && s.grid.length === SIZE
    && s.grid.every((row) => Array.isArray(row) && row.length === SIZE && row.every(isPow2))
    && Number.isInteger(s.score) && s.score >= 0
    && Number.isInteger(s.moves) && s.moves >= 0
    && typeof s.won === 'boolean' && typeof s.keepPlaying === 'boolean' && typeof s.over === 'boolean';
}
