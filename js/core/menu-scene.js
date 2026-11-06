/* Пиксельная Оборона — анимированная сцена главного меню.
   Рисуется на отдельном canvas под оверлеем меню: поле, дорога, башня,
   монстры из новых наборов, лагерь с флагом и костром. */
(function (root) {
  'use strict';

  var TD = root.TD = root.TD || {};

  var W = 1280;
  var H = 760;

  var PATH = [
    { x: -80, y: 600 }, { x: 250, y: 600 }, { x: 250, y: 470 },
    { x: 640, y: 470 }, { x: 640, y: 640 }, { x: 1360, y: 640 }
  ];

  var TREES = [
    { x: 80, y: 300, kind: 1, s: 1.15 },
    { x: 430, y: 250, kind: 2, s: 1.0 },
    { x: 780, y: 330, kind: 1, s: 1.25 },
    { x: 1120, y: 250, kind: 2, s: 1.05 },
    { x: 200, y: 470, kind: 2, s: 0.9 },
    { x: 560, y: 680, kind: 1, s: 1.05 },
    { x: 900, y: 690, kind: 2, s: 0.95 }
  ];

  var ROCKS = [
    { x: 330, y: 700, s: 1.1 }, { x: 370, y: 720, s: 0.8 },
    { x: 1180, y: 430, s: 0.9 }, { x: 1215, y: 455, s: 0.7 },
    { x: 60, y: 690, s: 1.0 }
  ];

  function pathPoint(u) {
    var segs = PATH.length - 1;
    var total = 0;
    var lens = [];
    for (var i = 0; i < segs; i++) {
      var dx = PATH[i + 1].x - PATH[i].x;
      var dy = PATH[i + 1].y - PATH[i].y;
      var l = Math.sqrt(dx * dx + dy * dy);
      lens.push(l);
      total += l;
    }
    var want = (u % 1) * total;
    for (i = 0; i < segs; i++) {
      if (want <= lens[i]) {
        var t = lens[i] ? want / lens[i] : 0;
        return {
          x: PATH[i].x + (PATH[i + 1].x - PATH[i].x) * t,
          y: PATH[i].y + (PATH[i + 1].y - PATH[i].y) * t,
          dx: PATH[i + 1].x - PATH[i].x,
          dy: PATH[i + 1].y - PATH[i].y
        };
      }
      want -= lens[i];
    }
    return { x: PATH[PATH.length - 1].x, y: PATH[PATH.length - 1].y, dx: 1, dy: 0 };
  }

  function drawGround(ctx) {
    var A = TD.Assets;
    var cell = 64;
    if (A && A.has('fields')) {
      for (var y = 0; y < H; y += cell) {
        for (var x = 0; x < W; x += cell) {
          A.tile(ctx, 37, x, y, cell);
        }
      }
    } else {
      ctx.fillStyle = '#a4ae4e';
      ctx.fillRect(0, 0, W, H);
    }
    /* тропа */
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(88,52,32,0.35)';
    ctx.lineWidth = 90;
    strokePath(ctx);
    ctx.strokeStyle = '#a95d3c';
    ctx.lineWidth = 78;
    ctx.stroke();
    ctx.strokeStyle = '#e79a63';
    ctx.lineWidth = 62;
    ctx.stroke();
    ctx.restore();
  }

  function strokePath(ctx) {
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (var i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();
  }

  function drawDecor(ctx, time) {
    var A = TD.Assets;
    if (!A) return;

    /* цветы и трава */
    for (var i = 0; i < 90; i++) {
      var x = (i * 137 + 40) % W;
      var y = (i * 83 + 70) % H;
      if (i % 3 === 0) A.draw(ctx, 'flower' + (1 + i % 12), x, y, 18, 18);
      else if (i % 3 === 1) A.draw(ctx, 'grass' + (1 + i % 6), x, y, 14, 16);
      else A.draw(ctx, 'bush' + (1 + i % 6), x, y, 28, 25);
    }

    /* деревья */
    for (i = 0; i < TREES.length; i++) {
      var tr = TREES[i];
      var tw = (tr.kind === 1 ? 78 : 44) * tr.s;
      var th = (tr.kind === 1 ? 91 : 40) * tr.s;
      A.draw(ctx, tr.kind === 1 ? 'tree1' : 'tree2', tr.x - tw / 2, tr.y - th, tw, th);
    }

    /* камни */
    for (i = 0; i < ROCKS.length; i++) {
      var rk = ROCKS[i];
      A.draw(ctx, i % 2 ? 'stone11' : 'stone3', rk.x, rk.y, 50 * rk.s, 40 * rk.s);
    }

    /* лагерь справа */
    var cx = 1130, cy = 120;
    A.draw(ctx, 'tent3', cx, cy, 105, 68);
    A.draw(ctx, 'fence3', cx - 100, cy + 55, 60, 34);
    A.frame(ctx, 'aniflag', Math.floor(time * 7) % 6, 6, cx + 120, cy - 30, 36, 72);
    A.frame(ctx, 'fireFlame', Math.floor(time * 9) % 6, 6, cx + 66, cy + 50, 34, 34);
    ctx.save();
    ctx.globalAlpha = 0.6;
    A.frame(ctx, 'fireSmoke', Math.floor(time * 9) % 6, 6, cx + 68, cy - 5, 30, 48);
    ctx.restore();
  }

  function drawTower(ctx, time) {
    var A = TD.Assets;
    if (!A || !A.has('towerIdle2')) return;
    var tw = 195;
    var th = tw * 130 / 70;
    var baseX = 1010;
    var baseY = 610;
    var frame = Math.floor(time * 5) % 6;

    A.draw(ctx, 'towerPlace1', baseX - 55, baseY - 30, 110, 100);
    A.frame(ctx, 'towerIdle2', frame, 6, baseX - tw / 2, baseY - th, tw, th);

    /* лучник в окне */
    var size = 58;
    var feet = baseY - th * 0.25;
    var af = Math.floor(time * 6) % 4;
    A.frame(ctx, 'archerIdle', af, 4, baseX - size / 2, feet - size * 0.8125, size, size);
  }

  function drawEnemies(ctx, time) {
    var A = TD.Assets;
    if (!A) return;

    var monsters = [
      { pack: 'e1', off: 0.04, size: 78 },
      { pack: 'e3', off: 0.22, size: 88 },
      { pack: 'e2', off: 0.41, size: 92 },
      { pack: 'e4', off: 0.6, size: 82 },
      { pack: 'e1', off: 0.73, size: 70 },
      { pack: 'e3', off: 0.9, size: 84 }
    ];

    for (var i = 0; i < monsters.length; i++) {
      var m = monsters[i];
      var p = pathPoint(m.off + time * 0.025);
      var dir = Math.abs(p.dx) >= Math.abs(p.dy) ? 'S' : (p.dy < 0 ? 'U' : 'D');
      var key = m.pack + dir + 'Walk';
      if (!A.has(key)) key = m.pack + 'SWalk';
      var flip = Math.abs(p.dx) >= Math.abs(p.dy) && p.dx > 0;
      var frame = Math.floor(time * 8 + i * 0.7) % 6;
      var size = m.size;
      ctx.save();
      if (flip) {
        ctx.translate(p.x, 0);
        ctx.scale(-1, 1);
        A.frame(ctx, key, frame, 6, -size / 2, p.y - size * 0.8, size, size);
      } else {
        A.frame(ctx, key, frame, 6, p.x - size / 2, p.y - size * 0.8, size, size);
      }
      ctx.restore();
    }
  }

  function render(ctx, time) {
    if (!ctx) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    drawGround(ctx);
    drawDecor(ctx, time);
    drawTower(ctx, time);
    drawEnemies(ctx, time);
    ctx.restore();
  }

  TD.MenuScene = {
    W: W,
    H: H,
    render: render
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
