import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../app/js/games/legpuzzel/logic.js';
import { IMAGE_IDS } from '../app/js/games/legpuzzel/images.js';
import { seededRandom } from '../app/js/core/util.js';

const IMG = { kind: 'thema', id: IMAGE_IDS[0], seed: 42 };
const round = (p) => p.map((v) => Math.round(v * 1e6) / 1e6).join(',');

/** Alle punten (controle- en eindpunten) van één kant van een stukje. */
function sidePoints(pattern, r, c, side) {
  const n = pattern.n;
  const len = { top: r > 0, right: c < n - 1, bottom: r < n - 1, left: c > 0 };
  const counts = ['top', 'right', 'bottom', 'left'].map((s) => (len[s] ? 6 : 1));
  const segs = L.pieceOutline(pattern, r, c);
  const idx = ['top', 'right', 'bottom', 'left'].indexOf(side);
  const start = counts.slice(0, idx).reduce((a, b) => a + b, 0);
  // Hoekpunten weglaten: bij omgekeerde richting is het begin- en eindpunt verwisseld.
  const isCorner = ([x, y]) => Math.abs(x - Math.round(x)) < 1e-9 && Math.abs(y - Math.round(y)) < 1e-9;
  return segs.slice(start, start + counts[idx]).flat().filter((p) => !isCorner(p)).map(round).sort();
}

test('snijpatroon is reproduceerbaar per seed', () => {
  assert.deepEqual(L.cutPattern(5, 123), L.cutPattern(5, 123));
  assert.notDeepEqual(L.cutPattern(5, 123), L.cutPattern(5, 124));
  const p = L.cutPattern(4, 1);
  assert.equal(p.h.length, 3);
  assert.equal(p.h[0].length, 4);
  assert.equal(p.v.length, 4);
  assert.equal(p.v[0].length, 3);
});

test('buurstukjes passen precies in elkaar (zelfde randlijn)', () => {
  for (const n of [3, 4, 5, 6]) {
    for (let seed = 1; seed <= 5; seed++) {
      const p = L.cutPattern(n, seed);
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (r < n - 1) assert.deepEqual(sidePoints(p, r, c, 'bottom'), sidePoints(p, r + 1, c, 'top'), `onder (${r},${c})`);
          if (c < n - 1) assert.deepEqual(sidePoints(p, r, c, 'right'), sidePoints(p, r, c + 1, 'left'), `rechts (${r},${c})`);
        }
      }
    }
  }
});

test('omtrek is gesloten en nopjes blijven binnen de marge', () => {
  for (const n of [3, 6]) {
    const p = L.cutPattern(n, 77);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const segs = L.pieceOutline(p, r, c);
        assert.deepEqual(segs[segs.length - 1][2].map((v) => Math.round(v * 1e9)), [c, r].map((v) => v * 1e9), 'eindigt waar hij begint');
        const b = L.outlineBounds(p, r, c);
        assert.ok(b.minX >= -L.MARGIN && b.minY >= -L.MARGIN && b.maxX <= 1 + L.MARGIN && b.maxY <= 1 + L.MARGIN, JSON.stringify(b));
        // randstukjes zijn recht aan de buitenkant
        if (r === 0) assert.ok(b.minY >= -1e-9);
        if (c === 0) assert.ok(b.minX >= -1e-9);
        if (r === n - 1) assert.ok(b.maxY <= 1 + 1e-9);
        if (c === n - 1) assert.ok(b.maxX <= 1 + 1e-9);
      }
    }
  }
});

test('elke binnenrand heeft een nopje dat ergens uitsteekt', () => {
  const p = L.cutPattern(4, 9);
  const b = L.outlineBounds(p, 1, 1); // middenstukje: vier binnenranden
  const out = [b.minX < -0.1, b.minY < -0.1, b.maxX > 1.1, b.maxY > 1.1].filter(Boolean).length;
  const n = [p.h[0][1].s === -1, p.v[1][0].s === -1, p.v[1][1].s === 1, p.h[1][1].s === 1].filter(Boolean).length;
  assert.equal(out, n, 'aantal naar buiten stekende nopjes klopt met het patroon');
});

test('piecePath is een geldig SVG-pad', () => {
  const p = L.cutPattern(3, 5);
  const d = L.piecePath(p, 1, 1);
  assert.match(d, /^M0 0 C/);
  assert.match(d, /Z$/);
  const nums = d.replace(/[MCZ]/g, ' ').trim().split(/\s+/).map(Number);
  assert.ok(nums.every(Number.isFinite));
  assert.equal(nums.length, 2 + 24 * 6, '4 binnenranden × 6 segmenten × 3 punten × 2 coördinaten');
});

test('nieuw spel: alle stukjes los, volgorde is een permutatie', () => {
  for (const level of L.LEVEL_IDS) {
    const s = L.newGame(level, IMG, seededRandom(3));
    const count = L.LEVELS[level].n ** 2;
    assert.equal(s.pieces.length, count);
    assert.deepEqual(s.order.slice().sort((a, b) => a - b), Array.from({ length: count }, (_, i) => i));
    assert.ok(s.pieces.every((p) => p.x === null && !p.placed));
    assert.ok(L.validateState(s, IMAGE_IDS));
  }
});

