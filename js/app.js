// Spellenkast: opstarten, navigatie, startpagina en instellingen.
import { createStorage } from './core/storage.js';
import { createSettings } from './core/settings.js';
import { createSound } from './core/sound.js';
import { createGameStore } from './core/gamestore.js';
import { showDialog, confirmDialog, toast, overlay, clearOverlay } from './core/ui.js';
import { el } from './core/util.js';
import { GAMES, findGame } from './games/registry.js';

export const APP_VERSION = '1.0.0';

const storage = createStorage();
const settings = createSettings(storage);
const sound = createSound(settings);

const $view = document.getElementById('weergave');
const $back = document.getElementById('terug');
const $title = document.getElementById('titel');
const $actions = document.getElementById('acties');

let current = null; // { game, instance, container }

// ---------- Weergave-instellingen ----------
function applyAppearance() {
  const s = settings.get();
  const html = document.documentElement;
  if (s.thema === 'auto') html.removeAttribute('data-thema');
  else html.dataset.thema = s.thema;
  html.dataset.beweging = settings.reducedMotion() ? 'uit' : 'aan';
}
settings.onChange(applyAppearance);
matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', applyAppearance);
applyAppearance();

// ---------- Meldingen over opslag ----------
let warnedCorrupt = false;
function onStorageProblem(p) {
  console.warn('Opslagprobleem:', p.kind, p.key, p.detail);
  if (p.kind === 'beschadigd' && !warnedCorrupt) {
    warnedCorrupt = true;
    setTimeout(() => toast('Een beschadigde opgeslagen stand is overgeslagen. Je begint opnieuw.'), 300);
  } else if (p.kind === 'schrijffout') {
    toast('Opslaan lukte niet: de opslag is vol of geblokkeerd.');
  }
}
storage.onProblem(onStorageProblem);
storage.problems.forEach(onStorageProblem);

// ---------- Contexten voor spellen ----------
function isBlocked(e) {
  if (document.querySelector('dialog[open]')) return true;
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  const t = e.target;
  return !!t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
}

function makeCtx(game, container) {
  return {
    root: container,
    store: createGameStore(storage, game),
    sound,
    settings,
    reducedMotion: () => settings.reducedMotion(),
    confirm: confirmDialog,
    toast,
    overlay,
    clearOverlay,
    isBlocked,
  };
}

// ---------- Navigatie ----------
function setTopbar({ title, back, actions = [] }) {
  $title.textContent = title;
  $back.hidden = !back;
  $actions.replaceChildren(...actions.map((a) =>
    el('button.knop.klein' + (a.cls ? '.' + a.cls : ''), { type: 'button', onclick: a.onclick, 'aria-label': a.aria || a.label, title: a.aria || a.label }, a.label)));
}

function leaveGame() {
  if (!current) return;
  try { current.instance.save?.(); } catch { /* */ }
  try { current.instance.destroy?.(); } catch { /* */ }
  current = null;
}

function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [id, mode] = hash.split('/');
  const game = id ? findGame(decodeURIComponent(id)) : null;
  leaveGame();
  if (game) showGame(game, { fresh: mode === 'nieuw' });
  else showHome();
}

function go(path, { replace = false } = {}) {
  const url = '#/' + path;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  route();
}

$back.addEventListener('click', () => go(''));
window.addEventListener('popstate', route);

