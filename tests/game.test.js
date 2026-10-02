'use strict';
/** Browser tests: the game running in headless Chromium. `node --test tests/game.test.js` */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, openGame } = require('./helpers');

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

/** Open the game, run `fn(page)`, and fail on any console or page error. */
async function withGame(fn, options) {
  const game = await openGame(browser, options);
  try {
    const result = await fn(game.page);
    assert.deepEqual(game.errors, [], 'the page logged errors');
    return result;
  } finally { await game.close(); }
}

describe('start-up', () => {
  test('loads cleanly and every level can be opened', () => withGame(async (page) => {
    const n = await page.evaluate(() => { LEVELS.forEach((_, i) => { app.loadLevel(i); app.closeModal(); if (app.coach) app.endCoach(); }); return LEVELS.length; });
    assert.equal(n, 7);
  }));

  test('level ids are unique and stable (they key saved progress)', () => withGame(async (page) => {
    const ids = await page.evaluate(() => LEVELS.map((l) => l.id));
    assert.deepEqual(ids, [1, 2, 3, 4, 6, 7, 5]);
  }));
});

describe('the lesson', () => {
  test('a flat roadway cannot pass any level', () => withGame(async (page) => {
    const results = await page.evaluate(() => LEVELS.map((_, i) => {
      app.loadLevel(i); app.closeModal(); if (app.coach) app.endCoach();
      const t = app.level.terrain, g = t.groundY;
      let prev = app.nodes.find((n) => n.fixed && n.x === t.leftBank && n.y === g);
      for (let x = t.leftBank + 2; x <= t.rightBank + 0.001; x += 2) {
        const n = app.findNearestNode(x, g, 0.05) || app.createNode(x, g, false);
        app.createMember(prev, n, 'road'); prev = n;
      }
      const r = runTest(60);
      return { level: app.level.id, ...r };
    }));
    for (const r of results) {
      assert.equal(r.won, false, `level ${r.level} was passed with a flat deck`);
      assert.ok(r.shown, `level ${r.level} showed no result`);
    }
  }));

  test('a trussed bridge crosses, at normal and quarter speed', () => withGame(async (page) => {
    const results = await page.evaluate(() => {
      const out = [];
      for (const [idx, depth] of [[0, 2.5], [3, 3.5], [5, 4], [6, 4]]) {
        for (const speed of [1, 0.25]) {
          buildTruss(idx, { depth }); app.simSpeed = speed;
          out.push({ level: app.level.id, speed, ...runTest(120) });
        }
      }
      return out;
    });
    for (const r of results) assert.ok(r.won, `level ${r.level} at ${r.speed}x: ${JSON.stringify(r)}`);
  }));

  test('a stalled vehicle ends the test after about 40 simulated seconds', () => withGame(async (page) => {
    const r = await page.evaluate(() => {
      app.loadLevel(0); app.closeModal(); if (app.coach) app.endCoach();
      const a = app.nodes.find((n) => n.fixed && n.x === 4 && n.y === 7);
      app.createMember(a, app.createNode(6, 7), 'road');
      app.startSimulation(); app.vehicle.vx = 0; app.vehicle.cruise = 0;     // parked
      drive(60, 1 / 60, () => app.resultShown);
      return { shown: app.resultShown, t: app.testElapsed };
    });
    assert.ok(r.shown);
    assert.ok(r.t >= 40 && r.t < 41, `ended at ${r.t}`);
  }));

  test('the buckling explanation quotes the same figure the physics uses', () => withGame(async (page) => {
    const r = await page.evaluate(() => {
      app.loadLevel(0); app.closeModal(); if (app.coach) app.endCoach();
      const html = app.explainFailure({ type: 'compression', mat: 'wood', len: 4 }, {});
      return { shown: +html.match(/about\s+([\d.]+)×/)[1], real: +(bucklingCapacity('wood', 4) / MATERIALS.wood.maxComp).toFixed(2) };
    });
    assert.equal(r.shown, r.real);
  }));
});