test('dropPiece: klikt vast als het dichtbij genoeg is, anders blijft het los liggen', () => {
  let s = L.newGame('makkelijk', IMG, seededRandom(4));
  const far = L.dropPiece(s, 0, L.SNAP + 0.01, { x: 0.4, y: 0.7 });
  assert.equal(far.snapped, false);
  assert.deepEqual(far.state.pieces[0], { x: 0.4, y: 0.7, placed: 0 });
  assert.equal(far.state.moves, 1);
  const near = L.dropPiece(far.state, 0, L.SNAP - 0.01, { x: 0.1, y: 0.1 });
  assert.equal(near.snapped, true);
  assert.deepEqual(near.state.pieces[0], { x: null, y: null, placed: 1 });
  // Vastgeklikt stukje beweegt niet meer.
  assert.equal(L.dropPiece(near.state, 0, 5, { x: 0.5, y: 0.5 }).state, near.state);
  s = near.state;
  for (let i = 1; i < 9; i++) {
    const res = L.dropPiece(s, i, 0, { x: 0, y: 0 });
    s = res.state;
    assert.equal(res.done, i === 8);
  }
  assert.equal(s.done, true);
  assert.equal(L.placedCount(s), 9);
  assert.ok(L.validateState(s, IMAGE_IDS));
});

test('posities worden begrensd tot het speelveld', () => {
  const s = L.newGame('makkelijk', IMG, seededRandom(5));
  const res = L.dropPiece(s, 2, 3, { x: -1, y: 7 });
  assert.deepEqual(res.state.pieces[2], { x: 0, y: 1, placed: 0 });
});

test('bringToFront zet een stukje bovenaan', () => {
  const s = L.newGame('normaal', IMG, seededRandom(6));
  const t = L.bringToFront(s, s.order[0]);
  assert.equal(t.order[t.order.length - 1], s.order[0]);
  assert.equal(t.order.length, s.order.length);
});

test('scatter en scatterPositions: binnen het vak, alleen losse stukjes zonder plek', () => {
  const rect = { x: 0.1, y: 0.6, w: 0.8, h: 0.35 };
  const spots = L.scatterPositions(16, rect, seededRandom(7));
  assert.equal(spots.length, 16);
  for (const p of spots) {
    assert.ok(p.x >= rect.x - 1e-9 && p.x <= rect.x + rect.w + 1e-9, `x ${p.x}`);
    assert.ok(p.y >= rect.y - 1e-9 && p.y <= rect.y + rect.h + 1e-9, `y ${p.y}`);
  }
  let s = L.newGame('normaal', IMG, seededRandom(8));
  s = L.dropPiece(s, 3, 0, { x: 0, y: 0 }).state;     // vast
  s = L.dropPiece(s, 4, 9, { x: 0.2, y: 0.2 }).state; // los met plek
  const t = L.scatter(s, () => ({ x: 0.5, y: 0.9 }));
  assert.equal(t.pieces[3].placed, 1);
  assert.deepEqual(t.pieces[4], { x: 0.2, y: 0.2, placed: 0 }, 'heeft al een plek');
  assert.deepEqual(t.pieces[0], { x: 0.5, y: 0.9, placed: 0 });
  const all = L.scatter(s, () => ({ x: 0.5, y: 0.9 }), true);
  assert.deepEqual(all.pieces[4], { x: 0.5, y: 0.9, placed: 0 }, 'opruimen verplaatst alle losse stukjes');
  assert.equal(all.pieces[3].placed, 1);
});

test('validateState weigert kapotte standen', () => {
  const s = L.dropPiece(L.newGame('normaal', IMG, seededRandom(9)), 1, 9, { x: 0.3, y: 0.3 }).state;
  assert.ok(L.validateState(s, IMAGE_IDS));
  assert.ok(L.validateState({ ...s, image: { kind: 'foto' } }, IMAGE_IDS));
  assert.ok(!L.validateState(null, IMAGE_IDS));
  assert.ok(!L.validateState({ ...s, n: 5 }, IMAGE_IDS));
  assert.ok(!L.validateState({ ...s, image: { kind: 'thema', id: 'bestaatniet', seed: 1 } }, IMAGE_IDS));
  assert.ok(!L.validateState({ ...s, pieces: s.pieces.slice(1) }, IMAGE_IDS));
  assert.ok(!L.validateState({ ...s, pieces: s.pieces.map((p, i) => (i === 0 ? { x: 2, y: 0, placed: 0 } : p)) }, IMAGE_IDS));
  assert.ok(!L.validateState({ ...s, pieces: s.pieces.map((p, i) => (i === 0 ? { x: 0.5, y: null, placed: 0 } : p)) }, IMAGE_IDS));
  assert.ok(!L.validateState({ ...s, pieces: s.pieces.map((p, i) => (i === 0 ? { x: 0.5, y: 0.5, placed: 1 } : p)) }, IMAGE_IDS));
  assert.ok(!L.validateState({ ...s, order: s.order.map(() => 0) }, IMAGE_IDS));
  assert.ok(!L.validateState({ ...s, done: true }, IMAGE_IDS), 'af terwijl er stukjes los liggen');
});

test('validPhoto: alleen kleine data-URL\'s van afbeeldingen', () => {
  assert.ok(L.validPhoto('data:image/jpeg;base64,/9j/4AAQSkZJRg=='));
  assert.ok(!L.validPhoto('https://example.com/foto.jpg'));
  assert.ok(!L.validPhoto('data:text/html;base64,PGh0bWw+'));
  assert.ok(!L.validPhoto('data:image/jpeg;base64,' + 'A'.repeat(L.MAX_PHOTO_LENGTH)));
  assert.ok(!L.validPhoto(null));
});
