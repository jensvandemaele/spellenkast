// Woordzoeker: scherm en bediening. Puzzels en regels staan in logic.js.
import * as L from './logic.js';
import { THEMES, THEME_IDS } from './words.js';
import { el, formatTime, isNonNegInt } from '../../core/util.js';

const FOUND_COLORS = ['#f2c14e', '#7cc6b9', '#f28c7a', '#9fb7ea', '#b9d27c', '#d9a3d6', '#f5a65b', '#8fd0e8', '#e6b8a2', '#a8c9a0', '#f0d77a', '#c4b5f0'];
const LEVEL_IDS = Object.keys(L.LEVELS);

function nsvg(tag, attrs) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

const game = {
  id: 'woordzoeker',
  name: 'Woordzoeker',
  short: 'Vind alle verstopte Nederlandse woorden in het letterrooster.',
  accent: 'var(--kleur-woord)',
  icon: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="5" width="38" height="38" rx="6" fill="none" stroke="currentColor" stroke-width="3" opacity=".45"/><path d="M13 14 L35 34" stroke="currentColor" stroke-width="8" stroke-linecap="round" opacity=".35"/><g fill="currentColor" font-family="system-ui" font-weight="800" font-size="10" text-anchor="middle"><text x="14" y="18">W</text><text x="24" y="27">O</text><text x="34" y="37">K</text><text x="34" y="18">A</text><text x="14" y="37">E</text></g></svg>`,
  help: `<p>Zoek de woorden uit de lijst in het rooster. Woorden staan in rechte lijnen: horizontaal, verticaal of schuin, en op <em>Moeilijk</em> ook achterstevoren.</p>
    <p><strong>Selecteren:</strong> sleep met je vinger of muis van de eerste naar de laatste letter. Of tik eerst op de eerste en daarna op de laatste letter.</p>
    <p><strong>Toetsenbord:</strong> Tab naar het rooster, pijltjes om te bewegen, Enter of spatie voor begin- en eindletter.</p>
    <p>Gevonden woorden worden gemarkeerd en in de lijst doorgestreept. De puzzel is klaar als alle woorden gevonden zijn.</p>
    <p>Niveaus: <em>Makkelijk</em> 8×8 (→ en ↓), <em>Normaal</em> 10×10 (ook schuin), <em>Moeilijk</em> 12×12 (alle richtingen).</p>`,

  storage: {
    stateVersion: 1,
    statsVersion: 1,
    validateState: L.validateState,
    defaultStats: () => Object.fromEntries(LEVEL_IDS.map((l) => [l, { gespeeld: 0, opgelost: 0, besteTijd: 0 }])),
    validateStats: (s) => !!s && LEVEL_IDS.every((l) => s[l] && ['gespeeld', 'opgelost', 'besteTijd'].every((k) => isNonNegInt(s[l][k]))),
    prefsVersion: 1,
    defaultPrefs: () => ({ thema: 'willekeurig', niveau: 'normaal' }),
    validatePrefs: (p) => !!p && (p.thema === 'willekeurig' || THEME_IDS.includes(p.thema)) && LEVEL_IDS.includes(p.niveau),
  },

  isFinished: (s) => s.done,
  isInProgress: (s) => !!s && !s.done && s.found.length > 0,
  statLine(st) {
    const solved = LEVEL_IDS.reduce((n, l) => n + st[l].opgelost, 0);
    if (!solved) return 'Nog geen puzzels opgelost';
    const best = st.normaal.besteTijd ? ` · beste (normaal) ${formatTime(st.normaal.besteTijd)}` : '';
    return `${solved} ${solved === 1 ? 'puzzel' : 'puzzels'} opgelost${best}`;
  },

  mount(ctx, { fresh }) {
    const { store, sound } = ctx;
    let stats = store.loadStats();
    let prefs = store.loadPrefs();
    let state = fresh ? null : store.loadState();
    if (!state || state.done) state = startNew();

    function startNew() {
      const theme = prefs.thema === 'willekeurig' ? THEME_IDS[Math.floor(Math.random() * THEME_IDS.length)] : prefs.thema;
      const s = L.newGame(theme, prefs.niveau);
      stats = { ...stats, [prefs.niveau]: { ...stats[prefs.niveau], gespeeld: stats[prefs.niveau].gespeeld + 1 } };
      store.saveStats(stats);
      store.saveState(s);
      return s;
    }

    // ---------- DOM ----------
    const themeSel = el('select', { 'aria-label': 'Thema', onchange: (e) => changePrefs({ thema: e.target.value }) },
      el('option', { value: 'willekeurig' }, 'Willekeurig'),
      THEME_IDS.map((id) => el('option', { value: id }, THEMES[id].naam)));
    const levelSel = el('select', { 'aria-label': 'Moeilijkheid', onchange: (e) => changePrefs({ niveau: e.target.value }) },
      LEVEL_IDS.map((id) => el('option', { value: id }, L.LEVELS[id].naam)));
    const timeEl = el('output.waarde');
    const countEl = el('output.waarde');
    const themeName = el('span.wz-thema');
    const gridEl = el('div.wz-rooster', { role: 'grid', tabindex: '0', 'aria-label': 'Letterrooster' });
    const svg = nsvg('svg', { class: 'wz-lijnen', 'aria-hidden': 'true' });
    const boardWrap = el('div.wz-houder.geen-scroll', {}, svg, gridEl);
    const listEl = el('ul.wz-lijst', { 'aria-label': 'Te vinden woorden' });
    const live = el('p.sr-only', { 'aria-live': 'polite' });

    const root = el('div.spel.spel-woordzoeker',
      el('div.wz-keuzes', themeSel, levelSel),
      el('div.wz-inhoud',
        el('div.wz-bordkolom',
          el('div.wz-info',
            el('span', {}, '⏱ ', timeEl),
            el('span', {}, 'Gevonden ', countEl)),
          boardWrap),
        el('div.wz-woorden', el('h2', {}, 'Woorden ', themeName), listEl)),
      live);
    ctx.root.append(root);

    let cells = [];
    let cursor = [0, 0];
    let pending = null;  // eerste letter bij tik-tik-selectie
    let drag = null;     // { r0, c0, r1, c1, id }

    function buildGrid() {
      gridEl.replaceChildren();
      gridEl.style.setProperty('--n', state.size);
      cells = [];
      for (let r = 0; r < state.size; r++) {
        const rowEl = el('div.wz-rij', { role: 'row' });
        for (let c = 0; c < state.size; c++) {
          const cellEl = el('div.wz-cel', { role: 'gridcell', dataset: { r, c } }, state.grid[r][c]);
          cells.push(cellEl);
          rowEl.append(cellEl);
        }
        gridEl.append(rowEl);
      }
      svg.setAttribute('viewBox', `0 0 ${state.size} ${state.size}`);
      themeSel.value = prefs.thema;
      levelSel.value = prefs.niveau;
      themeName.textContent = `· ${THEMES[state.theme].naam}`;
      cursor = [0, 0];
      pending = null;
      render();
    }

    function lineEl(r0, c0, r1, c1, color, cls) {
      return nsvg('line', {
        x1: c0 + 0.5, y1: r0 + 0.5, x2: c1 + 0.5, y2: r1 + 0.5,
        stroke: color, 'stroke-width': 0.78, 'stroke-linecap': 'round', class: cls,
      });
    }

    function render() {
      svg.replaceChildren();
      const foundSet = new Set();
      state.found.forEach((i, k) => {
        const w = state.words[i];
        const cs = L.wordCells(w);
        cs.forEach(([r, c]) => foundSet.add(r * state.size + c));
        const [r1, c1] = cs[cs.length - 1];
        svg.append(lineEl(w.r, w.c, r1, c1, FOUND_COLORS[k % FOUND_COLORS.length], 'gevonden'));
      });
      if (drag) svg.append(lineEl(drag.r0, drag.c0, drag.r1, drag.c1, 'currentColor', 'selectie'));
      cells.forEach((cellEl, i) => {
        const r = Math.floor(i / state.size), c = i % state.size;
        cellEl.classList.toggle('gevonden', foundSet.has(i));
        cellEl.classList.toggle('begin', !!pending && pending[0] === r && pending[1] === c);
        cellEl.classList.toggle('cursor', document.activeElement === gridEl && cursor[0] === r && cursor[1] === c);
      });
      listEl.replaceChildren(...state.words.map((w, i) => {
        const f = state.found.includes(i);
        return el('li' + (f ? '.gevonden' : ''), { 'aria-label': f ? `${w.word}, gevonden` : w.word }, w.word);
      }));
      countEl.textContent = `${state.found.length}/${state.words.length}`;
      timeEl.textContent = formatTime(state.elapsedMs);
    }

    // ---------- Tijd ----------
    let lastTick = performance.now();
    let sinceSave = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      const dt = now - lastTick;
      lastTick = now;
      if (state.done || document.visibilityState !== 'visible' || document.querySelector('dialog[open]')) return;
      state.elapsedMs += Math.min(dt, 2000);
      timeEl.textContent = formatTime(state.elapsedMs);
      sinceSave += dt;
      if (sinceSave > 5000) { sinceSave = 0; store.saveState(state); }
    }, 1000);

    // ---------- Selecteren ----------
    function cellAt(x, y) {
      const rect = gridEl.getBoundingClientRect();
      const size = rect.width / state.size;
      const c = Math.floor((x - rect.left) / size);
      const r = Math.floor((y - rect.top) / size);
      return [Math.max(0, Math.min(state.size - 1, r)), Math.max(0, Math.min(state.size - 1, c))];
    }

    /** Maakt van een willekeurig eindpunt een rechte lijn (een van de 8 richtingen) binnen het rooster. */
    function snap(r0, c0, r, c) {
      const dr = r - r0, dc = c - c0;
      if (!dr && !dc) return [r0, c0];
      const angle = Math.atan2(dr, dc);
      const oct = Math.round(angle / (Math.PI / 4));
      const sdr = Math.round(Math.sin(oct * Math.PI / 4));
      const sdc = Math.round(Math.cos(oct * Math.PI / 4));
      let len = Math.max(Math.abs(dr), Math.abs(dc));
      while (len > 0) {
        const rr = r0 + sdr * len, cc = c0 + sdc * len;
        if (rr >= 0 && rr < state.size && cc >= 0 && cc < state.size) return [rr, cc];
        len--;
      }
      return [r0, c0];
    }

    function attempt(r0, c0, r1, c1) {
      if (r0 === r1 && c0 === c1) return false;
      const idx = L.checkSelection(state, r0, c0, r1, c1);
      if (idx < 0) {
        sound.play('fout');
        if (!ctx.reducedMotion()) { boardWrap.classList.remove('schud'); void boardWrap.offsetWidth; boardWrap.classList.add('schud'); }
        return false;
      }
      const done = L.markFound(state, idx);
      live.textContent = `${state.words[idx].word} gevonden. Nog ${state.words.length - state.found.length}.`;
      if (done) finish();
      else sound.play('gevonden');
      store.saveState(state);
      return true;
    }

    function finish() {
      sound.play('winst');
      const s = stats[state.level];
      const t = Math.round(state.elapsedMs);
      stats = { ...stats, [state.level]: { ...s, opgelost: s.opgelost + 1, besteTijd: s.besteTijd ? Math.min(s.besteTijd, t) : t } };
      store.saveStats(stats);
      showDone();
    }

    function showDone() {
      if (!state.done) { ctx.clearOverlay(boardWrap); return; }
      ctx.overlay(boardWrap, {
        title: 'Puzzel opgelost!',
        text: `Alle ${state.words.length} woorden gevonden in <strong>${formatTime(state.elapsedMs)}</strong>.`,
        buttons: [{ label: 'Nieuwe puzzel', primary: true, onclick: () => api.newGame() }],
      });
    }

    function tapCell(r, c) {
      if (state.done) return;
      if (!pending) { pending = [r, c]; sound.play('tik'); }
      else if (pending[0] === r && pending[1] === c) pending = null;
      else {
        const [sr, sc] = snap(pending[0], pending[1], r, c);
        attempt(pending[0], pending[1], sr, sc);
        pending = null;
      }
      render();
    }

    gridEl.addEventListener('pointerdown', (e) => {
      if (state.done || e.button > 0) return;
      e.preventDefault();
      gridEl.setPointerCapture?.(e.pointerId);
      const [r, c] = cellAt(e.clientX, e.clientY);
      drag = { r0: r, c0: c, r1: r, c1: c, id: e.pointerId, moved: false };
      render();
    });
    gridEl.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const [r, c] = cellAt(e.clientX, e.clientY);
      const [r1, c1] = snap(drag.r0, drag.c0, r, c);
      if (r1 !== drag.r1 || c1 !== drag.c1) {
        drag.r1 = r1; drag.c1 = c1; drag.moved = true;
        if (pending) pending = null;
        render();
      }
    });
    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (d.r0 === d.r1 && d.c0 === d.c1) tapCell(d.r0, d.c0);
      else { attempt(d.r0, d.c0, d.r1, d.c1); render(); }
    };
    gridEl.addEventListener('pointerup', endDrag);
    gridEl.addEventListener('pointercancel', () => { drag = null; render(); });

    // Toetsenbord
    gridEl.addEventListener('focus', render);
    gridEl.addEventListener('blur', render);
    gridEl.addEventListener('keydown', (e) => {
      const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (moves[e.key]) {
        e.preventDefault();
        const [dr, dc] = moves[e.key];
        cursor = [Math.max(0, Math.min(state.size - 1, cursor[0] + dr)), Math.max(0, Math.min(state.size - 1, cursor[1] + dc))];
        render();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        tapCell(cursor[0], cursor[1]);
      } else if (e.key === 'Escape' && pending) {
        pending = null; render();
      }
    });

    async function changePrefs(patch) {
      const next = { ...prefs, ...patch };
      if (game.isInProgress(state)) {
        const ok = await ctx.confirm('De huidige puzzel wordt gewist en er komt een nieuwe.', { title: 'Nieuwe puzzel?', ok: 'Nieuwe puzzel', danger: true });
        if (!ok) { themeSel.value = prefs.thema; levelSel.value = prefs.niveau; return; }
      }
      prefs = next;
      store.savePrefs(prefs);
      api.newGame();
    }

    buildGrid();
    showDone();

    const api = {
      isInProgress: () => game.isInProgress(state),
      newGame() {
        state = startNew();
        buildGrid();
        showDone();
      },
      save() { store.saveState(state); },
      destroy() { clearInterval(timer); },
      _debug: {
        get state() { return state; },
        select: (r0, c0, r1, c1) => { const ok = attempt(r0, c0, r1, c1); render(); return ok; },
      },
    };
    return api;
  },
};

export default game;
