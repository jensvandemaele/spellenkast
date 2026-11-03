// Snoepwissel (match-3): spelregels. Puur: geen DOM, geen opslag. De random-functie wordt meegegeven (testbaar).
//
// Het bord is een platte lijst van SIZE*SIZE vakjes; vak i staat op rij floor(i/SIZE), kolom i%SIZE.
// Elk vakje bevat een snoepje { id, k, s }:
//   id  uniek nummer (voor animaties: zo weet het scherm welk snoepje waarheen valt)
//   k   kleur 0..colors-1, of -1 voor de kleurbom
//   s   '' gewoon, 'h' streep horizontaal (wist rij), 'v' streep verticaal (wist kolom),
//       'b' bom (wist 3×3), 'c' kleurbom (wist één hele kleur)

export const SIZE = 8;
export const N = SIZE * SIZE;
export const MAX_COLORS = 6;
export const POINTS_PER_CANDY = 20;
export const SPECIAL_BONUS = { h: 60, v: 60, b: 120, c: 200 };
export const COMBO_LIMIT = 30; // veiligheidsgrens voor kettingreacties

const rowOf = (i) => Math.floor(i / SIZE);
const colOf = (i) => i % SIZE;

/**
 * Moeilijkheid per niveau, geijkt met gesimuleerde spelers (zie tests/snoepwissel.test.mjs):
 * niveau 1–2 met 5 kleuren (veel kettingreacties), daarna 6 kleuren, minder zetten en een
 * hoger doel per zet, oplopend tot een plafond rond niveau 18 zodat het speelbaar blijft.
 */
export function levelConfig(level) {
  const n = Math.max(1, Math.floor(level));
  const moves = Math.max(18, 22 - Math.floor((n - 1) / 5));
  const perMove = n <= 2 ? 140 + (n - 1) * 30 : Math.min(200, 110 + (n - 3) * 6);
  return {
    moves,
    target: Math.round((moves * perMove) / 50) * 50,
    colors: n <= 2 ? 5 : 6,
  };
}

export function starsFor(score, target) {
  if (score >= target * 2) return 3;
  if (score >= target * 1.5) return 2;
  if (score >= target) return 1;
  return 0;
}

export function isAdjacent(a, b) {
  if (a < 0 || b < 0 || a >= N || b >= N) return false;
  const dr = Math.abs(rowOf(a) - rowOf(b));
  const dc = Math.abs(colOf(a) - colOf(b));
  return dr + dc === 1;
}

export function neighborIn(i, dir) {
  const r = rowOf(i), c = colOf(i);
  const [dr, dc] = { links: [0, -1], rechts: [0, 1], omhoog: [-1, 0], omlaag: [1, 0] }[dir] || [0, 0];
  const rr = r + dr, cc = c + dc;
  if ((!dr && !dc) || rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) return -1;
  return rr * SIZE + cc;
}

// ---------------- Matches zoeken ----------------

/** Alle rijen/kolommen van 3+ dezelfde kleur. Kleurbommen (k = -1) tellen niet mee. */
export function findRuns(grid) {
  const runs = [];
  for (let r = 0; r < SIZE; r++) {
    let start = 0;
    for (let c = 1; c <= SIZE; c++) {
      const prev = grid[r * SIZE + c - 1];
      const cur = c < SIZE ? grid[r * SIZE + c] : null;
      if (cur && prev && cur.k >= 0 && cur.k === prev.k) continue;
      if (c - start >= 3 && prev && prev.k >= 0) {
        runs.push({ dir: 'h', k: prev.k, cells: Array.from({ length: c - start }, (_, j) => r * SIZE + start + j) });
      }
      start = c;
    }
  }
  for (let c = 0; c < SIZE; c++) {
    let start = 0;
    for (let r = 1; r <= SIZE; r++) {
      const prev = grid[(r - 1) * SIZE + c];
      const cur = r < SIZE ? grid[r * SIZE + c] : null;
      if (cur && prev && cur.k >= 0 && cur.k === prev.k) continue;
      if (r - start >= 3 && prev && prev.k >= 0) {
        runs.push({ dir: 'v', k: prev.k, cells: Array.from({ length: r - start }, (_, j) => (start + j) * SIZE + c) });
      }
      start = r;
    }
  }
  return runs;
}