// ---------- Startpagina ----------
function showHome() {
  document.body.dataset.scherm = 'start';
  setTopbar({
    title: 'Spellenkast',
    back: false,
    actions: [{ label: '⚙︎', aria: 'Instellingen', onclick: openSettings, cls: 'icoon' }],
  });
  const list = el('ul.spellenlijst', { role: 'list' });
  for (const game of GAMES) {
    const store = createGameStore(storage, game);
    const resumable = store.hasResumable();
    const stats = store.loadStats();
    const play = el('button.knop.primair', { type: 'button', onclick: () => go(encodeURIComponent(game.id)) },
      resumable ? 'Hervatten' : 'Spelen');
    const fresh = resumable
      ? el('button.knop', {
        type: 'button',
        onclick: async () => {
          const ok = await confirmDialog(`Je lopende spel ${game.name} wordt gewist. Nieuw spel beginnen?`, { ok: 'Nieuw spel', danger: true });
          if (ok) go(encodeURIComponent(game.id) + '/nieuw');
        },
      }, 'Nieuw spel')
      : null;
    list.append(el('li.spelkaart', { style: { '--accent': game.accent }, dataset: { spel: game.id } },
      el('div.spelkaart-icoon', { html: game.icon }),
      el('div.spelkaart-tekst',
        el('h2', {}, game.name),
        el('p', {}, game.short),
        el('p.stat', {}, game.statLine(stats))),
      el('div.spelkaart-knoppen', play, fresh)));
  }
  $view.replaceChildren(el('section.start', { 'aria-label': 'Spellen' }, list, offlineStatusEl()));
  $view.focus({ preventScroll: true });
}

// ---------- Spelscherm ----------
function showGame(game, { fresh }) {
  document.body.dataset.scherm = 'spel';
  const container = el('section.spelscherm', { 'aria-label': game.name, style: { '--accent': game.accent } });
  $view.replaceChildren(container);
  const ctx = makeCtx(game, container);
  const instance = game.mount(ctx, { fresh });
  current = { game, instance, container };
  if (fresh) history.replaceState(null, '', '#/' + encodeURIComponent(game.id));

  setTopbar({
    title: game.name,
    back: true,
    actions: [
      { label: '?', aria: 'Uitleg', cls: 'icoon', onclick: () => { instance.pause?.(); showDialog({ title: `Zo speel je ${game.name}`, body: game.help }); } },
      { label: 'Nieuw', aria: 'Nieuw spel', onclick: () => newGameRequested() },
    ],
  });
}

async function newGameRequested() {
  if (!current) return;
  const { instance, game } = current;
  if (instance.isInProgress?.()) {
    instance.pause?.();
    const ok = await confirmDialog(`Je lopende spel ${game.name} wordt gewist.`, { title: 'Nieuw spel beginnen?', ok: 'Nieuw spel', danger: true });
    if (!ok) return;
  }
  instance.newGame();
}

// ---------- Opslaan bij onderbreken ----------
function saveNow() {
  try { current?.instance.save?.(); } catch { /* */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    try { current?.instance.pause?.(); } catch { /* */ }
    saveNow();
  }
});
window.addEventListener('pagehide', saveNow);

// ---------- Instellingen ----------
function offlineStatusEl() {
  const p = el('p.offline-status', { id: 'offline-status' });
  updateOfflineStatus(p);
  return p;
}

async function updateOfflineStatus(node = document.getElementById('offline-status')) {
  if (!node) return;
  if (!('serviceWorker' in navigator)) {
    node.textContent = 'Offline gebruik is in deze browser niet beschikbaar.';
    return;
  }
  if (!window.isSecureContext) {
    node.textContent = 'Offline gebruik vereist https of localhost.';
    return;
  }
  const reg = await navigator.serviceWorker.getRegistration();
  node.textContent = reg?.active ? '✓ Klaar voor offline gebruik' : 'Offline gebruik wordt voorbereid…';
  node.classList.toggle('ok', !!reg?.active);
}

async function storageSummary() {
  const lines = [];
  if (!storage.persistent) {
    lines.push('Opslag is in deze browser geblokkeerd (bijv. privévenster): voortgang verdwijnt bij sluiten.');
  } else if (navigator.storage?.persisted) {
    const p = await navigator.storage.persisted().catch(() => false);
    lines.push(p ? 'Opslag is als blijvend gemarkeerd.' : 'De browser mag de opslag bij ruimtegebrek opruimen.');
  }
  return lines.join(' ');
}

