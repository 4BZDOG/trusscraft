'use strict';
/**
 * Balance regression: 72 Warren-truss designs (6 levels x 3 depths x 4 material mixes) plus a
 * cantilever, each run through the real game, compared with a stored golden file.
 *
 * Level budgets and star thresholds were measured against the vehicle's loading of the deck, so a
 * change to the vehicle, the solver or the materials that moves these numbers moves how hard the
 * game is. If a change is intended, re-measure the budgets, then refresh the golden file with
 * `npm run balance:update` and say why in the commit.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { launch, openGame } = require('./helpers');

const GOLDEN = path.join(__dirname, 'balance.golden.json');
const UPDATE = !!process.env.UPDATE_GOLDEN;

// Tolerances: loose enough for harmless numerical drift, tight enough to catch a real shift.
const REL = 0.15;        // 15% on peak stress and sag ...
const ABS_PEAK = 0.03;   // ... or this much absolute, whichever is larger
const ABS_SAG = 0.02;

const LEVELS = [[0, -1], [1, 1], [2, -1], [3, -1], [5, -1], [6, -1]];   // [index, dir]
const DEPTHS = [1.5, 2.5, 3.5];
const MIXES = [['steel', 'steel'], ['wood', 'wood'], ['steel', 'wood'], ['wood', 'steel']];   // [chord, diag]

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

async function measure() {
  const game = await openGame(browser);
  try {
    const rows = {};
    for (const [idx, dir] of LEVELS) for (const depth of DEPTHS) for (const [chord, diag] of MIXES) {
      const r = await game.page.evaluate(([idx, dir, depth, chord, diag]) => {
        buildTruss(idx, { depth, chord, diag, dir });
        const cost = app.calculateCost(), id = app.level.id;
        return { id, cost, ...runTest(45) };
      }, [idx, dir, depth, chord, diag]);
      rows[`L${r.id} depth ${depth} chord ${chord} diag ${diag}`] = { won: r.won, cost: r.cost, peak: r.peak, sag: r.sag, failure: r.failure };
    }
    // The cantilever (level index 4) is not a Warren; lay a braced top chord tied to its towers.
    for (const [top, mat] of [[3.5, 'steel'], [4.0, 'steel'], [3.5, 'wood']]) {
      const r = await game.page.evaluate(([top, mat]) => {
        app.loadLevel(4); app.closeModal(); if (app.coach) app.endCoach();
        const at = (x, y) => app.findNearestNode(x, y, 0.05);
        const node = (x, y) => at(x, y) || app.createNode(x, y, false);
        const xs = [3, 4.5, 6, 7.5, 9, 10.5, 12];
        for (let i = 0; i < xs.length - 1; i++) app.createMember(node(xs[i], 7), node(xs[i + 1], 7), 'road');
        const tops = xs.slice(1).map((x) => node(x, 7 - (top === 3.5 ? 3 : 3.5)));
        tops.forEach((tp, i) => {
          app.createMember(tp, node(xs[i + 1], 7), mat);
          if (i) app.createMember(tops[i - 1], tp, mat);
          app.createMember(tp, node(xs[i], 7), mat);
        });
        app.createMember(at(3, 3.5), tops[0], mat); app.createMember(at(3, 5), tops[0], mat);
        app.updateBudget(); app.markDirty();
        return { cost: app.calculateCost(), ...runTest(45) };
      }, [top, mat]);
      rows[`L5 cantilever top ${top} ${mat}`] = { won: r.won, cost: r.cost, peak: r.peak, sag: r.sag, failure: r.failure };
    }
    assert.deepEqual(game.errors, [], 'the page logged errors');
    return rows;
  } finally { await game.close(); }
}

test('level difficulty matches the measured baseline', { timeout: 600000 }, async () => {
  const now = await measure();
  if (UPDATE) {
    fs.writeFileSync(GOLDEN, JSON.stringify(now, null, 1) + '\n');
    console.log(`wrote ${Object.keys(now).length} designs to ${path.relative(process.cwd(), GOLDEN)}`);
    return;
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  assert.deepEqual(Object.keys(now).sort(), Object.keys(golden).sort(), 'the set of designs changed; refresh the golden file');

  const problems = [];
  for (const [key, g] of Object.entries(golden)) {
    const n = now[key];
    if (n.won !== g.won) problems.push(`${key}: ${g.won ? 'won' : 'lost'} before, ${n.won ? 'wins' : 'loses'} now`);
    if (n.cost !== g.cost) problems.push(`${key}: cost ${g.cost} -> ${n.cost}`);
    if (Math.abs(n.peak - g.peak) > Math.max(ABS_PEAK, REL * g.peak)) problems.push(`${key}: peak stress ${g.peak} -> ${n.peak}`);
    if (Math.abs(n.sag - g.sag) > Math.max(ABS_SAG, REL * g.sag)) problems.push(`${key}: sag ${g.sag} -> ${n.sag}`);
  }
  assert.deepEqual(problems, [], `${problems.length} design(s) moved:\n  ${problems.join('\n  ')}`);
});
