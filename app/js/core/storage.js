// Lokale opslag met versiebeheer, migratie en bescherming tegen beschadigde gegevens.
// Elk record wordt bewaard als JSON: { v: <formaatversie>, t: <tijdstip>, d: <gegevens> }.

export const PREFIX = 'spellenkast:';

function probeLocalStorage() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const k = PREFIX + '__test';
    ls.setItem(k, '1');
    ls.removeItem(k);
    return ls;
  } catch {
    return null;
  }
}

function memoryBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

/**
 * @param {Storage|null} backend  Een Storage-achtig object; null = alleen in geheugen.
 */
export function createStorage(backend = probeLocalStorage()) {
  const persistent = !!backend;
  const be = backend ?? memoryBackend();
  const listeners = new Set();
  const problems = [];

  function report(kind, key, detail) {
    const p = { kind, key, detail: String(detail ?? '') };
    problems.push(p);
    for (const fn of listeners) { try { fn(p); } catch { /* negeren */ } }
  }

  function quarantine(key, raw, reason) {
    try { be.setItem(key + ':kapot', raw); } catch { /* geen ruimte: dan maar weg */ }
    try { be.removeItem(key); } catch { /* */ }
    report('beschadigd', key, reason);
  }

  /**
   * Leest een record. Geeft altijd een bruikbare waarde terug (of fallback()).
   * @param {string} name
   * @param {{version:number, migrate?:(data:any, from:number)=>any, validate?:(data:any)=>boolean, fallback?:()=>any}} opts
   */
  function read(name, { version, migrate, validate, fallback = () => null }) {
    const key = PREFIX + name;
    let raw;
    try { raw = be.getItem(key); } catch (e) { report('leesfout', key, e); return fallback(); }
    if (raw == null) return fallback();

    let rec;
    try { rec = JSON.parse(raw); } catch (e) { quarantine(key, raw, 'geen geldige JSON'); return fallback(); }
    if (!rec || typeof rec !== 'object' || typeof rec.v !== 'number' || !('d' in rec)) {
      quarantine(key, raw, 'onbekende structuur');
      return fallback();
    }
    let { v, d } = rec;
    if (v > version) {
      // Opgeslagen door een nieuwere versie van de app: niet overschrijven, wel negeren.
      report('nieuwer-formaat', key, `versie ${v} > ${version}`);
      try { be.setItem(key + ':nieuwer', raw); } catch { /* */ }
      return fallback();
    }
    if (v < version) {
      try {
        if (!migrate) throw new Error('geen migratie beschikbaar');
        d = migrate(d, v);
      } catch (e) {
        quarantine(key, raw, 'migratie mislukt: ' + e.message);
        return fallback();
      }
    }
    let ok = false;
    try { ok = validate ? !!validate(d) : true; } catch { ok = false; }
    if (!ok) { quarantine(key, raw, 'gegevens ongeldig'); return fallback(); }
    if (v < version) write(name, version, d);
    return d;
  }

  function write(name, version, data) {
    const key = PREFIX + name;
    try {
      be.setItem(key, JSON.stringify({ v: version, t: Date.now(), d: data }));
      return true;
    } catch (e) {
      report('schrijffout', key, e && e.name);
      return false;
    }
  }

  function remove(name) {
    try { be.removeItem(PREFIX + name); } catch { /* */ }
  }

  function keys() {
    const out = [];
    try {
      for (let i = 0; i < be.length; i++) {
        const k = be.key(i);
        if (k && k.startsWith(PREFIX)) out.push(k);
      }
    } catch { /* */ }
    return out;
  }

  /** Alle gegevens van de app als één object (voor reservekopie). */
  function exportAll() {
    const items = {};
    for (const k of keys()) {
      if (k.endsWith(':kapot') || k.endsWith(':nieuwer')) continue;
      try { items[k.slice(PREFIX.length)] = JSON.parse(be.getItem(k)); } catch { /* */ }
    }
    return { app: 'spellenkast', exportVersie: 1, gemaakt: new Date().toISOString(), items };
  }

  /** Zet een reservekopie terug. Geeft het aantal teruggezette records. */
  function importAll(obj) {
    if (!obj || obj.app !== 'spellenkast' || typeof obj.items !== 'object') {
      throw new Error('Dit is geen reservekopie van Spellenkast.');
    }
    let n = 0;
    for (const [name, rec] of Object.entries(obj.items)) {
      if (!rec || typeof rec.v !== 'number' || !('d' in rec)) continue;
      if (!/^[a-z0-9:_-]+$/i.test(name)) continue;
      try { be.setItem(PREFIX + name, JSON.stringify(rec)); n++; } catch { /* */ }
    }
    return n;
  }

  function clearAll() {
    for (const k of keys()) { try { be.removeItem(k); } catch { /* */ } }
  }

  return {
    persistent, read, write, remove, exportAll, importAll, clearAll, keys,
    onProblem(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get problems() { return problems.slice(); },
  };
}
