/* Пиксельная Оборона — симуляция баланса.
   Запуск: node tools/balance.js [уровень]
   Бот строит башни у маршрута, улучшает их и запускает волны без пауз.
   Нужен, чтобы проверить проходимость уровней без ручного клика. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'js/core/util.js',
  'js/core/sprites.js',
  'js/core/audio.js',
  'js/data/maps.js',
  'js/data/defs.js',
  'js/data/waves.js',
  'js/logic/grid.js',
  'js/game.js'
];

const sandbox = { console };
vm.createContext(sandbox);
for (const file of FILES) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
}
const TD = sandbox.TD;

const BUILD_PLAN = [
  'arrow', 'arrow', 'cannon', 'frost', 'arrow',
  'tesla', 'sniper', 'cannon', 'frost', 'arrow',
  'tesla', 'sniper', 'cannon', 'arrow'
];

function desiredType(game) {
  return BUILD_PLAN[game.towers.length % BUILD_PLAN.length];
}

function pathCells(game) {
  return game.grid.getPath() || [];
}

function spotScore(game, c, r, def, path) {
  const center = game.grid.cellCenter(c, r);
  const range = def.range * TD.Config.cell + 8;
  let score = 0;
  for (const cell of path) {
    const p = game.grid.cellCenter(cell.c, cell.r);
    if (TD.dist(center.x, center.y, p.x, p.y) <= range) score += 1;
  }
  if (def.air) {
    const air = game.grid.airPath();
    for (let i = 0; i <= 20; i++) {
      const x = air[0].x + (air[1].x - air[0].x) * i / 20;
      const y = air[0].y + (air[1].y - air[0].y) * i / 20;
      if (TD.dist(center.x, center.y, x, y) <= range) score += 0.35;
    }
  }
  return score;
}

function bestSpot(game, def) {
  const path = pathCells(game);
  let best = null;
  let bestScore = -1;
  for (const s of game.spots) {
    if (game.towerAt(s.c, s.r)) continue;
    const score = spotScore(game, s.c, s.r, def, path);
    if (score > bestScore) {
      bestScore = score;
      best = { c: s.c, r: s.r };
    }
  }
  return best;
}

function tryBuild(game) {
  if (game.towers.length >= game.spots.length) return false;
  const type = desiredType(game);
  const def = TD.TowerById[type];
  if (game.gold < def.price) return false;
  const spot = bestSpot(game, def);
  if (!spot) return false;
  const res = game.placeTower(spot.c, spot.r, type);
  return !!res.ok;
}

function tryUpgrade(game) {
  if (game.gold < 250) return false;
  let candidate = null;
  for (const t of game.towers) {
    if (t.level >= TD.Config.maxTowerLevel) continue;
    const cost = TD.towerUpgradeCost(t.def, t.level);
    if (game.gold >= cost + 150) {
      candidate = t;
      break;
    }
  }
  if (!candidate) return false;
  return !!game.upgradeTower(candidate).ok;
}

function simulate(levelIndex, verbose) {
  const game = new TD.Game(levelIndex);
  let steps = 0;
  const dt = 1 / 30;
  const maxSteps = 30 * 60 * 25; // 25 минут игрового времени

  if (verbose) {
    game.onEvent = function (type, data) {
      if (type === 'wave-clear') {
        console.log('    волна ' + data.wave + ' пройдена: жизни=' + game.lives +
          ' золото=' + game.gold + ' башен=' + game.towers.length);
      }
    };
  }

  while (!game.finished && steps < maxSteps) {
    if (game.state === 'idle' && game.wave < game.waves.length) {
      game.startWave();
    }
    tryBuild(game);
    tryUpgrade(game);
    game.step(dt);
    steps += 1;
    if (verbose && steps % (30 * 30) === 0) {
      console.log('  t=' + Math.round(game.elapsed) + 'с волна=' + game.wave +
        ' жизни=' + game.lives + ' золото=' + game.gold + ' башен=' + game.towers.length);
    }
  }
  return {
    level: levelIndex,
    name: game.map.name,
    win: game.result === 'win',
    wave: game.wave,
    lives: game.lives,
    score: Math.round(game.score),
    towers: game.towers.length,
    kills: game.kills,
    leaks: game.leaks,
    time: Math.round(game.elapsed),
    steps
  };
}

const only = process.argv[2] != null ? Number(process.argv[2]) : null;
let allWin = true;
for (let i = 0; i < TD.Maps.length; i++) {
  if (only != null && i !== only) continue;
  const result = simulate(i, true);
  allWin = allWin && result.win;
  console.log('');
  console.log(result.name + ': ' + (result.win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ') +
    ' | волн ' + result.wave + '/20 | жизней ' + result.lives +
    ' | башен ' + result.towers + ' | очки ' + result.score +
    ' | время ' + result.time + 'с');
  console.log('');
}
process.exit(allWin ? 0 : 1);
