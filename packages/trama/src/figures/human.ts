import { PX, groundRadii } from '../core/iso';
import { clamp, lerp } from '../core/math';
import type { Drawer } from '../draw/drawer';
import { ellipsePts, hull, limbPoly, type Pts } from '../draw/hand';
import { Ink, KEY } from '../print/ink';
import { Mode } from '../print/separation';
import { Actor } from '../world/actor';
import type { World } from '../world/world';
import { HUMAN_CLIPS, type Held } from './clips';
import { BODY, copyPose, lerpPose, neutral, solve, type Joints, type P2, type Pose } from './pose';

export interface Look {
  /** Altura en metros (1,80 por defecto) y contextura (1 = media). */
  height?: number;
  girth?: number;
  belly?: number;
  skin: Ink;
  hair: Ink;
  hairStyle?: 'corto' | 'largo' | 'trenza' | 'rodete' | 'pelado';
  beard?: 'none' | 'barba' | 'bigote' | 'candado' | 'larga' | 'rala';
  beardInk?: Ink;
  hat?: 'chambergo' | 'boina' | 'vincha' | 'panuelo' | 'none';
  hatInk?: Ink;
  hatBand?: Ink;
  shirt: Ink;
  vest?: Ink;
  poncho?: Ink;
  ponchoStripe?: Ink;
  /** Poncho largo (hasta la rodilla) o corto. */
  ponchoLong?: boolean;
  chiripa?: Ink;
  legs: 'calzoncillo' | 'pantalon' | 'bombacha' | 'pollera';
  legsInk?: Ink;
  boots: 'potro' | 'botas' | 'alpargatas' | 'descalzo';
  bootsInk?: Ink;
  faja?: Ink;
  tirador?: boolean;
  apron?: Ink;
  scarf?: Ink;
  /** Arrugas y cejas más marcadas. */
  age?: number;
}

const SHADOW = Ink.of(0, 0, 0.1, 0.32);
const SHADE = Ink.of(0, 0, 0.07, 0.13);
const WHITE = Ink.of(0, 0.03, 0.02, 0);
const COIN = Ink.of(0, 0.55, 0.1, 0.15);
const BLADE = Ink.of(0, 0, 0.12, 0.1);
const GLASS = Ink.of(0, 0.4, 0.55, 0.28);
const GOURD = Ink.of(0.25, 0.55, 0.15, 0.3);
const WOOD = Ink.of(0.35, 0.6, 0.05, 0.12);
const IRON = Ink.of(0, 0, 0.3, 0.85);

/** Un cuerpo humano dibujado en volúmenes, vestido y animado por clips. */
export class Human extends Actor {
  look: Look;
  k: number;
  seat = 0.45;
  pose: Pose = neutral();
  private from: Pose = neutral();
  private blend = 1;
  private tmp: Pose = neutral();
  /** Tiempo propio para que dos actores con el mismo clip no se sincronicen. */
  private own = 0;
  /** Fuerza un objeto en mano (anula el del clip). */
  hold: Held | undefined;
  holdF: Held | undefined;
  /** Si está a caballo, quien lo lleva. */
  mount: Actor | null = null;

  constructor(name: string, seed: number, look: Look) {
    super(name, seed);
    this.look = look;
    this.k = (look.height ?? 1.8) / 1.8;
    this.own = this.phase * 50;
  }

  get hipH(): number {
    return (BODY.thigh + BODY.shin + BODY.ankle) * this.k;
  }

  protected onClipChange(): void {
    copyPose(this.pose, this.from);
    this.blend = 0;
  }

