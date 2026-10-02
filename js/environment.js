/**
 * TRUSSCRAFT — ENVIRONMENT
 * The world behind and around the bridge: sky, sun, clouds, hills, water, cliffs, plants and the
 * life each level has (see THEMES in config.js). Adds its methods to TrussCraftApp (see app.js).
 *
 * Everything here is deterministic in time and position, so nothing shimmers or pops between
 * frames, and none of it touches the simulation.
 */
Object.assign(TrussCraftApp.prototype, {
  /** The current level's palette (the blueprint theme if a level has none). */
  worldTheme() { return this.level.theme || THEMES.blueprint; },

  // ----------------------------------------------------------
  //  SKY
  // ----------------------------------------------------------
  drawSky(ctx) {
    const th = this.worldTheme();
    const w = this.viewW, h = this.viewH;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    [0, 0.42, 0.74, 1].forEach((stop, i) => sky.addColorStop(stop, th.sky[i]));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    if (th.blueprint) this.drawBlueprintSky(ctx);

    // Stars, fading toward the horizon
    if (th.stars > 0) {
      ctx.fillStyle = '#eef2f8';
      const n = Math.round(70 * th.stars);
      for (let i = 0; i < n; i++) {
        const sxp = hash1(i * 1.7) * w;
        const syp = hash1(i * 4.3) * h * 0.46;
        const tw = 0.35 + 0.35 * Math.sin(this.time * 1.6 + i);
        ctx.globalAlpha = tw * (1 - syp / (h * 0.55)) * 0.8 * Math.min(1, th.stars * 1.6);
        const s = hash1(i * 9.1) > 0.85 ? 1.9 : 1.2;
        ctx.fillRect(sxp, syp, s, s);
      }
      ctx.globalAlpha = 1;
    }

    // Sun: a soft halo, slow rays, then the disc
    if (th.sun) {
      const sc = this.PPM / 45;
      const sx = w * th.sun.x, sy = this.sy(this.level.terrain.groundY + th.sun.y);
      const r = th.sun.r * Math.max(0.55, sc);
      const halo = ctx.createRadialGradient(sx, sy, r * 0.4, sx, sy, r * 9);
      halo.addColorStop(0, `rgba(${th.sun.glow}, 0.5)`);
      halo.addColorStop(0.3, `rgba(${th.sun.glow}, 0.16)`);
      halo.addColorStop(1, `rgba(${th.sun.glow}, 0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(this.time * 0.02);
      ctx.fillStyle = `rgba(${th.sun.glow}, 0.032)`;
      for (let i = 0; i < 14; i++) {
        ctx.rotate(Math.PI / 7);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(r * 9, -r * 0.28);
        ctx.lineTo(r * 9, r * 0.28);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      const disc = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      disc.addColorStop(0, th.sun.core);
      disc.addColorStop(0.7, th.sun.core);
      disc.addColorStop(1, `rgba(${th.sun.glow}, 0.9)`);
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  /** The sandbox's drawing board: a metre grid and survey marks in the sky. */
  drawBlueprintSky(ctx) {
    const w = this.viewW, h = this.viewH, m = this.PPM;
    ctx.save();
    ctx.lineWidth = 1;
    const x0 = this.originX % m, y0 = this.originY % m;
    for (let x = x0, i = 0; x < w; x += m, i++) {
      ctx.strokeStyle = Math.round((x - this.originX) / m) % 5 === 0 ? 'rgba(120,190,255,0.10)' : 'rgba(120,190,255,0.045)';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = y0; y < h; y += m) {
      ctx.strokeStyle = Math.round((y - this.originY) / m) % 5 === 0 ? 'rgba(120,190,255,0.10)' : 'rgba(120,190,255,0.045)';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.restore();
  },

  drawClouds(ctx) {
    const th = this.worldTheme();
    const w = this.viewW, h = this.viewH;
    ctx.save();
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.x += c.speed * this.frameDt;
      if (this.sx(c.x) > w + 260) c.x = this.toWorld(-260, 0).x;
      const yf = (c.y - 0.4) / 3.2;                       // 0..1: kept in screen space so clouds stay in view
      const px = this.sx(c.x), py = h * (0.05 + yf * 0.3);
      const s = c.scale * Math.max(0.6, this.PPM / 48);
      this.puffyCloud(ctx, px, py, s, th.cloud, i);
    }
    ctx.restore();
  },

  /** One soft cloud: overlapping puffs with a shaded underside. */
  puffyCloud(ctx, x, y, s, cloud, seed) {
    const puffs = [[0, 0, 26], [-30, 7, 19], [30, 6, 21], [-12, -9, 20], [15, -8, 18], [52, 10, 14], [-52, 11, 14]];
    ctx.fillStyle = cloud.shade;
    for (const [dx, dy, r] of puffs) {
      ctx.beginPath(); ctx.arc(x + dx * s, y + (dy + 5) * s, r * s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = cloud.fill;
    for (const [dx, dy, r] of puffs) {
      ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); ctx.fill();
    }
  },

  /** Layered parallax hills; the dusk level carries a factory skyline in the back. */
  drawHills(ctx) {
    const th = this.worldTheme();
    const w = this.viewW;
    const baseY = this.sy(this.level.terrain.groundY);
    const sc = Math.max(0.6, this.PPM / 45);
    const layers = [
      { amp: 54 * sc, freq: 0.0042, off: 0,   y: baseY - 46 * sc, color: th.hills[0] },
      { amp: 38 * sc, freq: 0.0068, off: 120, y: baseY - 20 * sc, color: th.hills[1] },
      { amp: 24 * sc, freq: 0.0105, off: 340, y: baseY + 2 * sc,  color: th.hills[2] }
    ];
    layers.forEach((L, li) => {
      ctx.fillStyle = L.color;
      ctx.beginPath();
      ctx.moveTo(0, this.viewH);
      const ridge = [];
      for (let x = 0; x <= w; x += 8) {
        const n = noise1((x + L.off) * L.freq * 12) * 2 - 1;
        const n2 = noise1((x + L.off) * L.freq * 34) * 2 - 1;
        const y = L.y + n * L.amp + n2 * L.amp * 0.28;
        ridge.push([x, y]);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, this.viewH);
      ctx.closePath();
      ctx.fill();

      // A thin rim of light on the ridge gives the layers depth
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ridge.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();

      if (li === 0 && th.skyline === 'chimneys') this.drawSkyline(ctx, ridge, th);
    });
  },

  /** Factory chimneys on the far ridge, smoke rising from them. */
  drawSkyline(ctx, ridge, th) {
    const sc = Math.max(0.6, this.PPM / 45);
    const spots = [0.12, 0.2, 0.52, 0.58, 0.86];
    spots.forEach((f, i) => {
      const [x, y] = ridge[Math.min(ridge.length - 1, Math.floor(f * ridge.length))];
      const bh = (30 + hash1(i * 3.3) * 22) * sc;
      ctx.fillStyle = '#2e1f3c';
      ctx.fillRect(x - 14 * sc, y - bh * 0.5, 28 * sc, bh * 0.5 + 4);
      ctx.fillRect(x - 3 * sc, y - bh, 6 * sc, bh * 0.55);
      ctx.fillStyle = 'rgba(255,200,120,0.55)';
      for (let k = 0; k < 3; k++) ctx.fillRect(x - 11 * sc + k * 8 * sc, y - bh * 0.35, 4 * sc, 4 * sc);
      // smoke plume
      for (let k = 0; k < 6; k++) {
        const age = (this.time * 0.12 + k / 6 + i * 0.17) % 1;
        ctx.fillStyle = `rgba(80, 58, 92, ${0.32 * (1 - age)})`;
        ctx.beginPath();
        ctx.arc(x + age * 34 * sc + Math.sin(age * 5 + i) * 4, y - bh - age * 70 * sc, (5 + age * 16) * sc, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  },

  /** The gorge is deep: shade it so it reads as a drop, and lay mist just above the water. */
  drawGorgeDepth(ctx) {
    const th = this.worldTheme();
    const t = this.level.terrain;
    const topY = this.sy(t.groundY - 1.4);
    const d = th.depth;

    // Distant canyon walls: two ridges of rock receding into haze, so the drop has depth and the
    // gap is a place rather than a dark slab.
    const w = this.viewW, h = this.viewH;
    const walls = [
      { y: t.groundY + 1.1, amp: 0.9, freq: 0.011, off: 40,  color: th.hills[1], a: 0.9 },
      { y: t.groundY + 2.8, amp: 1.2, freq: 0.016, off: 210, color: th.hills[2], a: 0.95 }
    ];
    for (const L of walls) {
      const grad = ctx.createLinearGradient(0, this.sy(L.y - L.amp), 0, h);
      grad.addColorStop(0, L.color);
      grad.addColorStop(1, `rgba(${th.shade}, 0.95)`);
      ctx.globalAlpha = L.a;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 10) {
        const n = noise1((x + L.off) * L.freq * 9) * 2 - 1;
        const n2 = noise1((x + L.off) * L.freq * 30) * 2 - 1;
        ctx.lineTo(x, this.sy(L.y) + (n * L.amp + n2 * L.amp * 0.3) * this.PPM);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      // haze between the ridges
      const haze = ctx.createLinearGradient(0, this.sy(L.y - L.amp), 0, this.sy(L.y + 2.4));
      haze.addColorStop(0, `rgba(${th.mist.rgb}, 0)`);
      haze.addColorStop(1, `rgba(${th.mist.rgb}, ${th.mist.a * 0.9})`);
      ctx.fillStyle = haze;
      ctx.fillRect(0, this.sy(L.y - L.amp), w, this.PPM * (2.4 + L.amp));
    }

    const g = ctx.createLinearGradient(0, topY, 0, this.viewH);
    g.addColorStop(0, `rgba(${th.shade}, 0)`);
    g.addColorStop(0.45, `rgba(${th.shade}, ${0.16 * d})`);
    g.addColorStop(1, `rgba(${th.shade}, ${0.6 * d})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, topY, this.viewW, this.viewH - topY);

    const mistY = this.sy(t.waterY);
    const mist = ctx.createLinearGradient(0, mistY - 110, 0, mistY + 6);
    mist.addColorStop(0, `rgba(${th.mist.rgb}, 0)`);
    mist.addColorStop(1, `rgba(${th.mist.rgb}, ${th.mist.a})`);
    ctx.fillStyle = mist;
    ctx.beginPath();
    for (let x = 0; x <= this.viewW; x += 10) {
      const y = mistY - 108 + Math.sin(x * 0.012 + this.time * 0.35) * 10 + Math.sin(x * 0.031 - this.time * 0.2) * 5;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.lineTo(this.viewW, mistY + 6);
    ctx.lineTo(0, mistY + 6);
    ctx.closePath();
    ctx.fill();
  },

  // ----------------------------------------------------------
  //  WATER
  // ----------------------------------------------------------
  drawWater(ctx) {
    const th = this.worldTheme();
    const t = this.level.terrain;
    const w = this.viewW, h = this.viewH;
    const surfaceY = this.sy(t.waterY);
    const rough = th.rough ? 1.9 : 1;
    if (surfaceY >= h) return;

    const grad = ctx.createLinearGradient(0, surfaceY, 0, h);
    grad.addColorStop(0, th.water.top);
    grad.addColorStop(0.35, th.water.mid);
    grad.addColorStop(1, th.water.deep);
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = grad;
    ctx.fillRect(0, surfaceY, w, h - surfaceY);
    ctx.globalAlpha = 1;

    // Reflection of the structure, squashed and rippled
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, surfaceY, w, h - surfaceY);
    ctx.clip();
    ctx.globalAlpha = 0.2;
    ctx.translate(0, surfaceY * 2);
    ctx.scale(1, -0.85);
    ctx.filter = 'blur(1.2px)';
    this.drawMembers(ctx, true);
    ctx.filter = 'none';
    ctx.restore();
    ctx.globalAlpha = 1;

    // Light shafts sinking from the surface
    ctx.save();
    ctx.beginPath(); ctx.rect(0, surfaceY, w, h - surfaceY); ctx.clip();
    for (let i = 0; i < 7; i++) {
      const x = hash1(i * 6.1) * w + Math.sin(this.time * 0.25 + i) * 14;
      const g2 = ctx.createLinearGradient(0, surfaceY, 0, h);
      g2.addColorStop(0, 'rgba(255,255,255,0.11)');
      g2.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(x - 6, surfaceY); ctx.lineTo(x + 8, surfaceY);
      ctx.lineTo(x + 46 + i * 5, h); ctx.lineTo(x - 22 + i * 5, h);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // Animated surface: three sine layers; a storm roughens them
    for (let layer = 0; layer < 3; layer++) {
      const amp = (2.6 - layer * 0.6) * rough;
      const speed = (0.9 + layer * 0.45) * (th.rough ? 1.5 : 1);
      const wavelength = 90 + layer * 55;
      ctx.beginPath();
      ctx.moveTo(0, surfaceY + layer * 3);
      for (let x = 0; x <= w; x += 6) {
        const y = surfaceY + layer * 3.2 +
                  Math.sin((x / wavelength) + this.time * speed) * amp +
                  Math.sin((x / (wavelength * 0.42)) - this.time * speed * 1.4) * amp * 0.4;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = layer === 0 ? th.water.line : th.water.glint.replace(/[\d.]+\)$/, `${0.2 - layer * 0.06})`);
      ctx.lineWidth = layer === 0 ? 2.2 : 1.4;
      ctx.stroke();
    }

    // Foam where the water meets the rock, and whitecaps in a storm
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const bx of [t.leftBank, t.rightBank]) {
      for (let i = 0; i < 9; i++) {
        const fx = this.sx(bx) + (hash1(i * 4.1 + bx) - 0.5) * 36 + Math.sin(this.time * 1.4 + i) * 3;
        const fy = surfaceY + Math.sin(this.time * 1.8 + i * 1.7) * 1.5;
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(this.time * 2 + i);
        ctx.beginPath(); ctx.ellipse(fx, fy, 5 + hash1(i * 2.2) * 6, 2, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (th.rough) {
      for (let i = 0; i < 14; i++) {
        const fx = ((hash1(i * 5.3) * w + this.time * 24 * (0.6 + hash1(i))) % (w + 60)) - 30;
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.ellipse(fx, surfaceY + 1, 9, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Specular glints
    ctx.fillStyle = th.water.glint;
    for (let i = 0; i < 24; i++) {
      const gx = hash1(i * 2.3) * w;
      const gy = surfaceY + 8 + hash1(i * 5.1) * (h - surfaceY) * 0.55;
      const len = 8 + hash1(i * 3.7) * 26;
      const a = 0.5 + 0.5 * Math.sin(this.time * 1.5 + i * 2.1);
      ctx.globalAlpha = a * 0.34 * (1 - (gy - surfaceY) / Math.max(1, h - surfaceY));
      ctx.fillRect(gx, gy, len, 1.5);
    }
    ctx.globalAlpha = 1;

    this.drawRipples(ctx, surfaceY);
  },

  /** Expanding rings where something hit the water (see addRipple). */
  drawRipples(ctx, surfaceY) {
    ctx.save();
    ctx.lineWidth = 2;
    for (const r of this.ripples) {
      if (r.t < 0) continue;
      const k = r.t / r.life;
      const px = this.sx(r.x);
      ctx.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.7})`;
      ctx.beginPath();
      ctx.ellipse(px, surfaceY + 1, (6 + k * 70 * r.power) * (this.PPM / 45), (2 + k * 9 * r.power) * (this.PPM / 45), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  },

  // ----------------------------------------------------------
  //  CLIFFS, BANKS AND THE ROCK STACK
  // ----------------------------------------------------------
  /** Jagged deterministic cliff profile — same shape every frame. */
  cliffEdgeX(side, y, baseX) {
    const n = noise1(y * 1.7 + (side === 'left' ? 0 : 91.3));
    const n2 = noise1(y * 5.2 + (side === 'left' ? 12 : 44));
    const jag = (n - 0.5) * 0.85 + (n2 - 0.5) * 0.3;
    return baseX + (side === 'left' ? -0.15 + jag * -0.55 : 0.15 + jag * 0.55);
  },

  drawCliffs(ctx) {
    const th = this.worldTheme();
    const t = this.level.terrain;
    const h = this.viewH, w = this.viewW;
    const bottomWorld = this.toWorld(0, h).y + 1;
    const sc = this.PPM / 40;

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

      const rock = ctx.createLinearGradient(0, this.sy(t.groundY), 0, h);
      rock.addColorStop(0, th.rock.top);
      rock.addColorStop(0.3, th.rock.mid);
      rock.addColorStop(1, th.rock.bottom);
      ctx.fillStyle = rock;
      ctx.fillRect(0, 0, w, h);

      // Sedimentary strata
      for (let i = 0; i < 24; i++) {
        const yw = t.groundY + 0.55 + i * 0.62 + noise1(i * 3.3 + (side === 'left' ? 0 : 50)) * 0.3;
        if (yw > bottomWorld) break;
        const sh = (3 + hash1(i * 7.7) * 7) * Math.max(0.7, sc);
        ctx.fillStyle = i % 3 === 0 ? th.rock.light : th.rock.dark;
        ctx.fillRect(0, this.sy(yw), w, sh);
      }

      // Cracks and mineral speckle
      ctx.strokeStyle = th.rock.dark;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const cx = this.sx(baseX) + (side === 'left' ? -1 : 1) * (14 + hash1(i * 9.7 + (side === 'left' ? 0 : 3)) * (w * 0.2));
        const cy = this.sy(t.groundY) + 18 + hash1(i * 4.4) * (h - this.sy(t.groundY) - 40);
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + (hash1(i * 2.2) - 0.5) * 18, cy + 10 + hash1(i * 6.6) * 18);
        ctx.lineTo(cx + (hash1(i * 8.1) - 0.5) * 22, cy + 28 + hash1(i * 3.1) * 14);
      }
      ctx.stroke();
      for (let i = 0; i < 90; i++) {
        const px = hash1(i * 1.31 + (side === 'left' ? 0 : 7)) * w;
        const py = this.sy(t.groundY) + hash1(i * 2.77 + (side === 'left' ? 3 : 11)) * (h - this.sy(t.groundY));
        ctx.fillStyle = hash1(i * 5.5) > 0.6 ? th.rock.light : th.rock.dark;
        ctx.fillRect(px, py, 2, 2);
      }

      // Shade along the gorge face, and a lit edge on the side the sun is on
      const faceGrad = ctx.createLinearGradient(
        this.sx(side === 'left' ? baseX - 1.8 : baseX + 1.8), 0, this.sx(baseX), 0);
      faceGrad.addColorStop(0, 'rgba(0,0,0,0)');
      faceGrad.addColorStop(1, 'rgba(0,0,0,0.42)');
      ctx.fillStyle = faceGrad;
      ctx.fillRect(0, 0, w, h);

      ctx.restore();

      ctx.strokeStyle = th.rock.edge;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Grass / soil cap on the plateau
      const capY = this.sy(t.groundY);
      const capX0 = side === 'left' ? 0 : this.sx(baseX);
      const capW = side === 'left' ? this.sx(baseX) : w - this.sx(baseX);
      const capH = Math.max(5, 6 * sc);
      ctx.fillStyle = th.grass.base;
      ctx.fillRect(capX0, capY - capH, capW, capH);
      ctx.fillStyle = th.grass.top;
      ctx.fillRect(capX0, capY - capH, capW, Math.max(2, capH * 0.4));
      // Soil lip hanging off the edge
      ctx.fillStyle = th.rock.dark;
      ctx.fillRect(capX0, capY, capW, 2);

      ctx.strokeStyle = th.grass.tuft;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < 44; i++) {
        const gx = capX0 + hash1(i * 3.9 + (side === 'left' ? 0 : 61)) * capW;
        const gh = (3 + hash1(i * 6.1) * 5) * Math.max(0.8, sc);
        const sway = Math.sin(this.time * 1.1 + i) * 1.2;
        ctx.moveTo(gx, capY - capH);
        ctx.lineTo(gx + sway, capY - capH - gh);
      }
      ctx.stroke();

      this.drawBankProps(ctx, side, capX0, capW, capY - capH);
    }
  },

  /** Plants and buildings on the plateaus: they set the scene and give the eye a sense of scale. */
  drawBankProps(ctx, side, x0, width, groundPx) {
    const th = this.worldTheme();
    const sc = this.PPM / 40;
    const inner = side === 'left' ? x0 + width : x0;       // the edge by the gorge
    const dir = side === 'left' ? -1 : 1;                  // away from the gorge
    const reach = side === 'left' ? width : width;
    const count = Math.min(7, Math.floor(reach / (70 * sc)));
    const seed = side === 'left' ? 1 : 2;

    for (let i = 0; i < count; i++) {
      const dist = (48 + i * 64 + hash1(i * 5.7 + seed) * 26) * sc;
      const x = inner + dir * dist;
      if (x < 6 || x > this.viewW - 6) continue;
      const k = hash1(i * 9.3 + seed * 17);
      const sway = Math.sin(this.time * 0.9 + i * 1.7 + seed) * 1.4 * sc;

      switch (th.props) {
        case 'pines': {
          const hgt = (34 + k * 30) * sc;
          ctx.fillStyle = 'rgba(40,24,12,0.9)';
          ctx.fillRect(x - 2 * sc, groundPx - 8 * sc, 4 * sc, 8 * sc);
          for (let tier = 0; tier < 3; tier++) {
            const ty = groundPx - 6 * sc - tier * hgt * 0.27;
            const half = (15 - tier * 3.8) * sc * (0.8 + k * 0.4);
            ctx.fillStyle = tier % 2 ? '#2f6b45' : '#3a8052';
            ctx.beginPath();
            ctx.moveTo(x - half + sway * (tier * 0.2), ty);
            ctx.lineTo(x + sway * (0.4 + tier * 0.3), ty - hgt * 0.42);
            ctx.lineTo(x + half + sway * (tier * 0.2), ty);
            ctx.closePath();
            ctx.fill();
          }
          break;
        }
        case 'poplars': {
          const hgt = (44 + k * 30) * sc;
          ctx.fillStyle = 'rgba(30,22,40,0.9)';
          ctx.fillRect(x - 1.5 * sc, groundPx - 10 * sc, 3 * sc, 10 * sc);
          ctx.fillStyle = k > 0.5 ? '#3f6d4c' : '#4b7d55';
          ctx.beginPath();
          ctx.ellipse(x + sway * 0.5, groundPx - 10 * sc - hgt * 0.5, 8 * sc, hgt * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'cacti': {
          const hgt = (26 + k * 20) * sc;
          ctx.fillStyle = '#4f7d45';
          ctx.beginPath(); ctx.roundRect(x - 4 * sc, groundPx - hgt, 8 * sc, hgt, 4 * sc); ctx.fill();
          ctx.beginPath(); ctx.roundRect(x - 12 * sc, groundPx - hgt * 0.7, 6 * sc, hgt * 0.35, 3 * sc); ctx.fill();
          ctx.beginPath(); ctx.roundRect(x + 6 * sc, groundPx - hgt * 0.55, 6 * sc, hgt * 0.3, 3 * sc); ctx.fill();
          ctx.fillStyle = '#6c9c5d';
          ctx.fillRect(x - 1 * sc, groundPx - hgt, 2 * sc, hgt);
          break;
        }
        case 'factory': {
          if (i % 2) break;                                   // fewer, bigger buildings
          const bw = (42 + k * 30) * sc, bh = (22 + k * 16) * sc;
          ctx.fillStyle = '#4a3550';
          ctx.fillRect(x - bw / 2, groundPx - bh, bw, bh);
          ctx.fillStyle = '#3b2a41';
          ctx.fillRect(x - bw / 2, groundPx - bh - 5 * sc, bw * 0.55, 5 * sc);
          ctx.fillRect(x + bw * 0.22, groundPx - bh - 30 * sc, 7 * sc, 30 * sc);   // chimney
          ctx.fillStyle = 'rgba(255,196,120,0.85)';
          for (let wnd = 0; wnd < 4; wnd++) ctx.fillRect(x - bw / 2 + 6 * sc + wnd * 10 * sc, groundPx - bh * 0.7, 5 * sc, 5 * sc);
          for (let p = 0; p < 5; p++) {
            const age = (this.time * 0.18 + p / 5 + i * 0.3) % 1;
            ctx.fillStyle = `rgba(70,52,84,${0.5 * (1 - age)})`;
            ctx.beginPath();
            ctx.arc(x + bw * 0.22 + 3 * sc + age * 26 * sc, groundPx - bh - 30 * sc - age * 56 * sc, (4 + age * 12) * sc, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 'markers': {
          ctx.strokeStyle = 'rgba(120,190,255,0.55)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, groundPx); ctx.lineTo(x, groundPx - 22 * sc);
          ctx.moveTo(x - 6 * sc, groundPx - 22 * sc); ctx.lineTo(x + 6 * sc, groundPx - 22 * sc);
          ctx.stroke();
          break;
        }
        default: break;
      }
    }
  },

  /** The rock stack that carries the mid-river anchors, drawn to match the cliffs. */
  drawPier(ctx) {
    const th = this.worldTheme();
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
      const wv = lerp(halfTop, halfBot, clamp(k, 0, 1));
      const jag = (noise1(y * 2.1 + 30) - 0.5) * 0.28 * this.PPM;
      ctx.lineTo(cx + wv + jag, this.sy(y));
    }
    ctx.lineTo(cx + halfBot, h);
    ctx.lineTo(cx - halfBot, h);
    for (let y = this.toWorld(0, h).y + 1; y >= p.topY; y -= 0.3) {
      const k = (y - p.topY) / 6;
      const wv = lerp(halfTop, halfBot, clamp(k, 0, 1));
      const jag = (noise1(y * 2.1 + 77) - 0.5) * 0.28 * this.PPM;
      ctx.lineTo(cx - wv + jag, this.sy(y));
    }
    ctx.closePath();
    ctx.save();
    ctx.clip();

    const rock = ctx.createLinearGradient(0, top, 0, h);
    rock.addColorStop(0, th.rock.top);
    rock.addColorStop(0.3, th.rock.mid);
    rock.addColorStop(1, th.rock.bottom);
    ctx.fillStyle = rock;
    ctx.fillRect(0, 0, this.viewW, h);

    for (let i = 0; i < 20; i++) {
      const yw = p.topY + 0.5 + i * 0.62;
      ctx.fillStyle = i % 3 === 0 ? th.rock.light : th.rock.dark;
      ctx.fillRect(cx - halfBot, this.sy(yw), halfBot * 2, 3 + hash1(i * 4.4) * 6);
    }
    const shade = ctx.createLinearGradient(cx - halfBot, 0, cx + halfBot, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.32)');
    shade.addColorStop(0.4, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = shade;
    ctx.fillRect(cx - halfBot, 0, halfBot * 2, h);
    ctx.restore();

    ctx.strokeStyle = th.rock.edge;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = th.grass.base;
    ctx.fillRect(cx - halfTop, top - 5, halfTop * 2, 5);
    ctx.fillStyle = th.grass.top;
    ctx.fillRect(cx - halfTop, top - 5, halfTop * 2, 2);

    // Foam round its foot
    const waterPx = this.sy(t.waterY);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 8; i++) {
      const fx = cx + (hash1(i * 3.7) - 0.5) * halfBot * 2.4 + Math.sin(this.time * 1.5 + i) * 3;
      ctx.globalAlpha = 0.3 + 0.25 * Math.sin(this.time * 2 + i);
      ctx.beginPath(); ctx.ellipse(fx, waterPx, 6 + hash1(i) * 6, 2, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
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

      ctx.strokeStyle = '#4a5a74';
      ctx.lineWidth = 3.2 * sc;
      ctx.beginPath();
      ctx.moveTo(cx - halfTop, top); ctx.lineTo(cx - halfBase, base);
      ctx.moveTo(cx + halfTop, top); ctx.lineTo(cx + halfBase, base);
      ctx.stroke();

      ctx.strokeStyle = '#3a4860';
      ctx.lineWidth = 1.7 * sc;
      ctx.beginPath();
      const rungs = Math.max(3, Math.round((base - top) / (16 * sc)));
      for (let i = 0; i <= rungs; i++) {
        const f = i / rungs, y = lerp(top, base, f), wv = lerp(halfTop, halfBase, f);
        ctx.moveTo(cx - wv, y); ctx.lineTo(cx + wv, y);
        if (i < rungs) {
          const f2 = (i + 1) / rungs, y2 = lerp(top, base, f2), w2 = lerp(halfTop, halfBase, f2);
          ctx.moveTo(cx - wv, y);  ctx.lineTo(cx + w2, y2);
          ctx.moveTo(cx + wv, y);  ctx.lineTo(cx - w2, y2);
        }
      }
      ctx.stroke();

      // A warning lamp on top
      const blink = 0.5 + 0.5 * Math.sin(this.time * 3 + a.x);
      ctx.fillStyle = `rgba(255, 90, 80, ${0.35 + 0.65 * blink})`;
      ctx.beginPath(); ctx.arc(cx, top - 7 * sc, 2.6 * sc, 0, Math.PI * 2); ctx.fill();
    }
  },

  // ----------------------------------------------------------
  //  LIFE: birds, airships, rain, dust and the like
  // ----------------------------------------------------------
  /** Things that move behind the bridge. */
  drawAmbientBack(ctx) {
    const list = this.worldTheme().ambient || [];
    if (list.includes('birds')) this.drawBirds(ctx);
    if (list.includes('airships')) this.drawAirships(ctx);
    if (list.includes('fireflies')) this.drawFireflies(ctx);
    if (list.includes('pebbles')) this.drawPebbles(ctx);
    if (list.includes('mist')) this.drawMistBanks(ctx);
  },

  /** Things that fall or drift in front of everything: rain, lightning, dust. */
  drawAmbientFront(ctx) {
    const list = this.worldTheme().ambient || [];
    if (list.includes('rain')) this.drawRain(ctx);
    if (list.includes('lightning') && !this.reduceMotion) this.drawLightning(ctx);
    if (list.includes('dust')) this.drawDust(ctx);
  },

  drawBirds(ctx) {
    const w = this.viewW, h = this.viewH;
    const sc = Math.max(0.7, this.PPM / 45);
    ctx.save();
    ctx.strokeStyle = 'rgba(30, 30, 50, 0.55)';
    ctx.lineWidth = 1.6 * sc;
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const speed = 16 + hash1(i * 3.3) * 10;
      const x = ((this.time * speed + i * 260) % (w + 240)) - 120;
      const y = h * (0.16 + 0.12 * hash1(i * 7.1)) + Math.sin(this.time * 0.7 + i * 2) * 8 + (i % 2) * 24;
      const flap = Math.sin(this.time * 7 + i * 2.3) * 4.5 * sc;
      ctx.beginPath();
      ctx.moveTo(x - 8 * sc, y - flap);
      ctx.quadraticCurveTo(x - 3 * sc, y + 1 * sc, x, y);
      ctx.quadraticCurveTo(x + 3 * sc, y + 1 * sc, x + 8 * sc, y - flap);
      ctx.stroke();
    }
    ctx.restore();
  },

  /** Cargo airships: the reason there is shipping clearance on the gorge level. */
  drawAirships(ctx) {
    const w = this.viewW, h = this.viewH;
    const sc = Math.max(0.7, this.PPM / 45);
    for (let i = 0; i < 2; i++) {
      const x = ((this.time * (7 + i * 3) + i * 520) % (w + 520)) - 260;
      const y = h * (0.1 + i * 0.1) + Math.sin(this.time * 0.3 + i) * 5;
      const s = sc * (1 - i * 0.28);
      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha = 0.92 - i * 0.2;
      // envelope
      const body = ctx.createLinearGradient(0, -18 * s, 0, 18 * s);
      body.addColorStop(0, '#f1e9d8'); body.addColorStop(0.6, '#cfc3ad'); body.addColorStop(1, '#8f866f');
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.ellipse(0, 0, 58 * s, 17 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(120,70,40,0.55)'; ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.ellipse(0, 0, 58 * s, 17 * s, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-20 * s, -16 * s); ctx.quadraticCurveTo(-24 * s, 0, -20 * s, 16 * s);
      ctx.moveTo(14 * s, -16 * s); ctx.quadraticCurveTo(18 * s, 0, 14 * s, 16 * s); ctx.stroke();
      // tail fins
      ctx.fillStyle = '#b9533a';
      ctx.beginPath(); ctx.moveTo(-50 * s, -4 * s); ctx.lineTo(-72 * s, -18 * s); ctx.lineTo(-62 * s, 0); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-50 * s, 4 * s); ctx.lineTo(-72 * s, 18 * s); ctx.lineTo(-62 * s, 0); ctx.closePath(); ctx.fill();
      // gondola and a spinning propeller
      ctx.fillStyle = '#5a4636';
      ctx.fillRect(-14 * s, 16 * s, 28 * s, 8 * s);
      ctx.fillStyle = 'rgba(255,230,160,0.9)';
      for (let k = 0; k < 4; k++) ctx.fillRect(-11 * s + k * 6.5 * s, 18 * s, 3.5 * s, 3 * s);
      ctx.strokeStyle = 'rgba(60,50,40,0.8)'; ctx.lineWidth = 2 * s;
      const a = this.time * 14 + i;
      ctx.beginPath(); ctx.moveTo(-58 * s, Math.sin(a) * 9 * s); ctx.lineTo(-58 * s, -Math.sin(a) * 9 * s); ctx.stroke();
      ctx.restore();
    }
  },

  drawFireflies(ctx) {
    const t = this.level.terrain;
    const base = this.sy(t.groundY);
    ctx.save();
    for (let i = 0; i < 16; i++) {
      const left = i % 2 === 0;
      const x = (left ? this.sx(t.leftBank) - 30 - hash1(i * 4.1) * 220 : this.sx(t.rightBank) + 30 + hash1(i * 4.1) * 220)
              + Math.sin(this.time * 0.6 + i * 3) * 18;
      const y = base - 12 - hash1(i * 6.7) * 60 + Math.sin(this.time * 0.9 + i * 2) * 10;
      const glow = Math.max(0, Math.sin(this.time * 1.7 + i * 5));
      if (x < 0 || x > this.viewW) continue;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 12);
      g.addColorStop(0, `rgba(255, 244, 150, ${0.85 * glow})`);
      g.addColorStop(1, 'rgba(255, 244, 150, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 12, y - 12, 24, 24);
    }
    ctx.restore();
  },

  /** Loose rock peeling off the crumbling far cliff, tumbling to the water. */
  drawPebbles(ctx) {
    const t = this.level.terrain;
    const sc = this.PPM / 40;
    const faceX = this.sx(t.rightBank);
    const top = this.sy(t.groundY), water = this.sy(t.waterY);
    for (let i = 0; i < 4; i++) {
      const period = 3.6 + i * 0.9;
      const phase = ((this.time + i * 1.7) % period) / period;
      const fall = phase * (water - top) * 1.1;
      if (phase > 0.9) continue;
      const g = fall * fall / (water - top);                       // accelerates
      const x = faceX + 4 * sc + hash1(i * 7.7) * 10 * sc + Math.sin(phase * 8 + i) * 2;
      const y = top + 6 * sc + Math.min(g, water - top - 4);
      ctx.fillStyle = '#5b3a2c';
      ctx.save(); ctx.translate(x, y); ctx.rotate(this.time * 5 + i);
      ctx.fillRect(-2.6 * sc, -2 * sc, 5.2 * sc, 4 * sc);
      ctx.restore();
      // a puff where it broke away
      if (phase < 0.25) {
        ctx.fillStyle = `rgba(214,170,130,${0.35 * (1 - phase / 0.25)})`;
        ctx.beginPath(); ctx.arc(faceX + 6 * sc, top + 8 * sc, (4 + phase * 40) * sc, 0, Math.PI * 2); ctx.fill();
      }
    }
  },

  drawMistBanks(ctx) {
    const th = this.worldTheme();
    const t = this.level.terrain;
    const y = this.sy(t.groundY + (t.waterY - t.groundY) * 0.45);
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const x = ((this.time * (5 + i * 2) + i * 400) % (this.viewW + 500)) - 250;
      const g = ctx.createRadialGradient(x, y + i * 26, 0, x, y + i * 26, 190);
      g.addColorStop(0, `rgba(${th.mist.rgb}, ${th.mist.a * 0.8})`);
      g.addColorStop(1, `rgba(${th.mist.rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - 190, y + i * 26 - 70, 380, 140);
    }
    ctx.restore();
  },

  drawRain(ctx) {
    const w = this.viewW, h = this.viewH;
    const calm = this.reduceMotion ? 0.4 : 1;
    ctx.save();
    ctx.strokeStyle = 'rgba(200, 220, 245, 0.34)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const n = Math.min(170, Math.round(w / 7));
    for (let i = 0; i < n; i++) {
      const speed = (520 + hash1(i * 2.9) * 260) * calm;
      const x = ((hash1(i * 3.1) * (w + 200) - this.time * 90 * calm) % (w + 200) + w + 200) % (w + 200) - 100;
      const y = (hash1(i * 7.7) * h + this.time * speed) % h;
      const len = 9 + hash1(i * 5.3) * 10;
      ctx.moveTo(x, y); ctx.lineTo(x - len * 0.18, y + len);
    }
    ctx.stroke();
    ctx.restore();

    // Drops spatter on the water
    const surfaceY = this.sy(this.level.terrain.waterY);
    ctx.strokeStyle = 'rgba(220,240,255,0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const x = hash1(i * 4.7) * w;
      const k = ((this.time * 1.6 + hash1(i * 9.1) * 3) % 1);
      ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.ellipse(x, surfaceY + 3 + hash1(i * 2.1) * 14, 2 + k * 7, 1 + k * 2, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  /** Rare and gentle: one bolt every few seconds, never a strobe, and none at all if motion is reduced. */
  drawLightning(ctx) {
    const period = 11;
    const idx = Math.floor(this.time / period);
    const ph = this.time - idx * period;
    if (ph > 0.9) return;
    if (this.lastStrike !== idx && ph < 0.3) {
      this.lastStrike = idx;
      if (audio.ctx) audio.playRumble(0.35);
    }
    const flash = ph < 0.12 ? 1 - ph / 0.12 : (ph > 0.2 && ph < 0.32 ? 0.55 * (1 - (ph - 0.2) / 0.12) : 0);
    if (flash <= 0) return;
    const w = this.viewW, h = this.viewH;
    ctx.fillStyle = `rgba(220, 232, 255, ${0.16 * flash})`;
    ctx.fillRect(0, 0, w, h);
    // the bolt
    let x = w * (0.2 + 0.6 * hash1(idx * 3.7)), y = 0;
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * flash})`;
    ctx.lineWidth = 2.4;
    ctx.shadowColor = 'rgba(190,210,255,0.9)'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (hash1(idx * 11 + k) - 0.5) * 46; y += h * 0.07;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  },

  drawDust(ctx) {
    const w = this.viewW, h = this.viewH;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 224, 180, 0.35)';
    for (let i = 0; i < 38; i++) {
      const x = ((hash1(i * 3.3) * w + this.time * (14 + hash1(i * 6.1) * 22)) % (w + 40)) - 20;
      const y = hash1(i * 8.9) * h * 0.85 + Math.sin(this.time * 0.8 + i) * 6;
      ctx.beginPath(); ctx.arc(x, y, 0.9 + hash1(i * 2.3) * 1.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },
});
