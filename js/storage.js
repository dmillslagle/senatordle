/*
 * localStorage persistence: in-progress games and per-round statistics.
 * Every access is wrapped so the game still works when storage is unavailable.
 */
window.Store = (function () {
  'use strict';
  const PREFIX = 'senatordle:v1:';

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) { /* storage full or blocked: ignore */ }
  }

  /* ---- Game state ---------------------------------------------------- */
  // { revealed: number, guesses: [{ clue, id|null }], status: 'playing'|'won'|'lost' }
  function newGame() {
    return { revealed: 1, guesses: [], status: 'playing' };
  }

  function loadGame(date, round) {
    const g = read(`game:${date}:${round}`, null);
    if (!g || typeof g.revealed !== 'number' || !Array.isArray(g.guesses)) return newGame();
    return g;
  }

  function saveGame(date, round, game) {
    write(`game:${date}:${round}`, game);
  }

  /* ---- Stats --------------------------------------------------------- */
  function emptyStats() {
    return { played: 0, won: 0, currentStreak: 0, maxStreak: 0, dist: {}, lastPlayed: null, lastWon: null };
  }

  function loadStats(round) {
    return Object.assign(emptyStats(), read(`stats:${round}`, {}));
  }

  /** Record a finished game. `solvedAt` is the clue number it was solved on, or null if lost. */
  function recordResult(round, date, yesterday, solvedAt) {
    const s = loadStats(round);
    if (s.lastPlayed === date) return s; // never count the same day twice
    s.played += 1;
    s.lastPlayed = date;
    if (solvedAt) {
      s.won += 1;
      s.dist[solvedAt] = (s.dist[solvedAt] || 0) + 1;
      s.currentStreak = s.lastWon === yesterday ? s.currentStreak + 1 : 1;
      s.maxStreak = Math.max(s.maxStreak, s.currentStreak);
      s.lastWon = date;
    } else {
      s.currentStreak = 0;
    }
    write(`stats:${round}`, s);
    return s;
  }

  /* ---- Simple flags (e.g. "has seen the help screen") ---------------- */
  const getFlag = name => read(`flag:${name}`, false);
  const setFlag = (name, value = true) => write(`flag:${name}`, value);

  return { loadGame, saveGame, newGame, loadStats, recordResult, getFlag, setFlag };
})();
