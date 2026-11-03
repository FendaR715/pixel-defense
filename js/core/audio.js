/* Пиксельная Оборона — звук.
   Никаких аудиофайлов: всё синтезируется на WebAudio по требованию.
   Контекст создаётся только после жеста пользователя (политика браузеров). */
(function (root) {
  'use strict';

  var TD = root.TD = root.TD || {};

  var ctx = null;
  var master = null;
  var enabled = true;

  function audioContextClass() {
    return root.AudioContext || root.webkitAudioContext || null;
  }

  /** Создать контекст (или вернуть готовый). */
  function ensure() {
    if (ctx) return ctx;
    var AC = audioContextClass();
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
      master = null;
    }
    return ctx;
  }

  /** Разбудить/возобновить звук — вызывать по первому клику. */
  function unlock() {
    var c = ensure();
    if (c && c.state === 'suspended' && typeof c.resume === 'function') {
      try { c.resume(); } catch (e) { /* игнорируем */ }
    }
    return !!c;
  }

  function setEnabled(on) {
    enabled = !!on;
    if (master && ctx) {
      try {
        master.gain.setTargetAtTime(enabled ? 0.22 : 0, ctx.currentTime, 0.02);
      } catch (e) { /* игнорируем */ }
    }
  }

  function isEnabled() {
    return enabled;
  }

  /** Одиночный тон с огибающей. */
  function tone(freq, dur, opts) {
    var c = ensure();
    if (!c || !enabled) return;
    opts = opts || {};
    var t0 = c.currentTime + (opts.delay || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = opts.type || 'square';
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (opts.to) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + dur);
    }
    var vol = (opts.volume == null ? 0.3 : opts.volume);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Всплеск шума — выстрелы, взрывы, удары. */
  function noise(dur, opts) {
    var c = ensure();
    if (!c || !enabled) return;
    opts = opts || {};
    var t0 = c.currentTime + (opts.delay || 0);
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf;
    try {
      buf = c.createBuffer(1, len, c.sampleRate);
    } catch (e) {
      return;
    }
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    var src = c.createBufferSource();
    src.buffer = buf;
    var filter = c.createBiquadFilter();
    filter.type = opts.filter || 'lowpass';
    filter.frequency.value = opts.freq || 1200;
    var gain = c.createGain();
    var vol = (opts.volume == null ? 0.25 : opts.volume);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  var sounds = {
    click: function () { tone(660, 0.05, { type: 'square', volume: 0.16 }); },
    shoot: function () { tone(900, 0.06, { to: 420, type: 'square', volume: 0.14 }); },
    cannon: function () {
      tone(130, 0.22, { to: 50, type: 'triangle', volume: 0.45 });
      noise(0.16, { freq: 700, volume: 0.22 });
    },
    frost: function () { tone(1400, 0.16, { to: 620, type: 'sine', volume: 0.18 }); },
    tesla: function () {
      tone(1800, 0.1, { to: 240, type: 'sawtooth', volume: 0.16 });
      noise(0.08, { filter: 'highpass', freq: 2400, volume: 0.12 });
    },
    sniper: function () {
      tone(220, 0.09, { to: 60, type: 'square', volume: 0.32 });
      noise(0.14, { filter: 'highpass', freq: 1500, volume: 0.16 });
    },
    hit: function () { noise(0.05, { freq: 2600, volume: 0.1 }); },
    kill: function () { tone(520, 0.08, { to: 820, type: 'triangle', volume: 0.18 }); },
    explode: function () {
      noise(0.3, { freq: 500, volume: 0.35 });
      tone(90, 0.3, { to: 35, type: 'triangle', volume: 0.4 });
    },
    build: function () {
      tone(300, 0.07, { type: 'square', volume: 0.2 });
      tone(460, 0.09, { type: 'square', volume: 0.2, delay: 0.07 });
    },
    upgrade: function () {
      tone(440, 0.07, { type: 'square', volume: 0.18 });
      tone(660, 0.07, { type: 'square', volume: 0.18, delay: 0.06 });
      tone(880, 0.1, { type: 'square', volume: 0.18, delay: 0.12 });
    },
    sell: function () {
      tone(620, 0.08, { to: 320, type: 'square', volume: 0.18 });
      tone(320, 0.1, { to: 180, type: 'square', volume: 0.14, delay: 0.08 });
    },
    wave: function () {
      tone(330, 0.12, { type: 'square', volume: 0.2 });
      tone(494, 0.18, { type: 'square', volume: 0.2, delay: 0.12 });
    },
    leak: function () {
      tone(200, 0.3, { to: 90, type: 'sawtooth', volume: 0.3 });
    },
    error: function () {
      tone(180, 0.14, { to: 120, type: 'square', volume: 0.22 });
    },
    win: function () {
      [523, 659, 784, 1046].forEach(function (f, i) {
        tone(f, 0.22, { type: 'square', volume: 0.2, delay: i * 0.14 });
      });
    },
    lose: function () {
      [440, 349, 262, 196].forEach(function (f, i) {
        tone(f, 0.28, { type: 'triangle', volume: 0.25, delay: i * 0.18 });
      });
    }
  };

  function play(name) {
    if (!enabled) return;
    if (!ensure()) return;
    var fn = sounds[name];
    if (fn) {
      try { fn(); } catch (e) { /* звук не критичен */ }
    }
  }

  TD.Audio = {
    unlock: unlock,
    play: play,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    sounds: sounds
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
