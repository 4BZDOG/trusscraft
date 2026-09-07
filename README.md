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
| **Triangulation** | A flat deck sags ~0.43 m under the test car; the same deck with triangles added sags ~0.025 m |
| **Euler buckling** | Compression capacity falls with the square of member length, so long struts fail first |
| **Deflection limits** | A bridge that carries the load but bends too far has still failed — the deck sag readout is checked against span ÷ 60 |
| **Material economy** | Every member costs money, so the challenge is the *cheapest* structure that stands up |

## Levels

1. **The Simple Span** — triangulation
2. **The Deep Gorge** — arches and thrust
3. **Suspension Towers** — tension structures
4. **Heavy Freight** — buckling under a 3.6 t truck
5. **Engineering Sandbox** — open build, no budget

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

## Technical notes

- Vanilla JS, HTML canvas, Web Audio — no libraries.
- Verlet integration with position-based dynamics constraint relaxation, 16 substeps
  per frame; axial force from strain, with a length-scaled Euler buckling penalty
  in compression.
- Procedurally generated audio and terrain; nothing is loaded from the network.
