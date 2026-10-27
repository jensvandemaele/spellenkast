// Woordzoeker: puzzels maken en selecties controleren. Puur: geen DOM.
import { THEMES, wordsFor } from './words.js';
import { shuffle } from '../../core/util.js';

// [dr, dc]: rechts, omlaag, rechtsonder, rechtsboven, links, omhoog, linksboven, linksonder
export const DIRS = {
  E: [0, 1], S: [1, 0], SE: [1, 1], NE: [-1, 1], W: [0, -1], N: [-1, 0], NW: [-1, -1], SW: [1, -1],
};

export const LEVELS = {
  makkelijk: { naam: 'Makkelijk', size: 8, count: 6, min: 3, max: 7, dirs: ['E', 'S'] },
  normaal: { naam: 'Normaal', size: 10, count: 8, min: 3, max: 9, dirs: ['E', 'S', 'SE', 'NE'] },
  moeilijk: { naam: 'Moeilijk', size: 12, count: 10, min: 4, max: 12, dirs: ['E', 'S', 'SE', 'NE', 'W', 'N', 'NW', 'SW'] },
};

// Opvulletters met ongeveer Nederlandse letterfrequenties.
const FILL = 'EEEEEEEEENNNNNNAAAAAATTTTTIIIIIRRRRROOOOODDDDSSSSLLLGGGVVVHHKKKMMUUBBPPWWJJZZCFY';

/** Kiest woorden: geen dubbelen en geen woord dat binnen een ander woord ligt (bijv. AAP in SCHAAP). */
export function pickWords(themeId, level, rng = Math.random) {
  const lv = LEVELS[level];
  const pool = shuffle(wordsFor(themeId).filter((w) => w.length >= lv.min && w.length <= Math.min(lv.max, lv.size)), rng);
  const chosen = [];
  for (const w of pool) {
    if (chosen.length >= lv.count) break;
    if (chosen.some((c) => c.includes(w) || w.includes(c))) continue;
    chosen.push(w);
  }
  return chosen;
}

function tryPlace(grid, word, dirs, rng) {
  const n = grid.length;
  for (let attempt = 0; attempt < 300; attempt++) {
    const dir = dirs[Math.floor(rng() * dirs.length)];
    const [dr, dc] = DIRS[dir];
    const r0 = Math.floor(rng() * n);
    const c0 = Math.floor(rng() * n);
    const r1 = r0 + dr * (word.length - 1);
    const c1 = c0 + dc * (word.length - 1);
    if (r1 < 0 || r1 >= n || c1 < 0 || c1 >= n) continue;
    let ok = true;
    for (let i = 0; i < word.length; i++) {
      const ch = grid[r0 + dr * i][c0 + dc * i];
      if (ch && ch !== word[i]) { ok = false; break; }
    }
    if (!ok) continue;
    for (let i = 0; i < word.length; i++) grid[r0 + dr * i][c0 + dc * i] = word[i];
    return { r: r0, c: c0, dir };
  }
  return null;
}

/** Leest de letters van (r0,c0) naar (r1,c1). Geeft null als het geen rechte lijn is. */
export function readLine(grid, r0, c0, r1, c1) {
  const dr = Math.sign(r1 - r0), dc = Math.sign(c1 - c0);
  const lr = Math.abs(r1 - r0), lc = Math.abs(c1 - c0);
  if (lr && lc && lr !== lc) return null;
  const len = Math.max(lr, lc) + 1;
  let s = '';
  for (let i = 0; i < len; i++) {
    const row = grid[r0 + dr * i];
    const ch = row?.[c0 + dc * i];
    if (ch == null) return null;
    s += ch;
  }
  return s;
}

/** Hoe vaak komt het woord voor (alle 8 richtingen)? Voor controle van gegenereerde puzzels. */
export function countOccurrences(grid, word) {
  const n = grid.length;
  let count = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (grid[r][c] !== word[0]) continue;
      for (const [dr, dc] of Object.values(DIRS)) {
        let i = 1;
        while (i < word.length) {
          const rr = r + dr * i, cc = c + dc * i;
          if (rr < 0 || rr >= n || cc < 0 || cc >= n || grid[rr][cc] !== word[i]) break;
          i++;
        }
        if (i === word.length) count++;
      }
    }
  }
  // Palindromen worden in twee richtingen gevonden.
  const pal = word === [...word].reverse().join('');
  return pal ? count / 2 : count;
}

