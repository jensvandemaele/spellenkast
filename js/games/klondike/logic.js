// Klondike-solitaire (één kaart trekken). Puur: geen DOM. Functies muteren de meegegeven toestand.

export const SUITS = ['♠', '♥', '♦', '♣'];
export const SUIT_NAMES = ['schoppen', 'harten', 'ruiten', 'klaveren'];
export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'V', 'H'];
export const RANK_NAMES = ['', 'aas', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien', 'boer', 'vrouw', 'heer'];

export const isRed = (card) => card.s === 1 || card.s === 2;
export const cardName = (card) => `${SUIT_NAMES[card.s]} ${RANK_NAMES[card.r]}`;
export const cardId = (card) => `${card.s}-${card.r}`;

export function createDeck() {
  const deck = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) deck.push({ s, r, u: false });
  return deck;
}

export function deal(rng = Math.random) {
  const deck = createDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const tableau = [];
  for (let p = 0; p < 7; p++) {
    const pile = deck.splice(0, p + 1);
    pile[pile.length - 1].u = true;
    tableau.push(pile);
  }
  return { stock: deck, waste: [], foundations: [[], [], [], []], tableau, moves: 0, passes: 0, elapsedMs: 0, won: false };
}

/** Kaart van de stapel trekken; lege stapel = aflegstapel terugdraaien (onbeperkt). */
export function draw(state) {
  if (state.stock.length) {
    const c = state.stock.pop();
    c.u = true;
    state.waste.push(c);
  } else if (state.waste.length) {
    state.stock = state.waste.reverse().map((c) => ({ ...c, u: false }));
    state.waste = [];
    state.passes += 1;
  } else {
    return false;
  }
  state.moves += 1;
  return true;
}

export function canPlaceOnTableau(card, pile) {
  const top = pile[pile.length - 1];
  if (!top) return card.r === 13;
  return top.u && isRed(top) !== isRed(card) && top.r === card.r + 1;
}

export function canPlaceOnFoundation(card, foundation, suit) {
  return card.s === suit && foundation.length === card.r - 1;
}

/** Is de reeks vanaf index een geldige, open reeks (aflopend, kleuren om en om)? */
export function isMovableRun(pile, index) {
  if (index < 0 || index >= pile.length || !pile[index].u) return false;
  for (let i = index; i < pile.length - 1; i++) {
    const a = pile[i], b = pile[i + 1];
    if (!b.u || isRed(a) === isRed(b) || a.r !== b.r + 1) return false;
  }
  return true;
}

/**
 * Bron:  { pile: 'waste' } | { pile: 'tableau', index: 0-6, card: positie in de stapel } | { pile: 'foundation', index: 0-3 }
 * Doel:  { pile: 'tableau', index: 0-6 } | { pile: 'foundation', index: 0-3 }
 */
export function getCards(state, from) {
  if (from.pile === 'waste') return state.waste.length ? [state.waste[state.waste.length - 1]] : [];
  if (from.pile === 'foundation') { const f = state.foundations[from.index]; return f?.length ? [f[f.length - 1]] : []; }
  if (from.pile === 'tableau') {
    const p = state.tableau[from.index];
    if (!p || !isMovableRun(p, from.card)) return [];
    return p.slice(from.card);
  }
  return [];
}

export function canMove(state, from, to) {
  const cards = getCards(state, from);
  if (!cards.length) return false;
  if (from.pile === to.pile && from.index === to.index) return false;
  if (to.pile === 'foundation') {
    return cards.length === 1 && canPlaceOnFoundation(cards[0], state.foundations[to.index], to.index);
  }
  if (to.pile === 'tableau') {
    const dest = state.tableau[to.index];
    return !!dest && canPlaceOnTableau(cards[0], dest);
  }
  return false;
}

/** Voert een zet uit als die geldig is. Draait daarna de bovenste dichte kaart open. */
export function move(state, from, to) {
  if (!canMove(state, from, to)) return false;
  let cards;
  if (from.pile === 'waste') cards = [state.waste.pop()];
  else if (from.pile === 'foundation') cards = [state.foundations[from.index].pop()];
  else cards = state.tableau[from.index].splice(from.card);

  if (to.pile === 'foundation') state.foundations[to.index].push(cards[0]);
  else state.tableau[to.index].push(...cards);

  if (from.pile === 'tableau') {
    const p = state.tableau[from.index];
    if (p.length && !p[p.length - 1].u) p[p.length - 1].u = true;
  }
  state.moves += 1;
  state.won = state.foundations.every((f) => f.length === 13);
  return true;
}

