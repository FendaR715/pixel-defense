/* Пиксельная Оборона — сетка и поиск пути.
   A* по 4 направлениям (без диагоналей, чтобы враги не «срезали» углы башен).
   Башни занимают клетку: перед постановкой путь проверяется — замуровать проход нельзя. */
(function (root) {
  'use strict';

  var TD = root.TD = root.TD || {};

  var DIRS = [
    { c: 1, r: 0 }, { c: -1, r: 0 }, { c: 0, r: 1 }, { c: 0, r: -1 }
  ];

  function Grid(map) {
    if (!map || !map.ascii || !map.ascii.length) {
      throw new Error('Grid: карта не задана');
    }
    this.map = map;
    this.rows = map.ascii.length;
    this.cols = map.ascii[0].length;
    this.cell = (TD.Config && TD.Config.cell) || 40;

    this.tiles = [];
    this.occ = new Uint8Array(this.cols * this.rows);
    this.spawn = null;
    this.base = null;

    for (var r = 0; r < this.rows; r++) {
      var row = map.ascii[r];
      if (row.length !== this.cols) {
        throw new Error('Grid: строка ' + r + ' карты «' + map.name + '» длиной ' + row.length +
          ', ожидалось ' + this.cols);
      }
      var line = [];
      for (var c = 0; c < this.cols; c++) {
        var ch = row.charAt(c);
        if (ch === 'S') {
          this.spawn = { c: c, r: r };
          ch = '.';
        } else if (ch === 'B') {
          this.base = { c: c, r: r };
          ch = '.';
        }
        line.push(ch);
      }
      this.tiles.push(line);
    }

    if (!this.spawn) throw new Error('Grid: на карте нет портала S');
    if (!this.base) throw new Error('Grid: на карте нет сердца B');
    if (!this.pathExists()) throw new Error('Grid: исходная карта без прохода');
  }

  Grid.prototype.inBounds = function (c, r) {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows;
  };

  Grid.prototype.at = function (c, r) {
    if (!this.inBounds(c, r)) return null;
    return this.tiles[r][c];
  };

  Grid.prototype.isRock = function (c, r) {
    var ch = this.at(c, r);
    return ch === '#';
  };

  Grid.prototype.isWater = function (c, r) {
    var ch = this.at(c, r);
    return ch === '~';
  };

  Grid.prototype.isOccupied = function (c, r) {
    return this.occ[r * this.cols + c] === 1;
  };

  /** Клетка проходима для наземных врагов (без башни). */
  Grid.prototype.walkable = function (c, r) {
    if (!this.inBounds(c, r)) return false;
    var ch = this.tiles[r][c];
    if (ch === '#' || ch === '~') return false;
    return !this.isOccupied(c, r);
  };

  /** Можно ли строить: только трава/земля и клетка свободна. */
  Grid.prototype.buildable = function (c, r) {
    if (!this.inBounds(c, r)) return false;
    if (this.isOccupied(c, r)) return false;
    var ch = this.tiles[r][c];
    return ch === '.' || ch === ',';
  };

  Grid.prototype.cellCenter = function (c, r) {
    return { x: c * this.cell + this.cell / 2, y: r * this.cell + this.cell / 2 };
  };

  Grid.prototype.pixelToCell = function (x, y) {
    return { c: Math.floor(x / this.cell), r: Math.floor(y / this.cell) };
  };

  /* ---------- A* ---------- */

  function Heap() {
    this.items = [];
    this.prio = [];
  }
  Heap.prototype.push = function (item, priority) {
    this.items.push(item);
    this.prio.push(priority);
    var i = this.items.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (this.prio[p] <= this.prio[i]) break;
      this.swap(i, p);
      i = p;
    }
  };
  Heap.prototype.pop = function () {
    if (!this.items.length) return null;
    var top = this.items[0];
    var lastItem = this.items.pop();
    var lastPrio = this.prio.pop();
    if (this.items.length) {
      this.items[0] = lastItem;
      this.prio[0] = lastPrio;
      var i = 0;
      for (;;) {
        var l = i * 2 + 1, r = l + 1, m = i;
        if (l < this.items.length && this.prio[l] < this.prio[m]) m = l;
        if (r < this.items.length && this.prio[r] < this.prio[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  };
  Heap.prototype.swap = function (a, b) {
    var ti = this.items[a]; this.items[a] = this.items[b]; this.items[b] = ti;
    var tp = this.prio[a]; this.prio[a] = this.prio[b]; this.prio[b] = tp;
  };
  Heap.prototype.size = function () { return this.items.length; };

  /**
   * Путь от from к to включительно: [{c,r}, ...] или null.
   * from/to — клетки {c,r}; старт и финиш должны быть проходимы.
   */
  Grid.prototype.findPath = function (from, to) {
    if (!from || !to) return null;
    if (!this.inBounds(from.c, from.r) || !this.inBounds(to.c, to.r)) return null;
    if (from.c === to.c && from.r === to.r) return [{ c: from.c, r: from.r }];
    if (!this.walkable(from.c, from.r) || !this.walkable(to.c, to.r)) return null;

    var cols = this.cols;
    var total = cols * this.rows;
    var start = from.r * cols + from.c;
    var goal = to.r * cols + to.c;

    var gScore = new Float64Array(total);
    var cameFrom = new Int32Array(total);
    var closed = new Uint8Array(total);
    var open = new Heap();
    var i;
    for (i = 0; i < total; i++) {
      gScore[i] = Infinity;
      cameFrom[i] = -1;
    }
    gScore[start] = 0;
    open.push(start, Math.abs(from.c - to.c) + Math.abs(from.r - to.r));

    while (open.size()) {
      var cur = open.pop();
      if (cur === goal) {
        var path = [];
        var node = cur;
        while (node !== -1) {
          path.push({ c: node % cols, r: (node / cols) | 0 });
          node = cameFrom[node];
        }
        path.reverse();
        return path;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;

      var cc = cur % cols;
      var cr = (cur / cols) | 0;
      for (var d = 0; d < DIRS.length; d++) {
        var nc = cc + DIRS[d].c;
        var nr = cr + DIRS[d].r;
        if (!this.walkable(nc, nr)) continue;
        var ni = nr * cols + nc;
        if (closed[ni]) continue;
        var tentative = gScore[cur] + 1;
        if (tentative < gScore[ni]) {
          gScore[ni] = tentative;
          cameFrom[ni] = cur;
          var h = Math.abs(nc - to.c) + Math.abs(nr - to.r);
          open.push(ni, tentative + h);
        }
      }
    }
    return null;
  };

  /** Существует ли путь от портала к сердцу. */
  Grid.prototype.pathExists = function () {
    return !!this.findPath(this.spawn, this.base);
  };

  /** Путь для отрисовки/логики (клетки). */
  Grid.prototype.getPath = function () {
    return this.findPath(this.spawn, this.base);
  };

  /**
   * Можно ли поставить башню: клетка свободна и после постановки
   * путь от портала к сердцу остаётся. Башня ставится «виртуально».
   */
  Grid.prototype.canPlace = function (c, r) {
    if (!this.buildable(c, r)) return false;
    var i = r * this.cols + c;
    this.occ[i] = 1;
    var ok = this.pathExists();
    this.occ[i] = 0;
    return ok;
  };

  Grid.prototype.place = function (c, r, tower) {
    if (!this.buildable(c, r)) return false;
    this.occ[r * this.cols + c] = 1;
    return true;
  };

  Grid.prototype.remove = function (c, r) {
    if (!this.inBounds(c, r)) return;
    this.occ[r * this.cols + c] = 0;
  };

  /** Ближайшая проходимая клетка (BFS) — для пересчёта пути и осколков босса. */
  Grid.prototype.nearestWalkable = function (c, r) {
    if (this.walkable(c, r)) return { c: c, r: r };
    var seen = new Uint8Array(this.cols * this.rows);
    var queue = [{ c: c, r: r }];
    seen[r * this.cols + c] = 1;
    while (queue.length) {
      var cur = queue.shift();
      for (var d = 0; d < DIRS.length; d++) {
        var nc = cur.c + DIRS[d].c;
        var nr = cur.r + DIRS[d].r;
        if (!this.inBounds(nc, nr)) continue;
        var ni = nr * this.cols + nc;
        if (seen[ni]) continue;
        seen[ni] = 1;
        if (this.walkable(nc, nr)) return { c: nc, r: nr };
        queue.push({ c: nc, r: nr });
      }
    }
    return null;
  };

  /** Перевести клетки пути в пиксельные центры. */
  Grid.prototype.cellsToPoints = function (cells) {
    if (!cells) return null;
    var out = [];
    for (var i = 0; i < cells.length; i++) {
      out.push(this.cellCenter(cells[i].c, cells[i].r));
    }
    return out;
  };

  /** Прямой маршрут для летающих: портал → сердце. */
  Grid.prototype.airPath = function () {
    return [this.cellCenter(this.spawn.c, this.spawn.r), this.cellCenter(this.base.c, this.base.r)];
  };

  TD.Grid = Grid;
})(typeof globalThis !== 'undefined' ? globalThis : this);
