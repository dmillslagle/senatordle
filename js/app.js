/*
 * Senatordle main controller: picks today's puzzle, runs the rounds, drives
 * the title and play screens and the seating-chart animation, and handles
 * stats and sharing.
 */
(function () {
  'use strict';

  const CFG = window.SENATORDLE_CONFIG;
  const SENATORS = window.SENATORS || [];
  const PUZZLES = window.PUZZLES || {};
  const BY_ID = new Map(SENATORS.map(s => [s.id, s]));
  const { yearsLabel, photoUrl, escapeHtml } = window.SenatorSearch;
  const Chart = window.SenateChart;
  const $ = id => document.getElementById(id);

  // Animation timing (ms). Keep in sync with the transitions in css/style.css.
  const T_ROTATE = 650;  // fan rotating to the next seat
  const T_SLIDE = 600;   // seat bar wiping away
  const TWO_LINE_CARD_H = 88; // px; card height used to size cards to the bars
  const T_OUT = 650;     // bars spinning out when switching rounds
  const SWITCH_SPIN = 120; // degrees the fan spins out (and back in) on a round switch
  const SLIDE_LAG = 60;  // bar starts sliding just after the card under it is in place
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Dates ---------------------------------------------------- */
  const pad = n => String(n).padStart(2, '0');
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
  const dayDiff = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
  const MONTHS = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
  const shortDate = iso => { const d = parseISO(iso); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };

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

  /* ---------- Game state ----------------------------------------------- */
  const day = PUZZLES[DATE];
  const rounds = CFG.rounds.filter(r => day && day[r.key] && BY_ID.has(day[r.key].answer));
  const puzzles = {};
  const games = {};
  rounds.forEach(r => {
    puzzles[r.key] = normalizePuzzle(day[r.key]);
    games[r.key] = Store.loadGame(DATE, r.key);
    // Fix up saved state if the puzzle was edited after it was saved.
    const g = games[r.key];
    g.revealed = Math.min(Math.max(1, g.revealed), puzzles[r.key].clues.length);
  });
  let current = (rounds.find(r => games[r.key].status === 'playing') || rounds[0] || {}).key;

  const puzzle = () => puzzles[current];
  const game = () => games[current];
  const roundLabel = key => (CFG.rounds.find(r => r.key === key) || {}).label || key;

  /**
   * Which attributes search results should leave out for a round right now.
   * Once a revealed clue gives away the party or state, results stop showing it.
   */
  function hiddenAttrs(key) {
    const g = games[key];
    const out = { state: false, party: false };
    if (!g) return out;
    ['state', 'party'].forEach(attr => {
      out[attr] = puzzles[key].clues.slice(0, g.revealed).some(c => c.reveals.includes(attr));
    });
    return out;
  }

  /* ---------- Search --------------------------------------------------- */
  const search = window.SenatorSearch.create({
    senators: SENATORS,
    input: $('guess-input'),
    list: $('guess-list'),
    photo: $('guess-photo'),
    getHidden: () => (current ? hiddenAttrs(current) : { state: false, party: false }),
    isGuessed: id => !!current && game().guesses.some(g => g.id === id),
    onSelect: s => { $('guess-btn').disabled = !s; },
    onSubmit: () => submitGuess(),
  });

  /* ---------- Actions -------------------------------------------------- */
  function submitGuess() {
    if (switching) return;
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
    if (switching) return;
    const g = game();
    if (g.status !== 'playing') return;
    g.guesses.push({ clue: g.revealed, id: null });
    search.reset();
    advance();
  }

  function giveUp() {
    if (switching) return;
    if (game().status !== 'playing') return;
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

  /**
   * Change rounds. In play mode the bars spin out and the new round's bars spin
   * in (see spinOutIn), so the two rounds' progress never overlaps on screen.
   * Hard mode's colors fade in at the same time.
   */
  function switchRound(key) {
    if (!puzzles[key] || key === current || switching) return;
    search.reset();
    if (mode !== 'play' || REDUCED) { current = key; render(); return; }
    document.body.classList.toggle('round-hard', key === 'hard');
    spinOutIn(() => { current = key; });
  }

  /**
   * The seating chart's transition, used when starting play and when switching
   * rounds:
   *  1. Out: every bar wipes back into the circle while the fan spins forward,
   *     and the clues fade out.
   *  2. `swap()` runs (e.g. changes round), and the bars are rebuilt hidden in
   *     the circle, a spin's worth behind their target.
   *  3. In: the fan spins into place and the bars that still hide clues grow
   *     back out, along with the current clue's bar; earlier clues reappear.
   *  4. The current clue's bar wipes away, uncovering its clue.
   */
  let switching = false;
  let goneOverride = null; // while spinning in: how many bars count as revealed
  function spinOutIn(swap) {
    switching = true;
    stackEl.classList.add('switching');
    seats.forEach(seat => { seat.style.setProperty('--d', '0ms'); seat.classList.add('gone'); seat.classList.remove('next'); });
    setRotation(rotation + SWITCH_SPIN);

    setTimeout(() => {
      swap();
      const n = puzzle().clues.length;
      const g = game();
      seatsEl.classList.add('instant');
      buildSeats(n, `${current}:${n}`);
      seats.forEach(seat => { seat.style.setProperty('--d', '0ms'); seat.classList.add('gone'); });
      setRotation(Chart.rotationFor(g.revealed - 1, n) - SWITCH_SPIN);
      seatsEl.getBoundingClientRect();
      seatsEl.classList.remove('instant');
      stackEl.innerHTML = '';
      stackKey = current;
      stackEl.classList.remove('switching');

      // Spin in with the current clue still covered (if the round is in progress).
      goneOverride = g.status === 'playing' ? g.revealed - 1 : null;
      switchCardDelay = T_ROTATE;
      render();
      setTimeout(() => {
        goneOverride = null;
        render(); // the current clue's bar wipes away
        switching = false;
      }, T_ROTATE);
    }, T_OUT);
  }

  /* ---------- Screens -------------------------------------------------- */
  let mode = 'title';
  let pendingDelay = 0;  // extra wait before bars slide (unused unless set by a transition)

  function setMode(next) {
    if (next === mode || switching) return;
    mode = next;
    document.body.classList.toggle('mode-title', mode === 'title');
    document.body.classList.toggle('mode-play', mode === 'play');
    if (mode === 'play' && !REDUCED) {
      // The chart moves into place while its bars spin out, then they spin back in.
      document.body.classList.toggle('round-hard', current === 'hard');
      renderTabs();
      renderPanel();
      spinOutIn(() => {});
      layout();
    } else {
      render();
    }
    if (mode === 'play' && game().status === 'playing' && matchMedia('(pointer: fine)').matches) {
      setTimeout(() => $('guess-input').focus({ preventScroll: true }), REDUCED ? 0 : T_OUT + T_ROTATE);
    }
  }

  /* ---------- Seating chart -------------------------------------------- */
  const seatsEl = $('seats');
  let seats = [];
  let seatsKey = null;      // which round (and clue count) the bars were built for
  let rotation = 0;

  function buildSeats(n, key) {
    seats = Chart.build(seatsEl, n);
    seatsKey = key;
    seatsEl.getBoundingClientRect(); // flush styles so the next changes animate
  }

  /**
   * Update bars and rotation. Returns the delay (ms) until a bar that is now
   * wiping away is in place over its clue, or -1 if no bar started wiping.
   */
  function renderChart() {
    const n = current ? puzzle().clues.length : 10;
    const key = `${current}:${n}`;
    if (seatsKey !== key) buildSeats(n, key);

    if (mode === 'title') {
      seats.forEach(seat => { seat.classList.remove('gone', 'next'); seat.style.removeProperty('--d'); });
      setRotation(0);
      return -1;
    }

    const g = game();
    const shown = goneOverride ?? g.revealed; // bars currently counted as revealed
    const target = Chart.rotationFor(g.revealed - 1, n);
    const rotating = target !== rotation;
    let delay = pendingDelay || (rotating && !REDUCED ? T_ROTATE : 0);
    pendingDelay = 0;
    let newlyGone = false;
    seats.forEach((seat, i) => {
      const gone = i < shown;
      if (gone && !seat.classList.contains('gone')) {
        seat.style.setProperty('--d', `${delay + SLIDE_LAG}ms`);
        newlyGone = true;
      }
      seat.classList.toggle('gone', gone);
      seat.classList.toggle('next', g.status === 'playing' && goneOverride === null && i === g.revealed);
    });
    setRotation(target);
    return newlyGone ? delay : -1;
  }

  function setRotation(deg) {
    rotation = deg;
    seatsEl.style.transform = `rotate(${deg}deg)`;
  }

  function renderHub() {
    const el = $('hub-label');
    if (mode !== 'play' || !current) { el.innerHTML = ''; return; }
    const g = game();
    const n = puzzle().clues.length;
    if (g.status === 'won') {
      el.innerHTML = `<span class="hub-small">Solved in</span><span class="hub-big">${g.revealed}</span><span class="hub-small">${g.revealed === 1 ? 'clue' : 'clues'}</span>`;
    } else if (g.status === 'lost') {
      el.innerHTML = `<span class="hub-small">Not solved</span><span class="hub-big">✗</span><span class="hub-small">${n} clues</span>`;
    } else {
      el.innerHTML = `<span class="hub-small">Clue</span><span class="hub-big">${g.revealed}</span><span class="hub-small">of ${n}</span>`;
    }
  }

  /* ---------- Clue stack ----------------------------------------------- */
  const stackEl = $('clue-stack');
  let stackKey = null;

  function guessLine(guess, answerId) {
    if (!guess.id) return '<li class="g skip">Skipped</li>';
    const s = BY_ID.get(guess.id);
    const name = s ? escapeHtml(s.name) : escapeHtml(guess.id);
    return guess.id === answerId
      ? `<li class="g right"><span aria-hidden="true">✓</span> ${name}</li>`
      : `<li class="g wrong"><span aria-hidden="true">✗</span> ${name}</li>`;
  }

  /**
   * Add a card for each revealed clue. A newly revealed card is placed under its
   * seat bar (hidden until the bar rotates into place, then clipped to the bar's
   * outline) so that the bar sliding away uncovers it.
   */
  function renderStack(revealDelay, underBar) {
    if (mode !== 'play' || !current) return;
    if (stackKey !== current) { stackEl.innerHTML = ''; stackKey = current; }
    const p = puzzle();
    const g = game();
    const count = goneOverride ?? g.revealed;
    for (let i = 0; i < count; i++) {
      let li = stackEl.children[i];
      if (!li) {
        li = document.createElement('li');
        li.className = 'clue-card pending';
        li.innerHTML = `<div class="clue-inner"><span class="clue-num">${i + 1}</span><div class="clue-body"><p class="clue-text"></p><ul class="clue-guesses"></ul></div></div>`;
        li.querySelector('.clue-text').textContent = p.clues[i].text;
        stackEl.appendChild(li);
        uncover(li, revealDelay, underBar && i === count - 1);
      }
      li.classList.toggle('latest', i === g.revealed - 1);
      li.querySelector('.clue-guesses').innerHTML =
        g.guesses.filter(x => x.clue === i + 1).map(x => guessLine(x, p.answer)).join('');
    }
    while (stackEl.children.length > count) stackEl.lastChild.remove();
  }

  /** Show a card once its bar covers it, then open its clip as the bar slides away. */
  function uncover(li, delay, underBar) {
    if (underBar) li.dataset.cover = 'on';
    setTimeout(() => {
      li.classList.remove('pending');
      if (!underBar) return;
      setTimeout(() => {
        li.dataset.cover = 'opening';
        positionCards();
        setTimeout(() => { delete li.dataset.cover; li.style.clipPath = ''; }, T_SLIDE + 50);
      }, SLIDE_LAG);
    }, delay);
  }

  /** Size cards to fit inside the bars, and stack them upward from the active seat. */
  function positionCards() {
    if (!lastLayout || mode !== 'play' || !current) return;
    const L = lastLayout;
    const n = puzzle().clues.length;
    const cards = [...stackEl.children];
    // The card in the active seat is sized to fit inside the bar (for a two-line
    // clue; anything taller stays hidden under the bar by its clip). Earlier clues
    // are plain lines: out to the circle beside it, full width above it.
    const fit = Chart.fitCard(L, TWO_LINE_CARD_H, n);
    const hubR = Chart.R_HUB * L.s;
    const besideHubW = Math.max(fit.width, L.cx - hubR - 28 - fit.left);
    const fullW = Math.max(besideHubW, window.innerWidth - 20 - fit.left);
    const hubTop = L.cy - hubR - 8;
    cards.forEach(li => {
      li.style.top = `${L.cy}px`;
      li.style.left = `${fit.left}px`;
    });
    if (!cards.length) return;

    // Newest card centered on the seat; earlier ones stacked above, clear of the
    // bar's full thickness so the bar never covers them.
    // (While bars spin in, the current clue isn't shown yet: just leave its space.)
    const latest = cards[cards.length - 1];
    const hasLatest = latest.classList.contains('latest');
    let latestH = TWO_LINE_CARD_H;
    if (hasLatest) {
      latest.style.width = `${fit.width}px`;
      latest.style.setProperty('--off', '0px');
      latestH = latest.offsetHeight;
    }
    let edge = Math.max(Chart.barHalfAt(L, fit.left, n), latestH / 2) + 14;
    for (let i = cards.length - (hasLatest ? 2 : 1); i >= 0; i--) {
      const li = cards[i];
      li.style.width = `${besideHubW}px`;
      // If this line sits entirely above the circle, let it run full width.
      if (L.cy - edge - li.offsetHeight < hubTop) {
        li.style.width = `${fullW}px`;
        if (L.cy - edge - li.offsetHeight >= hubTop) li.style.width = `${besideHubW}px`;
      }
      const h = li.offsetHeight;
      li.style.setProperty('--off', `${edge + h / 2}px`);
      edge += h + 4;
    }

    cards.forEach(li => {
      const box = { left: fit.left, width: li.offsetWidth, height: li.offsetHeight };
      if (li.dataset.cover === 'on') li.style.clipPath = Chart.barClip(L, box, n, 0);
      else if (li.dataset.cover === 'opening') li.style.clipPath = Chart.barClip(L, box, n, 1);
    });
  }

  /* ---------- Panel ---------------------------------------------------- */
  function renderPanel() {
    if (!current) return;
    const p = puzzle();
    const g = game();
    const over = g.status !== 'playing';
    $('play-area').hidden = over;
    $('skip-btn').querySelector('.hold-text').textContent = g.revealed < p.clues.length ? 'Skip to next clue' : 'Skip (ends round)';
    renderResult();
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
        <img class="answer-photo" src="${escapeHtml(photoUrl(s))}" alt="Photo of ${escapeHtml(s.name)}">
        <div class="answer-info">
          <div class="answer-name">${escapeHtml(s.name)}</div>
          <div class="answer-meta">
            <span class="party party-${escapeHtml(s.party[s.party.length - 1])}">${escapeHtml(parties)}</span>
            <span class="dot">·</span><span>${escapeHtml(CFG.states[s.state] || s.state)}</span>
            <span class="dot">·</span><span>${escapeHtml(yearsLabel(s))}</span>
          </div>
          ${s.wiki ? `<a class="answer-link" href="${escapeHtml(s.wiki)}" target="_blank" rel="noopener">Read more ↗</a>` : ''}
        </div>
      </div>
      <div class="result-actions">
        <button class="btn primary" data-action="share">Share</button>
        ${next ? `<button class="btn" data-action="next" data-round="${next.key}">Play ${escapeHtml(next.label)} →</button>` : ''}
      </div>`;
    el.hidden = false;
  }

  /* ---------- Render & layout ------------------------------------------ */
  let switchCardDelay = 0; // after a round switch, clues appear once the bars have spun in

  function render() {
    document.body.classList.toggle('round-hard', mode === 'play' && current === 'hard');
    renderTabs();
    const revealDelay = renderChart();
    renderHub();
    // A clue is uncovered by its bar only when that bar is wiping away right now.
    renderStack(revealDelay >= 0 ? revealDelay : switchCardDelay, revealDelay >= 0);
    switchCardDelay = 0;
    renderPanel();
    if (current) search.refresh();
    layout();
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

  let lastLayout = null;
  function layout() {
    const W = window.innerWidth, H = window.innerHeight;
    const top = document.querySelector('.topbar').offsetHeight;
    const wide = W >= 860;
    document.body.classList.toggle('wide', wide);
    const panel = $('panel');
    let L;
    if (mode === 'title') {
      L = Chart.layout('title', W, H, { slot: $('chart-slot').getBoundingClientRect() });
    } else {
      const panelW = wide ? Math.round(Math.min(380, Math.max(290, W * 0.26))) : W;
      panel.style.width = wide ? `${panelW}px` : '';
      L = Chart.layout('play', W, H, {
        wide, top, panelRight: 24 + panelW, panelHeight: wide ? 0 : panel.offsetHeight,
      });
      if (wide) {
        const ph = panel.offsetHeight;
        panel.style.top = `${Math.max(top + 16, Math.min(L.cy - ph / 2, H - ph - 16))}px`;
      } else {
        panel.style.top = '';
      }
    }
    const gb = $('guess-btn');
    panel.style.setProperty('--guess-btn-w', `${gb.offsetWidth + 8}px`);
    $('chart').style.transform = `translate(${L.cx}px, ${L.cy}px) scale(${L.s})`;
    stackEl.style.setProperty('--fade-top', `${top}px`);
    lastLayout = L;
    positionCards();
  }

  let resizeTimer;
  function onResize() {
    document.body.classList.add('no-anim');
    layout();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => document.body.classList.remove('no-anim'), 100);
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

  /* ---------- Press-and-hold buttons ---------------------------------- */
  // `action` runs only after the button has been held for CFG.holdDuration ms
  // (mouse, touch, or Space/Enter). A quick tap does nothing.
  function holdToActivate(btn, action) {
    const duration = CFG.holdDuration;
    btn.style.setProperty('--hold-ms', `${duration}ms`);
    let timer = null;

    function start() {
      if (timer) return;
      btn.classList.add('holding');
      timer = setTimeout(() => {
        timer = null;
        btn.classList.remove('holding');
        action();
      }, duration);
    }
    function cancel() {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      btn.classList.remove('holding');
    }

    btn.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* not capturable: ignore */ }
      start();
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => btn.addEventListener(ev, cancel));
    btn.addEventListener('keydown', e => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); }
    });
    btn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') cancel(); });
    btn.addEventListener('blur', cancel);
    btn.addEventListener('contextmenu', e => e.preventDefault()); // stop long-press menus on mobile
    btn.addEventListener('click', e => e.preventDefault());
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
    const text = `${pad(h)}:${pad(m)}:${pad(sec)}`;
    $('countdown').textContent = text;
    const tc = $('title-countdown');
    if (tc) tc.textContent = text;
  }

  /* ---------- Boot ----------------------------------------------------- */
  function boot() {
    validateData();

    const playBtn = $('play-btn');
    if (rounds.length) {
      playBtn.textContent = `Play ${shortDate(DATE)}`;
      $('meta').innerHTML = `Puzzle #${PUZZLE_NO}${IS_TODAY ? '' : ' · Archive'} · Next puzzle in <strong id="title-countdown">--:--:--</strong>`;
    } else {
      playBtn.textContent = 'No puzzle today';
      playBtn.disabled = true;
      $('meta').innerHTML = `Check back tomorrow · Next puzzle in <strong id="title-countdown">--:--:--</strong>`;
    }

    playBtn.addEventListener('click', () => { if (rounds.length) setMode('play'); });
    $('home-btn').addEventListener('click', () => setMode('title'));
    document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => switchRound(btn.dataset.round)));
    $('guess-form').addEventListener('submit', e => { e.preventDefault(); submitGuess(); });
    holdToActivate($('skip-btn'), skip);
    holdToActivate($('giveup-btn'), giveUp);
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
    window.addEventListener('resize', onResize);

    tickCountdown();
    setInterval(tickCountdown, 1000);

    document.body.classList.add('no-anim');
    render();
    setTimeout(() => document.body.classList.remove('no-anim'), 60);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

    if (!Store.getFlag('seenHelp')) {
      Store.setFlag('seenHelp');
      $('help-dialog').showModal();
    }
  }

  boot();
})();