/** Voegt rijen samen die een vakje delen (L- en T-vormen) tot groepen. */
export function findGroups(grid) {
  const runs = findRuns(grid);
  const parent = runs.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const owner = new Map();
  runs.forEach((run, ri) => {
    for (const cell of run.cells) {
      if (owner.has(cell)) parent[find(ri)] = find(owner.get(cell));
      else owner.set(cell, ri);
    }
  });
  const byRoot = new Map();
  runs.forEach((run, ri) => {
    const root = find(ri);
    if (!byRoot.has(root)) byRoot.set(root, { k: run.k, runs: [], cells: new Set() });
    const g = byRoot.get(root);
    g.runs.push(run);
    run.cells.forEach((c) => g.cells.add(c));
  });
  return [...byRoot.values()].map((g) => ({ ...g, cells: [...g.cells].sort((a, b) => a - b) }));
}

/** Welk speciaal snoepje een groep oplevert, en waar. `prefer` = vakken waar de speler net wisselde. */
export function specialForGroup(group, prefer = []) {
  const longest = Math.max(...group.runs.map((r) => r.cells.length));
  const hasH = group.runs.some((r) => r.dir === 'h');
  const hasV = group.runs.some((r) => r.dir === 'v');
  let s = '';
  if (longest >= 5) s = 'c';
  else if (hasH && hasV) s = 'b';
  else if (longest === 4) s = group.runs[0].dir === 'h' ? 'h' : 'v';
  if (!s) return null;
  let at = prefer.find((p) => group.cells.includes(p));
  if (at === undefined) {
    if (s === 'b') {
      // Het kruispunt van de L/T.
      const counts = new Map();
      for (const r of group.runs) for (const c of r.cells) counts.set(c, (counts.get(c) || 0) + 1);
      at = [...counts.entries()].find(([, n]) => n > 1)?.[0];
    }
    if (at === undefined) {
      const run = group.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
      at = run.cells[Math.floor((run.cells.length - 1) / 2)];
    }
  }
  return { at, s, k: s === 'c' ? -1 : group.k };
}

// ---------------- Bord maken ----------------

export function randomCandy(colors, rng, id) {
  return { id, k: Math.floor(rng() * colors), s: '' };
}

/** Nieuw bord zonder kant-en-klare rijtjes en met minstens één mogelijke zet. */
export function newBoard(colors, rng = Math.random, startId = 1) {
  for (let attempt = 0; attempt < 200; attempt++) {
    let id = startId;
    const grid = Array(N).fill(null);
    for (let i = 0; i < N; i++) {
      const r = rowOf(i), c = colOf(i);
      const banned = new Set();
      if (c >= 2 && grid[i - 1].k === grid[i - 2].k) banned.add(grid[i - 1].k);
      if (r >= 2 && grid[i - SIZE].k === grid[i - 2 * SIZE].k) banned.add(grid[i - SIZE].k);
      let k;
      do { k = Math.floor(rng() * colors); } while (banned.has(k));
      grid[i] = { id: id++, k, s: '' };
    }
    if (hasMove(grid)) return { grid, nextId: id };
  }
  throw new Error('Kon geen speelbaar bord maken');
}

export function newGame(level = 1, rng = Math.random) {
  const cfg = levelConfig(level);
  const { grid, nextId } = newBoard(cfg.colors, rng);
  return {
    level, grid, nextId,
    colors: cfg.colors,
    target: cfg.target,
    movesLeft: cfg.moves,
    moves: 0,
    score: 0,
    status: 'bezig', // 'bezig' | 'gehaald' | 'mislukt'
  };
}

// ---------------- Zetten controleren ----------------

function swapped(grid, a, b) {
  const g = grid.slice();
  [g[a], g[b]] = [g[b], g[a]];
  return g;
}

