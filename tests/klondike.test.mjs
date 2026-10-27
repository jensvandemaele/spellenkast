import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../app/js/games/klondike/logic.js';
import { seededRandom } from '../app/js/core/util.js';

const C = (s, r, u = true) => ({ s, r, u });
// Kleuren: 0 ♠ zwart, 1 ♥ rood, 2 ♦ rood, 3 ♣ zwart

/** Bouwt een toestand met de opgegeven kaarten en zet alle overige kaarten in de trekstapel. */
function make({ tableau = [[], [], [], [], [], [], []], waste = [], foundations = [[], [], [], []] } = {}) {
  const used = new Set([...tableau.flat(), ...waste, ...foundations.flat()].map(L.cardId));
  const stock = L.createDeck().filter((c) => !used.has(L.cardId(c)));
  return { stock, waste, foundations, tableau, moves: 0, passes: 0, elapsedMs: 0, won: false };
}

test('delen: 52 unieke kaarten, 1..7 per stapel, alleen bovenste open, 24 in de trekstapel', () => {
  for (let seed = 0; seed < 20; seed++) {
    const s = L.deal(seededRandom(seed));
    assert.ok(L.validateState(s));
    assert.equal(s.stock.length, 24);
    s.tableau.forEach((p, i) => {
      assert.equal(p.length, i + 1);
      p.forEach((c, j) => assert.equal(c.u, j === p.length - 1));
    });
    assert.ok(s.stock.every((c) => !c.u));
  }
});

test('trekken: één kaart open naar de aflegstapel; lege stapel draait terug in dezelfde volgorde', () => {
  const s = L.deal(seededRandom(1));
  const order = s.stock.map(L.cardId).reverse();
  for (let i = 0; i < 24; i++) L.draw(s);
  assert.equal(s.stock.length, 0);
  assert.deepEqual(s.waste.map(L.cardId), order);
  assert.ok(s.waste.every((c) => c.u));
  L.draw(s);
  assert.equal(s.waste.length, 0);
  assert.equal(s.stock.length, 24);
  assert.ok(s.stock.every((c) => !c.u));
  assert.equal(s.passes, 1);
  L.draw(s);
  assert.equal(L.cardId(s.waste[0]), order[0], 'tweede ronde begint weer bij de eerste kaart');
});

test('tableau: aflopend en kleuren om en om', () => {
  assert.ok(L.canPlaceOnTableau(C(1, 9), [C(0, 10)]));   // rode 9 op zwarte 10
  assert.ok(!L.canPlaceOnTableau(C(3, 9), [C(0, 10)]));  // zwart op zwart
  assert.ok(!L.canPlaceOnTableau(C(1, 8), [C(0, 10)]));  // geen opvolger
  assert.ok(!L.canPlaceOnTableau(C(1, 9), [C(0, 10, false)])); // dichte kaart
});

test('lege stapel accepteert alleen een heer', () => {
  assert.ok(L.canPlaceOnTableau(C(2, 13), []));
  assert.ok(!L.canPlaceOnTableau(C(2, 12), []));
});

test('aflegstapel: per kleur oplopend vanaf aas', () => {
  assert.ok(L.canPlaceOnFoundation(C(1, 1), [], 1));
  assert.ok(!L.canPlaceOnFoundation(C(1, 2), [], 1));
  assert.ok(!L.canPlaceOnFoundation(C(2, 1), [], 1));
  assert.ok(L.canPlaceOnFoundation(C(1, 2), [C(1, 1)], 1));
});

test('reeks verplaatsen en dichte kaart daaronder draait open', () => {
  const s = make({
    tableau: [[C(3, 5, false), C(0, 10), C(1, 9), C(0, 8)], [C(2, 11)], [], [], [], [], []],
  });
  assert.ok(L.isMovableRun(s.tableau[0], 1));
  assert.ok(L.move(s, { pile: 'tableau', index: 0, card: 1 }, { pile: 'tableau', index: 1 }));
  assert.deepEqual(s.tableau[1].map((c) => c.r), [11, 10, 9, 8]);
  assert.equal(s.tableau[0].length, 1);
  assert.equal(s.tableau[0][0].u, true, 'dichte kaart is omgedraaid');
  assert.equal(s.moves, 1);
});

