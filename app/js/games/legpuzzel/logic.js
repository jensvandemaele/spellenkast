// Legpuzzel: snijpatroon, stukjesvormen en regels. Puur: geen DOM, geen opslag.
//
// Coördinaten: één stukje is 1×1. Het bord loopt van (0,0) tot (n,n); stukje i staat op
// rij floor(i/n), kolom i%n. Losse stukjes hebben een positie (x, y) als fractie van het
// vrije speelveld (0..1), zodat ze bij draaien of een ander scherm binnen beeld blijven.
import { seededRandom } from '../../core/util.js';

export const LEVELS = {
  makkelijk: { naam: 'Makkelijk', n: 3 },
  normaal: { naam: 'Normaal', n: 4 },
  moeilijk: { naam: 'Moeilijk', n: 5 },
  expert: { naam: 'Expert', n: 6 },
};
export const LEVEL_IDS = Object.keys(LEVELS);

/** Hoe ver een nopje maximaal buiten het stukje steekt (als deel van de stukjesgrootte). */
export const MARGIN = 0.3;
/** Hoe dichtbij (als deel van de stukjesgrootte) een stukje moet liggen om vast te klikken. */
export const SNAP = 0.3;
export const MAX_PHOTO_LENGTH = 900_000;

/**
 * Snijpatroon: voor elke binnenrand de richting van het nopje (+1 / -1) en een kleine verschuiving.
 * h[r][c]: rand onder rij r (tussen rij r en r+1) in kolom c; +1 = nopje steekt naar beneden.
 * v[r][c]: rand rechts van kolom c (tussen c en c+1) in rij r; +1 = nopje steekt naar rechts.
 */
export function cutPattern(n, seed) {
  const rng = seededRandom(seed >>> 0);
  const edge = () => ({ s: rng() < 0.5 ? 1 : -1, j: (rng() - 0.5) * 0.1, w: 0.92 + rng() * 0.16 });
  const h = Array.from({ length: n - 1 }, () => Array.from({ length: n }, edge));
  const v = Array.from({ length: n }, () => Array.from({ length: n - 1 }, edge));
  return { n, h, v };
}

// Eén nopje langs een rand van t=0 tot t=1, als kubische bezier-segmenten [c1, c2, eind] met (t, uitsteek).
const TAB = [
  [[0.12, 0], [0.24, 0], [0.35, 0]],
  [[0.40, 0], [0.43, 0.05], [0.39, 0.11]],
  [[0.34, 0.20], [0.41, 0.27], [0.50, 0.27]],
  [[0.59, 0.27], [0.66, 0.20], [0.61, 0.11]],
  [[0.57, 0.05], [0.60, 0], [0.65, 0]],
  [[0.76, 0], [0.88, 0], [1, 0]],
];

/** Segmenten van punt A naar punt B (bordcoördinaten), met nopje in richting `normal` * e.s. */
function edgeSegments(ax, ay, bx, by, normal, e) {
  const dx = bx - ax, dy = by - ay;
  if (!e) return [[[ax + dx / 3, ay + dy / 3], [ax + (2 * dx) / 3, ay + (2 * dy) / 3], [bx, by]]];
  const [nx, ny] = normal;
  const map = ([t, o]) => {
    // Het nopje (midden rond t=0.5) schuift een beetje op en kan iets breder/smaller zijn.
    const isTab = o !== 0 || (t > 0.3 && t < 0.7);
    const tt = isTab ? 0.5 + (t - 0.5) * e.w + e.j : t;
    return [ax + dx * tt + nx * o * e.s, ay + dy * tt + ny * o * e.s];
  };
  return TAB.map((seg) => seg.map(map));
}

/** Keert segmenten om (zelfde lijn, andere richting). `start` = beginpunt van de originele lijn. */
function reverseSegments(segs, start) {
  const out = [];
  for (let k = segs.length - 1; k >= 0; k--) {
    const [c1, c2] = segs[k];
    const prevEnd = k > 0 ? segs[k - 1][2] : start;
    out.push([c2, c1, prevEnd]);
  }
  return out;
}

/** De omtrek van stukje (r, c) als lijst van segmenten in bordcoördinaten, met de klok mee vanaf linksboven. */
export function pieceOutline(pattern, r, c) {
  const { n, h, v } = pattern;
  const segs = [];
  // boven: van (c, r) naar (c+1, r); rand h[r-1][c], normaal omlaag (+1 = nopje van het stukje erboven steekt in dit stukje)
  segs.push(...edgeSegments(c, r, c + 1, r, [0, 1], r > 0 ? h[r - 1][c] : null));
  // rechts: van (c+1, r) naar (c+1, r+1); rand v[r][c], normaal naar rechts
  segs.push(...edgeSegments(c + 1, r, c + 1, r + 1, [1, 0], c < n - 1 ? v[r][c] : null));
  // onder: van (c+1, r+1) naar (c, r+1) = omgekeerd van de canonieke rand (c,r+1)→(c+1,r+1)
  segs.push(...reverseSegments(edgeSegments(c, r + 1, c + 1, r + 1, [0, 1], r < n - 1 ? h[r][c] : null), [c, r + 1]));
  // links: van (c, r+1) naar (c, r) = omgekeerd van (c,r)→(c,r+1)
  segs.push(...reverseSegments(edgeSegments(c, r, c, r + 1, [1, 0], c > 0 ? v[r][c - 1] : null), [c, r]));
  return segs;
}

