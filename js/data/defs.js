/* Пиксельная Оборона — таблицы баланса: конфигурация, башни, враги. */
(function (root) {
  'use strict';

  var TD = root.TD = root.TD || {};

  TD.Config = {
    cols: 24,
    rows: 15,
    cell: 48,
    width: 1152,
    height: 720,

    startGold: 450,
    startLives: 20,
    waveCount: 20,

    /* Фиксированные площадки под башни: ограничивают спам и держат баланс. */
    buildSpots: 15,

    maxTowerLevel: 3,
    upgradeDamage: 0.25,
    upgradeRange: 0.10,
    upgradeCostRate: 0.8,
    sellRate: 0.6,

    hpScalePerWave: 0.10,
    hpScalePerLevel: 0.10,

    earlyBonusBase: 10,
    earlyBonusPerWave: 2,
    waveRewardBase: 30,
    waveRewardPerWave: 7,

    maxSpeed: 3,
    maxDt: 0.1
  };

  /* Башни. range — в клетках, rate — выстрелов в секунду. */
  TD.TowerDefs = [
    {
      id: 'arrow',
      name: 'Стрелок',
      sprite: 'tower_arrow',
      price: 50,
      damage: 8,
      range: 3.2,
      rate: 1.6,
      attack: 'projectile',
      projSpeed: 14,
      air: true,
      color: '#3ddc97',
      towerTint: null,
      desc: 'Быстрые одиночные выстрелы. Бьёт и по земле, и по воздуху.',
      hotkey: '1'
    },
    {
      id: 'cannon',
      name: 'Пушка',
      sprite: 'tower_cannon',
      price: 90,
      damage: 22,
      range: 3.0,
      rate: 0.7,
      attack: 'splash',
      splash: 1.2,
      projSpeed: 8,
      air: false,
      color: '#f2c14e',
      towerTint: 'hue-rotate(-35deg) saturate(1.15) brightness(1.05)',
      desc: 'Снаряд с осколочным взрывом. Только по наземным целям.',
      hotkey: '2'
    },
    {
      id: 'frost',
      name: 'Криомант',
      sprite: 'tower_frost',
      price: 70,
      damage: 3,
      range: 2.6,
      rate: 1.2,
      attack: 'slow',
      slowFactor: 0.6,
      slowDuration: 1.5,
      projSpeed: 11,
      air: true,
      color: '#4cc9f0',
      towerTint: 'hue-rotate(150deg) saturate(1.2)',
      desc: 'Морозит цель: скорость падает на 40% на 1.5 с.',
      hotkey: '3'
    },
    {
      id: 'tesla',
      name: 'Тесла',
      sprite: 'tower_tesla',
      price: 130,
      damage: 12,
      range: 2.8,
      rate: 1.0,
      attack: 'chain',
      chain: 3,
      chainFalloff: 0.7,
      chainRange: 2.2,
      air: true,
      color: '#a9f0ff',
      towerTint: 'hue-rotate(235deg) saturate(1.3)',
      desc: 'Молния перескакивает на 3 цели, каждая следующая слабее.',
      hotkey: '4'
    },
    {
      id: 'sniper',
      name: 'Снайпер',
      sprite: 'tower_sniper',
      price: 160,
      damage: 90,
      range: 7.0,
      rate: 0.45,
      attack: 'beam',
      pierceArmor: true,
      air: true,
      color: '#3ddc97',
      towerTint: 'hue-rotate(75deg) saturate(0.85) brightness(0.92)',
      desc: 'Дальний точный выстрел, игнорирует броню. Идеален против боссов.',
      hotkey: '5'
    }
  ];

  TD.TowerById = {};
  TD.TowerDefs.forEach(function (t) { TD.TowerById[t.id] = t; });

  /* Враги. speed — клеток в секунду. */
  TD.EnemyDefs = {
    slime: {
      id: 'slime', name: 'Слизень', sprite: 'enemy_slime',
      hp: 40, speed: 1.1, armor: 0, gold: 4, points: 10, lives: 1,
      color: '#8ee04f',
      anim: 'e1', animScale: 2.6,
      desc: 'Базовый враг: медленный, но идёт толпой.'
    },
    runner: {
      id: 'runner', name: 'Бегун', sprite: 'enemy_runner',
      hp: 25, speed: 2.2, armor: 0, gold: 5, points: 12, lives: 1,
      color: '#ff6b5e',
      anim: 'e3', animScale: 2.0,
      desc: 'Быстрый и хрупкий — проскакивает мимо башен.'
    },
    swarm: {
      id: 'swarm', name: 'Роевик', sprite: 'enemy_swarm',
      hp: 15, speed: 1.6, armor: 0, gold: 2, points: 5, lives: 1,
      color: '#a94cff',
      anim: 'e1', animScale: 1.5, animTint: 'hue-rotate(240deg) saturate(1.5)',
      desc: 'Мелкие и дешёвые, атакуют роем.'
    },
    brute: {
      id: 'brute', name: 'Громила', sprite: 'enemy_brute',
      hp: 160, speed: 0.8, armor: 2, gold: 12, points: 30, lives: 1,
      color: '#e09a5a',
      anim: 'e2', animScale: 2.2,
      desc: 'Танк: много здоровья и брони, но медленный.'
    },
    shield: {
      id: 'shield', name: 'Щитоносец', sprite: 'enemy_shield',
      hp: 120, speed: 0.9, armor: 6, gold: 14, points: 35, lives: 1,
      color: '#72b8ff',
      anim: 'e2', animScale: 1.95, animTint: 'hue-rotate(165deg) saturate(1.15)', shield: true,
      desc: 'Стальной щит: высокая броня. Снайпер её игнорирует.'
    },
    flyer: {
      id: 'flyer', name: 'Летун', sprite: 'enemy_flyer',
      hp: 60, speed: 1.4, armor: 0, gold: 8, points: 20, lives: 1,
      flying: true,
      color: '#7fe3ff',
      anim: 'e4', animScale: 2.1,
      desc: 'Летит по прямой к сердцу, игнорируя лабиринт.'
    },
    boss: {
      id: 'boss', name: 'Владыка', sprite: 'enemy_boss',
      hp: 1500, speed: 0.6, armor: 5, gold: 120, points: 400, lives: 5,
      boss: true,
      color: '#ff5f74',
      anim: 'e2', animScale: 3.2, animTint: 'hue-rotate(-25deg) saturate(1.4) brightness(0.95)', crown: true,
      desc: 'Владыка: огромный запас HP. При смерти делится на трёх громил.'
    }
  };

  /** Враги, на которых может смотреть башня с флагом air=false. */
  TD.canTarget = function (towerDef, enemy) {
    if (!towerDef || !enemy) return false;
    if (!towerDef.air && enemy.def && enemy.def.flying) return false;
    return true;
  };

  /** Урон с учётом брони: не ниже 1, снайпер броню игнорирует. */
  TD.computeDamage = function (amount, armor, pierceArmor) {
    var dmg = amount;
    if (!pierceArmor) {
      dmg = amount - (armor || 0);
      if (dmg < 1) dmg = 1;
    }
    if (!isFinite(dmg) || dmg < 0) dmg = 0;
    return dmg;
  };

  /** Сила башни с учётом уровня (1..3). */
  TD.towerStats = function (def, level) {
    var lv = TD.clamp(level || 1, 1, TD.Config.maxTowerLevel);
    var dmgMul = 1 + TD.Config.upgradeDamage * (lv - 1);
    var rangeMul = 1 + TD.Config.upgradeRange * (lv - 1);
    return {
      damage: def.damage * dmgMul,
      range: def.range * rangeMul,
      rate: def.rate,
      level: lv,
      cost: TD.towerUpgradeCost(def, lv)
    };
  };

  /** Цена улучшения с уровня level до level+1. */
  TD.towerUpgradeCost = function (def, level) {
    if (level >= TD.Config.maxTowerLevel) return null;
    return Math.round(def.price * TD.Config.upgradeCostRate * level);
  };

  /** Сколько золота вернётся при продаже. */
  TD.towerSellValue = function (invested) {
    return Math.floor(invested * TD.Config.sellRate);
  };

  /** Множитель HP врага на волне и уровне. */
  TD.enemyHpScale = function (wave, levelIndex) {
    var byWave = 1 + TD.Config.hpScalePerWave * (Math.max(1, wave) - 1);
    var byLevel = 1 + TD.Config.hpScalePerLevel * (levelIndex || 0);
    return byWave * byLevel;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
