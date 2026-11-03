// Mijnenveger: spelregels. Puur: geen DOM, geen opslag. De random-functie wordt meegegeven (testbaar).
//
// Het bord is een platte lijst van rows*cols vakjes; vak i staat op rij floor(i/cols), kolom i%cols.
// De mijnen worden pas gelegd bij de eerste tik, zodat die tik (en zijn buren) altijd veilig is.

export const LEVELS = {
  makkelijk: { naam: 'Makkelijk', rows: 9, cols: 9, mines: 10 },
  normaal: { naam: 'Normaal', rows: 12, cols: 12, mines: 24 },
  moeilijk: { naam: 'Moeilijk', rows: 16, cols: 16, mines: 40 },
};
export const LEVEL_IDS = Object.keys(LEVELS);

export function neighbors(i, rows, cols) {
  const r = Math.floor(i / cols), c = i % cols;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc);
    }
  }
  return out;
}

export function newGame(level = 'normaal') {
  const lv = LEVELS[level];
  if (!lv) throw new Error('Onbekend niveau: ' + level);
  const n = lv.rows * lv.cols;
  return {
    level,
    rows: lv.rows,
    cols: lv.cols,
    mineCount: lv.mines,
    mines: null,            // pas na de eerste tik: lijst met indexen
    open: Array(n).fill(0), // 1 = opengedraaid
    flags: Array(n).fill(0),// 1 = vlag
    status: 'bezig',        // 'bezig' | 'gewonnen' | 'verloren'
    exploded: -1,
    elapsedMs: 0,
    moves: 0,
  };
}

