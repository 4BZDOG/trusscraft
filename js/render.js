/**
 * TRUSSCRAFT — RENDERING
 * The structure, vehicle and effects drawn on the canvas (the scenery is in environment.js).
 * Adds its methods to TrussCraftApp (see app.js).
 */

Object.assign(TrussCraftApp.prototype, {
  /** The level's no-build zone, drawn so the rule is visible before it is broken. */
  drawZone(ctx) {
    const c = this.level.constraint;
    if (!c) return;
    const boundary = this.sy(this.zoneBoundaryY());
    const above = c.type === 'above';
    const top = above ? 0 : boundary;
    const height = above ? boundary : this.viewH - boundary;
    if (height <= 0) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, this.viewW, height);
    ctx.clip();

    // Wash, strongest at the boundary so the deck line reads clearly
    const g = ctx.createLinearGradient(0, above ? boundary : boundary, 0, above ? boundary - 150 : boundary + 150);
    g.addColorStop(0, 'rgba(239, 68, 68, 0.13)');
    g.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, top, this.viewW, height);

    // Diagonal hatching
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.13)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = -this.viewH; x < this.viewW + this.viewH; x += 16) {
      ctx.moveTo(x, top);
      ctx.lineTo(x + height, top + height);
    }
    ctx.stroke();
    ctx.restore();

    // Boundary line
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.75)';
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 6]);
    ctx.beginPath();
    ctx.moveTo(0, boundary);
    ctx.lineTo(this.viewW, boundary);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    ctx.font = '700 10px ui-monospace, Menlo, monospace';
    const label = `⛔ ${c.label}`;
    const w = ctx.measureText(label).width + 16;
    const ly = above ? boundary - 22 : boundary + 8;
    ctx.fillStyle = 'rgba(69, 10, 10, 0.9)';
    ctx.beginPath();
    ctx.roundRect(this.viewW - w - 16, ly, w, 17, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#fecaca';
    ctx.textAlign = 'center';
    ctx.fillText(label, this.viewW - w / 2 - 16, ly + 12);
    ctx.textAlign = 'left';
  },



  drawGrid(ctx) {
    if (this.mode === 'test') return;
    const min = this.toWorld(0, 0);
    const max = this.toWorld(this.viewW, this.viewH);

    // Metre lines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.floor(min.x); x <= Math.ceil(max.x); x++) {
      ctx.moveTo(this.sx(x), 0); ctx.lineTo(this.sx(x), this.viewH);
    }
    for (let y = Math.floor(min.y); y <= Math.ceil(max.y); y++) {
      ctx.moveTo(0, this.sy(y)); ctx.lineTo(this.viewW, this.sy(y));
    }
    ctx.stroke();

    // Half-metre snap dots
    ctx.fillStyle = 'rgba(100, 130, 175, 0.30)';
    for (let x = Math.floor(min.x); x <= Math.ceil(max.x); x += GRID_SNAP) {
      for (let y = Math.floor(min.y); y <= Math.ceil(max.y); y += GRID_SNAP) {
        ctx.fillRect(this.sx(x) - 1, this.sy(y) - 1, 1.6, 1.6);
      }
    }

    // Highlight the snap point the cursor will use
    if (this.mouseOnCanvas && this.activeTool === 'draw') {
      const s = this.snapGrid(this.mouseWorld.x, this.mouseWorld.y);
      const p = this.toScreen(s.x, s.y);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  },

  // ==========================================================
  //  RENDERING — STRUCTURE
  // ==========================================================
  memberHalfHeight(mat) {
    const sc = this.PPM / 40;
    return (mat === 'road' ? 5.0 : mat === 'steel' ? 3.6 : mat === 'wood' ? 3.0 : 1.5) * sc;
  },

  /** A soft shadow under the whole structure lifts it off the scenery, whatever the palette. */
  drawStructureShadow(ctx) {
    const sc = this.PPM / 40;
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = 7 * sc;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const m of this.members) {
      if (m.broken) continue;
      const a = this.toScreen(m.n1.x, m.n1.y), b = this.toScreen(m.n2.x, m.n2.y);
      ctx.moveTo(a.x + 3 * sc, a.y + 5 * sc);
      ctx.lineTo(b.x + 3 * sc, b.y + 5 * sc);
    }
    ctx.stroke();
    ctx.restore();
  },

  drawMembers(ctx, reflection = false) {
    if (!reflection) this.drawStructureShadow(ctx);
    const dead = (this.mode === 'build' && !reflection && this.analysis)
      ? new Set(this.analysis.deadMembers) : null;
    for (const m of this.members) {
      if (m.broken) continue;
      if (dead && dead.has(m)) {
        // Connected at one end only, or adrift from every anchor: carries nothing.
        ctx.save();
        ctx.globalAlpha = 0.4;
        this.drawMember(ctx, m, reflection);
        ctx.restore();
        continue;
      }
      this.drawMember(ctx, m, reflection);
    }
    if (!reflection && this.mode === 'test') {
      this.drawDeckGauge(ctx);
      this.drawStressLabels(ctx);
    }
  },

  /**
   * How far the deck has dropped, shown against how far it may. A faint dashed line marks where
   * the roadway was built, and the Live Load Test card carries a gauge of the allowance used.
   */
  drawDeckGauge(ctx) {
    const sc = this.PPM / 40;
    ctx.save();
    ctx.setLineDash([6 * sc, 5 * sc]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const m of this.members) {
      if (m.mat !== 'road' || m.n1.restY === undefined || m.n2.restY === undefined) continue;
      const a = this.toScreen(m.n1.restX, m.n1.restY), b = this.toScreen(m.n2.restX, m.n2.restY);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Once the deck is using up its allowance, say so at the joint that is dropping most
    const node = this.worstSagNode;
    const sag = this.currentSag || 0;
    const limit = this.sagLimit();
    const frac = sag / limit;
    if (node && node.restY !== undefined && frac > 0.45 && !this.deckCracked) {
      const x = this.sx(node.x), y = this.sy(node.y);
      const col = frac > 0.8 ? '#fca5a5' : '#fcd34d';
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 13 * sc + Math.sin(this.time * 8) * 1.5, 0, Math.PI * 2); ctx.stroke();
      const label = `deck down ${(sag * 100).toFixed(0)} cm`;
      ctx.font = `700 ${Math.max(9, 10 * sc)}px ui-monospace, Menlo, monospace`;
      const tw = ctx.measureText(label).width + 12;
      const ly = y + 24 * sc + 46 * sc;                   // below the load arrows
      ctx.fillStyle = 'rgba(40, 14, 8, 0.9)';
      ctx.beginPath(); ctx.roundRect(x - tw / 2, ly - 9, tw, 18, 5); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, x, ly + 0.5);
    }
    ctx.restore();
  },

  drawMember(ctx, m, reflection) {
    // A new member grows out of the joint it was dragged from
    const grow = (m.born === undefined || reflection) ? 1 : easeOutBack(clamp((this.time - m.born) / 0.2, 0, 1));
    const p1 = this.toScreen(m.n1.x, m.n1.y);
    const q2 = this.toScreen(m.n2.x, m.n2.y);
    const p2 = grow >= 1 ? q2 : { x: lerp(p1.x, q2.x, grow), y: lerp(p1.y, q2.y, grow) };
    const mat = MATERIALS[m.mat];
    const sc = this.PPM / 40;
    const test = this.mode === 'test';
    const s = clamp(m.stress, 0, 1);
    const hovered = !reflection && this.hoverMember === m;

    // --- Slack cable: draw the catenary droop instead of a straight line ---
    if (mat.isCable && test && m.force <= 0) {
      const midX = (p1.x + p2.x) * 0.5;
      const midY = (p1.y + p2.y) * 0.5 + 10 * sc;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.quadraticCurveTo(midX, midY, p2.x, p2.y);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = 2 * sc;
      ctx.setLineDash([]);
      ctx.stroke();
      return;
    }

    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const lenPx = Math.hypot(dx, dy);
    if (lenPx < 0.5) return;
    let half = this.memberHalfHeight(m.mat);
    const base = test ? stressColor(m.force, s) : mat.color;

    // Under tension a member thins as it nears its limit; under compression a slender one bows
    // sideways before it buckles — the failure the handbook describes, made visible.
    if (test && !reflection && m.force > 60 && s > 0.4) half *= 1 - 0.3 * (s - 0.4) / 0.6;
    let bow = 0;
    if (test && !reflection && m.force < -60 && s > 0.3 && !mat.isRoad) {
      const slender = clamp(m.restLen / EULER_REF_LEN, 0.45, 1.8);
      bow = Math.pow((s - 0.3) / 0.7, 1.5) * 0.22 * slender * this.PPM * Math.sign(Math.sin(m.warnPhase * 7) || 1);
    }

    ctx.save();
    ctx.translate(p1.x, p1.y);
    ctx.rotate(Math.atan2(dy, dx));
    // Close to failing, a member shudders
    if (test && !reflection && s > 0.88) {
      const k = this.time * 38 + m.warnPhase * 10;
      ctx.translate(Math.sin(k) * 0.9 * sc, Math.cos(k * 1.3) * 0.9 * sc);
    }

    // Glow as a member approaches its limit
    if (test && s > 0.5 && !reflection) {
      const pulse = s > 0.85 ? (0.6 + 0.4 * Math.sin(this.time * 14 + m.warnPhase)) : 1;
      ctx.shadowColor = stressColor(m.force, s, 0.85);
      ctx.shadowBlur = lerp(3, 26, (s - 0.5) / 0.5) * pulse;
    }

    if (mat.isCable) {
      ctx.strokeStyle = base;
      ctx.lineWidth = half * 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(lenPx, 0);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(0.6, half * 0.5);
      ctx.beginPath();
      ctx.moveTo(1, -half * 0.35); ctx.lineTo(lenPx - 1, -half * 0.35);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (Math.abs(bow) > 0.8) {
      this.drawBowedMember(ctx, m, lenPx, half, bow, base, hovered);
      ctx.restore();
      if (this.showVectors && test && Math.abs(m.force) > 80 && !reflection) this.drawVectorArrows(ctx, p1, p2, m.force);
      return;
    }

    // Body
    ctx.fillStyle = base;
    ctx.fillRect(0, -half, lenPx, half * 2);
    ctx.shadowBlur = 0;

    // Cylindrical shading so members read as solid objects
    const shade = ctx.createLinearGradient(0, -half, 0, half);
    shade.addColorStop(0, 'rgba(255,255,255,0.30)');
    shade.addColorStop(0.42, 'rgba(255,255,255,0.04)');
    shade.addColorStop(0.62, 'rgba(0,0,0,0.10)');
    shade.addColorStop(1, 'rgba(0,0,0,0.40)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, -half, lenPx, half * 2);

    // --- Material texture ---
    if (m.mat === 'wood') {
      ctx.strokeStyle = 'rgba(69, 26, 3, 0.34)';
      ctx.lineWidth = Math.max(0.6, 0.9 * sc);
      ctx.beginPath();
      for (let i = 0; i < 2; i++) {
        const gy = -half + half * (0.7 + i * 1.1);
        ctx.moveTo(2, gy);
        for (let x = 2; x < lenPx; x += 6) ctx.lineTo(x, gy + Math.sin(x * 0.22 + i * 2 + m.warnPhase) * half * 0.16);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(69, 26, 3, 0.4)';
      ctx.fillRect(0, -half, 1.6 * sc, half * 2);
      ctx.fillRect(lenPx - 1.6 * sc, -half, 1.6 * sc, half * 2);
    } else if (m.mat === 'steel') {
      // Flange edges + rivets
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(0, -half, lenPx, Math.max(0.8, half * 0.28));
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, half - Math.max(0.8, half * 0.28), lenPx, Math.max(0.8, half * 0.28));
      const step = Math.max(9, 13 * sc);
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      for (let x = step * 0.5; x < lenPx - 2; x += step) {
        ctx.beginPath();
        ctx.arc(x, 0, Math.max(0.7, half * 0.22), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (m.mat === 'road') {
      // Kerbs and centre line
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.fillRect(0, -half, lenPx, Math.max(1, half * 0.24));
      ctx.fillRect(0, half - Math.max(1, half * 0.24), lenPx, Math.max(1, half * 0.24));
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
      ctx.lineWidth = Math.max(1, 1.4 * sc);
      ctx.setLineDash([5 * sc, 5 * sc]);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(lenPx, 0);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // In test mode keep a thin stripe of the true material colour for identification
    if (test) {
      ctx.fillStyle = mat.color;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(0, half - Math.max(1, half * 0.2), lenPx, Math.max(1, half * 0.2));
      ctx.globalAlpha = 1;
    }

    // Outline / hover highlight
    ctx.strokeStyle = hovered ? '#ffffff' : 'rgba(0,0,0,0.45)';
    ctx.lineWidth = hovered ? 2 : 1;
    ctx.strokeRect(0, -half, lenPx, half * 2);

    ctx.restore();

    if (this.showVectors && test && Math.abs(m.force) > 80 && !reflection) {
      this.drawVectorArrows(ctx, p1, p2, m.force);
    }
  },

  /** A strut bent into an arc by compression. Drawn in the member's own frame (see drawMember). */
  drawBowedMember(ctx, m, lenPx, half, bow, base, hovered) {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(lenPx / 2, 2 * bow, lenPx, 0);
    };
    ctx.lineCap = 'butt';
    ctx.shadowBlur = 0;
    path(); ctx.strokeStyle = hovered ? '#ffffff' : 'rgba(0,0,0,0.5)'; ctx.lineWidth = half * 2 + 3; ctx.stroke();
    path(); ctx.strokeStyle = base; ctx.lineWidth = half * 2; ctx.stroke();
    ctx.save();
    ctx.translate(0, -half * 0.35);
    path(); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = Math.max(1, half * 0.5); ctx.stroke();
    ctx.restore();
    // the true material stripe, so a wooden strut still reads as wood
    ctx.save();
    ctx.translate(0, half * 0.8);
    path(); ctx.strokeStyle = MATERIALS[m.mat].color; ctx.globalAlpha = 0.9; ctx.lineWidth = Math.max(1, half * 0.25); ctx.stroke();
    ctx.restore();
  },

  /** Percentage chips on the members doing the most work. */
  drawStressLabels(ctx) {
    const busy = this.members
      .filter(m => !m.broken && m.stress > 0.68)
      .sort((a, b) => b.stress - a.stress)
      .slice(0, 6);

    ctx.font = `600 ${Math.max(9, 10 * this.PPM / 40)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const m of busy) {
      const mx = this.sx((m.n1.x + m.n2.x) / 2);
      const my = this.sy((m.n1.y + m.n2.y) / 2);
      const pct = Math.round(m.stress * 100);
      const col = stressColor(m.force, m.stress);
      const label = `${pct}%`;
      const w = ctx.measureText(label).width + 10;
      const h = 15;

      ctx.globalAlpha = m.stress > 0.85 ? 0.75 + 0.25 * Math.sin(this.time * 12 + m.warnPhase) : 0.92;
      ctx.fillStyle = 'rgba(6, 11, 20, 0.88)';
      ctx.beginPath();
      ctx.roundRect(mx - w / 2, my - h / 2 - 14, w, h, 4);
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.fillText(label, mx, my - 14);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  },

  drawVectorArrows(ctx, p1, p2, force) {
    const mx = (p1.x + p2.x) * 0.5;
    const my = (p1.y + p2.y) * 0.5;
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const len = 11 * (this.PPM / 40);

    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(angle);
    ctx.strokeStyle = force > 0 ? '#7dd3fc' : '#fca5a5';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (force > 0) {
      // Pulled inward from both ends — tension
      ctx.moveTo(-len, -3.5); ctx.lineTo(-len + 5, 0); ctx.lineTo(-len, 3.5);
      ctx.moveTo(len, -3.5);  ctx.lineTo(len - 5, 0);  ctx.lineTo(len, 3.5);
    } else {
      // Pushed outward at both ends — compression
      ctx.moveTo(-len + 5, -3.5); ctx.lineTo(-len, 0); ctx.lineTo(-len + 5, 3.5);
      ctx.moveTo(len - 5, -3.5);  ctx.lineTo(len, 0);  ctx.lineTo(len - 5, 3.5);
    }
    ctx.stroke();
    ctx.restore();
  },

  drawNodes(ctx) {
    const sc = this.PPM / 40;

    for (const n of this.nodes) {
      const p = this.toScreen(n.x, n.y);

      if (n.fixed) {
        // Anchor: hatched foundation block bolted into the rock
        const w = 15 * sc, h = 11 * sc;
        ctx.fillStyle = '#0b1220';
        ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
        ctx.strokeStyle = '#78716c';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = -w / 2; i < w / 2 + h; i += 4 * sc) {
          ctx.moveTo(p.x + i, p.y + h / 2);
          ctx.lineTo(p.x + i - h, p.y - h / 2);
        }
        ctx.stroke();
        ctx.strokeStyle = '#a8a29e';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(p.x - w / 2, p.y - h / 2, w, h);

        const r = 6 * sc;
        const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.15, p.x, p.y, r);
        g.addColorStop(0, '#fde68a');
        g.addColorStop(1, '#ca8a04');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#713f12';
        ctx.lineWidth = 2 * sc;
        ctx.stroke();
      } else {
        // Free joint: bolted gusset plate. A new one pops and sends out a ring.
        const age = n.born === undefined ? 99 : this.time - n.born;
        const pop = age < 0.4 ? 1 + 0.9 * Math.pow(1 - age / 0.4, 2) : 1;
        if (age < 0.5) {
          ctx.strokeStyle = `rgba(125, 211, 252, ${0.8 * (1 - age / 0.5)})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, (6 + age * 40) * sc, 0, Math.PI * 2); ctx.stroke();
        }
        const r = 5 * sc * pop;
        const g = ctx.createRadialGradient(p.x - r * 0.4, p.y - r * 0.4, r * 0.1, p.x, p.y, r);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.6, '#cbd5e1');
        g.addColorStop(1, '#64748b');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0b1220';
        ctx.lineWidth = 1.6 * sc;
        ctx.stroke();

        ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
        for (let i = 0; i < 3; i++) {
          const a = this.time * 0 + i * 2.094;
          ctx.beginPath();
          ctx.arc(p.x + Math.cos(a) * r * 0.5, p.y + Math.sin(a) * r * 0.5, Math.max(0.6, r * 0.16), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Every free joint is a handle while the move tool is active
      if (this.activeTool === 'move' && this.mode !== 'test' && !n.fixed && !this.moveState) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9 * sc, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Hover ring
      if (this.hoverNode === n && this.mode !== 'test') {
        ctx.strokeStyle = this.activeTool === 'erase' ? '#ef4444'
                        : this.activeTool === 'move' ? '#22c55e' : '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (n.fixed ? 11 : 9) * sc + Math.sin(this.time * 5) * 1.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  },

  /**
   * Mark joints that are not properly connected. A loose end carries no load, and a
   * joint with no path to an anchor will simply fall — both are invisible otherwise.
   */
  drawConnectionWarnings(ctx) {
    if (this.mode !== 'build' || !this.analysis) return;
    const a = this.analysis;
    if (!a.looseNodes.length && !a.floatingNodes.length) return;

    const sc = this.PPM / 40;
    const pulse = 0.55 + 0.45 * Math.sin(this.time * 4);
    const floatingSet = new Set(a.floatingNodes);

    const mark = (n, color, glyph) => {
      const p = this.toScreen(n.x, n.y);
      const r = 11 * sc;

      ctx.strokeStyle = color;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + Math.sin(this.time * 4) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Badge sitting above the joint
      const bx = p.x + r * 0.95, by = p.y - r * 0.95;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(bx, by, 7 * sc, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b1220';
      ctx.font = `700 ${Math.max(8, 10 * sc)}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyph, bx, by + 0.5);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    };

    // Floating is the more serious fault, so it wins when a joint is both.
    for (const n of a.looseNodes) if (!floatingSet.has(n)) mark(n, '#f59e0b', '!');
    for (const n of a.floatingNodes) mark(n, '#ef4444', '⚠');
  },

  /** Live readout while a joint is being dragged: new lengths, validity, cost delta. */
  drawMovePreview(ctx) {
    const s = this.moveState;
    if (!s) return;
    const sc = this.PPM / 40;
    const ok = !s.reason;
    const colour = ok ? '#38bdf8' : '#ef4444';
    const p = this.toScreen(s.node.x, s.node.y);

    // Where it came from
    const o = this.toScreen(s.origX, s.origY);
    ctx.strokeStyle = 'rgba(148,163,184,0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(o.x, o.y, 5 * sc, 0, Math.PI * 2);
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Grab ring
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12 * sc + Math.sin(this.time * 6) * 1.2, 0, Math.PI * 2);
    ctx.stroke();

    // New length on each attached member
    ctx.font = `600 ${Math.max(9, 10 * sc)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const { m } of s.lens) {
      const len = Math.hypot(m.n2.x - m.n1.x, m.n2.y - m.n1.y);
      const bad = len > MAX_STRUT_LENGTH || len < MIN_STRUT_LENGTH;
      const mx = this.sx((m.n1.x + m.n2.x) / 2);
      const my = this.sy((m.n1.y + m.n2.y) / 2);
      const label = `${len.toFixed(1)}m`;
      const w = ctx.measureText(label).width + 10;
      ctx.fillStyle = bad ? 'rgba(127,29,29,0.95)' : 'rgba(10,17,32,0.9)';
      ctx.beginPath();
      ctx.roundRect(mx - w / 2, my - 8, w, 16, 4);
      ctx.fill();
      ctx.strokeStyle = bad ? '#ef4444' : '#38bdf855';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = bad ? '#fecaca' : '#e2e8f0';
      ctx.fillText(label, mx, my);
    }

    // Status chip above the joint
    const delta = this.calculateCost() - s.origCost;
    const chip = s.reason
      ? `⛔ ${s.reason}`
      : (delta === 0 ? 'drag to resize' : `${delta > 0 ? '+' : '−'}$${Math.abs(delta).toLocaleString()}`);
    const cw = ctx.measureText(chip).width + 16;
    ctx.fillStyle = ok ? (delta > 0 ? 'rgba(120,53,15,0.95)' : 'rgba(6,46,31,0.95)') : 'rgba(127,29,29,0.96)';
    ctx.beginPath();
    ctx.roundRect(p.x - cw / 2, p.y - 34 * sc, cw, 18, 5);
    ctx.fill();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(chip, p.x, p.y - 25 * sc);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  },

  /** Ring the first thing to fail, so a student can see where and what gave way. */
  drawFailureMarker(ctx) {
    const f = this.firstFailure;
    if (this.mode !== 'test' || !f) return;
    const label = f.type === 'deflection' ? 'Deck folded here'
                : f.type === 'compression' ? 'Buckled here' : 'Snapped here';
    const p = this.toScreen(f.x, f.y);
    const sc = this.PPM / 40;
    const pulse = 0.6 + 0.4 * Math.sin(this.time * 6);

    ctx.save();
    ctx.strokeStyle = '#f87171';
    ctx.globalAlpha = pulse;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 22 * sc + Math.sin(this.time * 6) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    ctx.font = `700 ${Math.max(10, 11 * sc)}px ui-monospace, Menlo, monospace`;
    const w = ctx.measureText(label).width + 16;
    const y = p.y - 36 * sc;
    ctx.fillStyle = 'rgba(69, 10, 10, 0.92)';
    ctx.beginPath();
    ctx.roundRect(p.x - w / 2, y - 10, w, 20, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#fecaca';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x, y + 0.5);
    ctx.restore();
  },

  drawGhostStrut(ctx) {
    if (!this.dragStartNode || this.mode === 'test') return;
    const snap = this.snapGrid(this.mouseWorld.x, this.mouseWorld.y);
    const p1 = this.toScreen(this.dragStartNode.x, this.dragStartNode.y);
    const p2 = this.toScreen(snap.x, snap.y);
    const len = Math.hypot(snap.x - this.dragStartNode.x, snap.y - this.dragStartNode.y);
    const tooLong = len > MAX_STRUT_LENGTH;
    const tooShort = len < MIN_STRUT_LENGTH;
    const blocked = !!this.zoneViolation(snap.y);
    const valid = !tooLong && !tooShort && !blocked;
    const mat = MATERIALS[this.activeMat];
    const cost = Math.round(len * mat.cost);
    const wouldExceed = this.calculateCost() + cost > this.level.budget;

    // Reach limit ring, so the length rule is visible rather than just enforced
    ctx.strokeStyle = tooLong ? 'rgba(239, 68, 68, 0.45)' : 'rgba(56, 189, 248, 0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, MAX_STRUT_LENGTH * this.PPM, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = valid ? mat.color : '#ef4444';
    ctx.lineWidth = valid ? this.memberHalfHeight(this.activeMat) * 2 : 3;
    ctx.globalAlpha = valid ? 0.55 : 0.9;
    ctx.setLineDash(valid ? [] : [6, 5]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Readout chip: length, price, and why it is refused
    const mx = (p1.x + p2.x) * 0.5;
    const my = (p1.y + p2.y) * 0.5;
    const label = blocked ? `⛔ ${this.level.constraint.blurb}`
                : tooLong ? `${len.toFixed(1)} m — too long (max ${MAX_STRUT_LENGTH})`
                : tooShort ? 'too short'
                : `${len.toFixed(1)} m · $${cost.toLocaleString()}`;
    ctx.font = `600 11px ui-monospace, Menlo, monospace`;
    const w = ctx.measureText(label).width + 14;

    ctx.fillStyle = valid ? (wouldExceed ? 'rgba(120, 53, 15, 0.95)' : 'rgba(10, 17, 32, 0.94)') : 'rgba(127, 29, 29, 0.95)';
    ctx.beginPath();
    ctx.roundRect(mx - w / 2, my - 26, w, 19, 5);
    ctx.fill();
    ctx.strokeStyle = valid ? (wouldExceed ? '#f59e0b' : mat.color) : '#ef4444';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.fillText(label, mx, my - 13);
    ctx.textAlign = 'left';
  },

  drawParticles(ctx) {
    for (const p of this.particles) {
      const s = this.toScreen(p.x, p.y);
      const alpha = clamp(p.life, 0, 1);

      if (p.kind === 'dust') {
        // Fade in over the first fifth of life, then out — avoids a white pop on spawn.
        const puff = p.life > 0.8 ? (1 - p.life) / 0.2 : p.life / 0.8;
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, p.size);
        g.addColorStop(0, `rgba(176, 182, 196, ${puff * 0.10})`);
        g.addColorStop(0.5, `rgba(140, 150, 170, ${puff * 0.05})`);
        g.addColorStop(1, 'rgba(130, 140, 160, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'spark') {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 6;
        ctx.fillRect(s.x - p.size / 2, s.y - p.size / 2, p.size, p.size);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      } else if (p.kind === 'splash') {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, p.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (p.kind === 'piece') {
        // A broken half-member: the material, with a jagged break at one end
        const lw = p.len * this.PPM, th = Math.max(2, p.thick * this.PPM);
        ctx.save();
        ctx.globalAlpha = Math.min(1, alpha * 2.2);
        ctx.translate(s.x, s.y);
        ctx.rotate(p.rot || 0);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-lw / 2, -th / 2); ctx.lineTo(lw / 2, -th / 2);
        ctx.lineTo(lw / 2 - th * 0.35, -th * 0.12); ctx.lineTo(lw / 2, th * 0.15);
        ctx.lineTo(lw / 2 - th * 0.25, th / 2); ctx.lineTo(-lw / 2, th / 2);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(-lw / 2, -th / 2, lw * 0.9, th * 0.28);
        ctx.restore();
        ctx.globalAlpha = 1;
      } else {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(s.x, s.y);
        ctx.rotate(p.rot || 0);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size * 0.5, -p.size * 0.25, p.size, p.size * 0.5);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
  },

  /** Pressure rings racing out from each failure. */
  drawShockwaves(ctx) {
    for (const w of this.shockwaves) {
      const p = this.toScreen(w.x, w.y);
      const r = w.t * w.speed * this.PPM;
      const a = Math.pow(Math.max(0, 1 - w.t / w.life), 1.8);
      if (a <= 0.01) continue;

      // Hot core fading to a thin leading edge
      const g = ctx.createRadialGradient(p.x, p.y, r * 0.55, p.x, p.y, r);
      g.addColorStop(0, 'rgba(255, 190, 120, 0)');
      g.addColorStop(0.75, `rgba(255, 205, 150, ${a * 0.20})`);
      g.addColorStop(1, 'rgba(255, 220, 180, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(255, 214, 165, ${a * 0.55})`;
      ctx.lineWidth = Math.max(1, 5 * a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  },

  /** Depth cue + collapse flash. */
  drawOverlayFX(ctx) {
    const w = this.viewW, h = this.viewH;
    const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    if (this.flash > 0) {
      const f = clamp(this.flash, 0, 1);
      ctx.fillStyle = `rgba(255, 176, 120, ${f * 0.13})`;
      ctx.fillRect(0, 0, w, h);

      // Danger vignette punching in from the edges
      const edge = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2,
                                            w / 2, h / 2, Math.max(w, h) * 0.62);
      edge.addColorStop(0, 'rgba(239, 68, 68, 0)');
      edge.addColorStop(1, `rgba(239, 68, 68, ${f * 0.5})`);
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, w, h);
    }

    // Span dimension line while designing
    if (this.mode === 'build') {
      const t = this.level.terrain;
      const y = this.sy(t.groundY) + 22;
      const x1 = this.sx(t.leftBank), x2 = this.sx(t.rightBank);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(x1, y); ctx.lineTo(x2, y);
      ctx.moveTo(x1, y - 6); ctx.lineTo(x1, y + 6);
      ctx.moveTo(x2, y - 6); ctx.lineTo(x2, y + 6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(203, 213, 225, 0.75)';
      ctx.font = '600 11px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${spanOf(this.level).toFixed(0)} m span`, (x1 + x2) / 2, y + 15);
      ctx.textAlign = 'left';
    }
  },
});
