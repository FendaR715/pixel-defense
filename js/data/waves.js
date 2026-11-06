/* Пиксельная Оборона — генератор волн.
   Состав детерминирован: seed = хеш от уровня и номера волны,
   поэтому перезапуск уровня даёт те же волны. */
(function (root) {
  'use strict';

  var TD = root.TD = root.TD || {};

  var UNIT_COST = { slime: 1.5, runner: 1.2, swarm: 0.8, brute: 6, shield: 5, flyer: 3.5 };
  var INTERVAL = { slime: 0.62, runner: 0.45, swarm: 0.34, brute: 1.05, shield: 1.0, flyer: 0.65 };

  var LABELS = {
    slime: 'Слизни', runner: 'Бегуны', swarm: 'Рой', brute: 'Громилы',
    shield: 'Щитоносцы', flyer: 'Летуны', boss: 'Владыка'
  };

  function allowedTypes(wave) {
    var t = ['slime'];
    if (wave >= 2) t.push('runner');
    if (wave >= 3) t.push('swarm');
    if (wave >= 4) t.push('brute');
    if (wave >= 5) t.push('flyer');
    if (wave >= 7) t.push('shield');
    return t;
  }

  function typeWeight(type, wave) {
    switch (type) {
      case 'slime': return Math.max(1.5, 5 - wave * 0.15);
      case 'runner': return 3.0;
      case 'swarm': return wave >= 8 ? 2.0 : 3.0;
      case 'brute': return 1.4 + wave * 0.05;
      case 'flyer': return 1.8 + wave * 0.03;
      case 'shield': return 1.2 + wave * 0.04;
      default: return 1;
    }
  }

  function pickType(rand, types, wave) {
    var total = 0;
    var i;
    for (i = 0; i < types.length; i++) total += typeWeight(types[i], wave);
    var roll = rand() * total;
    for (i = 0; i < types.length; i++) {
      roll -= typeWeight(types[i], wave);
      if (roll <= 0) return types[i];
    }
    return types[types.length - 1];
  }

  function maxCount(type) {
    if (type === 'brute') return 7;
    if (type === 'shield') return 6;
    if (type === 'boss') return 1;
    return 20;
  }

  function buildWave(levelIndex, wave) {
    var seed = TD.hash('pd:lvl' + levelIndex + ':wave' + wave + ':v2');
    var rand = TD.rng(seed);

    var isBoss = (wave === Math.ceil(TD.Config.waveCount / 2) || wave === TD.Config.waveCount);
    var budget = 8 + wave * 4.2 + levelIndex * 1.2;
    if (isBoss) budget *= 0.65;

    /* Ранние волны короткие: иначе на сложных картах новичок не успевает
       построить оборону. Дальше ограничение не мешает. */
    var cap = isBoss ? 100 : (wave <= 2 ? 8 : (wave <= 3 ? 11 : (wave <= 4 ? 14 : 140)));

    var groupCount = TD.clamp(2 + Math.floor(wave / 4), 2, 4);
    var types = allowedTypes(wave);
    var groups = [];
    var spawns = [];

    var shares = [];
    var shareSum = 0;
    var g;
    for (g = 0; g < groupCount; g++) {
      var share = 0.6 + rand() * 1.1;
      shares.push(share);
      shareSum += share;
    }

    var cursor = 0;
    for (g = 0; g < groupCount; g++) {
      var capacity = cap - spawns.length;
      if (capacity <= 0) break;
      var type = pickType(rand, types, wave);
      var groupBudget = budget * shares[g] / shareSum;
      var count = Math.round(groupBudget / UNIT_COST[type]);
      count = TD.clamp(count, 1, maxCount(type));
      count = Math.min(count, capacity);
      var interval = INTERVAL[type] * (0.85 + rand() * 0.3);
      var start = cursor + (g === 0 ? 0.4 : 1.4 + rand() * 1.4);
      cursor = start + (count - 1) * interval;
      groups.push({ type: type, count: count, interval: +interval.toFixed(2), start: +start.toFixed(2) });
      for (var i = 0; i < count; i++) {
        spawns.push({ t: +(start + i * interval).toFixed(2), type: type });
      }
    }

    if (isBoss) {
      var bossDelay = Math.max(6, cursor + 2);
      spawns.push({ t: +bossDelay.toFixed(2), type: 'boss' });
      groups.push({ type: 'boss', count: 1, interval: 1, start: +bossDelay.toFixed(2) });
    }

    spawns.sort(function (a, b) { return a.t - b.t; });

    return {
      number: wave,
      seed: seed,
      levelIndex: levelIndex,
      boss: isBoss,
      groups: groups,
      spawns: spawns,
      total: spawns.length,
      duration: spawns.length ? spawns[spawns.length - 1].t : 0,
      reward: TD.Config.waveRewardBase + TD.Config.waveRewardPerWave * wave,
      label: isBoss ? 'БОСС — ' + LABELS.boss : LABELS[groups[0].type]
    };
  }

  /** Все волны уровня (по умолчанию TD.Config.waveCount). */
  TD.buildWaves = function (levelIndex, count) {
    var n = count || TD.Config.waveCount;
    var out = [];
    for (var w = 1; w <= n; w++) out.push(buildWave(levelIndex || 0, w));
    return out;
  };

  TD.buildWave = buildWave;
  TD.waveLabels = LABELS;
  TD.waveUnitCost = UNIT_COST;
})(typeof globalThis !== 'undefined' ? globalThis : this);
