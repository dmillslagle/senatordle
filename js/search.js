/*
 * Senator search combobox: matches names, filters by state and party,
 * and supports the keyboard. The app supplies callbacks for which
 * attributes are hidden and which senators were already guessed.
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
    return s.party.map(p => (CFG.parties[p] ? CFG.parties[p].short : p)).join('→');
  }

  function yearsLabel(s) {
    return `${s.start}–${s.end ? s.end : 'present'}`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function create({ senators, input, list, stateSelect, partySelect, stateWrap, partyWrap, getHidden, isGuessed, onSelect, onSubmit }) {
    // Precompute search tokens once.
    const index = senators.map(s => ({
      s,
      key: sortKey(s),
      tokens: normalize([s.name].concat(s.aliases || []).join(' ')).split(' '),
    })).sort((a, b) => a.key.localeCompare(b.key));

    let results = [];
    let active = -1;
    let selected = null;

    // Fill the filter dropdowns.
    const usedStates = [...new Set(senators.map(s => s.state))].sort((a, b) =>
      (CFG.states[a] || a).localeCompare(CFG.states[b] || b));
    usedStates.forEach(code => {
      stateSelect.add(new Option(CFG.states[code] || code, code));
    });
    const usedParties = [...new Set(senators.flatMap(s => s.party))].sort();
    usedParties.forEach(code => {
      partySelect.add(new Option(CFG.parties[code] ? CFG.parties[code].name : code, code));
    });

    function compute() {
      const hidden = getHidden();
      const q = normalize(input.value);
      const qTokens = q ? q.split(' ') : [];
      const st = hidden.state ? '' : stateSelect.value;
      const pt = hidden.party ? '' : partySelect.value;
      if (!qTokens.length && !st && !pt) return [];
      return index.filter(({ s, tokens }) =>
        (!st || s.state === st) &&
        (!pt || s.party.includes(pt)) &&
        qTokens.every(qt => tokens.some(t => t.startsWith(qt)))
      ).slice(0, CFG.maxResults).map(e => e.s);
    }

    function render() {
      const hidden = getHidden();
      list.innerHTML = '';
      if (!results.length) {
        const hasQuery = input.value.trim() || stateSelect.value || partySelect.value;
        if (hasQuery && document.activeElement === input) {
          list.innerHTML = '<li class="no-results">No senators found</li>';
          list.hidden = false;
        } else {
          list.hidden = true;
        }
        input.setAttribute('aria-expanded', String(!list.hidden));
        return;
      }
      results.forEach((s, i) => {
        const li = document.createElement('li');
        const guessed = isGuessed(s.id);
        li.id = `opt-${s.id}`;
        li.setAttribute('role', 'option');
        li.className = 'result-item' + (i === active ? ' active' : '') + (guessed ? ' guessed' : '');
        li.setAttribute('aria-selected', String(i === active));
        if (guessed) li.setAttribute('aria-disabled', 'true');
        const metaBits = [];
        if (!hidden.party) metaBits.push(`<span class="party party-${escapeHtml(s.party[s.party.length - 1])}">${escapeHtml(partyLabel(s))}</span>`);
        if (!hidden.state) metaBits.push(`<span>${escapeHtml(s.state)}</span>`);
        metaBits.push(`<span>${escapeHtml(yearsLabel(s))}</span>`);
        li.innerHTML = `<span class="r-name">${escapeHtml(s.name)}</span><span class="r-meta">${metaBits.join('<span class="dot">·</span>')}</span>`;
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
      const hidden = getHidden();
      stateWrap.hidden = hidden.state;
      partyWrap.hidden = hidden.party;
      results = compute();
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
      render();
      onSelect(s);
    }

    function clearSelection() {
      if (selected) { selected = null; onSelect(null); }
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
    [stateSelect, partySelect].forEach(sel => sel.addEventListener('change', () => {
      clearSelection();
      input.value = '';
      active = -1;
      input.focus();
      refresh();
    }));

    return {
      refresh,
      getSelected: () => selected,
      reset() {
        selected = null;
        input.value = '';
        results = [];
        active = -1;
        render();
        onSelect(null);
      },
      resetFilters() {
        stateSelect.value = '';
        partySelect.value = '';
      },
    };
  }

  return { create, partyLabel, yearsLabel, escapeHtml };
})();
