/**
 * TRUSSCRAFT — MATERIALS, CONSTANTS AND LEVELS
 * Data and small pure helpers; nothing here touches the DOM.
 */

// ============================================================
//  MATERIALS & STATICS CONSTANTS
// ============================================================
const MATERIALS = {
  road: {
    name: 'Roadway', short: 'Deck', cost: 100, mass: 14,
    maxTension: 36000, maxComp: 28000, color: '#94a3b8', isRoad: true,
    blurb: 'The driving surface. Vehicles can only travel on roadway, so it must span the whole gap. Heavy, so support it well.'
  },
  wood: {
    name: 'Wood', short: 'Timber', cost: 30, mass: 4,
    maxTension: 16000, maxComp: 15000, color: '#d97706',
    blurb: 'Cheap and light, but weak. Fine for short bracing; long wooden struts buckle under compression.'
  },
  steel: {
    name: 'Steel', short: 'Steel', cost: 90, mass: 18,
    maxTension: 70000, maxComp: 60000, color: '#38bdf8',
    blurb: 'Four times stronger than wood in both directions, and three times the price. Save it for the members carrying the most load.'
  },
  cable: {
    name: 'Cable', short: 'Cable', cost: 45, mass: 2,
    maxTension: 50000, maxComp: 0, color: '#a855f7', isCable: true,
    blurb: 'Enormously strong in tension, and completely useless in compression — it just goes slack. Use it to hang loads from above.'
  }
};

const MAX_STRUT_LENGTH = 4.2;   // metres
const MIN_STRUT_LENGTH = 0.5;   // metres
const EULER_REF_LEN    = 2.4;   // reference length for buckling scaling
const EULER_EXPONENT   = 1.8;   // pure Euler buckling is 2 (load ∝ 1/L²); slightly gentler suits imperfect members
const GRID_SNAP        = 0.5;   // metres
const ELASTIC_MODULUS  = 200000;
const RISK_THRESHOLD   = 0.75;  // stress fraction that counts as "at risk"
const SAG_SPAN_RATIO   = 40;    // deck cracks past a deflection of span / this
const SAG_WARN_FRACTION = 0.55; // fraction of that limit at which the deck starts groaning
const EFFICIENCY_FRACTION = 0.75; // spend under this share of budget to earn the third star
const SANDBOX_STIFF_FRACTION = 0.6; // sandbox stiffness star: deflect under this share of the limit
const UNLIMITED_BUDGET = 99999; // a level budget at or above this means "no ceiling" (the sandbox)
const STUCK_TIMEOUT    = 40;    // simulated seconds before a stalled vehicle ends the test
// Turns a wheel's force into a downward nudge on the deck joints it rests on, per substep.
// The structure solver is position-based, so this is a tuning constant, not a unit conversion:
// level budgets were measured with it, so change it only together with a re-measure.
const DECK_LOAD_GAIN   = 0.003;

/** Compression a member can carry before it buckles; falls steeply with length. */
function bucklingCapacity(matKey, length) {
  return MATERIALS[matKey].maxComp * Math.min(1, Math.pow(EULER_REF_LEN / length, EULER_EXPONENT));
}

