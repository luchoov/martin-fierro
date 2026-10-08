import { PX, groundRadii, iso } from '../core/iso';
import { TAU, plateau, type Vec2 } from '../core/math';
import type { Drawer } from '../draw/drawer';
import { ellipsePts, type Pts } from '../draw/hand';
import { Ink, KEY } from '../print/ink';
import { Mode } from '../print/separation';
import { Actor } from '../world/actor';
import type { World } from '../world/world';

const SHADOW = Ink.of(0, 0, 0.1, 0.3);

/** Gallina: picotea, camina y sale disparando si la tocan. */
export class Chicken extends Actor {
  constructor(name: string, seed: number, readonly feathers: Ink, readonly comb = Ink.of(0.9, 0.2, 0, 0.05)) {
    super(name, seed);
    this.radius = 0.12;
    this.idleClip = 'peck';
    this.clip = 'peck';
  }

  record(d: Drawer, w: World): void {
    d.begin(this.seed, w.variant, w.zoom);
    if (this.visible) this.draw(d, w);
    this.keep(d);
  }

  private draw(d: Drawer, w: World): void {
    const [ox, oy] = iso(this.x, this.y, this.z);
    const f = this.face;
    const K = PX;
    const t = w.t + this.phase * 10;
    const ol = Math.max(0.7, 0.9 / w.zoom);
    d.amp = 0.3;
    d.step = 4;
    const T = (pts: Pts): Pts => pts.map((v, i) => (i % 2 ? oy - v * K : ox + f * v * K));
    const moving = this.clip === 'walk' || this.clip === 'run';
    const run = this.clip === 'run';
    const peck = this.clip === 'peck' ? plateau((t * 0.6) % 1, 0.1, 0.18, 0.28, 0.36) + plateau((t * 0.6) % 1, 0.5, 0.55, 0.6, 0.66) : 0;
    const step = moving ? Math.sin(t * (run ? 22 : 11)) : 0;
    const bob = moving ? Math.abs(step) * 0.015 : 0;
    const [rx, ry] = groundRadii(0.12);
    d.fill(ellipsePts(ox, oy, rx, ry, 10), SHADOW, { mode: Mode.Over, amp: 0.2 });
    // Patas
    const legInk = Ink.of(0.2, 0.8, 0, 0.15);
    d.stroke(T([0.01, 0.16 + bob, 0.01 + step * 0.04, 0.0]), 0.9, 0.7, legInk, { taper0: 0, taper1: 0 });
    d.stroke(T([-0.03, 0.16 + bob, -0.03 - step * 0.04, 0.0]), 0.9, 0.7, legInk.shade(0.2), { taper0: 0, taper1: 0 });
    // Cola y cuerpo
    const lean = run ? 0.25 : peck * 0.5;
    const by = 0.23 + bob - peck * 0.03;
    d.fill(T([-0.1, by + 0.02, -0.2, by + 0.17 - lean * 0.2, -0.15, by + 0.03, -0.12, by - 0.03]), this.feathers.shade(0.15), { outline: ol });
    d.fill(T(ellipsePts(0, by, 0.15, 0.095, 14, -lean * 0.6)), this.feathers, { outline: ol });
    if (run) {
      const flap = Math.sin(t * 30) * 0.08;
      d.fill(T([-0.04, by + 0.03, 0.08, by + 0.05, -0.02, by + 0.15 + flap]), this.feathers.shade(0.1), { outline: ol });
    } else {
      d.stroke(T([-0.06, by + 0.02, 0.05, by + 0.0, 0.08, by - 0.03]), 0.6, 0.3, this.feathers.shade(0.4));
    }
    // Cabeza
    const hx = 0.12 + peck * 0.06 + (run ? 0.05 : 0);
    const hy = 0.36 + bob - peck * 0.3 - (run ? 0.06 : 0);
    d.fill(T([0.08, by + 0.04, hx + 0.02, hy, hx - 0.04, hy - 0.02, 0.05, by]), this.feathers, { outline: ol });
    d.fill(T(ellipsePts(hx, hy, 0.042, 0.045, 8)), this.feathers, { outline: ol });
    d.fill(T([hx - 0.02, hy + 0.035, hx + 0.0, hy + 0.07, hx + 0.02, hy + 0.05, hx + 0.035, hy + 0.06, hx + 0.03, hy + 0.03]), this.comb, { outline: ol * 0.7 });
    d.fill(T([hx + 0.035, hy + 0.01, hx + 0.08, hy - 0.005, hx + 0.035, hy - 0.015]), Ink.of(0.2, 0.75, 0, 0.1), { outline: ol * 0.6 });
    if (w.zoom > 2.2) {
      const [ex, ey] = T([hx + 0.012, hy + 0.012]);
      d.dot(ex, ey, Math.max(0.5, 0.008 * K), KEY);
    }
  }
}

