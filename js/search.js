/*
 * Senator search combobox: matches names, shows each senator's photo and a
 * party/state tag like "(D-GA)", and supports the keyboard. Once a clue has
 * revealed the party or state, the app tells this box to leave it out of the tag.
 */
window.SenatorSearch = (function () {
  'use strict';
  const CFG = window.SENATORDLE_CONFIG;

  function normalize(str) {
    return String(str)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);
  function sortKey(s) {
    if (s.sortName) return normalize(s.sortName);
    const parts = normalize(s.name).split(' ').filter(p => !SUFFIXES.has(p));
    return (parts[parts.length - 1] || '') + ' ' + parts.join(' ');
  }

  function partyLabel(s) {
    return s.party.map(p => (CFG.parties[p] ? CFG.parties[p].short : p)).join('/');
  }

  function yearsLabel(s) {
    return `${s.start}–${s.end ? s.end : 'present'}`;
  }

  function photoUrl(s) {
    return (s && s.image) || CFG.placeholderImage;
  }

  /** "D-GA", "GA", "D", or "" depending on which attributes are hidden. */
  function tagLabel(s, hidden) {
    const bits = [];
    if (!hidden.party) bits.push(partyLabel(s));
    if (!hidden.state) bits.push(s.state);
    return bits.join('-');
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function create({ senators, input, list, photo, getHidden, isGuessed, onSelect, onSubmit }) {
    // Precompute search tokens once.
    const index = senators.map(s => ({
      s,
      key: sortKey(s),
      tokens: normalize([s.name].concat(s.aliases || []).join(' ')).split(' '),
    })).sort((a, b) => a.key.localeCompare(b.key));

    let results = [];
    let active = -1;
    let selected = null;

    function compute() {
      const q = normalize(input.value);
      if (!q) return [];
      const qTokens = q.split(' ');
      return index
        .filter(({ tokens }) => qTokens.every(qt => tokens.some(t => t.startsWith(qt))))
        .slice(0, CFG.maxResults)
        .map(e => e.s);
    }

    function showPhoto(s) {
      photo.hidden = !s;
      if (s) photo.src = photoUrl(s);
      input.classList.toggle('has-photo', !!s);
    }

    function render() {
      const hidden = getHidden();
      list.innerHTML = '';
      if (!results.length) {
        if (input.value.trim() && !selected && document.activeElement === input) {
          list.innerHTML = '<li class="no-results">No senators found</li>';
          list.hidden = false;
        } else {
          list.hidden = true;
        }
        input.setAttribute('aria-expanded', String(!list.hidden));
        input.removeAttribute('aria-activedescendant');
        return;
      }
      results.forEach((s, i) => {
        const li = document.createElement('li');
        const guessed = isGuessed(s.id);
        const tag = tagLabel(s, hidden);
        li.id = `opt-${s.id}`;
        li.setAttribute('role', 'option');
        li.className = 'result-item' + (i === active ? ' active' : '') + (guessed ? ' guessed' : '');
        li.setAttribute('aria-selected', String(i === active));
        if (guessed) li.setAttribute('aria-disabled', 'true');
        li.innerHTML =
          `<img class="r-photo" src="${escapeHtml(photoUrl(s))}" alt="" loading="lazy">` +
          `<span class="r-name">${escapeHtml(s.name)}</span>` +
          (tag ? `<span class="r-tag">(${escapeHtml(tag)})</span>` : '');
        li.addEventListener('mousedown', e => { e.preventDefault(); choose(i); });
        list.appendChild(li);
      });
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      if (active >= 0) {
        input.setAttribute('aria-activedescendant', `opt-${results[active].id}`);
        const el = list.children[active];
        if (el) el.scrollIntoView({ block: 'nearest' });
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    function refresh() {
      results = selected ? [] : compute();
      if (active >= results.length) active = results.length - 1;
      render();
    }

    function choose(i) {
      const s = results[i];
      if (!s || isGuessed(s.id)) return;
      selected = s;
      input.value = s.name;
      results = [];
      active = -1;
      showPhoto(s);
      render();
      onSelect(s);
    }

    function clearSelection() {
      if (!selected) return;
      selected = null;
      showPhoto(null);
      onSelect(null);
    }

    input.addEventListener('input', () => { clearSelection(); active = -1; refresh(); });
    input.addEventListener('focus', refresh);
    input.addEventListener('blur', () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!results.length) return;
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        active = (active + dir + results.length) % results.length;
        render();
      } else if (e.key === 'Enter') {
        if (!list.hidden && active >= 0) {
          e.preventDefault();
          choose(active);
        } else if (!list.hidden && results.length === 1) {
          e.preventDefault();
          choose(0);
        } else if (selected) {
          e.preventDefault();
          onSubmit();
        }
      } else if (e.key === 'Escape') {
        list.hidden = true;
        input.setAttribute('aria-expanded', 'false');
      }
    });

    return {
      refresh,
      getSelected: () => selected,
      reset() {
        selected = null;
        input.value = '';
        results = [];
        active = -1;
        showPhoto(null);
        render();
        onSelect(null);
      },
    };
  }

  return { create, partyLabel, yearsLabel, photoUrl, escapeHtml };
})();