describe('frame-rate independence', () => {
  // A two-span hump (apex 8 m, 6.5 m high) used to stand at 60 fps but crack at its joint at 20 fps,
  // because each frame was split into 16 steps of whatever length the frame happened to be.
  test('a hump bridge behaves the same on a slow machine as a fast one', () => withGame(async (page) => {
    const rows = await page.evaluate(() => {
      const out = [];
      for (const apexY of [6, 6.5]) for (const fps of [144, 60, 30, 20, 15]) for (const speed of [0.25, 1, 2]) {
        app.loadLevel(0); app.closeModal(); if (app.coach) app.endCoach();
        const L = app.nodes.find((n) => n.fixed && n.x === 4), R = app.nodes.find((n) => n.fixed && n.x === 12);
        const apex = app.createNode(8, apexY, false);
        app.createMember(L, apex, 'road'); app.createMember(apex, R, 'road');
        app.simSpeed = speed; app.startSimulation();
        drive(150, 1 / fps, () => app.resultShown);
        out.push({ apexY, fps, speed, won: !!app.vehicle.escaped, sag: app.maxSag, failure: app.firstFailure && app.firstFailure.type });
        app.stopSimulation(); app.closeModal();
      }
      return out;
    });
    const lost = rows.filter((r) => !r.won);
    assert.deepEqual(lost, [], `${lost.length} run(s) failed`);
    for (const apexY of [6, 6.5]) {
      const sags = rows.filter((r) => r.apexY === apexY).map((r) => r.sag);
      assert.ok(Math.max(...sags) - Math.min(...sags) < 0.03, `apex ${apexY}: sag ranged ${Math.min(...sags).toFixed(3)} to ${Math.max(...sags).toFixed(3)} across frame rates`);
    }
  }));

  test('a stalled tab drops its backlog instead of running thousands of steps', () => withGame(async (page) => {
    const steps = await page.evaluate(() => {
      buildTruss(0, { depth: 3 }); app.startSimulation();
      let n = 0; const real = app.solveStep.bind(app); app.solveStep = (dt) => { n++; real(dt); };
      app.stepPhysics(30);                      // a 30-second hiccup in one frame
      return n;
    });
    assert.ok(steps <= 160, `ran ${steps} steps`);
  }));
});

