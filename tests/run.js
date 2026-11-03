/* Пиксельная Оборона — тесты логики (Node, без браузера).
   Запуск: node tests/run.js */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

const FILES = [
  'js/core/util.js',
  'js/core/sprites.js',
  'js/core/assets.js',
  'js/core/audio.js',
  'js/data/maps.js',
  'js/data/defs.js',
  'js/data/waves.js',
  'js/logic/grid.js',
  'js/game.js',
  'js/ui.js'
];

const sandbox = { console: console };
vm.createContext(sandbox);
for (const file of FILES) {
  const full = path.join(ROOT, file);
  vm.runInContext(fs.readFileSync(full, 'utf8'), sandbox, { filename: file });
}
const TD = sandbox.TD;

/* ---------- мини-фреймворк ---------- */

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ok  ' + name);
  } catch (err) {
    failures.push({ name, err });
    console.log('FAIL  ' + name);
    console.log('      ' + (err && err.message ? err.message : err));
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message || 'assert failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'значения не равны') + ': получено ' + actual + ', ожидалось ' + expected);
  }
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error((message || 'объекты не равны') + '\n' + a + '\n' + b);
}

function assertClose(actual, expected, eps, message) {
  if (Math.abs(actual - expected) > (eps || 1e-6)) {
    throw new Error((message || 'числа не равны') + ': ' + actual + ' ≠ ' + expected);
  }
}

/* ---------- утилиты ---------- */

test('util: clamp/lerp/dist/fmt', () => {
  assertEqual(TD.clamp(5, 0, 3), 3);
  assertEqual(TD.clamp(-1, 0, 3), 0);
  assertEqual(TD.lerp(0, 10, 0.5), 5);
  assertEqual(TD.dist(0, 0, 3, 4), 5);
  assertEqual(TD.fmtInt(1234567), '1 234 567');
  assertEqual(TD.fmtTime(65), '01:05');
});

test('util: rng детерминирован и в [0,1)', () => {
  const a = TD.rng(12345);
  const b = TD.rng(12345);
  for (let i = 0; i < 50; i++) {
    const va = a();
    const vb = b();
    assertEqual(va, vb, 'последовательности различаются на шаге ' + i);
    assert(va >= 0 && va < 1, 'значение вне [0,1): ' + va);
  }
  assert(TD.hash('abc') === TD.hash('abc'), 'hash нестабилен');
  assert(TD.hash('abc') !== TD.hash('abd'), 'hash совпал для разных строк');
});

/* ---------- спрайты ---------- */

test('sprites: все описания 16×16 и с полной палитрой', () => {
  const issues = TD.Sprites.validate();
  assertEqual(issues.length, 0, 'битые спрайты:\n' + issues.join('\n'));
  const names = Object.keys(TD.Sprites.defs);
  assert(names.length >= 16, 'ожидалось минимум 16 спрайтов, есть ' + names.length);
});

test('assets: набор free-fields на месте, PNG читаются', () => {
  const base = path.join(ROOT, 'free-fields-tileset-pixel-art-for-tower-defense');
  const files = TD.Assets.FILES;
  const names = Object.keys(files);
  assert(names.length >= 20, 'слишком мало ассетов: ' + names.length);
  names.forEach((name) => {
    const p = path.join(base, files[name]);
    assert(fs.existsSync(p), 'нет файла ' + files[name]);
    const buf = fs.readFileSync(p);
    assertEqual(buf.slice(1, 4).toString('latin1'), 'PNG', name + ': не PNG');
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    assert(w > 0 && h > 0, name + ': пустое изображение');
  });
  const tileset = path.join(base, TD.Assets.FILES.fields);
  const tbuf = fs.readFileSync(tileset);
  assertEqual(tbuf.readUInt32BE(16), 256, 'тайлсет: ширина');
  assertEqual(tbuf.readUInt32BE(20), 256, 'тайлсет: высота');
});

/* ---------- карты и путь ---------- */

