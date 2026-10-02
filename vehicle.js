/**
 * TRUSSCRAFT — VEHICLE MODEL
 *
 * A rigid body on two spring-and-damper wheels, driven by a cruise controller.
 * Pure physics: no DOM, no canvas, so it can be unit-tested in Node.
 *
 * Coordinates match the game: metres, x to the right, y DOWN. Angles are
 * clockwise on screen, so a positive tilt dips the nose.
 *
 * What it models, and what that buys the player:
 *  - Suspension: wheels ride bumps and settle after a landing instead of snapping to the deck.
 *  - Momentum: speed is kept in the air, lost climbing a sagging deck and gained descending it.
 *  - Pitch from real torque: lose the front wheels' support and the nose dips, then it tumbles.
 *  - Solid ground: cliff faces and the mid-river rock stack stop a falling vehicle.
 *  - Honest loading: the force each wheel puts into the deck is the force its spring is
 *    actually carrying, so a bounce or a landing loads the structure harder than a steady roll.
 */

const GRAVITY = 9.81;            // m/s²

const VEHICLE_CRUISE_SPEED = 2.2; // m/s the driver tries to hold

/**
 * Body and drivetrain per class. `wheelX` is half the wheelbase as a share of body width.
 * `accel` is the most the engine can add, in m/s²: it sets the steepest hill the vehicle can
 * climb at all (about asin(accel / g)) — roughly 38° for the car, 27° for the loaded truck,
 * so a humped deck is driveable and only a broken ramp stops it.
 */
const VEHICLE_TYPES = {
  car:   { width: 1.7, wheelRadius: 0.28, wheelX: 0.32, accel: 6.0 },
  van:   { width: 2.0, wheelRadius: 0.28, wheelX: 0.32, accel: 5.5 },
  truck: { width: 2.4, wheelRadius: 0.34, wheelX: 0.34, accel: 4.5 }
};

const SUSPENSION = {
  extension: 0.15,          // m the wheel centre hangs below the hub at full droop
  staticCompression: 0.10,  // m the spring sags under the vehicle's own weight
  travel: 0.22,             // m of compression before the bump stop
  bottomOut: 0.32,          // m of compression at which the axle hits the chassis: a hard stop
  dampingRatio: 0.7,        // of critical: settles in about one bounce
  stopStiffness: 25,        // bump stop, as a multiple of the spring rate
  maxLoadFactor: 4,         // cap on a wheel's force, in multiples of its static share
  maxRate: 3,               // m/s cap on the compression rate fed to the damper (stops spikes at steps)
  surfaceFilter: 0.03       // s: a tyre and a stiff damper cannot follow millimetre jitter in a light deck
};

const DRIVE = {
  gain: 6,                  // 1/s: how hard the throttle chases the target speed
  brake: 4,                 // m/s² of braking available
  grip: 1.0                 // tyre friction coefficient
};

const BODY_HEIGHT = 0.8;     // m, for the moment of inertia
const INERTIA_SCALE = 1.4;   // real vehicles carry their mass at the ends, so they resist pitch more than a plain box
const ANGULAR_DRAG = 0.6;    // 1/s, so a tumbling vehicle does not spin forever
const BOUNCE = 0.1;          // share of speed returned when the suspension bottoms out
const WALL_BOUNCE = 0.15;    // share of speed returned off a cliff face

/** Road surface edges are forgiving by this much so a wheel does not fall between joined members. */
const SURFACE_EDGE_TOL = 0.08;
/** Two surfaces this close in height count as level; the deck wins so its load is felt. */
const SURFACE_TIE = 0.02;

const vclamp = (v, a, b) => Math.max(a, Math.min(b, v));

function vehicleTypeFor(mass) {
  return mass > 3000 ? 'truck' : mass > 1800 ? 'van' : 'car';
}

/**
 * Highest drivable surface at x that is no higher than `minY`.
 * Returns { y, phi, member, t } — `phi` is the surface angle (clockwise, radians),
 * `member`/`t` identify the deck member and the fraction along it — or null.
 */
function surfaceBelow(x, minY, members, terrain) {
  let best = null;

  for (const m of members) {
    if (m.broken || m.mat !== 'road') continue;
    const dx = m.n2.x - m.n1.x;
    if (Math.abs(dx) < 0.1) continue;                         // a near-vertical member is not a road
    if (x < Math.min(m.n1.x, m.n2.x) - SURFACE_EDGE_TOL ||
        x > Math.max(m.n1.x, m.n2.x) + SURFACE_EDGE_TOL) continue;
    const t = vclamp((x - m.n1.x) / dx, 0, 1);
    const dy = m.n2.y - m.n1.y;
    const y = m.n1.y + t * dy;
    if (y < minY) continue;
    if (!best || y < best.y) best = { y, phi: Math.atan2(dy, dx), member: m, t };
  }

  if (x <= terrain.leftBank || x >= terrain.rightBank) {
    if (!best || terrain.groundY < best.y - SURFACE_TIE) {
      if (terrain.groundY >= minY) best = { y: terrain.groundY, phi: 0, member: null, t: 0 };
    }
  }

  // The rock stack only holds a vehicle that has no deck over it, so it never steals deck load.
  const pier = terrain.pier;
  if (!best && pier && Math.abs(x - pier.x) <= pier.width / 2 && pier.topY >= minY) {
    best = { y: pier.topY, phi: 0, member: null, t: 0 };
  }
  return best;
}