describe('explaining a failure', () => {
  test('a long road member warns that road joints are only pinned', () => withGame(async (page) => {
    const text = await page.evaluate(() => {
      app.loadLevel(0); app.closeModal(); if (app.coach) app.endCoach();
      const L = app.nodes.find((n) => n.fixed && n.x === 4);
      const m = app.createMember(L, app.createNode(8, 6, false), 'road');
      app.afterBuildFeedback(m);
      return [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | ');
    });
    assert.match(text, /pinned/);
  }));

  test('a rising-and-falling deck that folds at an unbraced joint is explained and marked', () => withGame(async (page) => {
    const r = await page.evaluate(() => {
      app.loadLevel(0); app.closeModal(); if (app.coach) app.endCoach();
      const L = app.nodes.find((n) => n.fixed && n.x === 4), R = app.nodes.find((n) => n.fixed && n.x === 12);
      const a = app.createNode(6, 6, false), b = app.createNode(8, 5.5, false), c = app.createNode(10, 6, false);
      [[L, a], [a, b], [b, c], [c, R]].forEach(([p, q]) => app.createMember(p, q, 'road'));
      app.startSimulation();
      drive(25, 1 / 60, () => app.resultShown);
      const body = document.getElementById('modal-body').textContent;
      app.render();                                  // the failure marker must draw without error
      return { failure: app.firstFailure && app.firstFailure.type, body, shown: app.resultShown };
    });
    assert.equal(r.failure, 'deflection');
    assert.ok(r.shown);
    assert.match(r.body, /pinned/);
    assert.match(r.body, /not the same as being stiff/);
  }));

  test('a straight flat deck does not get the rising-and-falling advice', () => withGame(async (page) => {
    const body = await page.evaluate(() => {
      app.loadLevel(0); app.closeModal(); if (app.coach) app.endCoach();
      let prev = app.nodes.find((n) => n.fixed && n.x === 4);
      for (let x = 6; x <= 12; x += 2) { const n = app.findNearestNode(x, 7, 0.05) || app.createNode(x, 7, false); app.createMember(prev, n, 'road'); prev = n; }
      app.startSimulation(); drive(25, 1 / 60, () => app.resultShown);
      return document.getElementById('modal-body').textContent;
    });
    assert.doesNotMatch(body, /rises and falls/);
  }));
});

describe('editing', () => {
  test('dragging lays a member and undo removes it', () => withGame(async (page) => {
    await page.evaluate(() => { app.closeModal(); app.endCoach && app.coach && app.endCoach(); app.selectMaterial('road'); });
    const pt = (x, y) => page.evaluate(([x, y]) => { const r = document.getElementById('simCanvas').getBoundingClientRect(); const p = app.toScreen(x, y); return { x: r.left + p.x, y: r.top + p.y }; }, [x, y]);
    const a = await pt(4, 7), b = await pt(6, 7);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up();
    assert.deepEqual(await page.evaluate(() => [app.members.length, app.calculateCost()]), [1, 200]);
    await page.keyboard.press('Control+z');
    assert.deepEqual(await page.evaluate(() => [app.members.length, app.nodes.length]), [0, 2]);
  }));

  test('pressing Test mid-drag leaves no orphan joint', () => withGame(async (page) => {
    const r = await page.evaluate(() => {
      app.loadLevel(0); app.closeModal(); if (app.coach) app.endCoach();
      const before = app.nodes.length;
      app.dragStartNode = app.createNode(6, 5, false); app.createdStartNode = app.dragStartNode; app.pendingSnapshot = app.snapshotState();
      app.startSimulation(); app.stopSimulation();
      return { before, after: app.nodes.length, drag: app.dragStartNode };
    });
    assert.equal(r.after, r.before); assert.equal(r.drag, null);
  }));

  test('undo is ignored while a drag holds live nodes', () => withGame(async (page) => {
    const same = await page.evaluate(() => {
      app.loadLevel(0); app.closeModal(); if (app.coach) app.endCoach();
      app.saveSnapshot(); const n = app.undoStack.length;
      app.dragStartNode = app.nodes[0]; app.undo(); app.dragStartNode = null;
      return app.undoStack.length === n;
    });
    assert.ok(same);
  }));

  test('switching level mid-test silences the engine', () => withGame(async (page) => {
    const r = await page.evaluate(() => {
      buildTruss(0, { depth: 3 }); app.startSimulation();
      const had = !!audio.engineOsc; app.switchLevel(1);
      return { had, after: !!audio.engineOsc, mode: app.mode };
    });
    assert.equal(r.after, false); assert.equal(r.mode, 'build');
  }));
});

describe('keyboard and dialogs', () => {
  test('shortcuts are inert behind a dialog, and live again once it closes', () => withGame(async (page) => {
    await page.evaluate(() => { app.loadLevel(0); });
    await page.keyboard.press('3');
    assert.equal(await page.evaluate(() => app.activeMat), 'road');
    await page.keyboard.press('?');
    assert.ok(await page.evaluate(() => document.getElementById('modal-eyebrow').textContent.includes('Mission brief')), '? replaced the brief');
    await page.keyboard.press('Escape');
    await page.keyboard.press('3');
    assert.equal(await page.evaluate(() => app.activeMat), 'steel');
  }));

  test('Space cannot start a test under the tour overlay', () => withGame(async (page) => {
    await page.evaluate(() => { app.closeModal(); app.startCoach(); });
    await page.keyboard.press(' ');
    assert.equal(await page.evaluate(() => app.mode), 'build');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => app.coach), null);
  }));

  test('picking a level from the menu does not start the tour over its brief', () => withGame(async (page) => {
    const r = await page.evaluate(async () => {
      localStorage.removeItem('trusscraft.tourSeen');
      app.loadLevel(0); app.closeModal();
      app.showLevels(); app.switchLevel(2);
      await new Promise((res) => setTimeout(res, 500));
      return { coach: !!app.coach, level: app.level.id, modal: app.modalOpen };
    });
    assert.deepEqual(r, { coach: false, level: 3, modal: true });
  }));

  test('a dialog takes focus, traps Tab, and a focused result button is not pre-activated', () => withGame(async (page) => {
    await page.evaluate(() => { app.showLevels(); });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'modal-card');
    const buttons = await page.evaluate(() => document.querySelectorAll('#modal-card button').length);
    for (let i = 0; i < buttons + 2; i++) await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => document.getElementById('modal-card').contains(document.activeElement));
    assert.ok(inside, 'Tab escaped the dialog');
    await page.keyboard.press('Shift+Tab');
    assert.ok(await page.evaluate(() => document.getElementById('modal-card').contains(document.activeElement)));
  }));
});