/** Levert deze wissel iets op? (een rijtje, een kleurbom, of twee speciale snoepjes) */
export function isValidSwap(grid, a, b) {
  if (!isAdjacent(a, b) || !grid[a] || !grid[b]) return false;
  const A = grid[a], B = grid[b];
  if (A.s === 'c' || B.s === 'c') return true;
  if (A.s && B.s) return true;
  const g = swapped(grid, a, b);
  return findRuns(g).some((run) => run.cells.includes(a) || run.cells.includes(b));
}

/** Alle geldige wissels [a, b] met a < b. */
export function validMoves(grid) {
  const out = [];
  for (let i = 0; i < N; i++) {
    if (colOf(i) < SIZE - 1 && isValidSwap(grid, i, i + 1)) out.push([i, i + 1]);
    if (rowOf(i) < SIZE - 1 && isValidSwap(grid, i, i + SIZE)) out.push([i, i + SIZE]);
  }
  return out;
}

export function hasMove(grid) {
  for (let i = 0; i < N; i++) {
    if (colOf(i) < SIZE - 1 && isValidSwap(grid, i, i + 1)) return true;
    if (rowOf(i) < SIZE - 1 && isValidSwap(grid, i, i + SIZE)) return true;
  }
  return false;
}

/** Een tip: bij voorkeur een zet die een speciaal snoepje gebruikt of maakt, anders de eerste. */
export function findHint(grid) {
  const moves = validMoves(grid);
  if (!moves.length) return null;
  let best = moves[0], bestScore = -1;
  for (const [a, b] of moves) {
    let sc = 0;
    if (grid[a].s || grid[b].s) sc = 10;
    else {
      const g = swapped(grid, a, b);
      for (const grp of findGroups(g)) if (grp.cells.includes(a) || grp.cells.includes(b)) sc = Math.max(sc, grp.cells.length);
    }
    if (sc > bestScore) { bestScore = sc; best = [a, b]; }
  }
  return best;
}

// ---------------- Wissen en vallen ----------------

function mostCommonColor(grid, rng) {
  const count = new Map();
  for (const c of grid) if (c && c.k >= 0) count.set(c.k, (count.get(c.k) || 0) + 1);
  const max = Math.max(0, ...count.values());
  const tops = [...count.keys()].filter((k) => count.get(k) === max);
  return tops.length ? tops[Math.floor(rng() * tops.length)] : -1;
}

function areaCells(center, radius) {
  const r0 = rowOf(center), c0 = colOf(center);
  const out = [];
  for (let r = r0 - radius; r <= r0 + radius; r++) {
    for (let c = c0 - radius; c <= c0 + radius; c++) {
      if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) out.push(r * SIZE + c);
    }
  }
  return out;
}
const rowCells = (i) => Array.from({ length: SIZE }, (_, c) => rowOf(i) * SIZE + c);
const colCells = (i) => Array.from({ length: SIZE }, (_, r) => r * SIZE + colOf(i));

/**
 * Breidt een set te wissen vakken uit met de effecten van speciale snoepjes die erin zitten
 * (die op hun beurt weer andere speciale snoepjes kunnen raken). `fired` = al afgegane vakken.
 * Geeft de lijst met effecten terug (voor de animatie).
 */
function expand(grid, clear, fired, rng) {
  const effects = [];
  const queue = [...clear];
  while (queue.length) {
    const i = queue.shift();
    const c = grid[i];
    if (!c || !c.s || fired.has(i)) continue;
    fired.add(i);
    let hit = [];
    if (c.s === 'h') hit = rowCells(i);
    else if (c.s === 'v') hit = colCells(i);
    else if (c.s === 'b') hit = areaCells(i, 1);
    else if (c.s === 'c') {
      const k = mostCommonColor(grid, rng);
      hit = grid.map((x, j) => (x && x.k === k ? j : -1)).filter((j) => j >= 0);
    }
    effects.push({ at: i, s: c.s, cells: hit });
    for (const j of hit) {
      if (!clear.has(j)) { clear.add(j); queue.push(j); }
    }
  }
  return effects;
}