test('maps: 3 карты 24×15 с порталом и сердцем', () => {
  assertEqual(TD.Maps.length, 3);
  const seen = {};
  TD.Maps.forEach((map, index) => {
    assertEqual(map.ascii.length, TD.Config.rows, map.name + ': строк');
    map.ascii.forEach((row, r) => {
      assertEqual(row.length, TD.Config.cols, map.name + ', строка ' + r);
    });
    const flat = map.ascii.join('');
    assertEqual(flat.split('S').length - 1, 1, map.name + ': должен быть один S');
    assertEqual(flat.split('B').length - 1, 1, map.name + ': должен быть один B');
    seen[map.id] = true;
    assert(map.name && map.desc, 'у карты нет имени/описания');
  });
  assertEqual(Object.keys(seen).length, 3);
});

test('grid: A* находит путь на всех картах, шаги по 4 направлениям', () => {
  TD.Maps.forEach((map) => {
    const grid = new TD.Grid(map);
    const start = grid.spawn;
    const end = grid.base;
    const p = grid.findPath(start, end);
    assert(p && p.length >= 2, map.name + ': путь не найден');
    assertDeepEqual(p[0], start, map.name + ': путь не от портала');
    assertDeepEqual(p[p.length - 1], end, map.name + ': путь не к сердцу');
    for (let i = 1; i < p.length; i++) {
      const d = Math.abs(p[i].c - p[i - 1].c) + Math.abs(p[i].r - p[i - 1].r);
      assertEqual(d, 1, map.name + ': разрыв в пути на шаге ' + i);
    }
    assert(grid.pathExists(), map.name + ': pathExists false');
  });
});

test('grid: башня, перекрывающая единственный проход, запрещена', () => {
  const map = {
    name: 'test',
    ascii: [
      'S.B',
      '#.#',
      '...'
    ]
  };
  const grid = new TD.Grid(map);
  assert(grid.pathExists(), 'исходный путь должен быть');
  assert(grid.buildable(1, 0), 'клетка (1,0) должна быть доступна для строительства');
  assertEqual(grid.canPlace(1, 0), false, 'перекрытие прохода не запрещено');
  assertEqual(grid.canPlace(1, 1), true, 'свободная клетка не разрешена');
});

test('grid: застройка карты не может полностью перекрыть путь', () => {
  TD.Maps.forEach((map) => {
    const grid = new TD.Grid(map);
    let placed = 0;
    let rejected = 0;
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        if (!grid.buildable(c, r)) continue;
        if (grid.canPlace(c, r)) {
          grid.place(c, r, {});
          placed += 1;
        } else {
          rejected += 1;
        }
      }
    }
    assert(placed > 20, map.name + ': слишком мало места для строительства');
    assert(rejected > 0, map.name + ': ни одна клетка не отклонена — проверка пути не работает');
    assert(grid.pathExists(), map.name + ': после застройки путь пропал');
  });
});

test('grid: удаление башни возвращает проходимость', () => {
  const grid = new TD.Grid(TD.Maps[0]);
  const p = grid.getPath();
  let cell = null;
  for (let i = 1; i < p.length - 1; i++) {
    if (grid.buildable(p[i].c, p[i].r) && grid.canPlace(p[i].c, p[i].r)) {
      cell = p[i];
      break;
    }
  }
  assert(cell, 'не нашли клетку на пути');
  grid.place(cell.c, cell.r, {});
  assert(!grid.walkable(cell.c, cell.r), 'башня не заняла клетку');
  grid.remove(cell.c, cell.r);
  assert(grid.walkable(cell.c, cell.r), 'клетка не освободилась');
  assert(grid.pathExists(), 'путь не восстановился');
});

/* ---------- урон и баланс ---------- */

test('damage: броня вычитается, но урон не ниже 1', () => {
  assertEqual(TD.computeDamage(22, 2, false), 20);
  assertEqual(TD.computeDamage(3, 6, false), 1);
  assertEqual(TD.computeDamage(90, 6, true), 90);
  assertEqual(TD.computeDamage(8, 0, false), 8);
});

test('balance: масштабирование HP растёт с волной и уровнем', () => {
  const s1 = TD.enemyHpScale(1, 0);
  const s10 = TD.enemyHpScale(10, 0);
  const s10l3 = TD.enemyHpScale(10, 2);
  assertClose(s1, 1, 1e-9);
  assert(s10 > s1, 'HP не растёт с волной');
  assert(s10l3 > s10, 'HP не растёт с уровнем');
});

