// Spelregels van Blokval (vallende blokken). Puur: geen DOM. Functies muteren de meegegeven toestand.

export const W = 10;
export const H = 20;
export const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// Vormen in hun basisstand: [rij, kolom] binnen een vierkant van n×n.
const SHAPES = {
  I: { n: 4, cells: [[1, 0], [1, 1], [1, 2], [1, 3]] },
  O: { n: 2, cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  T: { n: 3, cells: [[0, 1], [1, 0], [1, 1], [1, 2]] },
  S: { n: 3, cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
  Z: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
  J: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [1, 2]] },
  L: { n: 3, cells: [[0, 2], [1, 0], [1, 1], [1, 2]] },
};

// Voorberekende rotaties (rechtsom): [r, c] -> [c, n-1-r]
const ROTATIONS = {};
for (const [t, { n, cells }] of Object.entries(SHAPES)) {
  const rots = [cells];
  for (let i = 1; i < 4; i++) rots.push(rots[i - 1].map(([r, c]) => [c, n - 1 - r]));
  ROTATIONS[t] = rots;
}

export function cellsOf(piece) {
  return ROTATIONS[piece.type][piece.rot].map(([r, c]) => [piece.row + r, piece.col + c]);
}

export function emptyBoard() {
  return Array.from({ length: H }, () => Array(W).fill(''));
}

export function collides(board, piece) {
  for (const [r, c] of cellsOf(piece)) {
    if (c < 0 || c >= W || r >= H) return true;
    if (r >= 0 && board[r][c]) return true;
  }
  return false;
}

/** Zak van zeven: elke vorm komt eens per zeven blokken. */
export function refillQueue(state, rng) {
  while (state.queue.length < 7) {
    const bag = TYPES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    state.queue.push(...bag);
  }
}

export function spawnPiece(type) {
  const n = SHAPES[type].n;
  return { type, rot: 0, row: type === 'I' ? -1 : 0, col: Math.floor((W - n) / 2) };
}

export function levelFor(lines, startLevel = 1) {
  return startLevel + Math.floor(lines / 10);
}

/** Valsnelheid in milliseconden per rij. */
export function gravityMs(level) {
  const l = Math.min(level, 20);
  return Math.max(30, Math.round(1000 * Math.pow(0.8 - (l - 1) * 0.007, l - 1)));
}

export const LINE_POINTS = [0, 100, 300, 500, 800];

export function newGame(rng = Math.random) {
  const state = { board: emptyBoard(), piece: null, queue: [], score: 0, lines: 0, level: 1, pieces: 0, over: false };
  refillQueue(state, rng);
  spawnNext(state, rng);
  return state;
}

export function spawnNext(state, rng = Math.random) {
  const type = state.queue.shift();
  refillQueue(state, rng);
  state.piece = spawnPiece(type);
  if (collides(state.board, state.piece)) {
    state.over = true;
  }
  return !state.over;
}

export function move(state, dc) {
  if (state.over) return false;
  const p = { ...state.piece, col: state.piece.col + dc };
  if (collides(state.board, p)) return false;
  state.piece = p;
  return true;
}

const KICKS = [[0, 0], [0, -1], [0, 1], [-1, 0], [0, -2], [0, 2], [-1, -1], [-1, 1], [1, 0]];

/** Draait het blok (dir = 1 rechtsom, -1 linksom) met eenvoudige muurschoppen. */
export function rotate(state, dir = 1) {
  if (state.over || state.piece.type === 'O') return false;
  const rot = (state.piece.rot + (dir > 0 ? 1 : 3)) % 4;
  for (const [dr, dc] of KICKS) {
    const p = { ...state.piece, rot, row: state.piece.row + dr, col: state.piece.col + dc };
    if (!collides(state.board, p)) { state.piece = p; return true; }
  }
  return false;
}

export function isGrounded(state) {
  return collides(state.board, { ...state.piece, row: state.piece.row + 1 });
}

/** Eén rij omlaag door de zwaartekracht. */
export function fall(state) {
  if (state.over || isGrounded(state)) return false;
  state.piece = { ...state.piece, row: state.piece.row + 1 };
  return true;
}

/** Versneld vallen door de speler: 1 punt per rij. */
export function softDrop(state) {
  if (!fall(state)) return false;
  state.score += 1;
  return true;
}

export function ghostRow(state) {
  let p = state.piece;
  while (!collides(state.board, { ...p, row: p.row + 1 })) p = { ...p, row: p.row + 1 };
  return p.row;
}

/** Laat het blok in één keer vallen (2 punten per rij) en zet het vast. */
export function hardDrop(state, rng = Math.random) {
  if (state.over) return null;
  const target = ghostRow(state);
  const dist = target - state.piece.row;
  state.piece = { ...state.piece, row: target };
  state.score += dist * 2;
  return lock(state, rng);
}

/** Zet het blok vast, verwijdert volle rijen en laat het volgende blok verschijnen. */
export function lock(state, rng = Math.random) {
  const cells = cellsOf(state.piece);
  let above = true;
  for (const [r, c] of cells) {
    if (r >= 0) { state.board[r][c] = state.piece.type; above = false; }
  }
  state.pieces += 1;
  const full = [];
  for (let r = 0; r < H; r++) if (state.board[r].every((v) => v)) full.push(r);
  if (full.length) {
    state.board = state.board.filter((_, r) => !full.includes(r));
    while (state.board.length < H) state.board.unshift(Array(W).fill(''));
    state.score += LINE_POINTS[full.length] * state.level;
    state.lines += full.length;
    state.level = levelFor(state.lines);
  }
  if (above) { state.over = true; return { cleared: full.length, rows: full }; }
  spawnNext(state, rng);
  return { cleared: full.length, rows: full };
}

export function validateState(s) {
  if (!s || typeof s !== 'object') return false;
  if (!Array.isArray(s.board) || s.board.length !== H) return false;
  if (!s.board.every((row) => Array.isArray(row) && row.length === W && row.every((v) => v === '' || TYPES.includes(v)))) return false;
  if (!Array.isArray(s.queue) || s.queue.length < 1 || !s.queue.every((t) => TYPES.includes(t))) return false;
  for (const k of ['score', 'lines', 'level', 'pieces']) if (!Number.isInteger(s[k]) || s[k] < 0) return false;
  if (typeof s.over !== 'boolean') return false;
  const p = s.piece;
  if (!p || !TYPES.includes(p.type) || ![0, 1, 2, 3].includes(p.rot) || !Number.isInteger(p.row) || !Number.isInteger(p.col)) return false;
  if (!s.over && collides(s.board, p)) return false;
  return true;
}
