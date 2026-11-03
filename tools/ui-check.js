/* Пиксельная Оборона — проверка интерфейса в настоящем браузере (Chrome/Edge).
   Запуск: node tools/ui-check.js
   Управляет headless-браузером через DevTools Protocol, кликает по элементам
   и падает при любой ошибке в консоли. Требует установленный Chrome или Edge. */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];

function findBrowser() {
  for (const p of CHROME_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = findBrowser();
  if (!browser) {
    console.error('Chrome/Edge не найден — проверка интерфейса пропущена');
    process.exit(2);
  }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'td-ui-'));
  const port = 9333;
  const child = spawn(browser, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    '--window-size=1400,900',
    PAGE
  ], { stdio: 'ignore' });

  const cleanup = () => {
    try { child.kill(); } catch (e) { /* ignore */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });

  let targets = null;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/list');
      const list = await res.json();
      targets = list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (targets.length) break;
    } catch (e) { /* браузер ещё стартует */ }
  }
  if (!targets || !targets.length) {
    console.error('Не удалось подключиться к браузеру');
    cleanup();
    process.exit(1);
  }

  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  const errors = [];
  const logs = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push('Exception: ' + (d.exception && d.exception.description ? d.exception.description : d.text));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push('console.error: ' + msg.params.args.map((a) => a.value || a.description || '').join(' '));
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push('Log: ' + msg.params.entry.text);
    }
  };

  const send = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  await send('Runtime.enable');
  await send('Log.enable');

  async function evalJS(expression) {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true
    });
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error('Eval error: ' + (d.exception && d.exception.description ? d.exception.description : d.text));
    }
    return res.result ? res.result.value : undefined;
  }

  let failures = 0;
  const checks = [];
  function check(name, cond, extra) {
    if (cond) {
      checks.push('  ok  ' + name);
    } else {
      failures += 1;
      checks.push('FAIL  ' + name + (extra ? ' — ' + extra : ''));
    }
  }

  /* ждём загрузку игры */
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await sleep(150);
    try {
      ready = await evalJS("document.readyState === 'complete' && !!(window.TD && TD.UI && TD.Game)");
      if (ready) break;
    } catch (e) { /* страница ещё грузится */ }
  }
  check('страница загрузилась, TD.UI на месте', ready);

  check('меню показано', await evalJS("!document.getElementById('screen-menu').classList.contains('hidden')"));

  /* старт игры через меню */
  await evalJS("document.querySelector('[data-action=\"play\"]').click()");
  await sleep(400);
  check('игра началась после кнопки «Играть»', await evalJS('!!TD.UI.getGame()'));
  check('экран меню скрыт', await evalJS("document.getElementById('screen-menu').classList.contains('hidden')"));
  check('стартовое золото 250', await evalJS('TD.UI.getGame().gold') === 250);

  /* хоткей 1 — выбор башни */
  await evalJS("document.dispatchEvent(new KeyboardEvent('keydown', {key:'1', bubbles:true}))");
  check('клавиша 1 выбрала стрелка', await evalJS('TD.UI.getGame().buildType') === 'arrow');

  /* клик по пустой клетке строит башню */
  const placed = await evalJS(`(function () {
    var g = TD.UI.getGame();
    var spot = null;
    for (var r = 0; r < g.grid.rows && !spot; r++) {
      for (var c = 0; c < g.grid.cols; c++) {
        if (g.grid.buildable(c, r) && g.grid.canPlace(c, r)) { spot = {c:c, r:r}; break; }
      }
    }
    if (!spot) return null;
    var cv = document.getElementById('game');
    var rect = cv.getBoundingClientRect();
    var x = rect.left + (spot.c + 0.5) * (rect.width / g.grid.cols);
    var y = rect.top + (spot.r + 0.5) * (rect.height / g.grid.rows);
    cv.dispatchEvent(new MouseEvent('mousemove', {clientX:x, clientY:y, bubbles:true}));
    cv.dispatchEvent(new MouseEvent('click', {clientX:x, clientY:y, bubbles:true}));
    return spot;
  })()`);
  await sleep(250);
  check('клик по canvas построил башню', await evalJS('TD.UI.getGame().towers.length') === 1, JSON.stringify(placed));
  check('золото списалось до 200', await evalJS('TD.UI.getGame().gold') === 200);
  check('инспектор показан', await evalJS("!document.getElementById('inspector').classList.contains('hidden')"));
  check('название в инспекторе — Стрелок', (await evalJS("document.getElementById('insp-title').textContent")).indexOf('Стрелок') === 0);

  /* улучшение и продажа */
  await evalJS("document.getElementById('insp-upgrade').click()");
  await sleep(120);
  check('улучшение до 2 уровня', await evalJS('TD.UI.getGame().selected.level') === 2);
  await evalJS("document.getElementById('insp-sell').click()");
  await sleep(120);
  check('продажа убрала башню', await evalJS('TD.UI.getGame().towers.length') === 0);

  /* запуск волны и скорость */
  await evalJS("document.dispatchEvent(new KeyboardEvent('keydown', {key:'n', bubbles:true}))");
  await sleep(200);
  check('волна запустилась по N', await evalJS('TD.UI.getGame().state') === 'wave');
  check('кнопки волны заблокированы во время боя', await evalJS("document.getElementById('btn-next').disabled") === true);

  await evalJS("document.querySelector('[data-speed=\"3\"]').click()");
  check('скорость 3× включилась', await evalJS('TD.UI.getGame().speed') === 3);

  /* пауза и продолжение */
  await evalJS("document.getElementById('btn-pause').click()");
  await sleep(150);
  check('пауза сработала', await evalJS('TD.UI.getGame().paused') === true);
  check('экран паузы показан', await evalJS("!document.getElementById('screen-pause').classList.contains('hidden')"));
  await evalJS("document.getElementById('btn-resume').click()");
  await sleep(150);
  check('продолжение сняло паузу', await evalJS('TD.UI.getGame().paused') === false);

  /* переключатель пути */
  await evalJS("document.getElementById('opt-path').click()");
  check('показ пути включился', await evalJS('TD.UI.getGame().showPath') === true);

  /* сохранение */
  const saved = await evalJS(`(function () {
    TD.Save.record({levelIndex: 0, score: 9999, wave: 20, win: false});
    var d = TD.Save.load();
    var value = d.best['0'] && d.best['0'].score;
    TD.Save.reset();
    return value;
  })()`);
  check('сохранение записывает рекорд', saved === 9999, 'получено ' + saved);

  /* поражение и кнопка «Заново» */
  await evalJS(`(function () {
    var g = TD.UI.getGame();
    g.lives = 1;
    var e = g.spawnEnemy('slime');
    g.leakEnemy(e);
    return g.result;
  })()`);
  await sleep(400);
  check('поражение показало экран результата', await evalJS("!document.getElementById('screen-result').classList.contains('hidden')"));
  check('результат записан в сохранение', await evalJS('!!TD.Save.best(0)') === true);
  await evalJS("document.getElementById('btn-retry').click()");
  await sleep(400);
  check('кнопка «Заново» перезапускает уровень', await evalJS('!TD.UI.getGame().finished && TD.UI.getGame().lives === 20'));
  await evalJS('TD.Save.reset()');

  /* ошибки консоли */
  await sleep(1000);
  check('нет ошибок в консоли', errors.length === 0, errors.join(' | '));

  console.log(checks.join('\n'));
  console.log('');
  if (failures) {
    console.log('Провалено проверок: ' + failures);
    if (errors.length) console.log(errors.join('\n'));
    cleanup();
    process.exit(1);
  }
  console.log('Проверка интерфейса пройдена: ' + checks.length + ' проверок');
  cleanup();
  process.exit(0);
}

main().catch((err) => {
  console.error('Ошибка проверки интерфейса:', err);
  process.exit(1);
});
