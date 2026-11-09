(() => {
  'use strict';

  const SIZE = 4;
  const STATE_KEY = 'game2048-state';
  const LEADERS_KEY = 'game2048-leaders';
  const MOVE_MS = 120;

  const KEYS = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    score: $('score'),
    grid: $('grid'),
    tiles: $('tiles'),
    board: $('board'),
    gameover: $('gameover'),
    gameoverText: $('gameover-text'),
    gameoverRestart: $('gameover-restart'),
    saveForm: $('save-form'),
    nameInput: $('name-input'),
    undoBtn: $('undo-btn'),
    restartBtn: $('restart-btn'),
    leadersBtn: $('leaders-btn'),
    controls: $('controls'),
    modal: $('leaders-modal'),
    leadersBody: $('leaders-body'),
    leadersEmpty: $('leaders-empty'),
    leadersClose: $('leaders-close'),
  };

  // game: { tiles: [{id, value, r, c}], score, nextId, prev, over, saved }
  let game;
  let modalOpen = false;
  const tileEls = new Map();

  /* ---------- хранилище ---------- */

  function saveState() {
    const data = {
      tiles: game.tiles.map(({ id, value, r, c }) => ({ id, value, r, c })),
      score: game.score,
      nextId: game.nextId,
      prev: game.prev,
      over: game.over,
      saved: game.saved,
    };
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(data));
    } catch (e) { /* хранилище недоступно */ }
  }

  function isValidTile(t) {
    return t && Number.isInteger(t.id) && Number.isInteger(t.value) && t.value > 0 &&
      Number.isInteger(t.r) && t.r >= 0 && t.r < SIZE &&
      Number.isInteger(t.c) && t.c >= 0 && t.c < SIZE;
  }

  function loadState() {
    try {
      const data = JSON.parse(localStorage.getItem(STATE_KEY));
      if (!data || !Array.isArray(data.tiles) || !data.tiles.every(isValidTile)) return null;
      if (!Number.isFinite(data.score) || !Number.isInteger(data.nextId)) return null;
      const prev = data.prev && Array.isArray(data.prev.tiles) && data.prev.tiles.every(isValidTile)
        ? data.prev : null;
      return {
        tiles: data.tiles,
        score: data.score,
        nextId: data.nextId,
        prev,
        over: Boolean(data.over),
        saved: Boolean(data.saved),
      };
    } catch (e) {
      return null;
    }
  }

  function loadLeaders() {
    try {
      const data = JSON.parse(localStorage.getItem(LEADERS_KEY));
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function saveLeaders(list) {
    try {
      localStorage.setItem(LEADERS_KEY, JSON.stringify(list));
    } catch (e) { /* хранилище недоступно */ }
  }

  /* ---------- логика игры ---------- */

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function emptyCells() {
    const busy = new Set(game.tiles.map((t) => t.r * SIZE + t.c));
    const result = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!busy.has(r * SIZE + c)) result.push([r, c]);
      }
    }
    return result;
  }

  function spawn(count) {
    for (let i = 0; i < count; i++) {
      const empties = emptyCells();
      if (empties.length === 0) return;
      const [r, c] = empties[randomInt(0, empties.length - 1)];
      game.tiles.push({
        id: game.nextId++,
        value: Math.random() < 0.9 ? 2 : 4,
        r,
        c,
        isNew: true,
      });
    }
  }

  function hasMoves() {
    if (emptyCells().length > 0) return true;
    const m = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    game.tiles.forEach((t) => { m[t.r][t.c] = t.value; });
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (c + 1 < SIZE && m[r][c] === m[r][c + 1]) return true;
        if (r + 1 < SIZE && m[r][c] === m[r + 1][c]) return true;
      }
    }
    return false;
  }

  // плитки линии, упорядоченные от края, к которому идёт движение
  function getLine(dir, line) {
    const own = game.tiles.filter((t) => (dir === 'left' || dir === 'right' ? t.r : t.c) === line);
    const key = dir === 'left' || dir === 'right' ? 'c' : 'r';
    const asc = dir === 'left' || dir === 'up';
    return own.sort((a, b) => (asc ? a[key] - b[key] : b[key] - a[key]));
  }

  // клетка с номером k в линии, считая от края движения
  function cellAt(dir, line, k) {
    switch (dir) {
      case 'left': return [line, k];
      case 'right': return [line, SIZE - 1 - k];
      case 'up': return [k, line];
      default: return [SIZE - 1 - k, line];
    }
  }

  function move(dir) {
    if (game.over) return;

    const snapshot = {
      tiles: game.tiles.map(({ id, value, r, c }) => ({ id, value, r, c })),
      score: game.score,
    };

    let moved = false;
    let gained = 0;
    const dying = [];
    const removed = new Set();

    for (let line = 0; line < SIZE; line++) {
      let list = getLine(dir, line).map((t) => ({ value: t.value, tiles: [t] }));

      // сливаем пары, пока в линии остаются соседние одинаковые числа
      let again = true;
      while (again) {
        again = false;
        const next = [];
        for (let i = 0; i < list.length; i++) {
          if (i + 1 < list.length && list[i].value === list[i + 1].value) {
            const value = list[i].value * 2;
            next.push({ value, tiles: list[i].tiles.concat(list[i + 1].tiles) });
            gained += value;
            i++;
            again = true;
          } else {
            next.push(list[i]);
          }
        }
        list = next;
      }

      list.forEach((group, k) => {
        const [r, c] = cellAt(dir, line, k);
        const keeper = group.tiles[0];
        if (keeper.r !== r || keeper.c !== c) moved = true;
        keeper.r = r;
        keeper.c = c;
        if (group.tiles.length > 1) {
          moved = true;
          keeper.value = group.value;
          keeper.justMerged = true;
          group.tiles.slice(1).forEach((t) => {
            dying.push({ id: t.id, r, c });
            removed.add(t.id);
          });
        }
      });
    }

    if (!moved) return;

    game.tiles = game.tiles.filter((t) => !removed.has(t.id));
    game.prev = snapshot;
    game.score += gained;
    spawn(randomInt(1, 2));
    game.over = !hasMoves();

    render(dying);
    saveState();
  }

  function undo() {
    if (!game.prev || game.over) return;
    game.tiles = game.prev.tiles.map((t) => ({ ...t }));
    game.score = game.prev.score;
    game.prev = null;
    render();
    saveState();
  }

  function newGame() {
    game = { tiles: [], score: 0, nextId: 1, prev: null, over: false, saved: false };
    spawn(randomInt(1, 3));
    render();
    saveState();
  }

  /* ---------- отрисовка ---------- */

  function setPos(el, r, c) {
    el.style.setProperty('--r', r);
    el.style.setProperty('--c', c);
  }

  function setValue(el, value) {
    el.dataset.value = value;
    el.dataset.digits = String(value).length;
    el.firstChild.textContent = value;
  }

  function createTileEl(tile) {
    const el = document.createElement('div');
    el.className = 'tile';
    const inner = document.createElement('div');
    inner.className = 'tile__inner';
    el.append(inner);
    setPos(el, tile.r, tile.c);
    setValue(el, tile.value);
    if (tile.isNew) inner.classList.add('tile__inner--new');
    els.tiles.append(el);
    return el;
  }

  function playPop(el) {
    const inner = el.firstChild;
    inner.classList.remove('tile__inner--merged');
    void inner.offsetWidth; // перезапуск анимации
    inner.classList.add('tile__inner--merged');
  }

  function render(dying = []) {
    els.score.textContent = game.score;

    const live = new Set(game.tiles.map((t) => t.id));
    for (const [id, el] of tileEls) {
      if (live.has(id)) continue;
      tileEls.delete(id);
      const d = dying.find((x) => x.id === id);
      if (d) {
        el.classList.add('tile--dying');
        setPos(el, d.r, d.c);
        setTimeout(() => el.remove(), MOVE_MS);
      } else {
        el.remove();
      }
    }

    game.tiles.forEach((t) => {
      let el = tileEls.get(t.id);
      if (!el) {
        el = createTileEl(t);
        tileEls.set(t.id, el);
      } else {
        setPos(el, t.r, t.c);
        if (el.dataset.value !== String(t.value)) {
          if (t.justMerged) {
            setTimeout(() => {
              const cur = game.tiles.find((x) => x.id === t.id);
              if (cur && tileEls.get(t.id) === el) {
                setValue(el, cur.value);
                playPop(el);
              }
            }, MOVE_MS);
          } else {
            setValue(el, t.value);
          }
        }
      }
      t.isNew = false;
      t.justMerged = false;
    });

    updateUI();
  }

  function updateUI() {
    const wasHidden = els.gameover.hidden;
    els.gameover.hidden = !game.over;
    els.saveForm.hidden = game.saved;
    els.gameoverText.textContent = game.saved
      ? 'Ваш рекорд сохранен'
      : 'Игра окончена. Ваш счёт: ' + game.score;
    els.undoBtn.disabled = game.over || !game.prev;
    els.controls.hidden = game.over || modalOpen;
    if (game.over && wasHidden && !game.saved) els.nameInput.focus();
  }

  /* ---------- рекорды ---------- */

  function submitRecord(e) {
    e.preventDefault();
    const name = els.nameInput.value.trim();
    if (!name) {
      els.nameInput.focus();
      return;
    }
    const list = loadLeaders();
    list.push({ name, score: game.score, date: new Date().toISOString() });
    list.sort((a, b) => b.score - a.score);
    saveLeaders(list.slice(0, 10));
    game.saved = true;
    els.nameInput.value = '';
    updateUI();
    saveState();
  }

  function renderLeaders() {
    const list = loadLeaders().slice(0, 10);
    els.leadersBody.replaceChildren();
    els.leadersEmpty.hidden = list.length > 0;
    list.forEach((rec) => {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = rec.name;
      const score = document.createElement('td');
      score.textContent = rec.score;
      const date = document.createElement('td');
      date.textContent = new Date(rec.date).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      tr.append(name, score, date);
      els.leadersBody.append(tr);
    });
  }

  function openLeaders() {
    renderLeaders();
    modalOpen = true;
    els.modal.hidden = false;
    updateUI();
    els.leadersClose.focus();
  }

  function closeLeaders() {
    modalOpen = false;
    els.modal.hidden = true;
    updateUI();
  }

  /* ---------- события ---------- */

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOpen) {
      closeLeaders();
      return;
    }
    const dir = KEYS[e.key];
    if (!dir || modalOpen || game.over) return;
    e.preventDefault();
    move(dir);
  });

  els.controls.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-dir]');
    if (btn && !modalOpen) move(btn.dataset.dir);
  });

  // свайпы по полю
  let touchStart = null;
  els.board.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  els.board.addEventListener('touchend', (e) => {
    if (!touchStart || modalOpen || game.over) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
    else move(dy > 0 ? 'down' : 'up');
  }, { passive: true });

  els.undoBtn.addEventListener('click', undo);
  els.restartBtn.addEventListener('click', newGame);
  els.gameoverRestart.addEventListener('click', newGame);
  els.leadersBtn.addEventListener('click', openLeaders);
  els.leadersClose.addEventListener('click', closeLeaders);
  els.modal.addEventListener('click', (e) => {
    if (e.target === els.modal) closeLeaders();
  });
  els.saveForm.addEventListener('submit', submitRecord);

  /* ---------- старт ---------- */

  for (let i = 0; i < SIZE * SIZE; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    els.grid.append(cell);
  }

  game = loadState();
  if (game) render();
  else newGame();
})();