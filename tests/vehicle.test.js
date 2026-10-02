'use strict';
/** Unit tests for the vehicle model. No browser and no dependencies: `node --test tests/vehicle.test.js`. */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { Vehicle, surfaceBelow, vehicleTypeFor } = require('../js/vehicle.js');

const TERRAIN = { leftBank: 4, rightBank: 12, groundY: 7, waterY: 10.5 };
const DT = 1 / 960;                                  // the game's substep at 60 fps

const node = (x, y) => ({ x, y, fixed: true });
const road = (a, b) => ({ n1: a, n2: b, mat: 'road', broken: false });
/** Roadway from the left bank to the right bank in 2 m members, level with the ground. */
const flatDeck = (from = 4, to = 12) => {
  const nodes = [];
  for (let x = from; x <= to; x += 2) nodes.push(node(x, 7));
  return nodes.slice(1).map((n, i) => road(nodes[i], n));
};
const run = (v, members, secs, terrain = TERRAIN, each) => {
  for (let t = 0; t < secs; t += DT) { v.step(DT, members, terrain); if (each) each(t); }
};
const staticShare = (mass) => mass * 9.81 / 2;

describe('vehicle classes', () => {
  test('class follows mass', () => {
    assert.equal(vehicleTypeFor(1400), 'car');
    assert.equal(vehicleTypeFor(2000), 'van');
    assert.equal(vehicleTypeFor(6500), 'truck');
  });
});

describe('steady roll', () => {
  for (const mass of [1400, 2200, 6500]) {
    test(`${mass} kg holds speed, sits level and carries exactly its weight`, () => {
      const v = new Vehicle(mass, TERRAIN), deck = flatDeck();
      let lo = Infinity, hi = 0, tilt = 0;
      run(v, deck, 4.5, TERRAIN, (t) => {
        if (t < 1 || v.x > 11) return;
        for (const w of v.wheels) { lo = Math.min(lo, w.load); hi = Math.max(hi, w.load); }
        tilt = Math.max(tilt, Math.abs(v.tilt));
      });
      assert.ok(Math.abs(v.vx - 2.2) < 0.02, `speed ${v.vx}`);
      assert.ok(hi / staticShare(mass) < 1.02 && lo / staticShare(mass) > 0.98, `load ${lo}..${hi}`);
      assert.ok(tilt < 0.002, `tilt ${tilt}`);
    });
  }
});

describe('landing', () => {
  for (const mass of [1400, 6500]) for (const drop of [1, 3, 6]) {
    test(`${mass} kg dropped ${drop} m onto the rock stack comes to rest on top, not through`, () => {
      const terrain = { ...TERRAIN, pier: { x: 8, topY: 7, width: 1.6 } };
      const v = new Vehicle(mass, terrain);
      Object.assign(v, { x: 8, y: 7 - drop - 0.5, vx: 0, cruise: 0 });
      run(v, [], 3, terrain);
      const rest = 7 - v.reach + 0.10;
      assert.ok(Math.abs(v.y - rest) < 0.02, `y=${v.y}, expected ${rest}`);
      assert.ok(v.grounded);
    });
  }

  test('a modest drop settles without repeated bouncing', () => {
    const v = new Vehicle(1400, TERRAIN), deck = flatDeck();
    Object.assign(v, { x: 8, y: v.y - 0.6, vx: 0, cruise: 0 });
    let liftOffs = 0, was = false;
    run(v, deck, 3, TERRAIN, () => { if (was && !v.grounded) liftOffs++; was = v.grounded; });
    assert.ok(liftOffs <= 3, `${liftOffs} lift-offs`);
    assert.ok(Math.abs(v.y - (7 - v.reach + 0.10)) < 0.005);
  });

  test('reports its touchdown speed once', () => {
    const v = new Vehicle(1400, TERRAIN), deck = flatDeck();
    Object.assign(v, { x: 8, y: v.y - 1, vx: 0, cruise: 0 });
    run(v, deck, 1.0, TERRAIN);
    assert.ok(v.landing > 3, `landing ${v.landing}`);
  });
});

