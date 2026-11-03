// Snoepwissel (match-3): scherm, animaties en bediening. Spelregels staan in logic.js.
import * as L from './logic.js';
import { el, formatNumber, isNonNegInt } from '../../core/util.js';

const T_SWAP = 150;
const T_CLEAR = 210;
const T_FALL = 230;
const HINT_AFTER_MS = 7000;
const COMBO_WORDS = ['', '', 'Lekker!', 'Heerlijk!', 'Smullen!', 'Snoepfeest!'];

// Kleuren en vormen: elke kleur heeft ook een eigen vorm (ook goed te zien bij kleurenblindheid).
const COLORS = [
  { naam: 'rood', fill: '#e5484d', dark: '#a52a2f' },
  { naam: 'oranje', fill: '#f08c2e', dark: '#b35f13' },
  { naam: 'geel', fill: '#f5c518', dark: '#b08a00' },
  { naam: 'groen', fill: '#3fb26b', dark: '#237a45' },
  { naam: 'blauw', fill: '#3b82f6', dark: '#1d56b8' },
  { naam: 'paars', fill: '#9b5de5', dark: '#6a32b3' },
];
const SHAPES = [
  '<circle cx="20" cy="20" r="14.5"/>',
  '<rect x="6.5" y="6.5" width="27" height="27" rx="8"/>',
  '<path d="M20 4.5l4.6 9.6 10.4 1.3-7.7 7.2 2 10.4L20 28l-9.3 5 2-10.4-7.7-7.2 10.4-1.3z" stroke-linejoin="round"/>',
  '<path d="M20 5.5c8 5.5 13.5 12 13.5 18.5A13.5 10.5 0 0 1 6.5 24C6.5 17.5 12 11 20 5.5z"/>',
  '<path d="M20 4c6 7.5 12 13.5 12 20a12 12 0 0 1-24 0c0-6.5 6-12.5 12-20z"/>',
  '<path d="M20 4l15 16-15 16L5 20z" stroke-linejoin="round"/>',
];
const SHINE = '<ellipse cx="14.5" cy="13" rx="5" ry="3.2" fill="#fff" opacity=".55" transform="rotate(-30 14.5 13)"/>';