/** Het beste doel voor een kaart bij dubbeltikken: eerst de aflegstapel, anders een tableaustapel. */
export function autoTarget(state, from, { foundationOnly = false } = {}) {
  const cards = getCards(state, from);
  if (!cards.length) return null;
  if (cards.length === 1 && from.pile !== 'foundation') {
    const to = { pile: 'foundation', index: cards[0].s };
    if (canMove(state, from, to)) return to;
  }
  if (foundationOnly) return null;
  // Liefst op een niet-lege stapel; een heer naar een lege stapel alleen als hij niet al bovenaan ligt.
  const order = [...state.tableau.keys()].sort((a, b) => (state.tableau[a].length ? 0 : 1) - (state.tableau[b].length ? 0 : 1));
  for (const i of order) {
    const to = { pile: 'tableau', index: i };
    if (from.pile === 'tableau' && from.card === 0 && !state.tableau[i].length) continue;
    if (canMove(state, from, to)) return to;
  }
  return null;
}

/** Kan het spel vanzelf worden afgemaakt? (alles open, stapel en aflegstapel leeg) */
export function canAutoComplete(state) {
  return !state.won && !state.stock.length && !state.waste.length && state.tableau.every((p) => p.every((c) => c.u));
}

/** Eén automatische stap naar de aflegstapels. Geeft de zet of null. */
export function autoStep(state) {
  let best = null;
  state.tableau.forEach((p, i) => {
    if (!p.length) return;
    const card = p[p.length - 1];
    const from = { pile: 'tableau', index: i, card: p.length - 1 };
    const to = { pile: 'foundation', index: card.s };
    if (canMove(state, from, to) && (!best || card.r < best.rank)) best = { from, to, rank: card.r };
  });
  if (!best) return null;
  move(state, best.from, best.to);
  return best;
}

// ---------- Compacte momentopnamen voor "ongedaan maken" ----------
const enc = (c) => c.s * 13 + (c.r - 1) + (c.u ? 100 : 0);
const dec = (n) => { const u = n >= 100; const v = u ? n - 100 : n; return { s: Math.floor(v / 13), r: (v % 13) + 1, u }; };

export function snapshot(state) {
  return { p: [state.stock, state.waste, ...state.foundations, ...state.tableau].map((pile) => pile.map(enc)), m: state.moves, ps: state.passes };
}

export function restore(snap, base) {
  const piles = snap.p.map((pile) => pile.map(dec));
  return {
    ...base,
    stock: piles[0], waste: piles[1], foundations: piles.slice(2, 6), tableau: piles.slice(6, 13),
    moves: snap.m, passes: snap.ps, won: false,
  };
}

export function validSnapshot(snap) {
  if (!snap || !Array.isArray(snap.p) || snap.p.length !== 13) return false;
  if (!snap.p.every((pile) => Array.isArray(pile) && pile.every((n) => Number.isInteger(n) && ((n >= 0 && n < 52) || (n >= 100 && n < 152))))) return false;
  return validateState(restore(snap, { elapsedMs: 0 }));
}

export function allCards(state) {
  return [...state.stock, ...state.waste, ...state.foundations.flat(), ...state.tableau.flat()];
}

export function validateState(s) {
  if (!s || typeof s !== 'object') return false;
  if (!Array.isArray(s.stock) || !Array.isArray(s.waste)) return false;
  if (!Array.isArray(s.foundations) || s.foundations.length !== 4 || !s.foundations.every(Array.isArray)) return false;
  if (!Array.isArray(s.tableau) || s.tableau.length !== 7 || !s.tableau.every(Array.isArray)) return false;
  for (const k of ['moves', 'passes']) if (!Number.isInteger(s[k]) || s[k] < 0) return false;
  if (!Number.isFinite(s.elapsedMs) || s.elapsedMs < 0 || typeof s.won !== 'boolean') return false;
  const cards = allCards(s);
  if (cards.length !== 52) return false;
  const seen = new Set();
  for (const c of cards) {
    if (!c || !Number.isInteger(c.s) || c.s < 0 || c.s > 3 || !Number.isInteger(c.r) || c.r < 1 || c.r > 13 || typeof c.u !== 'boolean') return false;
    seen.add(cardId(c));
  }
  if (seen.size !== 52) return false;
  // Aflegstapels moeten oplopend en per kleur kloppen.
  for (let i = 0; i < 4; i++) {
    if (!s.foundations[i].every((c, j) => c.s === i && c.r === j + 1)) return false;
  }
  return true;
}