/** SVG-padtekst voor stukje (r, c), in coördinaten t.o.v. de linkerbovenhoek van het stukje (0..1, nopjes tot ±MARGIN). */
export function piecePath(pattern, r, c) {
  const f = (x) => Math.round(x * 10000) / 10000;
  const segs = pieceOutline(pattern, r, c);
  let d = `M0 0`;
  for (const [c1, c2, p] of segs) {
    d += ` C${f(c1[0] - c)} ${f(c1[1] - r)} ${f(c2[0] - c)} ${f(c2[1] - r)} ${f(p[0] - c)} ${f(p[1] - r)}`;
  }
  return d + ' Z';
}

/** Begrenzing van alle punten van de omtrek t.o.v. het stukje (voor tests: nopjes blijven binnen MARGIN). */
export function outlineBounds(pattern, r, c) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const seg of pieceOutline(pattern, r, c)) {
    for (const [x, y] of seg) {
      minX = Math.min(minX, x - c); maxX = Math.max(maxX, x - c);
      minY = Math.min(minY, y - r); maxY = Math.max(maxY, y - r);
    }
  }
  return { minX, minY, maxX, maxY };
}

// ---------------- Spelverloop ----------------

export function newGame(level, image, rng = Math.random) {
  const lv = LEVELS[level];
  if (!lv) throw new Error('Onbekend niveau: ' + level);
  const count = lv.n * lv.n;
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    level,
    n: lv.n,
    image,                                 // { kind: 'thema', id, seed } of { kind: 'foto' }
    cutSeed: Math.floor(rng() * 2 ** 31),
    pieces: Array.from({ length: count }, () => ({ x: null, y: null, placed: 0 })),
    order,                                 // tekenvolgorde van losse stukjes (laatste = bovenop)
    moves: 0,
    elapsedMs: 0,
    done: false,
  };
}

export function placedCount(state) {
  return state.pieces.reduce((n, p) => n + p.placed, 0);
}

/** Zet een stukje bovenaan de stapel. */
export function bringToFront(state, i) {
  return { ...state, order: [...state.order.filter((k) => k !== i), i] };
}

/**
 * Laat stukje i los. `dist` = afstand (in stukjesgroottes) tussen de huidige plek en de juiste plek op het bord;
 * `pos` = nieuwe positie als fractie van het speelveld. Klikt vast als het dichtbij genoeg is.
 * Geeft { state, snapped, done } terug.
 */
export function dropPiece(state, i, dist, pos) {
  if (state.done || state.pieces[i].placed) return { state, snapped: false, done: state.done };
  const pieces = state.pieces.slice();
  const snapped = dist <= SNAP;
  pieces[i] = snapped ? { x: null, y: null, placed: 1 } : { x: clamp01(pos.x), y: clamp01(pos.y), placed: 0 };
  const done = snapped && pieces.every((p) => p.placed);
  return { state: { ...state, pieces, moves: state.moves + 1, done }, snapped, done };
}

/** Geeft losse stukjes zonder positie (of alle losse stukjes bij `all`) een nieuwe plek. */
export function scatter(state, positions, all = false) {
  const pieces = state.pieces.map((p, i) => {
    if (p.placed || (!all && p.x !== null)) return p;
    const pos = positions(i);
    return { ...p, x: clamp01(pos.x), y: clamp01(pos.y) };
  });
  return { ...state, pieces };
}

const clamp01 = (x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

/**
 * Plekken in een rechthoek (fracties), ongeveer op een raster met wat speling, in willekeurige volgorde.
 * rect = { x, y, w, h } als fracties van het speelveld.
 */
export function scatterPositions(count, rect, rng = Math.random) {
  const aspect = rect.w / Math.max(rect.h, 1e-6);
  const cols = Math.max(1, Math.round(Math.sqrt(count * aspect)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const slots = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) slots.push([r, c]);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots.slice(0, count).map(([r, c]) => ({
    x: clamp01(rect.x + ((c + 0.5 + (rng() - 0.5) * 0.5) / cols) * rect.w),
    y: clamp01(rect.y + ((r + 0.5 + (rng() - 0.5) * 0.5) / rows) * rect.h),
  }));
}

// ---------------- Controle van opgeslagen gegevens ----------------

export function validImageRef(img, imageIds) {
  if (!img || typeof img !== 'object') return false;
  if (img.kind === 'foto') return true;
  return img.kind === 'thema' && imageIds.includes(img.id) && Number.isInteger(img.seed) && img.seed >= 0;
}

export function validateState(s, imageIds) {
  if (!s || typeof s !== 'object') return false;
  const lv = LEVELS[s.level];
  if (!lv || s.n !== lv.n) return false;
  const count = lv.n * lv.n;
  if (!validImageRef(s.image, imageIds)) return false;
  if (!Number.isInteger(s.cutSeed) || s.cutSeed < 0) return false;
  if (!Array.isArray(s.pieces) || s.pieces.length !== count) return false;
  for (const p of s.pieces) {
    if (!p || typeof p !== 'object' || (p.placed !== 0 && p.placed !== 1)) return false;
    const okNum = (v) => v === null || (typeof v === 'number' && v >= 0 && v <= 1);
    if (!okNum(p.x) || !okNum(p.y) || ((p.x === null) !== (p.y === null))) return false;
    if (p.placed && p.x !== null) return false;
  }
  if (!Array.isArray(s.order) || s.order.length !== count) return false;
  const seen = new Set(s.order);
  if (seen.size !== count || !s.order.every((i) => Number.isInteger(i) && i >= 0 && i < count)) return false;
  if (!Number.isInteger(s.moves) || s.moves < 0) return false;
  if (!Number.isFinite(s.elapsedMs) || s.elapsedMs < 0) return false;
  if (typeof s.done !== 'boolean') return false;
  if (s.done !== s.pieces.every((p) => p.placed)) return false;
  return true;
}

export function validPhoto(data) {
  return typeof data === 'string' && data.length <= MAX_PHOTO_LENGTH && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data);
}