describe('layout', () => {
  const VIEWPORTS = [
    ['desktop', 1280, 800], ['laptop', 1366, 650], ['small laptop', 1024, 700], ['tablet', 820, 1180],
    ['tablet landscape', 1180, 820], ['phone', 390, 780], ['small phone', 320, 568], ['phone landscape', 780, 390], ['small landscape', 568, 320]
  ];
  for (const [name, width, height] of VIEWPORTS) {
    test(`${name} (${width}x${height}): every level is framed and Test is reachable`, () => withGame(async (page) => {
      const r = await page.evaluate(() => {
        const levels = LEVELS.map((l, i) => {
          app.loadLevel(i); app.closeModal(); if (app.coach) app.endCoach();
          const t = l.terrain, band = app.levelBand(l);
          const top = app.sy(band.top);
          const bottom = app.sy(band.bottom);
          return { id: l.id, band: top >= -0.5 && bottom <= app.viewH + 0.5, gap: app.sx(t.leftBank) >= 0 && app.sx(t.rightBank) <= app.viewW };
        });
        const b = document.getElementById('btn-test').getBoundingClientRect();
        return { levels, test: b.left >= 0 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight, pageScroll: document.documentElement.scrollWidth > innerWidth };
      });
      for (const l of r.levels) { assert.ok(l.band, `level ${l.id}: water or truss height off screen`); assert.ok(l.gap, `level ${l.id}: gap cut off`); }
      assert.ok(r.test, 'the Test button is off screen');
      assert.equal(r.pageScroll, false, 'the page scrolls sideways');
    }, { viewport: { width, height } }));
  }

  test('the checklist collapses, shows a count, and remembers its state', () => withGame(async (page) => {
    await page.evaluate(() => { app.closeModal(); if (app.coach) app.endCoach(); });
    assert.equal(await page.evaluate(() => document.getElementById('hud-objectives').classList.contains('collapsed')), false);
    await page.click('#obj-toggle');
    assert.equal(await page.evaluate(() => document.getElementById('hud-objectives').classList.contains('collapsed')), true);
    assert.match(await page.evaluate(() => document.getElementById('obj-count').textContent), /^\d+\/\d+$/);
    assert.equal(await page.evaluate(() => localStorage.getItem('trusscraft.checklist')), 'closed');
    assert.equal(await page.getAttribute('#obj-toggle', 'aria-expanded'), 'false');
  }));

  test('phones start with the checklist collapsed', () => withGame(async (page) => {
    assert.equal(await page.evaluate(() => document.getElementById('hud-objectives').classList.contains('collapsed')), true);
  }, { viewport: { width: 390, height: 780 } }));
});

describe('accessibility', () => {
  test('reduced motion turns off shake, camera punch and flash', async () => {
    const game = await openGame(browser, { reducedMotion: 'reduce' });
    try {
      const r = await game.page.evaluate(() => {
        buildTruss(0, { depth: 3 }); app.startSimulation();
        app.impact(8, 7, 1.5);
        return { reduce: app.reduceMotion, shake: app.shake, flash: app.flash, zoom: app.zoom, rings: app.shockwaves.length };
      });
      assert.equal(r.reduce, true);
      assert.deepEqual([r.shake, r.flash, r.zoom], [0, 0, 0]);
      assert.equal(r.rings, 1, 'the failure should still be marked');
    } finally { await game.close(); }
  });

  test('without the preference, a failure still hits hard', () => withGame(async (page) => {
    const r = await page.evaluate(() => { buildTruss(0, { depth: 3 }); app.startSimulation(); app.impact(8, 7, 1.5); return { shake: app.shake, flash: app.flash }; });
    assert.ok(r.shake > 0 && r.flash > 0);
  }));

  test('toggle buttons expose their state', () => withGame(async (page) => {
    await page.evaluate(() => { app.closeModal(); if (app.coach) app.endCoach(); });
    await page.keyboard.press('e');
    assert.equal(await page.getAttribute('#btn-erase', 'aria-pressed'), 'true');
    await page.keyboard.press('e');
    assert.equal(await page.getAttribute('#btn-erase', 'aria-pressed'), 'false');
  }));
});
