'use strict';
/**
 * Shared helpers for the browser tests.
 *
 * The game's frame loop is taken over (requestAnimationFrame stubbed, `drive()` calls
 * `app.loop` with synthetic timestamps) so tests are fast and deterministic.
 */
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  throw new Error('Browser tests need Playwright: run `npm install` and `npx playwright install chromium`.\n' + e.message);
}

const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');

exports.launch = () => chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,   // optional: use a system Chromium
  args: ['--no-sandbox']
});

/** Open the game in a fresh context. Returns { page, errors, close }. */
exports.openGame = async (browser, options = {}) => {
  const { viewport = { width: 1280, height: 800 }, ...contextOptions } = options;
  const context = await browser.newContext({ viewport, ...contextOptions });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(GAME);
  // `app` is a top-level const: a global binding, but not a property of window.
  await page.waitForFunction(() => typeof app === 'object');
  await page.evaluate(installHarness);
  return { page, errors, close: () => context.close() };
};

/** Runs inside the page. */
function installHarness() {
  window.__ts = performance.now();
  window.requestAnimationFrame = () => 0;

  /** Advance the game `secs` of real time at 60 fps; stop early when `stopWhen()` is true. */
  window.drive = (secs, dt = 1 / 60, stopWhen) => {
    const n = Math.round(secs / dt);
    for (let i = 0; i < n; i++) {
      window.__ts += dt * 1000;
      app.loop(window.__ts);
      if (stopWhen && stopWhen()) return i * dt;
    }
    return secs;
  };

  /**
   * Load a level and lay a Warren truss: a 2 m roadway along the deck, with apex joints
   * `depth` metres above (dir -1) or below (dir +1) it. `chord` is the apex-to-apex material
   * and `diag` the deck-to-apex one.
   */
  window.buildTruss = (levelIdx, { depth = 3, chord = 'steel', diag = 'steel', dir = -1 } = {}) => {
    app.loadLevel(levelIdx); app.closeModal(); if (app.coach) app.endCoach();
    const t = app.level.terrain, g = t.groundY, seg = 2;
    const node = (x, y) => app.findNearestNode(x, y, 0.05) || app.createNode(x, y, false);
    const xs = [];
    for (let x = t.leftBank; x < t.rightBank + 0.001; x += seg) xs.push(x);
    for (let i = 0; i < xs.length - 1; i++) app.createMember(node(xs[i], g), node(xs[i + 1], g), 'road');
    const tops = xs.slice(0, -1).map((x) => node(x + seg / 2, g + dir * depth));
    tops.forEach((tp, i) => {
      app.createMember(node(xs[i], g), tp, diag);
      app.createMember(tp, node(xs[i + 1], g), diag);
      if (i) app.createMember(tops[i - 1], tp, chord);
    });
    app.updateBudget(); app.markDirty();
  };

  /** Run the load test to its end (or `maxSecs`) and summarise it. */
  window.runTest = (maxSecs = 45) => {
    app.startSimulation();
    drive(maxSecs, 1 / 60, () => app.resultShown);
    const v = app.vehicle;
    const out = {
      won: !!v.escaped,
      shown: app.resultShown,
      peak: +app.maxStressObserved.toFixed(3),
      sag: +(app.maxSag || 0).toFixed(3),
      failure: app.firstFailure ? app.firstFailure.type : null,
      broken: app.brokenCount,
      elapsed: +app.testElapsed.toFixed(1)
    };
    app.stopSimulation(); app.closeModal();
    return out;
  };
}
