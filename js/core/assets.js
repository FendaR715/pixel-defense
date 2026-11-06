/* Пиксельная Оборона — загрузка внешних ассетов.
   Набор free-fields-tileset-pixel-art-for-tower-defense (CraftPix).
   Все картинки грузятся локально относительно index.html, поэтому игра
   продолжает работать по file:// без сервера. Пока ассет не загрузился,
   рендер использует процедурный фолбэк. */
(function (root) {
  'use strict';

  var TD = root.TD = root.TD || {};

  var BASE = 'free-fields-tileset-pixel-art-for-tower-defense/';
  var TOWER_BASE = 'free-archer-towers-pixel-art-for-tower-defense/';
  var ENEMY_BASE = 'free-field-enemies-pixel-art-for-tower-defense/';
  var TILE = 32;

  /* key → путь внутри набора */
  var FILES = {
    fields: '1 Tiles/FieldsTileset.png',

    tree1: '2 Objects/7 Decor/Tree1.png',
    tree2: '2 Objects/7 Decor/Tree2.png',

    aniflag: '3 Animated Objects/1 Flag/1.png',
    fireSmoke: '3 Animated Objects/2 Campfire/1.png',
    fireFlame: '3 Animated Objects/2 Campfire/2.png'
  };

  function addNumbered(prefix, folder, count, ext) {
    for (var i = 1; i <= count; i++) {
      FILES[prefix + i] = folder + i + (ext || '.png');
    }
  }

  addNumbered('stone', '2 Objects/4 Stone/', 16);
  addNumbered('bush', '2 Objects/9 Bush/', 6);
  addNumbered('grass', '2 Objects/5 Grass/', 6);
  addNumbered('flower', '2 Objects/6 Flower/', 12);
  addNumbered('dirt', '2 Objects/7 Decor/Dirt', 6);
  addNumbered('log', '2 Objects/7 Decor/Log', 4);
  addNumbered('box', '2 Objects/7 Decor/Box', 4);
  addNumbered('lamp', '2 Objects/7 Decor/Lamp', 6);
  addNumbered('tent', '2 Objects/8 Camp/', 6);
  addNumbered('fence', '2 Objects/2 Fence/', 10);
  addNumbered('pointer', '2 Objects/3 Pointer/', 6);
  addNumbered('shadow', '2 Objects/1 Shadow/', 6);

  FILES.towerPlace1 = '2 Objects/PlaceForTower1.png';
  FILES.towerPlace2 = '2 Objects/PlaceForTower2.png';

  /* Анимации башни-стрелка и её лучников. */
  var TOWER_FILES = {
    towerIdle1: '2 Idle/6.png',
    towerIdle2: '2 Idle/7.png',
    towerIdle3: '2 Idle/7.png',
    towerBuild: '1 Upgrade/7.png',
    archerIdle: '3 Units/1/S_Idle.png',
    archerAttack: '3 Units/1/S_Attack.png'
  };

  /* Анимации четырёх монстров: ходьба в трёх направлениях + смерть. */
  var ENEMY_FILES = {};
  [1, 2, 3, 4].forEach(function (n) {
    ['S', 'D', 'U'].forEach(function (dir) {
      ENEMY_FILES['e' + n + dir + 'Walk'] = n + '/' + dir + '_Walk.png';
    });
    ENEMY_FILES['e' + n + 'SDeath'] = n + '/S_Death.png';
  });

  var images = {};
  var failed = {};
  var started = 0;
  var loadedCount = 0;

  function get(name) {
    var img = images[name];
    if (!img) return null;
    if (!img.complete) return null;
    if (!img.naturalWidth) return null;
    return img;
  }

  function has(name) {
    return !!get(name);
  }

  function loadOne(name, relPath, base) {
    if (typeof document === 'undefined' || !document.createElement) return;
    var img = new Image();
    started += 1;
    img.onload = function () {
      loadedCount += 1;
    };
    img.onerror = function () {
      failed[name] = true;
    };
    img.src = encodeURI((base || BASE) + relPath);
    images[name] = img;
  }

  Object.keys(FILES).forEach(function (name) {
    loadOne(name, FILES[name], BASE);
  });
  Object.keys(TOWER_FILES).forEach(function (name) {
    loadOne(name, TOWER_FILES[name], TOWER_BASE);
  });
  Object.keys(ENEMY_FILES).forEach(function (name) {
    loadOne(name, ENEMY_FILES[name], ENEMY_BASE);
  });

  /**
   * Нарисовать тайл из атласа 8×8 (32 px).
   * index 0..63, где 37 — чистая трава, 32 — земля с трещинами.
   */
  function tile(ctx, index, dx, dy, size) {
    var img = get('fields');
    if (!img) return false;
    var sx = (index % 8) * TILE;
    var sy = Math.floor(index / 8) * TILE;
    var old = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, sx, sy, TILE, TILE, Math.round(dx), Math.round(dy), Math.round(size), Math.round(size));
    ctx.imageSmoothingEnabled = old;
    return true;
  }

  function draw(ctx, name, x, y, w, h) {
    var img = get(name);
    if (!img || !ctx) return false;
    var old = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight,
      Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    ctx.imageSmoothingEnabled = old;
    return true;
  }

  /** Кадр из горизонтальной полосы анимации. */
  function frame(ctx, name, index, frames, x, y, w, h) {
    var img = get(name);
    if (!img || !ctx) return false;
    var fw = img.naturalWidth / frames;
    var fh = img.naturalHeight;
    var idx = ((index % frames) + frames) % frames;
    var old = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, Math.round(idx * fw), 0, fw, fh,
      Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    ctx.imageSmoothingEnabled = old;
    return true;
  }

  function size(name) {
    var img = get(name);
    if (!img) return null;
    return { w: img.naturalWidth, h: img.naturalHeight };
  }

  function ready() {
    var total = Object.keys(FILES).length + Object.keys(TOWER_FILES).length + Object.keys(ENEMY_FILES).length;
    return loadedCount + Object.keys(failed).length >= total;
  }

  TD.Assets = {
    BASE: BASE,
    TOWER_BASE: TOWER_BASE,
    ENEMY_BASE: ENEMY_BASE,
    TILE: TILE,
    FILES: FILES,
    TOWER_FILES: TOWER_FILES,
    ENEMY_FILES: ENEMY_FILES,
    get: get,
    has: has,
    draw: draw,
    frame: frame,
    size: size,
    tile: tile,
    ready: ready,
    loaded: function () { return loadedCount; },
    failed: failed,
    count: function () { return started; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
