import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, PREFIX } from '../app/js/core/storage.js';
import { createGameStore } from '../app/js/core/gamestore.js';
import { createSettings, DEFAULT_SETTINGS } from '../app/js/core/settings.js';
import { fakeStorage } from './fake-storage.mjs';

const opts = (extra = {}) => ({ version: 1, validate: (d) => typeof d?.n === 'number', fallback: () => 'LEEG', ...extra });

test('ontbrekend record geeft fallback', () => {
  const s = createStorage(fakeStorage());
  assert.equal(s.read('x', opts()), 'LEEG');
});

test('schrijven en lezen', () => {
  const s = createStorage(fakeStorage());
  assert.equal(s.write('x', 1, { n: 5 }), true);
  assert.deepEqual(s.read('x', opts()), { n: 5 });
});

test('beschadigde JSON: fallback, quarantaine, geen uitzondering', () => {
  const be = fakeStorage();
  be.setItem(PREFIX + 'x', '{kapot');
  const s = createStorage(be);
  assert.equal(s.read('x', opts()), 'LEEG');
  assert.equal(be.getItem(PREFIX + 'x'), null);
  assert.equal(be.getItem(PREFIX + 'x:kapot'), '{kapot');
  assert.equal(s.problems[0].kind, 'beschadigd');
});

test('verkeerde structuur en ongeldige gegevens worden opgevangen', () => {
  const be = fakeStorage();
  be.setItem(PREFIX + 'a', JSON.stringify([1, 2]));
  be.setItem(PREFIX + 'b', JSON.stringify({ v: 1, d: { n: 'tekst' } }));
  be.setItem(PREFIX + 'c', 'null');
  const s = createStorage(be);
  assert.equal(s.read('a', opts()), 'LEEG');
  assert.equal(s.read('b', opts()), 'LEEG');
  assert.equal(s.read('c', opts()), 'LEEG');
});

test('validatiefunctie die zelf crasht wordt als ongeldig behandeld', () => {
  const be = fakeStorage();
  const s = createStorage(be);
  s.write('x', 1, { n: 1 });
  assert.equal(s.read('x', opts({ validate: () => { throw new Error('boem'); } })), 'LEEG');
});

test('oud formaat wordt gemigreerd en teruggeschreven', () => {
  const be = fakeStorage();
  be.setItem(PREFIX + 'x', JSON.stringify({ v: 1, d: { getal: 3 } }));
  const s = createStorage(be);
  const out = s.read('x', { version: 2, migrate: (d, from) => (from === 1 ? { n: d.getal } : d), validate: (d) => typeof d.n === 'number' });
  assert.deepEqual(out, { n: 3 });
  assert.equal(JSON.parse(be.getItem(PREFIX + 'x')).v, 2);
});

test('mislukte migratie: fallback zonder crash', () => {
  const be = fakeStorage();
  be.setItem(PREFIX + 'x', JSON.stringify({ v: 1, d: {} }));
  const s = createStorage(be);
  assert.equal(s.read('x', { version: 2, fallback: () => 'LEEG' }), 'LEEG');
});

test('nieuwer formaat (van een latere app-versie) wordt bewaard, niet vernietigd', () => {
  const be = fakeStorage();
  const raw = JSON.stringify({ v: 9, d: { n: 1 } });
  be.setItem(PREFIX + 'x', raw);
  const s = createStorage(be);
  assert.equal(s.read('x', opts()), 'LEEG');
  assert.equal(be.getItem(PREFIX + 'x:nieuwer'), raw);
});

test('volle opslag: write geeft false en meldt probleem', () => {
  const s = createStorage(fakeStorage({ failWrites: true }));
  assert.equal(s.write('x', 1, { n: 1 }), false);
  assert.equal(s.problems[0].kind, 'schrijffout');
});

test('zonder localStorage werkt alles in het geheugen', () => {
  const s = createStorage(null);
  assert.equal(s.persistent, false);
  s.write('x', 1, { n: 2 });
  assert.deepEqual(s.read('x', opts()), { n: 2 });
});

test('reservekopie: exporteren en terugzetten', () => {
  const a = createStorage(fakeStorage());
  a.write('spel:2048:stats', 1, { beste: 100 });
  a.write('instellingen', 1, { geluid: false });
  const dump = JSON.parse(JSON.stringify(a.exportAll()));
  const b = createStorage(fakeStorage());
  assert.equal(b.importAll(dump), 2);
  assert.deepEqual(b.read('spel:2048:stats', { version: 1 }), { beste: 100 });
  assert.throws(() => b.importAll({ iets: 1 }));
});

test('gamestore: stand, statistieken en hervatten', () => {
  const s = createStorage(fakeStorage());
  const game = {
    id: 't',
    isFinished: (st) => st.klaar,
    storage: {
      stateVersion: 1, statsVersion: 1,
      validateState: (st) => typeof st?.klaar === 'boolean',
      defaultStats: () => ({ gespeeld: 0 }),
      validateStats: (st) => Number.isInteger(st?.gespeeld),
    },
  };
  const gs = createGameStore(s, game);
  assert.equal(gs.loadState(), null);
  assert.deepEqual(gs.loadStats(), { gespeeld: 0 });
  assert.equal(gs.hasResumable(), false);
  gs.saveState({ klaar: false });
  assert.equal(gs.hasResumable(), true);
  gs.saveState({ klaar: true });
  assert.equal(gs.hasResumable(), false);
  gs.clearState();
  assert.equal(gs.loadState(), null);
});

test('instellingen: standaardwaarden en ongeldige wijzigingen', () => {
  const be = fakeStorage();
  be.setItem(PREFIX + 'instellingen', JSON.stringify({ v: 1, d: { geluid: 'ja' } }));
  const settings = createSettings(createStorage(be));
  assert.deepEqual(settings.get(), DEFAULT_SETTINGS);
  assert.equal(settings.set({ animaties: 'soms' }), false);
  assert.equal(settings.set({ geluid: false }), true);
  assert.equal(createSettings(createStorage(be)).get().geluid, false);
});