test('towers: цены, улучшения и продажа считаются', () => {
  assertEqual(TD.TowerDefs.length, 5);
  TD.TowerDefs.forEach((def) => {
    assert(def.price > 0, def.name + ': цена');
    assert(def.damage > 0 && def.range > 0 && def.rate > 0, def.name + ': характеристики');
    const l1 = TD.towerStats(def, 1);
    const l3 = TD.towerStats(def, 3);
    assert(l3.damage > l1.damage, def.name + ': урон не растёт');
    assert(l3.range > l1.range, def.name + ': радиус не растёт');
    assertEqual(TD.towerSellValue(100), 60);
    assert(TD.towerUpgradeCost(def, 3) === null, def.name + ': нет максимального уровня');
  });
});

test('enemies: все типы описаны и имеют спрайты', () => {
  const types = ['slime', 'runner', 'swarm', 'brute', 'shield', 'flyer', 'boss'];
  types.forEach((id) => {
    const def = TD.EnemyDefs[id];
    assert(def, 'нет врага ' + id);
    assert(def.hp > 0 && def.speed > 0, id + ': характеристики');
    assert(TD.Sprites.defs[def.sprite], id + ': нет спрайта ' + def.sprite);
  });
  assert(TD.EnemyDefs.flyer.flying === true, 'летун должен игнорировать лабиринт');
  assert(TD.EnemyDefs.boss.boss === true, 'босс не помечен');
});

/* ---------- волны ---------- */

test('waves: 20 волн генерируются для каждого уровня', () => {
  for (let level = 0; level < TD.Maps.length; level++) {
    const waves = TD.buildWaves(level, TD.Config.waveCount);
    assertEqual(waves.length, 20, 'уровень ' + level + ': число волн');
    waves.forEach((w, i) => {
      assertEqual(w.number, i + 1);
      assert(w.spawns.length > 0, 'волна ' + (i + 1) + ': нет врагов');
      assert(w.spawns.length <= 140, 'волна ' + (i + 1) + ': слишком много врагов');
      assert(w.duration <= 150, 'волна ' + (i + 1) + ': слишком долго');
      assert(w.reward === TD.Config.waveRewardBase + TD.Config.waveRewardPerWave * (i + 1),
        'волна ' + (i + 1) + ': награда');
      for (let s = 0; s < w.spawns.length; s++) {
        const sp = w.spawns[s];
        assert(TD.EnemyDefs[sp.type], 'волна ' + (i + 1) + ': неизвестный тип ' + sp.type);
        assert(sp.t >= 0, 'волна ' + (i + 1) + ': отрицательное время');
        if (s > 0) assert(sp.t >= w.spawns[s - 1].t, 'волна ' + (i + 1) + ': спавн не отсортирован');
      }
    });
  }
});

test('waves: состав детерминирован', () => {
  for (let level = 0; level < TD.Maps.length; level++) {
    const a = JSON.stringify(TD.buildWaves(level));
    const b = JSON.stringify(TD.buildWaves(level));
    assertEqual(a, b, 'уровень ' + level + ': волны не детерминированы');
  }
});

test('waves: боссы только на 10-й и 20-й волнах', () => {
  const waves = TD.buildWaves(0);
  const bossWaves = waves.filter((w) => w.boss).map((w) => w.number);
  assertDeepEqual(bossWaves, [10, 20], 'босс-волны');
  const tenth = waves[9].spawns.filter((s) => s.type === 'boss');
  const twentieth = waves[19].spawns.filter((s) => s.type === 'boss');
  assertEqual(tenth.length, 1, 'на 10-й волне один босс');
  assertEqual(twentieth.length, 1, 'на 20-й волне один босс');
});

/* ---------- игра ---------- */

function findSpot(game, predicate) {
  for (let i = 0; i < game.spots.length; i++) {
    const s = game.spots[i];
    if (game.towerAt(s.c, s.r)) continue;
    if (predicate && !predicate(s.c, s.r)) continue;
    return { c: s.c, r: s.r };
  }
  return null;
}

function findNonSpotGrass(game) {
  for (let r = 0; r < game.grid.rows; r++) {
    for (let c = 0; c < game.grid.cols; c++) {
      if (game.grid.buildable(c, r) && !game.isSpot(c, r)) return { c, r };
    }
  }
  return null;
}

