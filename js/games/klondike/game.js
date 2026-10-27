// Klondike-solitaire: scherm, slepen, tikken en ongedaan maken. Spelregels staan in logic.js.
import * as L from './logic.js';
import { el, formatTime, isNonNegInt } from '../../core/util.js';

const MAX_UNDO = 100;
const DRAG_THRESHOLD = 6;

const game = {
  id: 'klondike',
  name: 'Klondike',
  short: 'Het klassieke patiencespel: leg alle kaarten op volgorde per kleur.',
  accent: 'var(--kleur-klondike)',
  icon: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="9" width="22" height="30" rx="3.5" fill="currentColor" opacity=".35" transform="rotate(-10 18 24)"/><rect x="19" y="8" width="22" height="30" rx="3.5" fill="var(--kaart-bg)" stroke="currentColor" stroke-width="2.5"/><text x="30" y="29" font-size="15" text-anchor="middle" fill="currentColor" font-family="system-ui">♠</text></svg>`,
  help: `<p><strong>Doel:</strong> leg alle 52 kaarten op de vier aflegstapels rechtsboven, per kleur oplopend van aas tot heer.</p>
    <p><strong>Speelstapels:</strong> leg kaarten aflopend en om en om rood/zwart (bijv. rode 9 op zwarte 10). Je mag een open reeks in één keer verplaatsen. Op een lege stapel past alleen een heer (met eventueel zijn reeks). Ligt er een dichte kaart bovenop, dan draait die vanzelf om.</p>
    <p><strong>Trekstapel:</strong> tik linksboven om één kaart te trekken. Is de stapel leeg, tik dan nog eens om de getrokken kaarten terug te leggen (onbeperkt).</p>
    <p><strong>Bediening:</strong> sleep kaarten, of tik op een kaart en daarna op de plek waar hij heen moet. Tik nog eens op een geselecteerde kaart (of dubbelklik) om hem automatisch te verplaatsen. Met het toetsenbord: Tab en Enter. Ctrl/⌘+Z maakt ongedaan.</p>
    <p>Zijn alle kaarten open en is de trekstapel leeg, dan kun je het spel automatisch laten afmaken.</p>`,

  storage: {
    stateVersion: 1,
    statsVersion: 1,
    validateState: (s) => L.validateState(s) && Array.isArray(s.undo) && s.undo.length <= MAX_UNDO && s.undo.every(L.validSnapshot),
    defaultStats: () => ({ gespeeld: 0, gewonnen: 0, besteTijd: 0, minsteZetten: 0 }),
    validateStats: (s) => !!s && ['gespeeld', 'gewonnen', 'besteTijd', 'minsteZetten'].every((k) => isNonNegInt(s[k])),
  },

  isFinished: (s) => s.won,
  isInProgress: (s) => !!s && !s.won && s.moves > 0,
  statLine: (st) => (st.gespeeld ? `${st.gewonnen} van ${st.gespeeld} gewonnen${st.besteTijd ? ` · snelste ${formatTime(st.besteTijd)}` : ''}` : 'Nog niet gespeeld'),

  mount(ctx, { fresh }) {
    const { store, sound } = ctx;
    let stats = store.loadStats();
    let state = fresh ? null : store.loadState();
    if (!state || state.won) state = startNew();
    let selected = null; // bron-descriptor
    let autoRunning = false;

    function startNew() {
      const s = { ...L.deal(), undo: [] };
      stats = { ...stats, gespeeld: stats.gespeeld + 1 };
      store.saveStats(stats);
      store.saveState(s);
      return s;
    }

    // ---------- DOM ----------
    const movesEl = el('output.waarde');
    const timeEl = el('output.waarde');
    const undoBtn = el('button.knop.klein', { type: 'button', onclick: () => undo() }, '↶ Ongedaan');
    const autoBtn = el('button.knop.klein.primair', { type: 'button', hidden: true, onclick: () => autoComplete() }, 'Afmaken');
    const table = el('div.kl-tafel.geen-scroll');
    const live = el('p.sr-only', { 'aria-live': 'polite' });
    const root = el('div.spel.spel-klondike',
      el('div.kl-balk',
        el('div.scorevak', el('span.label', {}, 'Zetten'), movesEl),
        el('div.scorevak', el('span.label', {}, 'Tijd'), timeEl),
        el('div.kl-balk-knoppen', autoBtn, undoBtn)),
      table, live);
    ctx.root.append(root);

    // Stapels (vaste elementen); kaarten worden bij elke weergave opnieuw opgebouwd.
    const stockEl = el('div.kl-stapel.kl-trek', { role: 'button', tabindex: '0', 'aria-label': 'Trekstapel', dataset: { pile: 'stock' } });
    const wasteEl = el('div.kl-stapel.kl-afleg', { dataset: { pile: 'waste' } });
    const foundEls = [0, 1, 2, 3].map((i) => el('div.kl-stapel.kl-fundament', {
      role: 'button', tabindex: '0', dataset: { pile: 'foundation', index: i, suit: L.SUITS[i] },
      'aria-label': `Aflegstapel ${L.SUIT_NAMES[i]}`,
    }));
    const tabEls = [0, 1, 2, 3, 4, 5, 6].map((i) => el('div.kl-stapel.kl-kolom', {
      dataset: { pile: 'tableau', index: i }, 'aria-label': `Stapel ${i + 1}`,
    }));
    table.append(
      el('div.kl-boven', stockEl, wasteEl, el('div.kl-leeg'), ...foundEls),
      el('div.kl-onder', ...tabEls));

    // ---------- Maten ----------
    let cw = 60, ch = 85;
    function layout() {
      const w = table.clientWidth;
      const gap = Math.max(4, Math.min(12, Math.round(w * 0.012)));
      cw = Math.floor(Math.min(100, (w - gap * 6) / 7));
      ch = Math.round(cw * 1.42);
      table.style.setProperty('--cw', `${cw}px`);
      table.style.setProperty('--ch', `${ch}px`);
      table.style.setProperty('--gap', `${gap}px`);
      render();
    }
    const ro = new ResizeObserver(() => layout());
    ro.observe(table);

    // ---------- Weergave ----------
    function cardEl(card, attrs = {}) {
      const red = L.isRed(card);
      const n = el('div.kaart' + (card.u ? (red ? '.rood' : '.zwart') : '.dicht'), attrs);
      if (card.u) {
        n.append(
          el('span.kaart-hoek', {}, L.RANKS[card.r], el('span', {}, L.SUITS[card.s])),
          el('span.kaart-midden', {}, L.SUITS[card.s]));
        n.setAttribute('aria-label', L.cardName(card));
      } else {
        n.setAttribute('aria-label', 'dichte kaart');
      }
      return n;
    }

    function isSel(pile, index, card) {
      if (!selected || selected.pile !== pile) return false;
      if (pile === 'tableau') return selected.index === index && card >= selected.card;
      if (pile === 'foundation') return selected.index === index;
      return true;
    }

    function render() {
      // Trekstapel
      stockEl.replaceChildren();
      stockEl.classList.toggle('leeg', !state.stock.length);
      stockEl.classList.toggle('opnieuw', !state.stock.length && !!state.waste.length);
      if (state.stock.length) stockEl.append(cardEl({ s: 0, r: 1, u: false }));
      stockEl.setAttribute('aria-label', state.stock.length ? `Trekstapel, ${state.stock.length} kaarten` : (state.waste.length ? 'Trekstapel leeg, tik om opnieuw te beginnen' : 'Trekstapel leeg'));

      // Aflegstapel: laat de bovenste drie waaieren (alleen de bovenste is speelbaar).
      wasteEl.replaceChildren();
      const shown = state.waste.slice(-3);
      shown.forEach((c, i) => {
        const top = i === shown.length - 1;
        const n = cardEl(c, top ? { tabindex: '0', role: 'button', dataset: { pile: 'waste' } } : {});
        n.style.left = `${i * Math.round(cw * 0.32)}px`;
        if (top && isSel('waste')) n.classList.add('gekozen');
        wasteEl.append(n);
      });

      // Aflegstapels
      foundEls.forEach((f, i) => {
        f.replaceChildren();
        const pile = state.foundations[i];
        if (pile.length) {
          const n = cardEl(pile[pile.length - 1], { dataset: { pile: 'foundation', index: i } });
          if (isSel('foundation', i)) n.classList.add('gekozen');
          f.append(n);
        }
      });

      // Speelstapels, met compressie als een stapel te lang wordt.
      const tableRect = table.getBoundingClientRect();
      const topRow = table.querySelector('.kl-onder').getBoundingClientRect();
      const avail = Math.max(ch * 2, (tableRect.bottom - topRow.top) - ch - 4);
      tabEls.forEach((t, i) => {
        t.replaceChildren();
        const pile = state.tableau[i];
        const downs = pile.filter((c) => !c.u).length;
        const ups = pile.length - downs;
        let dOff = Math.max(5, Math.round(ch * 0.11));
        let uOff = Math.round(ch * 0.27);
        const need = downs * dOff + Math.max(0, ups - 1) * uOff;
        if (need > avail) {
          const scale = avail / need;
          dOff = Math.max(3, Math.floor(dOff * scale));
          uOff = Math.max(Math.round(ch * 0.15), Math.floor(uOff * scale));
        }
        let y = 0;
        pile.forEach((c, j) => {
          const attrs = { dataset: { pile: 'tableau', index: i, card: j } };
          if (c.u) { attrs.tabindex = '0'; attrs.role = 'button'; }
          const n = cardEl(c, attrs);
          n.style.top = `${y}px`;
          if (isSel('tableau', i, j)) n.classList.add('gekozen');
          t.append(n);
          y += c.u ? uOff : dOff;
        });
        t.style.height = `${Math.max(ch, y - (pile.length ? (pile[pile.length - 1].u ? uOff : dOff) : 0) + ch)}px`;
        t.tabIndex = pile.length ? -1 : 0;
        t.setAttribute('role', pile.length ? 'group' : 'button');
      });

      movesEl.textContent = String(state.moves);
      timeEl.textContent = formatTime(state.elapsedMs);
      undoBtn.disabled = !state.undo.length || state.won || autoRunning;
      autoBtn.hidden = !L.canAutoComplete(state) || autoRunning;
    }

    // ---------- Zetten ----------
    function pushUndo() {
      const { undo, ...rest } = state;
      undo.push(L.snapshot(rest));
      if (undo.length > MAX_UNDO) undo.shift();
    }

    function afterChange(kind) {
      if (kind) sound.play(kind);
      if (state.won) onWin();
      store.saveState(state);
      render();
      if (state.won) showWin();
    }

    function tryMove(from, to) {
      if (!L.canMove(state, from, to)) return false;
      pushUndo();
      const cards = L.getCards(state, from);
      L.move(state, from, to);
      selected = null;
      live.textContent = `${L.cardName(cards[0])} ${to.pile === 'foundation' ? 'naar aflegstapel' : `naar stapel ${to.index + 1}`}.`;
      afterChange('kaart');
      return true;
    }

    function drawCard() {
      if (!state.stock.length && !state.waste.length) return;
      pushUndo();
      L.draw(state);
      selected = null;
      afterChange('kaart');
    }

    function undo() {
      if (autoRunning || state.won) return;
      const snap = state.undo.pop();
      if (!snap) return;
      const restored = L.restore(snap, { elapsedMs: state.elapsedMs });
      state = { ...restored, undo: state.undo };
      selected = null;
      sound.play('schuif');
      store.saveState(state);
      render();
    }

    function onWin() {
      const t = Math.round(state.elapsedMs);
      stats = {
        ...stats,
        gewonnen: stats.gewonnen + 1,
        besteTijd: stats.besteTijd ? Math.min(stats.besteTijd, t) : t,
        minsteZetten: stats.minsteZetten ? Math.min(stats.minsteZetten, state.moves) : state.moves,
      };
      store.saveStats(stats);
      sound.play('winst');
    }

    function showWin() {
      ctx.overlay(table, {
        title: 'Gewonnen!',
        text: `In ${state.moves} zetten en ${formatTime(state.elapsedMs)}.`,
        buttons: [{ label: 'Nieuw spel', primary: true, onclick: () => api.newGame() }],
      });
    }

    function autoComplete() {
      if (!L.canAutoComplete(state)) return;
      autoRunning = true;
      pushUndo();
      render();
      const fast = ctx.reducedMotion();
      const step = () => {
        const m = L.autoStep(state);
        if (m) sound.play('kaart');
        if (m && !state.won) {
          if (fast) { step(); return; }
          render();
          setTimeout(step, 70);
          return;
        }
        autoRunning = false;
        afterChange(null);
      };
      step();
    }

    // ---------- Tikken / klikken ----------
    function descriptorFrom(node) {
      const t = node?.closest?.('[data-pile]');
      if (!t || !table.contains(t)) return null;
      const d = t.dataset;
      const out = { pile: d.pile };
      if (d.index != null) out.index = Number(d.index);
      if (d.card != null) out.card = Number(d.card);
      return out;
    }

    function asSource(d) {
      if (!d) return null;
      if (d.pile === 'waste' && state.waste.length) return { pile: 'waste' };
      if (d.pile === 'foundation' && state.foundations[d.index].length) return { pile: 'foundation', index: d.index };
      if (d.pile === 'tableau' && d.card != null && L.isMovableRun(state.tableau[d.index], d.card)) return { pile: 'tableau', index: d.index, card: d.card };
      return null;
    }

    function asTarget(d) {
      if (!d) return null;
      if (d.pile === 'foundation') return { pile: 'foundation', index: d.index };
      if (d.pile === 'tableau') return { pile: 'tableau', index: d.index };
      return null;
    }

    const same = (a, b) => a && b && a.pile === b.pile && a.index === b.index && a.card === b.card;

    function handleTap(d) {
      if (autoRunning || state.won || !d) return;
      if (d.pile === 'stock') { drawCard(); return; }
      const src = asSource(d);
      if (selected) {
        if (same(selected, src)) {
          // Nogmaals op de selectie: automatisch verplaatsen.
          const to = L.autoTarget(state, selected);
          if (!(to && tryMove(selected, to))) { selected = null; render(); }
          return;
        }
        const to = asTarget(d);
        if (to && tryMove(selected, to)) return;
        if (src) { selected = src; sound.play('tik'); render(); return; }
        selected = null;
        render();
        return;
      }
      if (src) {
        selected = src;
        sound.play('tik');
        render();
      }
    }

    function onKeyDown(e) {
      if (ctx.isBlocked(e) && !((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !document.querySelector('dialog[open]'))) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if (e.key === 'Escape' && selected) { selected = null; render(); return; }
      if ((e.key === 'Enter' || e.key === ' ') && table.contains(document.activeElement)) {
        e.preventDefault();
        const keep = document.activeElement.dataset;
        handleTap(descriptorFrom(document.activeElement));
        // Focus terugzetten op een vergelijkbaar element na opnieuw tekenen.
        const sel = keep.pile === 'stock' ? '.kl-trek' : keep.card != null
          ? `[data-pile="tableau"][data-index="${keep.index}"] .kaart:last-child` : null;
        if (sel) table.querySelector(sel)?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);

    // ---------- Slepen ----------
    let press = null;
    let dragLayer = null;

    table.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || autoRunning || state.won) return;
      const d = descriptorFrom(e.target);
      press = { x: e.clientX, y: e.clientY, d, id: e.pointerId, dragging: false, src: asSource(d) };
      if (press.src) table.setPointerCapture?.(e.pointerId);
    });

    table.addEventListener('pointermove', (e) => {
      if (!press || e.pointerId !== press.id || !press.src) return;
      const dx = e.clientX - press.x, dy = e.clientY - press.y;
      if (!press.dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        startDrag();
      }
      dragLayer.style.transform = `translate(${dx}px, ${dy}px)`;
    });

    function startDrag() {
      press.dragging = true;
      selected = null;
      render();
      const nodes = cardNodesFor(press.src);
      const first = nodes[0].getBoundingClientRect();
      dragLayer = el('div.kl-sleep');
      dragLayer.style.left = `${first.left}px`;
      dragLayer.style.top = `${first.top}px`;
      for (const n of nodes) {
        const r = n.getBoundingClientRect();
        const c = n.cloneNode(true);
        c.style.left = `${r.left - first.left}px`;
        c.style.top = `${r.top - first.top}px`;
        dragLayer.append(c);
        n.classList.add('weg');
      }
      table.style.setProperty('--sleep-cw', `${cw}px`);
      document.body.append(dragLayer);
      dragLayer.style.setProperty('--cw', `${cw}px`);
      dragLayer.style.setProperty('--ch', `${ch}px`);
    }

    function cardNodesFor(src) {
      if (src.pile === 'waste') return [wasteEl.lastElementChild];
      if (src.pile === 'foundation') return [foundEls[src.index].lastElementChild];
      return [...tabEls[src.index].children].slice(src.card);
    }

    function dropTarget(src) {
      const r = dragLayer.firstElementChild.getBoundingClientRect();
      let best = null, bestArea = 0;
      const candidates = [
        ...foundEls.map((f, i) => [f, { pile: 'foundation', index: i }]),
        ...tabEls.map((t, i) => [t, { pile: 'tableau', index: i }]),
      ];
      for (const [node, to] of candidates) {
        const b = node.getBoundingClientRect();
        const bottom = Math.max(b.bottom, b.top + ch);
        const w = Math.min(r.right, b.right) - Math.max(r.left, b.left);
        const h = Math.min(r.bottom, bottom) - Math.max(r.top, b.top);
        const area = w > 0 && h > 0 ? w * h : 0;
        if (area > bestArea && L.canMove(state, src, to)) { best = to; bestArea = area; }
      }
      return best;
    }

    const endPress = (e) => {
      if (!press || e.pointerId !== press.id) return;
      const p = press;
      press = null;
      if (p.dragging) {
        const to = dropTarget(p.src);
        dragLayer.remove();
        dragLayer = null;
        if (!(to && tryMove(p.src, to))) render();
        return;
      }
      handleTap(p.d);
    };
    table.addEventListener('pointerup', endPress);
    table.addEventListener('pointercancel', () => {
      if (dragLayer) { dragLayer.remove(); dragLayer = null; }
      press = null;
      render();
    });

    // ---------- Tijd ----------
    let lastTick = performance.now();
    let sinceSave = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      const dt = now - lastTick;
      lastTick = now;
      if (state.won || !state.moves || document.visibilityState !== 'visible' || document.querySelector('dialog[open]')) return;
      state.elapsedMs += Math.min(dt, 2000);
      timeEl.textContent = formatTime(state.elapsedMs);
      sinceSave += dt;
      if (sinceSave > 5000) { sinceSave = 0; store.saveState(state); }
    }, 1000);

    layout();
    if (state.won) showWin();

    const api = {
      isInProgress: () => game.isInProgress(state),
      newGame() {
        state = startNew();
        selected = null;
        autoRunning = false;
        ctx.clearOverlay(table);
        render();
      },
      save() { store.saveState(state); },
      destroy() {
        clearInterval(timer);
        ro.disconnect();
        dragLayer?.remove();
        document.removeEventListener('keydown', onKeyDown);
      },
      _debug: {
        get state() { return state; },
        set state(s) { state = s; render(); },
        tap: (d) => handleTap(d),
        move: (from, to) => tryMove(from, to),
        undo,
        draw: drawCard,
      },
    };
    return api;
  },
};

export default game;