  update(dt: number, w: World): void {
    super.update(dt, w);
    this.own += dt;
    const c = HUMAN_CLIPS[this.clip] ?? HUMAN_CLIPS.idle;
    // El paso se adapta a la velocidad para que los pies no patinen.
    const rate = this.clip === 'walk' && this.speed > 0 ? this.speed / 1.15 : 1;
    const u = c.loop ? (((this.clipT * rate) / c.dur + this.phase) % 1) : clamp(this.clipT / c.dur);
    const p = neutral(this.tmp);
    c.fn(p, u, this.own, this.seat, this.hipH);
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 0.28);
      const t = this.blend * this.blend * (3 - 2 * this.blend);
      lerpPose(this.from, p, t, this.pose);
    } else copyPose(p, this.pose);
  }

  record(d: Drawer, w: World): void {
    d.begin(this.seed, w.variant, w.zoom);
    if (this.visible && !this.carried) {
      d.alpha = this.alpha;
      const [ox, oy] = [(this.x - this.y) * 0.8660254 * PX, ((this.x + this.y) * 0.5 - this.z) * PX];
      this.drawAt(d, w, ox, oy, false);
    }
    this.keep(d);
  }

  /** Dibuja con origen en (ox, oy) px de mundo. Si mounted, la pelvis cae en ese punto. */
  drawAt(d: Drawer, w: World, ox: number, oy: number, mounted: boolean): void {
    const L = this.look;
    const k = this.k;
    const g = L.girth ?? 1;
    const clip = HUMAN_CLIPS[this.clip] ?? HUMAN_CLIPS.idle;
    const J = solve(this.pose, k, !!clip.grounded && !mounted);
    const f = this.face;
    const K = PX;
    let bx = ox;
    let by = oy;
    if (mounted) {
      bx = ox - f * J.P[0] * K;
      by = oy + J.P[1] * K;
    }
    const T = (pts: Pts): Pts => {
      const o: Pts = new Array(pts.length);
      for (let i = 0; i < pts.length; i += 2) {
        o[i] = bx + f * pts[i] * K;
        o[i + 1] = by - pts[i + 1] * K;
      }
      return o;
    };
    const screenH = w.zoom * K * 1.8 * k;
    const detail = screenH > 70;
    const faceLod = screenH > 115;
    const fine = screenH > 240;
    const ol = 0.42 + 0.6 / w.zoom;
    d.amp = Math.min(0.42, 0.22 + 0.3 / w.zoom);
    d.step = 5;

    const shape = (pts: Pts, ink: Ink, outline = ol) => d.fill(T(pts), ink, { outline });
    const limb = (chain: Pts, widths: number[], ink: Ink, c0 = true, c1 = true) => shape(limbPoly(chain, widths, c0, c1), ink);
    const shadeLimb = (chain: Pts, widths: number[]) => {
      if (!detail) return;
      const n = chain.length >> 1;
      const c: Pts = [];
      for (let i = 0; i < n; i++) {
        const i0 = Math.max(0, i - 1);
        const i1 = Math.min(n - 1, i + 1);
        let tx = chain[2 * i1] - chain[2 * i0];
        let ty = chain[2 * i1 + 1] - chain[2 * i0 + 1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        let nx = -ty;
        let ny = tx;
        if (nx * -0.6 + ny * -0.8 < 0) {
          nx = -nx;
          ny = -ny;
        }
        c.push(chain[2 * i] + nx * widths[i] * 0.26, chain[2 * i + 1] + ny * widths[i] * 0.26);
      }
      d.fill(T(limbPoly(c, widths.map((x) => x * 0.48))), SHADE, { mode: Mode.Add, amp: 0.3 });
    };
    const stroke = (pts: Pts, w0: number, w1 = w0, ink: Ink = KEY) => d.stroke(T(pts), w0, w1, ink, { taper0: 0.25, taper1: 0.3 });
    const L2 = (a: P2, b: P2, t: number): P2 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
    const add = (a: P2, ux: number, uy: number, s: number): P2 => [a[0] + ux * s, a[1] + uy * s];

    const far = (ink: Ink) => ink.shade(0.17);
    const skin = L.skin;
    const skinF = far(skin);
    const wrapped = !!clip.wrap;
    const holdN = this.hold !== undefined ? this.hold : (clip.hold ?? null);
    const holdF = this.holdF !== undefined ? this.holdF : (clip.holdF ?? null);

    // ——— Sombra propia sobre el piso ———
    if (!mounted && !this.pose.rot) {
      const [rx, ry] = groundRadii(0.3 * k);
      d.fill(ellipsePts(ox + f * J.P[0] * K * 0.4, oy, rx, ry, 12), SHADOW, { mode: Mode.Over, amp: 0.3 });
    } else if (!mounted) {
      const [rx, ry] = groundRadii(0.75 * k);
      d.fill(ellipsePts(ox - f * 0.25 * K, oy, rx, ry * 0.8, 14), SHADOW, { mode: Mode.Over, amp: 0.4 });
    }

    // ——— Brazo lejano ———
    const sleeveW = [0.105 * g, 0.088 * g, 0.068 * g];
    const sleeveInk = L.shirt;
    const drawHand = (W: P2, E: P2, ink: Ink, open = false) => {
      let ux = W[0] - E[0];
      let uy = W[1] - E[1];
      const ul = Math.hypot(ux, uy) || 1;
      ux /= ul;
      uy /= ul;
      const vx = -uy;
      const vy = ux;
      const s = k * (open ? 1.08 : 1);
      const pts: Pts = [];
      const P = (a: number, b: number) => pts.push(W[0] + ux * a * s + vx * b * s, W[1] + uy * a * s + vy * b * s);
      P(-0.01, 0.032);
      P(0.055, 0.04);
      P(0.1, 0.018);
      P(0.098, -0.012);
      P(0.06, -0.03);
      P(0.07, -0.05);
      P(0.035, -0.045);
      P(-0.01, -0.03);
      shape(pts, ink);
    };
    const drawArm = (S: P2, E: P2, Wr: P2, ink: Ink, skinInk: Ink, from: 'shoulder' | 'elbow') => {
      if (from === 'shoulder') {
        limb([...S, ...E, ...Wr], sleeveW, ink);
        shadeLimb([...S, ...E, ...Wr], sleeveW);
      } else {
        limb([...E, ...Wr], [sleeveW[1], sleeveW[2]], ink);
      }
      drawHand(Wr, E, skinInk);
    };

    // ——— Objetos en la mano ———
    const drawHeld = (what: Held, W: P2, E: P2, isFar: boolean) => {
      if (!what) return;
      let ux = W[0] - E[0];
      let uy = W[1] - E[1];
      const ul = Math.hypot(ux, uy) || 1;
      ux /= ul;
      uy /= ul;
      const c = add(W, ux, uy, 0.05 * k);
      const sh = isFar ? 0.12 : 0;
      switch (what) {
        case 'vaso': {
          const pts: Pts = [c[0] - 0.025, c[1] + 0.05, c[0] + 0.025, c[1] + 0.05, c[0] + 0.02, c[1] - 0.03, c[0] - 0.02, c[1] - 0.03];
          shape(pts, GLASS.shade(sh));
          break;
        }
        case 'frasco':
        case 'botella': {
          const h = what === 'botella' ? 0.3 : 0.2;
          const tilt = what === 'botella' ? 1.9 : 0;
          const ca = Math.cos(tilt);
          const sa = Math.sin(tilt);
          const R = (x: number, y: number) => [c[0] + x * ca - y * sa, c[1] + x * sa + y * ca];
          const pts: Pts = [...R(-0.035, -0.06), ...R(0.035, -0.06), ...R(0.035, h * 0.55), ...R(0.012, h * 0.7), ...R(0.012, h), ...R(-0.012, h), ...R(-0.012, h * 0.7), ...R(-0.035, h * 0.55)];
          shape(pts, Ink.of(0, 0.45, 0.7, 0.35).shade(sh));
          break;
        }
        case 'mate': {
          shape(ellipsePts(c[0], c[1], 0.045 * k, 0.05 * k, 10), GOURD.shade(sh));
          stroke([c[0] + 0.01, c[1] + 0.04, c[0] + 0.035, c[1] + 0.11], 0.7, 0.5, Ink.of(0, 0.3, 0.1, 0.6));
          break;
        }
        case 'pava': {
          const b = add(W, ux, uy, 0.02);
          shape([b[0] - 0.08, b[1] - 0.02, b[0] + 0.08, b[1] - 0.02, b[0] + 0.07, b[1] - 0.14, b[0] - 0.07, b[1] - 0.14], IRON.shade(sh));
          stroke([b[0] + 0.07, b[1] - 0.06, b[0] + 0.15, b[1] - 0.02], 1.2, 0.6, IRON);
          break;
        }
        case 'facon': {
          const tip = add(W, ux, uy, 0.38 * k);
          const base = add(W, ux, uy, 0.08 * k);
          const vx = -uy;
          const vy = ux;
          shape([base[0] + vx * 0.018, base[1] + vy * 0.018, tip[0], tip[1], base[0] - vx * 0.02, base[1] - vy * 0.02], BLADE);
          stroke([base[0] + vx * 0.04, base[1] + vy * 0.04, base[0] - vx * 0.04, base[1] - vy * 0.04], 1.4, 1.4, IRON);
          break;
        }
        case 'naipes': {
          for (let i = 0; i < 3; i++) {
            const a = -0.5 + i * 0.35;
            const ca = Math.cos(a);
            const sa = Math.sin(a);
            const R = (x: number, y: number) => [c[0] + x * ca - y * sa, c[1] + x * sa + y * ca];
            shape([...R(-0.025, 0), ...R(0.025, 0), ...R(0.025, 0.075), ...R(-0.025, 0.075)], i === 1 ? Ink.of(0.5, 0.1, 0, 0) : WHITE, ol * 0.7);
          }
          break;
        }
        case 'trapo': {
          shape(ellipsePts(c[0], c[1] - 0.02, 0.06, 0.03, 8), Ink.of(0, 0.1, 0.25, 0.05));
          break;
        }
        default:
          break;
      }
    };

    // ——— Piernas ———
    const legsInk = L.legsInk ?? (L.legs === 'calzoncillo' ? WHITE : Ink.of(0.05, 0.05, 0.4, 0.45));
    const bootInk = L.bootsInk ?? Ink.of(0.25, 0.5, 0.02, 0.1);
    const foot = (A: P2, G: P2, phi: number, isFar: boolean) => {
      const fx = Math.cos(phi);
      const fy = Math.sin(phi);
      const ux = -fy;
      const uy = fx;
      const P = (a: number, b: number): number[] => [G[0] + fx * a * k + ux * b * k, G[1] + fy * a * k + uy * b * k];
      const sh = isFar ? 0.17 : 0;
      const sole = [...P(-0.06, 0), ...P(-0.06, 0.06), ...A, ...P(0.06, 0.075), ...P(0.15, 0.045), ...P(0.205, 0.022), ...P(0.2, 0)];
      if (L.boots === 'potro') {
        shape(sole, skin.shade(sh));
        shape([...P(-0.065, -0.005), ...P(-0.065, 0.08), ...A, ...P(0.065, 0.08), ...P(0.13, 0.05), ...P(0.13, -0.005)], bootInk.shade(sh));
        if (detail) stroke(P(0.15, 0.04).concat(P(0.19, 0.01)), 0.5, 0.4);
      } else if (L.boots === 'alpargatas') {
        shape(sole, Ink.of(0, 0.12, 0.08, 0.04).shade(sh));
        if (detail) stroke(P(-0.06, 0.005).concat(P(0.2, 0.005)), 1.0, 0.8, Ink.of(0.15, 0.35, 0, 0.3));
      } else if (L.boots === 'botas') {
        shape(sole, bootInk.shade(sh));
      } else {
        shape(sole, skin.shade(sh));
      }
    };
    const drawLeg = (side: 'N' | 'F', part: 'all' | 'lower') => {
      const isFar = side === 'F';
      const K_ = isFar ? J.KF : J.KN;
      const A = isFar ? J.AF : J.AN;
      const G = isFar ? J.GF : J.GN;
      const phi = isFar ? J.phiF : J.phiN;
      const sh = isFar ? 0.17 : 0;
      const lower = part === 'lower';
      if (L.legs === 'calzoncillo') {
        const mid = L2(K_, A, 0.62);
        const c = lower ? [...L2(J.P, K_, 0.7), ...K_, ...mid] : [...J.P, ...K_, ...mid];
        const ws = lower ? [0.125 * g, 0.12 * g, 0.125 * g] : [0.17 * g, 0.12 * g, 0.125 * g];
        limb(c, ws, legsInk.shade(sh));
        if (detail) {
          // Fleco del calzoncillo cribado.
          const dx = A[0] - K_[0];
          const dy = A[1] - K_[1];
          const l = Math.hypot(dx, dy) || 1;
          const nx = -dy / l;
          const ny = dx / l;
          const z: Pts = [];
          for (let i = 0; i <= 6; i++) {
            const s = -0.07 + (0.14 * i) / 6;
            const down = i % 2 ? 0.03 : 0.0;
            z.push(mid[0] + nx * s * g + (dx / l) * down, mid[1] + ny * s * g + (dy / l) * down);
          }
          stroke(z, 0.6, 0.6, Ink.of(0, 0, 0.1, 0.55));
        }
        if (L.boots === 'potro' || L.boots === 'botas') {
          limb([...L2(K_, A, 0.5), ...A], [0.105 * g, 0.085 * g], (L.boots === 'potro' ? bootInk : bootInk).shade(sh), true, false);
        } else {
          limb([...mid, ...A], [0.075, 0.06], skin.shade(sh), false, true);
        }
      } else if (L.legs === 'pollera') {
        limb([...L2(K_, A, 0.25), ...A], [0.085, 0.065], skin.shade(sh));
      } else {
        const wide = L.legs === 'bombacha' ? 1.25 : 1;
        const c = lower ? [...L2(J.P, K_, 0.65), ...K_, ...A] : [...J.P, ...K_, ...A];
        const ws = [0.17 * g * wide, 0.13 * g * wide, (L.legs === 'bombacha' ? 0.1 : 0.11) * g];
        limb(c, ws, legsInk.shade(sh));
        shadeLimb(c, ws);
        if (L.boots === 'botas') limb([...L2(K_, A, 0.35), ...A], [0.12 * g, 0.1 * g], bootInk.shade(sh), true, false);
      }
      foot(A, G, phi, isFar);
    };

    // ——— Torso ———
    const a1 = J.a1;
    const a2 = J.a2;
    const u1x = Math.sin(a1);
    const u1y = Math.cos(a1);
    const n1x = Math.cos(a1);
    const n1y = -Math.sin(a1);
    const u2x = Math.sin(a2);
    const u2y = Math.cos(a2);
    const n2x = Math.cos(a2);
    const n2y = -Math.sin(a2);
    const at1 = (o: P2, u: number, n: number): number[] => [o[0] + u1x * u * k + n1x * n * k, o[1] + u1y * u * k + n1y * n * k];
    const at2 = (o: P2, u: number, n: number): number[] => [o[0] + u2x * u * k + n2x * n * k, o[1] + u2y * u * k + n2y * n * k];
    const belly = (L.belly ?? 0) * 0.05;
    const torso: Pts = [
      ...at1(J.P, -0.04, 0.115 * g),
      ...at1(J.P, 0.12, (0.112 + belly) * g),
      ...at2(J.C, 0.06, 0.135 * g),
      ...at2(J.N, -0.005, 0.065),
      ...at2(J.N, 0.02, -0.05),
      ...at2(J.C, 0.07, -0.125 * g),
      ...at1(J.P, 0.15, -0.105 * g),
      ...at1(J.P, 0.02, -0.135 * g),
      ...at1(J.P, -0.07, -0.115 * g),
      ...at1(J.P, -0.09, 0.03),
    ];

    const drawTorso = () => {
      shape(torso, L.shirt);
      if (detail) {
        d.fill(T([...at2(J.C, 0.06, -0.125 * g), ...at2(J.N, 0.02, -0.05), ...at2(J.C, 0.05, -0.03), ...at1(J.P, 0.05, -0.04), ...at1(J.P, 0.0, -0.13 * g)]), SHADE, {
          mode: Mode.Add,
          amp: 0.3,
        });
      }
      if (L.vest) {
        shape([...at2(J.N, -0.04, 0.05), ...at2(J.C, 0.03, 0.13 * g), ...at1(J.P, 0.08, (0.112 + belly) * g), ...at1(J.P, 0.08, -0.11 * g), ...at2(J.C, 0.06, -0.125 * g), ...at2(J.N, 0.0, -0.05)], L.vest);
        if (fine) for (let i = 0; i < 3; i++) d.dot(...(T(at2(J.C, 0.05 - i * 0.07, 0.125 * g)) as [number, number]), 0.6, KEY);
      }
      if (L.apron) {
        shape([...at2(J.C, 0.02, 0.14 * g), ...at1(J.P, 0.08, (0.135 + belly) * g), ...at1(J.P, -0.42, 0.17 * g), ...at1(J.P, -0.44, 0.02), ...at1(J.P, 0.05, 0.05)], L.apron);
      }
    };
    const drawBelt = () => {
      if (L.faja) shape([...at1(J.P, 0.06, 0.125 * g), ...at1(J.P, 0.14, (0.12 + belly) * g), ...at1(J.P, 0.15, -0.115 * g), ...at1(J.P, 0.06, -0.13 * g)], L.faja);
      if (L.tirador) {
        shape([...at1(J.P, 0.0, 0.13 * g), ...at1(J.P, 0.075, 0.13 * g), ...at1(J.P, 0.085, -0.13 * g), ...at1(J.P, 0.0, -0.14 * g)], Ink.of(0.3, 0.45, 0.1, 0.55));
        if (detail) for (let i = 0; i < 4; i++) d.dot(...(T(at1(J.P, 0.04, 0.11 * g - i * 0.065)) as [number, number]), Math.max(0.7, 0.012 * K * k), COIN);
      }
    };
    const drawChiripa = () => {
      if (!L.chiripa) return;
      const kn = J.KN;
      const kf = J.KF;
      const perp = (A: P2, B: P2, s: number): number[] => {
        const dx = B[0] - A[0];
        const dy = B[1] - A[1];
        const l = Math.hypot(dx, dy) || 1;
        return [B[0] - (dy / l) * s, B[1] + (dx / l) * s, B[0] + (dy / l) * s, B[1] - (dx / l) * s];
      };
      const pts = hull([
        ...at1(J.P, 0.09, 0.125 * g),
        ...at1(J.P, 0.09, -0.13 * g),
        ...at1(J.P, -0.06, -0.16 * g),
        ...perp(J.P, kn, 0.1 * g),
        ...perp(J.P, kf, 0.1 * g),
        kn[0],
        kn[1] - 0.06 * k,
        kf[0],
        kf[1] - 0.06 * k,
      ]);
      shape(pts, L.chiripa);
      if (detail) {
        stroke([...at1(J.P, 0.08, 0.05), ...L2(J.P, kn, 0.85)], 0.55, 0.3, L.chiripa.shade(0.45));
        stroke([...at1(J.P, 0.08, -0.07), ...L2(J.P, kf, 0.85)], 0.55, 0.3, L.chiripa.shade(0.45));
      }
    };
    const drawPollera = () => {
      if (L.legs !== 'pollera') return;
      const sk = L.legsInk ?? Ink.of(0.6, 0.15, 0.1, 0.1);
      const pts = hull([
        ...at1(J.P, 0.12, 0.12 * g),
        ...at1(J.P, 0.12, -0.12 * g),
        ...at1(J.P, -0.05, -0.17 * g),
        ...at1(J.P, -0.05, 0.16 * g),
        J.KN[0] + 0.12,
        J.KN[1] - 0.05,
        J.KF[0] - 0.14,
        J.KF[1] - 0.05,
        J.AN[0] + 0.14,
        J.AN[1] + 0.08,
        J.AF[0] - 0.16,
        J.AF[1] + 0.08,
      ]);
      shape(pts, sk);
      if (detail) {
        const mid = L2(J.AN, J.AF, 0.5);
        stroke([...at1(J.P, 0.0, 0.05), mid[0] + 0.05, mid[1] + 0.12], 0.55, 0.3, sk.shade(0.4));
        stroke([...at1(J.P, 0.0, -0.08), mid[0] - 0.1, mid[1] + 0.12], 0.55, 0.3, sk.shade(0.4));
      }
    };
    const drawPoncho = () => {
      if (!L.poncho || wrapped) return;
      const long = L.ponchoLong ? 0.22 : 0;
      const outE = (E: P2, s: number) => {
        const dx = E[0] - J.S[0];
        const dy = E[1] - J.S[1];
        const l = Math.hypot(dx, dy) || 1;
        return [E[0] + (dx / l) * s, E[1] + (dy / l) * s];
      };
      const pts = hull([
        ...at2(J.N, 0.035, -0.065),
        ...at2(J.N, 0.03, 0.068),
        ...at2(J.S, 0.07, 0.0),
        ...outE(J.EN, 0.035 * k),
        ...outE(J.EF, 0.035 * k),
        ...at2(J.C, 0.02, 0.17 * g),
        ...at1(J.P, -0.1 - long, 0.2 * g),
        ...at1(J.P, -0.3 - long, 0.02),
        ...at1(J.P, -0.12 - long, -0.2 * g),
        ...at2(J.C, 0.02, -0.165 * g),
      ]);
      shape(pts, L.poncho);
      if (L.ponchoStripe && detail) {
        // Guarda del poncho cerca del ruedo.
        let minY = Infinity;
        for (let i = 1; i < pts.length; i += 2) minY = Math.min(minY, pts[i]);
        const band: Pts = [];
        const hi = minY + 0.09 * k;
        const lo = minY + 0.04 * k;
        let x0 = Infinity;
        let x1 = -Infinity;
        for (let i = 0; i < pts.length; i += 2) {
          if (pts[i + 1] < hi + 0.06) {
            x0 = Math.min(x0, pts[i]);
            x1 = Math.max(x1, pts[i]);
          }
        }
        band.push(x0 + 0.03, lo, x1 - 0.03, lo, x1 - 0.02, hi, x0 + 0.02, hi);
        d.fill(T(band), L.ponchoStripe, { mode: Mode.Fill, amp: 0.3 });
      }
      if (detail) {
        stroke([...at2(J.N, 0.0, 0.03), ...at1(J.P, -0.12 - long, 0.12)], 0.5, 0.25, L.poncho.shade(0.4));
        stroke([...at2(J.S, 0.0, -0.05), ...at1(J.P, -0.12 - long, -0.15)], 0.5, 0.25, L.poncho.shade(0.4));
      }
    };

    // ——— Cabeza ———
    const ha = J.ha;
    const hu: P2 = [Math.sin(ha), Math.cos(ha)];
    const hn: P2 = [Math.cos(ha), -Math.sin(ha)];
    const hk = k * 1.0;
    const HP = (list: number[]): Pts => {
      const out: Pts = [];
      for (let i = 0; i < list.length; i += 2) {
        out.push(J.H[0] + (hn[0] * list[i] + hu[0] * list[i + 1]) * hk, J.H[1] + (hn[1] * list[i] + hu[1] * list[i + 1]) * hk);
      }
      return out;
    };
    const HEAD = [
      -0.095, 0.03, -0.088, 0.085, -0.035, 0.125, 0.04, 0.118, 0.085, 0.072, 0.095, 0.032, 0.1, 0.014, 0.128, -0.022, 0.1, -0.038, 0.104, -0.055, 0.094, -0.066, 0.099, -0.082,
      0.086, -0.106, 0.04, -0.12, -0.02, -0.1, -0.06, -0.07, -0.09, -0.03,
    ];
    const drawHead = () => {
      const hs = L.hairStyle ?? 'corto';
      if (hs === 'largo' || hs === 'trenza') {
        shape(HP([-0.1, 0.06, -0.04, 0.12, 0.02, 0.1, -0.06, -0.05, -0.08, -0.2, -0.13, -0.17, -0.12, -0.02]), L.hair);
        if (hs === 'trenza') {
          const t0 = HP([-0.09, -0.08]);
          const t1 = HP([-0.12, -0.4]);
          stroke([t0[0], t0[1], t1[0], t1[1]], 0.06 * K * k * 0.9, 0.03 * K * k, L.hair);
        }
      }
      limb([...J.N, ...J.Nt], [0.1 * g, 0.088], skin);
      shape(HP(HEAD), skin);
      if (detail) d.fill(T(HP([-0.095, 0.03, -0.088, 0.085, -0.035, 0.12, -0.03, 0.0, -0.06, -0.07, -0.09, -0.03])), SHADE, { mode: Mode.Add, amp: 0.2 });
      // Pelo
      if (hs !== 'pelado') {
        const hair = hs === 'rodete'
          ? [-0.1, 0.0, -0.1, 0.075, -0.045, 0.128, 0.035, 0.13, 0.085, 0.085, 0.08, 0.07, 0.0, 0.09, -0.045, 0.05, -0.06, -0.02]
          : [-0.102, -0.01, -0.1, 0.075, -0.048, 0.13, 0.035, 0.132, 0.088, 0.088, 0.078, 0.072, 0.005, 0.095, -0.04, 0.06, -0.05, 0.0, -0.075, -0.055];
        shape(HP(hair), L.hair);
        if (hs === 'rodete') shape(HP([-0.16, 0.06, -0.14, 0.12, -0.08, 0.11, -0.1, 0.03].map((v, i) => (i % 2 ? v : v + 0.02))), L.hair);
      }
      // Oreja
      shape(ellipsePts(...(HP([-0.015, -0.005]) as [number, number]), 0.02 * hk, 0.032 * hk, 8, -ha), skin);
      // Barba
      const bink = L.beardInk ?? L.hair;
      const beard = L.beard ?? 'none';
      if (beard === 'barba' || beard === 'larga' || beard === 'rala') {
        const drop = beard === 'larga' ? -0.06 : 0;
        const ink = beard === 'rala' ? bink.scale(0.55) : bink;
        shape(HP([0.1, -0.05, 0.107, -0.09, 0.086, -0.13 + drop, 0.035, -0.148 + drop, -0.012, -0.118, -0.034, -0.07, -0.022, -0.055, 0.015, -0.082, 0.058, -0.074, 0.076, -0.05]), ink, ol * 0.8);
      } else if (beard === 'candado') {
        shape(HP([0.095, -0.075, 0.1, -0.1, 0.075, -0.13, 0.035, -0.125, 0.06, -0.09]), bink, ol * 0.8);
      }
      if (beard !== 'none' && faceLod) stroke(HP([0.108, -0.047, 0.085, -0.053, 0.06, -0.06]), 0.032 * K * hk, 0.014 * K * hk, bink);
      if (faceLod) {
        const [ex, ey] = T(HP([0.064, 0.012]));
        d.dot(ex, ey, Math.max(0.55, 0.011 * K * hk), KEY);
        stroke(HP([0.038, 0.036, 0.065, 0.042, 0.092, 0.035]), 0.016 * K * hk, 0.01 * K * hk);
        if (fine) {
          stroke(HP([0.1, -0.035, 0.09, -0.04]), 0.008 * K * hk, 0.005 * K * hk);
          stroke(HP([0.08, -0.07, 0.097, -0.069]), 0.007 * K * hk, 0.004 * K * hk);
          if ((L.age ?? 0) > 0.5) stroke(HP([0.075, -0.0, 0.06, -0.03]), 0.005 * K * hk, 0.002 * K * hk);
        }
      }
      // Sombrero
      const hat = L.hat ?? 'none';
      const hatInk = L.hatInk ?? Ink.of(0, 0.05, 0.25, 0.85);
      if (hat === 'chambergo') {
        const c = HP([0.005, 0.1]);
        d.fill(T(ellipsePts(c[0], c[1], 0.21 * hk, 0.032 * hk, 18, -ha * 1)), hatInk, { outline: ol });
        shape(HP([-0.086, 0.1, -0.076, 0.2, -0.02, 0.214, 0.066, 0.205, 0.088, 0.1]), hatInk);
        if (L.hatBand) shape(HP([-0.084, 0.106, -0.081, 0.13, 0.083, 0.13, 0.086, 0.106]), L.hatBand, ol * 0.6);
      } else if (hat === 'boina') {
        shape(HP([-0.12, 0.07, -0.08, 0.135, 0.03, 0.15, 0.115, 0.1, 0.09, 0.075, 0.0, 0.088]), hatInk);
        stroke(HP([0.0, 0.15, 0.01, 0.175]), 1.2, 0.5, hatInk);
      } else if (hat === 'vincha') {
        shape(HP([-0.1, 0.05, -0.098, 0.08, 0.085, 0.09, 0.09, 0.062]), L.hatBand ?? Ink.of(0.85, 0.15, 0, 0.05), ol * 0.7);
        stroke(HP([-0.1, 0.065, -0.16, 0.0, -0.19, -0.1]), 0.022 * K * hk, 0.008 * K * hk, L.hatBand ?? Ink.of(0.85, 0.15, 0, 0.05));
      } else if (hat === 'panuelo') {
        shape(HP([-0.11, 0.0, -0.1, 0.09, -0.04, 0.14, 0.05, 0.135, 0.095, 0.08, 0.06, 0.07, -0.02, 0.09, -0.07, 0.03, -0.12, -0.06]), L.hatBand ?? Ink.of(0.6, 0.2, 0.05, 0.05));
      }
    };

    const drawScarf = () => {
      if (!L.scarf) return;
      shape([...at2(J.N, 0.03, 0.075), ...at2(J.N, -0.13, 0.11), ...at2(J.N, -0.07, 0.02), ...at2(J.N, 0.035, -0.04)], L.scarf, ol * 0.8);
    };

    const drawGuitar = () => {
      const base = L2(J.P, J.KN, 0.5);
      const c: P2 = [base[0] + 0.02 * k, base[1] + 0.11 * k];
      let ux = J.WF[0] - c[0];
      let uy = J.WF[1] - c[1];
      const ul = Math.hypot(ux, uy) || 1;
      ux /= ul;
      uy /= ul;
      const rot = Math.atan2(uy, ux);
      const lower = ellipsePts(c[0] - ux * 0.06, c[1] - uy * 0.06, 0.2 * k, 0.15 * k, 18, rot);
      const upper = ellipsePts(c[0] + ux * 0.14, c[1] + uy * 0.14, 0.14 * k, 0.11 * k, 16, rot);
      d.outline(T(lower), ol);
      d.outline(T(upper), ol);
      d.fill(T(lower), WOOD, { amp: 0.3 });
      d.fill(T(upper), WOOD, { amp: 0.3 });
      d.dot(...(T([c[0] + ux * 0.06, c[1] + uy * 0.06]) as [number, number]), 0.045 * K * k, Ink.of(0.2, 0.3, 0.2, 0.85));
      const n0 = add(c, ux, uy, 0.24 * k);
      const n1 = add(c, ux, uy, ul + 0.08 * k);
      stroke([...n0, ...n1], 0.05 * K * k, 0.04 * K * k, Ink.of(0.4, 0.4, 0.1, 0.55));
      if (detail) stroke([...add(c, ux, uy, -0.18 * k), ...n1], 0.25, 0.25, Ink.of(0, 0.2, 0.1, 0.3));
    };

    // ——— Orden de dibujo: lo lejano primero ———
    if (!wrapped) {
      drawArm(J.S, J.EF, J.WF, far(sleeveInk), skinF, 'shoulder');
    } else {
      limb([...J.S, ...J.EF, ...J.WF], sleeveW, far(sleeveInk));
      // Poncho arrollado en el antebrazo, a modo de escudo.
      const m = L2(J.EF, J.WF, 0.5);
      const pk = L.poncho ?? Ink.of(0.7, 0.15, 0, 0.1);
      shape(hull([...ellipsePts(m[0], m[1], 0.13 * k, 0.1 * k, 10), ...ellipsePts(J.WF[0], J.WF[1] - 0.12 * k, 0.09 * k, 0.12 * k, 8)]), pk.shade(0.1));
      drawHand(J.WF, J.EF, skinF);
    }
    drawHeld(holdF, J.WF, J.EF, true);
    if (!clip.ride && !mounted) drawLeg('F', 'all');
    drawTorso();
    drawLeg('N', mounted ? 'lower' : 'all');
    drawChiripa();
    drawPollera();
    drawBelt();
    if (holdN === 'guitarra') drawGuitar();
    const ponchoOn = !!L.poncho && !wrapped;
    drawPoncho();
    drawScarf();
    drawHead();
    drawArm(J.S, J.EN, J.WN, sleeveInk, skin, ponchoOn ? 'elbow' : 'shoulder');
    if (holdN !== 'guitarra') drawHeld(holdN, J.WN, J.EN, false);
  }

  /** Punto de los ojos en px de mundo (para encuadres o miradas). */
  eye(): [number, number] {
    const J: Joints = solve(this.pose, this.k, true);
    return [(this.x - this.y) * 0.8660254 * PX + this.face * J.H[0] * PX, ((this.x + this.y) * 0.5 - this.z) * PX - J.H[1] * PX];
  }
}