/**
 * Carancho posado en un poste: gira la cabeza y de vez en cuando levanta vuelo
 * en una vuelta larga sobre la escena.
 */
export class Carancho extends Actor {
  perch: [number, number, number];
  flying = 0;
  private ang = 0;
  private center: Vec2 = [0, 0];
  private flapT = 0;

  constructor(name: string, seed: number, perch: [number, number, number]) {
    super(name, seed);
    this.perch = perch;
    this.radius = 0.15;
    this.place(perch[0], perch[1]);
    this.z = perch[2];
    this.idleClip = 'perch';
    this.clip = 'perch';
  }

  /** Despega, da una vuelta y vuelve al poste. */
  takeOff(): void {
    if (this.flying) return;
    this.flying = 1;
    this.center = [this.perch[0] - 2, this.perch[1] + 2];
    this.ang = Math.atan2(this.perch[1] - this.center[1], this.perch[0] - this.center[0]);
    this.flapT = 0;
  }

  update(dt: number, w: World): void {
    super.update(dt, w);
    if (this.flying) {
      this.flapT += dt;
      const r = Math.hypot(this.perch[0] - this.center[0], this.perch[1] - this.center[1]);
      const prevX = this.x;
      const prevY = this.y;
      this.ang += dt * 0.55;
      const lap = this.flapT * 0.55;
      this.x = this.center[0] + Math.cos(this.ang) * r * (1 + Math.sin(lap) * 0.6);
      this.y = this.center[1] + Math.sin(this.ang) * r * (1 + Math.sin(lap) * 0.6);
      this.z = this.perch[2] + Math.sin(Math.min(Math.PI, lap / 2)) * 4.5;
      this.lookAt(this.x + (this.x - prevX) * 10, this.y + (this.y - prevY) * 10);
      if (lap >= TAU) {
        this.flying = 0;
        this.place(this.perch[0], this.perch[1]);
        this.z = this.perch[2];
      }
      // Volando va siempre delante de todo.
      this.fx0 = this.fy0 = 900;
      this.fx1 = this.fy1 = 901;
      this.z0 = 99;
    } else {
      this.z0 = this.perch[2];
      if (this.rng.next() < dt * 0.12) this.face = -this.face;
    }
  }

  record(d: Drawer, w: World): void {
    d.begin(this.seed, w.variant, w.zoom);
    if (this.visible) this.draw(d, w);
    this.keep(d);
  }

