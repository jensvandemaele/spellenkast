// Blokval: scherm, spellus en bediening. Spelregels staan in logic.js.
import * as L from './logic.js';
import { el, formatNumber, isNonNegInt } from '../../core/util.js';

const COLORS = { I: '#4fa3b3', O: '#d6b245', T: '#9474c2', S: '#68a865', Z: '#cc6656', J: '#5374b5', L: '#dd8846' };
const LOCK_DELAY = 500;
const MAX_LOCK_RESETS = 15;
const DAS = 170;   // vertraging voor herhalen (ms)
const ARR = 50;    // herhaalsnelheid zijwaarts (ms)
const SOFT = 35;   // herhaalsnelheid versneld vallen (ms)

const game = {
  id: 'blokval',
  name: 'Blokval',
  short: 'Stapel vallende blokken en maak volle rijen vrij.',
  accent: 'var(--kleur-blokval)',
  icon: `<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="currentColor"><rect x="6" y="30" width="11" height="11" rx="2"/><rect x="18" y="30" width="11" height="11" rx="2"/><rect x="30" y="30" width="11" height="11" rx="2" opacity=".55"/><rect x="18" y="18" width="11" height="11" rx="2"/><rect x="30" y="6" width="11" height="11" rx="2" opacity=".55"/><rect x="30" y="18" width="11" height="11" rx="2" opacity=".55"/></g></svg>`,
  help: `<p>Blokken vallen van boven naar beneden. Schuif en draai ze zodat ze volle horizontale rijen vormen: een volle rij verdwijnt en levert punten op.</p>
    <p><strong>Toetsenbord:</strong> ← → schuiven, ↑ of X rechtsom draaien, Z linksom draaien, ↓ sneller vallen, spatie meteen laten vallen, P of Esc pauze.</p>
    <p><strong>Aanraken:</strong> gebruik de knoppen onder het bord, of tik op het bord om te draaien, sleep opzij om te schuiven en veeg snel omlaag om te laten vallen.</p>
    <p>Elke tien rijen ga je een niveau omhoog en vallen de blokken sneller. Het spel is voorbij als een nieuw blok geen ruimte meer heeft.</p>
    <p>Punten: 1, 2, 3 of 4 rijen tegelijk = 100, 300, 500 of 800 × niveau. Versneld vallen levert 1 punt per rij, meteen laten vallen 2.</p>`,

  storage: {
    stateVersion: 1,
    statsVersion: 1,
    validateState: L.validateState,
    defaultStats: () => ({ beste: 0, meesteRijen: 0, hoogsteNiveau: 0, gespeeld: 0 }),
    validateStats: (s) => !!s && ['beste', 'meesteRijen', 'hoogsteNiveau', 'gespeeld'].every((k) => isNonNegInt(s[k])),
  },

  isFinished: (s) => s.over,
  isInProgress: (s) => !!s && !s.over && s.pieces > 0,
  statLine: (st) => (st.gespeeld ? `Beste score: ${formatNumber(st.beste)} · ${st.meesteRijen} rijen` : 'Nog niet gespeeld'),

  mount(ctx, { fresh }) {
    const { store, sound } = ctx;
    let stats = store.loadStats();
    let state = fresh ? null : store.loadState();
    let paused = false;
    if (!state) state = startNew();
    else if (!state.over) paused = true; // hervat altijd in pauze

    let lockTimer = 0;
    let lockResets = 0;
    let fallAcc = 0;
    let raf = 0;
    let lastT = 0;
    let dirty = true;
    let colors = {};

    function startNew() {
      const s = L.newGame();
      stats = { ...stats, gespeeld: stats.gespeeld + 1 };
      store.saveStats(stats);
      store.saveState(s);
      return s;
    }

    // ---------- DOM ----------
    const canvas = el('canvas.blokval-bord', { role: 'img', 'aria-label': 'Speelveld' });
    const nextCanvas = el('canvas.blokval-volgende', { width: 80, height: 80, 'aria-hidden': 'true' });
    const scoreEl = el('output.waarde');
    const linesEl = el('output.waarde');
    const levelEl = el('output.waarde');
    const pauseBtn = el('button.knop.klein', { type: 'button', onclick: () => togglePause() }, 'Pauze');
    const live = el('p.sr-only', { 'aria-live': 'polite' });
    const boardWrap = el('div.blokval-houder.geen-scroll', {}, canvas);

    const ctrl = (label, aria, action, repeat) => {
      const b = el('button.knop.bediening', { type: 'button', 'aria-label': aria }, label);
      bindHold(b, action, repeat);
      return b;
    };
    const controls = el('div.blokval-knoppen.geen-scroll',
      ctrl('↺', 'Draai linksom', () => doRotate(-1), 0),
      ctrl('←', 'Naar links', () => doMove(-1), ARR),
      ctrl('↓', 'Sneller vallen', () => doSoft(), SOFT),
      ctrl('→', 'Naar rechts', () => doMove(1), ARR),
      ctrl('↻', 'Draai rechtsom', () => doRotate(1), 0),
      ctrl('⤓', 'Meteen laten vallen', () => doHard(), 0));

    const side = el('div.blokval-zij',
      el('div.scorevak', el('span.label', {}, 'Score'), scoreEl),
      el('div.scorevak', el('span.label', {}, 'Rijen'), linesEl),
      el('div.scorevak', el('span.label', {}, 'Niveau'), levelEl),
      el('div.scorevak.volgende', el('span.label', {}, 'Volgende'), nextCanvas),
      pauseBtn);

    const root = el('div.spel.spel-blokval', el('div.blokval-midden', boardWrap, side), controls, live);
    ctx.root.append(root);

    // ---------- Weergave ----------
    let cell = 20;
    function readColors() {
      const cs = getComputedStyle(root);
      colors = {
        bg: cs.getPropertyValue('--kaart-bg').trim() || '#fff',
        grid: cs.getPropertyValue('--rand').trim() || '#ddd',
      };
      dirty = true;
    }

    function resize() {
      const r = boardWrap.getBoundingClientRect();
      const c = Math.max(8, Math.floor(Math.min(r.width / L.W, r.height / L.H)));
      if (c === cell && canvas.dataset.klaar) { dirty = true; draw(); return; }
      canvas.dataset.klaar = '1';
      cell = c;
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${cell * L.W}px`;
      canvas.style.height = `${cell * L.H}px`;
      canvas.width = Math.round(cell * L.W * dpr);
      canvas.height = Math.round(cell * L.H * dpr);
      canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      const ns = 80 * dpr;
      nextCanvas.width = ns; nextCanvas.height = ns;
      nextCanvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty = true;
      draw();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(boardWrap);

    function block(g, x, y, s, color, alpha = 1) {
      g.globalAlpha = alpha;
      g.fillStyle = color;
      const p = Math.max(1, s * 0.06);
      const rad = Math.max(1.5, s * 0.18);
      g.beginPath();
      g.roundRect(x + p, y + p, s - 2 * p, s - 2 * p, rad);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.beginPath();
      g.roundRect(x + p, y + p, s - 2 * p, (s - 2 * p) * 0.4, [rad, rad, 0, 0]);
      g.fill();
      g.globalAlpha = 1;
    }

    function draw() {
      if (!dirty) return;
      dirty = false;
      const g = canvas.getContext('2d');
      const w = cell * L.W, h = cell * L.H;
      g.clearRect(0, 0, w, h);
      g.fillStyle = colors.bg;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = colors.grid;
      g.lineWidth = 1;
      g.beginPath();
      for (let c = 1; c < L.W; c++) { g.moveTo(c * cell + 0.5, 0); g.lineTo(c * cell + 0.5, h); }
      for (let r = 1; r < L.H; r++) { g.moveTo(0, r * cell + 0.5); g.lineTo(w, r * cell + 0.5); }
      g.globalAlpha = 0.5; g.stroke(); g.globalAlpha = 1;

      for (let r = 0; r < L.H; r++) {
        for (let c = 0; c < L.W; c++) {
          const t = state.board[r][c];
          if (t) block(g, c * cell, r * cell, cell, COLORS[t], state.over ? 0.5 : 1);
        }
      }
      if (state.piece && !state.over) {
        {
          // Schaduw: waar het blok terechtkomt.
          const gr = L.ghostRow(state);
          for (const [r, c] of L.cellsOf({ ...state.piece, row: gr })) {
            if (r < 0) continue;
            g.strokeStyle = COLORS[state.piece.type];
            g.globalAlpha = 0.55;
            g.lineWidth = Math.max(1.5, cell * 0.08);
            g.beginPath();
            g.roundRect(c * cell + cell * 0.12, r * cell + cell * 0.12, cell * 0.76, cell * 0.76, cell * 0.16);
            g.stroke();
            g.globalAlpha = 1;
          }
        }
        for (const [r, c] of L.cellsOf(state.piece)) if (r >= 0) block(g, c * cell, r * cell, cell, COLORS[state.piece.type]);
      }
      drawNext();
      scoreEl.textContent = formatNumber(state.score);
      linesEl.textContent = String(state.lines);
      levelEl.textContent = String(state.level);
    }

    function drawNext() {
      const g = nextCanvas.getContext('2d');
      g.clearRect(0, 0, 80, 80);
      const type = state.queue[0];
      if (!type) return;
      const cells = L.cellsOf({ type, rot: 0, row: 0, col: 0 });
      const rows = cells.map(([r]) => r), cols = cells.map(([, c]) => c);
      const minR = Math.min(...rows), maxR = Math.max(...rows), minC = Math.min(...cols), maxC = Math.max(...cols);
      const s = 16;
      const ox = (80 - (maxC - minC + 1) * s) / 2, oy = (80 - (maxR - minR + 1) * s) / 2;
      for (const [r, c] of cells) block(g, ox + (c - minC) * s, oy + (r - minR) * s, s, COLORS[type]);
    }

    // ---------- Spellus ----------
    function running() { return !paused && !state.over; }

    function loop(t) {
      raf = 0;
      if (!running()) { draw(); return; }
      const dt = Math.min(100, t - (lastT || t));
      lastT = t;
      if (L.isGrounded(state)) {
        lockTimer += dt;
        if (lockTimer >= LOCK_DELAY) doLock();
      } else {
        fallAcc += dt;
        const g = L.gravityMs(state.level);
        while (fallAcc >= g && running()) {
          fallAcc -= g;
          if (!L.fall(state)) { fallAcc = 0; break; }
          dirty = true;
        }
      }
      draw();
      if (running()) raf = requestAnimationFrame(loop);
    }

    function startLoop() {
      if (!raf && running()) { lastT = 0; raf = requestAnimationFrame(loop); }
    }

    function afterAction(ok) {
      if (!ok) return;
      dirty = true;
      if (L.isGrounded(state) && lockResets < MAX_LOCK_RESETS) { lockTimer = 0; lockResets++; }
      draw();
    }

    function doMove(dc) { if (running()) afterAction(L.move(state, dc)); }
    function doRotate(dir) {
      if (!running()) return;
      const ok = L.rotate(state, dir);
      if (ok) sound.play('tik');
      afterAction(ok);
    }
    function doSoft() {
      if (!running()) return;
      if (L.softDrop(state)) { fallAcc = 0; dirty = true; draw(); }
    }
    function doHard() {
      if (!running()) return;
      const res = L.hardDrop(state);
      onLocked(res);
    }
    function doLock() {
      const res = L.lock(state);
      onLocked(res);
    }

    function onLocked(res) {
      lockTimer = 0; lockResets = 0; fallAcc = 0; dirty = true;
      if (res?.cleared) {
        sound.play('rij');
        live.textContent = `${res.cleared} ${res.cleared === 1 ? 'rij' : 'rijen'} weg`;
        if (!ctx.reducedMotion()) { boardWrap.classList.remove('flits'); void boardWrap.offsetWidth; boardWrap.classList.add('flits'); }
      } else sound.play('vast');
      if (state.over) gameOver();
      store.saveState(state);
      draw();
    }

    function gameOver() {
      sound.play('einde');
      stats = {
        ...stats,
        beste: Math.max(stats.beste, state.score),
        meesteRijen: Math.max(stats.meesteRijen, state.lines),
        hoogsteNiveau: Math.max(stats.hoogsteNiveau, state.level),
      };
      store.saveStats(stats);
      showOverlay();
    }

    function showOverlay() {
      if (state.over) {
        ctx.overlay(boardWrap, {
          title: 'Spel voorbij',
          text: `Score <strong>${formatNumber(state.score)}</strong> · ${state.lines} rijen · niveau ${state.level}`,
          buttons: [{ label: 'Opnieuw', primary: true, onclick: () => api.newGame() }],
        });
      } else if (paused) {
        ctx.overlay(boardWrap, {
          title: 'Gepauzeerd',
          buttons: [{ label: 'Doorgaan', primary: true, onclick: () => setPaused(false) }],
        });
      } else {
        ctx.clearOverlay(boardWrap);
      }
      pauseBtn.textContent = paused ? 'Verder' : 'Pauze';
      pauseBtn.disabled = state.over;
    }

    function setPaused(p) {
      if (state.over) return;
      if (p === paused) return;
      paused = p;
      stopRepeat();
      if (paused) store.saveState(state);
      showOverlay();
      startLoop();
    }
    function togglePause() { setPaused(!paused); }

    // ---------- Ingedrukt houden (knoppen en toetsen) ----------
    let repeatTimer = 0;
    let repeatKey = null;
    function stopRepeat() { clearTimeout(repeatTimer); repeatTimer = 0; repeatKey = null; }
    function startRepeat(key, action, interval) {
      stopRepeat();
      repeatKey = key;
      action();
      if (!interval) return;
      const first = interval === SOFT ? SOFT : DAS;
      const tick = () => { if (repeatKey !== key) return; action(); repeatTimer = setTimeout(tick, interval); };
      repeatTimer = setTimeout(tick, first);
    }
    function bindHold(btn, action, interval) {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture?.(e.pointerId);
        startRepeat(btn, action, interval);
      });
      const end = () => { if (repeatKey === btn) stopRepeat(); };
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointercancel', end);
      btn.addEventListener('lostpointercapture', end);
      // Toetsenbord op de knop zelf (Tab + Enter/spatie)
      btn.addEventListener('click', (e) => { if (e.detail === 0) action(); });
    }

    const KEYMAP = {
      ArrowLeft: [() => doMove(-1), ARR], ArrowRight: [() => doMove(1), ARR],
      ArrowDown: [() => doSoft(), SOFT],
      ArrowUp: [() => doRotate(1), 0], x: [() => doRotate(1), 0], X: [() => doRotate(1), 0],
      z: [() => doRotate(-1), 0], Z: [() => doRotate(-1), 0],
      ' ': [() => doHard(), 0],
    };
    function onKeyDown(e) {
      if (ctx.isBlocked(e)) return;
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { e.preventDefault(); togglePause(); return; }
      if (e.key === 'Enter' && paused && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); setPaused(false); return; }
      const m = KEYMAP[e.key];
      if (!m) return;
      e.preventDefault();
      if (e.repeat) return;
      startRepeat(e.key, m[0], m[1]);
    }
    function onKeyUp(e) { if (repeatKey === e.key) stopRepeat(); }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // ---------- Gebaren op het bord ----------
    let gest = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (!running()) return;
      canvas.setPointerCapture?.(e.pointerId);
      gest = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), moved: false };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!gest || e.pointerId !== gest.id || !running()) return;
      const dx = e.clientX - gest.x;
      const dy = e.clientY - gest.y;
      if (Math.abs(dx) >= cell) {
        const steps = Math.trunc(dx / cell);
        for (let i = 0; i < Math.abs(steps); i++) doMove(Math.sign(steps));
        gest.x += steps * cell; gest.moved = true;
      }
      if (dy >= cell) {
        const steps = Math.trunc(dy / cell);
        for (let i = 0; i < steps; i++) doSoft();
        gest.y += steps * cell; gest.moved = true;
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!gest || e.pointerId !== gest.id) return;
      const dt = performance.now() - gest.t0;
      const totalDy = e.clientY - gest.y0;
      const totalDx = e.clientX - gest.x0;
      if (dt < 250 && totalDy > cell * 3 && totalDy > Math.abs(totalDx) * 2) doHard();
      else if (!gest.moved && dt < 300 && Math.hypot(totalDx, totalDy) < 10) doRotate(1);
      gest = null;
    });
    canvas.addEventListener('pointercancel', () => { gest = null; });

    // ---------- Thema-wijzigingen ----------
    const offSettings = ctx.settings.onChange(() => requestAnimationFrame(readColors));
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => requestAnimationFrame(() => { readColors(); draw(); });
    mq.addEventListener?.('change', onScheme);
    const onBlur = () => setPaused(true);
    window.addEventListener('blur', onBlur);

    readColors();
    resize();
    showOverlay();
    startLoop();

    const api = {
      isInProgress: () => game.isInProgress(state),
      newGame() {
        stopRepeat();
        state = startNew();
        paused = false; lockTimer = 0; lockResets = 0; fallAcc = 0; dirty = true;
        showOverlay();
        draw();
        startLoop();
      },
      pause() { setPaused(true); },
      save() { store.saveState(state); },
      destroy() {
        stopRepeat();
        cancelAnimationFrame(raf);
        ro.disconnect();
        offSettings();
        mq.removeEventListener?.('change', onScheme);
        window.removeEventListener('blur', onBlur);
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
      },
      _debug: { get state() { return state; }, get paused() { return paused; } },
    };
    return api;
  },
};

export default game;
