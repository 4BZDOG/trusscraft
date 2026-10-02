/**
 * TRUSSCRAFT — UI
 * Dialogs, briefs and debriefs, the guided tour, toasts, and keyboard / pointer input.
 * Adds its methods to TrussCraftApp (see app.js).
 */

Object.assign(TrussCraftApp.prototype, {
  // ==========================================================
  //  COMMUNICATION: MODALS, TOASTS, COACHING
  // ==========================================================
  showModal({ eyebrow = '', title = '', titleClass = '', body = '', tip = '', actions = [] }) {
    document.getElementById('modal-eyebrow').innerHTML = eyebrow;
    const titleEl = document.getElementById('modal-title');
    titleEl.innerHTML = title;
    titleEl.className = 'modal-title ' + titleClass;
    document.getElementById('modal-body').innerHTML =
      body + (tip ? `<div class="modal-tips"><b>💡 Engineering guide</b><br>${tip}</div>` : '');
    document.getElementById('modal-actions').innerHTML = actions.map(a =>
      `<button class="btn ${a.cls || ''}" onclick="${a.onclick}">${a.label}</button>`
    ).join('');
    document.getElementById('modal').classList.add('show');
    this.modalOpen = true;
    // Move focus into the dialog so keyboard and screen-reader users land in it. The card itself
    // takes focus, not a button: results appear mid-test, and a student pressing Space to stop
    // the test must not accidentally activate "Next challenge".
    const card = document.getElementById('modal-card');
    card.scrollTop = 0;
    card.focus({ preventScroll: true });
  },

  closeModal() {
    audio.init();
    const focused = document.activeElement;
    if (focused && document.getElementById('modal').contains(focused)) focused.blur();
    document.getElementById('modal').classList.remove('show');
    this.modalOpen = false;
    // First time in, walk the student round the interface they otherwise miss.
    if (this.level.tutorial && !this.tourSeen() && !this.coach && this.members.length === 0) {
      setTimeout(() => {
        // Re-check: another modal may have opened, or the level changed, in the meantime.
        if (!this.modalOpen && !this.coach && this.level.tutorial) this.startCoach();
      }, 260);
    }
  },

  showBrief() {
    const lvl = this.level;
    const budgetText = isUnlimited(lvl)
      ? (lvl.par ? 'Par $' + lvl.par.toLocaleString() : 'Unlimited')
      : '$' + lvl.budget.toLocaleString();
    this.showModal({
      eyebrow: `Mission brief · Key concept: ${lvl.concept}`,
      title: lvl.title,
      body: `
        <p style="color:var(--text); font-weight:600; margin-bottom:10px;">${lvl.goal}</p>
        <p>${lvl.desc}</p>
        <div class="stat-grid">
          <div class="stat-box">
            <div class="s-label">${isUnlimited(lvl) && lvl.par ? 'Target' : 'Budget'}</div>
            <div class="s-value" style="color:var(--accent)">${budgetText}</div>
          </div>
          <div class="stat-box">
            <div class="s-label">Test vehicle</div>
            <div class="s-value">${(lvl.carMass / 1000).toFixed(1)} t</div>
          </div>
          <div class="stat-box">
            <div class="s-label">Gap to cross</div>
            <div class="s-value">${spanOf(lvl).toFixed(0)} m</div>
          </div>
        </div>
        ${lvl.constraint ? `
          <div style="background:#2a0f0f; border-left:3px solid var(--danger); border-radius:0 8px 8px 0;
                      padding:11px 15px; margin:14px 0; font-size:0.83rem; color:#fecaca; line-height:1.55;">
            <b style="color:#fca5a5;">⛔ ${lvl.constraint.label}</b><br>
            ${lvl.constraint.blurb} on this level — the hatched red area is out of bounds.
          </div>` : ''}

        <div style="margin:16px 0 6px; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.08em;
                    color:var(--text-dim); font-weight:700;">Your materials</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(118px,1fr)); gap:7px;">
          ${Object.entries(MATERIALS).map(([key, m], i) => `
            <div style="background:#0a1120; border:1px solid var(--panel-border); border-radius:8px; padding:8px 10px;">
              <div style="display:flex; align-items:center; gap:6px; font-size:0.78rem; font-weight:600;">
                <span style="width:9px;height:9px;border-radius:2px;background:${m.color};flex-shrink:0;"></span>
                ${m.name}
                <span style="margin-left:auto; font-size:0.62rem; color:var(--text-dim);
                             border:1px solid var(--panel-border); border-radius:3px; padding:0 4px;">${i + 1}</span>
              </div>
              <div style="font-size:0.66rem; color:var(--text-dim); margin-top:3px;">$${m.cost}/m</div>
            </div>`).join('')}
        </div>
        <p style="font-size:0.78rem; color:var(--text-dim); margin-top:9px;">
          Roadway is only the surface the car drives on. <b style="color:var(--text)">It cannot hold itself
          up</b> — the other three are what carry the load.
        </p>

        <p style="font-size:0.8rem; color:var(--text-dim); margin-top:12px;">
          Drag on the grid to lay members, then press
          <b style="color:var(--accent)">Test bridge</b> when the checklist is satisfied.
        </p>`,
      tip: lvl.tip,
      actions: [
        { label: '📘 Engineering guide', cls: '', onclick: 'app.showHelp()' },
        { label: 'Start designing →', cls: 'btn-primary', onclick: 'app.closeModal()' }
      ]
    });
  },

  /** Plain-language explanation of why the test failed. */
  explainFailure(f, a) {
    if (!f) {
      if (a && !a.deckSpans) {
        return `No member broke — there was simply <b>no roadway to drive on</b>. Your deck stopped
                ${a.biggestGap.toFixed(1)} m short, and the vehicle drove straight off the end of it.
                Vehicles can only travel on <b>Roadway</b> members, so the deck has to run unbroken from
                one bank to the other before anything else matters.`;
      }
      if (a && a.floating > 0) {
        return `No member broke — but ${a.floating} joint${a.floating > 1 ? 's were' : ' was'} not connected
                back to any anchor, so that part of the structure was holding nothing up and simply fell away
                under the vehicle. Every joint needs a path of members leading to an anchor point.`;
      }
      return `No member actually snapped — the deck simply <b>deflected too far</b> and the vehicle
              dropped off it. The structure was too flexible: add more triangles so load is shared
              between members instead of bending a single long span.`;
    }
    if (f.type === 'deflection') {
      const ratio = Math.max(1, Math.round(spanOf(this.level) / f.sag));
      return `The <b>deck slab cracked</b>. It bent <b>${f.sag.toFixed(2)} m</b> where it is only rated to
              ${f.limit.toFixed(2)} m — about 1 part in ${ratio} of the span, when real road bridges are held
              to nearer 1 in 250.<br><br>
              A flat line of roadway has <b>nothing to stop it bending</b>. All it can do is stretch into a
              shallow curve and hang there like a rope, and roadway is not built to work that way.
              The fix is not more roadway or stronger roadway — it is to give the load
              <b>another path back to the anchors</b>. Add a chord of <b>Wood</b> or <b>Steel</b> above
              or below the deck and tie it to each deck joint with diagonals. The triangles you make turn
              bending into simple stretching and squashing, and the sag figure drops by a factor of ten or more.`;
    }

    const mat = MATERIALS[f.mat].name.toLowerCase();
    const len = f.len.toFixed(1);
    if (f.type === 'compression') {
      if (f.len > 2.6) {
        return `The first failure was a <b>${len} m ${mat} member in compression</b>, and at that length
                it <b>buckled</b> — it bowed out sideways rather than being crushed. Buckling resistance
                falls roughly with the square of length, so a ${len} m strut is only about
                ${(bucklingCapacity(f.mat, f.len) / MATERIALS[f.mat].maxComp).toFixed(2)}× as strong as a ${EULER_REF_LEN} m one.
                <b>Split it into two shorter struts</b> with a joint in the middle, braced sideways by a triangle.`;
      }
      return `The first failure was a short <b>${len} m ${mat} member crushed in compression</b>. It was
              short enough not to buckle, so it simply exceeded the material's strength.
              <b>Upgrade this one to steel</b>, or add a second load path so two members share the job.`;
    }
    if (f.mat === 'cable') {
      return `A <b>cable snapped in tension</b> after ${len} m of it took the full weight. Cables are strong
              but not infinite. <b>Add a second cable</b> to a nearby deck joint so the load splits between them.`;
    }
    return `The first failure was a <b>${len} m ${mat} member pulled apart in tension</b>. Unlike compression,
            tension failure does not care about length — it is purely strength. <b>Use steel</b> here, or add a
            parallel member so each carries half the pull.`;
  },

  /** Contextual coaching after a failed run, based on what the structure looked like. */
  diagnoseDesign(primaryIsDeck) {
    const a = this.analysis || this.analyze();
    const notes = [];
    if (!a.deckSpans && !primaryIsDeck) notes.push('The roadway did not reach all the way across — the vehicle drove off into the gap.');
    if (a.roadOnly) notes.push('The whole structure is roadway. Roadway is the surface, not the support — it needs wood, steel or cable bracing behind it.');
    if (a.unbraced > 0) notes.push(`${a.unbraced} deck joint${a.unbraced > 1 ? 's have' : ' has'} no diagonal bracing, so the deck is acting like a plank rather than a truss.`);
    if (a.longStruts > 0) notes.push(`${a.longStruts} member${a.longStruts > 1 ? 's are' : ' is'} over 3 m long — long members in compression buckle first.`);
    if (a.woodShare > 0.85 && this.level.carMass >= 1800) notes.push('Almost the whole structure is wood. The most heavily loaded members need steel.');
    // Skip when the deflection failure is already the headline — the post-collapse
    // figure is much larger than the value at the moment of cracking and reads as a contradiction.
    const deflectionWasPrimary = this.firstFailure && this.firstFailure.type === 'deflection';
    if (!primaryIsDeck && !deflectionWasPrimary && (this.maxSag || 0) > this.sagLimit()) {
      notes.push(`The deck deflected ${this.maxSag.toFixed(2)} m before it gave way — it was bending, not trussing.`);
    }
    return notes;
  },

  showDebrief(success) {
    if (this.resultShown) return;
    this.resultShown = true;

    const analysis = this.analysis || this.analyze();
    const primaryIsDeck = !this.firstFailure && !analysis.deckSpans;

    const cost = this.calculateCost();
    const budget = this.level.budget;
    const underBudget = cost <= budget;
    const peak = Math.min(100, Math.round(this.maxStressObserved * 100));
    // After the slab cracks the deck keeps falling, so the peak figure is meaningless.
    // Report the deflection at the moment it failed, which is what the limit refers to.
    const crackedAt = this.firstFailure && this.firstFailure.type === 'deflection' ? this.firstFailure.sag : null;
    const sag = crackedAt !== null ? crackedAt : (this.maxSag || 0);
    const stiff = sag < this.sagLimit();

    // The sandbox has no ceiling to come in under, so its stars are earned on a
    // stress margin and a par cost instead — otherwise all three would be free.
    const isSandbox = isUnlimited(this.level);
    const par = this.level.par || null;
    const stiffTarget = this.sagLimit() * SANDBOX_STIFF_FRACTION;
    const safeMargin = sag <= stiffTarget;
    const efficient = isSandbox
      ? (par !== null && cost <= par)
      : (underBudget && cost <= budget * EFFICIENCY_FRACTION);
    const secondCriterion = isSandbox ? safeMargin : underBudget;

    const stars = success ? (1 + (secondCriterion ? 1 : 0) + (efficient ? 1 : 0)) : 0;
    if (success) this.saveProgress(this.level.id, stars, cost);

    const criteria = [
      { won: success, label: 'Vehicle crossed safely' },
      { won: success && secondCriterion, label: isSandbox
          ? `Stiff build<br>(deck sag under ${stiffTarget.toFixed(2)} m)`
          : 'Finished under budget' },
      { won: success && efficient, label: isSandbox
          ? `Beat par<br>(build it for under $${par.toLocaleString()})`
          : `Efficient design<br>(build it for under $${Math.round(budget * EFFICIENCY_FRACTION).toLocaleString()})` }
    ];

    // Each card fades in on a stagger; earned ones then pop, flare and get a chime.
    const tally = success
      ? `<div class="star-tally">You earned <b>${stars} of 3</b> stars</div>`
      : `<div class="star-tally">No stars — the bridge did not survive</div>`;

    const starRow = tally + `
      <div class="stars-row">
        ${criteria.map((c, i) => `
          <div class="star-item ${c.won ? 'earned' : 'missed'}" style="--d:${(i * 0.22).toFixed(2)}s">
            <div class="st-icon">${c.won ? '★' : '☆'}</div>
            <div class="st-label">${c.label}</div>
          </div>`).join('')}
      </div>`;

    // Chime once per earned star, rising in pitch, timed to the pop animation.
    criteria.forEach((c, i) => {
      if (c.won) audio.tone(523.25 * Math.pow(2, i / 12 * 4), 0.5, 'sine', 0.16, null, i * 0.22 + 0.12);
    });

    const statGrid = `
      <div class="stat-grid">
        <div class="stat-box">
          <div class="s-label">Final cost</div>
          <div class="s-value" style="color:${underBudget ? 'var(--success)' : 'var(--danger)'}">$${cost.toLocaleString()}</div>
        </div>
        <div class="stat-box">
          <div class="s-label">${isSandbox ? 'Par' : 'Budget'}</div>
          <div class="s-value" style="color:var(--text-muted)">${isSandbox ? (par ? '$' + par.toLocaleString() : '∞') : '$' + budget.toLocaleString()}</div>
        </div>
        <div class="stat-box">
          <div class="s-label">Peak stress</div>
          <div class="s-value" style="color:${peak > 90 ? 'var(--danger)' : peak > 70 ? 'var(--warning)' : 'var(--success)'}">${peak}%</div>
        </div>
        ${primaryIsDeck ? `
        <div class="stat-box">
          <div class="s-label">Roadway coverage</div>
          <div class="s-value" style="color:var(--danger)">${Math.round(analysis.coveredPct * 100)}%</div>
          <div style="font-size:0.6rem;color:var(--text-dim);margin-top:2px;">${analysis.biggestGap.toFixed(1)} m missing</div>
        </div>` : `
        <div class="stat-box">
          <div class="s-label">${crackedAt !== null ? 'Sag at failure' : 'Max deck sag'}</div>
          <div class="s-value" style="color:${stiff ? 'var(--success)' : 'var(--danger)'}">${sag.toFixed(2)} m</div>
          <div style="font-size:0.6rem;color:var(--text-dim);margin-top:2px;">limit ${this.sagLimit().toFixed(2)} m</div>
        </div>`}
        <div class="stat-box">
          <div class="s-label">Members failed</div>
          <div class="s-value" style="color:${this.brokenCount ? 'var(--danger)' : 'var(--success)'}">${this.brokenCount}</div>
        </div>
      </div>`;

    const isLast = this.currentLevelIdx >= LEVELS.length - 1;

    if (success) {
      let verdict;
      if (stars === 3) {
        verdict = 'An excellent piece of engineering — safe, affordable, stiff, and with capacity in reserve.';
      } else if (!stiff) {
        verdict = `Nothing snapped, but the deck dropped <b>${sag.toFixed(2)} m</b> under the vehicle — roughly
                   1 part in ${Math.max(1, Math.round(spanOf(this.level) / sag))}
                   of the span. Real bridge codes allow closer to 1 in 250. A deflection like that means the deck is
                   <b>bending</b> rather than working as a truss: the load has no triangulated path back to the anchors,
                   so a single line of members is carrying it in bending alone. Add diagonals between the deck joints
                   and a chord above or below them, and the same load turns into pure tension and compression.`;
      } else if (!isSandbox && !underBudget) {
        verdict = `It stands, but it came in <b>$${(cost - budget).toLocaleString()} over budget</b>. Look for members carrying almost no load — those are free to delete.`;
      } else if (isSandbox && !efficient) {
        verdict = `It stands. You came in at <b>$${cost.toLocaleString()}</b> against a par of <b>$${par.toLocaleString()}</b>,
          and the deck moved <b>${sag.toFixed(2)} m</b> against a stiffness target of ${stiffTarget.toFixed(2)} m.
          Those two pull against each other: the cheapest bridge is a shallow one, and a shallow one flexes.`;
      } else if (!efficient) {
        verdict = `Solid work. Your peak member reached <b>${peak}%</b> of its capacity, so there is not much margin left. Try adding one more triangle, or trimming cost.`;
      } else {
        verdict = 'The bridge carried the load.';
      }

      const failNote = this.brokenCount > 0
        ? `<p style="margin-top:10px; color:#fcd34d;">⚠ ${this.brokenCount} member${this.brokenCount > 1 ? 's' : ''} broke during the crossing — the bridge survived, but it is damaged. ${this.explainFailure(this.firstFailure, this.analysis)}</p>`
        : '';

      this.showModal({
        eyebrow: 'Load test complete',
        title: '✅ Bridge certified',
        titleClass: 'win',
        body: `${starRow}<p>${verdict}</p>${failNote}${statGrid}`,
        tip: !stiff
          ? 'Run the test again after adding your triangles and watch the <b>Deck sag</b> figure in the live panel. Getting it down is the whole point of a truss — the same load, carried by stretching and squashing instead of bending.'
          : (this.brokenCount === 0 && peak < 60
            ? 'Your design has plenty of spare strength. Real engineers chase that margin down — could you delete a member, or swap steel for wood, and still pass?'
            : 'Hover any member during a test to read its exact force and how much of its capacity it is using.'),
        actions: [
          { label: '↻ Improve design', onclick: 'app.closeModal(); app.stopSimulation();' },
          isLast
            ? { label: '🗺 Choose a level', cls: 'btn-primary', onclick: 'app.showLevels()' }
            : { label: 'Next challenge →', cls: 'btn-primary', onclick: `app.switchLevel(${this.currentLevelIdx + 1});` }
        ]
      });
    } else {
      const a = analysis;
      const notes = this.diagnoseDesign(primaryIsDeck);
      const noteHtml = notes.length
        ? `<p style="margin-top:12px;"><b>Also worth fixing:</b></p><ul style="margin:6px 0 0 18px; line-height:1.7;">${notes.map(n => `<li>${n}</li>`).join('')}</ul>`
        : '';

      this.showModal({
        eyebrow: 'Load test failed',
        title: '💥 Structural collapse',
        titleClass: 'lose',
        body: `${starRow}<p>${this.explainFailure(this.firstFailure, a)}</p>${noteHtml}${statGrid}`,
        tip: primaryIsDeck
          ? 'Select the <b>Roadway</b> material and drag a continuous line of deck from one bank to the other. The design checklist in the corner turns green once it spans the full gap.'
          : 'Run the test again and watch which members turn bright red <b>first</b>. Those are the ones doing the most work — reinforce them before spending anywhere else.',
        actions: [
          { label: '📘 Engineering guide', onclick: 'app.showHelp()' },
          { label: '🔧 Back to design', cls: 'btn-primary', onclick: 'app.closeModal(); app.stopSimulation();' }
        ]
      });
    }
  },

  showLevels() {
    const cards = LEVELS.map((lvl, i) => {
      const stars = this.starsFor(lvl.id);
      const best = this.progress[lvl.id];
      const sub = best && best.cost < Infinity
        ? `${lvl.concept} · best build $${best.cost.toLocaleString()}`
        : `${lvl.concept} · ${isUnlimited(lvl) ? (lvl.par ? 'par $' + lvl.par.toLocaleString() : 'no budget limit') : 'budget $' + lvl.budget.toLocaleString()}`;
      return `
        <button class="level-card ${i === this.currentLevelIdx ? 'current' : ''}" onclick="app.switchLevel(${i});">
          <div class="lc-num">${i + 1}</div>
          <div class="lc-main">
            <div class="lc-title">${lvl.title.replace(/^\d+\.\s*/, '')}</div>
            <div class="lc-sub">${sub}</div>
          </div>
          <div class="lc-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
        </button>`;
    }).join('');

    const total = LEVELS.reduce((s, l) => s + this.starsFor(l.id), 0);
    this.showModal({
      eyebrow: `Curriculum · ${total} of ${LEVELS.length * 3} stars earned`,
      title: 'Choose a challenge',
      body: `<div class="level-list">${cards}</div>`,
      actions: [{ label: 'Close', cls: 'btn-primary', onclick: 'app.closeModal()' }]
    });
  },

  showHelp() {
    const matRows = Object.entries(MATERIALS).map(([key, m]) => `
      <tr>
        <td><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${m.color};margin-right:6px;"></span>${m.name}</td>
        <td class="num">$${m.cost}</td>
        <td class="num">${(m.maxTension / 1000).toFixed(0)} kN</td>
        <td class="num">${m.maxComp === 0 ? '—' : (m.maxComp / 1000).toFixed(0) + ' kN'}</td>
      </tr>`).join('');

    this.showModal({
      eyebrow: 'Reference',
      title: '📘 Engineering handbook',
      body: `
        <div class="help-section">
          <div class="help-h">① Tension and compression</div>
          <div class="help-p">
            Every member in a loaded truss is doing one of two jobs. A member in
            <b style="color:var(--tension)">tension</b> is being pulled apart and stretches slightly. A member in
            <b style="color:var(--compression)">compression</b> is being squashed and shortens slightly.
            During a test, TrussCraft colours members blue for tension and red for compression, and the brighter
            the colour, the closer that member is to failing.
          </div>
        </div>

        <div class="help-section">
          <div class="help-h">② Why triangles</div>
          <div class="help-p">
            Push sideways on a square frame and it folds flat into a diamond — no member has to change length,
            so nothing resists you. Do the same to a triangle and it cannot deform unless a member physically
            stretches or crushes, which takes enormous force. Trusses are triangles all the way down.
          </div>
          <div class="help-diagram">
            <figure>
              <svg width="100" height="70" viewBox="0 0 100 70">
                <path d="M20 55 L20 15 L75 15 L75 55 Z" fill="none" stroke="#ef4444" stroke-width="3" stroke-linejoin="round"/>
                <path d="M32 62 L47 62 M47 62 l-5 -4 M47 62 l-5 4" stroke="#ef4444" stroke-width="2" fill="none"/>
              </svg>
              <figcaption>Square — folds over</figcaption>
            </figure>
            <figure>
              <svg width="100" height="70" viewBox="0 0 100 70">
                <path d="M20 55 L20 15 L75 15 L75 55 Z M20 15 L75 55" fill="none" stroke="#22c55e" stroke-width="3" stroke-linejoin="round"/>
              </svg>
              <figcaption>Braced — rigid</figcaption>
            </figure>
          </div>
        </div>

        <div class="help-section">
          <div class="help-h">③ Why a flat road is not a bridge</div>
          <div class="help-p">
            The most tempting move is to run roadway straight across and stop. It looks like a bridge, and it
            is the cheapest thing you can build — but it has <b>no way to resist bending</b>. All a flat line
            of deck can do is stretch slightly and hang in a shallow curve, like a rope with a car on it.
            Roadway is not built to work that way, and the slab cracks.
          </div>
          <div class="help-diagram">
            <figure>
              <svg width="120" height="70" viewBox="0 0 120 70">
                <path d="M10 22 Q60 62 110 22" fill="none" stroke="#ef4444" stroke-width="4" stroke-linecap="round"/>
                <rect x="52" y="44" width="16" height="9" rx="2" fill="#ef4444"/>
                <path d="M10 18 L10 30 M110 18 L110 30" stroke="#64748b" stroke-width="3"/>
              </svg>
              <figcaption>Flat deck — bends, cracks</figcaption>
            </figure>
            <figure>
              <svg width="120" height="70" viewBox="0 0 120 70">
                <path d="M10 44 L110 44 M10 44 L30 20 L50 44 L70 20 L90 44 L110 20 L110 44 M30 20 L70 20 M70 20 L110 20"
                      fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linejoin="round"/>
                <rect x="52" y="35" width="16" height="8" rx="2" fill="#22c55e"/>
              </svg>
              <figcaption>Trussed — barely moves</figcaption>
            </figure>
          </div>
          <div class="help-p">
            Add a chord above or below the deck and tie it to every deck joint with diagonals, and the load stops
            bending anything. It travels along the members as pure stretching and squashing, straight back to the
            anchors — and the sag reading drops by a factor of ten or more.
          </div>
        </div>

        <div class="help-section">
          <div class="help-h">④ Buckling: length matters</div>
          <div class="help-p">
            A long thin member in compression does not get crushed — it bows sideways and folds. The load it can
            take before buckling drops roughly with the <b>square</b> of its length, so a 4 m strut is about four
            times weaker than a 2 m one of the same material. This is why real trusses use lots of short members
            instead of a few long ones, and why a member that is fine in tension may fail in compression.
          </div>
        </div>

        <div class="help-section">
          <div class="help-h">⑤ Deflection: passing is not the same as good</div>
          <div class="help-p">
            A bridge can carry a load without a single member breaking and still be unusable, because it
            <b>bends too far</b>. Engineers set a deflection limit as a fraction of the span — real road bridges
            are typically held to about <b>span ÷ 250</b>. TrussCraft is far more forgiving and allows
            <b>span ÷ 40</b> — but past that the deck slab cracks and your bridge drops into the river.
            A flat roadway blows through that limit about three times over; the same deck with triangles
            added sags roughly fifteen times less under the same load. Watch the <b>Deck sag</b> reading
            during a test — it is the fastest measure of whether your structure is really working as a truss.
          </div>
        </div>

        <div class="help-section">
          <div class="help-h">⑥ Changing a design without rebuilding it</div>
          <div class="help-p">
            Pick the <b>✥ Move</b> tool and drag any joint. Every member attached to it stretches or
            shortens to follow, the new lengths appear as you drag, and the cost updates live. This is the
            quickest way to make a truss <b>deeper</b> — often cheaper than upgrading members to steel —
            or to pull a joint back inside the 4.2 m member limit. Anchor points are bolted down and
            cannot be moved.
          </div>
        </div>

        <div class="help-section">
          <div class="help-h">⑦ Material properties</div>
          <table class="mat-table">
            <tr><th>Material</th><th class="num">Cost/m</th><th class="num">Max tension</th><th class="num">Max compression</th></tr>
            ${matRows}
          </table>
          <div class="help-p" style="margin-top:8px; font-size:0.76rem;">
            Cable has <b>zero</b> compression capacity — push on it and it simply goes slack.
          </div>
        </div>

        <div class="help-section">
          <div class="help-h">⑧ Controls</div>
          <div class="key-list">
            <div><span>Materials</span><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd></div>
            <div><span>Move a joint</span><kbd>M</kbd></div>
            <div><span>Eraser</span><kbd>E</kbd></div>
            <div><span>Run / stop test</span><kbd>Space</kbd></div>
            <div><span>Force vectors</span><kbd>V</kbd></div>
            <div><span>Undo / redo</span><kbd>⌘Z</kbd></div>
            <div><span>This guide</span><kbd>?</kbd></div>
          </div>
        </div>`,
      actions: [
        { label: '🎓 Replay the tour', onclick: 'app.closeModal(); app.startCoach();' },
        { label: 'Back to work', cls: 'btn-primary', onclick: 'app.closeModal()' }
      ]
    });
  },

  // ---------- first-run guided tour ----------
  coachSteps() {
    return [
      {
        sel: '#toolbar .tool-cluster:first-child',
        title: 'You have four materials',
        text: `<b>Roadway</b> is only the surface the car drives on — it cannot hold itself up.
               <b>Wood</b>, <b>Steel</b> and <b>Cable</b> are what actually carry the load.
               Press <b>1</b>–<b>4</b> to switch between them.`
      },
      {
        sel: '#meter-budget',
        title: 'Every metre costs money',
        text: `You have a <b>budget</b>, and the cheapest bridge that survives wins.
               Wood is $30/m, steel is $90/m — so use steel only where the forces are worst.`
      },
      {
        sel: '#hud-objectives',
        title: 'The checklist tells you what is missing',
        text: `It updates as you build. Get every line ticked and your bridge will almost
               certainly stand up.`
      },
      {
        sel: '#btn-test',
        title: 'Then run the load test',
        text: `Members glow <b style="color:#38bdf8">blue</b> when stretched and
               <b style="color:#ef4444">red</b> when squashed, and brighter as they near failure.
               Watch which ones light up first — those are the ones doing the work.`
      }
    ];
  },

  startCoach() {
    this.coach = { steps: this.coachSteps(), i: 0 };
    document.getElementById('coach').classList.add('show');
    this.renderCoach();
  },

  renderCoach() {
    const c = this.coach;
    if (!c) return;
    const step = c.steps[c.i];
    const target = document.querySelector(step.sel);
    if (!target) return this.endCoach();

    // The toolbar scrolls sideways on narrow screens, so a target can be off-screen.
    // Bring it into view first, then measure, or the spotlight lands on empty space.
    if (typeof target.scrollIntoView === 'function') {
      try {
        target.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'center' });
      } catch (e) {
        target.scrollIntoView(false);
      }
    }
    requestAnimationFrame(() => this.positionCoach(target, c, step));
  },

  positionCoach(target, c, step) {
    if (!this.coach) return;
    const r = target.getBoundingClientRect();
    const pad = 6;
    const hole = document.getElementById('coach-hole');
    hole.style.top = `${r.top - pad}px`;
    hole.style.left = `${r.left - pad}px`;
    hole.style.width = `${r.width + pad * 2}px`;
    hole.style.height = `${r.height + pad * 2}px`;

    document.getElementById('coach-step').innerText = `Step ${c.i + 1} of ${c.steps.length}`;
    document.getElementById('coach-title').innerText = step.title;
    document.getElementById('coach-text').innerHTML = step.text;
    document.getElementById('coach-next').innerText = c.i === c.steps.length - 1 ? 'Start building →' : 'Next';
    document.getElementById('coach-next').focus({ preventScroll: true });
    document.getElementById('coach-dots').innerHTML =
      c.steps.map((_, i) => `<div class="coach-dot ${i === c.i ? 'on' : ''}"></div>`).join('');

    // Place the card clear of the highlight, and clamp it inside the window.
    const card = document.getElementById('coach-card');
    const cw = card.offsetWidth || 316;
    const ch = card.offsetHeight || 170;
    let top = r.bottom + 16;
    if (top + ch > window.innerHeight - 12) top = Math.max(12, r.top - ch - 16);
    let left = r.left + r.width / 2 - cw / 2;
    left = clamp(left, 12, window.innerWidth - cw - 12);
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  },

  nextCoach() {
    if (!this.coach) return;
    audio.playUI();
    this.coach.i++;
    if (this.coach.i >= this.coach.steps.length) return this.endCoach();
    this.renderCoach();
  },

  endCoach() {
    this.coach = null;
    document.getElementById('coach').classList.remove('show');
    try { localStorage.setItem('trusscraft.tourSeen', '1'); } catch (e) { /* storage blocked */ }
    this.toast('coach', '🎓', 'Drag on the grid to lay your first member. Reopen this tour any time from <b>📘 Guide</b>.', 5200);
  },

  tourSeen() {
    try { return localStorage.getItem('trusscraft.tourSeen') === '1'; } catch (e) { return false; }
  },

  /** Transient non-blocking message. */
  toast(kind, icon, text, ms = 3400) {
    const wrap = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = `<div class="t-icon">${icon}</div><div class="t-text">${text}</div>`;
    wrap.appendChild(el);
    while (wrap.children.length > 3) wrap.removeChild(wrap.firstChild);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
    }, ms);
  },

  /** A coaching hint that only ever fires once per level. */
  hint(key, text, ms = 5200) {
    this.hintsShown = this.hintsShown || {};
    if (this.hintsShown[key]) return;
    this.hintsShown[key] = true;
    this.toast('coach', '🎓', text, ms);
  },

  // ==========================================================
  //  INPUT & UI BINDING
  // ==========================================================
  bindEvents() {
    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      return { sx: cx - rect.left, sy: cy - rect.top };
    };

    const onPointerDown = (e) => {
      audio.init();
      if (this.mode === 'test') return;
      const { sx, sy } = getPos(e);
      const w = this.toWorld(sx, sy);
      this.mouseWorld = w;

      if (this.activeTool === 'erase') { this.eraseAt(w.x, w.y); return; }

      if (this.activeTool === 'move') {
        const target = this.findNearestNode(w.x, w.y, 0.5);
        if (!target) {
          this.toast('info', '✥', 'Click and drag a <b>joint</b> to move it. Every member attached resizes with it.', 3200);
        } else if (target.fixed) {
          this.toast('warn', '⚓', 'Anchor points are bolted to the rock — they cannot be moved.', 3000);
          audio.playError();
        } else {
          this.beginMove(target);
        }
        return;
      }

      const existing0 = this.findNearestNode(w.x, w.y, 0.45);
      if (!existing0 && this.zoneViolation(this.snapGrid(w.x, w.y).y)) {
        const c = this.level.constraint;
        this.toast('bad', '⛔', `<b>${c.label}.</b> ${c.blurb} on this level.`, 4000);
        audio.playError();
        return;
      }

      // Capture the pre-drag state up front, whatever the drag turns out to be.
      this.pendingSnapshot = this.snapshotState();
      this.createdStartNode = null;

      const existing = this.findNearestNode(w.x, w.y, 0.45);
      if (existing) {
        this.dragStartNode = existing;
      } else {
        const snap = this.snapGrid(w.x, w.y);
        const nearSnap = this.findNearestNode(snap.x, snap.y, 0.45);
        if (!nearSnap) {
          this.dragStartNode = this.createNode(snap.x, snap.y, false);
          this.createdStartNode = this.dragStartNode;
          audio.playClick();
        } else {
          this.dragStartNode = nearSnap;
        }
      }
    };

    const onPointerMove = (e) => {
      const { sx, sy } = getPos(e);
      this.mouseScreen = { x: sx, y: sy };
      this.mouseWorld = this.toWorld(sx, sy);
      this.mouseOnCanvas = true;

      if (this.moveState) {
        this.updateMove(this.mouseWorld.x, this.mouseWorld.y);
        this.updateCursor();
        document.getElementById('hud-tooltip').style.display = 'none';
        return;
      }

      this.hoverNode = this.findNearestNode(this.mouseWorld.x, this.mouseWorld.y, 0.4);
      this.hoverMember = this.findNearestMember(this.mouseWorld.x, this.mouseWorld.y, 0.25);
      this.renderTooltip(sx, sy);
      this.updateCursor();
    };

    const onPointerUp = () => {
      if (this.mode === 'test') { this.dragStartNode = null; this.cancelMove(); return; }

      if (this.moveState) { this.finishMove(); this.updateCursor(); return; }

      if (!this.dragStartNode) return;

      const start = this.dragStartNode;
      this.dragStartNode = null;

      const snap = this.snapGrid(this.mouseWorld.x, this.mouseWorld.y);

      const violation = this.zoneViolation(snap.y);
      if (violation) {
        const c = this.level.constraint;
        this.toast('bad', '⛔', `<b>${c.label}.</b> ${violation} — that is what makes this level different from the last one.`, 4600);
        audio.playError();
        this.abortDrag();
        return;
      }
      let target = this.findNearestNode(snap.x, snap.y, 0.45);
      const dist = Math.hypot(snap.x - start.x, snap.y - start.y);

      // A tap with no drag: just leave the joint (or nothing) behind.
      if (!target && dist < MIN_STRUT_LENGTH) {
        if (dist > 0.01) this.toast('warn', '📏', `Too short — members must be at least ${MIN_STRUT_LENGTH} m.`);
        this.abortDrag();
        return;
      }

      if (!target && dist > MAX_STRUT_LENGTH) {
        this.toast('bad', '📏', `That span is <b>${dist.toFixed(1)} m</b> — the longest single member is <b>${MAX_STRUT_LENGTH} m</b>. Add a joint partway along.`);
        audio.playError();
        this.abortDrag();
        return;
      }

      if (!target) target = this.createNode(snap.x, snap.y, false);

      if (target && target !== start) {
        const made = this.createMember(start, target, this.activeMat);
        this.commitOrRollback(made);
        if (made) this.afterBuildFeedback(made);
      } else {
        this.commitOrRollback(false);
      }

      this.cleanUnconnectedNodes();
      this.updateBudget();
      this.markDirty();
    };

    this.canvas.addEventListener('mousedown', onPointerDown);
    this.canvas.addEventListener('mousemove', onPointerMove);
    this.canvas.addEventListener('mouseleave', () => {
      this.mouseOnCanvas = false;
      if (this.moveState) this.finishMove();
      this.hoverMember = null;
      this.hoverNode = null;
      document.getElementById('hud-tooltip').style.display = 'none';
    });
    window.addEventListener('mouseup', onPointerUp);

    this.canvas.addEventListener('touchstart', (e) => { onPointerMove(e); onPointerDown(e); e.preventDefault(); }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => { onPointerMove(e); e.preventDefault(); }, { passive: false });
    window.addEventListener('touchend', onPointerUp);
    window.addEventListener('touchcancel', () => {
      if (this.moveState) this.cancelMove();
      else if (this.dragStartNode) this.abortDrag();
    });

    // ---- keyboard ----
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      // A modal or the guided tour owns the keyboard: nothing behind it should change.
      const blocked = this.modalOpen || !!this.coach;

      if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) {
        e.preventDefault();
        if (blocked) return;
        (k === 'y' || e.shiftKey) ? this.redo() : this.undo();
        return;
      }
      if (e.ctrlKey || e.metaKey) return;

      if (e.key === 'Escape') {
        if (this.moveState) this.cancelMove();
        else if (this.coach) this.endCoach();
        else if (this.modalOpen) this.closeModal();
        return;
      }
      if (e.key === 'Tab' && this.modalOpen) { this.trapTab(e); return; }
      if (blocked) return;                       // a focused dialog button keeps its own Space/Enter
      if (e.key === ' ') e.preventDefault();

      if (e.key === ' ') {
        this.mode === 'build' ? this.startSimulation() : this.stopSimulation();
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        this.selectMaterial(Object.keys(MATERIALS)[+e.key - 1]);
      } else if (k === 'e') {
        this.toggleEraser();
      } else if (k === 'm') {
        this.toggleMove();
      } else if (k === 'v') {
        document.getElementById('btn-vectors').click();
      } else if (e.key === '?' || k === 'h') {
        this.showHelp();
      }
    });

    // Firefox activates a focused button on Space's key-up, so cancel that too: Space belongs to the test.
    window.addEventListener('keyup', (e) => {
      if (e.key === ' ' && !(this.modalOpen || this.coach)) e.preventDefault();
    });

    // ---- toolbar ----
    document.querySelectorAll('.mat-btn').forEach(btn => {
      btn.addEventListener('click', () => this.selectMaterial(btn.dataset.mat));
    });

    document.getElementById('btn-erase').addEventListener('click', () => this.toggleEraser());
    document.getElementById('btn-move').addEventListener('click', () => this.toggleMove());
    document.getElementById('btn-undo').addEventListener('click', () => this.undo());
    document.getElementById('btn-redo').addEventListener('click', () => this.redo());

    document.getElementById('btn-clear').addEventListener('click', () => {
      if (this.mode === 'test' || this.members.length === 0) return;
      const n = this.members.length;
      this.saveSnapshot();
      this.members = [];
      this.nodes = this.nodes.filter(nd => nd.fixed);
      this.updateBudget();
      this.markDirty();
      this.refreshHistoryButtons();
      audio.playErase();
      this.toast('info', '↺', `Cleared ${n} member${n > 1 ? 's' : ''}. <b>Undo</b> brings them back.`);
    });

    document.getElementById('btn-test').addEventListener('click', () => this.startSimulation());
    document.getElementById('btn-edit').addEventListener('click', () => this.stopSimulation());
    document.getElementById('btn-help').addEventListener('click', () => this.showHelp());
    document.getElementById('btn-levels').addEventListener('click', () => this.showLevels());

    // Checklist: collapsible so a small screen keeps its workspace. The choice is remembered;
    // with none saved, phones start collapsed and everything else open.
    const objCard = document.getElementById('hud-objectives');
    const objToggle = document.getElementById('obj-toggle');
    const setChecklist = (open, save) => {
      objCard.classList.toggle('collapsed', !open);
      objToggle.setAttribute('aria-expanded', String(open));
      if (save) { try { localStorage.setItem('trusscraft.checklist', open ? 'open' : 'closed'); } catch (e) { /* storage blocked */ } }
    };
    let savedChecklist = null;
    try { savedChecklist = localStorage.getItem('trusscraft.checklist'); } catch (e) { /* storage blocked */ }
    const compact = window.innerWidth < 700 || window.innerHeight < 520;
    setChecklist(savedChecklist ? savedChecklist === 'open' : !compact, false);
    objToggle.addEventListener('click', () => {
      audio.init(); audio.playUI();
      setChecklist(objCard.classList.contains('collapsed'), true);
    });

    document.getElementById('coach-next').addEventListener('click', () => this.nextCoach());
    document.getElementById('coach-skip').addEventListener('click', () => { audio.playUI(); this.endCoach(); });
    window.addEventListener('resize', () => { if (this.coach) this.renderCoach(); });

    document.getElementById('btn-speed').addEventListener('click', () => {
      audio.init();
      this.simSpeed = this.simSpeed === 1.0 ? 0.25 : this.simSpeed === 0.25 ? 2.0 : 1.0;
      const label = this.simSpeed === 0.25 ? '¼x' : this.simSpeed === 2 ? '2x' : '1x';
      document.getElementById('speed-label').innerText = label;
      document.getElementById('btn-speed').classList.toggle('active', this.simSpeed !== 1.0);
      if (this.simSpeed === 0.25) this.toast('info', '🐢', 'Slow motion — easier to see which member fails first.');
      audio.playUI();
    });

    document.getElementById('btn-vectors').addEventListener('click', (e) => {
      audio.init();
      this.showVectors = !this.showVectors;
      document.getElementById('btn-vectors').classList.toggle('active', this.showVectors);
      document.getElementById('btn-vectors').setAttribute('aria-pressed', String(this.showVectors));
      audio.playUI();
      if (this.showVectors) {
        this.toast('info', '⇄', 'Arrows pointing <b>inward</b> mean the member is being stretched; <b>outward</b> means squashed.');
      }
    });
  },

  /** Keep Tab / Shift+Tab cycling inside the open dialog. */
  trapTab(e) {
    const card = document.getElementById('modal-card');
    const items = [...card.querySelectorAll('button:not([disabled]), [href], input, select, [tabindex]:not([tabindex="-1"])')];
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === card)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    else if (!card.contains(active)) { e.preventDefault(); first.focus(); }
  },

  setTool(tool) {
    audio.init();
    this.activeTool = tool;
    this.cancelMove();
    document.getElementById('btn-erase').classList.toggle('active', tool === 'erase');
    document.getElementById('btn-move').classList.toggle('active', tool === 'move');
    document.getElementById('btn-erase').setAttribute('aria-pressed', String(tool === 'erase'));
    document.getElementById('btn-move').setAttribute('aria-pressed', String(tool === 'move'));
    document.querySelectorAll('.mat-btn').forEach(b =>
      b.classList.toggle('active', tool === 'draw' && b.dataset.mat === this.activeMat));
    this.updateCursor();
    audio.playUI();
  },

  selectMaterial(mat) {
    if (!MATERIALS[mat]) return;
    this.activeMat = mat;
    this.setTool('draw');
  },

  toggleEraser() { this.setTool(this.activeTool === 'erase' ? 'draw' : 'erase'); },
  toggleMove()   { this.setTool(this.activeTool === 'move'  ? 'draw' : 'move'); },

  updateCursor() {
    if (this.mode === 'test') { this.canvas.style.cursor = 'default'; return; }
    if (this.moveState) { this.canvas.style.cursor = 'grabbing'; return; }
    if (this.activeTool === 'move') {
      this.canvas.style.cursor = (this.hoverNode && !this.hoverNode.fixed) ? 'grab' : 'default';
    } else if (this.activeTool === 'erase') {
      this.canvas.style.cursor = (this.hoverMember || (this.hoverNode && !this.hoverNode.fixed)) ? 'pointer' : 'not-allowed';
    } else {
      this.canvas.style.cursor = this.hoverNode ? 'grab' : 'crosshair';
    }
  },

  /** Keep or discard the snapshot captured when a drag started. */
  commitOrRollback(committed) {
    if (committed) {
      if (this.pendingSnapshot) {
        this.undoStack.push(this.pendingSnapshot);
        if (this.undoStack.length > 40) this.undoStack.shift();
        this.redoStack = [];
      } else {
        this.saveSnapshot();
      }
    } else if (this.createdStartNode) {
      // Drag produced nothing — drop the orphan joint we speculatively created.
      this.nodes = this.nodes.filter(n => n !== this.createdStartNode);
    }
    this.pendingSnapshot = null;
    this.createdStartNode = null;
    this.refreshHistoryButtons();
  },

  /** Abandon a member drag: drop any speculative joint and the pending undo step. */
  abortDrag() {
    this.dragStartNode = null;
    this.commitOrRollback(false);
    this.cleanUnconnectedNodes();
    this.updateBudget();
  },

  /** Immediate, specific reactions to what the student just built. */
  afterBuildFeedback(member) {
    const cost = this.calculateCost();
    if (cost > this.level.budget && !this.overBudgetWarned) {
      this.overBudgetWarned = true;
      this.toast('bad', '💰', `Over budget by <b>$${(cost - this.level.budget).toLocaleString()}</b>. You can still test, but you will lose a star.`);
    } else if (cost <= this.level.budget) {
      this.overBudgetWarned = false;
    }

    if (member.mat === 'cable') {
      const rising = Math.abs(member.n1.y - member.n2.y) > 0.4;
      if (!rising) {
        this.hint('flat-cable', 'That cable is nearly horizontal. Cables only work when they <b>pull upward</b> — anchor them to something higher.');
      }
    }
    if (member.mat === 'road' && member.restLen > 3) {
      this.hint('long-road', 'Long unsupported deck sections sag badly. Break the roadway into shorter spans with a joint between each.');
    }
    if (this.members.length === 6) {
      this.hint('checklist', 'Watch the <b>design checklist</b> in the top-left — it updates as you build.');
    }
  },
});
