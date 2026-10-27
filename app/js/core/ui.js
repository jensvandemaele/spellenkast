// Gedeelde interface-onderdelen: dialoogvensters, meldingen en overlays.
import { el } from './util.js';

let dialog;

function getDialog() {
  if (!dialog) {
    dialog = document.getElementById('dialoog');
  }
  return dialog;
}

/**
 * Toont een modaal venster. Knoppen: [{ label, value, primary, danger }].
 * Geeft een Promise met de value van de gekozen knop (of null bij annuleren).
 */
export function showDialog({ title, body, buttons = [{ label: 'Sluiten', value: true, primary: true }], wide = false }) {
  const d = getDialog();
  return new Promise((resolve) => {
    d.className = wide ? 'breed' : '';
    d.replaceChildren();
    const content = typeof body === 'string' ? el('div.dialoog-tekst', { html: body }) : body;
    const actions = el('div.dialoog-knoppen');
    let result = null;
    for (const b of buttons) {
      actions.append(el('button.knop' + (b.primary ? '.primair' : '') + (b.danger ? '.gevaar' : ''), {
        type: 'button',
        onclick: () => { result = b.value; d.close(); },
      }, b.label));
    }
    d.append(el('h2', { id: 'dialoog-titel' }, title), content, actions);
    d.setAttribute('aria-labelledby', 'dialoog-titel');
    const onClose = () => { d.removeEventListener('close', onClose); resolve(result); };
    d.addEventListener('close', onClose);
    d.showModal();
    const focusBtn = actions.querySelector('.primair') || actions.querySelector('button');
    focusBtn?.focus();
  });
}

export function confirmDialog(message, { title = 'Weet je het zeker?', ok = 'Ja', cancel = 'Annuleren', danger = false } = {}) {
  return showDialog({
    title,
    body: el('p', {}, message),
    buttons: [
      { label: cancel, value: false },
      { label: ok, value: true, primary: !danger, danger },
    ],
  }).then((v) => v === true);
}

let toastTimer;
export function toast(message, ms = 2600) {
  const t = document.getElementById('melding');
  if (!t) return;
  t.textContent = message;
  t.classList.add('zichtbaar');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('zichtbaar'), ms);
}

/** Overlay over een spelbord (pauze, gewonnen, game-over). */
export function overlay(container, { title, text, buttons }) {
  container.querySelector(':scope > .overlay')?.remove();
  const o = el('div.overlay', { role: 'dialog', 'aria-modal': 'false', 'aria-label': title },
    el('div.overlay-kaart',
      el('h2', {}, title),
      text ? el('p', { html: text }) : null,
      el('div.overlay-knoppen', buttons.map((b) =>
        el('button.knop' + (b.primary ? '.primair' : ''), { type: 'button', onclick: b.onclick }, b.label))),
    ));
  container.append(o);
  o.querySelector('.primair, button')?.focus({ preventScroll: true });
  return { remove: () => o.remove() };
}

export function clearOverlay(container) {
  container.querySelector(':scope > .overlay')?.remove();
}
