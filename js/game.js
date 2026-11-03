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

  var GRASS = {
    pass: { a: '#1a2c21', b: '#16261c', dot: '#24402c', edge: '#0f1b14' },
    canyon: { a: '#2a241d', b: '#241f19', dot: '#3a2f23', edge: '#181410' },
    swamp: { a: '#192a27', b: '#152421', dot: '#21403a', edge: '#0e1b19' }
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

    this.pathPoints = this.grid.cellsToPoints(this.grid.getPath());
    this.decor = this.buildDecor();
  }

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
        out.push({
          c: c, r: r, ch: ch,
          dot: n > 0.55,
          bush: (ch === '.' || ch === ',') && n > 0.978,
          flip: n > 0.5
        });
      }
    }
    return out;
  };

  Game.prototype.refreshPath = function () {
    var cells = this.grid.getPath();
    this.pathPoints = this.grid.cellsToPoints(cells);
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
      if (!this.grid.buildable(c, r)) {
        this.hover.reason = 'Здесь строить нельзя';
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
    if (!this.grid.buildable(c, r)) return { ok: false, reason: 'Здесь строить нельзя' };
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
    this.drawTowers(ctx);
    this.drawEnemies(ctx);
    this.drawProjectiles(ctx);
    this.drawEffects(ctx);
    this.drawParticles(ctx);
    this.drawPurchase(ctx);
    this.drawFloats(ctx);

    ctx.restore();
  };

  Game.prototype.drawTerrain = function (ctx) {
    var g = this.grid;
    var cell = g.cell;
    var pal = GRASS[this.map.id] || GRASS.pass;
    var t = this.time;
    var i, d;

    for (i = 0; i < this.decor.length; i++) {
      d = this.decor[i];
      var x = d.c * cell;
      var y = d.r * cell;
      var ch = d.ch;
      if (ch === '#') {
        ctx.fillStyle = pal.edge;
        ctx.fillRect(x, y, cell, cell);
        TD.Sprites.draw(ctx, 'rock', x, y, cell, cell);
      } else if (ch === '~') {
        ctx.fillStyle = '#0e2b3a';
        ctx.fillRect(x, y, cell, cell);
        var waveY = Math.sin(t * 1.6 + d.c * 0.7 + d.r * 0.35) * 5;
        ctx.fillStyle = '#16465b';
        ctx.fillRect(x + 3, y + 12 + waveY, cell - 8, 3);
        ctx.fillStyle = '#1e5b74';
        ctx.fillRect(x + 12, y + 26 - waveY, cell - 18, 2);
        if (d.dot) {
          ctx.fillStyle = '#2a7590';
          ctx.fillRect(x + 6 + (d.flip ? 8 : 0), y + 6, 2, 2);
        }
      } else if (ch === ',') {
        ctx.fillStyle = (d.c + d.r) % 2 ? '#2b241b' : '#262017';
        ctx.fillRect(x, y, cell, cell);
        if (d.dot) {
          ctx.fillStyle = '#3a3024';
          ctx.fillRect(x + 10 + (d.flip ? 12 : 0), y + 14, 3, 2);
        }
      } else {
        ctx.fillStyle = (d.c + d.r) % 2 ? pal.a : pal.b;
        ctx.fillRect(x, y, cell, cell);
        if (d.dot) {
          ctx.fillStyle = pal.dot;
          ctx.fillRect(x + 8 + (d.flip ? 14 : 0), y + 9, 2, 2);
          ctx.fillRect(x + 22, y + 24, 2, 2);
        }
        if (d.bush) {
          ctx.save();
          ctx.globalAlpha = 0.55;
          TD.Sprites.draw(ctx, 'bush', x + 12, y + 12, cell - 24, cell - 24);
          ctx.restore();
        }
      }
    }

    /* портал */
    var sp = g.cellCenter(g.spawn.c, g.spawn.r);
    var pulse = 0.5 + Math.sin(t * 3) * 0.5;
    this.glow(ctx, sp.x, sp.y, 34 + pulse * 8, 'rgba(157,78,221,0.35)');
    TD.Sprites.draw(ctx, 'portal', sp.x - cell / 2, sp.y - cell / 2, cell, cell);

    /* сердце */
    var bp = g.cellCenter(g.base.c, g.base.r);
    var hpPulse = 0.5 + Math.sin(t * 4) * 0.5;
    this.glow(ctx, bp.x, bp.y, 30 + hpPulse * 8, this.lives <= 5 ? 'rgba(239,71,111,0.5)' : 'rgba(239,71,111,0.28)');
    TD.Sprites.draw(ctx, 'heart', bp.x - cell / 2, bp.y - cell / 2, cell, cell);
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
    ctx.strokeStyle = 'rgba(219,228,240,0.05)';
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

  Game.prototype.drawTowers = function (ctx) {
    var cell = this.grid.cell;
    for (var i = 0; i < this.towers.length; i++) {
      var t = this.towers[i];
      var bounce = t.recoil * 2;

      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(t.x, t.y + 15, 15, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      TD.Sprites.draw(ctx, t.def.sprite, t.x - cell / 2, t.y - cell / 2 - bounce, cell, cell);

      /* уровень: золотые пипсы */
      for (var lv = 0; lv < t.level; lv++) {
        ctx.fillStyle = '#f2c14e';
        ctx.fillRect(t.x - 8 + lv * 7, t.y + 15, 4, 3);
        ctx.fillStyle = '#0b0e14';
        ctx.fillRect(t.x - 8 + lv * 7, t.y + 18, 4, 1);
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
      var size = e.boss ? 54 : 34;
      var bob = e.flying ? Math.sin(this.time * 6 + e.phase) * 3 : 0;
      var y = e.y - size / 2 + bob;

      ctx.save();
      ctx.globalAlpha = e.flying ? 0.18 : 0.3;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + 13, size * 0.36, 5, 0, 0, Math.PI * 2);
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
        ctx.strokeStyle = 'rgba(76,201,240,0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y + 8, size * 0.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (e.boss) {
        ctx.fillStyle = '#f2c14e';
        ctx.fillRect(e.x - 20, y - 8, 40, 3);
      }

      if (e.hp < e.maxHp || e.boss) {
        var w = e.boss ? 46 : 28;
        var ratio = TD.clamp(e.hp / e.maxHp, 0, 1);
        var by = y - (e.boss ? 14 : 9);
        ctx.fillStyle = 'rgba(11,14,20,0.85)';
        ctx.fillRect(e.x - w / 2 - 1, by - 1, w + 2, 6);
        ctx.fillStyle = ratio > 0.5 ? '#3ddc97' : (ratio > 0.25 ? '#f2c14e' : '#ef476f');
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
      ctx.fillStyle = '#0b0e14';
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
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