class Vehicle {
  constructor(mass, terrain, gravity = GRAVITY) {
    const spec = VEHICLE_TYPES[vehicleTypeFor(mass)];
    this.type = vehicleTypeFor(mass);
    this.mass = mass;
    this.g = gravity;
    this.width = spec.width;
    this.wheelRadius = spec.wheelRadius;
    this.halfBase = spec.wheelX * spec.width;
    this.accel = spec.accel;
    this.cruise = VEHICLE_CRUISE_SPEED;

    // Spring rate gives the same sag (and the same ride frequency) whatever the mass.
    const share = mass / 2;                                   // each wheel carries half
    this.reach = this.wheelRadius + SUSPENSION.extension;     // hub to the tyre at full droop
    this.k = (share * gravity) / SUSPENSION.staticCompression;
    this.kStop = this.k * SUSPENSION.stopStiffness;
    this.damping = 2 * SUSPENSION.dampingRatio * Math.sqrt(this.k * share);
    this.maxLoad = share * gravity * SUSPENSION.maxLoadFactor;
    this.weightShare = share * gravity;     // static load on one wheel, N
    this.inertia = INERTIA_SCALE * mass * (this.width * this.width + BODY_HEIGHT * BODY_HEIGHT) / 12;

    // Start on the near bank, already at cruising speed, resting on its springs.
    this.startX = terrain.leftBank - 1.6;
    this.x = this.startX;
    this.y = terrain.groundY - this.reach + SUSPENSION.staticCompression;
    this.vx = this.cruise;
    this.vy = 0;
    this.tilt = 0;
    this.omega = 0;
    this.spin = this.cruise / this.wheelRadius;
    this.wheelAngle = 0;

    const rest = SUSPENSION.extension - SUSPENSION.staticCompression;
    this.wheels = [0, 1].map(() => ({ surfY: terrain.groundY, contact: true, c: SUSPENSION.staticCompression, load: share * gravity, ext: rest }));
    this.contacts = [];        // this step's { member, t, load } on deck members, for the solver
    this.grounded = true;
    this.landing = 0;          // approach speed of the latest touchdown, cleared by the caller

    this.crashed = false;
    this.escaped = false;
    this.splashed = false;
    this.exhaustTimer = 0;
  }

  /** Advance by `dt` seconds against the current structure and terrain. */
  step(dt, members, terrain) {
    const M = this.mass;
    const cs = Math.cos(this.tilt), sn = Math.sin(this.tilt);
    let fx = 0, fy = M * this.g, torque = 0;
    const wasGrounded = this.grounded;
    const approach = this.vy;
    const hits = [];
    this.contacts.length = 0;

    for (let i = 0; i < 2; i++) {
      const w = this.wheels[i];
      const lx = i === 0 ? -this.halfBase : this.halfBase;
      const hx = this.x + lx * cs, hy = this.y + lx * sn;

      // The tyre is wide: sample either side of the hub so it rolls over small gaps.
      let surf = null;
      for (const off of [0, -0.5 * this.wheelRadius, 0.5 * this.wheelRadius]) {
        const s = surfaceBelow(hx + off, hy - 0.15, members, terrain);
        if (s && (!surf || s.y < surf.y)) surf = s;
      }
      if (surf) {
        // Smooth the surface the wheel sees. Deck joints in a position-based solver jitter by a
        // millimetre or so per step, and a stiff damper would turn that into violent wheel hop.
        w.surfY = w.contact ? w.surfY + (surf.y - w.surfY) * Math.min(1, dt / SUSPENSION.surfaceFilter) : surf.y;
        surf.y = w.surfY;
      }
      const cv = surf ? hy + this.reach - surf.y : 0;          // vertical compression
      if (!surf || cv <= 0) { w.contact = false; w.c = 0; w.load = 0; continue; }

      const cosP = Math.cos(surf.phi), sinP = Math.sin(surf.phi);
      const cn = cv * cosP;                                    // compression along the surface normal
      const rate = w.contact ? vclamp((cn - w.c) / dt, -SUSPENSION.maxRate, SUSPENSION.maxRate) : 0;

      let F = this.k * Math.min(cn, SUSPENSION.travel)
            + this.kStop * Math.max(0, cn - SUSPENSION.travel)
            + this.damping * rate;
      F = vclamp(F, 0, this.maxLoad);                          // a spring can push, never pull
      w.contact = true; w.c = cn; w.load = F;

      // Force acts along the surface normal; its lever arm about the centre of mass makes pitch.
      const Fx = F * sinP, Fy = -F * cosP;
      const rx = hx - this.x, ry = surf.y - this.y;
      fx += Fx; fy += Fy; torque += rx * Fy - ry * Fx;
      hits.push({ w, lx, rx, ry, cosP, sinP, surfY: surf.y });
      // The deck is only ever asked to carry the weight resting on the wheel, never the spike
      // from a bounce: the solver's joints are soft and chase a spring's force into oscillation.
      this.contacts.push({ member: surf.member, t: surf.t, load: Math.min(F, this.weightShare) * cosP });
    }

    // --- Drive: a driver holding a set speed, limited by engine power and tyre grip ---
    const sumLoad = hits.reduce((s, h) => s + h.w.load, 0);
    this.grounded = sumLoad > 0;
    let groundSpeed = this.spin * this.wheelRadius;
    if (this.grounded) {
      const phi = Math.atan2(hits.reduce((s, h) => s + h.w.load * h.sinP, 0),
                             hits.reduce((s, h) => s + h.w.load * h.cosP, 0));
      const tx = Math.cos(phi), ty = Math.sin(phi);
      groundSpeed = this.vx * tx + this.vy * ty;
      const want = vclamp(DRIVE.gain * (this.cruise - groundSpeed), -DRIVE.brake, this.accel);
      const drive = vclamp(M * want, -DRIVE.grip * sumLoad, DRIVE.grip * sumLoad);
      for (const h of hits) {
        const share = h.w.load / sumLoad;
        const dx = drive * share * h.cosP, dy = drive * share * h.sinP;
        fx += dx; fy += dy; torque += h.rx * dy - h.ry * dx;
      }
    }

    // --- Integrate (semi-implicit Euler) ---
    this.vx += (fx / M) * dt;
    this.vy += (fy / M) * dt;
    this.omega += (torque / this.inertia) * dt;
    this.omega *= 1 - ANGULAR_DRAG * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.tilt += this.omega * dt;

    // Wheels follow the ground when driven and coast, slowly losing speed, in the air.
    this.spin = this.grounded ? groundSpeed / this.wheelRadius : this.spin * (1 - 0.3 * dt);
    this.wheelAngle += this.spin * dt;

    if (this.grounded && !wasGrounded) this.landing = Math.max(this.landing, approach);

    this.bottomOut(hits);
    this.collideWithTerrain(terrain);
    this.settleWheels(dt);
  }