/** Laat snoepjes vallen en vult van boven aan. Muteert grid. */
function gravity(grid, colors, rng, state) {
  const moves = [];
  const spawns = [];
  for (let c = 0; c < SIZE; c++) {
    let write = SIZE - 1;
    for (let r = SIZE - 1; r >= 0; r--) {
      const i = r * SIZE + c;
      if (grid[i]) {
        const to = write * SIZE + c;
        if (to !== i) { grid[to] = grid[i]; grid[i] = null; moves.push({ id: grid[to].id, from: i, to }); }
        write--;
      }
    }
    const empty = write + 1;
    for (let r = write; r >= 0; r--) {
      const i = r * SIZE + c;
      grid[i] = randomCandy(colors, rng, state.nextId++);
      spawns.push({ ...grid[i], i, fromRow: r - empty });
    }
  }
  return { moves, spawns };
}

/**
 * Lost het bord op tot er niets meer valt. `initial` = vakken die meteen gewist moeten worden
 * (bij combinaties van speciale snoepjes), `prefer` = gewisselde vakken (plek voor nieuw speciaal snoepje).
 * Geeft de fasen terug, elk { cleared, effects, created, moves, spawns, points, combo }.
 */
function resolve(grid, colors, rng, counter, { initial = null, fired = new Set(), prefer = [] } = {}) {
  const phases = [];
  let pending = initial;
  let combo = 0;
  while (combo < COMBO_LIMIT) {
    const groups = findGroups(grid);
    if (!groups.length && !pending) break;
    combo++;
    const clear = new Set(pending || []);
    const created = [];
    for (const g of groups) {
      g.cells.forEach((c) => clear.add(c));
      const sp = specialForGroup(g, combo === 1 ? prefer : []);
      if (sp) created.push(sp);
    }
    const effects = expand(grid, clear, fired, rng);
    const cleared = [...clear].filter((i) => grid[i]).map((i) => ({ i, id: grid[i].id, k: grid[i].k, s: grid[i].s }));
    let points = cleared.length * POINTS_PER_CANDY * combo;
    for (const i of clear) grid[i] = null;
    const placed = [];
    for (const sp of created) {
      const candy = { id: counter.nextId++, k: sp.k, s: sp.s };
      grid[sp.at] = candy;
      placed.push({ ...candy, i: sp.at });
      points += SPECIAL_BONUS[sp.s];
    }
    const { moves, spawns } = gravity(grid, colors, rng, counter);
    phases.push({ cleared, effects, created: placed, moves, spawns, points, combo });
    pending = null;
    fired = new Set();
  }
  return phases;
}

/** Wat er gebeurt als twee speciale snoepjes (of een kleurbom) gewisseld worden. Muteert grid (omzettingen). */
function comboClear(grid, a, b, rng, fired) {
  const A = grid[a], B = grid[b]; // na de wissel: A staat nu op a, B op b
  const clear = new Set([a, b]);
  if (A.s === 'c' && B.s === 'c') {
    for (let i = 0; i < N; i++) clear.add(i);
    fired.add(a); fired.add(b);
    return { clear, kind: 'alles' };
  }
  if (A.s === 'c' || B.s === 'c') {
    const bombAt = A.s === 'c' ? a : b;
    const other = A.s === 'c' ? B : A;
    fired.add(bombAt);
    const k = other.k;
    const targets = grid.map((x, j) => (x && x.k === k ? j : -1)).filter((j) => j >= 0);
    if (other.s === 'h' || other.s === 'v' || other.s === 'b') {
      // Alle snoepjes van die kleur worden ook speciaal en gaan af.
      for (const j of targets) {
        const s = other.s === 'b' ? 'b' : (rng() < 0.5 ? 'h' : 'v');
        grid[j] = { ...grid[j], s };
      }
    }
    targets.forEach((j) => clear.add(j));
    return { clear, kind: other.s ? 'kleur-speciaal' : 'kleur' };
  }
  // Twee speciale snoepjes (geen kleurbom).
  fired.add(a); fired.add(b);
  const pair = [A.s, B.s].sort().join('');
  let cells;
  if (pair === 'bb') cells = areaCells(b, 2);
  else if (pair === 'bh' || pair === 'bv') {
    cells = [];
    for (let d = -1; d <= 1; d++) {
      const r = rowOf(b) + d, c = colOf(b) + d;
      if (r >= 0 && r < SIZE) cells.push(...rowCells(r * SIZE));
      if (c >= 0 && c < SIZE) cells.push(...colCells(c));
    }
  } else cells = [...rowCells(b), ...colCells(b)]; // streep + streep
  cells.forEach((j) => clear.add(j));
  return { clear, kind: 'combinatie' };
}