// ============================================================
//  CURRICULUM LEVELS
// ============================================================
// Array order is the play order and the numbers in the titles. `id` is the key
// saved progress is stored under, so it must never change once shipped — which is
// why the ids are not in sequence (the Cantilever and Long Haul were added later).
const LEVELS = [
  {
    id: 1,
    title: "1. The Simple Span",
    goal: "Carry a 1.4 tonne car across an 8 metre gap.",
    desc: "Start by laying a <b>roadway</b> straight across and pressing Test. It will sag, crack and drop the car into the river — a flat deck has nothing to stop it bending. Then brace it: pick a second material and add <b>triangles</b> above or below the deck.",
    concept: "Triangulation",
    tip: "A square frame folds flat without any member changing length. A triangle can't — to change its shape something must physically stretch or crush. That is why every truss is built from triangles.",
    budget: 2200,
    tutorial: true,
    anchors: [ { x: 4, y: 7, fixed: true }, { x: 12, y: 7, fixed: true } ],
    terrain: { leftBank: 4, rightBank: 12, groundY: 7, waterY: 10.5 },
    carMass: 1400
  },
  {
    id: 2,
    title: "2. The Deep Gorge",
    goal: "Span a 12 metre canyon with tall ships passing above.",
    desc: "Cargo ships need clear air over the roadway, so <b>nothing may be built above the deck</b>. Everything that holds this bridge up has to hang below it. Use the lower wall anchors and build an arched deck truss down into the gorge.",
    concept: "Deck trusses & arches",
    tip: "With the structure underneath, the lower members are pushed together as the load passes — watch them glow red. The arch drives its thrust outward into the canyon walls, and the rock pushes straight back.",
    budget: 3600,
    constraint: { type: 'above', clearance: 0.25, label: 'SHIPPING CLEARANCE', blurb: 'Nothing above the deck' },
    anchors: [
      { x: 4, y: 6, fixed: true }, { x: 16, y: 6, fixed: true },
      { x: 4, y: 9, fixed: true }, { x: 16, y: 9, fixed: true }
    ],
    terrain: { leftBank: 4, rightBank: 16, groundY: 6, waterY: 11.5 },
    carMass: 1800
  },
  {
    id: 3,
    title: "3. Suspension Towers",
    goal: "Cross 16 metres of water far too deep for piers.",
    desc: "The riverbed is out of reach, so <b>nothing may be built below the deck</b> — the answer that worked in level 2 is useless here. Everything must go <b>above</b> the roadway, and the car has to drive through the middle of it.",
    concept: "Through trusses & tension",
    tip: "This is the level to experiment with <b>Cable</b>. It carries more load per dollar than anything else — but only in tension, and as the car rolls past, a diagonal that was being pulled starts being pushed instead. A pushed cable goes slack and carries nothing, which you will see it do. Real trusses solve this by bracing <b>both diagonals</b> of a bay, so one is always pulling.",
    budget: 4800,
    constraint: { type: 'below', clearance: 0.25, label: 'DEEP WATER — NO PIERS', blurb: 'Nothing below the deck' },
    anchors: [
      { x: 3, y: 7, fixed: true },   { x: 19, y: 7, fixed: true },
      { x: 3, y: 2.5, fixed: true }, { x: 19, y: 2.5, fixed: true }
    ],
    terrain: { leftBank: 3, rightBank: 19, groundY: 7, waterY: 12.5 },
    carMass: 2200
  },
  {
    id: 4,
    title: "4. Heavy Freight",
    goal: "Get a 6.5 tonne freight truck across 14 metres, cheaply.",
    desc: "No restrictions on where you build — the difficulty is the load. This truck is <b>four and a half times</b> level 1's car, and the shallow truss that carried that car will be flattened by it. An all-steel version will not fit the budget, so you have a choice to make: build <b>deeper</b>, or build <b>stronger</b>.",
    concept: "Material selection",
    tip: "Depth is free strength. Doubling how far your truss stands above the deck roughly halves the force in its chords, and a taller timber truss can beat a short steel one for less money. Steel is three times the price of wood — worth it in the two or three members carrying the most, wasteful everywhere else. The budget here is tight enough that a cheap design has to be a <b>good</b> design.",
    budget: 3750,
    anchors: [
      { x: 3, y: 6.5, fixed: true }, { x: 17, y: 6.5, fixed: true },
      { x: 1, y: 9, fixed: true },   { x: 19, y: 9, fixed: true }
    ],
    terrain: { leftBank: 3, rightBank: 17, groundY: 6.5, waterY: 11.5 },
    carMass: 6500
  },
  {
    id: 6,
    title: "5. The Cantilever",
    goal: "Reach 9 metres across with only one bank to hold on to.",
    desc: "The far cliff is crumbling rock — <b>no anchor may be fixed to it</b>. Everything you build has to reach back to the near bank, so the bridge must hold its own far end up. Use both the deck-level anchor and the tower above it.",
    concept: "Cantilevers",
    tip: "Tie into one anchor only and your bridge is a gate, not a bridge — it swings down about that point. You need <b>two anchors at different heights</b> so the pair of them can resist the twist. Notice the forces come out backwards from a normal truss: here the top chord is <b>pulled</b> and the bottom is <b>pushed</b>.",
    budget: 3000,
    anchors: [
      { x: 3, y: 7, fixed: true },   // deck level
      { x: 3, y: 5, fixed: true },   // tower, low tie
      { x: 3, y: 3.5, fixed: true }, // tower, high tie
      { x: 3, y: 9.5, fixed: true }  // cliff face, for building below the deck
    ],
    terrain: { leftBank: 3, rightBank: 12, groundY: 7, waterY: 12 },
    carMass: 1600
  },
  {
    id: 7,
    title: "6. The Long Haul",
    goal: "Carry a 2 tonne car across 20 metres — the widest crossing yet.",
    desc: "More than twice level 1, and the roadway alone eats a third of your money before you brace anything. There is a <b>rock stack</b> mid-river with anchors in it. A single 20 metre span will stand — but landing on the stack is both cheaper and stiffer, and the budget is set so that only the tidier answer earns full marks.",
    concept: "Efficiency at scale",
    tip: "Cost here is simply how much material you buy, so the win comes from using <b>less of it</b>, not stronger stuff. Wider bays mean fewer members; more depth means lower forces but longer verticals. Landing on the stack buys you roughly 6% on cost and 15% on stiffness — small, but at this size small is the whole margin.",
    budget: 4800,
    anchors: [
      { x: 2, y: 7, fixed: true },  { x: 22, y: 7, fixed: true },
      { x: 12, y: 7, fixed: true }, { x: 12, y: 9, fixed: true }
    ],
    terrain: { leftBank: 2, rightBank: 22, groundY: 7, waterY: 13, pier: { x: 12, topY: 7, width: 1.6 } },
    carMass: 2000
  },
  {
    id: 5,
    title: "7. Engineering Sandbox",
    goal: "Design freely — then beat par.",
    desc: "An open laboratory with anchor points high, low and level. Build a Warren truss, a Pratt truss, an arch, a suspension span or a cantilever, and compare how the forces redistribute. No budget ceiling — instead there is a <b>par of $3,550</b> and a <b>stiffness target</b>. The cheapest bridge that survives this crossing costs $3,225, so par is tight, and the cheapest bridge is far too floppy to earn the other star.",
    concept: "Free experimentation",
    tip: "The two targets here genuinely pull against each other. Cost is simply total material, so the cheapest bridge is a <b>shallow</b> one with wide bays — and a shallow truss is a floppy one, which blows the stiffness target. Getting both stars means finding the depth that is just deep enough. Note that stress is almost never your problem in this engine: deflection is what fails you.",
    budget: UNLIMITED_BUDGET,
    par: 3550,
    anchors: [
      { x: 3, y: 7, fixed: true },  { x: 21, y: 7, fixed: true },
      { x: 3, y: 3, fixed: true },  { x: 21, y: 3, fixed: true },
      { x: 3, y: 10, fixed: true }, { x: 21, y: 10, fixed: true }
    ],
    terrain: { leftBank: 3, rightBank: 21, groundY: 7, waterY: 13 },
    carMass: 2000
  }
];