function candySvg(k, s) {
  if (s === 'c') {
    const dots = [[13, 14, 0], [24, 11, 2], [28, 21, 4], [21, 27, 3], [12, 24, 5], [19, 18, 1], [26, 29, 0], [9, 18, 2]]
      .map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="2.1" fill="${COLORS[c].fill}"/>`).join('');
    return `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="15" fill="#5b3a29" stroke="#3a2418" stroke-width="2"/>${dots}${SHINE}</svg>`;
  }
  const col = COLORS[k];
  let extra = '';
  if (s === 'h') extra = '<g stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".9"><path d="M12 15h16M10.5 20h19M12 25h16"/></g>';
  else if (s === 'v') extra = '<g stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".9"><path d="M15 12v16M20 10.5v19M25 12v16"/></g>';
  const wrapper = s === 'b'
    ? `<rect x="1.5" y="1.5" width="37" height="37" rx="11" fill="none" stroke="${col.fill}" stroke-width="3" stroke-dasharray="5 3"/><rect x="1.5" y="1.5" width="37" height="37" rx="11" fill="#fff" opacity=".35"/>`
    : '';
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${wrapper}<g fill="${col.fill}" stroke="${col.dark}" stroke-width="2">${SHAPES[k]}</g>${extra}${SHINE}</svg>`;
}

function candyLabel(c) {
  if (!c) return 'leeg';
  if (c.s === 'c') return 'kleurbom';
  const base = COLORS[c.k].naam;
  return { '': base, h: `${base} streepsnoepje (rij)`, v: `${base} streepsnoepje (kolom)`, b: `${base} bom` }[c.s];
}

const game = {
  id: 'snoepwissel',
  name: 'Snoepwissel',
  short: 'Wissel snoepjes en maak rijtjes van drie of meer om het doel te halen.',
  accent: 'var(--kleur-snoep)',
  icon: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="15" cy="15" r="9" fill="currentColor"/><rect x="25" y="6" width="17" height="17" rx="5" fill="currentColor" opacity=".55"/><path d="M33.5 26l9.5 10-9.5 10-9.5-10z" fill="currentColor" opacity=".8"/><path d="M15 26c4.5 5 7.5 9 7.5 12.5a7.5 7.5 0 0 1-15 0C7.5 35 10.5 31 15 26z" fill="currentColor" opacity=".4"/><ellipse cx="12" cy="12" rx="3" ry="2" fill="#fff" opacity=".6" transform="rotate(-30 12 12)"/></svg>`,
  help: `<p>Wissel twee snoepjes die naast elkaar liggen (vegen, of tik eerst het ene en dan het andere). Een wissel telt alleen als er een rijtje van <strong>drie of meer</strong> dezelfde snoepjes ontstaat. Die verdwijnen, de rest valt naar beneden en er komen nieuwe bij.</p>
    <p><strong>Speciale snoepjes</strong></p>
    <p>4 op een rij → <strong>streepsnoepje</strong>: wist een hele rij of kolom (volgens de streepjes).<br>
    L- of T-vorm → <strong>bom</strong>: wist alles eromheen (3×3).<br>
    5 op een rij → <strong>kleurbom</strong>: wissel hem met een snoepje en alle snoepjes van die kleur verdwijnen.</p>
    <p>Wissel twee speciale snoepjes met elkaar voor een extra grote knal. Twee kleurbommen wissen het hele bord.</p>
    <p><strong>Niveaus:</strong> haal de doelscore binnen het aantal zetten. Hoe hoger je score, hoe meer sterren (★ bij het doel, ★★ bij anderhalf keer, ★★★ bij het dubbele). Kettingreacties tellen dubbel, driedubbel, …</p>
    <p>Geen zet meer mogelijk? Dan worden de snoepjes vanzelf geschud. Wacht je even, dan krijg je een tip.</p>
    <p><strong>Toetsenbord:</strong> pijltjes om te bewegen, Enter om een snoepje te kiezen, daarna een pijltje om te wisselen. Esc annuleert.</p>`,

  storage: {
    stateVersion: 1,
    statsVersion: 1,
    validateState: L.validateState,
    defaultStats: () => ({ gespeeld: 0, hoogsteNiveau: 1, besteScore: 0, sterren: [] }),
    validateStats: (s) => !!s && ['gespeeld', 'besteScore'].every((k) => isNonNegInt(s[k]))
      && Number.isInteger(s.hoogsteNiveau) && s.hoogsteNiveau >= 1
      && Array.isArray(s.sterren) && s.sterren.length <= s.hoogsteNiveau
      && s.sterren.every((x) => Number.isInteger(x) && x >= 0 && x <= 3),
  },

  isFinished: (s) => s.status !== 'bezig',
  isInProgress: (s) => !!s && s.status === 'bezig' && s.moves > 0,
  statLine(st) {
    if (!st.gespeeld) return 'Nog niet gespeeld';
    const stars = st.sterren.reduce((a, b) => a + b, 0);
    return `Niveau ${st.hoogsteNiveau} bereikt · ${stars} ★`;
  },

  mount(ctx, { fresh }) {
    const { store, sound } = ctx;
    let stats = store.loadStats();
    let state = fresh ? null : store.loadState();
    if (!state || state.status !== 'bezig') state = startNew(levelAfter(state));
    let busy = false;
    let alive = true;
    let selected = -1;
    let cursor = 27;
    let hintTimer = null;
    let hint = null;

    function levelAfter(prev) {
      if (!prev) return stats.hoogsteNiveau;
      if (prev.status === 'gehaald') return Math.min(prev.level + 1, stats.hoogsteNiveau);
      return Math.min(prev.level, stats.hoogsteNiveau);
    }

    function startNew(level) {
      const s = L.newGame(level);
      stats = { ...stats, gespeeld: stats.gespeeld + 1 };
      store.saveStats(stats);
      store.saveState(s);
      return s;
    }

    // ---------- DOM ----------
    const levelSel = el('select', { 'aria-label': 'Niveau', onchange: (e) => changeLevel(Number(e.target.value)) });
    const movesEl = el('output.waarde');
    const scoreEl = el('output.waarde');
    const fillEl = el('div.sw-vulling');
    const goalEl = el('span.sw-doel');
    const bar = el('div.sw-voortgang', { role: 'progressbar', 'aria-label': 'Voortgang naar de sterren', 'aria-valuemin': '0' },
      fillEl,
      el('span.sw-ster', { style: { left: '50%' } }, '★'),
      el('span.sw-ster', { style: { left: '75%' } }, '★'),
      el('span.sw-ster', { style: { left: '100%' } }, '★'));
    const boardEl = el('div.sw-bord', { role: 'grid', tabindex: '0', 'aria-label': 'Snoepbord' });
    const fxEl = el('div.sw-fx', { 'aria-hidden': 'true' });
    const wrap = el('div.sw-houder.geen-scroll', {}, boardEl, fxEl);
    const live = el('p.sr-only', { 'aria-live': 'polite' });
    const root = el('div.spel.spel-snoepwissel',
      el('div.sw-balk',
        levelSel,
        el('div.scorevak', el('span.label', {}, 'Zetten'), movesEl),
        el('div.scorevak', el('span.label', {}, 'Score'), scoreEl)),
      el('div.sw-voortgang-rij', bar, goalEl),
      wrap,
      el('p.tip', {}, 'Veeg een snoepje naar zijn buur, of tik ze na elkaar aan.'),
      live);
    ctx.root.append(root);

    const els = new Map(); // id -> element

    function place(node, i, rowOverride = null) {
      const r = rowOverride ?? Math.floor(i / L.SIZE);
      node.style.setProperty('--r', r);
      node.style.setProperty('--c', i % L.SIZE);
    }

    function makeCandy(c, i, rowOverride = null) {
      const node = el('div.sw-snoep', { role: 'gridcell', html: candySvg(c.k, c.s) });
      node.dataset.id = c.id;
      node.dataset.look = `${c.k}${c.s}`;
      place(node, i, rowOverride);
      boardEl.append(node);
      els.set(c.id, node);
      return node;
    }

    /** Brengt het scherm exact in lijn met de toestand. */
    function sync() {
      const seen = new Set();
      state.grid.forEach((c, i) => {
        seen.add(c.id);
        let node = els.get(c.id);
        if (!node) node = makeCandy(c, i);
        else {
          place(node, i);
          const look = `${c.k}${c.s}`;
          if (node.dataset.look !== look) { node.dataset.look = look; node.innerHTML = candySvg(c.k, c.s); }
          node.classList.remove('weg', 'nieuw');
        }
        node.dataset.i = i;
        node.setAttribute('aria-label', `rij ${Math.floor(i / L.SIZE) + 1}, kolom ${(i % L.SIZE) + 1}: ${candyLabel(c)}`);
      });
      for (const [id, node] of els) if (!seen.has(id)) { node.remove(); els.delete(id); }
      renderMarks();
    }

    function renderMarks() {
      const focus = boardEl.matches(':focus-visible');
      state.grid.forEach((c, i) => {
        const node = els.get(c.id);
        if (!node) return;
        node.classList.toggle('gekozen', i === selected);
        node.classList.toggle('cursor', focus && i === cursor);
        node.classList.toggle('tip', !!hint && hint.includes(i));
      });
    }

    function renderHud() {
      movesEl.textContent = String(state.movesLeft);
      scoreEl.textContent = formatNumber(state.score);
      const pct = Math.min(1, state.score / (state.target * 2));
      fillEl.style.width = `${pct * 100}%`;
      bar.setAttribute('aria-valuemax', String(state.target * 2));
      bar.setAttribute('aria-valuenow', String(Math.min(state.score, state.target * 2)));
      bar.querySelectorAll('.sw-ster').forEach((s, k) => s.classList.toggle('behaald', L.starsFor(state.score, state.target) > k));
      goalEl.textContent = `Doel ${formatNumber(state.target)}`;
      movesEl.parentElement.classList.toggle('weinig', state.status === 'bezig' && state.movesLeft <= 3);
      fillLevels();
    }

    function fillLevels() {
      const max = stats.hoogsteNiveau;
      if (levelSel.options.length !== max || levelSel.dataset.stars !== stats.sterren.join(',')) {
        levelSel.replaceChildren(...Array.from({ length: max }, (_, k) => {
          const n = k + 1;
          const st = stats.sterren[k] || 0;
          return el('option', { value: n }, `Niveau ${n}${st ? ' ' + '★'.repeat(st) : ''}`);
        }));
        levelSel.dataset.stars = stats.sterren.join(',');
      }
      levelSel.value = String(state.level);
    }

    // ---------- Animatie-hulpjes ----------
    const anim = () => !ctx.reducedMotion();
    const wait = (ms) => new Promise((res) => setTimeout(res, anim() ? ms : 0));

    function popText(text, i, cls = '') {
      if (!anim()) return;
      const r = Math.floor(i / L.SIZE), c = i % L.SIZE;
      const p = el('div.sw-punten' + (cls ? '.' + cls : ''), {}, text);
      p.style.setProperty('--r', r);
      p.style.setProperty('--c', c);
      fxEl.append(p);
      setTimeout(() => p.remove(), 900);
    }

    function effectFx(e) {
      if (!anim()) return;
      const r = Math.floor(e.at / L.SIZE), c = e.at % L.SIZE;
      const node = el('div.sw-effect.' + ({ h: 'rij', v: 'kolom', b: 'ring', c: 'flits' }[e.s]));
      node.style.setProperty('--r', r);
      node.style.setProperty('--c', c);
      fxEl.append(node);
      setTimeout(() => node.remove(), 520);
    }

    function centroid(cells) {
      const r = Math.round(cells.reduce((n, x) => n + Math.floor(x.i / L.SIZE), 0) / cells.length);
      const c = Math.round(cells.reduce((n, x) => n + (x.i % L.SIZE), 0) / cells.length);
      return r * L.SIZE + c;
    }

    // ---------- Een zet ----------
    async function doMove(a, b) {
      if (busy || state.status !== 'bezig' || a < 0 || b < 0) return;
      busy = true;
      clearHint();
      selected = -1;
      const A = state.grid[a], B = state.grid[b];
      const res = L.applySwap(state, a, b);
      const elA = els.get(A.id), elB = els.get(B.id);
      place(elA, b); place(elB, a);
      renderMarks();
      await wait(T_SWAP);
      if (!alive) return;
      if (!res.ok) {
        sound.play('fout');
        place(elA, a); place(elB, b);
        await wait(T_SWAP);
        if (!alive) return;
        busy = false;
        live.textContent = 'Die wissel levert niets op.';
        scheduleHint();
        return;
      }
      // Toestand meteen bewaren: afsluiten tijdens de animatie verliest niets.
      const prevStatus = state.status;
      state = res.state;
      store.saveState(state);
      if (state.score > stats.besteScore) { stats = { ...stats, besteScore: state.score }; store.saveStats(stats); }
      sound.play('schuif');
      if (res.combo === 'alles') popText('Snoepstorm!', 27, 'groot');

      for (const ph of res.phases) {
        for (const e of ph.effects) effectFx(e);
        for (const c of ph.cleared) els.get(c.id)?.classList.add('weg');
        sound.play(ph.effects.length ? 'boem' : 'plop');
        if (ph.cleared.length) popText(`+${ph.points}`, centroid(ph.cleared));
        if (ph.combo >= 2) popText(COMBO_WORDS[Math.min(ph.combo, COMBO_WORDS.length - 1)], 19, 'woord');
        renderHudScore(ph);
        await wait(T_CLEAR);
        if (!alive) return;
        for (const c of ph.cleared) { els.get(c.id)?.remove(); els.delete(c.id); }
        for (const c of ph.created) makeCandy(c, c.i).classList.add('nieuw');
        for (const m of ph.moves) { const n = els.get(m.id); if (n) place(n, m.to); }
        const fresh = ph.spawns.map((s) => makeCandy(s, s.i, s.fromRow));
        void boardEl.offsetWidth; // startpositie vastleggen voor de val
        fresh.forEach((n, k) => place(n, ph.spawns[k].i));
        await wait(T_FALL);
        if (!alive) return;
      }
      if (res.shuffled) {
        live.textContent = 'Geen zetten meer: de snoepjes worden geschud.';
        ctx.toast('Geen zetten meer: geschud!');
        await wait(250);
        if (!alive) return;
      }
      sync();
      renderHud();
      announce(res);
      busy = false;
      if (state.status !== 'bezig' && prevStatus === 'bezig') finishLevel();
      else scheduleHint();
    }

    let shownScore = 0;
    function renderHudScore(ph) {
      shownScore += ph.points;
      scoreEl.textContent = formatNumber(shownScore);
    }

    function announce(res) {
      const n = res.phases.reduce((a, p) => a + p.cleared.length, 0);
      live.textContent = `${n} snoepjes weg, +${res.gained} punten. Nog ${state.movesLeft} ${state.movesLeft === 1 ? 'zet' : 'zetten'}.`;
    }

    function finishLevel() {
      const stars = L.starsFor(state.score, state.target);
      if (state.status === 'gehaald') {
        sound.play('winst');
        const sterren = stats.sterren.slice();
        while (sterren.length < state.level) sterren.push(0);
        sterren[state.level - 1] = Math.max(sterren[state.level - 1], stars);
        stats = { ...stats, sterren, hoogsteNiveau: Math.max(stats.hoogsteNiveau, state.level + 1) };
      } else {
        sound.play('einde');
      }
      store.saveStats(stats);
      renderHud();
      showEnd();
    }

    function starRow(n) {
      return `<span class="sw-sterren" aria-label="${n} van 3 sterren">${[0, 1, 2].map((k) => `<span class="${k < n ? 'aan' : ''}">★</span>`).join('')}</span>`;
    }

    function showEnd() {
      if (state.status === 'gehaald') {
        const n = L.starsFor(state.score, state.target);
        ctx.overlay(wrap, {
          title: `Niveau ${state.level} gehaald!`,
          text: `${starRow(n)}<br>Score: <strong>${formatNumber(state.score)}</strong>`,
          buttons: [
            { label: 'Volgend niveau', primary: true, onclick: () => startLevel(state.level + 1) },
            { label: 'Opnieuw', onclick: () => startLevel(state.level) },
          ],
        });
      } else if (state.status === 'mislukt') {
        ctx.overlay(wrap, {
          title: 'Zetten op',
          text: `Je had nog <strong>${formatNumber(state.target - state.score)}</strong> punten nodig voor niveau ${state.level}.`,
          buttons: [{ label: 'Opnieuw', primary: true, onclick: () => startLevel(state.level) }],
        });
      } else {
        ctx.clearOverlay(wrap);
      }
    }

    function startLevel(level) {
      state = startNew(Math.max(1, Math.min(level, stats.hoogsteNiveau)));
      resetBoard();
    }

    function resetBoard() {
      clearHint();
      selected = -1;
      busy = false;
      boardEl.replaceChildren();
      els.clear();
      shownScore = state.score;
      sync();
      renderHud();
      showEnd();
      scheduleHint();
    }

    async function changeLevel(level) {
      if (level === state.level) return;
      if (busy) { levelSel.value = String(state.level); return; }
      if (game.isInProgress(state)) {
        const ok = await ctx.confirm(`Je stopt met niveau ${state.level}.`, { title: `Naar niveau ${level}?`, ok: 'Wisselen', danger: true });
        if (!ok) { levelSel.value = String(state.level); return; }
      }
      startLevel(level);
    }

    // ---------- Tips ----------
    function clearHint() {
      clearTimeout(hintTimer);
      hintTimer = null;
      if (hint) { hint = null; renderMarks(); }
    }
    function scheduleHint() {
      clearTimeout(hintTimer);
      if (state.status !== 'bezig') return;
      hintTimer = setTimeout(() => {
        if (busy || !alive || state.status !== 'bezig' || document.querySelector('dialog[open]')) return;
        hint = L.findHint(state.grid);
        renderMarks();
      }, HINT_AFTER_MS);
    }

    // ---------- Aanraking en muis ----------
    function cellAt(x, y) {
      const rect = boardEl.getBoundingClientRect();
      const size = rect.width / L.SIZE;
      const c = Math.floor((x - rect.left) / size), r = Math.floor((y - rect.top) / size);
      if (r < 0 || r >= L.SIZE || c < 0 || c >= L.SIZE) return -1;
      return r * L.SIZE + c;
    }

    function tapCell(i) {
      if (busy || state.status !== 'bezig') return;
      clearHint();
      if (selected < 0) { selected = i; sound.play('tik'); }
      else if (selected === i) selected = -1;
      else if (L.isAdjacent(selected, i)) { const a = selected; selected = -1; doMove(a, i); return; }
      else { selected = i; sound.play('tik'); }
      renderMarks();
      scheduleHint();
    }

    let press = null;
    boardEl.addEventListener('pointerdown', (e) => {
      if (busy || state.status !== 'bezig' || e.button > 0) return;
      const i = cellAt(e.clientX, e.clientY);
      if (i < 0) return;
      e.preventDefault();
      boardEl.setPointerCapture?.(e.pointerId);
      press = { i, x: e.clientX, y: e.clientY, id: e.pointerId, used: false };
      cursor = i;
    });
    boardEl.addEventListener('pointermove', (e) => {
      if (!press || press.used || e.pointerId !== press.id) return;
      const dx = e.clientX - press.x, dy = e.clientY - press.y;
      const size = boardEl.getBoundingClientRect().width / L.SIZE;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < size * 0.35) return;
      press.used = true;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'rechts' : 'links') : (dy > 0 ? 'omlaag' : 'omhoog');
      const j = L.neighborIn(press.i, dir);
      selected = -1;
      if (j >= 0) doMove(press.i, j);
    });
    boardEl.addEventListener('pointerup', (e) => {
      if (!press || e.pointerId !== press.id) return;
      const p = press;
      press = null;
      if (!p.used) tapCell(p.i);
    });
    boardEl.addEventListener('pointercancel', () => { press = null; });

    // ---------- Toetsenbord ----------
    boardEl.addEventListener('focus', renderMarks);
    boardEl.addEventListener('blur', renderMarks);
    boardEl.addEventListener('keydown', (e) => {
      if (ctx.isBlocked(e)) return;
      const dirs = { ArrowUp: 'omhoog', ArrowDown: 'omlaag', ArrowLeft: 'links', ArrowRight: 'rechts' };
      if (dirs[e.key]) {
        e.preventDefault();
        const j = L.neighborIn(selected >= 0 ? selected : cursor, dirs[e.key]);
        if (j < 0) return;
        if (selected >= 0) { const a = selected; selected = -1; cursor = j; doMove(a, j); }
        else { cursor = j; renderMarks(); }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        tapCell(cursor);
      } else if (e.key === 'Escape' && selected >= 0) {
        selected = -1;
        renderMarks();
      }
    });

    resetBoard();

    const api = {
      isInProgress: () => game.isInProgress(state),
      newGame() { startLevel(state.level); },
      save() { store.saveState(state); },
      pause() { clearHint(); },
      destroy() { alive = false; clearHint(); },
      _debug: {
        get state() { return state; },
        set state(s) { state = s; resetBoard(); },
        swap: (a, b) => doMove(a, b),
        get busy() { return busy; },
      },
    };
    return api;
  },
};

export default game;