test('game: площадки под башни заданы и безопасны для маршрута', () => {
  TD.Maps.forEach((map, level) => {
    const g = new TD.Game(level);
    assertEqual(g.spots.length, TD.Config.buildSpots, map.name + ': число площадок');
    assert(g.spots.length >= 12, map.name + ': слишком мало площадок: ' + g.spots.length);
    const seen = {};
    g.spots.forEach((s) => {
      const key = s.c + ',' + s.r;
      assert(!seen[key], map.name + ': площадка повторяется ' + key);
      seen[key] = true;
      assert(g.grid.buildable(s.c, s.r), map.name + ': площадка на занятой клетке ' + key);
      assert(!g.onPath(s.c, s.r), map.name + ': площадка стоит на дороге ' + key);
      assert(!g.towerAt(s.c, s.r), map.name + ': площадка занята башней');
    });
    assert(g.grid.pathExists(), map.name + ': пропал путь');
  });
});

test('game: стартовые ресурсы', () => {
  const g = new TD.Game(0);
  assertEqual(g.gold, TD.Config.startGold);
  assertEqual(g.lives, TD.Config.startLives);
  assertEqual(g.wave, 0);
  assertEqual(g.state, 'idle');
  assertEqual(g.waves.length, 20);
  assert(g.canStartWave(), 'первая волна должна быть доступна');
});

test('game: постройка, улучшение и продажа башни', () => {
  const g = new TD.Game(0);
  const spot = findSpot(g);
  assert(spot, 'нет свободной площадки');
  const res = g.placeTower(spot.c, spot.r, 'arrow');
  assert(res.ok, 'башню не построили: ' + res.reason);
  assertEqual(g.gold, TD.Config.startGold - TD.TowerById.arrow.price);
  assertEqual(g.towers.length, 1);
  assertEqual(g.selected, res.tower);

  const goldAfterBuild = g.gold;
  const up = g.upgradeTower(res.tower);
  assert(up.ok, 'улучшение не сработало: ' + up.reason);
  assertEqual(res.tower.level, 2);
  assert(g.gold < goldAfterBuild, 'золото не списалось за улучшение');

  const goldBefore = g.gold;
  const sell = g.sellTower(res.tower);
  assert(sell.ok, 'продажа не сработала');
  assertEqual(g.towers.length, 0);
  assert(g.gold > goldBefore, 'золото не вернулось');
  assertEqual(sell.refund, Math.floor(res.tower.invested * 0.6));
  assert(g.grid.walkable(spot.c, spot.r), 'клетка не освободилась');
  assert(g.isSpot(spot.c, spot.r), 'площадка пропала после продажи');
});

test('game: строить можно только на площадках, золото не уходит в минус', () => {
  const g = new TD.Game(0);
  const nonSpot = findNonSpotGrass(g);
  assert(nonSpot, 'не нашли траву вне площадок');
  const bad = g.placeTower(nonSpot.c, nonSpot.r, 'arrow');
  assertEqual(bad.ok, false, 'построили башню вне площадки');
  assertEqual(bad.reason, 'Только на площадке');
  assertEqual(g.gold, TD.Config.startGold, 'золото списалось за неудачную постройку');

  g.gold = 0;
  const spot = findSpot(g);
  const poor = g.placeTower(spot.c, spot.r, 'sniper');
  assertEqual(poor.ok, false);
  assertEqual(g.gold, 0, 'золото ушло в минус');

  g.gold = 100000;
  let placed = 0;
  g.spots.forEach((s) => {
    if (g.placeTower(s.c, s.r, 'arrow').ok) placed += 1;
  });
  assertEqual(placed, g.spots.length, 'не на всех площадках можно построить');
  assertEqual(g.towers.length, g.spots.length, 'число башен не совпало с площадками');
  const extra = g.placeTower(nonSpot.c, nonSpot.r, 'arrow');
  assertEqual(extra.ok, false, 'построили сверх лимита площадок');
  assert(g.gold >= 0, 'золото отрицательное');
  assert(g.grid.pathExists(), 'застройка перекрыла путь');
});

