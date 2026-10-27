// App-brede instellingen: geluid, animaties en weergave.

export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS = Object.freeze({
  geluid: true,
  animaties: 'auto', // 'auto' | 'aan' | 'uit'
  thema: 'auto',     // 'auto' | 'licht' | 'donker'
});

export function validateSettings(s) {
  return !!s && typeof s === 'object'
    && typeof s.geluid === 'boolean'
    && ['auto', 'aan', 'uit'].includes(s.animaties)
    && ['auto', 'licht', 'donker'].includes(s.thema);
}

export function createSettings(storage) {
  let current = {
    ...DEFAULT_SETTINGS,
    ...storage.read('instellingen', {
      version: SETTINGS_VERSION,
      validate: validateSettings,
      fallback: () => ({ ...DEFAULT_SETTINGS }),
    }),
  };
  const listeners = new Set();

  return {
    get: () => ({ ...current }),
    set(patch) {
      const next = { ...current, ...patch };
      if (!validateSettings(next)) return false;
      current = next;
      storage.write('instellingen', SETTINGS_VERSION, current);
      for (const fn of listeners) fn(current);
      return true;
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    reducedMotion() {
      if (current.animaties === 'aan') return false;
      if (current.animaties === 'uit') return true;
      return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    },
  };
}
