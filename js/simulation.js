/**
 * TRUSSCRAFT — LOAD TEST
 * The structural solver, the test run, failure handling and particle effects.
 * The vehicle itself is in vehicle.js. Adds its methods to TrussCraftApp (see app.js).
 */

Object.assign(TrussCraftApp.prototype, {
  // ==========================================================
  //  LOAD TEST (SIMULATION)
  // ==========================================================
  startSimulation() {
    audio.init();
    if (this.moveState) this.finishMove();
    if (this.dragStartNode) this.abortDrag();
    const a = this.analysis = this.analyze();

    if (this.members.length === 0) {
      this.toast('bad', '✋', 'Nothing to test yet — drag on the grid to lay some members.');
      this.nudgeButton('btn-test');
      audio.playError();
      return;
    }
    if (!this.members.some(m => m.mat === 'road')) {
      this.toast('bad', '🛣', 'Vehicles can only drive on <b>roadway</b>. Select the Roadway material and lay a deck across the gap.', 5000);
      this.nudgeButton('btn-test');
      audio.playError();
      return;
    }

    // Warnings that do not block the test — the failure itself is the lesson.
    if (!a.deckSpans) {
      this.toast('warn', '⚠', `The roadway leaves a <b>${a.biggestGap.toFixed(1)} m</b> gap. Testing anyway — watch what happens.`, 4200);
    } else if (a.floating > 0) {
      this.toast('warn', '⚠', `${a.floating} joint${a.floating > 1 ? 's are' : ' is'} not connected to any anchor. That section will simply fall.`, 4200);
    } else if (a.dangling > 0) {
      this.toast('warn', '⚠', `${a.dangling} loose end${a.dangling > 1 ? 's are' : ' is'} connected at one end only and ${a.dangling > 1 ? 'carry' : 'carries'} no load — you are paying for ${a.dangling > 1 ? 'them' : 'it'} for nothing.`, 4400);
    } else if (a.unbraced > 2) {
      this.toast('warn', '⚠', `${a.unbraced} deck joints have no diagonal bracing — expect heavy sagging.`, 4200);
    }

    this.preTestState = this.snapshotState();
    this.testStartAnalysis = a;
    this.testStartInclined = this.members.some(m => m.mat === 'road' && Math.abs(m.n2.y - m.n1.y) > 0.2);
    this.mode = 'test';
    this.maxStressObserved = 0;
    this.firstFailure = null;
    this.brokenCount = 0;
    this.resultShown = false;
    this.testElapsed = 0;
    this.physicsClock = 0;
    this.maxSag = 0;
    this.currentSag = 0;
    this.sagWarned = false;
    this.deckCracked = false;
    this.resetPresentation();
    this.members.forEach(m => { m.peak = 0; m.broken = false; });
    this.nodes.forEach(n => { n.restY = n.y; });

    document.getElementById('btn-test').style.display = 'none';
    document.getElementById('btn-edit').style.display = 'flex';
    document.getElementById('hud-analysis').classList.add('show');
    document.getElementById('hud-tooltip').style.display = 'none';
    this.refreshHistoryButtons();
    this.updateCursor();
    this.renderObjectives();

    const t = this.level.terrain;
    this.vehicle = new Vehicle(this.level.carMass, t);

    audio.startEngine();
  },

  stopSimulation() {
    audio.init();
    audio.stopEngine();
    this.mode = 'build';
    document.getElementById('btn-test').style.display = 'flex';
    document.getElementById('btn-edit').style.display = 'none';
    document.getElementById('hud-analysis').classList.remove('show');

    // Rewind to the exact structure the student had before the test ran.
    if (this.preTestState) this.restoreSnapshot(this.preTestState);
    this.vehicle = null;
    this.resetPresentation();
    this.setStressMeter(0);
    this.refreshHistoryButtons();
    this.updateCursor();
    this.markDirty();
  },

  nudgeButton(id) {
    const el = document.getElementById(id);
    el.classList.remove('nudge');
    void el.offsetWidth;
    el.classList.add('nudge');
  },

  setStressMeter(pct) {
    const el = document.getElementById('ui-stress');
    el.innerText = `${pct}%`;
    el.style.color = pct > 90 ? 'var(--danger)' : pct > 70 ? 'var(--warning)' : pct > 0 ? 'var(--success)' : 'var(--text)';
    document.getElementById('ui-stress-bar').style.width = Math.min(100, pct) + '%';
  },

  /**
   * Advance the test by one frame's worth of simulated time, in fixed solver steps. The frame
   * only decides how many steps to run; the step itself never changes, so results do not depend
   * on frame rate. Slow motion and 2x scale the simulated time, not the step.
   */
  stepPhysics(dt) {
    if (this.mode !== 'test') return;

    const timeScale = this.slowmo > 0 ? lerp(0.16, 1, 1 - this.slowmo) : 1;
    this.physicsClock += dt * this.simSpeed * timeScale;
    let steps = Math.floor(this.physicsClock / PHYSICS_DT + 1e-6);
    if (steps > MAX_STEPS_PER_FRAME) { steps = MAX_STEPS_PER_FRAME; this.physicsClock = 0; }
    else this.physicsClock = Math.max(0, this.physicsClock - steps * PHYSICS_DT);

    for (let i = 0; i < steps; i++) this.solveStep(PHYSICS_DT);
    this.testElapsed += steps * PHYSICS_DT;

    this.measureSag();
    this.setStressMeter(Math.min(100, Math.round(this.maxStressObserved * 100)));
    this.updateAnalysisPanel();

    // Nothing has happened for a long time — the vehicle is probably stuck.
    if (this.vehicle && !this.vehicle.crashed && !this.vehicle.escaped &&
        this.testElapsed > STUCK_TIMEOUT && !this.resultShown) {
      this.vehicle.crashed = true;
      audio.stopEngine();
      audio.playFailure();
      this.showDebrief(false);
    }
  },

  /** One fixed solver step: integrate the joints, relax the members, move the vehicle. */
  solveStep(subDt) {
    {
      // --- 1. Verlet integration ---
      for (const n of this.nodes) {
        if (n.fixed) continue;
        const vx = (n.x - n.oldX) * 0.9992;
        const vy = (n.y - n.oldY) * 0.9992;
        n.oldX = n.x;
        n.oldY = n.y;
        n.x += vx;
        n.y += vy + GRAVITY * subDt * subDt;
      }

      // --- 2. Constraint relaxation, axial force, Euler buckling ---
      let peakStress = 0;
      for (const m of this.members) {
        if (m.broken) continue;
        const dx = m.n2.x - m.n1.x;
        const dy = m.n2.y - m.n1.y;
        const dist = Math.hypot(dx, dy);
        const delta = dist - m.restLen;
        const mat = MATERIALS[m.mat];

        // A cable pushed on simply goes slack — it carries nothing.
        if (mat.isCable && delta < 0) { m.stress = 0; m.force = 0; continue; }

        const stiffness = 0.88;
        const diff = (delta / (dist || 0.001)) * stiffness;
        const invM1 = m.n1.fixed ? 0 : 1 / (m.n1.mass || 1);
        const invM2 = m.n2.fixed ? 0 : 1 / (m.n2.mass || 1);
        const sumInv = invM1 + invM2;

        if (sumInv > 0) {
          const shift = diff / sumInv;
          if (!m.n1.fixed) { m.n1.x += dx * shift * invM1; m.n1.y += dy * shift * invM1; }
          if (!m.n2.fixed) { m.n2.x -= dx * shift * invM2; m.n2.y -= dy * shift * invM2; }
        }

        const strain = delta / m.restLen;
        const force = strain * ELASTIC_MODULUS;
        m.force = force;

        let capacityRatio;
        if (force >= 0) {
          capacityRatio = force / mat.maxTension;
        } else {
          // Euler buckling: critical load falls steeply with length.
          capacityRatio = Math.abs(force) / (bucklingCapacity(m.mat, m.restLen) || 1);
        }

        m.stress = capacityRatio;
        if (capacityRatio > m.peak) m.peak = capacityRatio;
        if (capacityRatio > peakStress) peakStress = capacityRatio;
        if (capacityRatio > 0.82) audio.playCreak();

        if (capacityRatio >= 1.0) this.breakMember(m, force);
      }

      // --- 3. Vehicle dynamics & load transfer ---
      if (this.vehicle && !this.vehicle.crashed) this.stepVehicle(subDt);

      this.maxStressObserved = Math.max(this.maxStressObserved, peakStress);
    }
  },

  /**
   * Deflection the deck can take before the slab cracks, as a fraction of span.
   * The solver models members as pin-jointed axial links, which gives a straight
   * line of deck members no bending stiffness at all — left alone it behaves like
   * a hanging cable rather than a road. This limit stands in for the bending
   * strength a real deck slab has, and is what stops a flat roadway being a bridge.
   */
  sagLimit() {
    return Math.max(0.12, spanOf(this.level) / SAG_SPAN_RATIO);
  },

  /** How far the roadway has dropped below where it was built. */
  measureSag() {
    let sag = 0, worst = null;
    for (const m of this.members) {
      if (m.mat !== 'road' || m.broken) continue;
      for (const n of [m.n1, m.n2]) {
        if (n.fixed || n.restY === undefined) continue;
        const d = n.y - n.restY;
        if (d > sag) { sag = d; worst = n; }
      }
    }
    this.currentSag = sag;
    if (sag > this.maxSag) this.maxSag = sag;

    const limit = this.sagLimit();

    if (this.maxSag > limit * SAG_WARN_FRACTION && !this.sagWarned) {
      this.sagWarned = true;
      this.toast('warn', '📐', `The deck is bending badly — <b>${this.maxSag.toFixed(2)} m</b> of ${limit.toFixed(2)} m. Much more and the slab will crack.`, 4600);
      audio.playCreak();
    }

    if (sag > limit && worst && !this.deckCracked) this.crackDeck(worst, sag);
  },

  /**
   * The deck has bent further than the slab can take, so it fractures at the
   * point of greatest deflection — the same place a real slab would fail.
   */
  crackDeck(node, sag) {
    const candidates = this.members.filter(m =>
      m.mat === 'road' && !m.broken && (m.n1 === node || m.n2 === node));
    if (!candidates.length) return;

    this.deckCracked = true;
    if (!this.firstFailure) {
      this.firstFailure = {
        mat: 'road',
        len: candidates[0].restLen,
        type: 'deflection',
        sag: sag,
        limit: this.sagLimit(),
        x: node.x, y: node.y
      };
      this.slowmo = 1;
      this.toast('bad', '💥', `The deck slab <b>cracked</b> after bending ${sag.toFixed(2)} m. A flat roadway has nothing to stop it flexing.`, 5000);
    }
    candidates.forEach(m => {
      m.broken = true;
      this.brokenCount++;
      this.emitDebris(m, 1.6);
    });
    audio.playGroan();
    audio.playSnap();
    this.impact(node.x, node.y, 1.5);   // the slab letting go is the big one
  },

  breakMember(m, force) {
    m.broken = true;
    this.brokenCount++;
    if (!this.firstFailure) {
      this.firstFailure = {
        mat: m.mat,
        len: m.restLen,
        type: force < 0 ? 'compression' : 'tension',
        x: (m.n1.x + m.n2.x) / 2,
        y: (m.n1.y + m.n2.y) / 2
      };
      this.slowmo = 1;
      this.toast('bad', '💥', `A <b>${m.restLen.toFixed(1)} m ${MATERIALS[m.mat].name.toLowerCase()}</b> member failed in <b>${force < 0 ? 'compression' : 'tension'}</b>.`, 4000);
    }
    audio.playSnap();
    this.emitDebris(m, 1);
    this.impact((m.n1.x + m.n2.x) / 2, (m.n1.y + m.n2.y) / 2, 1);
  },

  stepVehicle(subDt) {
    const v = this.vehicle;
    const t = this.level.terrain;

    v.step(subDt, this.members, t);

    // The force each wheel is really carrying goes into the deck joints under it.
    for (const c of v.contacts) {
      if (!c.member) continue;
      const nudge = c.load * subDt * DECK_LOAD_GAIN;
      if (!c.member.n1.fixed) c.member.n1.y += (1 - c.t) * nudge;
      if (!c.member.n2.fixed) c.member.n2.y += c.t * nudge;
    }
    if (v.landing > 2.5) audio.playThud();
    v.landing = 0;

    // --- Failure: fell into the chasm ---
    if (v.y > t.waterY - 0.2 && !v.splashed) {
      v.splashed = true;
      audio.playSplash();
      this.emitSplash(v.x, t.waterY);
      this.impact(v.x, t.waterY, 1.2);
    }
    if (v.y > t.waterY + 0.5 && !v.crashed) {
      v.crashed = true;
      audio.stopEngine();
      audio.playFailure();
      this.showDebrief(false);
    }

    // --- Success: reached the far bank ---
    if (v.x > t.rightBank + 1.6 && !v.escaped) {
      v.escaped = true;
      audio.stopEngine();
      audio.playVictory();
      this.emitConfetti();
      this.showDebrief(true);
    }

    audio.updateEngine(v.grounded ? 1 : 0.2);
  },

  updateAnalysisPanel() {
    const v = this.vehicle;
    const t = this.level.terrain;
    if (v) {
      const total = (t.rightBank + 1.6) - v.startX;
      const pct = clamp((v.x - v.startX) / total, 0, 1) * 100;
      document.getElementById('an-progress').innerText = Math.round(pct) + '%';
      const bar = document.getElementById('an-progress-bar');
      bar.style.width = pct + '%';
      bar.style.background = v.crashed ? 'var(--danger)' : v.escaped ? 'var(--success)' : 'var(--accent)';
    }

    const sagEl = document.getElementById('an-sag');
    const sag = this.maxSag || 0;
    const limit = this.sagLimit();
    sagEl.innerText = sag.toFixed(2) + ' m';
    sagEl.style.color = sag >= limit ? 'var(--danger)' : sag >= limit * SAG_WARN_FRACTION ? 'var(--warning)' : 'var(--success)';

    const live = this.members.filter(m => !m.broken);
    const atRisk = live.filter(m => m.stress >= RISK_THRESHOLD);
    const riskEl = document.getElementById('an-risk');
    riskEl.innerText = atRisk.length;
    riskEl.style.color = atRisk.length ? 'var(--warning)' : 'var(--text)';

    const brokenEl = document.getElementById('an-broken');
    brokenEl.innerText = this.brokenCount;
    brokenEl.style.color = this.brokenCount ? 'var(--danger)' : 'var(--text)';

    const worst = live.slice().sort((a, b) => b.stress - a.stress).slice(0, 3);
    const html = worst.length
      ? `<div class="hud-title" style="margin-bottom:5px;">Hardest working members</div>` + worst.map(m => {
          const pct = Math.round(m.stress * 100);
          const col = stressColor(m.force, m.stress);
          return `<div class="worst-row">
              <div class="worst-dot" style="background:${col}"></div>
              <div class="worst-name">${MATERIALS[m.mat].short} ${m.restLen.toFixed(1)}m · ${m.force < 0 ? 'comp' : 'tens'}</div>
              <div class="worst-pct" style="color:${col}">${pct}%</div>
            </div>`;
        }).join('')
      : '';
    const el = document.getElementById('an-worst');
    if (el.dataset.sig !== html) { el.dataset.sig = html; el.innerHTML = html; }
  },

  // ==========================================================
  //  PARTICLE EFFECTS
  // ==========================================================
  addParticle(p) {
    if (this.particles.length > 700) this.particles.shift();
    this.particles.push(p);
  },

  /** Expanding pressure ring from a failure point. */
  addShockwave(x, y, power = 1) {
    this.shockwaves.push({ x, y, t: 0, life: 0.26 + 0.08 * power, speed: 2.4 + 1.6 * power });
    if (this.shockwaves.length > 8) this.shockwaves.shift();
  },

  /**
   * One place to escalate everything that makes a failure feel violent.
   * Successive breaks stack, so a cascade hits harder than a single snap.
   */
  impact(x, y, power) {
    this.cascade = Math.min(6, this.cascade + 1);
    const stacked = power * (1 + this.cascade * 0.16);
    if (!this.reduceMotion) {
      this.shake = Math.min(34, this.shake + 9 * stacked);
      this.flash = Math.min(1, this.flash + 0.45 * stacked);
      this.zoom = Math.min(1, this.zoom + 0.5 * power);
      this.zoomFocus = { x, y };
    }
    this.addShockwave(x, y, stacked);
    if (this.time - (this.lastRumble || -1) > 0.12) {
      this.lastRumble = this.time;
      audio.playRumble(Math.min(1.2, stacked));
    }
  },

  emitDebris(member, power = 1) {
    const mx = (member.n1.x + member.n2.x) * 0.5;
    const my = (member.n1.y + member.n2.y) * 0.5;
    const color = MATERIALS[member.mat].color;
    const len = member.restLen;

    // Splinters / fragments thrown along the member axis
    for (let i = 0; i < Math.round(22 * power); i++) {
      const along = (Math.random() - 0.5) * len;
      const ux = (member.n2.x - member.n1.x) / (len || 1);
      const uy = (member.n2.y - member.n1.y) / (len || 1);
      this.addParticle({
        kind: 'debris',
        x: mx + ux * along, y: my + uy * along,
        vx: (Math.random() - 0.5) * 9 * power, vy: (Math.random() - 0.9) * 9 * power,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 20,
        size: (2 + Math.random() * 5) * power,
        color, life: 1, decay: 0.3 + Math.random() * 0.3
      });
    }
    // Billowing dust at the break
    for (let i = 0; i < Math.round(7 * power); i++) {
      this.addParticle({
        kind: 'dust',
        x: mx + (Math.random() - 0.5) * len * 0.9, y: my + (Math.random() - 0.5) * 1.2,
        vx: (Math.random() - 0.5) * 3, vy: -0.3 - Math.random() * 1.6,
        size: (16 + Math.random() * 30) * power,
        color: '#94a3b8', life: 1, decay: 0.45 + Math.random() * 0.25
      });
    }
    // Steel throws sparks
    if (member.mat === 'steel') {
      for (let i = 0; i < Math.round(18 * power); i++) {
        this.addParticle({
          kind: 'spark',
          x: mx, y: my,
          vx: (Math.random() - 0.5) * 11, vy: (Math.random() - 0.5) * 11,
          size: 1.5 + Math.random() * 2,
          color: '#fde68a', life: 1, decay: 2.2
        });
      }
    }
  },

  emitSplash(x, y) {
    for (let i = 0; i < 26; i++) {
      this.addParticle({
        kind: 'splash',
        x: x + (Math.random() - 0.5) * 0.9, y,
        vx: (Math.random() - 0.5) * 7, vy: -1.5 - Math.random() * 6,
        size: 2 + Math.random() * 3.5,
        color: Math.random() > 0.4 ? '#7dd3fc' : '#e0f2fe',
        life: 1, decay: 0.7
      });
    }
  },

  emitConfetti() {
    const t = this.level.terrain;
    const cols = ['#38bdf8', '#22c55e', '#f59e0b', '#a855f7', '#f8fafc'];
    for (let i = 0; i < 60; i++) {
      this.addParticle({
        kind: 'debris',
        x: t.rightBank + 1 + (Math.random() - 0.5) * 3,
        y: t.groundY - 3 - Math.random() * 3,
        vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 3,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 18,
        size: 3 + Math.random() * 3,
        color: cols[i % cols.length],
        life: 1, decay: 0.35
      });
    }
  },

  emitExhaust(x, y) {
    this.addParticle({
      kind: 'dust',
      x, y,
      vx: -0.6 - Math.random() * 0.5, vy: -0.35 - Math.random() * 0.4,
      size: 3 + Math.random() * 5,
      color: '#64748b', life: 0.55, decay: 1.1
    });
  },

  updateParticles(dt) {
    const waterY = this.level.terrain.waterY;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= p.decay * dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.rot !== undefined) p.rot += p.vr * dt;

      if (p.kind === 'debris') { p.vy += 12 * dt; p.vx *= 0.99; }
      else if (p.kind === 'dust') { p.vy -= 0.5 * dt; p.vx *= 0.96; p.size += 22 * dt; }
      else if (p.kind === 'spark') { p.vy += 6 * dt; p.vx *= 0.94; p.vy *= 0.94; }
      else if (p.kind === 'splash') { p.vy += 14 * dt; }

      // Debris hitting the water makes its own little splash
      if (p.kind === 'debris' && p.y > waterY && !p.splashed) {
        p.splashed = true;
        p.life = Math.min(p.life, 0.25);
        for (let k = 0; k < 3; k++) {
          this.addParticle({
            kind: 'splash', x: p.x, y: waterY,
            vx: (Math.random() - 0.5) * 2.5, vy: -1 - Math.random() * 2.5,
            size: 1.5 + Math.random() * 2, color: '#7dd3fc', life: 1, decay: 1.3
          });
        }
      }
    }
  },
});