test('game: нельзя построить на скале и на занятой площадке', () => {
  const g = new TD.Game(0);
  let rock = null;
  for (let r = 0; r < g.grid.rows && !rock; r++) {
    for (let c = 0; c < g.grid.cols; c++) {
      if (g.grid.at(c, r) === '#') { rock = { c, r }; break; }
    }
  }
  const spot = findSpot(g);
  assert(rock && spot);
  assertEqual(g.placeTower(rock.c, rock.r, 'arrow').ok, false);
  assert(g.placeTower(spot.c, spot.r, 'arrow').ok);
  g.gold = 1000;
  assertEqual(g.placeTower(spot.c, spot.r, 'arrow').ok, false, 'построили поверх башни');
});

test('game: дорога не меняется после постановки и продажи башен', () => {
  const g = new TD.Game(0);
  const before = JSON.stringify(g.pathPoints);
  const first = findSpot(g);
  assert(first, 'нет площадки');
  assert(g.placeTower(first.c, first.r, 'arrow').ok);
  assertEqual(JSON.stringify(g.pathPoints), before, 'дорога изменилась после постройки');
  const enemy = g.spawnEnemy('slime');
  const route = JSON.stringify(g.pathPoints);
  assertEqual(JSON.stringify(enemy.path), route, 'враг пошёл не по зафиксированной дороге');
  g.sellTower(g.towers[0]);
  assertEqual(JSON.stringify(g.pathPoints), before, 'дорога изменилась после продажи');
});

test('game: маршрут врагов корректен при башнях на площадках', () => {
  const g = new TD.Game(0);
  const enemy = g.spawnEnemy('slime');
  assert(enemy && enemy.path.length >= 2, 'враг без маршрута');
  const spot = findSpot(g);
  assert(spot, 'нет площадки');
  const res = g.placeTower(spot.c, spot.r, 'arrow');
  assert(res.ok, res.reason);
  assert(enemy.path.length >= 2, 'маршрут врага сломан');
  const base = g.grid.cellCenter(g.grid.base.c, g.grid.base.r);
  const last = enemy.path[enemy.path.length - 1];
  assertEqual(last.x, base.x, 'маршрут не ведёт к сердцу (x)');
  assertEqual(last.y, base.y, 'маршрут не ведёт к сердцу (y)');
});

test('game: волна запускается, враги доходят до сердца, жизни падают', () => {
  const g = new TD.Game(0);
  assert(g.startWave(), 'волна не запустилась');
  assertEqual(g.wave, 1);
  assertEqual(g.state, 'wave');
  for (let i = 0; i < 3000 && !g.finished; i++) {
    g.step(1 / 30);
  }
  assert(g.elapsed > 0, 'время не идёт');
  assert(g.kills + g.leaks > 0, 'враги никак не взаимодействуют');
  assert(g.lives < TD.Config.startLives || g.finished, 'жизни не уменьшились');
  assert(g.gold >= 0, 'золото отрицательное');
});

test('game: досрочный запуск второй волны даёт бонус', () => {
  const g = new TD.Game(0);
  g.startWave();
  g.enemies = [];
  g.spawnIndex = g.spawns.length;
  g.checkWaveDone();
  assertEqual(g.state, 'idle', 'волна не завершилась');
  assertEqual(g.wave, 1);
  const goldBefore = g.gold;
  g.startWave();
  assertEqual(g.wave, 2);
  assert(g.gold > goldBefore, 'бонус за досрочный запуск не начислен');
});

test('game: поражение при нуле жизней', () => {
  const g = new TD.Game(0);
  const e = g.spawnEnemy('slime');
  g.lives = 1;
  g.leakEnemy(e);
  assertEqual(g.lives, 0);
  assert(g.finished, 'игра не завершилась');
  assertEqual(g.result, 'lose');
  assertEqual(g.summary().win, false);
});

test('game: победа после двадцатой волны', () => {
  const g = new TD.Game(0);
  let endEvent = null;
  g.onEvent = (type, data) => { if (type === 'end') endEvent = data; };
  g.wave = 20;
  g.state = 'wave';
  g.spawns = [];
  g.spawnIndex = 0;
  g.enemies = [];
  g.checkWaveDone();
  assert(g.finished, 'победа не сработала');
  assertEqual(g.result, 'win');
  assert(endEvent && endEvent.win === true, 'событие победы не отправлено');
  assert(g.score > 0, 'очки не начислены');
});