const isUnlimited = (level) => level.budget >= UNLIMITED_BUDGET;
const spanOf = (level) => level.terrain.rightBank - level.terrain.leftBank;

// Older Safari lacks roundRect — supply a minimal equivalent.
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const radii = Array.isArray(r) ? r : [r, r, r, r];
    const [tl, tr, br, bl] = radii.length === 4 ? radii : [radii[0], radii[0], radii[0], radii[0]];
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + tr);
    this.lineTo(x + w, y + h - br);
    this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    this.lineTo(x + bl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - bl);
    this.lineTo(x, y + tl);
    this.quadraticCurveTo(x, y, x + tl, y);
    return this;
  };
}

// ============================================================
//  SMALL UTILITIES
// ============================================================
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp  = (a, b, t) => a + (b - a) * t;

/** Deterministic pseudo-random in [0,1) — keeps terrain from shimmering. */
function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth deterministic 1-D value noise. */
function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash1(i), hash1(i + 1), u);
}

/** Colour for a member's force state: hue by sign, vividness by utilisation. */
function stressColor(force, stress, alpha = 1) {
  const s = clamp(stress, 0, 1);
  if (Math.abs(force) < 60) return `rgba(124, 133, 152, ${alpha})`;
  const hue = force < 0 ? 4 : 199;
  const sat = Math.round(lerp(22, 92, Math.pow(s, 0.6)));
  const lig = Math.round(lerp(58, 55, s));
  return `hsla(${hue}, ${sat}%, ${lig}%, ${alpha})`;
}
