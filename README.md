# TrussCraft — Bridge Engineering Lab

**▶ Play it here: https://4bzdog.github.io/trusscraft/**

A single-file browser game for teaching **statics**: students build bridges from
roadway, timber, steel and cable, then run a live load test and watch the forces
appear in their structure.

No install, no build step, no dependencies — one HTML file that runs offline.

<!-- Add a screenshot here: drag an image into a GitHub issue, then paste the URL -->

## What it teaches

| Concept | How the game shows it |
|---|---|
| **Tension vs compression** | Members colour blue when stretched, red when squashed; brightness shows how close they are to failing |
| **Triangulation** | A flat deck bends until the slab cracks; the same deck with triangles added sags ~20x less and survives |
| **Euler buckling** | Compression capacity falls with the square of member length, so long struts fail first |
| **Deflection limits** | Roadway has no bending strength of its own. Past a deflection of span ÷ 40 the deck slab cracks and the bridge drops the vehicle |
| **Choosing a bridge type** | Each level forbids the previous level's answer — below the deck, then above it, then with only one bank to anchor to |
| **Material economy** | Every member costs money, so the challenge is the *cheapest* structure that stands up |

## Levels

1. **The Simple Span** — triangulation. A guided tour introduces the materials and the budget.
2. **The Deep Gorge** — ships pass overhead, so *nothing may be built above the deck*. Forces a deck truss or arch.
3. **Suspension Towers** — the water is too deep for piers, so *nothing may be built below the deck*. Forces a through truss, and is the place to discover that a cable which goes slack carries nothing.
4. **Heavy Freight** — a 6.5 t truck on a mean budget. All-timber is flattened, all-steel busts the budget; the student has to choose between building deeper and building stronger.
5. **The Cantilever** — the far cliff is crumbling, so *no anchor may be fixed to it*. The bridge has to hold its own far end up, and the forces come out backwards: the top chord is pulled, the bottom pushed.
6. **The Long Haul** — 20 metres, with a rock stack mid-river offering anchors. A single span will stand; landing on the stack is about 6% cheaper and 15% stiffer, and the budget is set so only the tidier answer takes full marks.
7. **Engineering Sandbox** — open build, no ceiling, but a par cost *and* a stiffness target that pull against each other.

Every level is winnable in more than one way. Budgets are set from measured data
rather than guessed: for each level the design space was searched for the cheapest
structure that actually survives, and the three-star threshold sits just above it —
so a working bridge is easy, an efficient one is not.

| Level | Cheapest surviving design | Three-star target |
|---|---|---|
| 4 Heavy Freight | $2,555 | $2,813 |
| 5 The Cantilever | $1,833 | $2,250 |
| 6 The Long Haul | $3,428 | $3,600 |
| 7 Sandbox | $3,225 | $3,550 + stiffness |

## Controls

| Action | Key |
|---|---|
| Select material | <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> |
| Eraser | <kbd>E</kbd> |
| Run / stop the load test | <kbd>Space</kbd> |
| Show force vectors | <kbd>V</kbd> |
| Undo / redo | <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Z</kbd> |
| Engineering handbook | <kbd>?</kbd> |

Drag on the grid to lay a member. Hover any member during a test to read its exact
force in kilonewtons and how much of its capacity it is using.

## Using it in class

- Runs from the live link above, or download `index.html` and open it directly —
  it works with no network connection.
- Progress and stars are stored per-browser in `localStorage`; it degrades gracefully
  if storage is blocked.
- The **design checklist** gives students continuous feedback while building, and each
  failed test explains *which* member gave way and *why*, so the debrief is the lesson.
- A **guided tour** runs on first load pointing out the materials, the budget and the test
  button — students otherwise tend to start drawing roadway without noticing either.
  It can be replayed any time from **📘 Guide**.
- A flat roadway laid straight across **cannot pass any level**. It is the first thing most
  students try, and the resulting collapse is the hook for teaching triangulation.

## Technical notes

- Vanilla JS, HTML canvas, Web Audio — no libraries.
- Verlet integration with position-based dynamics constraint relaxation, 16 substeps
  per frame; axial force from strain, with a length-scaled Euler buckling penalty
  in compression.
- Procedurally generated audio and terrain; nothing is loaded from the network.
