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
        A: '#3ddc97', a: '#1f8a5f', w: '#7a4a21', W: '#a86a32',
        s: '#3b4759', S: '#5d6f88'
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
        C: '#9aa6b8', M: '#5b6678', m: '#38414f', A: '#f2c14e',
        s: '#3b4759', S: '#5d6f88'
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
        F: '#8fe3ff', f: '#4cc9f0', w: '#e6fbff',
        s: '#3b4759', S: '#5d6f88'
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
        T: '#4cc9f0', t: '#a9f0ff', A: '#f2c14e',
        s: '#3b4759', S: '#5d6f88'
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
        G: '#3ddc97', g: '#1f8a5f', N: '#4b5565', n: '#2f3846',
        s: '#3b4759', S: '#5d6f88'
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
        d: '#1f8a5f', G: '#3ddc97', g: '#2ea043', w: '#eafff5'
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
        R: '#ef476f', r: '#a01f3c', w: '#ffe3e8'
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
        p: '#9d4edd', P: '#c77dff', w: '#f3e8ff'
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
        b: '#7a4a21', B: '#a86a32', m: '#5b6678', w: '#ffe3b3'
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
        S: '#4cc9f0', s: '#1f7a9e', e: '#0b2a3a', g: '#f2c14e'
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
        F: '#b388ff', f: '#7c4dff', w: '#ffe3e8'
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
        A: '#a01f3c', a: '#ef476f', g: '#f2c14e', e: '#ffe3e8'
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
        P: '#9d4edd', p: '#4b1a80', o: '#2a0b4a'
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
        R: '#ef476f', r: '#a01f3c', w: '#ffd6de'
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
        s: '#39465a', S: '#5b6f8c'
      }),
      rows: [
        '................',
        '................',
        '................',
        '....oooooo......',
        '...osSSSSso.....',
        '..osSSSSSSso....',
        '.osSSSSSSSSso...',
        '.osSSSSSSSSso...',
        '.osSSSSSSSso....',
        '.osSSSSSSso.....',
        '..osSSSSso......',
        '...oooooo.......',
        '................',
        '................',
        '................',
        '................'
      ]
    },

    bush: {
      palette: pal({
        G: '#2c5a3c', g: '#22482f', d: '#183524'
      }),
      rows: [
        '................',
        '................',
        '................',
        '................',
        '......ooo.......',
        '....ooGGGoo.....',
        '...oGGGGGGGo....',
        '..oGGGGGGGGGo...',
        '..oGGGGGGGGGo...',
        '...oGGGGGGGo....',
        '....oGGGGGo.....',
        '.....ooooo......',
        '................',
        '................',
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