/**
 * Maakt een geldige puzzel: alle woorden staan in het rooster, precies één keer.
 * @returns {{theme, level, size, grid: string[], words: {word, r, c, dir}[]}}
 */
export function generate(themeId, level, rng = Math.random) {
  const lv = LEVELS[level];
  if (!lv || !THEMES[themeId]) throw new Error('Onbekend thema of niveau');
  for (let attempt = 0; attempt < 200; attempt++) {
    const words = pickWords(themeId, level, rng).sort((a, b) => b.length - a.length);
    if (words.length < Math.min(lv.count, 3)) throw new Error('Te weinig woorden in thema');
    const grid = Array.from({ length: lv.size }, () => Array(lv.size).fill(''));
    const placed = [];
    let failed = false;
    for (const w of words) {
      const p = tryPlace(grid, w, lv.dirs, rng);
      if (!p) { failed = true; break; }
      placed.push({ word: w, ...p });
    }
    if (failed) continue;
    for (let r = 0; r < lv.size; r++) {
      for (let c = 0; c < lv.size; c++) {
        if (!grid[r][c]) grid[r][c] = FILL[Math.floor(rng() * FILL.length)];
      }
    }
    if (!placed.every((p) => countOccurrences(grid, p.word) === 1)) continue;
    placed.sort((a, b) => a.word.localeCompare(b.word, 'nl'));
    return { theme: themeId, level, size: lv.size, grid: grid.map((row) => row.join('')), words: placed };
  }
  throw new Error('Kon geen puzzel maken');
}

export function wordCells(w) {
  const [dr, dc] = DIRS[w.dir];
  return Array.from({ length: w.word.length }, (_, i) => [w.r + dr * i, w.c + dc * i]);
}

export function newGame(themeId, level, rng = Math.random) {
  const p = generate(themeId, level, rng);
  return { ...p, found: [], elapsedMs: 0, done: false };
}

/**
 * Controleert een selectie van cel (r0,c0) naar (r1,c1).
 * Geeft de index van een (nog niet gevonden) woord dat hier staat, voor- of achterstevoren, of -1.
 */
export function checkSelection(state, r0, c0, r1, c1) {
  const s = readLine(state.grid, r0, c0, r1, c1);
  if (!s || s.length < 2) return -1;
  const rev = [...s].reverse().join('');
  return state.words.findIndex((w, i) => !state.found.includes(i) && (w.word === s || w.word === rev));
}

/** Registreert een vondst. Muteert state. Geeft true als de puzzel nu klaar is. */
export function markFound(state, index) {
  if (index < 0 || state.found.includes(index)) return state.done;
  state.found.push(index);
  state.done = state.found.length === state.words.length;
  return state.done;
}

export function validateState(s) {
  if (!s || typeof s !== 'object') return false;
  const lv = LEVELS[s.level];
  if (!lv || !THEMES[s.theme] || s.size !== lv.size) return false;
  if (!Array.isArray(s.grid) || s.grid.length !== s.size || !s.grid.every((row) => typeof row === 'string' && /^[A-Z]+$/.test(row) && row.length === s.size)) return false;
  if (!Array.isArray(s.words) || !s.words.length) return false;
  for (const w of s.words) {
    if (!w || typeof w.word !== 'string' || !DIRS[w.dir] || !Number.isInteger(w.r) || !Number.isInteger(w.c)) return false;
    const [dr, dc] = DIRS[w.dir];
    if (readLine(s.grid, w.r, w.c, w.r + dr * (w.word.length - 1), w.c + dc * (w.word.length - 1)) !== w.word) return false;
  }
  if (!Array.isArray(s.found) || !s.found.every((i) => Number.isInteger(i) && i >= 0 && i < s.words.length)) return false;
  if (new Set(s.found).size !== s.found.length) return false;
  if (!Number.isFinite(s.elapsedMs) || s.elapsedMs < 0 || typeof s.done !== 'boolean') return false;
  return true;
}
