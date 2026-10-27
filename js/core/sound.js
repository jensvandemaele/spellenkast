// Kleine, gesynthetiseerde geluidjes via Web Audio: geen audiobestanden nodig, werkt offline.

const SOUNDS = {
  tik:      [{ f: 660, d: 0.04, type: 'triangle', g: 0.08 }],
  schuif:   [{ f: 300, d: 0.05, type: 'sine', g: 0.07 }],
  samen:    [{ f: 520, d: 0.06, type: 'triangle', g: 0.1 }, { f: 780, d: 0.08, type: 'triangle', g: 0.08, at: 0.05 }],
  vast:     [{ f: 180, d: 0.06, type: 'square', g: 0.04 }],
  rij:      [{ f: 523, d: 0.08, type: 'triangle', g: 0.1 }, { f: 659, d: 0.08, type: 'triangle', g: 0.1, at: 0.07 }, { f: 784, d: 0.12, type: 'triangle', g: 0.1, at: 0.14 }],
  gevonden: [{ f: 587, d: 0.08, type: 'sine', g: 0.12 }, { f: 880, d: 0.14, type: 'sine', g: 0.1, at: 0.08 }],
  fout:     [{ f: 160, d: 0.12, type: 'sawtooth', g: 0.035 }],
  kaart:    [{ f: 900, d: 0.025, type: 'triangle', g: 0.06 }],
  winst:    [{ f: 523, d: 0.12, type: 'triangle', g: 0.12 }, { f: 659, d: 0.12, type: 'triangle', g: 0.12, at: 0.12 }, { f: 784, d: 0.12, type: 'triangle', g: 0.12, at: 0.24 }, { f: 1047, d: 0.3, type: 'triangle', g: 0.12, at: 0.36 }],
  einde:    [{ f: 392, d: 0.18, type: 'sine', g: 0.1 }, { f: 330, d: 0.18, type: 'sine', g: 0.1, at: 0.16 }, { f: 262, d: 0.3, type: 'sine', g: 0.1, at: 0.32 }],
};

export function createSound(settings) {
  let ctx = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { ctx = null; }
    return ctx;
  }

  // iOS staat audio pas toe na een gebruikersactie.
  const unlock = () => {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  };
  globalThis.addEventListener?.('pointerdown', unlock, { passive: true });
  globalThis.addEventListener?.('keydown', unlock);

  return {
    play(name) {
      if (!settings.get().geluid) return;
      const notes = SOUNDS[name];
      const c = ensure();
      if (!notes || !c || c.state !== 'running') return;
      const now = c.currentTime;
      for (const n of notes) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = n.type;
        o.frequency.value = n.f;
        const t0 = now + (n.at || 0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(n.g, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.d);
        o.connect(g).connect(c.destination);
        o.start(t0);
        o.stop(t0 + n.d + 0.02);
      }
    },
  };
}
