/* Пиксельная Оборона — точка входа.
   Поддерживает отладочный автозапуск: ?test=1&level=0&wave=1&ff=300&demo=1 */
(function (root) {
  'use strict';

  var TD = root.TD;

  function demoBuild(game) {
    game.gold = 5000;
    var types = ['arrow', 'cannon', 'frost', 'tesla', 'sniper', 'arrow', 'cannon', 'arrow'];
    var path = game.grid.getPath() || [];
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var placed = 0;
    for (var i = 1; i < path.length && placed < types.length; i++) {
      var cell = path[i];
      for (var d = 0; d < dirs.length; d++) {
        var c = cell.c + dirs[d][0];
        var r = cell.r + dirs[d][1];
        if (!game.grid.buildable(c, r) || !game.grid.canPlace(c, r)) continue;
        var res = game.placeTower(c, r, types[placed]);
        if (res.ok) {
          placed += 1;
          break;
        }
      }
    }
  }

  function boot() {
    if (!TD || !TD.UI) {
      if (root.console) console.error('Игра не загрузилась: нет TD.UI');
      return;
    }
    var params = new URLSearchParams(root.location.search || '');
    var test = params.get('test') === '1';
    var hasLevel = params.get('level') != null;

    if (!test && !hasLevel) {
      TD.UI.init();
      var screen = params.get('screen');
      if (screen && TD.UI.showScreen) {
        var screens = {
          levels: 'screen-levels',
          bestiary: 'screen-bestiary',
          scores: 'screen-scores',
          help: 'screen-help',
          menu: 'screen-menu',
          pause: 'screen-pause'
        };
        if (screens[screen]) TD.UI.showScreen(screens[screen]);
      }
      return;
    }

    var level = parseInt(params.get('level') || '0', 10);
    if (isNaN(level)) level = 0;
    var waveNum = parseInt(params.get('waveNum') || '0', 10);
    if (isNaN(waveNum)) waveNum = 0;
    var opts = {
      level: level,
      test: true,
      wave: params.get('wave') !== '0' && waveNum <= 1
    };
    TD.UI.init(opts);

    var game = TD.UI.getGame();
    if (game && params.get('path') === '1') game.showPath = true;
    if (game && params.get('grid') === '0') game.showGrid = false;
    if (game && waveNum > 1) {
      game.wave = Math.min(waveNum - 1, game.waves.length - 1);
      game.state = 'idle';
      game.startWave();
    }
    if (game && params.get('demo') === '1') {
      demoBuild(game);
    }
    var ff = parseInt(params.get('ff') || '0', 10);
    if (game && ff > 0) {
      for (var i = 0; i < ff; i++) game.step(1 / 30);
    }
    if (game && params.get('hover') === 'enemy' && game.enemies[0]) {
      game.setPointer(game.enemies[0].x, game.enemies[0].y);
    }
    if (game && params.get('hover') === 'tower' && game.towers[0]) {
      game.setPointer(game.towers[0].x, game.towers[0].y);
    }
    if (game && params.get('result')) {
      var win = params.get('result') === 'win';
      TD.UI.showResult({
        win: win,
        levelName: game.map.name,
        wavesTotal: game.waves.length,
        wave: win ? game.waves.length : 7,
        score: win ? 18420 : 6120,
        kills: win ? 412 : 138,
        time: win ? 742 : 268,
        lives: win ? 18 : 0,
        towers: 14,
        levelIndex: game.levelIndex
      });
    }
    if (game && params.get('debug') === '1') {
      var st = document.querySelector('.stage').getBoundingClientRect();
      var hd = document.querySelector('.hud').getBoundingClientRect();
      var ft = document.querySelector('.hud__foot').getBoundingClientRect();
      document.title = 'sel=' + (game.selected ? game.selected.typeId : 'none') +
        ' towers=' + game.towers.length +
        ' frame=' + TD.UI.state.frame +
        ' screen=' + (TD.UI.state.screen || 'game') +
        ' stage=' + Math.round(st.top) + '/' + Math.round(st.height) +
        ' hud=' + Math.round(hd.top) + '/' + Math.round(hd.height) +
        ' foot=' + Math.round(ft.top) + '/' + Math.round(ft.height) +
        ' body=' + document.body.scrollHeight +
        ' zoom=' + (getComputedStyle(document.querySelector('.app')).zoom || '1');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
