/**
 * TRUSSCRAFT — APPLICATION CORE
 * State, camera, history, level lifecycle, structure editing, structural analysis and the frame loop.
 * The UI, simulation and rendering methods are added to the class by ui.js, simulation.js and render.js.
 */

// ============================================================
//  MAIN APPLICATION CONTROLLER
// ============================================================
class TrussCraftApp {
  constructor() {
    this.canvas = document.getElementById('simCanvas');
    this.ctx = this.canvas.getContext('2d');

    // Display & coordinates
    this.dpr = window.devicePixelRatio || 1;
    this.PPM = 40;
    this.originX = 60;
    this.originY = 50;

    // Simulation configuration
    this.simSpeed = 1.0;
    this.showVectors = false;
    this.mode = 'build';            // 'build' | 'test'
    this.activeMat = 'road';
    this.activeTool = 'draw';       // 'draw' | 'erase' | 'move'
    this.moveState = null;

    // Model entities
    this.nodes = [];
    this.members = [];
    this.particles = [];
    this.vehicle = null;
    this.currentLevelIdx = 0;
    this.level = LEVELS[0];
    this.maxStressObserved = 0;
    this.firstFailure = null;
    this.brokenCount = 0;
    this.testElapsed = 0;           // simulated seconds since the test began
    this.maxSag = 0;
    this.currentSag = 0;
    this.sagWarned = false;
    this.deckCracked = false;
    this.resultShown = false;
    this.modalOpen = false;
    this.coach = null;
    this.hintsShown = {};
    this.pendingSnapshot = null;
    this.createdStartNode = null;
    this.lastRumble = -1;

    // Presentation state
    this.time = 0;
    this.frameDt = 0;
    // Shake, camera punch and flashes are the effects that bother people with vestibular
    // sensitivity or photosensitivity, so they honour the system's reduce-motion setting.
    const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.reduceMotion = !!(motionQuery && motionQuery.matches);
    if (motionQuery && motionQuery.addEventListener) {
      motionQuery.addEventListener('change', (e) => { this.reduceMotion = e.matches; });
    }
    this.shake = 0;
    this.slowmo = 0;
    this.flash = 0;
    this.zoom = 0;
    this.zoomFocus = { x: 0, y: 0 };
    this.shockwaves = [];
    this.cascade = 0;
    this.clouds = Array.from({ length: 7 }, (_, i) => ({
      x: hash1(i * 3.1) * 30 - 3,
      y: 0.4 + hash1(i * 7.7) * 3.2,
      scale: 0.6 + hash1(i * 5.3) * 1.1,
      speed: 0.05 + hash1(i * 2.9) * 0.09
    }));

    // History
    this.undoStack = [];
    this.redoStack = [];

    // Interaction
    this.mouseWorld = { x: 0, y: 0 };
    this.mouseScreen = { x: 0, y: 0 };
    this.mouseOnCanvas = false;
    this.dragStartNode = null;
    this.hoverNode = null;
    this.hoverMember = null;

    // Analysis cache
    this.analysis = null;
    this.analysisDue = 0;
    this.progress = this.loadProgress();

    this.initCanvas();
    this.bindEvents();
    this.loadLevel(0);

    this.lastTime = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---------- canvas & coordinates ----------
  initCanvas() {
    const handleResize = () => {
      this.dpr = window.devicePixelRatio || 1;
      const w = this.canvas.parentElement.clientWidth;
      const h = this.canvas.parentElement.clientHeight;
      this.canvas.width = w * this.dpr;
      this.canvas.height = h * this.dpr;
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(this.dpr, this.dpr);
      this.viewW = w;
      this.viewH = h;

      this.frameLevel(w, h);
    };
    this.handleResize = handleResize;
    window.addEventListener('resize', handleResize);
    handleResize();
  }

  /**
   * Fit the camera to what this level needs rather than a fixed 24 m window, so a short
   * crossing is drawn large on a small screen. The band that must stay visible runs from a
   * truss-height above the deck (or the highest anchor) down past the water, where the
   * vehicle lands; it is centred, leaning low so the checklist card sits over empty sky.
   */
  frameLevel(w, h) {
    const lvl = this.level;
    if (!lvl) { this.PPM = Math.min(w / 24, h / 15); this.originX = 20; this.originY = 8; return; }
    const t = lvl.terrain;
    const left = t.leftBank, right = t.rightBank;
    const topNeeded = Math.min(t.groundY - 4.5, Math.min(...lvl.anchors.map(a => a.y)) - 1.2);
    const bottomNeeded = t.waterY + 0.8;
    const visW = Math.max(spanOf(lvl) + 8, 16);           // the gap plus a few metres of bank
    const visH = bottomNeeded - topNeeded;
    this.PPM = clamp(Math.min(w / visW, h / visH), 10, 60);
    this.originX = w / 2 - ((left + right) / 2) * this.PPM;
    const bandMid = (topNeeded + bottomNeeded) / 2;
    // originY puts world y=0 on screen; the band is on screen when it lies in [lo, hi].
    const lo = -topNeeded * this.PPM, hi = h - bottomNeeded * this.PPM;
    this.originY = clamp(h * 0.55 - bandMid * this.PPM, Math.min(lo, hi), Math.max(lo, hi));
  }

  toScreen(x, y) { return { x: this.originX + x * this.PPM, y: this.originY + y * this.PPM }; }
  toWorld(sx, sy) { return { x: (sx - this.originX) / this.PPM, y: (sy - this.originY) / this.PPM }; }
  sx(x) { return this.originX + x * this.PPM; }
  sy(y) { return this.originY + y * this.PPM; }

  // ---------- saved progress ----------
  loadProgress() {
    try {
      return JSON.parse(localStorage.getItem('trusscraft.progress') || '{}');
    } catch (e) { return {}; }
  }

  saveProgress(levelId, stars, cost) {
    const prev = this.progress[levelId] || { stars: 0, cost: Infinity };
    this.progress[levelId] = {
      stars: Math.max(prev.stars, stars),
      cost: Math.min(prev.cost === null ? Infinity : prev.cost, cost)
    };
    try {
      localStorage.setItem('trusscraft.progress', JSON.stringify(this.progress));
    } catch (e) { /* private browsing — progress is session-only */ }
    this.updateLevelPill();
  }

  starsFor(levelId) {
    const p = this.progress[levelId];
    return p ? p.stars : 0;
  }

  updateLevelPill() {
    const stars = this.starsFor(this.level.id);
    document.getElementById('ui-level').innerText = this.level.title;
    document.getElementById('ui-level-stars').innerText = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  }

  // ---------- history ----------
  snapshotState() {
    return {
      nodes: this.nodes.map(n => ({ x: n.x, y: n.y, fixed: n.fixed })),
      members: this.members.map(m => ({
        n1Idx: this.nodes.indexOf(m.n1),
        n2Idx: this.nodes.indexOf(m.n2),
        mat: m.mat
      }))
    };
  }

  saveSnapshot() {
    this.undoStack.push(this.snapshotState());
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.redoStack = [];
    this.refreshHistoryButtons();
  }

  restoreSnapshot(snapshot) {
    this.nodes = snapshot.nodes.map(n => ({
      x: n.x, y: n.y, oldX: n.x, oldY: n.y,
      fixed: n.fixed, mass: n.fixed ? 0 : 5
    }));
    this.hoverNode = null;       // the objects they pointed at no longer exist
    this.hoverMember = null;
    this.members = snapshot.members.map(m => {
      const n1 = this.nodes[m.n1Idx];
      const n2 = this.nodes[m.n2Idx];
      return {
        n1, n2, mat: m.mat,
        restLen: Math.hypot(n2.x - n1.x, n2.y - n1.y),
        broken: false, stress: 0, force: 0, peak: 0, warnPhase: Math.random() * 6.28
      };
    });
    this.updateBudget();
    this.markDirty();
  }

  refreshHistoryButtons() {
    const disabled = this.mode === 'test';
    document.getElementById('btn-undo').disabled = disabled || this.undoStack.length === 0;
    document.getElementById('btn-redo').disabled = disabled || this.redoStack.length === 0;
    document.getElementById('btn-clear').disabled = disabled || this.members.length === 0;
  }

  /** True while a drag or joint move is in progress and holds references to live nodes. */
  isEditing() { return !!(this.dragStartNode || this.moveState); }

  undo() {
    if (this.mode === 'test') return this.toast('warn', '⏸', 'Return to design mode first.');
    if (this.undoStack.length === 0 || this.isEditing()) return;
    this.redoStack.push(this.snapshotState());
    this.restoreSnapshot(this.undoStack.pop());
    this.refreshHistoryButtons();
    audio.playClick();
  }

  redo() {
    if (this.mode === 'test' || this.redoStack.length === 0 || this.isEditing()) return;
    this.undoStack.push(this.snapshotState());
    this.restoreSnapshot(this.redoStack.pop());
    this.refreshHistoryButtons();
    audio.playClick();
  }

  // ---------- level lifecycle ----------
  /** Menu entry point: unlock audio (needs a user gesture) and jump to a level. */
  switchLevel(idx) {
    audio.init();
    this.loadLevel(idx);
  }

  /** Clear every transient effect so nothing from a test leaks into the next screen. */
  resetPresentation() {
    this.particles = [];
    this.shockwaves = [];
    this.shake = 0;
    this.slowmo = 0;
    this.zoom = 0;
    this.flash = 0;
    this.cascade = 0;
  }

  loadLevel(idx) {
    audio.stopEngine();              // a test may still be running (Levels is reachable mid-test)
    this.moveState = null;
    this.dragStartNode = null;
    this.hoverNode = null;
    this.hoverMember = null;
    this.pendingSnapshot = null;
    this.createdStartNode = null;
    document.getElementById('hud-tooltip').style.display = 'none';
    this.currentLevelIdx = idx;
    this.level = LEVELS[idx];
    this.mode = 'build';
    this.undoStack = [];
    this.redoStack = [];
    this.hintsShown = {};
    this.overBudgetWarned = false;
    this.preTestState = null;

    document.getElementById('btn-test').style.display = 'flex';
    document.getElementById('btn-edit').style.display = 'none';
    document.getElementById('hud-analysis').classList.remove('show');

    this.nodes = this.level.anchors.map(a => ({
      x: a.x, y: a.y, oldX: a.x, oldY: a.y, fixed: true, mass: 0
    }));
    this.members = [];
    this.vehicle = null;
    this.resetPresentation();
    this.maxStressObserved = 0;
    this.firstFailure = null;
    this.brokenCount = 0;
    this.resultShown = false;

    if (this.handleResize) this.handleResize();
    this.updateLevelPill();
    this.updateBudget();
    this.setStressMeter(0);
    this.refreshHistoryButtons();
    this.markDirty();
    this.showBrief();
  }

  markDirty() { this.analysisDue = 0; }

  // ==========================================================
  //  STRUCTURE EDITING
  // ==========================================================
  snapGrid(x, y) {
    return { x: Math.round(x / GRID_SNAP) * GRID_SNAP, y: Math.round(y / GRID_SNAP) * GRID_SNAP };
  }

  /**
   * Levels can forbid a half-plane above or below the deck, which is what makes
   * each one need a different kind of bridge rather than the same truss again.
   * Returns null when the point is legal, or a reason string when it is not.
   */
  zoneViolation(y) {
    const c = this.level.constraint;
    if (!c) return null;
    const deck = this.level.terrain.groundY;
    if (c.type === 'above' && y < deck - c.clearance) return c.blurb;
    if (c.type === 'below' && y > deck + c.clearance) return c.blurb;
    return null;
  }

  /** The y value beyond which building is forbidden, or null if unrestricted. */
  zoneBoundaryY() {
    const c = this.level.constraint;
    if (!c) return null;
    const deck = this.level.terrain.groundY;
    return c.type === 'above' ? deck - c.clearance : deck + c.clearance;
  }

  createNode(x, y, fixed = false) {
    const node = { x, y, oldX: x, oldY: y, fixed, mass: fixed ? 0 : 5, born: this.time };
    this.nodes.push(node);
    return node;
  }

  createMember(n1, n2, mat) {
    const len = Math.hypot(n2.x - n1.x, n2.y - n1.y);
    if (len > MAX_STRUT_LENGTH || len < MIN_STRUT_LENGTH) return null;

    const exists = this.members.find(m => (m.n1 === n1 && m.n2 === n2) || (m.n1 === n2 && m.n2 === n1));
    if (exists) {
      if (exists.mat === mat) {
        this.toast('warn', '⧉', 'There is already a member there.');
        audio.playError();
        return null;
      }
      // Same span, different material: treat it as an upgrade.
      exists.mat = mat;
      audio.playPlace();
      this.toast('info', '🔧', `Swapped that member to <b>${MATERIALS[mat].name}</b>.`, 2200);
      return exists;
    }

    const member = {
      n1, n2, mat,
      restLen: len,
      broken: false,
      stress: 0,
      force: 0,
      peak: 0,
      born: this.time,
      warnPhase: Math.random() * 6.28
    };
    this.members.push(member);
    audio.playPlace();
    return member;
  }

  // ---------- moving a joint (resizes every member attached to it) ----------

  /** Why this joint may not sit at (x, y), or null if it may. */
  moveBlockedReason(node, x, y) {
    if (this.zoneViolation(y)) return this.level.constraint.blurb;

    for (const other of this.nodes) {
      if (other === node) continue;
      if (Math.hypot(other.x - x, other.y - y) < 0.3) return 'Another joint is already there';
    }

    for (const m of this.members) {
      if (m.broken) continue;
      const isN1 = m.n1 === node, isN2 = m.n2 === node;
      if (!isN1 && !isN2) continue;
      const other = isN1 ? m.n2 : m.n1;
      const len = Math.hypot(other.x - x, other.y - y);
      if (len > MAX_STRUT_LENGTH) return `That stretches a member to ${len.toFixed(1)} m (max ${MAX_STRUT_LENGTH} m)`;
      if (len < MIN_STRUT_LENGTH) return `That squashes a member to ${len.toFixed(1)} m (min ${MIN_STRUT_LENGTH} m)`;
    }
    return null;
  }

  beginMove(node) {
    this.pendingSnapshot = this.snapshotState();
    this.createdStartNode = null;
    this.moveState = {
      node,
      origX: node.x, origY: node.y,
      origCost: this.calculateCost(),
      lens: this.members
        .filter(m => !m.broken && (m.n1 === node || m.n2 === node))
        .map(m => ({ m, origLen: m.restLen })),
      reason: null
    };
    audio.playClick();
  }

  /** Drag the joint live so the attached members visibly re-length under the cursor. */
  updateMove(x, y) {
    const s = this.moveState;
    if (!s) return;
    const snap = this.snapGrid(x, y);
    s.reason = this.moveBlockedReason(s.node, snap.x, snap.y);
    s.node.x = snap.x; s.node.y = snap.y;
    s.node.oldX = snap.x; s.node.oldY = snap.y;
    s.lens.forEach(({ m }) => {
      m.restLen = Math.hypot(m.n2.x - m.n1.x, m.n2.y - m.n1.y);
    });
    this.updateBudget();
  }

  cancelMove() {
    const s = this.moveState;
    if (!s) return;
    s.node.x = s.origX; s.node.y = s.origY;
    s.node.oldX = s.origX; s.node.oldY = s.origY;
    s.lens.forEach(({ m, origLen }) => { m.restLen = origLen; });
    this.moveState = null;
    this.pendingSnapshot = null;
    this.updateBudget();
    this.markDirty();
  }

  finishMove() {
    const s = this.moveState;
    if (!s) return;
    const moved = s.node.x !== s.origX || s.node.y !== s.origY;

    if (s.reason) {
      this.toast('bad', '⛔', s.reason + '.', 3600);
      audio.playError();
      this.cancelMove();
      return;
    }
    if (!moved) { this.cancelMove(); return; }

    const delta = this.calculateCost() - s.origCost;
    this.moveState = null;
    this.commitOrRollback(true);
    this.markDirty();
    audio.playPlace();
    if (delta !== 0) {
      this.toast('info', '✥', `Joint moved — cost ${delta > 0 ? 'up' : 'down'} <b>$${Math.abs(delta).toLocaleString()}</b>.`, 2600);
    }
  }

  eraseAt(x, y) {
    const m = this.findNearestMember(x, y, 0.35);
    if (m) {
      this.saveSnapshot();
      this.members = this.members.filter(item => item !== m);
      this.cleanUnconnectedNodes();
      this.updateBudget();
      this.markDirty();
      audio.playErase();
      return;
    }
    const n = this.findNearestNode(x, y, 0.4);
    if (n && !n.fixed) {
      this.saveSnapshot();
      this.members = this.members.filter(item => item.n1 !== n && item.n2 !== n);
      this.nodes = this.nodes.filter(item => item !== n);
      this.updateBudget();
      this.markDirty();
      audio.playErase();
      return;
    }
    if (n && n.fixed) {
      this.toast('warn', '⚓', 'Anchor points are bolted to the rock — they cannot be removed.', 2400);
      audio.playError();
    }
  }

  cleanUnconnectedNodes() {
    this.nodes = this.nodes.filter(n =>
      n.fixed || n === this.dragStartNode || this.members.some(m => m.n1 === n || m.n2 === n));
  }

  findNearestNode(x, y, maxDist) {
    let target = null, minDist = maxDist;
    for (const n of this.nodes) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < minDist) { minDist = d; target = n; }
    }
    return target;
  }

  findNearestMember(x, y, maxDist) {
    let target = null, minDist = maxDist;
    for (const m of this.members) {
      if (m.broken) continue;
      const d = this.pointDistToSegment(x, y, m.n1.x, m.n1.y, m.n2.x, m.n2.y);
      if (d < minDist) { minDist = d; target = m; }
    }
    return target;
  }

  pointDistToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = clamp(t, 0, 1);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  calculateCost() {
    return Math.round(this.members.reduce((sum, m) => sum + m.restLen * MATERIALS[m.mat].cost, 0));
  }

  updateBudget() {
    const cost = this.calculateCost();
    const budget = this.level.budget;
    // With no ceiling, the sandbox meter tracks par instead of an arbitrary scale.
    const reference = (isUnlimited(this.level) && this.level.par) ? this.level.par : budget;
    const pct = reference >= UNLIMITED_BUDGET ? Math.min(100, cost / 6000 * 100) : (cost / reference) * 100;

    const el = document.getElementById('ui-budget');
    el.innerText = '$' + cost.toLocaleString();
    el.style.color = cost > reference ? 'var(--danger)' : 'var(--text)';

    const bar = document.getElementById('ui-budget-bar');
    bar.style.width = Math.min(100, pct) + '%';
    bar.className = 'meter-fill ' + (pct > 100 ? 'bad' : pct > 85 ? 'warn' : 'good');

    // Distribute dead load of every member onto its two joints
    this.nodes.forEach(n => n.mass = n.fixed ? 0 : 5);
    this.members.forEach(m => {
      const halfMass = (m.restLen * MATERIALS[m.mat].mass) * 0.5;
      if (!m.n1.fixed) m.n1.mass += halfMass;
      if (!m.n2.fixed) m.n2.mass += halfMass;
    });
  }

  // ==========================================================
  //  STRUCTURAL ANALYSIS (drives the checklist and coaching)
  // ==========================================================
  analyze() {
    const t = this.level.terrain;
    const roadMembers = this.members.filter(m => m.mat === 'road' && !m.broken);

    // 1. Does roadway cover the whole gap? Merge x-intervals and look for holes.
    const spans = roadMembers
      .map(m => [Math.min(m.n1.x, m.n2.x), Math.max(m.n1.x, m.n2.x)])
      .sort((a, b) => a[0] - b[0]);
    let covered = 0, cursor = t.leftBank, biggestGap = 0;
    for (const [a, b] of spans) {
      if (b <= cursor) continue;
      if (a > cursor) biggestGap = Math.max(biggestGap, Math.min(a, t.rightBank) - cursor);
      const from = Math.max(a, cursor);
      const to = Math.min(b, t.rightBank);
      if (to > from) covered += to - from;
      cursor = Math.max(cursor, Math.min(b, t.rightBank));
      if (cursor >= t.rightBank) break;
    }
    if (cursor < t.rightBank) biggestGap = Math.max(biggestGap, t.rightBank - cursor);
    const gapWidth = spanOf(this.level);
    const deckSpans = roadMembers.length > 0 && covered >= gapWidth - 0.26;

    // 2. Is every part of the structure tied back to an anchor? (union-find)
    const idx = new Map(this.nodes.map((n, i) => [n, i]));
    const parent = this.nodes.map((_, i) => i);
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
    this.members.forEach(m => { if (!m.broken) union(idx.get(m.n1), idx.get(m.n2)); });
    const anchoredRoots = new Set();
    this.nodes.forEach((n, i) => { if (n.fixed) anchoredRoots.add(find(i)); });
    const floatingNodes = this.nodes.filter((n, i) => !n.fixed && !anchoredRoots.has(find(i)));
    const floating = floatingNodes.length;

    // 3. Deck joints with no diagonal bracing behave like a plank, not a truss.
    let unbraced = 0;
    const deckNodes = new Set();
    roadMembers.forEach(m => { deckNodes.add(m.n1); deckNodes.add(m.n2); });
    deckNodes.forEach(n => {
      if (n.fixed) return;
      const attached = this.members.filter(m => !m.broken && (m.n1 === n || m.n2 === n));
      if (!attached.some(m => m.mat !== 'road')) unbraced++;
    });

    // 4. Loose ends and buckling-prone struts
    // A joint holding a single member is a loose end: that member is carrying nothing,
    // it is just dead weight hanging off the structure.
    const looseNodes = this.nodes.filter(n =>
      !n.fixed && this.members.filter(m => !m.broken && (m.n1 === n || m.n2 === n)).length === 1);
    const dangling = looseNodes.length;

    // Members that reach a loose end or sit in a floating island do no useful work.
    const floatingSet = new Set(floatingNodes);
    const looseSet = new Set(looseNodes);
    const deadMembers = this.members.filter(m => !m.broken &&
      (looseSet.has(m.n1) || looseSet.has(m.n2) || floatingSet.has(m.n1) || floatingSet.has(m.n2)));
    const longStruts = this.members.filter(m => !m.broken && m.mat !== 'cable' && m.restLen > 3.0).length;
    const woodLen = this.members.filter(m => m.mat === 'wood').reduce((s, m) => s + m.restLen, 0);
    const totalLen = this.members.reduce((s, m) => s + m.restLen, 0) || 1;

    const live = this.members.filter(m => !m.broken);
    const bracing = live.filter(m => m.mat !== 'road');
    const cost = this.calculateCost();
    return {
      cost,
      bracingCount: bracing.length,
      bracingLength: bracing.reduce((s, m) => s + m.restLen, 0),
      roadOnly: live.length > 0 && bracing.length === 0,
      overBudget: cost > this.level.budget,
      deckSpans, biggestGap, coveredPct: clamp(covered / gapWidth, 0, 1),
      floating, floatingNodes, looseNodes, deadMembers, unbraced, dangling, longStruts,
      woodShare: woodLen / totalLen,
      memberCount: this.members.filter(m => !m.broken).length,
      ready: deckSpans && floating === 0
    };
  }

  /** Redraw the on-screen checklist from the current analysis. */
  renderObjectives() {
    const a = this.analysis;
    if (!a) return;
    const budgetUnlimited = isUnlimited(this.level);

    const items = [
      {
        state: a.memberCount > 0 ? 'done' : '',
        text: a.memberCount > 0 ? `Structure started — ${a.memberCount} members` : 'Drag on the grid to place your first member'
      },
      {
        state: a.deckSpans ? 'done' : (a.coveredPct > 0 ? 'warn' : ''),
        text: a.deckSpans
          ? 'Roadway spans the full gap'
          : `Roadway spans the gap <b>(${Math.round(a.coveredPct * 100)}%)</b>`
      },
      {
        state: a.floating === 0 ? (a.memberCount > 0 ? 'done' : '') : 'bad',
        text: a.floating === 0
          ? 'Everything is tied to an anchor'
          : `${a.floating} joint${a.floating > 1 ? 's are' : ' is'} floating free of any anchor`
      },
      {
        state: a.bracingCount > 0 ? 'done' : (a.memberCount > 0 ? 'bad' : ''),
        text: a.bracingCount > 0
          ? `Bracing added — ${a.bracingCount} member${a.bracingCount > 1 ? 's' : ''}`
          : 'Brace it with a <b>second material</b> — Wood <kbd>2</kbd>, Steel <kbd>3</kbd> or Cable <kbd>4</kbd>'
      },
      {
        state: a.unbraced === 0 ? (a.deckSpans && a.bracingCount > 0 ? 'done' : '') : 'warn',
        text: a.unbraced === 0
          ? 'Every deck joint is triangulated'
          : `${a.unbraced} deck joint${a.unbraced > 1 ? 's need' : ' needs'} diagonal bracing`
      }
    ];

    if (a.dangling > 0) {
      items.push({
        state: 'warn',
        text: `${a.dangling} loose end${a.dangling > 1 ? 's' : ''} <b>!</b> — connected at one end only, so ${a.dangling > 1 ? 'they carry' : 'it carries'} nothing`
      });
    }

    if (!budgetUnlimited) {
      items.push({
        state: a.overBudget ? 'bad' : (a.memberCount > 0 ? 'done' : ''),
        text: a.overBudget
          ? `Over budget by <b>$${(a.cost - this.level.budget).toLocaleString()}</b>`
          : `Within budget — <b>$${(this.level.budget - a.cost).toLocaleString()}</b> left`
      });
    } else if (this.level.par) {
      const overPar = a.cost > this.level.par;
      items.push({
        state: overPar ? 'warn' : (a.memberCount > 0 ? 'done' : ''),
        text: overPar
          ? `Over par by <b>$${(a.cost - this.level.par).toLocaleString()}</b> — still buildable, but no third star`
          : `Under par — <b>$${(this.level.par - a.cost).toLocaleString()}</b> to spare`
      });
    }

    const html = items.map(i =>
      `<div class="obj-item ${i.state}"><div class="tick">${i.state === 'bad' ? '!' : i.state === 'warn' ? '·' : '✓'}</div><div>${i.text}</div></div>`
    ).join('');

    const done = items.filter(i => i.state === 'done').length;
    const count = document.getElementById('obj-count');
    count.textContent = `${done}/${items.length}`;
    count.className = 'obj-count' + (items.some(i => i.state === 'bad') ? ' bad' : done === items.length ? ' done' : '');

    const list = document.getElementById('obj-list');
    if (list.dataset.sig !== html) {
      list.dataset.sig = html;
      list.innerHTML = html;
    }
  }

  renderTooltip(sx, sy) {
    const tip = document.getElementById('hud-tooltip');
    const m = this.hoverMember;

    if (m && !m.broken) {
      const mat = MATERIALS[m.mat];
      const isComp = m.force < -60;
      const isTens = m.force > 60;
      const pct = Math.round(m.stress * 100);
      const color = stressColor(m.force, m.stress);
      const capacity = isComp
        ? Math.round(bucklingCapacity(m.mat, m.restLen))
        : mat.maxTension;

      let stateLine;
      if (this.mode !== 'test') {
        stateLine = `<div class="tt-row">Buckling-safe up to <span>${(capacity / 1000).toFixed(0)} kN</span> at this length</div>`;
      } else {
        stateLine = `
          <div class="tt-row">${isComp ? 'Compression' : isTens ? 'Tension' : 'Almost unloaded'}:
            <span style="color:${color}">${(Math.abs(m.force) / 1000).toFixed(1)} kN</span></div>
          <div class="tt-row">Capacity used: <span>${pct}%</span> ${pct >= 85 ? '⚠' : ''}</div>
          <div class="tt-bar"><div style="width:${Math.min(100, pct)}%; background:${color}"></div></div>`;
      }

      tip.style.display = 'block';
      tip.style.left = `${sx}px`;
      tip.style.top = `${sy}px`;
      tip.innerHTML = `
        <div class="tt-head"><span class="tt-swatch" style="background:${mat.color}"></span>${mat.name} · ${m.restLen.toFixed(1)} m</div>
        <div class="tt-row">Cost: <span>$${Math.round(m.restLen * mat.cost).toLocaleString()}</span></div>
        ${stateLine}`;
      return;
    }

    const n = this.hoverNode;
    if (n && this.mode !== 'test') {
      const count = this.members.filter(mm => !mm.broken && (mm.n1 === n || mm.n2 === n)).length;
      tip.style.display = 'block';
      tip.style.left = `${sx}px`;
      tip.style.top = `${sy}px`;
      const a = this.analysis;
      const isFloating = a && a.floatingNodes && a.floatingNodes.includes(n);
      const isLoose = count === 1;

      let fault = '';
      if (isFloating) {
        fault = `<div class="tt-row" style="color:#fca5a5">⚠ <b>Not connected to any anchor.</b><br>This whole section will fall when tested.</div>`;
      } else if (isLoose) {
        fault = `<div class="tt-row" style="color:#fcd34d">! <b>Loose end.</b><br>Only one member reaches this joint, so it<br>carries no load. Connect it to something else,<br>or erase it.</div>`;
      }

      tip.innerHTML = n.fixed
        ? `<div class="tt-head">⚓ Anchor point</div><div class="tt-row">Bolted to bedrock — carries any load</div>`
        : `<div class="tt-head">Joint</div>
           <div class="tt-row"><span>${count}</span> member${count === 1 ? '' : 's'} connected</div>${fault}`;
      return;
    }

    tip.style.display = 'none';
  }

  // ==========================================================
  //  FRAME
  // ==========================================================
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.viewW, this.viewH);

    ctx.save();

    // Camera punches in toward whatever just failed, then eases back out.
    if (this.zoom > 0.002) {
      const f = this.toScreen(this.zoomFocus.x, this.zoomFocus.y);
      const s = 1 + this.zoom * 0.13;
      ctx.translate(f.x, f.y);
      ctx.scale(s, s);
      ctx.translate(-f.x, -f.y);
    }
    if (this.shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      ctx.rotate((Math.random() - 0.5) * this.shake * 0.0009);
    }

    this.drawSky(ctx);
    this.drawClouds(ctx);
    this.drawHills(ctx);
    this.drawGorgeDepth(ctx);
    this.drawWater(ctx);
    this.drawCliffs(ctx);
    this.drawPier(ctx);
    this.drawPylons(ctx);
    this.drawZone(ctx);
    this.drawGrid(ctx);
    this.drawMembers(ctx);
    this.drawConnectionWarnings(ctx);
    this.drawGhostStrut(ctx);
    this.drawNodes(ctx);
    this.drawMovePreview(ctx);
    this.drawVehicle(ctx);
    this.drawParticles(ctx);
    this.drawShockwaves(ctx);

    ctx.restore();
    this.drawOverlayFX(ctx);
  }

  loop(timestamp) {
    const dt = clamp((timestamp - this.lastTime) / 1000, 0, 0.05);
    this.lastTime = timestamp;
    this.time += dt;
    this.frameDt = dt;

    // Presentation decay
    this.shake *= Math.pow(0.0016, dt);
    this.flash = Math.max(0, this.flash - dt * 1.15);
    this.zoom *= Math.pow(0.035, dt);
    if (this.slowmo > 0) this.slowmo = Math.max(0, this.slowmo - dt * 0.75);
    if (this.cascade > 0) this.cascade = Math.max(0, this.cascade - dt * 1.2);

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      this.shockwaves[i].t += dt;
      if (this.shockwaves[i].t > this.shockwaves[i].life) this.shockwaves.splice(i, 1);
    }

    this.stepPhysics(dt);
    this.updateParticles(dt);

    // Exhaust trail
    const v = this.vehicle;
    if (v && !v.crashed && !v.escaped) {
      v.exhaustTimer -= dt;
      if (v.exhaustTimer <= 0) {
        v.exhaustTimer = 0.12;
        const tail = v.width * 0.5;           // the pipe is at the back of the body, wherever it is pointing
        this.emitExhaust(v.x - tail * Math.cos(v.tilt), v.y - tail * Math.sin(v.tilt) - 0.05);
      }
    }

    // Checklist analysis runs a few times a second, not every frame
    if (this.mode === 'build' && this.time >= this.analysisDue) {
      this.analysisDue = this.time + 0.2;
      this.analysis = this.analyze();
      this.renderObjectives();
    }

    this.render();
    requestAnimationFrame(this.loop);
  }
}
