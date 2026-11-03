/* Пиксельная Оборона — общие утилиты.
   Подключается первым, создаёт глобальный неймспейс TD. */
(function (root) {
  'use strict';

  var TD = root.TD = root.TD || {};

  TD.VERSION = '1.0.0';

  /** Ограничить значение отрезком. */
  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  /** Линейная интерполяция. */
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Расстояние между точками. */
  function dist(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Квадрат расстояния (быстрее, когда корень не нужен). */
  function dist2(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    return dx * dx + dy * dy;
  }

  /** Хеш строки (FNV-1a) → uint32. Нужен для детерминированных seed. */
  function hash(str) {
    var h = 2166136261 >>> 0;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** Детерминированный генератор случайных чисел (mulberry32). */
  function rng(seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Целое в [min, max] из готового rng. */
  function rngInt(rand, min, max) {
    return min + Math.floor(rand() * (max - min + 1));
  }

  /** Случайный элемент массива из готового rng. */
  function pick(rand, arr) {
    return arr[Math.floor(rand() * arr.length)];
  }

  /** Перемешать копию массива детерминированно. */
  function shuffle(rand, arr) {
    var out = arr.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  /** Число с пробелами между разрядами: 12345 → «12 345». */
  function fmtInt(n) {
    var s = String(Math.round(n));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  /** Секунды → «мм:сс». */
  function fmtTime(seconds) {
    seconds = Math.max(0, Math.floor(seconds));
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  /** Текущее время в мс (или performance.now, если есть). */
  function now() {
    if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  /** Детерминированный «шум» по двум координатам, [0,1). */
  function noise2(x, y, seed) {
    return hash(x + ':' + y + ':' + (seed || 0)) / 4294967296;
  }

  /** Есть ли в объекте собственное свойство. */
  function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  TD.clamp = clamp;
  TD.lerp = lerp;
  TD.dist = dist;
  TD.dist2 = dist2;
  TD.hash = hash;
  TD.rng = rng;
  TD.rngInt = rngInt;
  TD.pick = pick;
  TD.shuffle = shuffle;
  TD.fmtInt = fmtInt;
  TD.fmtTime = fmtTime;
  TD.now = now;
  TD.noise2 = noise2;
  TD.has = has;

  /** Пространство имён для тестов. */
  TD.util = {
    clamp: clamp, lerp: lerp, dist: dist, dist2: dist2, hash: hash,
    rng: rng, rngInt: rngInt, pick: pick, shuffle: shuffle,
    fmtInt: fmtInt, fmtTime: fmtTime, noise2: noise2
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
