/*
 * Senatordle main controller: picks today's puzzle, runs the rounds,
 * draws the UI, and handles stats and sharing.
 */
(function () {
  'use strict';

  const CFG = window.SENATORDLE_CONFIG;
  const SENATORS = window.SENATORS || [];
  const PUZZLES = window.PUZZLES || {};
  const BY_ID = new Map(SENATORS.map(s => [s.id, s]));
  const { partyLabel, yearsLabel, escapeHtml } = window.SenatorSearch;
  const $ = id => document.getElementById(id);

  /* ---------- Dates ---------------------------------------------------- */
  const pad = n => String(n).padStart(2, '0');
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
  const dayDiff = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);

  const TODAY = toISO(new Date());
  const requested = new URLSearchParams(location.search).get('date');
  // ?date=YYYY-MM-DD plays a past puzzle (archive). Future dates are not allowed.
  const DATE = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= TODAY ? requested : TODAY;
  const IS_TODAY = DATE === TODAY;
  const PUZZLE_NO = dayDiff(CFG.launchDate, DATE) + 1;

  /* ---------- Puzzle data ---------------------------------------------- */
  function normalizePuzzle(raw) {
    return {
      answer: raw.answer,
      clues: (raw.clues || []).map(c => typeof c === 'string'
        ? { text: c, reveals: [], category: null }
        : { text: c.text, reveals: c.reveals || [], category: c.category || null }),
    };
  }

  function validateData() {
    const seen = new Set();
    SENATORS.forEach(s => {
      if (seen.has(s.id)) console.warn(`[Senatordle] Duplicate senator id: ${s.id}`);
      seen.add(s.id);
      if (!CFG.states[s.state]) console.warn(`[Senatordle] Unknown state "${s.state}" for ${s.id}`);
      if (!Array.isArray(s.party) || !s.party.length) console.warn(`[Senatordle] Missing party array for ${s.id}`);
    });
    Object.entries(PUZZLES).forEach(([date, day]) => {
      CFG.rounds.forEach(({ key }) => {
        const p = day[key];
        if (!p) return console.warn(`[Senatordle] ${date}: no "${key}" round`);
        if (!BY_ID.has(p.answer)) console.warn(`[Senatordle] ${date} ${key}: answer "${p.answer}" not in senators.js`);
        if (!p.clues || !p.clues.length) console.warn(`[Senatordle] ${date} ${key}: no clues`);
      });
    });
  }

  /* ---------- State ---------------------------------------------------- */
  const day = PUZZLES[DATE];
  const rounds = CFG.rounds.filter(r => day && day[r.key] && BY_ID.has(day[r.key].answer));
  const puzzles = {};
  const games = {};
  const lastShownRevealed = {};
  rounds.forEach(r => {
    puzzles[r.key] = normalizePuzzle(day[r.key]);
    games[r.key] = Store.loadGame(DATE, r.key);
    // Fix up saved state if the puzzle was edited after it was saved.
    const g = games[r.key];
    g.revealed = Math.min(Math.max(1, g.revealed), puzzles[r.key].clues.length);
    lastShownRevealed[r.key] = g.revealed;
  });
  let current = (rounds.find(r => games[r.key].status === 'playing') || rounds[0] || {}).key;

  const puzzle = () => puzzles[current];
  const game = () => games[current];
  const roundLabel = key => (CFG.rounds.find(r => r.key === key) || {}).label || key;

  /** Which search attributes are hidden for a round right now. */
  function hiddenAttrs(key) {
    const g = games[key];
    const out = { state: false, party: false };
    if (!g || g.status !== 'playing') return out;
    ['state', 'party'].forEach(attr => {
      const idx = puzzles[key].clues.findIndex(c => c.reveals.includes(attr));
      out[attr] = idx >= 0 && idx >= g.revealed;
    });
    return out;
  }

  /* ---------- Search --------------------------------------------------- */
  const search = window.SenatorSearch.create({
    senators: SENATORS,
    input: $('guess-input'),
    list: $('guess-list'),
    stateSelect: $('filter-state'),
    partySelect: $('filter-party'),
    stateWrap: $('filter-state-wrap'),
    partyWrap: $('filter-party-wrap'),
    getHidden: () => (current ? hiddenAttrs(current) : { state: false, party: false }),
    isGuessed: id => !!current && game().guesses.some(g => g.id === id),
    onSelect: s => { $('guess-btn').disabled = !s; },
    onSubmit: () => submitGuess(),
  });

  /* ---------- Actions -------------------------------------------------- */
  function submitGuess() {
    const s = search.getSelected();
    const g = game();
    if (!s || g.status !== 'playing') return;
    if (g.guesses.some(x => x.id === s.id)) return toast('Already guessed');
    g.guesses.push({ clue: g.revealed, id: s.id });
    search.reset();
    if (s.id === puzzle().answer) {
      finish('won');
    } else {
      toast(`Not ${s.name}`);
      advance();
    }
  }

  function skip() {
    const g = game();
    if (g.status !== 'playing') return;
    g.guesses.push({ clue: g.revealed, id: null });
    search.reset();
    advance();
  }

  function giveUp() {
    if (game().status !== 'playing') return;
    if (!confirm('Give up and reveal the answer?')) return;
    finish('lost');
  }

  function advance() {
    const g = game();
    if (g.revealed < puzzle().clues.length) {
      g.revealed += 1;
      save();
      render();
    } else {
      finish('lost');
    }
  }

  function finish(status) {
    const g = game();
    g.status = status;
    save();
    if (IS_TODAY) Store.recordResult(current, DATE, addDays(DATE, -1), status === 'won' ? g.revealed : null);
    render();
  }

  function save() {
    Store.saveGame(DATE, current, game());
  }

  function switchRound(key) {
    if (!puzzles[key] || key === current) return;
    current = key;
    search.resetFilters();
    search.reset();
    render();
  }

  /* ---------- Rendering ------------------------------------------------ */
  function render() {
    renderTabs();
    const p = puzzle();
    const g = game();
    const over = g.status !== 'playing';

    $('round-title').textContent = `${roundLabel(current)} round`;
    $('clue-counter').textContent = over
      ? (g.status === 'won' ? `Solved on clue ${g.revealed}/${p.clues.length}` : `Not solved · ${p.clues.length} clues`)
      : `Clue ${g.revealed} of ${p.clues.length}`;

    renderClues();
    $('play-area').hidden = over;
    $('skip-btn').textContent = g.revealed < p.clues.length ? 'Skip to next clue' : 'Skip (ends round)';
    renderResult();
    search.refresh();
    lastShownRevealed[current] = g.revealed;
  }

  function renderTabs() {
    document.querySelectorAll('.tab').forEach(btn => {
      const key = btn.dataset.round;
      btn.hidden = !puzzles[key];
      const on = key === current;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('[data-status-for]').forEach(el => {
      const g = games[el.dataset.statusFor];
      el.className = 'tab-status';
      el.textContent = '';
      if (!g) return;
      if (g.status === 'won') { el.textContent = '✓'; el.classList.add('won'); }
      else if (g.status === 'lost') { el.textContent = '✗'; el.classList.add('lost'); }
      else if (g.guesses.length) { el.textContent = '•'; el.classList.add('progress'); }
    });
  }

  function guessLine(guess, answerId) {
    if (!guess.id) return '<li class="g skip">Skipped</li>';
    const s = BY_ID.get(guess.id);
    const name = s ? escapeHtml(s.name) : escapeHtml(guess.id);
    return guess.id === answerId
      ? `<li class="g right"><span aria-hidden="true">✓</span> ${name}</li>`
      : `<li class="g wrong"><span aria-hidden="true">✗</span> ${name}</li>`;
  }

  function renderClues() {
    const p = puzzle();
    const g = game();
    const over = g.status !== 'playing';
    const prev = lastShownRevealed[current];
    const html = p.clues.map((c, i) => {
      const n = i + 1;
      if (n <= g.revealed) {
        const guesses = g.guesses.filter(x => x.clue === n).map(x => guessLine(x, p.answer)).join('');
        const fresh = n === g.revealed && n > prev ? ' fresh' : '';
        return `<li class="clue revealed${fresh}">
          <span class="num">${n}</span>
          <div class="body"><p class="text">${escapeHtml(c.text)}</p>${guesses ? `<ul class="clue-guesses">${guesses}</ul>` : ''}</div>
        </li>`;
      }
      if (over) {
        return `<li class="clue unrevealed">
          <span class="num">${n}</span>
          <div class="body"><p class="text">${escapeHtml(c.text)}</p></div>
        </li>`;
      }
      return `<li class="clue locked" aria-label="Clue ${n}, locked">
        <span class="num">${n}</span>
        <div class="body"><p class="text">${c.category ? escapeHtml(c.category) : 'Locked'}</p></div>
      </li>`;
    }).join('');
    $('clues').innerHTML = html;
  }

  function renderResult() {
    const el = $('result');
    const g = game();
    if (g.status === 'playing') { el.hidden = true; el.innerHTML = ''; return; }
    const s = BY_ID.get(puzzle().answer);
    const won = g.status === 'won';
    const parties = s.party.map(code => (CFG.parties[code] ? CFG.parties[code].name : code)).join(' → ');
    const next = rounds.find(r => r.key !== current && games[r.key].status === 'playing');
    el.className = `result ${won ? 'won' : 'lost'}`;
    el.innerHTML = `
      <p class="result-head">${won
        ? `🎉 You got it on clue <strong>${g.revealed}</strong> of ${puzzle().clues.length}!`
        : 'Better luck next time. The answer was:'}</p>
      <div class="answer-card">
        <div class="answer-name">${escapeHtml(s.name)}</div>
        <div class="answer-meta">
          <span class="party party-${escapeHtml(s.party[s.party.length - 1])}">${escapeHtml(parties)}</span>
          <span class="dot">·</span><span>${escapeHtml(CFG.states[s.state] || s.state)}</span>
          <span class="dot">·</span><span>${escapeHtml(yearsLabel(s))}</span>
        </div>
        ${s.wiki ? `<a class="answer-link" href="${escapeHtml(s.wiki)}" target="_blank" rel="noopener">Read more ↗</a>` : ''}
      </div>
      <div class="result-actions">
        <button class="btn primary" data-action="share">Share</button>
        ${next ? `<button class="btn" data-action="next" data-round="${next.key}">Play ${escapeHtml(next.label)} round →</button>` : ''}
      </div>`;
    el.hidden = false;
  }

  /* ---------- Share ---------------------------------------------------- */
  function shareText() {
    const lines = [`Senatordle #${PUZZLE_NO}${IS_TODAY ? '' : ` (${DATE})`} 🏛️`];
    rounds.forEach(r => {
      const g = games[r.key];
      const p = puzzles[r.key];
      if (g.status === 'playing') { lines.push(`${r.label}: in progress`); return; }
      const squares = g.guesses.map(x => (!x.id ? '⬜' : x.id === p.answer ? '🟩' : '🟥')).join('');
      const score = g.status === 'won' ? `${g.revealed}/${p.clues.length}` : `X/${p.clues.length}`;
      lines.push(`${r.label}: ${squares || '🏳️'} ${score}`);
    });
    if (location.protocol.startsWith('http')) lines.push(location.origin + location.pathname);
    return lines.join('\n');
  }

  async function share() {
    const text = shareText();
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('Results copied to clipboard');
  }

  /* ---------- Stats ---------------------------------------------------- */
  let statsRound = 'normal';
  function renderStats() {
    document.querySelectorAll('[data-stats-round]').forEach(b =>
      b.classList.toggle('active', b.dataset.statsRound === statsRound));
    const s = Store.loadStats(statsRound);
    const streak = s.lastWon === TODAY || s.lastWon === addDays(TODAY, -1) ? s.currentStreak : 0;
    const winPct = s.played ? Math.round((s.won / s.played) * 100) : 0;
    const maxClue = Math.max(10, ...Object.keys(s.dist).map(Number));
    const maxCount = Math.max(1, ...Object.values(s.dist));
    const todays = IS_TODAY && games[statsRound] && games[statsRound].status === 'won' ? games[statsRound].revealed : null;

    let bars = '';
    for (let i = 1; i <= maxClue; i++) {
      const count = s.dist[i] || 0;
      const w = Math.max(6, Math.round((count / maxCount) * 100));
      bars += `<div class="bar-row"><span class="bar-label">${i}</span>
        <div class="bar${i === todays ? ' today' : ''}" style="width:${w}%"><span>${count}</span></div></div>`;
    }
    $('stats-body').innerHTML = `
      <div class="stat-grid">
        <div class="stat"><div class="stat-num">${s.played}</div><div class="stat-label">Played</div></div>
        <div class="stat"><div class="stat-num">${winPct}</div><div class="stat-label">Win %</div></div>
        <div class="stat"><div class="stat-num">${streak}</div><div class="stat-label">Current streak</div></div>
        <div class="stat"><div class="stat-num">${s.maxStreak}</div><div class="stat-label">Max streak</div></div>
      </div>
      <h3>Solved on clue #</h3>
      <div class="bars">${bars}</div>`;
    $('stats-share-btn').hidden = !rounds.length || !rounds.some(r => games[r.key].status !== 'playing');
  }

  function openStats() {
    statsRound = current || 'normal';
    renderStats();
    $('stats-dialog').showModal();
  }

  /* ---------- Toast & countdown --------------------------------------- */
  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function tickCountdown() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const ms = midnight - now;
    if (ms <= 1000 && IS_TODAY && !requested) { setTimeout(() => location.reload(), 1500); }
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
    $('countdown').textContent = `${pad(h)}:${pad(m)}:${pad(sec)}`;
  }

  /* ---------- Boot ----------------------------------------------------- */
  function boot() {
    validateData();
    const dateLabel = parseISO(DATE).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    $('meta').textContent = `#${PUZZLE_NO} · ${dateLabel}${IS_TODAY ? '' : ' · Archive'}`;

    document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => switchRound(btn.dataset.round)));
    $('guess-form').addEventListener('submit', e => { e.preventDefault(); submitGuess(); });
    $('skip-btn').addEventListener('click', skip);
    $('giveup-btn').addEventListener('click', giveUp);
    $('result').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'share') share();
      if (btn.dataset.action === 'next') switchRound(btn.dataset.round);
    });
    $('help-btn').addEventListener('click', () => $('help-dialog').showModal());
    $('stats-btn').addEventListener('click', openStats);
    $('stats-share-btn').addEventListener('click', share);
    document.querySelectorAll('[data-stats-round]').forEach(b =>
      b.addEventListener('click', () => { statsRound = b.dataset.statsRound; renderStats(); }));
    // Clicking the backdrop closes a dialog.
    document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

    tickCountdown();
    setInterval(tickCountdown, 1000);

    if (!rounds.length) {
      $('no-puzzle').hidden = false;
    } else {
      $('game').hidden = false;
      render();
    }

    if (!Store.getFlag('seenHelp')) {
      Store.setFlag('seenHelp');
      $('help-dialog').showModal();
    }
  }

  boot();
})();