test('game: урон и смерть врага дают золото и очки', () => {
  const g = new TD.Game(0);
  const e = g.spawnEnemy('slime');
  const gold = g.gold;
  const score = g.score;
  g.damageEnemy(e, 5, {});
  assert(gold === g.gold, 'золото начислили до смерти');
  g.damageEnemy(e, 100000, {});
  assert(e.dead, 'враг не умер');
  assertEqual(g.enemies.length, 0);
  assert(g.gold > gold, 'золото за убийство не начислено');
  assert(g.score > score, 'очки за убийство не начислены');
});

test('game: босс при смерти делится на трёх громил', () => {
  const g = new TD.Game(0);
  g.wave = 10;
  const boss = g.spawnEnemy('boss');
  const brutesBefore = g.enemies.filter((e) => e.type === 'brute').length;
  g.damageEnemy(boss, 1e9, { pierceArmor: true });
  const brutesAfter = g.enemies.filter((e) => e.type === 'brute').length;
  assertEqual(brutesAfter - brutesBefore, 3, 'босс должен делиться на 3 громил');
});

test('game: update не падает и ускоряется без потери состояния', () => {
  const g = new TD.Game(0);
  g.startWave();
  for (let i = 0; i < 300; i++) g.update(1 / 60);
  const t1 = g.elapsed;
  g.speed = 3;
  for (let i = 0; i < 100; i++) g.update(1 / 60);
  assert(g.elapsed > t1, 'время не идёт');
  assert(g.elapsed <= t1 + 3 * 100 / 60 + 0.2, 'ускорение слишком велико');
  g.paused = true;
  const t2 = g.elapsed;
  for (let i = 0; i < 100; i++) g.update(1 / 60);
  assertEqual(g.elapsed, t2, 'пауза не останавливает время');
});

/* ---------- сохранения ---------- */

test('save: рекорд, разблокировка уровня и сброс', () => {
  TD.Save.reset();
  assertEqual(TD.Save.load().unlocked, 1, 'по умолчанию открыт один уровень');
  assertEqual(TD.Save.best(0), null);

  TD.Save.record({ levelIndex: 0, score: 500, wave: 8, win: false });
  assert(TD.Save.best(0), 'рекорд не записался');
  assertEqual(TD.Save.best(0).waves, 8);
  assertEqual(TD.Save.load().unlocked, 1, 'проигрыш не должен открывать уровень');

  TD.Save.record({ levelIndex: 0, score: 300, wave: 5, win: true });
  const best = TD.Save.best(0);
  assertEqual(best.win, true, 'победа не записалась');
  assertEqual(best.score, 500, 'рекорд ухудшился');
  assertEqual(best.waves, 8, 'число волн ухудшилось');
  assertEqual(TD.Save.load().unlocked, 2, 'победа не открыла второй уровень');

  TD.Save.record({ levelIndex: 2, score: 100, wave: 3, win: false });
  assertEqual(TD.Save.load().unlocked, 2, 'уровень открылся слишком рано');
  assertEqual(TD.Save.load().settings.sound, true, 'настройки по умолчанию');

  TD.Save.setSettings({ sound: false, path: true });
  assertEqual(TD.Save.load().settings.sound, false);
  assertEqual(TD.Save.load().settings.path, true);

  TD.Save.reset();
  assertEqual(TD.Save.load().unlocked, 1);
  assertEqual(TD.Save.best(0), null);
  assertEqual(TD.Save.load().settings.path, false);
});

test('save: игра не падает без localStorage', () => {
  /* в песочнице Node localStorage отсутствует — все операции должны работать */
  assertEqual(typeof TD.Save.load, 'function');
  const d = TD.Save.load();
  assert(d && typeof d.unlocked === 'number');
});

/* ---------- итог ---------- */

console.log('');
if (failures.length) {
  console.log('Провалено: ' + failures.length + ', пройдено: ' + passed);
  failures.forEach((f) => {
    console.log('\n--- ' + f.name + ' ---');
    console.log(f.err && f.err.stack ? f.err.stack : f.err);
  });
  process.exit(1);
} else {
  console.log('Все тесты пройдены: ' + passed);
}
