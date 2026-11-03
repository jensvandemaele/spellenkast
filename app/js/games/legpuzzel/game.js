// Legpuzzel: scherm, slepen en tekenen van de stukjes. Regels en snijpatroon staan in logic.js.
import * as L from './logic.js';
import { IMAGES, IMAGE_IDS, drawImage } from './images.js';
import { el, formatTime, isNonNegInt } from '../../core/util.js';

const PAD = 8;
const MAX_SRC = 1600;
const ICON_EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>';
const ICON_SPREAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5" transform="rotate(12 17.5 7.5)"/><rect x="4" y="14" width="7" height="7" rx="1.5" transform="rotate(-10 7.5 17.5)"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></g></svg>';
const ICON_PHOTO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l1.6-2.2h6.8L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.6" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

const game = {
  id: 'legpuzzel',
  name: 'Legpuzzel',
  short: 'Leg de stukjes op hun plek tot de afbeelding compleet is. Ook met je eigen foto.',
  accent: 'var(--kleur-leg)',
  icon: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 13h10a4.5 4.5 0 1 1 9 0h10v10a4.5 4.5 0 1 1 0 9v10H26a4.5 4.5 0 1 0-9 0H7V32a4.5 4.5 0 1 0 0-9z" fill="currentColor" opacity=".3" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M7 13h10a4.5 4.5 0 1 1 9 0h10v10a4.5 4.5 0 1 1 0 9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/></svg>`,
  help: `<p>Sleep de losse stukjes naar hun plek op het bord. Ligt een stukje dichtbij genoeg, dan klikt het vast. Vastgeklikte stukjes liggen goed en bewegen niet meer.</p>
    <p>Je mag stukjes overal neerleggen, ook op elkaar. <strong>Opruimen</strong> spreidt alle losse stukjes weer netjes uit. <strong>Voorbeeld</strong> toont de afbeelding vaag op het bord.</p>
    <p><strong>Eigen foto:</strong> kies een foto van je apparaat; die wordt vierkant bijgesneden, verkleind en alleen op dit apparaat bewaard.</p>
    <p>Niveaus: <em>Makkelijk</em> 3×3, <em>Normaal</em> 4×4, <em>Moeilijk</em> 5×5, <em>Expert</em> 6×6 stukjes. Elke nieuwe puzzel heeft een andere snit, en de afbeeldingen variëren ook een beetje.</p>`,

  storage: {
    stateVersion: 1,
    statsVersion: 1,
    validateState: (s) => L.validateState(s, IMAGE_IDS),
    defaultStats: () => Object.fromEntries(L.LEVEL_IDS.map((l) => [l, { gespeeld: 0, opgelost: 0, besteTijd: 0 }])),
    validateStats: (s) => !!s && L.LEVEL_IDS.every((l) => s[l] && ['gespeeld', 'opgelost', 'besteTijd'].every((k) => isNonNegInt(s[l][k]))),
    prefsVersion: 1,
    defaultPrefs: () => ({ afbeelding: 'willekeurig', niveau: 'normaal', voorbeeld: false, foto: null }),
    validatePrefs: (p) => !!p
      && (p.afbeelding === 'willekeurig' || p.afbeelding === 'foto' || IMAGE_IDS.includes(p.afbeelding))
      && L.LEVEL_IDS.includes(p.niveau)
      && typeof p.voorbeeld === 'boolean'
      && (p.foto === null || L.validPhoto(p.foto))
      && (p.afbeelding !== 'foto' || p.foto !== null),
  },

  isFinished: (s) => s.done,
  isInProgress: (s) => !!s && !s.done && s.moves > 0,
  statLine(st) {
    const solved = L.LEVEL_IDS.reduce((n, l) => n + st[l].opgelost, 0);
    if (!solved) return 'Nog geen puzzels gelegd';
    const lv = L.LEVEL_IDS.find((l) => st[l].besteTijd);
    const best = lv ? ` · snelste (${L.LEVELS[lv].naam.toLowerCase()}) ${formatTime(st[lv].besteTijd)}` : '';
    return `${solved} ${solved === 1 ? 'puzzel' : 'puzzels'} gelegd${best}`;
  },

  mount(ctx, { fresh }) {
    const { store, sound } = ctx;
    let stats = store.loadStats();
    let prefs = store.loadPrefs();
    let state = fresh ? null : store.loadState();
    // Een stand met een eigen foto die er niet meer is, kan niet verder.
    if (state && state.image.kind === 'foto' && !prefs.foto) state = null;
    if (!state || state.done) state = startNew();

    function chooseImage() {
      if (prefs.afbeelding === 'foto' && prefs.foto) return { kind: 'foto' };
      const id = prefs.afbeelding === 'willekeurig' || prefs.afbeelding === 'foto'
        ? IMAGE_IDS[Math.floor(Math.random() * IMAGE_IDS.length)]
        : prefs.afbeelding;
      return { kind: 'thema', id, seed: Math.floor(Math.random() * 2 ** 31) };
    }

    function startNew() {
      const s = L.newGame(prefs.niveau, chooseImage());
      const st = stats[prefs.niveau];
      stats = { ...stats, [prefs.niveau]: { ...st, gespeeld: st.gespeeld + 1 } };
      store.saveStats(stats);
      store.saveState(s);
      return s;
    }

    // ---------- DOM ----------
    const imageSel = el('select', { 'aria-label': 'Afbeelding', onchange: (e) => changePrefs({ afbeelding: e.target.value }) });
    const levelSel = el('select', { 'aria-label': 'Aantal stukjes', onchange: (e) => changePrefs({ niveau: e.target.value }) },
      L.LEVEL_IDS.map((id) => { const n = L.LEVELS[id].n; return el('option', { value: id }, `${L.LEVELS[id].naam} (${n * n})`); }));
    const timeEl = el('output.waarde');
    const countEl = el('output.waarde');
    const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: true, onchange: onPhoto });
    const iconBtn = (icon, label, onclick) => el('button.knop.klein.lp-knop', { type: 'button', onclick, 'aria-label': label, title: label, html: `${icon}<span>${label}</span>` });
    const previewBtn = iconBtn(ICON_EYE, 'Voorbeeld', () => togglePreview());
    const spreadBtn = iconBtn(ICON_SPREAD, 'Opruimen', () => tidy());
    const photoBtn = iconBtn(ICON_PHOTO, 'Eigen foto', () => fileInput.click());
    const ghost = el('canvas.lp-voorbeeld', { 'aria-hidden': 'true' });
    const boardEl = el('div.lp-bord', { 'aria-hidden': 'true' }, ghost);
    const field = el('div.lp-veld.geen-scroll', { role: 'application', 'aria-label': 'Puzzelveld: sleep de stukjes naar het bord' }, boardEl);
    const live = el('p.sr-only', { 'aria-live': 'polite' });
    const root = el('div.spel.spel-legpuzzel',
      el('div.lp-keuzes', imageSel, levelSel),
      el('div.lp-balk',
        el('div.lp-info',
          el('span', { title: 'Tijd' }, '⏱ ', timeEl),
          el('span', { title: 'Stukjes op hun plek' }, '🧩 ', countEl)),
        el('div.lp-knoppen', previewBtn, spreadBtn, photoBtn, fileInput)),
      field,
      live);
    ctx.root.append(root);

    function fillImageOptions() {
      imageSel.replaceChildren(
        el('option', { value: 'willekeurig' }, 'Willekeurig'),
        IMAGE_IDS.map((id) => el('option', { value: id }, IMAGES[id].naam)),
        prefs.foto ? el('option', { value: 'foto' }, 'Eigen foto') : null);
      imageSel.value = prefs.afbeelding;
      levelSel.value = state.level;
    }

    // ---------- Afbeelding en stukjes ----------
    let pattern = null;
    let paths = [];
    let nodes = [];
    let layoutInfo = null;
    let photoImg = null;
    let photoKey = null;
    let srcCache = { key: null, canvas: null };
    let renderToken = 0;
    const hitCtx = document.createElement('canvas').getContext('2d');

    function buildPieces() {
      field.querySelectorAll('.lp-stuk').forEach((n) => n.remove());
      pattern = L.cutPattern(state.n, state.cutSeed);
      paths = [];
      nodes = [];
      for (let i = 0; i < state.n * state.n; i++) {
        const r = Math.floor(i / state.n), c = i % state.n;
        paths.push(new Path2D(L.piecePath(pattern, r, c)));
        const node = el('canvas.lp-stuk', { 'aria-hidden': 'true' });
        nodes.push(node);
        field.append(node);
      }
      fillImageOptions();
      layout();
    }

    async function photoImage() {
      if (photoImg && photoKey === prefs.foto) return photoImg;
      const img = new Image();
      img.src = prefs.foto;
      await img.decode();
      photoImg = img;
      photoKey = prefs.foto;
      return img;
    }

    /** De volledige afbeelding op de juiste resolutie (gecachet). */
    async function sourceCanvas(px) {
      const im = state.image;
      const key = `${im.kind}:${im.id || ''}:${im.seed || ''}:${px}:${im.kind === 'foto' ? prefs.foto?.length : ''}`;
      if (srcCache.key === key) return srcCache.canvas;
      const cv = document.createElement('canvas');
      cv.width = cv.height = px;
      const c2 = cv.getContext('2d');
      if (im.kind === 'foto') {
        const img = await photoImage();
        c2.drawImage(img, 0, 0, px, px);
      } else {
        drawImage(c2, im.id, px, im.seed);
      }
      srcCache = { key, canvas: cv };
      return cv;
    }

    function computeLayout() {
      const W = field.clientWidth, H = field.clientHeight;
      if (W < 50 || H < 50) return null;
      const n = state.n;
      const portrait = H >= W * 1.05;
      // Zo groot mogelijk bord, maar met minstens evenveel ruimte voor de losse stukjes als het bord zelf.
      const trayArea = (b) => (portrait ? (W - 2 * PAD) * (H - b - 3 * PAD) : (W - b - 3 * PAD) * (H - 2 * PAD));
      let B = portrait ? Math.min(W - 2 * PAD, (H - 2 * PAD) * 0.62) : Math.min(H - 2 * PAD, (W - 2 * PAD) * 0.62);
      while (B > 120 && trayArea(B) < B * B) B -= 4;
      let bx, by, tray;
      if (portrait) {
        bx = (W - B) / 2; by = PAD;
        tray = { x: PAD, y: by + B + PAD, w: W - 2 * PAD, h: H - by - B - 2 * PAD };
      } else {
        bx = PAD; by = (H - B) / 2;
        tray = { x: bx + B + PAD * 2, y: PAD, w: W - bx - B - 3 * PAD, h: H - 2 * PAD };
      }
      const S = B / n;
      const m = L.MARGIN * S;
      // Bereik voor de linkerbovenhoek van een stukje (zonder nopjes), zodat ook nopjes binnen beeld blijven.
      const range = { x0: m, y0: m, w: Math.max(1, W - S - 2 * m), h: Math.max(1, H - S - 2 * m) };
      const trayFrac = {
        x: (tray.x - range.x0) / range.w,
        y: (tray.y - range.y0) / range.h,
        w: Math.max(0, tray.w - S) / range.w,
        h: Math.max(0, tray.h - S) / range.h,
      };
      return { W, H, B, bx, by, S, m, range, trayFrac, dpr: Math.min(globalThis.devicePixelRatio || 1, 3) };
    }

    const toPx = (lay, p) => ({ x: lay.range.x0 + p.x * lay.range.w, y: lay.range.y0 + p.y * lay.range.h });
    const toFrac = (lay, x, y) => ({ x: (x - lay.range.x0) / lay.range.w, y: (y - lay.range.y0) / lay.range.h });
    const homeOf = (lay, i) => ({ x: lay.bx + (i % state.n) * lay.S, y: lay.by + Math.floor(i / state.n) * lay.S });

    function posOf(i) {
      const p = state.pieces[i];
      return p.placed || p.x === null ? homeOf(layoutInfo, i) : toPx(layoutInfo, p);
    }

    function setPos(node, x, y) {
      node.style.transform = `translate(${x - layoutInfo.m}px, ${y - layoutInfo.m}px)`;
    }

    function stackOrder() {
      // Vastgelegde stukjes onderaan, daarna de losse in tekenvolgorde.
      let z = 1;
      state.pieces.forEach((p, i) => { if (p.placed) nodes[i].style.zIndex = String(z++); });
      for (const i of state.order) if (!state.pieces[i].placed) nodes[i].style.zIndex = String(10 + z++);
    }

    function placeAll() {
      for (let i = 0; i < nodes.length; i++) {
        const { x, y } = posOf(i);
        setPos(nodes[i], x, y);
        nodes[i].classList.toggle('vast', !!state.pieces[i].placed);
      }
      stackOrder();
    }

    async function layout() {
      const lay = computeLayout();
      if (!lay) return;
      layoutInfo = lay;
      boardEl.style.left = `${lay.bx}px`;
      boardEl.style.top = `${lay.by}px`;
      boardEl.style.width = boardEl.style.height = `${lay.B}px`;
      boardEl.style.setProperty('--n', state.n);
      // Nog niet uitgestrooide stukjes krijgen een plek in het vak naast/onder het bord.
      if (state.pieces.some((p) => !p.placed && p.x === null)) {
        const loose = state.order.filter((i) => !state.pieces[i].placed && state.pieces[i].x === null);
        const spots = L.scatterPositions(loose.length, lay.trayFrac);
        const map = new Map(loose.map((i, k) => [i, spots[k]]));
        state = L.scatter(state, (i) => map.get(i));
        store.saveState(state);
      }
      const size = Math.round(lay.S * (1 + 2 * L.MARGIN));
      for (const node of nodes) {
        node.style.width = node.style.height = `${size}px`;
        node.width = node.height = Math.round(size * lay.dpr);
      }
      placeAll();
      renderUi();
      const token = ++renderToken;
      const px = Math.min(MAX_SRC, Math.round(lay.B * lay.dpr));
      let src;
      try { src = await sourceCanvas(px); }
      catch (e) {
        console.warn('Afbeelding kon niet worden geladen', e);
        if (state.image.kind === 'foto') { ctx.toast('De foto kon niet worden geladen.'); prefs = { ...prefs, afbeelding: 'willekeurig' }; store.savePrefs(prefs); api.newGame(); }
        return;
      }
      if (token !== renderToken) return;
      drawPieces(src, lay);
      drawGhost(src, lay);
    }

    function drawPieces(src, lay) {
      const n = state.n;
      for (let i = 0; i < nodes.length; i++) {
        const r = Math.floor(i / n), c = i % n;
        const g = nodes[i].getContext('2d');
        const unit = lay.S * lay.dpr;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, nodes[i].width, nodes[i].height);
        g.setTransform(unit, 0, 0, unit, unit * L.MARGIN, unit * L.MARGIN);
        g.save();
        g.clip(paths[i]);
        g.drawImage(src, -c, -r, n, n);
        // lichte rand binnenin geeft wat diepte
        g.lineWidth = 3 / lay.S;
        g.strokeStyle = 'rgba(255,255,255,.35)';
        g.translate(0.6 / lay.S, 0.6 / lay.S);
        g.stroke(paths[i]);
        g.restore();
        g.lineWidth = 1.3 / lay.S;
        g.strokeStyle = 'rgba(0,0,0,.5)';
        g.stroke(paths[i]);
      }
    }

    function drawGhost(src, lay) {
      ghost.width = ghost.height = Math.round(lay.B * lay.dpr);
      const g = ghost.getContext('2d');
      g.drawImage(src, 0, 0, ghost.width, ghost.height);
    }

    function renderUi() {
      const placed = L.placedCount(state);
      countEl.textContent = `${placed}/${state.n * state.n}`;
      timeEl.textContent = formatTime(state.elapsedMs);
      previewBtn.setAttribute('aria-pressed', String(prefs.voorbeeld));
      previewBtn.classList.toggle('aan', prefs.voorbeeld);
      field.classList.toggle('met-voorbeeld', prefs.voorbeeld);
      field.classList.toggle('af', state.done);
      spreadBtn.disabled = state.done;
    }

    // ---------- Tijd ----------
    let lastTick = performance.now();
    let sinceSave = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      const dt = now - lastTick;
      lastTick = now;
      if (state.done || !state.moves || document.visibilityState !== 'visible' || document.querySelector('dialog[open]')) return;
      state.elapsedMs += Math.min(dt, 2000);
      timeEl.textContent = formatTime(state.elapsedMs);
      sinceSave += dt;
      if (sinceSave > 5000) { sinceSave = 0; store.saveState(state); }
    }, 1000);

    // ---------- Slepen ----------
    function fieldPoint(e) {
      const rect = field.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function hitPiece(pt) {
      const order = state.order.slice().reverse();
      for (const i of order) {
        if (state.pieces[i].placed) continue;
        const p = posOf(i);
        const ux = (pt.x - p.x) / layoutInfo.S, uy = (pt.y - p.y) / layoutInfo.S;
        if (ux < -L.MARGIN || uy < -L.MARGIN || ux > 1 + L.MARGIN || uy > 1 + L.MARGIN) continue;
        if (hitCtx.isPointInPath(paths[i], ux, uy)) return i;
      }
      return -1;
    }

    let drag = null; // { i, dx, dy, id, x, y }
    field.addEventListener('pointerdown', (e) => {
      if (!layoutInfo || state.done || e.button > 0 || e.target.closest('.overlay')) return;
      const pt = fieldPoint(e);
      const i = hitPiece(pt);
      if (i < 0) return;
      e.preventDefault();
      field.setPointerCapture?.(e.pointerId);
      const p = posOf(i);
      drag = { i, dx: pt.x - p.x, dy: pt.y - p.y, id: e.pointerId, x: p.x, y: p.y };
      state = L.bringToFront(state, i);
      stackOrder();
      nodes[i].classList.add('sleept');
      sound.play('kaart');
    });
    field.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const pt = fieldPoint(e);
      const lay = layoutInfo;
      drag.x = Math.max(lay.range.x0, Math.min(lay.range.x0 + lay.range.w, pt.x - drag.dx));
      drag.y = Math.max(lay.range.y0, Math.min(lay.range.y0 + lay.range.h, pt.y - drag.dy));
      setPos(nodes[drag.i], drag.x, drag.y);
    });
    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      nodes[d.i].classList.remove('sleept');
      drop(d.i, d.x, d.y);
    };
    field.addEventListener('pointerup', endDrag);
    field.addEventListener('pointercancel', endDrag);

    function drop(i, x, y) {
      const home = homeOf(layoutInfo, i);
      const dist = Math.hypot(x - home.x, y - home.y) / layoutInfo.S;
      const wasStarted = state.moves > 0;
      const res = L.dropPiece(state, i, dist, toFrac(layoutInfo, x, y));
      state = res.state;
      if (!wasStarted) lastTick = performance.now();
      store.saveState(state);
      if (res.snapped) {
        const node = nodes[i];
        node.classList.add('klikt');
        setPos(node, home.x, home.y);
        setTimeout(() => node.classList.remove('klikt'), 260);
        sound.play(res.done ? 'winst' : 'gevonden');
        live.textContent = `Stukje op zijn plek. ${L.placedCount(state)} van ${state.n * state.n}.`;
      }
      placeAll();
      renderUi();
      if (res.done) finish();
    }

    function finish() {
      const st = stats[state.level];
      const t = Math.max(1000, Math.round(state.elapsedMs));
      const record = !st.besteTijd || t < st.besteTijd;
      stats = { ...stats, [state.level]: { ...st, opgelost: st.opgelost + 1, besteTijd: record ? t : st.besteTijd } };
      store.saveStats(stats);
      setTimeout(() => showDone(record), ctx.reducedMotion() ? 0 : 450);
    }

    function showDone(record = false) {
      if (!state.done) { ctx.clearOverlay(field); return; }
      const best = stats[state.level].besteTijd;
      ctx.overlay(field, {
        title: 'Puzzel af!',
        text: `${state.n * state.n} stukjes in <strong>${formatTime(state.elapsedMs)}</strong>${record ? ' · nieuw record' : best ? ` · record ${formatTime(best)}` : ''}`,
        buttons: [
          { label: 'Nieuwe puzzel', primary: true, onclick: () => api.newGame() },
          { label: 'Bekijken', onclick: () => ctx.clearOverlay(field) },
        ],
      });
    }

    // ---------- Knoppen ----------
    function togglePreview() {
      prefs = { ...prefs, voorbeeld: !prefs.voorbeeld };
      store.savePrefs(prefs);
      renderUi();
    }

    function tidy() {
      if (!layoutInfo || state.done) return;
      const loose = state.order.filter((i) => !state.pieces[i].placed);
      const spots = L.scatterPositions(loose.length, layoutInfo.trayFrac);
      const map = new Map(loose.map((i, k) => [i, spots[k]]));
      state = L.scatter(state, (i) => map.get(i), true);
      store.saveState(state);
      field.classList.add('animeer');
      placeAll();
      setTimeout(() => field.classList.remove('animeer'), 320);
      sound.play('schuif');
    }

    async function changePrefs(patch) {
      const next = { ...prefs, ...patch };
      if (game.isInProgress(state)) {
        const ok = await ctx.confirm('De huidige puzzel wordt gewist en er komt een nieuwe.', { title: 'Nieuwe puzzel?', ok: 'Nieuwe puzzel', danger: true });
        if (!ok) { fillImageOptions(); return; }
      }
      prefs = next;
      store.savePrefs(prefs);
      api.newGame();
    }

    async function onPhoto(e) {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      let data;
      try { data = await shrinkPhoto(file); }
      catch (err) {
        console.warn('Foto niet bruikbaar', err);
        ctx.toast('Deze foto kon niet worden geopend.');
        return;
      }
      if (game.isInProgress(state)) {
        const ok = await ctx.confirm('De huidige puzzel wordt gewist en er komt een puzzel van je foto.', { title: 'Puzzel van je foto?', ok: 'Maak puzzel', danger: true });
        if (!ok) return;
      }
      const next = { ...prefs, foto: data, afbeelding: 'foto' };
      if (!store.savePrefs(next)) return; // opslag vol: melding komt van de app
      prefs = next;
      photoImg = null;
      api.newGame();
    }

    // ---------- Herschalen ----------
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => layout());
    });
    ro.observe(field);

    buildPieces();
    showDone();

    const api = {
      isInProgress: () => game.isInProgress(state),
      newGame() {
        state = startNew();
        drag = null;
        ctx.clearOverlay(field);
        buildPieces();
        showDone();
      },
      save() { store.saveState(state); },
      destroy() { clearInterval(timer); ro.disconnect(); cancelAnimationFrame(raf); },
      _debug: {
        get state() { return state; },
        set state(s) { state = s; buildPieces(); showDone(); },
        get layout() { return layoutInfo; },
        /** Legt stukje i op scherm-positie (x, y) in het veld neer, zoals bij slepen. */
        drop: (i, x, y) => drop(i, x, y),
        home: (i) => homeOf(layoutInfo, i),
        pos: (i) => posOf(i),
      },
    };
    return api;
  },
};

/** Snijdt een foto vierkant bij, verkleint hem en geeft een JPEG-data-URL terug die in de opslag past. */
async function shrinkPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) throw new Error('Lege afbeelding');
    const side = Math.min(w, h);
    for (const [size, q] of [[960, 0.84], [800, 0.78], [640, 0.72], [520, 0.66]]) {
      const px = Math.min(size, side);
      const cv = document.createElement('canvas');
      cv.width = cv.height = px;
      cv.getContext('2d').drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, px, px);
      const data = cv.toDataURL('image/jpeg', q);
      if (L.validPhoto(data)) return data;
    }
    throw new Error('Foto te groot');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default game;