describe('losing the deck', () => {
  test('drives off the end nose-first, keeps its forward speed and tumbles', () => {
    const v = new Vehicle(1400, TERRAIN), deck = flatDeck(4, 8);     // deck stops at x = 8
    let maxTilt = 0;
    run(v, deck, 3.4, TERRAIN, () => { maxTilt = Math.max(maxTilt, v.tilt); });
    assert.ok(maxTilt > 0.3, `nose dip ${maxTilt}`);
    assert.ok(v.vy > 3, `falling at ${v.vy}`);
    assert.ok(v.vx > 1.5, `forward speed ${v.vx}`);
  });

  test('a one-member gap does not swallow a wheel that can roll across it', () => {
    // 0.5 m gap, narrower than the 0.56 m tyre
    const a = node(4, 7), b = node(8, 7), c = node(8.5, 7), d = node(12, 7);
    const v = new Vehicle(1400, TERRAIN);
    run(v, [road(a, b), road(c, d)], 5, TERRAIN);
    assert.ok(v.x > 12, `got to ${v.x}`);
    assert.ok(v.y < 7, 'still on the road');
  });
});

describe('hills', () => {
  const climb = (degrees, mass = 1400) => {
    const rise = 6 * Math.tan(degrees * Math.PI / 180);
    const t3 = { leftBank: 4, rightBank: 14, groundY: 7, waterY: 12 };
    const v = new Vehicle(mass, t3);
    const deck = [road(node(4, 7), node(6, 7)), road(node(6, 7), node(12, 7 - rise))];
    let maxTilt = 0;
    run(v, deck, 4.5, t3, () => { maxTilt = Math.max(maxTilt, Math.abs(v.tilt)); });
    return { v, maxTilt };
  };

  test('a car climbs a 27 degree ramp, slower, without flipping', () => {
    const { v, maxTilt } = climb(26.6);
    assert.ok(v.x > 9, `reached ${v.x}`);
    assert.ok(maxTilt < 0.6, `tilt ${maxTilt}`);
  });

  test('an impossible ramp stops it rather than launching it', () => {
    const { v, maxTilt } = climb(45);
    assert.ok(v.x < 8, `reached ${v.x}`);
    assert.ok(maxTilt < 1.0, `tilt ${maxTilt}`);
  });
});

describe('terrain', () => {
  test('a cliff face stops a vehicle falling beside it', () => {
    const v = new Vehicle(1400, TERRAIN);
    Object.assign(v, { x: 4.3, y: 9, vx: -1, vy: 0, cruise: 0 });
    run(v, [], 0.5, TERRAIN);
    assert.ok(v.wheelCentre(0).x >= 4 + v.wheelRadius - 0.01, `rear wheel at ${v.wheelCentre(0).x}`);
  });

  test('the rock stack never takes load from a deck over it', () => {
    const terrain = { ...TERRAIN, pier: { x: 8, topY: 7, width: 1.6 } };
    const s = surfaceBelow(8, 6, flatDeck(), terrain);
    assert.ok(s.member, 'the deck member is the surface, so its load is felt');
  });

  test('broken and vertical roadway is not a surface', () => {
    const broken = road(node(4, 7), node(12, 7)); broken.broken = true;
    assert.equal(surfaceBelow(8, 6, [broken], TERRAIN), null);
    assert.equal(surfaceBelow(8, 6, [road(node(8, 5), node(8, 8))], TERRAIN), null);
  });

  test('a non-road member is never driven on', () => {
    const wood = { ...road(node(4, 7), node(12, 7)), mat: 'wood' };
    assert.equal(surfaceBelow(8, 6, [wood], TERRAIN), null);
  });
});

describe('deck loading', () => {
  test('never asks the deck to carry more than the weight resting on a wheel', () => {
    const v = new Vehicle(1400, TERRAIN), deck = flatDeck();
    Object.assign(v, { x: 8, y: v.y - 2, vx: 0, cruise: 0 });
    let worst = 0;
    run(v, deck, 2, TERRAIN, () => { for (const c of v.contacts) worst = Math.max(worst, c.load); });
    assert.ok(worst <= staticShare(1400) + 1e-6, `deck load ${worst}`);
  });
});