  private draw(d: Drawer, w: World): void {
    const [ox, oy] = iso(this.x, this.y, this.z);
    const f = this.face;
    const K = PX;
    const t = w.t + this.phase * 7;
    const ol = Math.max(0.7, 0.9 / w.zoom);
    d.amp = 0.3;
    d.step = 4;
    const T = (pts: Pts): Pts => pts.map((v, i) => (i % 2 ? oy - v * K : ox + f * v * K));
    const brown = Ink.of(0.35, 0.4, 0.15, 0.62);
    const cream = Ink.of(0.02, 0.15, 0.04, 0.05);
    const cap = Ink.of(0.05, 0.05, 0.2, 0.9);
    const face = Ink.of(0.75, 0.6, 0, 0.05);
    if (this.flying) {
      const flap = Math.sin(this.flapT * 7);
      const [sx, sy] = iso(this.x, this.y, 0);
      const [rx, ry] = groundRadii(0.25);
      d.fill(ellipsePts(sx, sy, rx, ry, 10), Ink.of(0, 0, 0.06, 0.18), { mode: Mode.Over, amp: 0.2 });
      d.fill(T([-0.05, 0.02, -0.55, 0.12 + flap * 0.3, -0.7, 0.05 + flap * 0.4, -0.3, -0.04]), brown.shade(0.15), { outline: ol });
      d.fill(T(ellipsePts(0, 0, 0.26, 0.07, 12)), brown, { outline: ol });
      d.fill(T([-0.2, 0.0, -0.4, 0.05, -0.4, -0.06]), brown, { outline: ol });
      d.fill(T([0.18, 0.0, 0.28, 0.05, 0.3, -0.02]), cream, { outline: ol });
      d.fill(T([0.05, 0.02, 0.5, 0.15 - flap * 0.35, 0.68, 0.08 - flap * 0.45, 0.25, -0.03]), brown, { outline: ol });
      return;
    }
    const look = Math.sin(t * 0.7) > 0.6 ? 0.04 : 0;
    // Patas y cola
    d.stroke(T([0.0, 0.08, 0.01, 0.0]), 1.2, 1, Ink.of(0, 0.85, 0, 0.1), { taper0: 0, taper1: 0 });
    d.fill(T([-0.06, 0.12, -0.16, -0.12, -0.08, -0.13, 0.0, 0.1]), brown.shade(0.2), { outline: ol });
    // Cuerpo
    d.fill(T([-0.08, 0.12, -0.07, 0.34, 0.02, 0.42, 0.09, 0.36, 0.1, 0.18, 0.04, 0.07]), brown, { outline: ol });
    d.fill(T([0.03, 0.38, 0.09, 0.35, 0.1, 0.22, 0.05, 0.2]), cream, { amp: 0.2 });
    d.fill(T([-0.08, 0.32, -0.02, 0.36, 0.03, 0.2, -0.06, 0.12]), brown.shade(0.25), { amp: 0.2 });
    // Cabeza
    const hx = 0.05 + look;
    const hy = 0.47;
    d.fill(T(ellipsePts(hx, hy, 0.06, 0.055, 10)), cream, { outline: ol });
    d.fill(T([hx - 0.06, hy + 0.01, hx - 0.045, hy + 0.055, hx + 0.03, hy + 0.06, hx + 0.05, hy + 0.035, hx - 0.03, hy + 0.025]), cap, { amp: 0.2 });
    d.fill(T([hx + 0.02, hy + 0.01, hx + 0.06, hy + 0.0, hx + 0.045, hy - 0.025, hx + 0.015, hy - 0.02]), face, { amp: 0.2 });
    d.fill(T([hx + 0.055, hy + 0.01, hx + 0.1, hy - 0.01, hx + 0.085, hy - 0.04, hx + 0.055, hy - 0.025]), Ink.of(0, 0.15, 0.35, 0.3), { outline: ol * 0.6 });
    if (w.zoom > 2) {
      const [ex, ey] = T([hx + 0.025, hy + 0.012]);
      d.dot(ex, ey, Math.max(0.5, 0.008 * K), KEY);
    }
  }
}

/** Bandada lejana que cruza el cielo de papel de tanto en tanto. */
export function flock(w: World, opts: { y: number; x0: number; x1: number; every: number; count: number; seed: number }): void {
  w.overlay((d, world) => {
    const period = opts.every;
    const cycle = Math.floor(world.t / period);
    const u = (world.t % period) / (period * 0.55);
    if (u > 1) return;
    d.amp = 0.25;
    const ink = Ink.of(0, 0, 0.25, 0.75);
    for (let i = 0; i < opts.count; i++) {
      const h = Math.sin((cycle + 1) * 12.9898 + i * 78.233) * 43758.5453;
      const r = h - Math.floor(h);
      const x = opts.x0 + (opts.x1 - opts.x0) * u + (i % 3) * 22 + r * 30;
      const y = opts.y + Math.sin(u * 6 + i) * 8 + (i * 9) % 31 - r * 20;
      const flap = Math.sin(world.t * 9 + i * 1.7) * 3;
      const s = 4 + r * 2;
      const pts: Pts = [x - s, y - flap, x, y + 1.2, x + s, y - flap];
      d.stroke(pts, 1.1, 0.9, ink, { taper0: 0.4, taper1: 0.4 });
    }
  });
}
