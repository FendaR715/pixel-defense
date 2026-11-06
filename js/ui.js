/* Пиксельная Оборона — интерфейс, экраны, сохранения. */
(function (root) {
  'use strict';

  var TD = root.TD = root.TD || {};

  /* ============================================================
     Сохранения
     ============================================================ */

  var Save = (function () {
    var KEY = 'td_save_v1';
    var data = null;

    function defaults() {
      return {
        unlocked: 1,
        best: {},
        settings: { sound: true, grid: true, path: false }
      };
    }

    function normalize(raw) {
      var d = defaults();
      if (!raw || typeof raw !== 'object') return d;
      if (typeof raw.unlocked === 'number' && isFinite(raw.unlocked)) {
        d.unlocked = TD.clamp(Math.floor(raw.unlocked), 1, TD.Maps.length);
      }
      if (raw.best && typeof raw.best === 'object') {
        for (var k in raw.best) {
          if (!Object.prototype.hasOwnProperty.call(raw.best, k)) continue;
          var b = raw.best[k];
          if (!b || typeof b !== 'object') continue;
          d.best[k] = {
            score: Math.max(0, Number(b.score) || 0),
            waves: Math.max(0, Number(b.waves) || 0),
            win: !!b.win
          };
        }
      }
      if (raw.settings && typeof raw.settings === 'object') {
        if (typeof raw.settings.sound === 'boolean') d.settings.sound = raw.settings.sound;
        if (typeof raw.settings.grid === 'boolean') d.settings.grid = raw.settings.grid;
        if (typeof raw.settings.path === 'boolean') d.settings.path = raw.settings.path;
      }
      return d;
    }

    function load() {
      if (data) return data;
      try {
        var raw = root.localStorage ? root.localStorage.getItem(KEY) : null;
        data = normalize(raw ? JSON.parse(raw) : null);
      } catch (e) {
        data = defaults();
      }
      return data;
    }

    function persist(d) {
      data = d;
      try {
        if (root.localStorage) root.localStorage.setItem(KEY, JSON.stringify(d));
      } catch (e) {
        /* localStorage может быть запрещён на file:// — играем без сохранений */
      }
    }

    function record(summary) {
      if (!summary || typeof summary.levelIndex !== 'number') return;
      var d = load();
      var key = String(summary.levelIndex);
      var prev = d.best[key];
      var waves = Math.max(0, Math.floor(summary.wave || 0));
      var score = Math.max(0, Math.round(summary.score || 0));
      if (prev) {
        d.best[key] = {
          score: Math.max(prev.score, score),
          waves: Math.max(prev.waves, waves),
          win: !!(prev.win || summary.win)
        };
      } else {
        d.best[key] = { score: score, waves: waves, win: !!summary.win };
      }
      if (summary.win) {
        d.unlocked = TD.clamp(Math.max(d.unlocked, summary.levelIndex + 2), 1, TD.Maps.length);
      }
      persist(d);
    }

    function setSettings(settings) {
      var d = load();
      for (var k in settings) {
        if (Object.prototype.hasOwnProperty.call(settings, k)) d.settings[k] = !!settings[k];
      }
      persist(d);
    }

    function reset() {
      data = defaults();
      persist(data);
    }

    function best(levelIndex) {
      return load().best[String(levelIndex)] || null;
    }

    return {
      KEY: KEY,
      defaults: defaults,
      load: load,
      record: record,
      setSettings: setSettings,
      reset: reset,
      best: best
    };
  })();

  TD.Save = Save;

  /* ============================================================
     Интерфейс
     ============================================================ */

  var UI = (function () {
    var els = {};
    var state = {
      game: null,
      screen: 'screen-menu',
      speed: 1,
      sound: true,
      grid: true,
      path: false,
      testMode: false,
      assetsReady: false,
      frame: 0,
      lastT: 0,
      bannerTimer: null,
      toastTimer: null
    };
    var ctx = null;
    var menuCtx = null;
    var menuTime = 0;

    /* ---------- DOM ---------- */

    function $(id) { return document.getElementById(id); }

    function cacheDom() {
      els.canvas = $('game');
      els.menuCanvas = $('menu-scene');
      els.toast = $('toast');
      els.banner = $('banner');
      els.bannerTitle = $('banner-title');
      els.bannerSub = $('banner-sub');
      els.level = $('hud-level');
      els.wave = $('hud-wave');
      els.waves = $('hud-waves');
      els.wavebar = $('wavebar');
      els.lives = $('hud-lives');
      els.gold = $('hud-gold');
      els.score = $('hud-score');
      els.next = $('btn-next');
      els.pause = $('btn-pause');
      els.shop = $('shop');
      els.inspector = $('inspector');
      els.inspTitle = $('insp-title');
      els.inspClose = $('insp-close');
      els.inspRows = $('insp-rows');
      els.inspTarget = $('insp-target');
      els.inspTargetWrap = $('insp-target-wrap');
      els.inspUpgrade = $('insp-upgrade');
      els.inspSell = $('insp-sell');
      els.optPath = $('opt-path');
      els.optGrid = $('opt-grid');
      els.optSound = $('opt-sound');
      els.levelCards = $('level-cards');
      els.bestiaryTowers = $('bestiary-towers');
      els.bestiaryEnemies = $('bestiary-enemies');
      els.scoresBody = $('scores-body');
      els.btnReset = $('btn-reset-scores');
      els.resultTitle = $('result-title');
      els.resultSub = $('result-sub');
      els.resultStats = $('result-stats');
      els.btnRetry = $('btn-retry');
      els.btnResume = $('btn-resume');
      els.btnRestart = $('btn-restart');
      els.screens = {
        'screen-menu': $('screen-menu'),
        'screen-levels': $('screen-levels'),
        'screen-bestiary': $('screen-bestiary'),
        'screen-scores': $('screen-scores'),
        'screen-help': $('screen-help'),
        'screen-result': $('screen-result'),
        'screen-pause': $('screen-pause')
      };
      if (els.canvas) ctx = els.canvas.getContext('2d');
    }

    /* ---------- утилиты UI ---------- */

    function setText(el, value) {
      if (!el) return;
      var s = String(value);
      if (el._last !== s) {
        el.textContent = s;
        el._last = s;
      }
    }

    function toast(message, kind) {
      if (!els.toast) return;
      els.toast.textContent = message;
      els.toast.className = 'toast' + (kind ? ' toast--' + kind : '');
      els.toast.classList.remove('hidden');
      els.toast.classList.remove('is-show');
      void els.toast.offsetWidth;
      els.toast.classList.add('is-show');
      clearTimeout(state.toastTimer);
      state.toastTimer = setTimeout(function () {
        els.toast.classList.add('hidden');
        els.toast.classList.remove('is-show');
      }, 2200);
    }

    function showBanner(title, sub) {
      if (!els.banner) return;
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub || '';
      els.banner.classList.remove('hidden');
      els.banner.classList.remove('is-show');
      void els.banner.offsetWidth;
      els.banner.classList.add('is-show');
      clearTimeout(state.bannerTimer);
      state.bannerTimer = setTimeout(function () {
        els.banner.classList.add('hidden');
        els.banner.classList.remove('is-show');
      }, 2600);
    }

    function hideElement(el) {
      if (el) el.classList.add('hidden');
    }

    function showScreen(id) {
      for (var key in els.screens) {
        if (!Object.prototype.hasOwnProperty.call(els.screens, key)) continue;
        var s = els.screens[key];
        if (!s) continue;
        if (key === id) s.classList.remove('hidden');
        else s.classList.add('hidden');
      }
      state.screen = id || null;
      document.body.classList.toggle('has-screen', !!id && id !== 'screen-pause');
      if (id === 'screen-bestiary') renderBestiary();
    }

    function hideAllScreens() {
      showScreen(null);
    }

    /* ---------- магазин ---------- */

    function towerAssetIcon(def, size) {
      var A = TD.Assets;
      if (!A || !A.has('towerIdle2') || typeof document === 'undefined') return null;
      var cv = document.createElement('canvas');
      cv.width = size;
      cv.height = size;
      var c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;
      var h = size - 2;
      var w = h * 70 / 130;
      A.frame(c, 'towerIdle2', 0, 6, (size - w) / 2, 1, w, h);
      c.globalCompositeOperation = 'source-atop';
      c.globalAlpha = 0.5;
      c.fillStyle = def.color;
      c.fillRect(0, size * 0.22, size, size * 0.46);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = def.color;
      c.lineWidth = 2;
      c.strokeRect(1, 1, size - 2, size - 2);
      return cv;
    }

    function enemyAssetIcon(def, size) {
      var A = TD.Assets;
      if (!A || !def.anim || !A.has(def.anim + 'SWalk') || typeof document === 'undefined') return null;
      var cv = document.createElement('canvas');
      cv.width = size;
      cv.height = size;
      var c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;
      var fs = size * 1.35;
      A.frame(c, def.anim + 'SWalk', 0, 6, (size - fs) / 2, -size * 0.14, fs, fs);
      return cv;
    }

    function buildShop() {
      if (!els.shop) return;
      els.shop.innerHTML = '';
      TD.TowerDefs.forEach(function (def) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'shop__item';
        btn.dataset.tower = def.id;
        btn.title = def.name + ' — ' + def.desc +
          '\nУрон: ' + def.damage + ', радиус: ' + def.range + ' кл., ' + def.rate + ' выстр./с' +
          '\nВоздух: ' + (def.air ? 'да' : 'нет');

        var iconWrap = document.createElement('span');
        iconWrap.className = 'shop__icon';
        var icon = towerAssetIcon(def, 34) || TD.Sprites.icon(def.sprite, 34);
        if (icon) {
          icon.style.width = '34px';
          icon.style.height = '34px';
          iconWrap.appendChild(icon);
        }

        var text = document.createElement('span');
        text.className = 'shop__text';

        var name = document.createElement('span');
        name.className = 'shop__name';
        name.textContent = def.name;

        var key = document.createElement('kbd');
        key.className = 'shop__key';
        key.textContent = def.hotkey;

        var price = document.createElement('span');
        price.className = 'shop__price';
        price.textContent = def.price + ' ◈';

        var line = document.createElement('span');
        line.className = 'shop__line';
        line.appendChild(name);
        line.appendChild(key);

        var line2 = document.createElement('span');
        line2.className = 'shop__line';
        line2.appendChild(price);

        text.appendChild(line);
        text.appendChild(line2);
        btn.appendChild(iconWrap);
        btn.appendChild(text);
        btn.addEventListener('click', function () { chooseBuild(def.id); });
        els.shop.appendChild(btn);
      });
    }

    function updateShop() {
      if (!els.shop) return;
      var g = state.game;
      var items = els.shop.querySelectorAll('.shop__item');
      for (var i = 0; i < items.length; i++) {
        var btn = items[i];
        var def = TD.TowerById[btn.dataset.tower];
        if (!def) continue;
        var active = !!(g && g.buildType === def.id);
        var poor = !!(g && g.gold < def.price);
        btn.classList.toggle('is-active', active);
        btn.classList.toggle('is-poor', poor);
        var priceEl = btn.querySelector('.shop__price');
        if (priceEl) priceEl.textContent = def.price + ' ◈';
      }
    }

    function chooseBuild(typeId) {
      var g = state.game;
      if (!g || g.finished) return;
      if (g.paused) return;
      var def = TD.TowerById[typeId];
      if (!def) return;
      if (g.gold < def.price) {
        toast('Не хватает золота: нужно ' + def.price + ' ◈', 'warn');
        TD.Audio.play('error');
        return;
      }
      g.setBuildType(typeId);
      TD.Audio.play('click');
      updateShop();
      updateInspector();
    }

    /* ---------- инспектор ---------- */

    var inspSig = '';

    function updateInspector(force) {
      var g = state.game;
      var t = g && g.selected;
      var sig = t ? [t.id, t.level, t.targetMode, t.invested, g.finished ? 1 : 0].join('|') : 'none';
      if (!force && sig === inspSig) {
        if (t && t.level < TD.Config.maxTowerLevel) {
          els.inspUpgrade.disabled = g.gold < TD.towerUpgradeCost(t.def, t.level);
        }
        return;
      }
      inspSig = sig;
      if (!t || g.finished) {
        hideElement(els.inspector);
        return;
      }
      els.inspector.classList.remove('hidden');
      setText(els.inspTitle, t.def.name + ' · ур. ' + t.level);

      var rows = [
        ['Урон', Math.round(t.stats.damage) + (t.def.pierceArmor ? ' ⚡' : '')],
        ['Радиус', t.stats.range.toFixed(1) + ' кл.'],
        ['Скорость', t.def.rate.toFixed(2) + '/с'],
        ['Вложено', t.invested + ' ◈'],
        ['Продажа', '+' + TD.towerSellValue(t.invested) + ' ◈']
      ];
      els.inspRows.innerHTML = '';
      rows.forEach(function (row) {
        var div = document.createElement('div');
        div.className = 'inspector__row';
        var k = document.createElement('span');
        k.className = 'inspector__key';
        k.textContent = row[0];
        var v = document.createElement('span');
        v.className = 'inspector__val';
        v.textContent = row[1];
        div.appendChild(k);
        div.appendChild(v);
        els.inspRows.appendChild(div);
      });

      setText(els.inspTarget, g.targetModeName(t.targetMode));

      if (t.level >= TD.Config.maxTowerLevel) {
        setText(els.inspUpgrade, 'Макс. уровень');
        els.inspUpgrade.disabled = true;
      } else {
        var cost = TD.towerUpgradeCost(t.def, t.level);
        setText(els.inspUpgrade, 'Улучшить · ' + cost + ' ◈');
        els.inspUpgrade.disabled = g.gold < cost;
      }
      setText(els.inspSell, 'Продать · +' + TD.towerSellValue(t.invested) + ' ◈');
    }

    /* ---------- HUD ---------- */

    function updateHud(force) {
      var g = state.game;
      if (!g) return;
      setText(els.lives, g.lives);
      setText(els.gold, TD.fmtInt(g.gold));
      setText(els.score, TD.fmtInt(g.score));
      setText(els.wave, g.wave);
      setText(els.waves, g.waves.length);

      var progress = 0;
      if (g.state === 'wave' && g.waveTotal > 0) {
        progress = TD.clamp(g.waveResolved / g.waveTotal, 0, 1);
      } else if (g.wave > 0) {
        progress = 1;
      }
      if (els.wavebar) els.wavebar.style.width = (progress * 100).toFixed(1) + '%';

      if (els.level) {
        var label = g.map.name + ' · ' + g.map.subtitle;
        setText(els.level, label);
      }

      if (els.next) {
        var can = g.canStartWave();
        els.next.disabled = !can;
        if (can) {
          var n = g.nextWaveNumber();
          var bonus = g.wave > 0 ? TD.Config.earlyBonusBase + TD.Config.earlyBonusPerWave * n : 0;
          setText(els.next, 'Волна ' + n + ' ▸' + (bonus ? ' +' + bonus : ''));
          els.next.title = 'Начать волну ' + n + (bonus ? ' досрочно (+' + bonus + ' золота)' : '') + ' (N)';
        } else {
          setText(els.next, g.state === 'wave' ? 'Волна идёт' : 'Волна ▸');
        }
      }

      if (els.pause) {
        setText(els.pause, g.paused ? '▶' : '❚❚');
        els.pause.title = g.paused ? 'Продолжить (Space)' : 'Пауза (Space)';
      }

      var speedBtns = document.querySelectorAll('[data-speed]');
      for (var i = 0; i < speedBtns.length; i++) {
        speedBtns[i].classList.toggle('is-active', Number(speedBtns[i].dataset.speed) === g.speed);
      }

      updateShop();
    }

    /* ---------- уровень: запуск / пауза / конец ---------- */

    function applySettingsToGame(g) {
      if (!g) return;
      g.speed = state.speed;
      g.showGrid = state.grid;
      g.showPath = state.path;
    }

    function startLevel(index, opts) {
      opts = opts || {};
      var saved = Save.load();
      if (!opts.force && index >= saved.unlocked) {
        toast('Уровень закрыт — пройдите предыдущий', 'warn');
        TD.Audio.play('error');
        return false;
      }
      var g = new TD.Game(index);
      g.onEvent = handleGameEvent;
      state.game = g;
      state.testMode = !!opts.test;
      applySettingsToGame(g);
      hideAllScreens();
      updateShop();
      updateInspector();
      updateHud(true);
      if (opts.wave) {
        g.startWave();
        if (opts.fastForward) {
          for (var i = 0; i < (opts.fastForward | 0); i++) g.step(1 / 30);
        }
      } else {
        toast('Стройте башни у тропы, затем жмите «Волна»');
      }
      TD.Audio.unlock();
      return true;
    }

    function currentLevelIndex() {
      return state.game ? state.game.levelIndex : 0;
    }

    function togglePause(force) {
      var g = state.game;
      if (!g || g.finished) return;
      var pause = force == null ? !g.paused : !!force;
      g.paused = pause;
      if (pause) {
        showScreen('screen-pause');
      } else {
        hideAllScreens();
      }
      updateHud(true);
      TD.Audio.play('click');
    }

    function handleGameEvent(type, data) {
      switch (type) {
        case 'sound':
          TD.Audio.play(data.name);
          break;
        case 'banner':
          showBanner(data.title, data.sub);
          break;
        case 'wave-start':
          if (data.earlyBonus) toast('Досрочный запуск: +' + data.earlyBonus + ' ◈', 'good');
          updateShop();
          break;
        case 'wave-clear':
          if (!data.last) toast('Волна ' + data.wave + ' пройдена: +' + data.reward + ' ◈', 'good');
          break;
        case 'end':
          onGameEnd(data);
          break;
        default:
          break;
      }
    }

    function onGameEnd(summary) {
      if (!state.testMode) Save.record(summary);
      TD.Audio.play(summary.win ? 'win' : 'lose');
      showResult(summary);
      renderLevelCards();
      renderScores();
      updateInspector();
    }

    function showResult(summary) {
      if (!els.resultTitle) return;
      els.resultTitle.textContent = summary.win ? 'Победа!' : 'Сердце пало';
      els.resultTitle.classList.toggle('is-lose', !summary.win);
      setText(els.resultSub, 'Уровень «' + summary.levelName + '» · ' +
        (summary.win ? 'все ' + summary.wavesTotal + ' волн отбиты' : 'пройдено волн: ' + summary.wave + ' из ' + summary.wavesTotal));

      var stats = [
        ['Очки', TD.fmtInt(summary.score)],
        ['Волн', summary.wave + ' / ' + summary.wavesTotal],
        ['Убито', TD.fmtInt(summary.kills)],
        ['Время', TD.fmtTime(summary.time)],
        ['Жизни', summary.lives],
        ['Башен', summary.towers]
      ];
      els.resultStats.innerHTML = '';
      stats.forEach(function (row) {
        var div = document.createElement('div');
        div.className = 'result__stat';
        var v = document.createElement('span');
        v.className = 'result__val';
        v.textContent = row[1];
        var k = document.createElement('span');
        k.className = 'result__key';
        k.textContent = row[0];
        div.appendChild(v);
        div.appendChild(k);
        els.resultStats.appendChild(div);
      });

      showScreen('screen-result');
      updateHud(true);
    }

    /* ---------- карты уровня и рекорды ---------- */

    function drawMapPreview(canvas, map) {
      var c = canvas.getContext('2d');
      var cell = 8;
      c.imageSmoothingEnabled = false;
      var colors = {
        '.': '#a4ae4e', ',': '#e79a63', '#': '#8a8f7a', '~': '#4aa6c4',
        'S': '#9d4edd', 'B': '#ff4d6d'
      };
      for (var r = 0; r < map.ascii.length; r++) {
        for (var col = 0; col < map.ascii[r].length; col++) {
          var ch = map.ascii[r].charAt(col);
          c.fillStyle = colors[ch] || '#a4ae4e';
          c.fillRect(col * cell, r * cell, cell, cell);
          if (ch === '.') {
            c.fillStyle = '#bcc56a';
            c.fillRect(col * cell + 2, r * cell + 5, 2, 2);
          }
        }
      }
      try {
        var previewGrid = new TD.Grid(map);
        var path = previewGrid.getPath() || [];
        if (path.length > 1) {
          c.strokeStyle = 'rgba(61,220,151,0.55)';
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(path[0].c * cell + cell / 2, path[0].r * cell + cell / 2);
          for (var i = 1; i < path.length; i++) {
            c.lineTo(path[i].c * cell + cell / 2, path[i].r * cell + cell / 2);
          }
          c.stroke();
        }
      } catch (e) {
        /* превью не критично */
      }
    }

    function renderLevelCards() {
      if (!els.levelCards) return;
      var saved = Save.load();
      els.levelCards.innerHTML = '';
      TD.Maps.forEach(function (map, index) {
        var locked = index >= saved.unlocked;
        var best = Save.best(index);
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'card level-card' + (locked ? ' is-locked' : '');
        card.dataset.level = String(index);

        var previewWrap = document.createElement('span');
        previewWrap.className = 'level-card__preview';
        var preview = document.createElement('canvas');
        preview.width = 192;
        preview.height = 120;
        preview.className = 'level-card__map';
        drawMapPreview(preview, map);
        previewWrap.appendChild(preview);
        if (locked) {
          var lock = document.createElement('span');
          lock.className = 'level-card__lock';
          lock.textContent = 'ЗАКРЫТ';
          previewWrap.appendChild(lock);
        }

        var title = document.createElement('span');
        title.className = 'level-card__name';
        title.textContent = map.name;

        var sub = document.createElement('span');
        sub.className = 'level-card__sub';
        sub.textContent = map.subtitle + ' · сложность ' + '★'.repeat(map.difficulty);

        var info = document.createElement('span');
        info.className = 'level-card__best';
        if (locked) info.textContent = 'Закрыт';
        else if (best) info.textContent = (best.win ? '✔ пройден' : 'волн: ' + best.waves) + ' · рекорд ' + TD.fmtInt(best.score);
        else info.textContent = 'Ещё не пройден';

        card.appendChild(previewWrap);
        card.appendChild(title);
        card.appendChild(sub);
        card.appendChild(info);
        card.addEventListener('click', function () {
          if (locked) {
            toast('Уровень закрыт — сначала пройдите предыдущий', 'warn');
            TD.Audio.play('error');
            return;
          }
          startLevel(index, { force: true });
        });
        els.levelCards.appendChild(card);
      });
    }

    function makeBeastCard(def, kind) {
      var card = document.createElement('div');
      card.className = 'beast';

      var iconWrap = document.createElement('div');
      iconWrap.className = 'beast__icon';
      var icon = (kind === 'tower' ? towerAssetIcon(def, 52) : enemyAssetIcon(def, 52)) ||
        TD.Sprites.icon(def.sprite, 52);
      if (icon) {
        icon.style.width = '52px';
        icon.style.height = '52px';
        iconWrap.appendChild(icon);
      }

      var body = document.createElement('div');
      body.className = 'beast__body';

      var name = document.createElement('h4');
      name.className = 'beast__name';
      name.textContent = def.name;

      if (kind === 'tower' && def.hotkey) {
        var key = document.createElement('kbd');
        key.className = 'beast__key';
        key.textContent = def.hotkey;
        name.appendChild(key);
      }

      var stats = document.createElement('div');
      stats.className = 'beast__stats';
      if (kind === 'tower') {
        stats.textContent = def.price + ' ◈ · урон ' + def.damage + ' · радиус ' +
          def.range + ' · ' + def.rate + '/с';
      } else {
        stats.textContent = 'HP ' + def.hp + ' · скорость ' + def.speed +
          ' · броня ' + def.armor + ' · ' + def.gold + ' ◈';
      }

      var desc = document.createElement('p');
      desc.className = 'beast__desc';
      desc.textContent = def.desc || '';

      body.appendChild(name);
      body.appendChild(stats);
      body.appendChild(desc);
      card.appendChild(iconWrap);
      card.appendChild(body);

      var tags = [];
      if (kind === 'tower') {
        if (!def.air) tags.push('только по земле');
      } else {
        if (def.flying) tags.push('летает');
        if (def.boss) tags.push('босс');
        if (def.armor >= 6) tags.push('высокая броня');
      }
      if (tags.length) {
        var tag = document.createElement('span');
        tag.className = 'beast__tag';
        tag.textContent = tags.join(' · ');
        body.appendChild(tag);
      }

      return card;
    }

    function renderBestiary() {
      var i;
      if (els.bestiaryTowers) {
        els.bestiaryTowers.innerHTML = '';
        for (i = 0; i < TD.TowerDefs.length; i++) {
          els.bestiaryTowers.appendChild(makeBeastCard(TD.TowerDefs[i], 'tower'));
        }
      }
      if (els.bestiaryEnemies) {
        els.bestiaryEnemies.innerHTML = '';
        var ids = ['slime', 'runner', 'swarm', 'brute', 'shield', 'flyer', 'boss'];
        for (i = 0; i < ids.length; i++) {
          var def = TD.EnemyDefs[ids[i]];
          if (def) els.bestiaryEnemies.appendChild(makeBeastCard(def, 'enemy'));
        }
      }
    }

    function renderScores() {
      if (!els.scoresBody) return;
      var saved = Save.load();
      els.scoresBody.innerHTML = '';
      TD.Maps.forEach(function (map, index) {
        var best = Save.best(index);
        var tr = document.createElement('tr');
        var cells = [
          map.name,
          best ? TD.fmtInt(best.score) : '—',
          best ? best.waves + ' / ' + TD.Config.waveCount : '—',
          best ? (best.win ? 'пройден' : 'в процессе') : '—'
        ];
        cells.forEach(function (text) {
          var td = document.createElement('td');
          td.textContent = text;
          tr.appendChild(td);
        });
        els.scoresBody.appendChild(tr);
      });
    }

    /* ---------- игровые действия ---------- */

    function nextWave() {
      var g = state.game;
      if (!g || g.finished) return;
      if (g.paused) return;
      if (!g.canStartWave()) {
        if (g.state === 'wave') toast('Сначала закончите текущую волну');
        return;
      }
      if (g.startWave()) {
        updateHud(true);
      }
    }

    function upgradeSelected() {
      var g = state.game;
      if (!g || g.finished || g.paused) return;
      if (!g.selected) {
        toast('Сначала выделите башню');
        return;
      }
      var res = g.upgradeTower(g.selected);
      if (!res.ok) {
        toast(res.reason, 'warn');
        TD.Audio.play('error');
      }
      updateHud(true);
      updateInspector();
    }

    function sellSelected() {
      var g = state.game;
      if (!g || g.finished || g.paused) return;
      if (!g.selected) {
        toast('Сначала выделите башню');
        return;
      }
      var res = g.sellTower(g.selected);
      if (res.ok) {
        toast('Башня продана: +' + res.refund + ' ◈', 'good');
      }
      updateHud(true);
      updateInspector();
    }

    function cycleTarget() {
      var g = state.game;
      if (!g || !g.selected) return;
      g.cycleTarget(g.selected);
      updateInspector();
    }

    function toggleSetting(which) {
      if (which === 'path') {
        state.path = !state.path;
        if (els.optPath) els.optPath.checked = state.path;
      } else if (which === 'grid') {
        state.grid = !state.grid;
        if (els.optGrid) els.optGrid.checked = state.grid;
      } else if (which === 'sound') {
        state.sound = !state.sound;
        if (els.optSound) els.optSound.checked = state.sound;
        TD.Audio.setEnabled(state.sound);
      }
      if (state.game) applySettingsToGame(state.game);
      Save.setSettings({ sound: state.sound, grid: state.grid, path: state.path });
    }

    /* ---------- ввод ---------- */

    function eventPoint(e) {
      var canvas = els.canvas;
      var rect = canvas.getBoundingClientRect();
      var x = (e.clientX - rect.left) * canvas.width / rect.width;
      var y = (e.clientY - rect.top) * canvas.height / rect.height;
      return {
        x: x,
        y: y,
        c: Math.floor(x / TD.Config.cell),
        r: Math.floor(y / TD.Config.cell)
      };
    }

    function eventCell(e) {
      var p = eventPoint(e);
      return { c: p.c, r: p.r };
    }

    function bindEvents() {
      var canvas = els.canvas;

      canvas.addEventListener('mousemove', function (e) {
        var g = state.game;
        if (!g) return;
        var p = eventPoint(e);
        g.setPointer(p.x, p.y);
        if (p.c !== g.hover.c || p.r !== g.hover.r) {
          g.setHover(p.c, p.r);
        }
      });

      canvas.addEventListener('mouseleave', function () {
        if (state.game) {
          state.game.setHover(-1, -1);
          state.game.clearPointer();
        }
      });

      canvas.addEventListener('click', function (e) {
        var g = state.game;
        if (!g || g.finished || g.paused) return;
        var p = eventPoint(e);
        var cell = { c: p.c, r: p.r };
        if (g.buildType) {
          var res = g.placeTower(cell.c, cell.r, g.buildType);
          if (!res.ok) {
            toast(res.reason, 'warn');
            TD.Audio.play('error');
            g.setHover(cell.c, cell.r);
          } else {
            updateHud(true);
            updateInspector();
          }
        } else {
          var t = g.towerAtPoint(p.x, p.y) || g.towerAt(cell.c, cell.r);
          g.selectTower(t);
          if (!t) {
            g.setHover(cell.c, cell.r);
            if (g.isSpot(cell.c, cell.r)) {
              toast('Площадка под башню: выберите башню (1–5)');
            }
          }
          updateInspector();
          if (t) TD.Audio.play('click');
        }
      });

      canvas.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        var g = state.game;
        if (!g || g.finished) return;
        var p = eventPoint(e);
        var cell = { c: p.c, r: p.r };
        if (g.buildType) {
          g.buildType = null;
          updateShop();
          updateInspector();
          g.setHover(cell.c, cell.r);
          return;
        }
        var t = g.towerAtPoint(p.x, p.y) || g.towerAt(cell.c, cell.r);
        if (t) {
          var res = g.sellTower(t);
          if (res.ok) toast('Башня продана: +' + res.refund + ' ◈', 'good');
          updateHud(true);
          updateInspector();
        } else {
          g.selectTower(null);
          updateInspector();
        }
      });

      if (els.next) els.next.addEventListener('click', nextWave);
      if (els.pause) els.pause.addEventListener('click', function () { togglePause(); });
      if (els.btnResume) els.btnResume.addEventListener('click', function () { togglePause(false); });
      if (els.btnRestart) els.btnRestart.addEventListener('click', function () {
        startLevel(currentLevelIndex(), { force: true });
      });
      if (els.btnRetry) els.btnRetry.addEventListener('click', function () {
        startLevel(currentLevelIndex(), { force: true });
      });

      var speedBtns = document.querySelectorAll('[data-speed]');
      for (var i = 0; i < speedBtns.length; i++) {
        speedBtns[i].addEventListener('click', function () {
          state.speed = TD.clamp(Number(this.dataset.speed) || 1, 1, TD.Config.maxSpeed);
          if (state.game) state.game.speed = state.speed;
          updateHud(true);
        });
      }

      if (els.inspUpgrade) els.inspUpgrade.addEventListener('click', upgradeSelected);
      if (els.inspSell) els.inspSell.addEventListener('click', sellSelected);
      if (els.inspTarget) els.inspTarget.addEventListener('click', cycleTarget);
      if (els.inspClose) els.inspClose.addEventListener('click', function () {
        if (state.game) state.game.selectTower(null);
        updateInspector();
      });

      if (els.optPath) els.optPath.addEventListener('change', function () {
        state.path = this.checked;
        if (state.game) state.game.showPath = state.path;
        Save.setSettings({ sound: state.sound, grid: state.grid, path: state.path });
      });
      if (els.optGrid) els.optGrid.addEventListener('change', function () {
        state.grid = this.checked;
        if (state.game) state.game.showGrid = state.grid;
        Save.setSettings({ sound: state.sound, grid: state.grid, path: state.path });
      });
      if (els.optSound) els.optSound.addEventListener('change', function () {
        state.sound = this.checked;
        TD.Audio.setEnabled(state.sound);
        Save.setSettings({ sound: state.sound, grid: state.grid, path: state.path });
      });

      if (els.btnReset) els.btnReset.addEventListener('click', function () {
        if (root.confirm && !root.confirm('Сбросить все рекорды и прогресс?')) return;
        Save.reset();
        renderLevelCards();
        renderScores();
        toast('Рекорды сброшены');
      });

      /* меню и экраны — делегирование */
      document.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
        if (!btn) return;
        var action = btn.dataset.action;
        TD.Audio.unlock();
        TD.Audio.play('click');
        if (action === 'play') {
          var saved = Save.load();
          var idx = TD.clamp(saved.unlocked - 1, 0, TD.Maps.length - 1);
          startLevel(idx, { force: true });
        } else if (action === 'levels') {
          state.game = null;
          renderLevelCards();
          showScreen('screen-levels');
        } else if (action === 'bestiary') {
          renderBestiary();
          showScreen('screen-bestiary');
        } else if (action === 'scores') {
          renderScores();
          showScreen('screen-scores');
        } else if (action === 'help') {
          showScreen('screen-help');
        } else if (action === 'menu') {
          state.game = null;
          showScreen('screen-menu');
        }
      });

      document.addEventListener('pointerdown', function () {
        TD.Audio.unlock();
      }, { once: true });

      document.addEventListener('keydown', function (e) {
        var tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        var g = state.game;
        var key = (e.key || '').toLowerCase();

        if (!g) {
          if (key === 'escape' && state.screen && state.screen !== 'screen-menu') {
            showScreen('screen-menu');
          }
          return;
        }

        if (key === 'escape') {
          e.preventDefault();
          if (g.paused) {
            togglePause(false);
          } else if (g.buildType) {
            g.buildType = null;
            updateShop();
            updateInspector();
          } else if (g.selected) {
            g.selectTower(null);
            updateInspector();
          } else {
            togglePause(true);
          }
          return;
        }

        if (key >= '1' && key <= '5') {
          var def = TD.TowerDefs[Number(key) - 1];
          if (def) chooseBuild(def.id);
          return;
        }

        if (key === ' ') {
          e.preventDefault();
          if (!g.finished) togglePause();
          return;
        }
        if (key === 'n') { nextWave(); return; }
        if (key === 'u') { upgradeSelected(); return; }
        if (key === 's') { sellSelected(); return; }
        if (key === 'p') { toggleSetting('path'); return; }
        if (key === 'g') { toggleSetting('grid'); return; }
        if (key === 'm') { toggleSetting('sound'); return; }
      });
    }

    /* ---------- подгонка под окно ---------- */

    var fitScheduled = false;

    function fitLayout() {
      fitScheduled = false;
      var app = document.querySelector('.app');
      if (!app) return;
      var vw = root.innerWidth || 1400;
      var vh = root.innerHeight || 900;
      /* измеряем настоящий размер без масштаба, затем подгоняем.
         Резервируем место под инспектор, чтобы при выделении башни
         масштаб не прыгал. */
      app.style.zoom = '1';
      var w = Math.max(app.offsetWidth || 0, TD.Config.width + 354);
      var h = Math.max(app.offsetHeight || 0, TD.Config.height + 95);
      var scale = Math.min(1.0, (vw - 40) / w, (vh - 40) / h);
      scale = Math.max(0.35, Math.round(scale * 1000) / 1000);
      app.style.zoom = String(scale);
    }

    function scheduleFit() {
      if (fitScheduled) return;
      fitScheduled = true;
      if (root.requestAnimationFrame) root.requestAnimationFrame(fitLayout);
      else setTimeout(fitLayout, 16);
    }

    function loop(ts) {
      var dt = state.lastT ? (ts - state.lastT) / 1000 : 0;
      state.lastT = ts;
      if (!state.assetsReady && TD.Assets && TD.Assets.ready()) {
        state.assetsReady = true;
        buildShop();
        renderBestiary();
      }
      var g = state.game;
      if (g && !g.paused && !g.finished) {
        g.update(dt);
      }
      if (g && ctx) {
        g.render(ctx);
        updateHud();
        updateInspector();
        state.frame += 1;
      } else if (state.screen === 'screen-menu' && menuCtx && TD.MenuScene) {
        menuTime += Math.min(dt, 0.05);
        TD.MenuScene.render(menuCtx, menuTime);
      }
      root.requestAnimationFrame(loop);
    }

    /* ---------- запуск ---------- */

    function init(opts) {
      opts = opts || {};
      cacheDom();
      if (!els.canvas) {
        if (typeof console !== 'undefined') console.error('UI: canvas #game не найден');
        return;
      }
      if (ctx) ctx.imageSmoothingEnabled = false;
      if (els.menuCanvas) menuCtx = els.menuCanvas.getContext('2d');
      if (menuCtx) menuCtx.imageSmoothingEnabled = false;

      var saved = Save.load();
      state.sound = saved.settings.sound !== false;
      state.grid = saved.settings.grid !== false;
      state.path = !!saved.settings.path;
      if (els.optSound) els.optSound.checked = state.sound;
      if (els.optGrid) els.optGrid.checked = state.grid;
      if (els.optPath) els.optPath.checked = state.path;
      TD.Audio.setEnabled(state.sound);

      buildShop();
      bindEvents();
      renderLevelCards();
      renderBestiary();
      renderScores();
      showScreen('screen-menu');
      fitLayout();
      if (root.addEventListener) root.addEventListener('resize', scheduleFit);

      if (opts.level != null) {
        startLevel(opts.level, {
          force: true,
          wave: opts.wave !== false,
          test: !!opts.test,
          fastForward: opts.fastForward || 0
        });
      }

      root.requestAnimationFrame(loop);
    }

    return {
      init: init,
      startLevel: startLevel,
      showScreen: showScreen,
      showResult: showResult,
      toast: toast,
      state: state,
      getGame: function () { return state.game; }
    };
  })();

  TD.UI = UI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
