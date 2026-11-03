// Mijnenveger: scherm en bediening. Spelregels staan in logic.js.
import * as L from './logic.js';
import { el, formatTime, isNonNegInt } from '../../core/util.js';

const LONG_PRESS_MS = 380;
const MOVE_TOLERANCE = 12;

const FLAG_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3v14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M6.6 3.4 15 6.6 6.6 9.8z" fill="var(--mv-vlag)"/><path d="M3.5 17h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const MINE_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 2.5v15M2.5 10h15M4.7 4.7l10.6 10.6M15.3 4.7 4.7 15.3"/></g><circle cx="10" cy="10" r="5" fill="currentColor"/><circle cx="8.3" cy="8.3" r="1.3" fill="#fff" opacity=".8"/></svg>';

const game = {
  id: 'mijnenveger',
  name: 'Mijnenveger',
  short: 'Draai alle veilige vakjes om zonder op een mijn te stappen.',
  accent: 'var(--kleur-mijn)',
  icon: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="5" width="38" height="38" rx="6" fill="currentColor" opacity=".18"/><g fill="currentColor" opacity=".45"><rect x="8" y="8" width="9" height="9" rx="2"/><rect x="19.5" y="8" width="9" height="9" rx="2"/><rect x="31" y="31" width="9" height="9" rx="2"/><rect x="8" y="31" width="9" height="9" rx="2"/></g><g stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M30 14v14M23 21h14M25 16l10 10M35 16 25 26"/></g><circle cx="30" cy="21" r="5.2" fill="currentColor"/><text x="12.5" y="27.5" font-size="10" font-weight="800" text-anchor="middle" fill="currentColor" font-family="system-ui">2</text></svg>`,
  help: `<p>Onder sommige vakjes ligt een mijn. Draai alle vakjes <em>zonder</em> mijn om en je wint.</p>
    <p>Een getal vertelt hoeveel mijnen er in de acht vakjes eromheen liggen. Een leeg vakje opent vanzelf zijn buren. Je eerste tik is altijd veilig.</p>
    <p><strong>Vlag zetten:</strong> houd een vakje even ingedrukt, klik met de rechtermuisknop, of zet de knop <em>Vlag</em> aan en tik.</p>
    <p><strong>Snel openen:</strong> tik op een getal waar al evenveel vlaggen omheen staan; dan gaan alle andere buren open. Staat een vlag verkeerd, dan kan dat een mijn raken.</p>
    <p><strong>Toetsenbord:</strong> pijltjes om te bewegen, Enter of spatie om te openen, F voor een vlag.</p>
    <p>Niveaus: <em>Makkelijk</em> 9×9 met 10 mijnen, <em>Normaal</em> 12×12 met 24, <em>Moeilijk</em> 16×16 met 40.</p>`,

  storage: {
    stateVersion: 1,
    statsVersion: 1,
    validateState: L.validateState,
    defaultStats: () => Object.fromEntries(L.LEVEL_IDS.map((l) => [l, { gespeeld: 0, gewonnen: 0, besteTijd: 0 }])),
    validateStats: (s) => !!s && L.LEVEL_IDS.every((l) => s[l] && ['gespeeld', 'gewonnen', 'besteTijd'].every((k) => isNonNegInt(s[l][k]))),
    prefsVersion: 1,
    defaultPrefs: () => ({ niveau: 'makkelijk' }),
    validatePrefs: (p) => !!p && L.LEVEL_IDS.includes(p.niveau),
  },

  isFinished: (s) => s.status !== 'bezig',
  isInProgress: (s) => !!s && s.status === 'bezig' && !!s.mines,
  statLine(st) {
    const won = L.LEVEL_IDS.reduce((n, l) => n + st[l].gewonnen, 0);
    const played = L.LEVEL_IDS.reduce((n, l) => n + st[l].gespeeld, 0);
    if (!played) return 'Nog niet gespeeld';
    const best = L.LEVEL_IDS.map((l) => (st[l].besteTijd ? `${L.LEVELS[l].naam.toLowerCase()} ${formatTime(st[l].besteTijd)}` : null)).filter(Boolean)[0];
    return `${won} van ${played} gewonnen${best ? ` · snelste ${best}` : ''}`;
  },

  mount(ctx, { fresh }) {
    const { store, sound } = ctx;
    let stats = store.loadStats();
    let prefs = store.loadPrefs();
    let state = fresh ? null : store.loadState();
    if (!state || state.status !== 'bezig') state = startNew();
    let flagMode = false;
    let cursor = 0;

    function startNew() {
      const s = L.newGame(prefs.niveau);
      store.saveState(s);
      return s;
    }

    // ---------- DOM ----------
    const levelSel = el('select', { 'aria-label': 'Moeilijkheid', onchange: (e) => changeLevel(e.target.value) },
      L.LEVEL_IDS.map((id) => el('option', { value: id }, L.LEVELS[id].naam)));
    const minesEl = el('output.waarde');
    const timeEl = el('output.waarde');
    const flagBtn = el('button.knop.klein.mv-vlagknop', { type: 'button', 'aria-label': 'Vlagmodus', title: 'Vlagmodus: tikken zet een vlag', 'aria-pressed': 'false', html: `${FLAG_SVG}<span>Vlag</span>`, onclick: () => setFlagMode(!flagMode) });
    const boardEl = el('div.mv-bord', { role: 'grid', tabindex: '0', 'aria-label': 'Mijnenveld' });
    const wrap = el('div.mv-houder.geen-scroll', {}, boardEl);
    const live = el('p.sr-only', { 'aria-live': 'polite' });
    const root = el('div.spel.spel-mijnenveger',
      el('div.mv-balk',
        levelSel,
        el('div.mv-info',
          el('span', { title: 'Mijnen over' }, el('span.mv-ico', { html: MINE_SVG }), minesEl),
          el('span', { title: 'Tijd' }, '⏱ ', timeEl)),
        flagBtn),
      wrap,
      el('p.tip', {}, 'Lang indrukken of rechtsklikken zet een vlag.'),
      live);
    ctx.root.append(root);

    let cells = [];
    function buildBoard() {
      boardEl.replaceChildren();
      boardEl.style.setProperty('--rijen', state.rows);
      boardEl.style.setProperty('--kolommen', state.cols);
      wrap.style.setProperty('--verhouding', `${state.cols} / ${state.rows}`);
      cells = [];
      for (let r = 0; r < state.rows; r++) {
        const row = el('div.mv-rij', { role: 'row' });
        for (let c = 0; c < state.cols; c++) {
          const cell = el('div.mv-vak', { role: 'gridcell', dataset: { i: r * state.cols + c } });
          cells.push(cell);
          row.append(cell);
        }
        boardEl.append(row);
      }
      levelSel.value = state.level;
      cursor = Math.min(cursor, state.rows * state.cols - 1);
      render();
    }

    function render(justOpened = null) {
      const cnt = state.mines ? L.counts(state) : null;
      const mines = L.mineSet(state);
      const lost = state.status === 'verloren';
      const wrong = lost ? new Set(L.wrongFlags(state)) : null;
      const focus = boardEl.matches(':focus-visible');
      const anim = justOpened && !ctx.reducedMotion() ? new Set(justOpened) : null;
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const open = !!state.open[i];
        const flag = !!state.flags[i];
        const isMine = mines.has(i);
        let kind; let label;
        if (open && isMine) { kind = 'mijn'; label = 'mijn'; }
        else if (open) { kind = 'open'; label = cnt[i] ? String(cnt[i]) : 'leeg'; }
        else if (lost && wrong.has(i)) { kind = 'fout'; label = 'vlag, geen mijn'; }
        else if (flag) { kind = 'vlag'; label = 'vlag'; }
        else if (lost && isMine) { kind = 'mijn-toon'; label = 'mijn'; }
        else { kind = 'dicht'; label = 'dicht'; }
        const n = kind === 'open' ? cnt[i] : 0;
        const key = `${kind}:${n}:${i === state.exploded ? 1 : 0}`;
        if (cell.dataset.k !== key) {
          cell.dataset.k = key;
          cell.className = 'mv-vak ' + kind + (n ? ` n${n}` : '') + (i === state.exploded ? ' boem' : '');
          if (kind === 'open') cell.textContent = n ? String(n) : '';
          else if (kind === 'vlag' || kind === 'fout') cell.innerHTML = FLAG_SVG;
          else if (kind === 'mijn' || kind === 'mijn-toon') cell.innerHTML = MINE_SVG;
          else cell.textContent = '';
          const r = Math.floor(i / state.cols), c = i % state.cols;
          cell.setAttribute('aria-label', `rij ${r + 1}, kolom ${c + 1}: ${label}`);
        }
        cell.classList.toggle('cursor', focus && i === cursor);
        if (anim && anim.has(i)) cell.classList.add('nieuw');
        else cell.classList.remove('nieuw');
      }
      minesEl.textContent = String(L.minesLeft(state));
      timeEl.textContent = formatTime(state.elapsedMs);
      flagBtn.setAttribute('aria-pressed', String(flagMode));
      flagBtn.classList.toggle('aan', flagMode);
    }

    // ---------- Tijd ----------
    let lastTick = performance.now();
    let sinceSave = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      const dt = now - lastTick;
      lastTick = now;
      if (state.status !== 'bezig' || !state.mines || document.visibilityState !== 'visible' || document.querySelector('dialog[open]')) return;
      state.elapsedMs += Math.min(dt, 2000);
      timeEl.textContent = formatTime(state.elapsedMs);
      sinceSave += dt;
      if (sinceSave > 5000) { sinceSave = 0; store.saveState(state); }
    }, 1000);

    // ---------- Acties ----------
    function act(i) {
      if (state.status !== 'bezig') return;
      if (flagMode && !state.open[i]) { flag(i); return; }
      const wasStarted = !!state.mines;
      const res = L.tap(state, i);
      if (res.state === state) {
        if (state.open[i]) sound.play('tik');
        return;
      }
      state = res.state;
      if (!wasStarted) {
        const s = stats[state.level];
        stats = { ...stats, [state.level]: { ...s, gespeeld: s.gespeeld + 1 } };
        store.saveStats(stats);
        lastTick = performance.now();
      }
      store.saveState(state);
      render(res.opened);
      if (res.exploded) lose();
      else if (res.won) win();
      else {
        sound.play(res.opened.length > 1 ? 'schuif' : 'tik');
        live.textContent = res.opened.length > 1 ? `${res.opened.length} vakjes geopend` : '';
      }
    }

    function flag(i) {
      const res = L.toggleFlag(state, i);
      if (!res.changed) return;
      state = res.state;
      store.saveState(state);
      sound.play('vlag');
      try { navigator.vibrate?.(12); } catch { /* */ }
      render();
      live.textContent = state.flags[i] ? 'Vlag gezet' : 'Vlag weggehaald';
    }

    function win() {
      sound.play('winst');
      const s = stats[state.level];
      const t = Math.max(1000, Math.round(state.elapsedMs));
      const record = !s.besteTijd || t < s.besteTijd;
      stats = { ...stats, [state.level]: { ...s, gewonnen: s.gewonnen + 1, besteTijd: record ? t : s.besteTijd } };
      store.saveStats(stats);
      showEnd(record);
    }

    function lose() {
      sound.play('boem');
      try { navigator.vibrate?.([30, 40, 60]); } catch { /* */ }
      live.textContent = 'Boem! Je raakte een mijn.';
      setTimeout(() => { if (state.status === 'verloren') showEnd(false); }, ctx.reducedMotion() ? 0 : 650);
    }

    function showEnd(record = false) {
      if (state.status === 'gewonnen') {
        const best = stats[state.level].besteTijd;
        ctx.overlay(wrap, {
          title: 'Veld geveegd!',
          text: `Tijd: <strong>${formatTime(state.elapsedMs)}</strong>${record ? ' · nieuw record' : best ? ` · record ${formatTime(best)}` : ''}`,
          buttons: [{ label: 'Nieuw spel', primary: true, onclick: () => api.newGame() }],
        });
      } else if (state.status === 'verloren') {
        ctx.overlay(wrap, {
          title: 'Boem!',
          text: 'Je stapte op een mijn.',
          buttons: [
            { label: 'Opnieuw', primary: true, onclick: () => api.newGame() },
            { label: 'Bord bekijken', onclick: () => ctx.clearOverlay(wrap) },
          ],
        });
      } else {
        ctx.clearOverlay(wrap);
      }
    }

    function setFlagMode(on) {
      flagMode = on;
      render();
    }

    async function changeLevel(level) {
      if (level === state.level && !game.isInProgress(state)) return;
      if (game.isInProgress(state)) {
        const ok = await ctx.confirm('Het lopende spel wordt gewist.', { title: 'Ander niveau?', ok: 'Nieuw spel', danger: true });
        if (!ok) { levelSel.value = state.level; return; }
      }
      prefs = { ...prefs, niveau: level };
      store.savePrefs(prefs);
      api.newGame();
    }

    // ---------- Aanraking en muis ----------
    const cellIndex = (e) => {
      const t = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.mv-vak');
      return t && boardEl.contains(t) ? Number(t.dataset.i) : -1;
    };
    let press = null; // { i, x, y, id, timer, done }
    boardEl.addEventListener('pointerdown', (e) => {
      if (state.status !== 'bezig') return;
      const i = cellIndex(e);
      if (i < 0) return;
      cursor = i;
      if (e.pointerType === 'mouse' && e.button === 2) { e.preventDefault(); flag(i); return; }
      if (e.button > 0) return;
      e.preventDefault();
      clearTimeout(press?.timer);
      press = { i, x: e.clientX, y: e.clientY, id: e.pointerId, done: false };
      cells[i].classList.add('ingedrukt');
      if (!state.open[i]) {
        press.timer = setTimeout(() => {
          if (!press || press.i !== i) return;
          press.done = true;
          cells[i].classList.remove('ingedrukt');
          if (flagMode) act(i); else flag(i);
        }, LONG_PRESS_MS);
      }
    });
    boardEl.addEventListener('pointermove', (e) => {
      if (!press || e.pointerId !== press.id) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE) cancelPress();
    });
    function cancelPress() {
      if (!press) return;
      clearTimeout(press.timer);
      cells[press.i]?.classList.remove('ingedrukt');
      press = null;
    }
    boardEl.addEventListener('pointerup', (e) => {
      if (!press || e.pointerId !== press.id) return;
      const p = press;
      cancelPress();
      if (!p.done) act(p.i);
    });
    boardEl.addEventListener('pointercancel', cancelPress);
    boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---------- Toetsenbord ----------
    boardEl.addEventListener('focus', () => render());
    boardEl.addEventListener('blur', () => render());
    boardEl.addEventListener('keydown', (e) => {
      if (ctx.isBlocked(e)) return;
      const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (moves[e.key]) {
        e.preventDefault();
        const [dr, dc] = moves[e.key];
        const r = Math.max(0, Math.min(state.rows - 1, Math.floor(cursor / state.cols) + dr));
        const c = Math.max(0, Math.min(state.cols - 1, (cursor % state.cols) + dc));
        cursor = r * state.cols + c;
        render();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        act(cursor);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        flag(cursor);
      }
    });

    buildBoard();
    showEnd();

    const api = {
      isInProgress: () => game.isInProgress(state),
      newGame() {
        state = startNew();
        cancelPress();
        buildBoard();
        showEnd();
      },
      save() { store.saveState(state); },
      destroy() { clearInterval(timer); cancelPress(); },
      _debug: {
        get state() { return state; },
        set state(s) { state = s; buildBoard(); showEnd(); },
        tap: (i) => act(i),
        flag: (i) => flag(i),
      },
    };
    return api;
  },
};

export default game;
