/* Пиксельная Оборона — загрузка внешних ассетов.
   Набор free-fields-tileset-pixel-art-for-tower-defense (CraftPix).
   Все картинки грузятся локально относительно index.html, поэтому игра
   продолжает работать по file:// без сервера. Пока ассет не загрузился,
   рендер использует процедурный фолбэк. */
(function (root) {
  'use strict';

  var TD = root.TD = root.TD || {};

  var BASE = 'free-fields-tileset-pixel-art-for-tower-defense/';
  var TILE = 32;

  /* key → путь внутри набора */
  var FILES = {
    fields: '1 Tiles/FieldsTileset.png',

    tree1: '2 Objects/7 Decor/Tree1.png',
    tree2: '2 Objects/7 Decor/Tree2.png',
    log: '2 Objects/7 Decor/Log1.png',
    box: '2 Objects/7 Decor/Box1.png',
    lamp: '2 Objects/7 Decor/Lamp1.png',
    dirt1: '2 Objects/7 Decor/Dirt1.png',

    tent: '2 Objects/8 Camp/1.png',
    tent2: '2 Objects/8 Camp/3.png',
    fence: '2 Objects/2 Fence/1.png',

    stone1: '2 Objects/4 Stone/1.png',
    stone2: '2 Objects/4 Stone/5.png',
    stone3: '2 Objects/4 Stone/9.png',
    stone4: '2 Objects/4 Stone/13.png',
    stoneSmall: '2 Objects/4 Stone/2.png',

    bush1: '2 Objects/9 Bush/1.png',
    bush2: '2 Objects/9 Bush/3.png',
    bush3: '2 Objects/9 Bush/5.png',

    grass1: '2 Objects/5 Grass/1.png',
    grass2: '2 Objects/5 Grass/3.png',
    grass3: '2 Objects/5 Grass/5.png',

    flower1: '2 Objects/6 Flower/1.png',
    flower2: '2 Objects/6 Flower/5.png',
    flower3: '2 Objects/6 Flower/9.png',

    towerPlace1: '2 Objects/PlaceForTower1.png',
    towerPlace2: '2 Objects/PlaceForTower2.png',

    shadow: '2 Objects/1 Shadow/1.png',
    pointer: '2 Objects/3 Pointer/1.png'
  };

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

  function loadOne(name, relPath) {
    if (typeof document === 'undefined' || !document.createElement) return;
    var img = new Image();
    started += 1;
    img.onload = function () {
      loadedCount += 1;
    };
    img.onerror = function () {
      failed[name] = true;
    };
    img.src = encodeURI(BASE + relPath);
    images[name] = img;
  }

  Object.keys(FILES).forEach(function (name) {
    loadOne(name, FILES[name]);
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

  function ready() {
    var total = Object.keys(FILES).length;
    return loadedCount + Object.keys(failed).length >= total;
  }

  TD.Assets = {
    BASE: BASE,
    TILE: TILE,
    FILES: FILES,
    get: get,
    has: has,
    draw: draw,
    tile: tile,
    ready: ready,
    loaded: function () { return loadedCount; },
    failed: failed,
    count: function () { return started; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