/** Legt de mijnen zo dat vak `safe` en zijn buren leeg blijven (als dat past). */
export function placeMines(rows, cols, count, safe, rng = Math.random) {
  const n = rows * cols;
  const forbidden = new Set([safe, ...neighbors(safe, rows, cols)]);
  // Bij een klein bord met veel mijnen: alleen het aangetikte vak vrijhouden.
  if (n - forbidden.size < count) {
    forbidden.clear();
    forbidden.add(safe);
  }
  const pool = [];
  for (let i = 0; i < n; i++) if (!forbidden.has(i)) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

export function mineSet(state) {
  return new Set(state.mines || []);
}

/** Aantal mijnen rond elk vak (alleen zinvol als de mijnen liggen). */
export function counts(state) {
  const { rows, cols } = state;
  const m = mineSet(state);
  const out = Array(rows * cols).fill(0);
  for (const i of m) for (const j of neighbors(i, rows, cols)) out[j]++;
  return out;
}

export function flagCount(state) {
  return state.flags.reduce((a, b) => a + b, 0);
}

/** Resterende mijnen volgens de speler (mijnen min vlaggen, kan negatief worden). */
export function minesLeft(state) {
  return state.mineCount - flagCount(state);
}

function checkWin(state) {
  const n = state.rows * state.cols;
  let opened = 0;
  for (let i = 0; i < n; i++) opened += state.open[i];
  return opened === n - state.mineCount;
}

/**
 * Draait vak i om. Een 0 opent ook alle buren (overstroming).
 * Geeft { state, opened: [indexen], exploded, won } terug; de oude state blijft onaangeroerd.
 */
export function reveal(state, i, rng = Math.random) {
  const none = { state, opened: [], exploded: false, won: false };
  if (state.status !== 'bezig' || state.open[i] || state.flags[i]) return none;
  const s = { ...state, open: state.open.slice(), flags: state.flags.slice() };
  if (!s.mines) s.mines = placeMines(s.rows, s.cols, s.mineCount, i, rng);
  const m = new Set(s.mines);
  s.moves = state.moves + 1;
  if (m.has(i)) {
    s.open[i] = 1;
    s.status = 'verloren';
    s.exploded = i;
    return { state: s, opened: [i], exploded: true, won: false };
  }
  const cnt = counts(s);
  const opened = floodOpen(s, cnt, [i]);
  const won = checkWin(s);
  if (won) finishWin(s);
  return { state: s, opened, exploded: false, won };
}

/** Opent de gegeven vakken en overstroomt vanaf nullen. Muteert s.open (en verwijdert vlaggen niet). */
function floodOpen(s, cnt, start) {
  const opened = [];
  const stack = start.slice();
  while (stack.length) {
    const j = stack.pop();
    if (s.open[j] || s.flags[j]) continue;
    s.open[j] = 1;
    opened.push(j);
    if (cnt[j] === 0) for (const k of neighbors(j, s.rows, s.cols)) if (!s.open[k] && !s.flags[k]) stack.push(k);
  }
  return opened;
}

function finishWin(s) {
  s.status = 'gewonnen';
  // Alle mijnen krijgen automatisch een vlag.
  for (const k of s.mines) s.flags[k] = 1;
}

/**
 * "Akkoord": tik op een open getal waarvan alle mijnen al gevlagd zijn → alle andere buren openen.
 * Een verkeerd geplaatste vlag kan hierdoor een mijn openen (zoals in het origineel).
 */
export function chord(state, i) {
  const none = { state, opened: [], exploded: false, won: false };
  if (state.status !== 'bezig' || !state.open[i] || !state.mines) return none;
  const cnt = counts(state);
  if (!cnt[i]) return none;
  const nb = neighbors(i, state.rows, state.cols);
  const flagged = nb.filter((k) => state.flags[k]).length;
  if (flagged !== cnt[i]) return none;
  const targets = nb.filter((k) => !state.open[k] && !state.flags[k]);
  if (!targets.length) return none;
  const s = { ...state, open: state.open.slice(), flags: state.flags.slice(), moves: state.moves + 1 };
  const m = new Set(s.mines);
  const hit = targets.find((k) => m.has(k));
  if (hit !== undefined) {
    for (const k of targets) s.open[k] = 1;
    s.status = 'verloren';
    s.exploded = hit;
    return { state: s, opened: targets, exploded: true, won: false };
  }
  const opened = floodOpen(s, cnt, targets);
  const won = checkWin(s);
  if (won) finishWin(s);
  return { state: s, opened, exploded: false, won };
}

/** Zet of haalt een vlag op een dicht vak. */
export function toggleFlag(state, i) {
  if (state.status !== 'bezig' || state.open[i]) return { state, changed: false };
  const flags = state.flags.slice();
  flags[i] = flags[i] ? 0 : 1;
  return { state: { ...state, flags }, changed: true };
}

/** Wat een tik op vak i doet: omdraaien, akkoord of niets. */
export function tap(state, i, rng = Math.random) {
  if (state.open[i]) return chord(state, i);
  return reveal(state, i, rng);
}

/** Vakken met een vlag waar geen mijn ligt (alleen tonen na verlies). */
export function wrongFlags(state) {
  const m = mineSet(state);
  const out = [];
  state.flags.forEach((f, i) => { if (f && !m.has(i)) out.push(i); });
  return out;
}

const bit = (x) => x === 0 || x === 1;

export function validateState(s) {
  if (!s || typeof s !== 'object') return false;
  const lv = LEVELS[s.level];
  if (!lv || s.rows !== lv.rows || s.cols !== lv.cols || s.mineCount !== lv.mines) return false;
  const n = lv.rows * lv.cols;
  if (!Array.isArray(s.open) || s.open.length !== n || !s.open.every(bit)) return false;
  if (!Array.isArray(s.flags) || s.flags.length !== n || !s.flags.every(bit)) return false;
  if (!['bezig', 'gewonnen', 'verloren'].includes(s.status)) return false;
  if (!Number.isInteger(s.exploded) || s.exploded < -1 || s.exploded >= n) return false;
  if (!Number.isFinite(s.elapsedMs) || s.elapsedMs < 0) return false;
  if (!Number.isInteger(s.moves) || s.moves < 0) return false;
  if (s.mines === null) {
    // Nog niet begonnen: niets open.
    return s.open.every((v) => v === 0) && s.status === 'bezig';
  }
  if (!Array.isArray(s.mines) || s.mines.length !== lv.mines) return false;
  const m = new Set(s.mines);
  if (m.size !== lv.mines || ![...m].every((i) => Number.isInteger(i) && i >= 0 && i < n)) return false;
  for (let i = 0; i < n; i++) {
    if (s.open[i] && s.flags[i]) return false;
    // Een open mijn kan alleen als het spel verloren is.
    if (s.open[i] && m.has(i) && s.status !== 'verloren') return false;
  }
  return true;
}
