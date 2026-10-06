'use strict';

// LITTLE CHANCES
// Every outcome and every landing position is selected with the browser's
// cryptographically secure RNG. No Math.random(), server, or external API.

(() => {
  const STORAGE_KEY = 'little-chances-wheels-v1';
  const MAX_OPTIONS = 32;
  const COLORS = [
    '#bd9694', '#b8ba99', '#a0b9ac', '#d5b17f',
    '#b3a6bf', '#d5b6a1', '#9fb6bf', '#b5ad88',
    '#c9a8ab', '#aab9a3', '#cfb38e', '#a5b1c6'
  ];
  const imgAlt = {
    idle: 'Pixel-art bookkeeper reading quietly',
    review: 'Pixel-art bookkeeper reviewing the choices while the wheel spins',
    celebrate: 'Pixel-art bookkeeper jumping happily and returning to an idle pose'
  };
  const el = (id) => document.getElementById(id);
  const dom = {
    tabs: el('tabs'), newPage: el('newPageButton'), wheelName: el('wheelName'),
    chapter: el('chapterNumber'), entries: el('optionsList'), entryCount: el('entryCount'),
    addForm: el('addForm'), newOption: el('newOption'), wheelCanvas: el('wheelCanvas'),
    rotor: el('wheelRotor'), wheelSpinTarget: el('wheelSpinTarget'), characterSpinTarget: el('characterSpinTarget'),
    hint: el('spinHint'), character: el('character'), result: el('resultPanel'),
    resultText: el('resultText'), history: el('historyList'), historyWheelName: el('historyWheelName'), clearHistory: el('clearHistoryButton'),
    deletePage: el('deletePageButton'), localNote: document.querySelector('.local-note'),
    helpButton: el('helpButton'), helpDialog: el('helpDialog'),
    historyButton: el('historyButton'), historyDialog: el('historyDialog'),
    closeHistoryDialog: el('closeHistoryDialog'), doneHistoryDialog: el('doneHistoryDialog'),
    closeDialog: el('closeDialog'), doneDialog: el('doneDialog')
  };

  // A secure, unbiased integer in [0, maxExclusive). Rejection sampling
  // eliminates the small modulo bias that n % maxExclusive would introduce.
  function secureInt(maxExclusive) {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x100000000) {
      throw new RangeError('Invalid secure random range');
    }
    if (!globalThis.crypto || typeof crypto.getRandomValues !== 'function') {
      throw new Error('This browser does not provide secure random numbers.');
    }
    const range = 0x100000000; // 2^32, exactly representable in JavaScript.
    const limit = range - (range % maxExclusive);
    const bytes = new Uint32Array(1);
    let value;
    do {
      crypto.getRandomValues(bytes);
      value = bytes[0];
    } while (value >= limit);
    return value % maxExclusive;
  }

  function secureFraction() {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return bytes[0] / 0x100000000; // [0, 1)
  }

  function newId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = new Uint32Array(2);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, v => v.toString(16).padStart(8, '0')).join('');
  }

  function makePage(name, labels) {
    return { id: newId(), name, entries: labels.map(text => ({ id: newId(), text })), history: [] };
  }

  function initialState() {
    const pages = [
      makePage('Little adventures', [
        'Read a book', 'Play a game', 'Draw something',
        'Watch a show', 'Make a little treat', 'Surprise me!'
      ]),
      makePage('Creative time', [
        'Make pixel art', 'Write a scene', 'Work on a game',
        'Plan a project', 'Learn something new', 'Just doodle'
      ])
    ];
    return { activeId: pages[0].id, pages };
  }

  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !Array.isArray(saved.pages) || !saved.pages.length) return initialState();
      const pages = saved.pages.slice(0, 100).map(page => ({
        id: typeof page.id === 'string' ? page.id : newId(),
        name: typeof page.name === 'string' ? page.name.slice(0, 48) : 'Untitled page',
        entries: Array.isArray(page.entries) ? page.entries.slice(0, MAX_OPTIONS)
          .filter(entry => entry && typeof entry.text === 'string')
          .map(entry => ({ id: typeof entry.id === 'string' ? entry.id : newId(), text: entry.text.slice(0, 70) })) : [],
        history: Array.isArray(page.history) ? page.history.slice(0, 8)
          .filter(item => item && typeof item.label === 'string')
          .map(item => ({ label: item.label.slice(0, 70), time: Number(item.time) || Date.now() })) : []
      }));
      if (!pages.length) return initialState();
      for (const page of pages) {
        while (page.entries.length < 2) page.entries.push({ id: newId(), text: `Option ${page.entries.length + 1}` });
      }
      const activeId = pages.some(page => page.id === saved.activeId) ? saved.activeId : pages[0].id;
      return { activeId, pages };
    } catch (_) {
      return initialState();
    }
  }

  let state = readState();
  let spinning = false;
  let rotorDegrees = 0;
  let spinFallback = null;

  const activePage = () => state.pages.find(page => page.id === state.activeId) || state.pages[0];
  const isReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      dom.localNote.textContent = '✧ Saved in this browser';
    } catch (_) {
      dom.localNote.textContent = '✧ Storage unavailable in this browser';
    }
  }

  function normalizeDegrees(n) { return ((n % 360) + 360) % 360; }
  function numberRoman(n) {
    const numerals = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
    return numerals[n - 1] || String(n);
  }

  function renderTabs() {
    dom.tabs.replaceChildren();
    state.pages.forEach((page, index) => {
      const tab = document.createElement('button');
      tab.className = 'page-tab';
      tab.type = 'button';
      tab.textContent = page.name || 'Untitled page';
      tab.title = page.name || 'Untitled page';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(page.id === state.activeId));
      tab.setAttribute('aria-label', `Page ${index + 1}: ${page.name}`);
      tab.disabled = spinning;
      tab.addEventListener('click', () => selectPage(page.id));
      dom.tabs.append(tab);
    });
    dom.newPage.disabled = spinning;
  }

  function renderEntries() {
    const page = activePage();
    dom.entries.replaceChildren();
    page.entries.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'option-row';
      const swatch = document.createElement('span');
      swatch.className = 'option-swatch';
      swatch.style.backgroundColor = COLORS[index % COLORS.length];
      swatch.setAttribute('aria-hidden', 'true');
      const count = document.createElement('span');
      count.className = 'option-number';
      count.textContent = String(index + 1).padStart(2, '0');
      const input = document.createElement('input');
      input.className = 'option-input';
      input.type = 'text';
      input.maxLength = 70;
      input.value = entry.text;
      input.setAttribute('aria-label', `Entry ${index + 1}`);
      input.disabled = spinning;
      input.addEventListener('input', () => {
        entry.text = input.value;
        drawWheel();
        save();
      });
      input.addEventListener('blur', () => {
        if (!entry.text.trim()) {
          entry.text = `Option ${index + 1}`;
          input.value = entry.text;
          drawWheel();
          save();
        }
      });
      const remove = document.createElement('button');
      remove.className = 'option-remove';
      remove.type = 'button';
      remove.textContent = '×';
      remove.title = 'Remove entry';
      remove.setAttribute('aria-label', `Remove entry ${index + 1}`);
      remove.disabled = spinning || page.entries.length <= 2;
      remove.addEventListener('click', () => {
        if (spinning || page.entries.length <= 2) return;
        page.entries.splice(index, 1);
        save();
        renderEntries();
        drawWheel();
      });
      row.append(swatch, count, input, remove);
      dom.entries.append(row);
    });
    dom.entryCount.textContent = `${page.entries.length} ${page.entries.length === 1 ? 'ENTRY' : 'ENTRIES'}`;
    dom.newOption.disabled = spinning || page.entries.length >= MAX_OPTIONS;
    dom.addForm.querySelector('button').disabled = spinning || page.entries.length >= MAX_OPTIONS;
    dom.newOption.placeholder = page.entries.length >= MAX_OPTIONS ? 'Maximum of 32 entries' : 'Add another possibility...';
  }

  function renderHistory() {
    const page = activePage();
    dom.historyWheelName.textContent = page.name || 'Untitled page';
    dom.history.replaceChildren();
    if (!page.history.length) {
      const item = document.createElement('li');
      item.className = 'history-empty';
      item.textContent = 'A blank page... for now.';
      dom.history.append(item);
    }
    page.history.forEach(result => {
      const item = document.createElement('li');
      const marker = document.createElement('span');
      marker.className = 'history-marker';
      marker.textContent = '✧';
      const label = document.createElement('span');
      label.className = 'history-entry';
      label.textContent = result.label;
      const time = document.createElement('time');
      time.dateTime = new Date(result.time).toISOString();
      time.textContent = new Date(result.time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      item.append(marker, label, time);
      dom.history.append(item);
    });
    dom.clearHistory.disabled = spinning || !page.history.length;
  }

  function renderAll() {
    const page = activePage();
    dom.wheelName.value = page.name;
    dom.chapter.textContent = numberRoman(state.pages.indexOf(page) + 1);
    renderTabs();
    renderEntries();
    renderHistory();
    dom.result.hidden = true;
    dom.hint.hidden = false;
    dom.deletePage.disabled = spinning || state.pages.length <= 1;
    dom.wheelName.disabled = spinning;
    dom.hint.textContent = 'Tap the wheel or bookkeeper to spin';
    drawWheel();
  }

  function selectPage(id) {
    if (spinning || !state.pages.some(page => page.id === id)) return;
    state.activeId = id;
    save();
    renderAll();
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
  }

  function wrapLabel(text, limit) {
    const words = String(text).trim().split(/\s+/);
    if (text.length <= limit) return [text];
    const lines = [''];
    for (const word of words) {
      const curr = lines[lines.length - 1];
      if (!curr || (curr.length + 1 + word.length <= limit)) {
        lines[lines.length - 1] = curr ? `${curr} ${word}` : word;
      } else if (lines.length < 2) {
        lines.push(word);
      } else {
        lines[1] += ` ${word}`;
      }
    }
    if (lines.length === 1 && lines[0].length > limit) {
      return [lines[0].slice(0, limit - 1) + '…'];
    }
    if (lines.length === 2 && lines[1].length > limit) lines[1] = lines[1].slice(0, limit - 1) + '…';
    return lines;
  }

  function drawWheel() {
    const canvas = dom.wheelCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const entries = activePage().entries;
    const count = Math.max(entries.length, 2);
    const center = canvas.width / 2;
    const radius = center - 32;
    const slice = Math.PI * 2 / count;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(center, center);

    // The colored sectors and their labels use exactly the same ordering
    // and arc widths as the unbiased secure selection below.
    entries.forEach((entry, i) => {
      const start = -Math.PI / 2 + i * slice;
      const end = start + slice;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius - 13, start, end);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#f6e6c9';
      ctx.stroke();

      const middle = start + slice / 2;
      const labelR = count >= 17 ? radius * .69 : count >= 11 ? radius * .65 : radius * .61;
      ctx.save();
      ctx.translate(Math.cos(middle) * labelR, Math.sin(middle) * labelR);
      let tilt = middle + Math.PI / 2;
      if (Math.cos(tilt) < 0) tilt += Math.PI;
      ctx.rotate(tilt);
      const fontSize = count > 20 ? 13 : count > 13 ? 15 : count > 8 ? 17 : 19;
      const maxChars = count > 15 ? 10 : count > 8 ? 14 : 17;
      ctx.font = `bold ${fontSize}px Georgia, serif`;
      ctx.fillStyle = '#453e39';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = wrapLabel(entry.text.trim() || '???', maxChars);
      const lineHeight = fontSize + 2;
      lines.forEach((line, li) => {
        // Keep the label inside the wedge on dense wheels.
        const maxW = count > 16 ? 79 : count > 10 ? 104 : 139;
        ctx.fillText(line, 0, (li - (lines.length - 1) / 2) * lineHeight, maxW);
      });
      ctx.restore();
    });

    // A hand-engraved edge; small marks on every segment.
    ctx.beginPath();
    ctx.arc(0, 0, radius - 7, 0, Math.PI * 2);
    ctx.strokeStyle = '#765648';
    ctx.lineWidth = 13;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius - 7, 0, Math.PI * 2);
    ctx.strokeStyle = '#ebd4a6';
    ctx.lineWidth = 3;
    ctx.stroke();
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (i + .5) * slice;
      const x = Math.cos(a) * (radius - 7);
      const y = Math.sin(a) * (radius - 7);
      ctx.beginPath();
      ctx.arc(x, y, count > 22 ? 3 : 4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff1cc';
      ctx.fill();
    }
    ctx.restore();
  }

  function lockInterface(locked) {
    spinning = locked;
    document.body.classList.toggle('is-spinning', locked);
    dom.wheelSpinTarget.disabled = locked;
    dom.characterSpinTarget.disabled = locked;
    dom.newPage.disabled = locked;
    dom.wheelName.disabled = locked;
    dom.newOption.disabled = locked;
    dom.addForm.querySelector('button').disabled = locked;
    dom.deletePage.disabled = locked || state.pages.length <= 1;
    dom.clearHistory.disabled = locked || !activePage().history.length;
    dom.tabs.querySelectorAll('button').forEach(button => { button.disabled = locked; });
    dom.entries.querySelectorAll('input, button').forEach(node => {
      node.disabled = locked || (node.classList.contains('option-remove') && activePage().entries.length <= 2);
    });
  }

  // CSS plays the original RGBA PNG frames as discrete sprite-sheet animations.
  // No GIF encoding or background removal is involved.
  function setCharacter(which) {
    dom.character.dataset.motion = which;
    dom.character.setAttribute('aria-label', imgAlt[which]);
  }

  function celebrate() {
    if (isReducedMotion()) {
      setCharacter('idle');
      return;
    }
    setCharacter('celebrate');
  }

  // Return to the looping idle animation when the CSS jump -> idle sequence ends.
  dom.character.addEventListener('animationend', event => {
    if (event.animationName === 'bookkeeper-celebrate' && dom.character.dataset.motion === 'celebrate') {
      setCharacter('idle');
    }
  });

  function spin() {
    if (spinning) return;
    const page = activePage();
    const entries = page.entries;
    const firstBlankIndex = entries.findIndex(entry => !entry.text.trim());
    if (firstBlankIndex !== -1) {
      dom.hint.textContent = 'Give every entry a name first ✧';
      dom.entries.querySelectorAll('input')[firstBlankIndex]?.focus();
      return;
    }
    if (entries.length < 2) {
      dom.hint.textContent = 'Your wheel needs at least two entries.';
      return;
    }

    let winnerIndex;
    let landingFraction;
    let turns;
    try {
      winnerIndex = secureInt(entries.length);
      landingFraction = .24 + secureFraction() * .52;
      turns = 6 + secureInt(3);
    } catch (error) {
      dom.hint.textContent = 'Secure randomness unavailable in this browser.';
      console.error(error);
      return;
    }

    setCharacter('review');
    dom.result.hidden = true;
    dom.hint.hidden = false;
    lockInterface(true);
    dom.hint.textContent = 'The bookkeeper is reviewing your choices...';

    const anglePerEntry = 360 / entries.length;
    const target = normalizeDegrees(-(winnerIndex + landingFraction) * anglePerEntry);
    const advance = normalizeDegrees(target - normalizeDegrees(rotorDegrees));
    // Stay on exact winning wedge, regardless of previous spin position.
    rotorDegrees += 360 * turns + advance;
    const duration = isReducedMotion() ? 400 : 4700;
    dom.rotor.style.transition = `transform ${duration}ms cubic-bezier(.12,.78,.13,1)`;
    dom.rotor.style.transform = `rotate(${rotorDegrees}deg)`;

    let completed = false;
    function finish() {
      if (completed) return;
      completed = true;
      clearTimeout(spinFallback);
      dom.rotor.removeEventListener('transitionend', transitionDone);
      // Normalize huge angles without moving the wheel perceptibly.
      if (Math.abs(rotorDegrees) > 360000) {
        rotorDegrees = normalizeDegrees(rotorDegrees);
        dom.rotor.style.transition = 'none';
        dom.rotor.style.transform = `rotate(${rotorDegrees}deg)`;
      }
      const chosen = entries[winnerIndex].text.trim();
      page.history.unshift({ label: chosen, time: Date.now() });
      page.history = page.history.slice(0, 8);
      save();
      lockInterface(false);
      renderHistory();
      dom.hint.textContent = 'A little fate, delivered with love ✧';
      dom.resultText.textContent = chosen;
      dom.resultText.title = chosen;
      dom.result.hidden = false;
      dom.hint.hidden = true;
      celebrate();
    }
    function transitionDone(event) {
      if (event.target === dom.rotor && event.propertyName === 'transform') finish();
    }
    dom.rotor.addEventListener('transitionend', transitionDone);
    spinFallback = setTimeout(finish, duration + 160);
  }

  dom.wheelSpinTarget.addEventListener('click', spin);
  dom.characterSpinTarget.addEventListener('click', spin);
  dom.addForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (spinning) return;
    const page = activePage();
    const text = dom.newOption.value.trim();
    if (!text || page.entries.length >= MAX_OPTIONS) return;
    page.entries.push({ id: newId(), text });
    dom.newOption.value = '';
    save();
    renderEntries();
    drawWheel();
    dom.newOption.focus();
  });
  dom.wheelName.addEventListener('input', () => {
    if (spinning) return;
    activePage().name = dom.wheelName.value;
    renderTabs();
    save();
  });
  dom.wheelName.addEventListener('blur', () => {
    if (!dom.wheelName.value.trim()) {
      activePage().name = 'Untitled page';
      dom.wheelName.value = activePage().name;
      renderTabs();
      save();
    }
  });
  dom.newPage.addEventListener('click', () => {
    if (spinning) return;
    const page = makePage('A new little chance', ['Option one', 'Option two']);
    state.pages.push(page);
    state.activeId = page.id;
    save();
    renderAll();
    dom.wheelName.focus();
    dom.wheelName.select();
  });
  dom.deletePage.addEventListener('click', () => {
    if (spinning || state.pages.length <= 1) return;
    const page = activePage();
    if (!window.confirm(`Delete the page "${page.name}" and its results?`)) return;
    state.pages = state.pages.filter(item => item.id !== page.id);
    state.activeId = state.pages[0].id;
    save();
    renderAll();
  });
  dom.clearHistory.addEventListener('click', () => {
    if (spinning) return;
    activePage().history = [];
    save();
    renderHistory();
  });
  dom.historyButton.addEventListener('click', () => {
    renderHistory();
    dom.historyDialog.showModal();
  });
  dom.closeHistoryDialog.addEventListener('click', () => dom.historyDialog.close());
  dom.doneHistoryDialog.addEventListener('click', () => dom.historyDialog.close());
  dom.historyDialog.addEventListener('click', event => {
    if (event.target === dom.historyDialog) dom.historyDialog.close();
  });
  dom.helpButton.addEventListener('click', () => dom.helpDialog.showModal());
  dom.closeDialog.addEventListener('click', () => dom.helpDialog.close());
  dom.doneDialog.addEventListener('click', () => dom.helpDialog.close());
  dom.helpDialog.addEventListener('click', event => {
    if (event.target === dom.helpDialog) dom.helpDialog.close();
  });

  renderAll();
  save();
})();