  /**
   * A hard landing can out-run the capped spring and bump stop. The axle then meets the
   * chassis and the surface is simply solid: lift the vehicle clear and kill the impact.
   */
  bottomOut(hits) {
    let lift = 0;
    for (const h of hits) {
      const hubY = this.y + h.lx * Math.sin(this.tilt);
      lift = Math.max(lift, (hubY + this.reach - h.surfY) * h.cosP - SUSPENSION.bottomOut);
    }
    if (lift <= 0) return;
    this.y -= lift;
    if (this.vy > 0) this.vy *= -BOUNCE;
    this.omega *= 0.5;
  }

  /** Where each wheel centre is, for walls and drawing. */
  wheelCentre(i) {
    const lx = i === 0 ? -this.halfBase : this.halfBase;
    return {
      x: this.x + lx * Math.cos(this.tilt),
      y: this.y + lx * Math.sin(this.tilt) + this.wheels[i].ext
    };
  }

  /** Cliff faces and the rock stack: solid sides a falling vehicle cannot pass through. */
  collideWithTerrain(terrain) {
    const r = this.wheelRadius, below = terrain.groundY + 0.02;
    const pier = terrain.pier;
    for (let i = 0; i < 2; i++) {
      const c = this.wheelCentre(i);

      if (c.y > below && c.x < terrain.leftBank + r) {
        this.x += terrain.leftBank + r - c.x;
        if (this.vx < 0) this.vx = -this.vx * WALL_BOUNCE;
      } else if (c.y > below && c.x > terrain.rightBank - r) {
        this.x -= c.x - (terrain.rightBank - r);
        if (this.vx > 0) this.vx = -this.vx * WALL_BOUNCE;
      }

      if (pier && c.y > pier.topY + 0.02) {
        // The stack widens as it descends, matching how it is drawn.
        const depth = vclamp((c.y - pier.topY) / 6, 0, 1);
        const half = (pier.width / 2) * (1 + 0.9 * depth) + r;
        const off = c.x - pier.x;
        if (Math.abs(off) < half) {
          const dir = off < 0 ? -1 : 1;
          this.x += dir * (half - Math.abs(off));
          if (this.vx * dir < 0) this.vx = -this.vx * WALL_BOUNCE;
        }
      }
    }
  }

  /** Ease each drawn wheel toward where its suspension says it is. */
  settleWheels(dt) {
    for (const w of this.wheels) {
      const target = w.contact ? SUSPENSION.extension - Math.min(w.c, SUSPENSION.travel) : SUSPENSION.extension;
      w.ext += (target - w.ext) * Math.min(1, dt * 30);
    }
  }

  /** Suspension extension at a body-local x offset, for drawing wheels that are not the two axles. */
  extensionAt(localX) {
    const f = vclamp(localX / (2 * this.halfBase) + 0.5, -0.25, 1.25);
    return this.wheels[0].ext + (this.wheels[1].ext - this.wheels[0].ext) * f;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Vehicle, surfaceBelow, vehicleTypeFor, VEHICLE_TYPES, SUSPENSION, GRAVITY };
}