/** Herschikt het bord (zelfde snoepjes) tot er geen rijtjes zijn en wel een zet. */
export function shuffleBoard(grid, rng = Math.random) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const order = grid.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (!findRuns(order).length && hasMove(order)) return order;
  }
  return null;
}

/**
 * Voert een wissel uit van vak a naar vak b.
 * Geeft { ok, state, phases, shuffled, combo } terug; bij een ongeldige wissel blijft state ongewijzigd.
 */
export function applySwap(state, a, b, rng = Math.random) {
  if (state.status !== 'bezig' || state.movesLeft <= 0 || !isValidSwap(state.grid, a, b)) {
    return { ok: false, state, phases: [], shuffled: null, combo: null };
  }
  const grid = swapped(state.grid, a, b);
  const counter = { nextId: state.nextId };
  const fired = new Set();
  let initial = null;
  let combo = null;
  const A = grid[a], B = grid[b];
  if (A.s === 'c' || B.s === 'c' || (A.s && B.s)) {
    const res = comboClear(grid, a, b, rng, fired);
    initial = res.clear;
    combo = res.kind;
  }
  const phases = resolve(grid, state.colors, rng, counter, { initial, fired, prefer: [b, a] });
  let shuffled = null;
  let finalGrid = grid;
  if (!hasMove(grid)) {
    const sh = shuffleBoard(grid, rng);
    if (sh) finalGrid = sh;
    else {
      const fresh = newBoard(state.colors, rng, counter.nextId);
      finalGrid = fresh.grid;
      counter.nextId = fresh.nextId;
    }
    shuffled = finalGrid;
  }
  const gained = phases.reduce((n, p) => n + p.points, 0);
  const score = state.score + gained;
  const movesLeft = state.movesLeft - 1;
  let status = 'bezig';
  if (movesLeft === 0) status = score >= state.target ? 'gehaald' : 'mislukt';
  const next = { ...state, grid: finalGrid, nextId: counter.nextId, score, movesLeft, moves: state.moves + 1, status };
  return { ok: true, state: next, phases, shuffled, combo, gained };
}

// ---------------- Controle van opgeslagen gegevens ----------------

function validCandy(c, colors) {
  return !!c && typeof c === 'object'
    && Number.isInteger(c.id) && c.id > 0
    && ['', 'h', 'v', 'b', 'c'].includes(c.s)
    && (c.s === 'c' ? c.k === -1 : Number.isInteger(c.k) && c.k >= 0 && c.k < colors);
}

export function validateState(s) {
  if (!s || typeof s !== 'object') return false;
  if (!Number.isInteger(s.level) || s.level < 1 || s.level > 9999) return false;
  if (!Number.isInteger(s.colors) || s.colors < 3 || s.colors > MAX_COLORS) return false;
  if (!Array.isArray(s.grid) || s.grid.length !== N || !s.grid.every((c) => validCandy(c, s.colors))) return false;
  const ids = new Set(s.grid.map((c) => c.id));
  if (ids.size !== N) return false;
  if (!Number.isInteger(s.nextId) || s.nextId <= Math.max(...ids)) return false;
  if (![s.target, s.movesLeft, s.moves, s.score].every((x) => Number.isInteger(x) && x >= 0)) return false;
  if (!['bezig', 'gehaald', 'mislukt'].includes(s.status)) return false;
  if (s.status === 'bezig' && s.movesLeft === 0) return false;
  return true;
}
