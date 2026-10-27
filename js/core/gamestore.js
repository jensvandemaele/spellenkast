// Opslag per spel: lopende spelstatus, statistieken en spelvoorkeuren, elk met eigen formaatversie.

export function createGameStore(storage, game) {
  const base = `spel:${game.id}:`;
  const s = game.storage;

  return {
    loadState() {
      return storage.read(base + 'stand', {
        version: s.stateVersion,
        migrate: s.migrateState,
        validate: s.validateState,
        fallback: () => null,
      });
    },
    saveState(state) {
      return storage.write(base + 'stand', s.stateVersion, state);
    },
    clearState() {
      storage.remove(base + 'stand');
    },
    loadStats() {
      return storage.read(base + 'stats', {
        version: s.statsVersion,
        migrate: s.migrateStats,
        validate: s.validateStats,
        fallback: () => s.defaultStats(),
      });
    },
    saveStats(stats) {
      return storage.write(base + 'stats', s.statsVersion, stats);
    },
    loadPrefs() {
      if (!s.defaultPrefs) return {};
      return storage.read(base + 'voorkeur', {
        version: s.prefsVersion ?? 1,
        validate: s.validatePrefs ?? (() => true),
        fallback: () => s.defaultPrefs(),
      });
    },
    savePrefs(prefs) {
      return storage.write(base + 'voorkeur', s.prefsVersion ?? 1, prefs);
    },
    /** Heeft dit spel een hervatbare (lopende) stand? */
    hasResumable() {
      const st = this.loadState();
      return !!st && (!game.isFinished || !game.isFinished(st));
    },
  };
}
