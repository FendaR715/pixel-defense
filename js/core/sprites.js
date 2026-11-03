/* Пиксельная Оборона — процедурный пиксель-арт.
   Спрайты 16×16 описаны строками и палитрой, один раз рендерятся
   в offscreen canvas, дальше рисуются через drawImage с pixelated-масштабом. */
(function (root) {
  'use strict';

  var TD = root.TD = root.TD || {};

  var BASE = {
    o: '#0b0e14'
  };

  function pal(extra) {
    var out = {};
    for (var k in BASE) if (Object.prototype.hasOwnProperty.call(BASE, k)) out[k] = BASE[k];
    for (var j in extra) if (Object.prototype.hasOwnProperty.call(extra, j)) out[j] = extra[j];
    return out;
  }

  var defs = {

    /* ---------- Башни ---------- */

    tower_arrow: {
      palette: pal({
        A: '#f26b4d', a: '#b3402c', w: '#8a5527', W: '#cf9250',
        s: '#4f5c70', S: '#93a6bf'
      }),
      rows: [
        '................',
        '......oooo......',
        '.....oAAAAo.....',
        '.....oAooAo.....',
        '.....oAAAAo.....',
        '......oAAo......',
        '.....owoowo.....',
        '.....owWWwo.....',
        '....owWWWWwo....',
        '....owwwwwwo....',
        '...osssssssso...',
        '...osSSSSSSso...',
        '...osSSSSSSso...',
        '...oooooooooo...',
        '................',
        '................'
      ]
    },

    tower_cannon: {
      palette: pal({
        C: '#c3cfdf', M: '#7c8ba1', m: '#46546a', A: '#ffc857',
        s: '#4f5c70', S: '#93a6bf'
      }),
      rows: [
        '................',
        '................',
        '.........oooo...',
        '........oCCCCo..',
        '........oCCCCo..',
        '.......ooCCCCo..',
        '....oooooooooo..',
        '...omMMMMMMmo...',
        '...omMmmmmMmo...',
        '...omMmmmmMmo...',
        '...omMMMMMMmo...',
        '...osssssssso...',
        '...osSSSSSSso...',
        '...oooooooooo...',
        '................',
        '................'
      ]
    },

    tower_frost: {
      palette: pal({
        F: '#c2f4ff', f: '#63d9ff', w: '#ffffff',
        s: '#4f5c70', S: '#93a6bf'
      }),
      rows: [
        '................',
        '.......oo.......',
        '......oFFo......',
        '.....oFFFFo.....',
        '....oFFFFFFo....',
        '....oFfFFFfo....',
        '....oFFFFFFo....',
        '.....oFFFFo.....',
        '......oFFo......',
        '....ossSSsso....',
        '...osssssssso...',
        '...osSSSSSSso...',
        '...osssssssso...',
        '...oooooooooo...',
        '................',
        '................'
      ]
    },

    tower_tesla: {
      palette: pal({
        T: '#7fe8ff', t: '#e8fdff', A: '#ffc857',
        s: '#4f5c70', S: '#93a6bf'
      }),
      rows: [
        '....t......t....',
        '.....t....t.....',
        '......oooo......',
        '.....oTTTTo.....',
        '....oTTTTTTo....',
        '....oTtTTtTo....',
        '....oTTTTTTo....',
        '.....oTTTTo.....',
        '......o..o......',
        '....ossSSsso....',
        '...osssssssso...',
        '...osSSSSSSso...',
        '...osssssssso...',
        '...oooooooooo...',
        '................',
        '................'
      ]
    },

    tower_sniper: {
      palette: pal({
        G: '#ffd166', g: '#c99a2e', N: '#3f6b52', n: '#294a38',
        s: '#4f5c70', S: '#93a6bf'
      }),
      rows: [
        '..........oo....',
        '.........oGGo...',
        '.........oGGo...',
        '........oGGGGo..',
        '......oooooooo..',
        '.....oNNNNNNo...',
        '.....oNnnnnNo...',
        '.....oNNNNNNo...',
        '......oNNNNo....',
        '....ossSSsso....',
        '...osssssssso...',
        '...osSSSSSSso...',
        '...osssssssso...',
        '...oooooooooo...',
        '................',
        '................'
      ]
    },

    /* ---------- Враги ---------- */

    enemy_slime: {
      palette: pal({
        d: '#24502a', G: '#a6ef5c', g: '#79cf3f', w: '#ffffff'
      }),
      rows: [
        '................',
        '................',
        '................',
        '......oooo......',
        '....ooddddoo....',
        '...odddddddo....',
        '..oddGGGGdddo...',
        '..odGGGGGGgdo...',
        '..odGwwGGwwgo...',
        '..odGwwGGwwgo...',
        '..odGGGGGGggo...',
        '..oddGGGGgggdo..',
        '...oddddddddo...',
        '....oooooooo....',
        '................',
        '................'
      ]
    },

    enemy_runner: {
      palette: pal({
        R: '#ff6b5e', r: '#c93c3c', w: '#fff1a8'
      }),
      rows: [
        '................',
        '................',
        '......oooo......',
        '.....oRRRRo.....',
        '....oRRRRRRo....',
        '....oRwwRRwo....',
        '....oRRRRRRo....',
        '.....oRRRRo.....',
        '...ooRRRRRRoo...',
        '...oRRrrrrRRo...',
        '..ooRRrrrrRRoo..',
        '...o..RRRR..o...',
        '......RR.RR.....',
        '.....oo...oo....',
        '................',
        '................'
      ]
    },

    enemy_swarm: {
      palette: pal({
        p: '#a94cff', P: '#e0a8ff', w: '#ffffff'
      }),
      rows: [
        '................',
        '................',
        '................',
        '................',
        '......oooo......',
        '....ooppppoo....',
        '...oppppppppo...',
        '...opPPppPPpo...',
        '...oppppppppo...',
        '....opppppoo....',
        '.....opppo......',
        '....o.opo.o.....',
        '......o.o.......',
        '................',
        '................',
        '................'
      ]
    },

    enemy_brute: {
      palette: pal({
        b: '#9c5a2e', B: '#e09a5a', m: '#9aa7ba', w: '#ffe28a'
      }),
      rows: [
        '................',
        '................',
        '....oooooooo....',
        '...obbbbbbbbo...',
        '..obBBBBBBBBbo..',
        '..obBBwwwwBBbo..',
        '..obBBBBBBBBbo..',
        '..obbbbbbbbbbo..',
        '.oobbbbbbbbbboo.',
        '.obbbmmmmmmbbbo.',
        '.obbbmmmmmmbbbo.',
        '.obbbbbbbbbbbbo.',
        '..oobbbbbbbboo..',
        '....oooooooo....',
        '................',
        '................'
      ]
    },

    enemy_shield: {
      palette: pal({
        S: '#72b8ff', s: '#2f6fa8', e: '#12324a', g: '#ffd166'
      }),
      rows: [
        '................',
        '................',
        '....oooooooo....',
        '...osSSSSSSso...',
        '..osSSSSSSSSso..',
        '..osSSeeSSSSso..',
        '..osSSeeSSSSso..',
        '..osSSSggSSSso..',
        '..osSSSggSSSso..',
        '..osSSSSSSSSso..',
        '...osSSSSSSso...',
        '....osSSSSso....',
        '.....osSSso.....',
        '......oooo......',
        '................',
        '................'
      ]
    },

    enemy_flyer: {
      palette: pal({
        F: '#7fe3ff', f: '#2a9cc4', w: '#ff6b81'
      }),
      rows: [
        '................',
        '................',
        '..o..........o..',
        '.oFo........oFo.',
        '.oFFo......oFFo.',
        'oFFFFo.oo.oFFFFo',
        'oFFFoFFFFFFoFFFo',
        '.oFFFFFFFFFFFFo.',
        '..oFFFFFFFFFFo..',
        '...oFFo..oFFo...',
        '....oFo..oFo....',
        '.....oo..oo.....',
        '................',
        '................',
        '................',
        '................'
      ]
    },

    enemy_boss: {
      palette: pal({
        A: '#c22f4e', a: '#ff5f74', g: '#ffd166', e: '#fff0f3'
      }),
      rows: [
        '..o..........o..',
        '.oao........oao.',
        '.oAao......oAao.',
        '..oAao....oAao..',
        '...oAAooooAAo...',
        '....oAAAAAAo....',
        '...oAAAAAAAAo...',
        '..oAeeAAAAeeAo..',
        '..oAAAAAAAAAAo..',
        '..oAAggggggAAo..',
        '..oAAAAAAAAAAo..',
        '...oAAAAAAAAo...',
        '....oAAAAAAo....',
        '..oo.oAAAAo.oo..',
        '.oao..oAAo..oao.',
        '.oo....oo....oo.'
      ]
    },

    /* ---------- Декор и объекты ---------- */

    portal: {
      palette: pal({
        P: '#b36bff', p: '#6a2fb0', o: '#3a1366'
      }),
      rows: [
        '................',
        '......oooo......',
        '....ooPPPPoo....',
        '...oPPPPPPPPo...',
        '..oPPPppppPPPo..',
        '..oPPppooppPPo..',
        '.oPPpooooooPPo..',
        '.oPpoooooooopPo.',
        '.oPpoooooooopPo.',
        '.oPPpooooooPPo..',
        '..oPPppooppPPo..',
        '..oPPPppppPPPo..',
        '...oPPPPPPPPo...',
        '....ooPPPPoo....',
        '......oooo......',
        '................'
      ]
    },

    heart: {
      palette: pal({
        R: '#ff4d6d', r: '#c9184a', w: '#ffd6de'
      }),
      rows: [
        '................',
        '................',
        '...ooo....ooo...',
        '..oRRRo..oRRRo..',
        '.oRRRRRooRRRRRo.',
        '.oRRRRRRRRRRRRo.',
        '.oRRRwwRRwwRRRo.',
        '.oRRRRRRRRRRRRo.',
        '..oRRRRRRRRRRo..',
        '...oRRRRRRRRo...',
        '....oRRRRRRo....',
        '.....oRRRRo.....',
        '......oRRo......',
        '.......oo.......',
        '................',
        '................'
      ]
    },

    rock: {
      palette: pal({
        s: '#6b7384', S: '#b3bdcb', d: '#556072'
      }),
      rows: [
        'oooooooooooooooo',
        'oSSSSSSSSSSSSSSo',
        'oSSdSSSSSSdSSSSo',
        'oSSSSSSSSSSSSSSo',
        'oSSSSSdSSSSSSSSo',
        'oSSSSSSSSSSSdSSo',
        'oSSSSSSSSSSSSSSo',
        'oSSdSSSSSSSSSSSo',
        'oSSSSSSSSSdSSSSo',
        'oSSSSSSSSSSSSSSo',
        'oSSSSSdSSSSSSSSo',
        'oSSSSSSSSSSSdSSo',
        'oSSdSSSSSSSSSSSo',
        'oSssSSSSSSssSSSo',
        'oooooooooooooooo',
        '................'
      ]
    },

    bush: {
      palette: pal({
        G: '#5cbf4f', g: '#3e8f38', W: '#8a5527'
      }),
      rows: [
        '................',
        '................',
        '......oooo......',
        '.....oGGGGo.....',
        '....oGGGGGGo....',
        '...oGGgGGgGGo...',
        '...oGGGGGGGGo...',
        '...oGgGGGGgGo...',
        '....oGGGGGGo....',
        '.....oGGGGo.....',
        '......oWWo......',
        '......oWWo......',
        '......oWWo......',
        '.....oooooo.....',
        '................',
        '................'
      ]
    }
  };

  var SIZE = 16;
  var cache = {};

  function makeCanvas(w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    return cv;
  }

  /** Проверка целостности описаний (используется тестами). */
  function validate() {
    var issues = [];
    for (var name in defs) {
      if (!Object.prototype.hasOwnProperty.call(defs, name)) continue;
      var d = defs[name];
      if (d.rows.length !== SIZE) {
        issues.push(name + ': строк ' + d.rows.length + ', нужно ' + SIZE);
      }
      for (var r = 0; r < d.rows.length; r++) {
        var row = d.rows[r];
        if (row.length !== SIZE) {
          issues.push(name + ' строка ' + r + ': длина ' + row.length + ' вместо ' + SIZE);
        }
        for (var c = 0; c < row.length; c++) {
          var ch = row.charAt(c);
          if (ch !== '.' && !Object.prototype.hasOwnProperty.call(d.palette, ch)) {
            issues.push(name + ' [' + r + ',' + c + ']: нет цвета для «' + ch + '»');
          }
        }
      }
    }
    return issues;
  }

  /** Собрать (и закешировать) offscreen-canvas спрайта. */
  function build(name) {
    var d = defs[name];
    if (!d) return null;
    if (cache[name]) return cache[name];
    var cv = makeCanvas(SIZE, SIZE);
    if (!cv) return null;
    var g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    for (var r = 0; r < SIZE; r++) {
      var row = d.rows[r] || '';
      for (var c = 0; c < SIZE; c++) {
        var ch = row.charAt(c);
        if (ch === '.' || ch === '') continue;
        var color = d.palette[ch];
        if (!color) continue;
        g.fillStyle = color;
        g.fillRect(c, r, 1, 1);
      }
    }
    cache[name] = cv;
    return cv;
  }

  /** Получить спрайт (canvas) по имени. */
  function get(name) {
    return build(name);
  }

  /** Нарисовать спрайт в прямоугольник. */
  function draw(ctx, name, x, y, w, h) {
    var cv = get(name);
    if (!cv || !ctx) return false;
    var old = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cv, 0, 0, SIZE, SIZE, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    ctx.imageSmoothingEnabled = old;
    return true;
  }

  /** Мини-иконка для магазина: canvas нужного размера. */
  function icon(name, size) {
    size = size || 32;
    var cv = makeCanvas(size, size);
    if (!cv) return null;
    var g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    var src = get(name);
    if (src) g.drawImage(src, 0, 0, SIZE, SIZE, 0, 0, size, size);
    return cv;
  }

  TD.Sprites = {
    SIZE: SIZE,
    defs: defs,
    validate: validate,
    get: get,
    draw: draw,
    icon: icon
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