test('ongeldige zetten worden geweigerd en veranderen niets', () => {
  const s = make({ tableau: [[C(0, 10)], [C(3, 9)], [C(1, 5, false), C(1, 4)], [], [], [], []], waste: [C(2, 12)] });
  const before = JSON.stringify(s);
  assert.equal(L.move(s, { pile: 'tableau', index: 1, card: 0 }, { pile: 'tableau', index: 0 }), false); // zwart op zwart
  assert.equal(L.move(s, { pile: 'tableau', index: 2, card: 0 }, { pile: 'tableau', index: 3 }), false); // dichte kaart
  assert.equal(L.move(s, { pile: 'waste' }, { pile: 'tableau', index: 3 }), false); // vrouw op lege stapel
  assert.equal(L.move(s, { pile: 'tableau', index: 0, card: 0 }, { pile: 'foundation', index: 0 }), false);
  assert.equal(JSON.stringify(s), before);
});

test('reeks met fout erin is niet verplaatsbaar', () => {
  assert.equal(L.isMovableRun([C(0, 10), C(3, 9)], 0), false);
  assert.equal(L.isMovableRun([C(0, 10), C(1, 8)], 0), false);
});

test('van aflegstapel terug naar tableau mag', () => {
  const s = make({ tableau: [[C(1, 3)], [], [], [], [], [], []], foundations: [[C(0, 1), C(0, 2)], [], [], []] });
  assert.ok(L.move(s, { pile: 'foundation', index: 0 }, { pile: 'tableau', index: 0 }));
  assert.equal(s.foundations[0].length, 1);
});

test('winstdetectie en automatisch afmaken', () => {
  const tableau = [[], [], [], [], [], [], []];
  // Per kleur een stapel van heer naar aas is geen geldige tableaureeks, dus maak geldige reeksen met wisselende kleuren.
  // Vier kolommen: ♠H ♥V ♠B ♥10 ... en ♥H ♠V ... enz.
  const cols = [[0, 1], [1, 0], [3, 2], [2, 3]];
  cols.forEach(([a, b], i) => { for (let r = 13; r >= 1; r--) tableau[i].push(C((13 - r) % 2 === 0 ? a : b, r)); });
  const s = make({ tableau });
  assert.equal(s.stock.length, 0);
  assert.ok(L.validateState(s));
  assert.ok(L.canAutoComplete(s));
  let guard = 0;
  while (!s.won && L.autoStep(s) && guard++ < 100);
  assert.equal(s.won, true);
  assert.ok(s.foundations.every((f) => f.length === 13));
  assert.equal(L.canAutoComplete(s), false);
});

test('autoTarget kiest eerst de aflegstapel', () => {
  const s = make({ tableau: [[C(1, 1)], [C(0, 2)], [], [], [], [], []] });
  assert.deepEqual(L.autoTarget(s, { pile: 'tableau', index: 0, card: 0 }), { pile: 'foundation', index: 1 });
  const s2 = make({ tableau: [[C(1, 5)], [C(0, 6)], [], [], [], [], []] });
  assert.deepEqual(L.autoTarget(s2, { pile: 'tableau', index: 0, card: 0 }), { pile: 'tableau', index: 1 });
});

test('momentopname en terugzetten (ongedaan maken)', () => {
  const s = L.deal(seededRandom(4));
  const snap = L.snapshot(s);
  assert.ok(L.validSnapshot(JSON.parse(JSON.stringify(snap))));
  L.draw(s); L.draw(s);
  const back = L.restore(snap, { elapsedMs: 0 });
  assert.deepEqual(back.stock, L.deal(seededRandom(4)).stock);
  assert.equal(back.moves, 0);
  assert.equal(L.validSnapshot({ p: [[1, 1]], m: 0, ps: 0 }), false);
});

test('validateState: dubbele of ontbrekende kaarten worden afgewezen', () => {
  const s = L.deal(seededRandom(2));
  const dup = JSON.parse(JSON.stringify(s));
  dup.stock[0] = { ...dup.stock[1] };
  assert.equal(L.validateState(dup), false);
  const missing = JSON.parse(JSON.stringify(s));
  missing.stock.pop();
  assert.equal(L.validateState(missing), false);
});