async function openSettings() {
  const s = settings.get();
  const sel = (name, value, opts) => el('select', { id: 'inst-' + name, onchange: (e) => settings.set({ [name]: e.target.value }) },
    opts.map(([v, l]) => el('option', { value: v, selected: v === value }, l)));
  const geluid = el('input', { type: 'checkbox', id: 'inst-geluid', checked: s.geluid, onchange: (e) => settings.set({ geluid: e.target.checked }) });

  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: importBackup });
  const body = el('div.instellingen',
    el('label.rij', { for: 'inst-geluid' }, el('span', {}, 'Geluid'), geluid),
    el('label.rij', { for: 'inst-animaties' }, el('span', {}, 'Animaties'),
      sel('animaties', s.animaties, [['auto', 'Volg systeem'], ['aan', 'Aan'], ['uit', 'Uit']])),
    el('label.rij', { for: 'inst-thema' }, el('span', {}, 'Weergave'),
      sel('thema', s.thema, [['auto', 'Volg systeem'], ['licht', 'Licht'], ['donker', 'Donker']])),
    el('h3', {}, 'Gegevens'),
    el('p.klein', {}, 'Alles wordt alleen op dit apparaat bewaard. ', el('span', { id: 'opslag-info' })),
    el('div.knoppenrij',
      el('button.knop', { type: 'button', onclick: exportBackup }, 'Reservekopie maken'),
      el('button.knop', { type: 'button', onclick: () => fileInput.click() }, 'Terugzetten'),
      fileInput),
    el('button.knop.gevaar', { type: 'button', onclick: wipeAll }, 'Alle gegevens wissen'),
    el('p.klein.versie', {}, `Spellenkast ${APP_VERSION}`));
  storageSummary().then((t) => { const n = body.querySelector('#opslag-info'); if (n) n.textContent = t; });
  await showDialog({ title: 'Instellingen', body });
  if (!current) showHome();
}

function exportBackup() {
  const data = JSON.stringify(storage.exportAll(), null, 1);
  const blob = new Blob([data], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `spellenkast-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function importBackup(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    const ok = await confirmDialog('Je huidige voortgang wordt vervangen door de reservekopie.', { title: 'Reservekopie terugzetten?', ok: 'Terugzetten', danger: true });
    if (!ok) return;
    storage.clearAll();
    const n = storage.importAll(obj);
    toast(`${n} onderdelen teruggezet.`);
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    toast(err.message.startsWith('Dit is') ? err.message : 'Dit bestand kon niet worden gelezen.');
  }
}

async function wipeAll() {
  const ok = await confirmDialog('Alle lopende spellen, scores en instellingen op dit apparaat worden gewist. Dit kan niet ongedaan worden gemaakt.', { title: 'Alles wissen?', ok: 'Alles wissen', danger: true });
  if (!ok) return;
  storage.clearAll();
  location.hash = '';
  location.reload();
}

// ---------- Service worker en updates ----------
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    const offerUpdate = (worker) => {
      if (!worker || !navigator.serviceWorker.controller) return;
      const bar = document.getElementById('update');
      bar.hidden = false;
      bar.querySelector('button').onclick = () => {
        saveNow();
        worker.postMessage('activeer');
      };
    };
    if (reg.waiting) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed') offerUpdate(w);
        if (w.state === 'activated') updateOfflineStatus();
      });
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      // Alleen herladen als de gebruiker de update koos (anders: eerste installatie).
      if (!document.getElementById('update').hidden) { reloading = true; location.reload(); }
    });
    navigator.serviceWorker.ready.then(() => updateOfflineStatus());
    // Vraag de browser de gegevens niet zomaar op te ruimen.
    navigator.storage?.persist?.().catch(() => {});
  } catch (e) {
    console.warn('Service worker niet geregistreerd', e);
  }
}

// ---------- Start ----------
route();
registerServiceWorker();

// Voor geautomatiseerde tests.
window.__spellenkast = {
  get current() { return current; },
  storage,
  settings,
  version: APP_VERSION,
};
