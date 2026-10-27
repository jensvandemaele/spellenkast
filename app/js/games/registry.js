// Alle spellen van de app, in de volgorde van de startpagina.
// Een nieuw spel toevoegen = een map in js/games/ maken en hier importeren.
// Zie README.md, "Een spel toevoegen", voor het contract dat een spelmodule moet volgen.
import blokval from './blokval/game.js';
import woordzoeker from './woordzoeker/game.js';
import g2048 from './g2048/game.js';
import klondike from './klondike/game.js';

export const GAMES = [blokval, woordzoeker, g2048, klondike];

export function findGame(id) {
  return GAMES.find((g) => g.id === id) || null;
}
