/**
 * TRUSSCRAFT — RENDERING
 * Everything drawn on the canvas: scenery, structure, vehicle and effects.
 * Adds its methods to TrussCraftApp (see app.js).
 */

Object.assign(TrussCraftApp.prototype, {
  // ==========================================================
  //  RENDERING — ENVIRONMENT
  // ==========================================================
  drawSky(ctx) {
    const w = this.viewW, h = this.viewH;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0a1428');
    sky.addColorStop(0.45, '#132339');
    sky.addColorStop(0.8, '#1d3149');
    sky.addColorStop(1, '#24405c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Low sun glow behind the far hills
    const glowX = w * 0.72, glowY = this.sy(this.level.terrain.groundY - 1.5);
    const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, w * 0.45);
    glow.addColorStop(0, 'rgba(251, 191, 130, 0.16)');
    glow.addColorStop(0.4, 'rgba(190, 130, 110, 0.07)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // Stars, fading out toward the horizon
    ctx.fillStyle = '#e2e8f0';
    for (let i = 0; i < 46; i++) {
      const sxp = hash1(i * 1.7) * w;
      const syp = hash1(i * 4.3) * h * 0.42;
      const tw = 0.35 + 0.35 * Math.sin(this.time * 1.6 + i);
      ctx.globalAlpha = tw * (1 - syp / (h * 0.5)) * 0.75;
      const s = hash1(i * 9.1) > 0.85 ? 1.8 : 1.1;
      ctx.fillRect(sxp, syp, s, s);
    }
    ctx.globalAlpha = 1;
  },

  drawClouds(ctx) {
    ctx.save();
    for (const c of this.clouds) {
      c.x += c.speed * this.frameDt;
      if (this.sx(c.x) > this.viewW + 220) c.x = this.toWorld(-220, 0).x;
      const p = this.toScreen(c.x, c.y);
      const s = c.scale * this.PPM * 0.04;
      ctx.fillStyle = 'rgba(148, 178, 214, 0.045)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 46 * s, 12 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x - 26 * s, p.y + 4 * s, 30 * s, 9 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x + 30 * s, p.y + 3 * s, 26 * s, 8 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  /** Layered parallax hills behind the gorge. */
  drawHills(ctx) {
    const w = this.viewW;
    const baseY = this.sy(this.level.terrain.groundY);
    const layers = [
      { amp: 46, freq: 0.0042, off: 0,   y: baseY - 40, color: '#16273c' },
      { amp: 34, freq: 0.0068, off: 120, y: baseY - 16, color: '#1a2f47' },
      { amp: 22, freq: 0.0105, off: 340, y: baseY + 4,  color: '#1f3852' }
    ];
    for (const L of layers) {
      ctx.fillStyle = L.color;
      ctx.beginPath();
      ctx.moveTo(0, this.viewH);
      for (let x = 0; x <= w; x += 8) {
        const n = noise1((x + L.off) * L.freq * 12) * 2 - 1;
        const n2 = noise1((x + L.off) * L.freq * 34) * 2 - 1;
        ctx.lineTo(x, L.y + n * L.amp + n2 * L.amp * 0.28);
      }
      ctx.lineTo(w, this.viewH);
      ctx.closePath();
      ctx.fill();
    }
  },

  /** The gorge is far away and deep — darken it so it reads as a void, not a panel. */
  drawGorgeDepth(ctx) {
    const t = this.level.terrain;
    const topY = this.sy(t.groundY - 2.2);
    const g = ctx.createLinearGradient(0, topY, 0, this.viewH);
    g.addColorStop(0, 'rgba(5, 9, 18, 0)');
    g.addColorStop(0.35, 'rgba(5, 9, 18, 0.55)');
    g.addColorStop(1, 'rgba(3, 6, 13, 0.92)');
    ctx.fillStyle = g;
    ctx.fillRect(0, topY, this.viewW, this.viewH - topY);

    // Mist drifting just above the water
    const mistY = this.sy(t.waterY);
    const mist = ctx.createLinearGradient(0, mistY - 70, 0, mistY + 6);
    mist.addColorStop(0, 'rgba(148, 178, 214, 0)');
    mist.addColorStop(1, 'rgba(148, 178, 214, 0.13)');
    ctx.fillStyle = mist;
    ctx.save();
    ctx.beginPath();
    for (let x = 0; x <= this.viewW; x += 10) {
      const y = mistY - 46 + Math.sin(x * 0.012 + this.time * 0.35) * 12 + Math.sin(x * 0.031 - this.time * 0.2) * 6;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.lineTo(this.viewW, mistY + 6);
    ctx.lineTo(0, mistY + 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },

  drawWater(ctx) {
    const t = this.level.terrain;
    const w = this.viewW, h = this.viewH;
    const surfaceY = this.sy(t.waterY);

    const grad = ctx.createLinearGradient(0, surfaceY, 0, h);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
    grad.addColorStop(0.3, 'rgba(14, 100, 160, 0.34)');
    grad.addColorStop(1, 'rgba(4, 22, 46, 0.85)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, surfaceY, w, h - surfaceY);

    // Reflection of the structure, squashed and rippled
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, surfaceY, w, h - surfaceY);
    ctx.clip();
    ctx.globalAlpha = 0.16;
    ctx.translate(0, surfaceY * 2);
    ctx.scale(1, -0.85);
    ctx.filter = 'blur(1px)';
    this.drawMembers(ctx, true);
    ctx.filter = 'none';
    ctx.restore();
    ctx.globalAlpha = 1;

    // Animated surface: three sine layers
    for (let layer = 0; layer < 3; layer++) {
      const amp = 2.4 - layer * 0.6;
      const speed = 0.9 + layer * 0.45;
      const wavelength = 90 + layer * 55;
      ctx.beginPath();
      ctx.moveTo(0, surfaceY + layer * 3);
      for (let x = 0; x <= w; x += 6) {
        const y = surfaceY + layer * 3.2 +
                  Math.sin((x / wavelength) + this.time * speed) * amp +
                  Math.sin((x / (wavelength * 0.42)) - this.time * speed * 1.4) * amp * 0.4;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = layer === 0 ? 'rgba(125, 211, 252, 0.55)' : `rgba(125, 211, 252, ${0.16 - layer * 0.04})`;
      ctx.lineWidth = layer === 0 ? 2 : 1.4;
      ctx.stroke();
    }

    // Specular glints
    ctx.fillStyle = 'rgba(186, 230, 253, 0.30)';
    for (let i = 0; i < 22; i++) {
      const gx = hash1(i * 2.3) * w;
      const gy = surfaceY + 8 + hash1(i * 5.1) * (h - surfaceY) * 0.55;
      const len = 8 + hash1(i * 3.7) * 26;
      const a = 0.5 + 0.5 * Math.sin(this.time * 1.5 + i * 2.1);
      ctx.globalAlpha = a * 0.3 * (1 - (gy - surfaceY) / Math.max(1, h - surfaceY));
      ctx.fillRect(gx, gy, len, 1.4);
    }
    ctx.globalAlpha = 1;
  },

  /** Jagged deterministic cliff profile — same shape every frame. */
  cliffEdgeX(side, y, baseX) {
    const n = noise1(y * 1.7 + (side === 'left' ? 0 : 91.3));
    const n2 = noise1(y * 5.2 + (side === 'left' ? 12 : 44));
    const jag = (n - 0.5) * 0.85 + (n2 - 0.5) * 0.3;
    return baseX + (side === 'left' ? -0.15 + jag * -0.55 : 0.15 + jag * 0.55);
  },

  drawCliffs(ctx) {
    const t = this.level.terrain;
    const h = this.viewH, w = this.viewW;
    const bottomWorld = this.toWorld(0, h).y + 1;

    for (const side of ['left', 'right']) {
      const baseX = side === 'left' ? t.leftBank : t.rightBank;
      const outerX = side === 'left' ? 0 : w;

      ctx.beginPath();
      ctx.moveTo(outerX, this.sy(t.groundY));
      ctx.lineTo(this.sx(baseX), this.sy(t.groundY));
      for (let y = t.groundY; y <= bottomWorld; y += 0.28) {
        ctx.lineTo(this.sx(this.cliffEdgeX(side, y, baseX)), this.sy(y));
      }
      ctx.lineTo(outerX, h);
      ctx.closePath();

      ctx.save();
      ctx.clip();

      // Rock body
      const rock = ctx.createLinearGradient(0, this.sy(t.groundY), 0, h);
      rock.addColorStop(0, '#3a4d6b');
      rock.addColorStop(0.3, '#2a3b56');
      rock.addColorStop(1, '#16243a');
      ctx.fillStyle = rock;
      ctx.fillRect(0, 0, w, h);

      // Sedimentary strata
      for (let i = 0; i < 22; i++) {
        const yw = t.groundY + 0.55 + i * 0.62 + noise1(i * 3.3 + (side === 'left' ? 0 : 50)) * 0.3;
        if (yw > bottomWorld) break;
        const sh = 3 + hash1(i * 7.7) * 7;
        ctx.fillStyle = i % 3 === 0 ? 'rgba(90, 116, 150, 0.16)' : 'rgba(10, 17, 30, 0.28)';
        ctx.fillRect(0, this.sy(yw), w, sh);
      }

      // Speckled mineral texture
      for (let i = 0; i < 90; i++) {
        const px = hash1(i * 1.31 + (side === 'left' ? 0 : 7)) * w;
        const py = this.sy(t.groundY) + hash1(i * 2.77 + (side === 'left' ? 3 : 11)) * (h - this.sy(t.groundY));
        ctx.fillStyle = hash1(i * 5.5) > 0.6 ? 'rgba(148, 178, 214, 0.09)' : 'rgba(0, 0, 0, 0.16)';
        ctx.fillRect(px, py, 2, 2);
      }

      // Shadow along the gorge face
      const faceGrad = ctx.createLinearGradient(
        this.sx(side === 'left' ? baseX - 1.6 : baseX + 1.6), 0, this.sx(baseX), 0);
      faceGrad.addColorStop(0, 'rgba(0,0,0,0)');
      faceGrad.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = faceGrad;
      ctx.fillRect(0, 0, w, h);

      ctx.restore();

      // Cliff outline
      ctx.strokeStyle = '#3d5675';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Grass / soil cap on the plateau
      const capY = this.sy(t.groundY);
      const capX0 = side === 'left' ? 0 : this.sx(baseX);
      const capW = side === 'left' ? this.sx(baseX) : w - this.sx(baseX);
      ctx.fillStyle = '#3f5d3a';
      ctx.fillRect(capX0, capY - 5, capW, 5);
      ctx.fillStyle = '#4d7044';
      ctx.fillRect(capX0, capY - 5, capW, 2);

      // Grass tufts
      ctx.strokeStyle = '#5c8450';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < 40; i++) {
        const gx = capX0 + hash1(i * 3.9 + (side === 'left' ? 0 : 61)) * capW;
        const gh = 3 + hash1(i * 6.1) * 5;
        const sway = Math.sin(this.time * 1.1 + i) * 1.2;
        ctx.moveTo(gx, capY - 5);
        ctx.lineTo(gx + sway, capY - 5 - gh);
      }
      ctx.stroke();
    }
  },

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

  /** Mid-river rock stack that carries anchors, drawn to match the cliffs. */
  drawPier(ctx) {
    const t = this.level.terrain;
    if (!t.pier) return;
    const p = t.pier;
    const cx = this.sx(p.x);
    const top = this.sy(p.topY);
    const halfTop = (p.width / 2) * this.PPM;
    const halfBot = (p.width / 2) * 1.9 * this.PPM;
    const h = this.viewH;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - halfTop, top);
    for (let y = p.topY; y <= this.toWorld(0, h).y + 1; y += 0.3) {
      const k = (y - p.topY) / 6;
      const w = lerp(halfTop, halfBot, clamp(k, 0, 1));
      const jag = (noise1(y * 2.1 + 30) - 0.5) * 0.28 * this.PPM;
      ctx.lineTo(cx + w + jag, this.sy(y));
    }
    ctx.lineTo(cx + halfBot, h);
    ctx.lineTo(cx - halfBot, h);
    for (let y = this.toWorld(0, h).y + 1; y >= p.topY; y -= 0.3) {
      const k = (y - p.topY) / 6;
      const w = lerp(halfTop, halfBot, clamp(k, 0, 1));
      const jag = (noise1(y * 2.1 + 77) - 0.5) * 0.28 * this.PPM;
      ctx.lineTo(cx - w + jag, this.sy(y));
    }
    ctx.closePath();
    ctx.save();
    ctx.clip();

    const rock = ctx.createLinearGradient(0, top, 0, h);
    rock.addColorStop(0, '#3a4d6b');
    rock.addColorStop(0.3, '#2a3b56');
    rock.addColorStop(1, '#16243a');
    ctx.fillStyle = rock;
    ctx.fillRect(0, 0, this.viewW, h);

    for (let i = 0; i < 18; i++) {
      const yw = p.topY + 0.5 + i * 0.62;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(90, 116, 150, 0.16)' : 'rgba(10, 17, 30, 0.28)';
      ctx.fillRect(cx - halfBot, this.sy(yw), halfBot * 2, 3 + hash1(i * 4.4) * 6);
    }
    const shade = ctx.createLinearGradient(cx - halfBot, 0, cx + halfBot, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.35)');
    shade.addColorStop(0.4, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = shade;
    ctx.fillRect(cx - halfBot, 0, halfBot * 2, h);
    ctx.restore();

    ctx.strokeStyle = '#3d5675';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Grass cap so it reads as land, like the banks
    ctx.fillStyle = '#3f5d3a';
    ctx.fillRect(cx - halfTop, top - 4, halfTop * 2, 4);
    ctx.fillStyle = '#4d7044';
    ctx.fillRect(cx - halfTop, top - 4, halfTop * 2, 2);
  },

  /** Lattice tower under any anchor standing above its bank. */
  drawPylons(ctx) {
    const t = this.level.terrain;
    const sc = this.PPM / 40;
    for (const a of this.level.anchors) {
      if (a.y >= t.groundY - 0.6) continue;
      const cx = this.sx(a.x);
      const top = this.sy(a.y);
      const base = this.sy(t.groundY);
      const halfTop = 5 * sc, halfBase = 13 * sc;

      ctx.strokeStyle = '#33455f';
      ctx.lineWidth = 3 * sc;
      ctx.beginPath();
      ctx.moveTo(cx - halfTop, top); ctx.lineTo(cx - halfBase, base);
      ctx.moveTo(cx + halfTop, top); ctx.lineTo(cx + halfBase, base);
      ctx.stroke();

      // Cross bracing
      ctx.strokeStyle = '#2a3a52';
      ctx.lineWidth = 1.6 * sc;
      ctx.beginPath();
      const rungs = Math.max(3, Math.round((base - top) / (16 * sc)));
      for (let i = 0; i <= rungs; i++) {
        const f = i / rungs, y = lerp(top, base, f), w = lerp(halfTop, halfBase, f);
        ctx.moveTo(cx - w, y); ctx.lineTo(cx + w, y);
        if (i < rungs) {
          const f2 = (i + 1) / rungs, y2 = lerp(top, base, f2), w2 = lerp(halfTop, halfBase, f2);
          ctx.moveTo(cx - w, y);  ctx.lineTo(cx + w2, y2);
          ctx.moveTo(cx + w, y);  ctx.lineTo(cx - w2, y2);
        }
      }
      ctx.stroke();
    }
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

  drawMembers(ctx, reflection = false) {
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
    if (!reflection && this.mode === 'test') this.drawStressLabels(ctx);
  },

  drawMember(ctx, m, reflection) {
    const p1 = this.toScreen(m.n1.x, m.n1.y);
    const p2 = this.toScreen(m.n2.x, m.n2.y);
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
    const half = this.memberHalfHeight(m.mat);
    const base = test ? stressColor(m.force, s) : mat.color;

    ctx.save();
    ctx.translate(p1.x, p1.y);
    ctx.rotate(Math.atan2(dy, dx));

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
        // Free joint: bolted gusset plate
        const r = 5 * sc;
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

  drawVehicle(ctx) {
    const v = this.vehicle;
    if (!v) return;
    const p = this.toScreen(v.x, v.y);
    const w = v.width * this.PPM;
    const r = v.wheelRadius * this.PPM;
    const accent = v.crashed ? '#ef4444' : '#38bdf8';

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(v.tilt + (v.crashed ? Math.sin(this.time * 3) * 0.25 : 0));

    // Contact shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.95, w * 0.46, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    const bodyH = v.type === 'truck' ? r * 2.9 : r * 2.2;

    if (v.type === 'truck') {
      // Freight box
      const boxW = w * 0.62;
      const g = ctx.createLinearGradient(0, -bodyH, 0, 0);
      g.addColorStop(0, '#e2e8f0');
      g.addColorStop(1, '#94a3b8');
      ctx.fillStyle = v.crashed ? '#ef4444' : g;
      ctx.beginPath();
      ctx.roundRect(-w * 0.5, -bodyH, boxW, bodyH, 2);
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Corrugation
      ctx.strokeStyle = 'rgba(71,85,105,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -w * 0.5 + 5; x < -w * 0.5 + boxW - 3; x += 6) {
        ctx.moveTo(x, -bodyH + 3); ctx.lineTo(x, -3);
      }
      ctx.stroke();

      // Cab
      const cabX = -w * 0.5 + boxW;
      const cabH = bodyH * 0.72;
      const cg = ctx.createLinearGradient(0, -cabH, 0, 0);
      cg.addColorStop(0, '#7dd3fc');
      cg.addColorStop(1, '#0369a1');
      ctx.fillStyle = v.crashed ? '#b91c1c' : cg;
      ctx.beginPath();
      ctx.roundRect(cabX, -cabH, w * 0.5 - 1, cabH, [3, 5, 2, 2]);
      ctx.fill();
      ctx.strokeStyle = '#082f49';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Windscreen
      ctx.fillStyle = 'rgba(186, 230, 253, 0.85)';
      ctx.beginPath();
      ctx.roundRect(cabX + w * 0.16, -cabH + 3, w * 0.28, cabH * 0.45, 2);
      ctx.fill();
    } else {
      // Car / van silhouette
      const cg = ctx.createLinearGradient(0, -bodyH, 0, 0);
      cg.addColorStop(0, v.type === 'van' ? '#a5b4fc' : '#7dd3fc');
      cg.addColorStop(1, v.type === 'van' ? '#4338ca' : '#0369a1');
      ctx.fillStyle = v.crashed ? '#ef4444' : cg;
      ctx.beginPath();
      ctx.roundRect(-w * 0.5, -bodyH * 0.62, w, bodyH * 0.62, [4, 4, 3, 3]);
      ctx.fill();
      // Cabin
      ctx.beginPath();
      ctx.moveTo(-w * 0.28, -bodyH * 0.62);
      ctx.lineTo(-w * 0.16, -bodyH);
      ctx.lineTo(w * 0.22, -bodyH);
      ctx.lineTo(w * 0.34, -bodyH * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#082f49';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Glass
      ctx.fillStyle = 'rgba(186, 230, 253, 0.85)';
      ctx.beginPath();
      ctx.moveTo(-w * 0.23, -bodyH * 0.66);
      ctx.lineTo(-w * 0.14, -bodyH * 0.94);
      ctx.lineTo(w * 0.19, -bodyH * 0.94);
      ctx.lineTo(w * 0.28, -bodyH * 0.66);
      ctx.closePath();
      ctx.fill();
    }

    // Lamps
    ctx.fillStyle = v.crashed ? '#7f1d1d' : '#fef3c7';
    ctx.beginPath();
    ctx.arc(w * 0.46, -bodyH * 0.3, Math.max(1.5, r * 0.16), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(-w * 0.47, -bodyH * 0.3, Math.max(1.2, r * 0.13), 0, Math.PI * 2);
    ctx.fill();

    if (!v.crashed) {
      // Headlight wash
      const beam = ctx.createLinearGradient(w * 0.46, 0, w * 0.46 + r * 5, 0);
      beam.addColorStop(0, 'rgba(254, 243, 199, 0.28)');
      beam.addColorStop(1, 'rgba(254, 243, 199, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(w * 0.46, -bodyH * 0.3);
      ctx.lineTo(w * 0.46 + r * 5, -bodyH * 0.3 - r * 1.5);
      ctx.lineTo(w * 0.46 + r * 5, -bodyH * 0.3 + r * 1.5);
      ctx.closePath();
      ctx.fill();
    }

    // Wheels with rotating spokes
    const wheelXs = v.type === 'truck' ? [-w * 0.34, w * 0.02, w * 0.34] : [-w * 0.32, w * 0.32];
    for (const wx of wheelXs) {
      // Each wheel hangs on its spring: it drops away when unloaded and rises when it takes weight.
      const wy = v.extensionAt(wx / this.PPM) * this.PPM;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(wx, wy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = Math.max(1.5, r * 0.22);
      ctx.stroke();

      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(v.wheelAngle);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = Math.max(1, r * 0.13);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
      }
      ctx.stroke();
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1, r * 0.16), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
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
