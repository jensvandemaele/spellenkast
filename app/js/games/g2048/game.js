// 2048: scherm en bediening. Spelregels staan in logic.js.
import * as L from './logic.js';
import { el, formatNumber, isNonNegInt } from '../../core/util.js';

const KEYS = {
  ArrowLeft: 'links', ArrowRight: 'rechts', ArrowUp: 'omhoog', ArrowDown: 'omlaag',
  a: 'links', d: 'rechts', w: 'omhoog', s: 'omlaag',
  A: 'links', D: 'rechts', W: 'omhoog', S: 'omlaag',
};

const game = {
  id: '2048',
  name: '2048',
  short: 'Schuif tegels en voeg gelijke getallen samen tot 2048.',
  accent: 'var(--kleur-2048)',
  icon: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="5" width="17" height="17" rx="4" fill="currentColor" opacity=".35"/><rect x="26" y="5" width="17" height="17" rx="4" fill="currentColor" opacity=".6"/><rect x="5" y="26" width="17" height="17" rx="4" fill="currentColor" opacity=".6"/><rect x="26" y="26" width="17" height="17" rx="4" fill="currentColor"/><text x="34.5" y="38.5" font-size="9" font-weight="700" text-anchor="middle" fill="var(--kaart-bg)" font-family="system-ui">2K</text></svg>`,
  help: `<p>Veeg over het bord (of gebruik de pijltjestoetsen of W A S D). Alle tegels schuiven die kant op.</p>
    <p>Twee gelijke tegels die tegen elkaar botsen worden één tegel met de som. Een tegel voegt per zet maar één keer samen.</p>
    <p>Na elke zet die iets verandert verschijnt een nieuwe 2 of 4. Haal een tegel van <strong>2048</strong> om te winnen; daarna mag je doorspelen. Het spel is voorbij als er geen zet meer mogelijk is.</p>`,

  storage: {
    stateVersion: 1,
    statsVersion: 1,
    validateState: L.validateState,
    defaultStats: () => ({ beste: 0, gespeeld: 0, gewonnen: 0, hoogsteTegel: 0 }),
    validateStats: (s) => !!s && ['beste', 'gespeeld', 'gewonnen', 'hoogsteTegel'].every((k) => isNonNegInt(s[k])),
  },

  isFinished: (s) => s.over,
  isInProgress: (s) => !!s && !s.over && s.moves > 0,
  statLine: (st) => (st.gespeeld ? `Beste score: ${formatNumber(st.beste)} · hoogste tegel ${st.hoogsteTegel || '–'}` : 'Nog niet gespeeld'),

  mount(ctx, { fresh }) {
    const { store, sound } = ctx;
    let stats = store.loadStats();
    let state = fresh ? null : store.loadState();
    if (!state) state = startNew();

    function startNew() {
      const s = L.newGame();
      stats = { ...stats, gespeeld: stats.gespeeld + 1 };
      store.saveStats(stats);
      store.saveState(s);
      return s;
    }

    const scoreEl = el('output.waarde', { 'aria-live': 'off' });
    const bestEl = el('output.waarde');
    const board = el('div.bord-2048', { role: 'grid', 'aria-label': 'Speelbord 2048' });
    const cells = [];
    for (let i = 0; i < 16; i++) {
      const c = el('div.tegel', { role: 'gridcell' });
      cells.push(c);
      board.append(c);
    }
    const live = el('p.sr-only', { 'aria-live': 'polite' });
    const wrap = el('div.bord-houder.geen-scroll', {}, board);
    const root = el('div.spel.spel-2048',
      el('div.scorebalk',
        el('div.scorevak', el('span.label', {}, 'Score'), scoreEl),
        el('div.scorevak', el('span.label', {}, 'Beste'), bestEl)),
      wrap,
      el('p.tip', {}, 'Veeg over het bord of gebruik de pijltjestoetsen.'),
      live);
    ctx.root.append(root);

    function render(merged = [], spawned = null) {
      const anim = !ctx.reducedMotion();
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const v = state.grid[r][c];
          const cell = cells[r * 4 + c];
          cell.textContent = v ? String(v) : '';
          cell.dataset.v = v > 2048 ? 'super' : String(v);
          cell.classList.toggle('lang', v >= 1024);
          cell.classList.toggle('langer', v >= 16384);
          cell.classList.remove('nieuw', 'samen');
          cell.setAttribute('aria-label', v ? String(v) : 'leeg');
        }
      }
      if (anim) {
        void board.offsetWidth; // herstart animaties
        for (const [r, c] of merged) cells[r * 4 + c].classList.add('samen');
        if (spawned) cells[spawned[0] * 4 + spawned[1]].classList.add('nieuw');
      }
      scoreEl.textContent = formatNumber(state.score);
      bestEl.textContent = formatNumber(Math.max(stats.beste, state.score));
    }

    function showEndState() {
      if (state.over) {
        ctx.overlay(wrap, {
          title: 'Geen zetten meer',
          text: `Je score: <strong>${formatNumber(state.score)}</strong>`,
          buttons: [{ label: 'Nieuw spel', primary: true, onclick: () => api.newGame() }],
        });
      } else if (state.won && !state.keepPlaying) {
        ctx.overlay(wrap, {
          title: 'Gewonnen!',
          text: `Je hebt 2048 gehaald met <strong>${formatNumber(state.score)}</strong> punten.`,
          buttons: [
            { label: 'Doorspelen', primary: true, onclick: () => { state = { ...state, keepPlaying: true }; store.saveState(state); ctx.clearOverlay(wrap); } },
            { label: 'Nieuw spel', onclick: () => api.newGame() },
          ],
        });
      } else {
        ctx.clearOverlay(wrap);
      }
    }

    function doMove(dir) {
      if (state.over || (state.won && !state.keepPlaying)) return;
      const res = L.applyMove(state, dir);
      if (!res.moved) return;
      state = res.state;
      let changed = false;
      if (state.score > stats.beste) { stats.beste = state.score; changed = true; }
      const mt = L.maxTile(state.grid);
      if (mt > stats.hoogsteTegel) { stats.hoogsteTegel = mt; changed = true; }
      if (res.justWon) { stats.gewonnen += 1; changed = true; }
      if (changed) store.saveStats(stats);
      store.saveState(state);
      render(res.merged, res.spawned);
      if (res.justWon) sound.play('winst');
      else if (state.over) sound.play('einde');
      else sound.play(res.merged.length ? 'samen' : 'schuif');
      if (res.gained) live.textContent = `+${res.gained}`;
      if (res.justWon || state.over) showEndState();
    }

    // Toetsenbord
    function onKey(e) {
      if (ctx.isBlocked(e)) return;
      const dir = KEYS[e.key];
      if (!dir) return;
      e.preventDefault();
      doMove(dir);
    }
    document.addEventListener('keydown', onKey);

    // Vegen (aanraking en muis)
    let start = null;
    wrap.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.overlay')) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    const endSwipe = (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      const ax = Math.abs(dx), ay = Math.abs(dy);
      if (Math.max(ax, ay) < 24) return;
      if (ax > ay) doMove(dx > 0 ? 'rechts' : 'links');
      else doMove(dy > 0 ? 'omlaag' : 'omhoog');
    };
    wrap.addEventListener('pointerup', endSwipe);
    wrap.addEventListener('pointercancel', () => { start = null; });

    render();
    showEndState();

    const api = {
      isInProgress: () => game.isInProgress(state),
      newGame() {
        state = startNew();
        render();
        showEndState();
      },
      save() { store.saveState(state); },
      destroy() { document.removeEventListener('keydown', onKey); },
      // Alleen voor tests en debug: directe toegang tot de toestand.
      _debug: { get state() { return state; }, set state(s) { state = s; render(); showEndState(); }, move: doMove },
    };
    return api;
  },
};

export default game;
