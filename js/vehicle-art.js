/**
 * TRUSSCRAFT — VEHICLE ART
 * The car, van and truck as drawn on the canvas, plus the overlays that show what the vehicle is
 * doing to the bridge: a weight tag and arrows where each wheel presses on the deck.
 * Adds its methods to TrussCraftApp (see app.js). The physics is in vehicle.js.
 */
const VEHICLE_PALETTE = {
  car:   { base: '#ef4d5b', dark: '#a52a3b', light: '#ff9aa3' },
  van:   { base: '#f7b733', dark: '#b97f18', light: '#ffe08a' },
  truck: { base: '#2f86e8', dark: '#1a559f', light: '#8cc2ff' }
};

Object.assign(TrussCraftApp.prototype, {
  drawVehicle(ctx) {
    const v = this.vehicle;
    if (!v) return;
    const sc = this.PPM / 40;
    const p = this.toScreen(v.x, v.y);
    const w = v.width * this.PPM;
    const r = v.wheelRadius * this.PPM;
    const pal = VEHICLE_PALETTE[v.type];

    // Shadow on the road, kept level with the surface rather than turning with the body
    if (v.grounded && !v.crashed) {
      const a = v.wheelCentre(0), b = v.wheelCentre(1);
      const sy = this.sy((a.y + b.y) / 2 + v.wheelRadius);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(this.sx((a.x + b.x) / 2), sy + 1, w * 0.52, r * 0.3, Math.atan2(b.y - a.y, b.x - a.x), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(v.tilt + (v.crashed ? Math.sin(this.time * 3) * 0.25 : 0));
    ctx.lineJoin = 'round';

    if (v.type === 'truck') this.drawTruckBody(ctx, v, w, r, pal, sc);
    else if (v.type === 'van') this.drawVanBody(ctx, v, w, r, pal, sc);
    else this.drawCarBody(ctx, v, w, r, pal, sc);

    // Headlight wash
    if (!v.crashed) {
      const hx = w * 0.5, hy = v.type === 'truck' ? -r * 1.15 : -r * 0.8;
      const beam = ctx.createLinearGradient(hx, 0, hx + r * 6, 0);
      beam.addColorStop(0, 'rgba(255, 246, 200, 0.34)');
      beam.addColorStop(1, 'rgba(255, 246, 200, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + r * 6, hy - r * 1.7);
      ctx.lineTo(hx + r * 6, hy + r * 1.9);
      ctx.closePath();
      ctx.fill();
    }

    // Wheels: tyre, rim, spinning spokes, hub cap; each hangs on its own spring
    const wheelXs = v.type === 'truck' ? [-w * 0.36, -w * 0.12, w * 0.36] : [-w * 0.32, w * 0.32];
    for (const wx of wheelXs) {
      const wy = v.extensionAt(wx / this.PPM) * this.PPM;
      ctx.fillStyle = '#0d1422';
      ctx.beginPath(); ctx.arc(wx, wy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2b3750'; ctx.lineWidth = Math.max(1.5, r * 0.2);
      ctx.beginPath(); ctx.arc(wx, wy, r * 0.88, 0, Math.PI * 2); ctx.stroke();

      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(v.wheelAngle);
      ctx.fillStyle = '#9aa7bd';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.58, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#4d5a73'; ctx.lineWidth = Math.max(1, r * 0.13);
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
      }
      ctx.stroke();
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath(); ctx.arc(0, 0, Math.max(1.2, r * 0.17), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    this.drawWeightTag(ctx, v, p, r, sc);
  },

  /** Rounded hatchback: low body, glass cabin, wheel arches, lamps. */
  drawCarBody(ctx, v, w, r, pal, sc) {
    const crashed = v.crashed;
    const top = -r * 1.4, bottom = r * 0.55;
    const paint = ctx.createLinearGradient(0, top - r, 0, bottom);
    paint.addColorStop(0, crashed ? '#b3555c' : pal.light);
    paint.addColorStop(0.22, crashed ? '#a33a44' : pal.base);
    paint.addColorStop(1, crashed ? '#6b2530' : pal.dark);

    // cabin first so the body overlaps its base
    ctx.fillStyle = paint;
    ctx.strokeStyle = 'rgba(8, 14, 28, 0.85)'; ctx.lineWidth = Math.max(1.4, 1.8 * sc);
    ctx.beginPath();
    ctx.moveTo(-w * 0.34, top + 2);
    ctx.quadraticCurveTo(-w * 0.31, top - r * 1.15, -w * 0.15, top - r * 1.15);
    ctx.lineTo(w * 0.1, top - r * 1.15);
    ctx.quadraticCurveTo(w * 0.27, top - r * 1.08, w * 0.37, top + 2);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // glass
    const glass = ctx.createLinearGradient(0, top - r, 0, top);
    glass.addColorStop(0, '#d8f1ff'); glass.addColorStop(1, '#7fb6dc');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.moveTo(-w * 0.27, top - r * 0.08); ctx.lineTo(-w * 0.21, top - r * 0.95); ctx.lineTo(-w * 0.02, top - r * 0.95); ctx.lineTo(-w * 0.02, top - r * 0.08);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.03, top - r * 0.08); ctx.lineTo(w * 0.03, top - r * 0.95); ctx.lineTo(w * 0.1, top - r * 0.95); ctx.lineTo(w * 0.29, top - r * 0.08);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1, 1.3 * sc);
    ctx.beginPath(); ctx.moveTo(-w * 0.19, top - r * 0.8); ctx.lineTo(-w * 0.1, top - r * 0.8); ctx.moveTo(w * 0.05, top - r * 0.75); ctx.lineTo(w * 0.09, top - r * 0.8); ctx.stroke();

    // body
    ctx.fillStyle = paint;
    ctx.strokeStyle = 'rgba(8, 14, 28, 0.85)'; ctx.lineWidth = Math.max(1.4, 1.8 * sc);
    ctx.beginPath(); ctx.roundRect(-w * 0.5, top, w, bottom - top, r * 0.6); ctx.fill(); ctx.stroke();
    // wheel arches
    ctx.fillStyle = '#0a101c';
    for (const wx of [-w * 0.32, w * 0.32]) { ctx.beginPath(); ctx.arc(wx, r * 0.1, r * 1.22, Math.PI, 0); ctx.fill(); }
    // shut lines, handle, sill and bumpers
    ctx.strokeStyle = 'rgba(8,14,28,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-w * 0.02, top + 2); ctx.lineTo(-w * 0.02, bottom - r * 0.45); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(-w * 0.07, top + r * 0.45, r * 0.5, r * 0.14);
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(-w * 0.46, top + 3, w * 0.92, r * 0.18);
    ctx.fillStyle = '#1b2436';
    ctx.fillRect(w * 0.44, bottom - r * 0.7, w * 0.08, r * 0.5); ctx.fillRect(-w * 0.52, bottom - r * 0.7, w * 0.08, r * 0.5);
    // lamps
    this.vehicleLamp(ctx, w * 0.47, top + r * 0.5, r, crashed ? '#7a4f3a' : '#fff6c8', crashed ? null : 'rgba(255,240,170,0.9)');
    this.vehicleLamp(ctx, -w * 0.485, top + r * 0.5, r, crashed ? '#5a2024' : '#ff4455', crashed ? null : 'rgba(255,60,70,0.7)');
  },

  /** A tall delivery van: big box, front glass, roof rack. */
  drawVanBody(ctx, v, w, r, pal, sc) {
    const crashed = v.crashed;
    const top = -r * 3.2, bottom = r * 0.55;
    const paint = ctx.createLinearGradient(0, top, 0, bottom);
    paint.addColorStop(0, crashed ? '#b3555c' : pal.light);
    paint.addColorStop(0.18, crashed ? '#a33a44' : pal.base);
    paint.addColorStop(1, crashed ? '#6b2530' : pal.dark);
    ctx.fillStyle = paint;
    ctx.strokeStyle = 'rgba(8, 14, 28, 0.85)'; ctx.lineWidth = Math.max(1.4, 1.8 * sc);
    ctx.beginPath();
    ctx.moveTo(-w * 0.5 + r * 0.5, top);
    ctx.lineTo(w * 0.22, top);
    ctx.quadraticCurveTo(w * 0.4, top + r * 0.2, w * 0.5, top + r * 1.5);
    ctx.lineTo(w * 0.5, bottom - r * 0.6);
    ctx.quadraticCurveTo(w * 0.5, bottom, w * 0.5 - r * 0.6, bottom);
    ctx.lineTo(-w * 0.5 + r * 0.6, bottom);
    ctx.quadraticCurveTo(-w * 0.5, bottom, -w * 0.5, bottom - r * 0.6);
    ctx.lineTo(-w * 0.5, top + r * 0.5);
    ctx.quadraticCurveTo(-w * 0.5, top, -w * 0.5 + r * 0.5, top);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // front glass
    const glass = ctx.createLinearGradient(0, top, 0, top + r * 1.6);
    glass.addColorStop(0, '#d8f1ff'); glass.addColorStop(1, '#7fb6dc');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.moveTo(w * 0.27, top + r * 0.3); ctx.quadraticCurveTo(w * 0.38, top + r * 0.45, w * 0.46, top + r * 1.4);
    ctx.lineTo(w * 0.27, top + r * 1.4); ctx.closePath(); ctx.fill();
    // side window, sliding door and the van's stripe
    ctx.fillStyle = '#9ccbea'; ctx.beginPath(); ctx.roundRect(w * 0.02, top + r * 0.35, w * 0.2, r * 1.05, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(8,14,28,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.rect(-w * 0.3, top + r * 0.35, w * 0.28, bottom - top - r * 0.95); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-w * 0.49, top + r * 1.75, w * 0.98, r * 0.28);
    // roof rack
    ctx.strokeStyle = '#2a3347'; ctx.lineWidth = Math.max(1.4, 1.7 * sc);
    ctx.beginPath(); ctx.moveTo(-w * 0.3, top - r * 0.12); ctx.lineTo(w * 0.15, top - r * 0.12);
    ctx.moveTo(-w * 0.24, top - r * 0.12); ctx.lineTo(-w * 0.24, top); ctx.moveTo(w * 0.09, top - r * 0.12); ctx.lineTo(w * 0.09, top); ctx.stroke();
    // arches, bumpers, lamps
    ctx.fillStyle = '#0a101c';
    for (const wx of [-w * 0.32, w * 0.32]) { ctx.beginPath(); ctx.arc(wx, r * 0.1, r * 1.22, Math.PI, 0); ctx.fill(); }
    ctx.fillStyle = '#1b2436';
    ctx.fillRect(w * 0.44, bottom - r * 0.7, w * 0.08, r * 0.5); ctx.fillRect(-w * 0.52, bottom - r * 0.7, w * 0.08, r * 0.5);
    this.vehicleLamp(ctx, w * 0.485, top + r * 2.3, r, crashed ? '#7a4f3a' : '#fff6c8', crashed ? null : 'rgba(255,240,170,0.9)');
    this.vehicleLamp(ctx, -w * 0.49, top + r * 2.3, r, crashed ? '#5a2024' : '#ff4455', crashed ? null : 'rgba(255,60,70,0.7)');
  },

  /** A box truck: white freight container with the TrussCraft mark, blue cab, exhaust stack. */
  drawTruckBody(ctx, v, w, r, pal, sc) {
    const crashed = v.crashed;
    const bottom = r * 0.6;
    const boxW = w * 0.64, boxTop = -r * 4.1;
    const left = -w * 0.5;
    ctx.strokeStyle = 'rgba(8, 14, 28, 0.85)'; ctx.lineWidth = Math.max(1.4, 1.8 * sc);

    // container
    const box = ctx.createLinearGradient(0, boxTop, 0, bottom);
    box.addColorStop(0, crashed ? '#d9a3a3' : '#ffffff'); box.addColorStop(1, crashed ? '#b07a7a' : '#c5cfdd');
    ctx.fillStyle = box;
    ctx.beginPath(); ctx.roundRect(left, boxTop, boxW, bottom - boxTop - r * 0.15, r * 0.35); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(100,116,139,0.45)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = left + r * 0.6; x < left + boxW - r * 0.3; x += r * 0.55) { ctx.moveTo(x, boxTop + r * 0.35); ctx.lineTo(x, bottom - r * 0.45); }
    ctx.stroke();
    // blue stripe and the mark: a little triangulated truss
    ctx.fillStyle = crashed ? '#7a3a44' : pal.base;
    ctx.fillRect(left + 1, bottom - r * 1.3, boxW - 2, r * 0.5);
    const mx = left + boxW * 0.5, my = boxTop + (bottom - boxTop) * 0.4, ms = r * 0.9;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(mx, my, ms * 1.25, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = crashed ? '#7a3a44' : pal.base; ctx.lineWidth = Math.max(1.6, 2 * sc);
    ctx.beginPath();
    ctx.moveTo(mx - ms, my + ms * 0.6); ctx.lineTo(mx, my - ms * 0.8); ctx.lineTo(mx + ms, my + ms * 0.6); ctx.closePath();
    ctx.moveTo(mx - ms * 0.5, my - 0.1 * ms); ctx.lineTo(mx + ms * 0.5, my - 0.1 * ms); ctx.moveTo(mx, my - ms * 0.8); ctx.lineTo(mx, my + ms * 0.6);
    ctx.stroke();

    // cab
    const cabX = left + boxW + r * 0.12, cabTop = -r * 2.85, cabW = w * 0.5 - (cabX - 0) ;
    const cab = ctx.createLinearGradient(0, cabTop, 0, bottom);
    cab.addColorStop(0, crashed ? '#b3555c' : pal.light); cab.addColorStop(0.25, crashed ? '#a33a44' : pal.base); cab.addColorStop(1, crashed ? '#6b2530' : pal.dark);
    ctx.fillStyle = cab; ctx.strokeStyle = 'rgba(8, 14, 28, 0.85)'; ctx.lineWidth = Math.max(1.4, 1.8 * sc);
    ctx.beginPath();
    ctx.moveTo(cabX, cabTop + r * 0.2);
    ctx.lineTo(cabX + cabW * 0.62, cabTop);
    ctx.quadraticCurveTo(cabX + cabW * 0.9, cabTop + r * 0.1, w * 0.5, -r * 1.2);
    ctx.lineTo(w * 0.5, bottom - r * 0.4); ctx.lineTo(cabX, bottom - r * 0.4);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    const glass = ctx.createLinearGradient(0, cabTop, 0, cabTop + r * 1.7);
    glass.addColorStop(0, '#d8f1ff'); glass.addColorStop(1, '#7fb6dc');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.moveTo(cabX + cabW * 0.18, cabTop + r * 0.35); ctx.lineTo(cabX + cabW * 0.6, cabTop + r * 0.2);
    ctx.quadraticCurveTo(cabX + cabW * 0.82, cabTop + r * 0.3, w * 0.5 - r * 0.15, -r * 1.35);
    ctx.lineTo(cabX + cabW * 0.18, -r * 1.35); ctx.closePath(); ctx.fill();
    // exhaust stack behind the cab
    ctx.fillStyle = '#9aa7bd'; ctx.fillRect(cabX - r * 0.3, cabTop - r * 0.9, r * 0.32, r * 1.6);
    ctx.fillStyle = '#4d5a73'; ctx.fillRect(cabX - r * 0.36, cabTop - r * 0.95, r * 0.44, r * 0.2);
    // arches, bumper, lamps, mud flap
    ctx.fillStyle = '#0a101c';
    for (const wx of [-w * 0.36, -w * 0.12, w * 0.36]) { ctx.beginPath(); ctx.arc(wx, r * 0.15, r * 1.2, Math.PI, 0); ctx.fill(); }
    ctx.fillStyle = '#1b2436'; ctx.fillRect(w * 0.45, bottom - r * 0.75, w * 0.07, r * 0.5);
    this.vehicleLamp(ctx, w * 0.49, -r * 0.75, r, crashed ? '#7a4f3a' : '#fff6c8', crashed ? null : 'rgba(255,240,170,0.9)');
    this.vehicleLamp(ctx, left + 1, -r * 0.4, r, crashed ? '#5a2024' : '#ff4455', crashed ? null : 'rgba(255,60,70,0.7)');
  },

  vehicleLamp(ctx, x, y, r, color, glow) {
    ctx.save();
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = r * 1.1; }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.2, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  /** What the vehicle weighs, in a tag that rides above it: the load the student is designing for. */
  drawWeightTag(ctx, v, p, r, sc) {
    if (this.mode !== 'test' || v.crashed || v.escaped) return;
    const label = `${(v.mass / 1000).toFixed(1)} t`;
    const y = p.y - r * (v.type === 'truck' ? 6.2 : v.type === 'van' ? 5.1 : 4.1);
    ctx.save();
    ctx.font = `700 ${Math.max(10, 11 * sc)}px ui-monospace, Menlo, monospace`;
    const tw = ctx.measureText(label).width + 22 * sc;
    ctx.fillStyle = 'rgba(8, 14, 28, 0.82)';
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(p.x - tw / 2, y - 10 * sc, tw, 20 * sc, 10 * sc); ctx.fill(); ctx.stroke();
    // a little weight: a trapezoid
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(p.x - tw / 2 + 6 * sc, y + 4 * sc); ctx.lineTo(p.x - tw / 2 + 8.5 * sc, y - 3 * sc);
    ctx.lineTo(p.x - tw / 2 + 13.5 * sc, y - 3 * sc); ctx.lineTo(p.x - tw / 2 + 16 * sc, y + 4 * sc);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fde68a'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x - tw / 2 + 19 * sc, y + 0.5);
    ctx.restore();
  },

  /**
   * An arrow into the deck under each wheel, as long as the force that wheel is putting in.
   * This is the load the bridge has to carry, drawn where it is applied.
   */
  drawLoadArrows(ctx) {
    const v = this.vehicle;
    if (!v || v.crashed || this.mode !== 'test') return;
    const sc = this.PPM / 40;
    ctx.save();
    for (let i = 0; i < 2; i++) {
      const w = v.wheels[i];
      if (!w.contact || w.load < 1) continue;
      const c = v.wheelCentre(i);
      const x = this.sx(c.x), y = this.sy(c.y + v.wheelRadius) + 5 * sc;
      const f = clamp(w.load / v.weightShare, 0.2, 1.4);
      const len = (16 + 26 * f) * sc;
      const g = ctx.createLinearGradient(0, y, 0, y + len);
      g.addColorStop(0, '#fde68a'); g.addColorStop(1, '#f97316');
      ctx.strokeStyle = 'rgba(8,14,28,0.7)'; ctx.lineWidth = 6.5 * sc; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len - 5 * sc); ctx.stroke();
      ctx.strokeStyle = g; ctx.lineWidth = 3.5 * sc;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len - 5 * sc); ctx.stroke();
      ctx.fillStyle = '#f97316'; ctx.strokeStyle = 'rgba(8,14,28,0.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - 6 * sc, y + len - 8 * sc); ctx.lineTo(x + 6 * sc, y + len - 8 * sc); ctx.lineTo(x, y + len + 1 * sc); ctx.closePath();
      ctx.stroke(); ctx.fill();
      if (this.PPM >= 26) {
        const label = `${(w.load / 1000).toFixed(1)} kN`;
        ctx.font = `600 ${Math.max(9, 10 * sc)}px ui-monospace, Menlo, monospace`;
        const tw = ctx.measureText(label).width + 10;
        ctx.fillStyle = 'rgba(8,14,28,0.85)';
        ctx.beginPath(); ctx.roundRect(x + 9 * sc, y + len * 0.5 - 8, tw, 16, 4); ctx.fill();
        ctx.fillStyle = '#fed7aa'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, x + 14 * sc, y + len * 0.5 + 0.5);
      }
    }
    ctx.restore();
  },
});
