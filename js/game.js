/* Пиксельная Оборона — игровой цикл и правила.
   Game не знает про DOM: получает dt, отдаёт состояние и рисует через ctx.
   Это позволяет запускать логику в Node (тесты). */
(function (root) {
  'use strict';

  var TD = root.TD = root.TD || {};
  var C = TD.Config;

  TD.TARGET_MODES = [
    { id: 'first', name: 'первая', hint: 'дальше всех прошедшая путь' },
    { id: 'strong', name: 'сильная', hint: 'максимум здоровья' },
    { id: 'near', name: 'ближняя', hint: 'ближе всего к башне' }
  ];

  /* Палитра под набор free-fields: оливковая трава, тёплая земля.
     Если картинки не загрузились, поля рисуются этими цветами. */
  var GRASS = {
    pass: {
      a: '#a4ae4e', b: '#9ea849', dot: '#c4cc6d', edge: '#6e7734',
      road: '#e79a63', roadEdge: '#a95d3c', roadSpeck: '#f4c695',
      flower: '#fff3b0', flower2: '#ffd166', rock: '#8a8f7a'
    },
    canyon: {
      a: '#a9a34f', b: '#a29c4a', dot: '#c9c273', edge: '#716c34',
      road: '#e39a60', roadEdge: '#a45c38', roadSpeck: '#f0c28d',
      flower: '#ffd166', flower2: '#ef8354', rock: '#a98a63'
    },
    swamp: {
      a: '#8cae62', b: '#86a75d', dot: '#b7cf85', edge: '#5a733c',
      road: '#d9a06c', roadEdge: '#9c633c', roadSpeck: '#ecc493',
      flower: '#c9f0ff', flower2: '#ffd166', rock: '#84908a'
    }
  };

  function Game(levelIndex) {
    this.levelIndex = TD.clamp(levelIndex || 0, 0, TD.Maps.length - 1);
    this.map = TD.Maps[this.levelIndex];
    this.grid = new TD.Grid(this.map);

    this.gold = C.startGold;
    this.lives = C.startLives;
    this.score = 0;

    this.wave = 0;
    this.waves = TD.buildWaves(this.levelIndex, C.waveCount);
    this.state = 'idle';           // idle | wave | over
    this.paused = false;
    this.finished = false;
    this.result = null;
    this.speed = 1;

    this.time = 0;
    this.elapsed = 0;
    this.waveTime = 0;
    this.spawns = [];
    this.spawnIndex = 0;
    this.waveTotal = 0;
    this.waveResolved = 0;
    this.waveKilled = 0;
    this.waveLabel = '';

    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.effects = [];
    this.particles = [];
    this.floats = [];

    this.buildType = null;
    this.selected = null;
    this.hover = { c: -1, r: -1, ok: false, reason: '' };
    this.showPath = false;
    this.showGrid = true;
    this.shake = 0;

    this.kills = 0;
    this.leaks = 0;
    this.nextId = 1;

    this.onEvent = function () {};

    this.pointer = { x: -1000, y: -1000, active: false };
    this.pathKeys = {};
    this.pathCells = [];
    this.refreshPath();
    this.decor = this.buildDecor();
    this.camps = this.findCamps();
    this.spots = this.computeSpots(C.buildSpots);
    this.spotKeys = {};
    for (var si = 0; si < this.spots.length; si++) {
      this.spotKeys[this.spots[si].c + ',' + this.spots[si].r] = true;
    }
  }

  /** Уголки карты под декоративные палатки (не на маршруте). */
  Game.prototype.findCamps = function () {
    var corners = [
      { c: 0, r: this.grid.rows - 1 },
      { c: this.grid.cols - 1, r: 0 },
      { c: 0, r: 0 },
      { c: this.grid.cols - 1, r: this.grid.rows - 1 }
    ];
    var out = [];
    for (var i = 0; i < corners.length; i++) {
      var p = corners[i];
      if (!this.grid.buildable(p.c, p.r)) continue;
      if (this.onPath(p.c, p.r)) continue;
      if (this.grid.spawn.c === p.c && this.grid.spawn.r === p.r) continue;
      if (this.grid.base.c === p.c && this.grid.base.r === p.r) continue;
      out.push(p);
    }
    return out.slice(0, 2);
  };

  /**
   * Площадки под башни: клетки у дороги, разнесённые друг от друга.
   * Так игрок не застраивает всё поле, но у каждой башни есть зона обстрела.
   */
  Game.prototype.computeSpots = function (count) {
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var pathCells = this.pathCells || [];
    var seen = {};
    var cand = [];
    var i, d;

    for (i = 0; i < pathCells.length; i++) {
      var p = pathCells[i];
      for (d = 0; d < dirs.length; d++) {
        var c = p.c + dirs[d][0];
        var r = p.r + dirs[d][1];
        if (!this.grid.buildable(c, r)) continue;
        if (this.onPath(c, r)) continue;
        var key = c + ',' + r;
        if (seen[key]) continue;
        seen[key] = true;

        var center = this.grid.cellCenter(c, r);
        var cover = 0;
        for (var k = 0; k < pathCells.length; k++) {
          var q = this.grid.cellCenter(pathCells[k].c, pathCells[k].r);
          if (TD.dist(center.x, center.y, q.x, q.y) <= 3 * this.grid.cell) cover += 1;
        }
        cand.push({ c: c, r: r, cover: cover, idx: i });
      }
    }

    cand.sort(function (a, b) {
      return (b.cover - a.cover) || (a.idx - b.idx);
    });

    var out = [];
    var spacing = [3, 2, 1];
    for (var s = 0; s < spacing.length && out.length < count; s++) {
      for (i = 0; i < cand.length && out.length < count; i++) {
        var candSpot = cand[i];
        var tooClose = false;
        for (var o = 0; o < out.length; o++) {
          var distCheb = Math.max(Math.abs(out[o].c - candSpot.c), Math.abs(out[o].r - candSpot.r));
          if (distCheb < spacing[s]) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;
        out.push(candSpot);
      }
    }
    return out.slice(0, count);
  };

  Game.prototype.isSpot = function (c, r) {
    return !!this.spotKeys[c + ',' + r];
  };

  Game.prototype.spotAt = function (c, r) {
    for (var i = 0; i < this.spots.length; i++) {
      if (this.spots[i].c === c && this.spots[i].r === r) return this.spots[i];
    }
    return null;
  };

  /* ================= события и звук ================= */

  Game.prototype.emit = function (type, data) {
    try {
      this.onEvent(type, data || {});
    } catch (e) {
      if (typeof console !== 'undefined') console.error('Game event error:', e);
    }
  };

  Game.prototype.sound = function (name) {
    this.emit('sound', { name: name });
  };

  /* ================= подготовка ================= */

  Game.prototype.buildDecor = function () {
    var out = [];
    var seed = TD.hash('decor:' + this.levelIndex);
    for (var r = 0; r < this.grid.rows; r++) {
      for (var c = 0; c < this.grid.cols; c++) {
        var ch = this.grid.at(c, r);
        var n = TD.noise2(c, r, seed);
        var n2 = TD.noise2(c + 13, r + 7, seed);
        var n3 = TD.noise2(c + 41, r + 23, seed);
        out.push({
          c: c, r: r, ch: ch,
          dot: n > 0.45,
          bush: (ch === '.' || ch === ',') && n > 0.975,
          shrub: ch === '.' && n2 > 0.84 && n2 < 0.89,
          flower: ch === '.' && n2 > 0.9,
          flowerWarm: n > 0.5,
          tuft: (ch === '.' || ch === ',') && n > 0.46 && n < 0.6,
          patch: ch === '.' && n2 > 0.8 && n2 < 0.84,
          prop: ch === '.' && n3 > 0.94,
          propType: (n3 > 0.97 ? 'box' : 'log'),
          flip: n > 0.5,
          deco: TD.hash('deco:' + c + ':' + r + ':' + this.levelIndex)
        });
      }
    }
    return out;
  };

  Game.prototype.refreshPath = function () {
    var cells = this.grid.getPath() || [];
    this.pathCells = cells;
    this.pathPoints = this.grid.cellsToPoints(cells);
    this.pathKeys = {};
    for (var i = 0; i < cells.length; i++) {
      this.pathKeys[cells[i].c + ',' + cells[i].r] = true;
    }
  };

  Game.prototype.onPath = function (c, r) {
    return !!this.pathKeys[c + ',' + r];
  };

  /** Курсор в координатах поля — для подсказок при наведении. */
  Game.prototype.setPointer = function (x, y) {
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.active = true;
  };

  Game.prototype.clearPointer = function () {
    this.pointer.active = false;
  };

  /* ================= волны ================= */

  Game.prototype.canStartWave = function () {
    return !this.finished && this.state === 'idle' && this.wave < this.waves.length;
  };

  Game.prototype.nextWaveNumber = function () {
    return Math.min(this.wave + 1, this.waves.length);
  };

  Game.prototype.startWave = function () {
    if (!this.canStartWave()) return false;
    var next = this.wave + 1;
    var earlyBonus = 0;
    if (this.wave > 0) {
      earlyBonus = C.earlyBonusBase + C.earlyBonusPerWave * next;
      this.gold += earlyBonus;
    }
    var w = this.waves[next - 1];
    this.wave = next;
    this.state = 'wave';
    this.spawns = w.spawns;
    this.spawnIndex = 0;
    this.waveTime = 0;
    this.waveTotal = w.total;
    this.waveResolved = 0;
    this.waveKilled = 0;
    this.waveLabel = w.label;
    this.emit('wave-start', {
      wave: next,
      label: w.label,
      total: w.total,
      boss: w.boss,
      earlyBonus: earlyBonus
    });
    this.emit('banner', {
      title: w.boss ? 'ВОЛНА ' + next + ' — БОСС' : 'Волна ' + next,
      sub: w.boss ? 'Владыка идёт к сердцу!' : w.label + ' · ' + w.total + ' противников'
    });
    this.sound('wave');
    return true;
  };

  Game.prototype.checkWaveDone = function () {
    if (this.state !== 'wave' || this.finished) return;
    if (this.spawnIndex < this.spawns.length || this.enemies.length > 0) return;
    var w = this.waves[this.wave - 1];
    this.gold += w.reward;
    this.score += 30 * this.wave;
    this.state = 'idle';
    this.emit('wave-clear', { wave: this.wave, reward: w.reward, last: this.wave >= this.waves.length });
    if (this.wave >= this.waves.length) {
      this.win();
      return;
    }
    this.sound('upgrade');
    this.emit('banner', {
      title: 'Волна ' + this.wave + ' пройдена',
      sub: '+' + w.reward + ' золота · Следующая волна: ' + this.waves[this.wave].label
    });
  };

  /* ================= башни ================= */

  Game.prototype.towerAt = function (c, r) {
    for (var i = 0; i < this.towers.length; i++) {
      var t = this.towers[i];
      if (t.c === c && t.r === r) return t;
    }
    return null;
  };

  Game.prototype.setBuildType = function (typeId) {
    if (typeId && !TD.TowerById[typeId]) typeId = null;
    this.buildType = this.buildType === typeId ? null : typeId;
    if (this.buildType) this.selected = null;
    return this.buildType;
  };

  Game.prototype.setHover = function (c, r) {
    var inside = this.grid.inBounds(c, r);
    this.hover.c = inside ? c : -1;
    this.hover.r = inside ? r : -1;
    this.hover.ok = false;
    this.hover.reason = '';
    if (!inside) return;
    if (this.buildType) {
      var def = TD.TowerById[this.buildType];
      if (!this.isSpot(c, r)) {
        this.hover.reason = 'Только на площадке';
      } else if (!this.grid.buildable(c, r)) {
        this.hover.reason = 'Площадка занята';
      } else if (this.gold < def.price) {
        this.hover.reason = 'Не хватает золота';
      } else if (!this.grid.canPlace(c, r)) {
        this.hover.reason = 'Путь перекрыт';
      } else {
        this.hover.ok = true;
      }
    }
  };

  Game.prototype.placeTower = function (c, r, typeId) {
    var def = TD.TowerById[typeId];
    if (!def) return { ok: false, reason: 'Неизвестная башня' };
    if (this.finished) return { ok: false, reason: 'Уровень окончен' };
    if (!this.isSpot(c, r)) return { ok: false, reason: 'Только на площадке' };
    if (!this.grid.buildable(c, r)) return { ok: false, reason: 'Площадка занята' };
    if (this.gold < def.price) return { ok: false, reason: 'Не хватает золота' };
    var center = this.grid.cellCenter(c, r);
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dead || e.flying) continue;
      if (TD.dist(e.x, e.y, center.x, center.y) < C.cell * 0.7) {
        return { ok: false, reason: 'Здесь враг' };
      }
    }
    if (!this.grid.canPlace(c, r)) return { ok: false, reason: 'Путь перекрыт' };

    var tower = {
      id: this.nextId++,
      def: def,
      typeId: def.id,
      c: c,
      r: r,
      x: center.x,
      y: center.y,
      level: 1,
      stats: TD.towerStats(def, 1),
      cooldown: 0.25,
      recoil: 0,
      targetMode: 'first',
      invested: def.price,
      angle: -Math.PI / 2,
      shots: 0
    };
    this.grid.place(c, r, tower);
    this.towers.push(tower);
    this.gold -= def.price;
    this.buildType = null;
    this.selected = tower;
    this.hover.ok = false;

    this.repathAll();
    this.refreshPath();
    this.burst(center.x, center.y, def.color, 10);
    this.floatText(center.x, center.y - 20, '-' + def.price, '#ef476f');
    this.sound('build');
    return { ok: true, tower: tower };
  };

  Game.prototype.upgradeTower = function (t) {
    t = t || this.selected;
    if (!t) return { ok: false, reason: 'Башня не выбрана' };
    if (t.level >= C.maxTowerLevel) return { ok: false, reason: 'Максимальный уровень' };
    var cost = TD.towerUpgradeCost(t.def, t.level);
    if (this.gold < cost) return { ok: false, reason: 'Не хватает золота' };
    this.gold -= cost;
    t.invested += cost;
    t.level += 1;
    t.stats = TD.towerStats(t.def, t.level);
    this.burst(t.x, t.y, t.def.color, 12);
    this.floatText(t.x, t.y - 24, 'Ур. ' + t.level, '#3ddc97');
    this.sound('upgrade');
    return { ok: true, cost: cost, level: t.level };
  };

  Game.prototype.sellTower = function (t) {
    t = t || this.selected;
    if (!t) return { ok: false, reason: 'Башня не выбрана' };
    var refund = TD.towerSellValue(t.invested);
    this.grid.remove(t.c, t.r);
    var i = this.towers.indexOf(t);
    if (i >= 0) this.towers.splice(i, 1);
    this.gold += refund;
    if (this.selected === t) this.selected = null;
    this.repathAll();
    this.refreshPath();
    this.burst(t.x, t.y, '#f2c14e', 8);
    this.floatText(t.x, t.y - 20, '+' + refund, '#f2c14e');
    this.sound('sell');
    return { ok: true, refund: refund };
  };

  Game.prototype.cycleTarget = function (t) {
    t = t || this.selected;
    if (!t) return null;
    var idx = 0;
    for (var i = 0; i < TD.TARGET_MODES.length; i++) {
      if (TD.TARGET_MODES[i].id === t.targetMode) { idx = i; break; }
    }
    t.targetMode = TD.TARGET_MODES[(idx + 1) % TD.TARGET_MODES.length].id;
    this.sound('click');
    return t.targetMode;
  };

  Game.prototype.selectTower = function (t) {
    this.selected = t || null;
    if (t) this.buildType = null;
  };

  Game.prototype.targetModeName = function (mode) {
    for (var i = 0; i < TD.TARGET_MODES.length; i++) {
      if (TD.TARGET_MODES[i].id === mode) return TD.TARGET_MODES[i].name;
    }
    return mode;
  };

  /* ================= враги ================= */

  Game.prototype.spawnEnemy = function (type, opts) {
    var def = TD.EnemyDefs[type];
    if (!def) return null;
    opts = opts || {};
    var scale = TD.enemyHpScale(this.wave || 1, this.levelIndex);
    var hp = opts.hp != null ? opts.hp : def.hp * scale;
    var startPixel = this.grid.cellCenter(this.grid.spawn.c, this.grid.spawn.r);
    var x = opts.x != null ? opts.x : startPixel.x;
    var y = opts.y != null ? opts.y : startPixel.y;

    var e = {
      id: this.nextId++,
      type: type,
      def: def,
      hp: hp,
      maxHp: hp,
      speed: def.speed * C.cell,
      armor: def.armor,
      flying: !!def.flying,
      boss: !!def.boss,
      lives: def.lives || 1,
      x: x,
      y: y,
      path: [],
      pathIndex: 1,
      traveled: 0,
      slowUntil: 0,
      slowFactor: 1,
      hitFlash: 0,
      dead: false,
      phase: Math.random() * Math.PI * 2
    };

    if (e.flying) {
      var base = this.grid.cellCenter(this.grid.base.c, this.grid.base.r);
      e.path = [{ x: x, y: y }, { x: base.x, y: base.y }];
      if (x === startPixel.x && y === startPixel.y) {
        e.path = this.grid.airPath();
        e.pathIndex = 1;
      }
    } else {
      var cell = this.grid.pixelToCell(x, y);
      if (!this.grid.walkable(cell.c, cell.r)) {
        cell = this.grid.nearestWalkable(cell.c, cell.r) || this.grid.spawn;
      }
      var cells = this.grid.findPath(cell, this.grid.base);
      if (!cells) cells = [this.grid.spawn, this.grid.base];
      var points = this.grid.cellsToPoints(cells);
      points[0] = { x: x, y: y };
      e.path = points;
      e.pathIndex = points.length > 1 ? 1 : 1;
      e.cell = cell;
    }

    this.enemies.push(e);
    return e;
  };

  Game.prototype.removeEnemy = function (e) {
    var i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
  };

  Game.prototype.repathAll = function () {
    var base = this.grid.base;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dead || e.flying) continue;
      var cell = this.grid.pixelToCell(e.x, e.y);
      if (!this.grid.walkable(cell.c, cell.r)) {
        cell = this.grid.nearestWalkable(cell.c, cell.r) || this.grid.spawn;
      }
      var cells = this.grid.findPath(cell, base);
      if (!cells) {
        e.path = [{ x: e.x, y: e.y }, this.grid.cellCenter(base.c, base.r)];
        e.pathIndex = 1;
        continue;
      }
      var points = this.grid.cellsToPoints(cells);
      points[0] = { x: e.x, y: e.y };
      e.path = points;
      e.pathIndex = points.length > 1 ? 1 : 1;
    }
  };

  Game.prototype.damageEnemy = function (e, amount, opts) {
    if (!e || e.dead || this.finished) return 0;
    opts = opts || {};
    var dmg = TD.computeDamage(amount, e.armor, opts.pierceArmor);
    e.hp -= dmg;
    e.hitFlash = 0.12;
    if (e.hp <= 0) this.killEnemy(e);
    return dmg;
  };

  Game.prototype.killEnemy = function (e) {
    if (e.dead) return;
    e.dead = true;
    this.removeEnemy(e);
    this.gold += e.def.gold;
    this.score += e.def.points;
    this.kills += 1;
    this.waveKilled += 1;
    this.waveResolved += 1;
    this.floatText(e.x, e.y - 12, '+' + e.def.gold, '#f2c14e');
    this.burst(e.x, e.y, e.def.color, e.boss ? 30 : 10);
    this.sound(e.boss ? 'explode' : 'kill');

    if (e.boss) {
      this.shake = Math.max(this.shake, 0.45);
      this.addEffect({ type: 'boom', x: e.x, y: e.y, radius: 90, color: '#ef476f', dur: 0.5 });
      for (var i = 0; i < 3; i++) {
        var a = (Math.PI * 2 / 3) * i + 0.4;
        this.spawnEnemy('brute', { x: e.x + Math.cos(a) * 14, y: e.y + Math.sin(a) * 14 });
      }
    }
  };

  Game.prototype.leakEnemy = function (e) {
    if (e.dead) return;
    e.dead = true;
    this.removeEnemy(e);
    this.lives -= e.lives || 1;
    this.leaks += 1;
    this.waveResolved += 1;
    var base = this.grid.cellCenter(this.grid.base.c, this.grid.base.r);
    this.addEffect({ type: 'boom', x: base.x, y: base.y, radius: 60, color: '#ef476f', dur: 0.4 });
    this.burst(base.x, base.y, '#ef476f', 12);
    this.floatText(base.x, base.y - 30, '-' + (e.lives || 1) + ' ♥', '#ef476f');
    this.sound('leak');
    this.shake = 0.3;
    this.emit('leak', { lives: this.lives });
    if (this.lives <= 0) {
      this.lives = 0;
      this.lose();
    }
  };

  Game.prototype.moveEnemy = function (e, dt) {
    var speed = e.speed;
    if (e.slowUntil > this.time) speed *= e.slowFactor;
    var remain = speed * dt;
    var guard = 0;
    while (remain > 0.0001 && e.pathIndex < e.path.length && guard++ < 128) {
      var wp = e.path[e.pathIndex];
      var dx = wp.x - e.x;
      var dy = wp.y - e.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d <= remain) {
        e.x = wp.x;
        e.y = wp.y;
        e.traveled += d;
        remain -= d;
        e.pathIndex += 1;
      } else if (d > 0.0001) {
        e.x += dx / d * remain;
        e.y += dy / d * remain;
        e.traveled += remain;
        remain = 0;
      } else {
        e.pathIndex += 1;
      }
    }
    if (e.pathIndex >= e.path.length) {
      this.leakEnemy(e);
      return;
    }
    if (!e.flying) e.cell = this.grid.pixelToCell(e.x, e.y);
  };

  /* ================= выстрелы ================= */

  Game.prototype.findTarget = function (t) {
    var range = t.stats.range * C.cell;
    var mode = t.targetMode;
    var best = null;
    var bestVal = -Infinity;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dead) continue;
      if (!TD.canTarget(t.def, e)) continue;
      var d = TD.dist(t.x, t.y, e.x, e.y);
      if (d > range) continue;
      var val;
      if (mode === 'strong') val = e.hp;
      else if (mode === 'near') val = -d;
      else val = e.traveled;
      if (val > bestVal) {
        bestVal = val;
        best = e;
      }
    }
    return best;
  };

  Game.prototype.fire = function (t, target) {
    var def = t.def;
    var dmg = t.stats.damage;
    t.recoil = 1;
    t.shots += 1;
    t.angle = Math.atan2(target.y - t.y, target.x - t.x);

    if (def.attack === 'projectile' || def.attack === 'splash' || def.attack === 'slow') {
      this.projectiles.push({
        x: t.x,
        y: t.y - 8,
        target: target,
        speed: def.projSpeed * C.cell,
        damage: dmg,
        def: def,
        splash: def.splash || 0,
        slow: def.attack === 'slow' ? { factor: def.slowFactor, duration: def.slowDuration } : null,
        color: def.color,
        angle: t.angle,
        trail: []
      });
      if (def.id === 'cannon') this.sound('cannon');
      else if (def.id === 'frost') this.sound('frost');
      else this.sound('shoot');
    } else if (def.attack === 'beam') {
      this.damageEnemy(target, dmg, { pierceArmor: !!def.pierceArmor });
      this.addEffect({
        type: 'beam', x1: t.x, y1: t.y - 10, x2: target.x, y2: target.y,
        color: def.color, dur: 0.16, width: 2, kind: 'sniper'
      });
      this.sound('sniper');
    } else if (def.attack === 'chain') {
      this.fireChain(t, target);
    }
  };

  Game.prototype.fireChain = function (t, target) {
    var def = t.def;
    var hitList = [target];
    var dmg = t.stats.damage;
    this.damageEnemy(target, dmg, {});
    this.addEffect({
      type: 'beam', x1: t.x, y1: t.y - 12, x2: target.x, y2: target.y,
      color: def.color, dur: 0.14, width: 2, kind: 'tesla'
    });
    var last = target;
    var chainRange = (def.chainRange || 2.2) * C.cell;
    for (var n = 1; n < (def.chain || 3); n++) {
      var next = null;
      var bestD = Infinity;
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (e.dead || hitList.indexOf(e) >= 0) continue;
        var d = TD.dist(last.x, last.y, e.x, e.y);
        if (d <= chainRange && d < bestD) {
          bestD = d;
          next = e;
        }
      }
      if (!next) break;
      hitList.push(next);
      dmg *= (def.chainFalloff || 0.7);
      this.damageEnemy(next, dmg, {});
      this.addEffect({
        type: 'beam', x1: last.x, y1: last.y, x2: next.x, y2: next.y,
        color: def.color, dur: 0.14, width: 2, kind: 'tesla'
      });
      last = next;
    }
    this.sound('tesla');
  };

  /* ================= эффекты ================= */

  Game.prototype.addEffect = function (effect) {
    effect.t = 0;
    this.effects.push(effect);
    if (this.effects.length > 120) this.effects.shift();
  };

  Game.prototype.burst = function (x, y, color, count) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 20 + Math.random() * 90;
      this.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 20,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
        color: color,
        size: 2 + Math.random() * 2
      });
    }
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  };

  Game.prototype.floatText = function (x, y, text, color) {
    this.floats.push({ x: x, y: y, text: text, color: color, life: 0.9, maxLife: 0.9 });
    if (this.floats.length > 40) this.floats.shift();
  };

  Game.prototype.updateEffects = function (dt) {
    var i;
    for (i = this.effects.length - 1; i >= 0; i--) {
      var ef = this.effects[i];
      ef.t += dt;
      if (ef.t >= ef.dur) this.effects.splice(i, 1);
    }
    for (i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (i = this.floats.length - 1; i >= 0; i--) {
      var f = this.floats[i];
      f.life -= dt;
      f.y -= 26 * dt;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.2);
  };

  /* ================= обновление ================= */

  Game.prototype.update = function (dt) {
    if (this.paused || this.finished) return;
    if (!isFinite(dt) || dt <= 0) return;
    var scaled = Math.min(dt, C.maxDt) * this.speed;
    var step = 1 / 60;
    var guard = 0;
    while (scaled > 0.0001 && guard++ < 24) {
      var d = Math.min(step, scaled);
      this.step(d);
      scaled -= d;
      if (this.finished) break;
    }
  };

  Game.prototype.step = function (dt) {
    this.time += dt;
    this.elapsed += dt;

    if (this.state === 'wave') {
      this.waveTime += dt;
      while (this.spawnIndex < this.spawns.length && this.spawns[this.spawnIndex].t <= this.waveTime) {
        this.spawnEnemy(this.spawns[this.spawnIndex].type);
        this.spawnIndex += 1;
      }
    }

    var i;
    for (i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i];
      if (e.dead) continue;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      this.moveEnemy(e, dt);
      if (this.finished) return;
    }

    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateEffects(dt);

    if (this.state === 'wave') this.checkWaveDone();
    if (this.lives <= 0 && !this.finished) {
      this.lives = 0;
      this.lose();
    }
  };

  Game.prototype.updateTowers = function (dt) {
    for (var i = 0; i < this.towers.length; i++) {
      var t = this.towers[i];
      if (t.cooldown > 0) t.cooldown -= dt;
      if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 4);
      var target = this.findTarget(t);
      if (!target) continue;
      t.angle = Math.atan2(target.y - t.y, target.x - t.x);
      if (t.cooldown <= 0) {
        this.fire(t, target);
        t.cooldown = 1 / t.def.rate;
      }
    }
  };

  Game.prototype.updateProjectiles = function (dt) {
    for (var i = this.projectiles.length - 1; i >= 0; i--) {
      var p = this.projectiles[i];
      var target = p.target;
      if (!target || target.dead || this.enemies.indexOf(target) < 0) {
        this.projectiles.splice(i, 1);
        continue;
      }
      var dx = target.x - p.x;
      var dy = target.y - p.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      var step = p.speed * dt;
      p.angle = Math.atan2(dy, dx);
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 4) p.trail.shift();
      if (d <= step || d < 4) {
        this.impact(p, target);
        this.projectiles.splice(i, 1);
      } else {
        p.x += dx / d * step;
        p.y += dy / d * step;
      }
    }
  };

  Game.prototype.impact = function (p, target) {
    if (p.splash > 0) {
      var radius = p.splash * C.cell;
      this.addEffect({ type: 'boom', x: target.x, y: target.y, radius: radius, color: p.color, dur: 0.34 });
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (e.dead || e.flying) continue;
        if (TD.dist(target.x, target.y, e.x, e.y) <= radius) {
          this.damageEnemy(e, p.damage, {});
        }
      }
      this.burst(target.x, target.y, p.color, 8);
      this.sound('explode');
    } else {
      this.damageEnemy(target, p.damage, {});
      if (p.slow && !target.dead) {
        target.slowUntil = Math.max(target.slowUntil, this.time + p.slow.duration);
        target.slowFactor = Math.min(target.slowFactor, p.slow.factor);
      }
      this.addEffect({ type: 'hit', x: target.x, y: target.y, color: p.color, dur: 0.18 });
    }
  };

  /* ================= победа и поражение ================= */

  Game.prototype.summary = function () {
    return {
      win: this.result === 'win',
      levelIndex: this.levelIndex,
      levelName: this.map.name,
      score: Math.round(this.score),
      wave: this.wave,
      wavesTotal: this.waves.length,
      lives: this.lives,
      gold: this.gold,
      kills: this.kills,
      leaks: this.leaks,
      time: this.elapsed,
      towers: this.towers.length
    };
  };

  Game.prototype.win = function () {
    if (this.finished) return;
    this.finished = true;
    this.result = 'win';
    this.state = 'over';
    this.score += this.lives * 25;
    this.emit('end', this.summary());
  };

  Game.prototype.lose = function () {
    if (this.finished) return;
    this.finished = true;
    this.result = 'lose';
    this.state = 'over';
    this.emit('end', this.summary());
  };

  /* ================= отрисовка ================= */

  Game.prototype.render = function (ctx) {
    if (!ctx) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    if (this.shake > 0) {
      var s = this.shake * 6;
      ctx.translate((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s);
    }

    this.drawTerrain(ctx);
    if (this.showGrid) this.drawGrid(ctx);
    if (this.showPath) this.drawPath(ctx);
    this.drawSpots(ctx);
    this.drawTowers(ctx);
    this.drawEnemies(ctx);
    this.drawProjectiles(ctx);
    this.drawEffects(ctx);
    this.drawParticles(ctx);
    this.drawPurchase(ctx);
    this.drawFloats(ctx);
    this.drawTooltips(ctx);

    ctx.restore();
  };

  Game.prototype.drawTerrain = function (ctx) {
    var g = this.grid;
    var cell = g.cell;
    var pal = GRASS[this.map.id] || GRASS.pass;
    var t = this.time;
    var A = TD.Assets;
    var tiles = !!(A && A.has('fields'));
    var i, d;

    ctx.imageSmoothingEnabled = false;

    for (i = 0; i < this.decor.length; i++) {
      d = this.decor[i];
      var x = d.c * cell;
      var y = d.r * cell;
      var ch = d.ch;

      if (ch === '#') {
        /* трава + камни из набора */
        if (!tiles || !A.tile(ctx, 37, x, y, cell)) {
          ctx.fillStyle = pal.edge;
          ctx.fillRect(x, y, cell, cell);
        }
        /* тёмная каменистая подложка, чтобы стена читалась как препятствие */
        ctx.save();
        ctx.globalAlpha = 0.42;
        TD.Sprites.draw(ctx, 'rock', x, y, cell, cell);
        ctx.restore();
        if (A && A.has('stone3')) {
          var bigStone = ['stone3', 'stone4', 'stone1'][d.deco % 3];
          A.draw(ctx, bigStone, x + 1, y + 6, cell - 2, cell - 9);
          A.draw(ctx, 'stoneSmall', x + cell * 0.58, y + cell * 0.58, 14, 11);
        } else {
          TD.Sprites.draw(ctx, 'rock', x, y, cell, cell);
        }
      } else if (ch === '~') {
        ctx.fillStyle = '#4aa6c4';
        ctx.fillRect(x, y, cell, cell);
        /* песчаный берег там, где вода граничит с землёй */
        ctx.fillStyle = '#c98a58';
        if (g.at(d.c, d.r - 1) !== '~') ctx.fillRect(x, y, cell, 4);
        if (g.at(d.c, d.r + 1) !== '~') ctx.fillRect(x, y + cell - 4, cell, 4);
        if (g.at(d.c - 1, d.r) !== '~') ctx.fillRect(x, y, 4, cell);
        if (g.at(d.c + 1, d.r) !== '~') ctx.fillRect(x + cell - 4, y, 4, cell);
        var waveY = Math.sin(t * 1.8 + d.c * 0.7 + d.r * 0.35) * 4;
        ctx.fillStyle = '#3f94b4';
        ctx.fillRect(x, y + 10 + waveY, cell, 7);
        ctx.fillStyle = '#8fd8e8';
        ctx.fillRect(x + 4, y + 24 - waveY, cell - 10, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(x + 7 + (d.flip ? 12 : 0), y + 7, 4, 2);
        if (d.dot) {
          ctx.fillStyle = '#d6f5ff';
          ctx.fillRect(x + 26, y + 18 + waveY, 2, 2);
        }
      } else if (ch === ',') {
        if (!tiles || !A.tile(ctx, 32, x, y, cell)) {
          ctx.fillStyle = (d.c + d.r) % 2 ? '#c2a267' : '#b99a61';
          ctx.fillRect(x, y, cell, cell);
        }
      } else {
        /* трава */
        if (!tiles || !A.tile(ctx, 37, x, y, cell)) {
          ctx.fillStyle = (d.c + d.r) % 2 ? pal.a : pal.b;
          ctx.fillRect(x, y, cell, cell);
        }

        if (A && A.has('dirt1') && d.patch) {
          A.draw(ctx, 'dirt1', x + 12 + (d.deco % 8), y + 14 + (d.deco % 6), 17, 14);
        }
        if (A && A.has('grass1') && d.tuft) {
          A.draw(ctx, 'grass' + (1 + d.deco % 3), x + 8 + (d.deco % 14), y + 16, 12, 14);
        } else if (d.dot) {
          ctx.fillStyle = pal.dot;
          ctx.fillRect(x + 8 + (d.flip ? 14 : 0), y + 9, 2, 2);
          ctx.fillRect(x + 22, y + 26, 2, 2);
        }
        if (A && A.has('flower1') && d.flower) {
          A.draw(ctx, 'flower' + (1 + d.deco % 3),
            x + 6 + (d.deco % 20), y + 8 + ((d.deco >> 3) % 18), 12, 12);
        }
      }
    }

    this.drawRoad(ctx, pal);

    /* деревья и кусты — поверх дороги, но только вне маршрута */
    for (i = 0; i < this.decor.length; i++) {
      d = this.decor[i];
      if (d.ch === '#' || d.ch === '~') continue;
      if (this.onPath(d.c, d.r)) continue;

      var tx = d.c * cell;
      var ty = d.r * cell;

      if (d.bush) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        if (A && A.has('shadow')) {
          A.draw(ctx, 'shadow', tx + 4, ty + 28, cell - 8, 10);
        }
        ctx.restore();
        if (A && A.has('tree1')) {
          if (d.deco % 4 === 0) {
            A.draw(ctx, 'tree2', tx + 3, ty + 4, 34, 30);
          } else {
            A.draw(ctx, 'tree1', tx - 7, ty - 20, 54, 63);
          }
        } else {
          TD.Sprites.draw(ctx, 'bush', tx + 3, ty + 3, cell - 6, cell - 6);
        }
      } else if (d.shrub) {
        if (A && A.has('bush1')) {
          A.draw(ctx, 'bush' + (1 + d.deco % 3), tx + 6, ty + 9, 30, 27);
        }
      } else if (d.prop) {
        if (A && A.has(d.propType)) {
          if (d.propType === 'box') {
            A.draw(ctx, 'box', tx + 10, ty + 12, 22, 21);
          } else {
            A.draw(ctx, 'log', tx + 6, ty + 18, 30, 19);
          }
        }
      }
    }

    /* палатки в уголках карты */
    if (A && A.has('tent')) {
      for (var ci = 0; ci < this.camps.length; ci++) {
        var camp = this.camps[ci];
        var cx = camp.c * cell;
        var cy = camp.r * cell;
        if (A.has('shadow')) {
          ctx.save();
          ctx.globalAlpha = 0.4;
          A.draw(ctx, 'shadow', cx + 4, cy + 30, cell - 8, 9);
          ctx.restore();
        }
        A.draw(ctx, ci % 2 ? 'tent2' : 'tent', cx - 8, cy - 4, 56, 36);
      }
    }

    this.drawLamps(ctx);

    /* портал */
    var sp = g.cellCenter(g.spawn.c, g.spawn.r);
    var pulse = 0.5 + Math.sin(t * 3) * 0.5;
    this.glow(ctx, sp.x, sp.y, 40 + pulse * 8, 'rgba(186,110,255,0.5)');
    TD.Sprites.draw(ctx, 'portal', sp.x - cell / 2, sp.y - cell / 2, cell, cell);

    /* сердце */
    var bp = g.cellCenter(g.base.c, g.base.r);
    var hpPulse = 0.5 + Math.sin(t * 4) * 0.5;
    this.glow(ctx, bp.x, bp.y, 36 + hpPulse * 8, this.lives <= 5 ? 'rgba(255,90,120,0.7)' : 'rgba(255,90,120,0.45)');
    TD.Sprites.draw(ctx, 'heart', bp.x - cell / 2, bp.y - cell / 2, cell, cell);
  };

  /** Фонари вдоль дороги — оживляют поле и используют набор объектов. */
  Game.prototype.drawLamps = function (ctx) {
    var A = TD.Assets;
    if (!A || !A.has('lamp')) return;
    var cell = this.grid.cell;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 3; i < this.pathCells.length; i += 7) {
      var p = this.pathCells[i];
      for (var d = 0; d < dirs.length; d++) {
        var nc = p.c + dirs[d][0];
        var nr = p.r + dirs[d][1];
        if (this.grid.at(nc, nr) !== '.') continue;
        if (this.onPath(nc, nr)) continue;
        var lx = nc * cell;
        var ly = nr * cell;
        this.glow(ctx, lx + cell / 2, ly + 14, 20, 'rgba(255,210,120,0.35)');
        if (A.has('shadow')) {
          ctx.save();
          ctx.globalAlpha = 0.4;
          A.draw(ctx, 'shadow', lx + 12, ly + 31, 18, 7);
          ctx.restore();
        }
        A.draw(ctx, 'lamp', lx + 9, ly + 5, 22, 36);
        break;
      }
    }
  };

  /** Дорога по текущему маршруту — в цветах земли из набора. */
  Game.prototype.drawRoad = function (ctx, pal) {
    var pts = this.pathPoints;
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.strokeStyle = 'rgba(88,52,32,0.4)';
    ctx.lineWidth = 38;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    ctx.strokeStyle = pal.roadEdge;
    ctx.lineWidth = 32;
    ctx.stroke();

    ctx.strokeStyle = pal.road;
    ctx.lineWidth = 25;
    ctx.stroke();

    /* камешки и выбоины на дороге */
    var cell = this.grid.cell;
    for (var k = 0; k < this.pathCells.length; k++) {
      var c = this.pathCells[k];
      var n = TD.noise2(c.c, c.r, 17);
      if (n < 0.42) continue;
      var px = c.c * cell + 8 + (n > 0.7 ? 18 : 4);
      var py = c.r * cell + 12 + (n > 0.55 ? 14 : 4);
      ctx.fillStyle = n > 0.75 ? pal.roadSpeck : 'rgba(150,90,50,0.6)';
      ctx.fillRect(px, py, 3, 2);
    }
    ctx.restore();
  };

  Game.prototype.glow = function (ctx, x, y, radius, color) {
    var grd = ctx.createRadialGradient(x, y, 2, x, y, radius);
    grd.addColorStop(0, color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };

  Game.prototype.drawGrid = function (ctx) {
    var cell = this.grid.cell;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.075)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var c = 0; c <= this.grid.cols; c++) {
      ctx.moveTo(c * cell + 0.5, 0);
      ctx.lineTo(c * cell + 0.5, this.grid.rows * cell);
    }
    for (var r = 0; r <= this.grid.rows; r++) {
      ctx.moveTo(0, r * cell + 0.5);
      ctx.lineTo(this.grid.cols * cell, r * cell + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  };

  Game.prototype.drawPath = function (ctx) {
    if (!this.pathPoints || this.pathPoints.length < 2) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(61,220,151,0.32)';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.pathPoints[0].x, this.pathPoints[0].y);
    for (var i = 1; i < this.pathPoints.length; i++) {
      ctx.lineTo(this.pathPoints[i].x, this.pathPoints[i].y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(61,220,151,0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 7]);
    ctx.stroke();
    ctx.setLineDash([]);

    /* прямой маршрут летающих */
    var air = this.grid.airPath();
    ctx.strokeStyle = 'rgba(179,136,255,0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 9]);
    ctx.beginPath();
    ctx.moveTo(air[0].x, air[0].y);
    ctx.lineTo(air[1].x, air[1].y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  };

  /** Площадки под башни: видны всегда, подсвечиваются при выборе башни. */
  Game.prototype.drawSpots = function (ctx) {
    var A = TD.Assets;
    var cell = this.grid.cell;
    var pad = cell + 6;

    for (var i = 0; i < this.spots.length; i++) {
      var s = this.spots[i];
      var center = this.grid.cellCenter(s.c, s.r);
      var occupied = !!this.towerAt(s.c, s.r);

      if (A && A.has('towerPlace1')) {
        A.draw(ctx, i % 2 ? 'towerPlace2' : 'towerPlace1',
          center.x - pad / 2, center.y - pad / 2 + 2, pad, pad);
      } else if (!occupied) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(center.x, center.y, 15, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (occupied) continue;

      var hovered = this.hover.c === s.c && this.hover.r === s.r;
      if (this.buildType || hovered) {
        ctx.save();
        ctx.globalAlpha = 0.55 + 0.35 * Math.sin(this.time * 4 + i);
        ctx.strokeStyle = this.buildType ? (hovered && this.hover.ok ? '#c9ffcb' : '#9af09f') : '#fff2c2';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(center.x, center.y, 17, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  Game.prototype.drawTowers = function (ctx) {
    var cell = this.grid.cell;
    var drawSize = cell + 6;
    for (var i = 0; i < this.towers.length; i++) {
      var t = this.towers[i];
      var bounce = t.recoil * 2;

      TD.Sprites.draw(ctx, t.def.sprite, t.x - drawSize / 2, t.y - drawSize / 2 - bounce, drawSize, drawSize);

      /* уровень: золотые пипсы */
      for (var lv = 0; lv < t.level; lv++) {
        ctx.fillStyle = '#3a2a10';
        ctx.fillRect(t.x - 9 + lv * 7, t.y + 18, 5, 4);
        ctx.fillStyle = '#ffc857';
        ctx.fillRect(t.x - 8 + lv * 7, t.y + 19, 3, 2);
      }
    }

    if (this.selected) this.drawRange(ctx, this.selected.x, this.selected.y, this.selected.stats.range * cell, this.selected.def.color);
  };

  Game.prototype.drawRange = function (ctx, x, y, radius, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(61,220,151,0.06)';
    ctx.fill();
    ctx.strokeStyle = color || '#3ddc97';
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.restore();
  };

  Game.prototype.drawEnemies = function (ctx) {
    var cell = this.grid.cell;
    var list = this.enemies.slice().sort(function (a, b) { return a.y - b.y; });
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var size = e.boss ? 60 : 40;
      var bob = e.flying ? Math.sin(this.time * 6 + e.phase) * 3 : 0;
      var y = e.y - size / 2 + bob;

      ctx.save();
      ctx.globalAlpha = e.flying ? 0.16 : 0.24;
      ctx.fillStyle = '#17331f';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + 14, size * 0.36, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      /* цветное кольцо под врагом — подсказывает тип */
      ctx.save();
      ctx.globalAlpha = e.flying ? 0.4 : 0.55;
      ctx.fillStyle = e.def.color;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + 14, size * 0.31, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (e.hitFlash > 0) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(e.x, e.y, size * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      TD.Sprites.draw(ctx, e.def.sprite, e.x - size / 2, y, size, size);

      if (e.slowUntil > this.time) {
        ctx.save();
        ctx.strokeStyle = 'rgba(155,235,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y + 8, size * 0.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (e.boss) {
        ctx.fillStyle = '#ffc857';
        ctx.fillRect(e.x - 20, y - 8, 40, 3);
      }

      if (e.hp < e.maxHp || e.boss) {
        var w = e.boss ? 48 : 30;
        var ratio = TD.clamp(e.hp / e.maxHp, 0, 1);
        var by = y - (e.boss ? 14 : 9);
        ctx.fillStyle = 'rgba(14,26,38,0.9)';
        ctx.fillRect(e.x - w / 2 - 1, by - 1, w + 2, 6);
        ctx.fillStyle = ratio > 0.5 ? '#6ee06f' : (ratio > 0.25 ? '#ffc857' : '#ff5f7a');
        ctx.fillRect(e.x - w / 2, by, w * ratio, 4);
      }
    }
  };

  Game.prototype.drawProjectiles = function (ctx) {
    for (var i = 0; i < this.projectiles.length; i++) {
      var p = this.projectiles[i];
      for (var k = 0; k < p.trail.length; k++) {
        ctx.globalAlpha = 0.12 * (k + 1);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.trail[k].x - 1, p.trail[k].y - 1, 3, 3);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
  };

  Game.prototype.drawEffects = function (ctx) {
    for (var i = 0; i < this.effects.length; i++) {
      var ef = this.effects[i];
      var k = TD.clamp(ef.t / ef.dur, 0, 1);
      if (ef.type === 'beam') {
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = ef.color;
        ctx.lineWidth = ef.width || 2;
        ctx.shadowColor = ef.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        if (ef.kind === 'tesla') {
          var segs = 7;
          ctx.moveTo(ef.x1, ef.y1);
          for (var s = 1; s < segs; s++) {
            var tt = s / segs;
            var jx = (Math.random() * 2 - 1) * 7;
            var jy = (Math.random() * 2 - 1) * 7;
            ctx.lineTo(ef.x1 + (ef.x2 - ef.x1) * tt + jx, ef.y1 + (ef.y2 - ef.y1) * tt + jy);
          }
          ctx.lineTo(ef.x2, ef.y2);
        } else {
          ctx.moveTo(ef.x1, ef.y1);
          ctx.lineTo(ef.x2, ef.y2);
        }
        ctx.stroke();
        ctx.restore();
      } else if (ef.type === 'boom') {
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.7;
        ctx.strokeStyle = ef.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ef.x, ef.y, Math.max(2, ef.radius * k), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = (1 - k) * 0.2;
        ctx.fillStyle = ef.color;
        ctx.fill();
        ctx.restore();
      } else if (ef.type === 'hit') {
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = ef.color;
        for (var a = 0; a < 4; a++) {
          var ang = a * Math.PI / 2 + 0.4;
          ctx.fillRect(ef.x + Math.cos(ang) * (4 + k * 8) - 1.5, ef.y + Math.sin(ang) * (4 + k * 8) - 1.5, 3, 3);
        }
        ctx.restore();
      }
    }
  };

  Game.prototype.drawParticles = function (ctx) {
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      ctx.globalAlpha = TD.clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  };

  Game.prototype.drawFloats = function (ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px Consolas, monospace';
    for (var i = 0; i < this.floats.length; i++) {
      var f = this.floats[i];
      ctx.globalAlpha = TD.clamp(f.life / f.maxLife, 0, 1);
      ctx.fillStyle = '#10202f';
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  };

  /* ================= подсказки при наведении ================= */

  Game.prototype.pointerEnemy = function () {
    if (!this.pointer.active) return null;
    var best = null;
    var bestD = Infinity;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dead) continue;
      var size = e.boss ? 60 : 40;
      var d = TD.dist(this.pointer.x, this.pointer.y, e.x, e.y);
      if (d <= size * 0.55 + 3 && d < bestD) {
        best = e;
        bestD = d;
      }
    }
    return best;
  };

  Game.prototype.pointerTower = function () {
    if (!this.pointer.active) return null;
    for (var i = 0; i < this.towers.length; i++) {
      var t = this.towers[i];
      if (TD.dist(this.pointer.x, this.pointer.y, t.x, t.y) < 22) return t;
    }
    return null;
  };

  Game.prototype.drawTooltips = function (ctx) {
    if (!this.pointer.active) return;
    var e = this.pointerEnemy();
    if (e) {
      var lines = [e.def.name];
      lines.push('HP ' + Math.ceil(e.hp) + ' / ' + Math.ceil(e.maxHp));
      var tags = [];
      if (e.def.armor) tags.push('броня ' + e.def.armor);
      if (e.flying) tags.push('летает');
      if (e.boss) tags.push('босс');
      if (tags.length) lines.push(tags.join(' · '));
      this.drawTooltip(ctx, e.x, e.y - (e.boss ? 34 : 24), lines, e.def.color);
      return;
    }
    var t = this.pointerTower();
    if (t) {
      this.drawTooltip(ctx, t.x, t.y - 24, [
        t.def.name + ' · ур. ' + t.level,
        'урон ' + Math.round(t.stats.damage) + ' · радиус ' + t.stats.range.toFixed(1) + ' кл.'
      ], t.def.color);
      return;
    }
    var cell = this.grid.pixelToCell(this.pointer.x, this.pointer.y);
    if (this.isSpot(cell.c, cell.r) && !this.towerAt(cell.c, cell.r)) {
      var center = this.grid.cellCenter(cell.c, cell.r);
      this.drawTooltip(ctx, center.x, center.y - 18, [
        'Площадка под башню',
        this.buildType ? 'Кликните, чтобы построить' : 'Выберите башню в магазине'
      ], '#ffc857');
    }
  };

  Game.prototype.drawTooltip = function (ctx, ax, ay, lines, accent) {
    ctx.save();
    ctx.font = 'bold 12px Consolas, "Courier New", monospace';
    var i;
    var tw = 0;
    for (i = 0; i < lines.length; i++) {
      tw = Math.max(tw, ctx.measureText(lines[i]).width);
    }
    var w = Math.min(C.width - 16, Math.max(104, tw + 22));
    var lineH = 15;
    var h = lines.length * lineH + 10;
    var x = TD.clamp(ax - w / 2, 6, C.width - w - 6);
    var y = ay - h - 6;
    if (y < 6) y = ay + 16;

    ctx.fillStyle = 'rgba(16,32,48,0.96)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = accent || '#ffc857';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (i = 0; i < lines.length; i++) {
      ctx.fillStyle = i === 0 ? '#ffffff' : (i === 1 ? '#dceaff' : '#a9c0da');
      ctx.fillText(lines[i], x + 10, y + 5 + lineH * (i + 0.5));
    }
    ctx.restore();
  };

  Game.prototype.drawPurchase = function (ctx) {
    var hc = this.hover.c;
    var hr = this.hover.r;
    if (hc < 0 || hr < 0) return;
    var cell = this.grid.cell;
    var x = hc * cell;
    var y = hr * cell;
    var center = this.grid.cellCenter(hc, hr);

    if (this.buildType) {
      var def = TD.TowerById[this.buildType];
      var ok = this.hover.ok;
      ctx.save();
      ctx.fillStyle = ok ? 'rgba(61,220,151,0.18)' : 'rgba(239,71,111,0.22)';
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = ok ? '#3ddc97' : '#ef476f';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
      if (ok) {
        ctx.globalAlpha = 0.7;
        TD.Sprites.draw(ctx, def.sprite, x, y, cell, cell);
        ctx.globalAlpha = 1;
        this.drawRange(ctx, center.x, center.y, def.range * (1 + C.upgradeRange * 0) * cell, def.color);
      } else {
        ctx.strokeStyle = 'rgba(239,71,111,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 10);
        ctx.lineTo(x + cell - 10, y + cell - 10);
        ctx.moveTo(x + cell - 10, y + 10);
        ctx.lineTo(x + 10, y + cell - 10);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      ctx.save();
      ctx.strokeStyle = 'rgba(219,228,240,0.22)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
      ctx.restore();
    }
  };

  TD.Game = Game;
})(typeof globalThis !== 'undefined' ? globalThis : this);
