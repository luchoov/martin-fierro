import { PX, groundRadii, iso } from '../core/iso';
import { TAU, clamp, len, plateau, pulse, type Vec3 } from '../core/math';
import type { Drawer } from '../draw/drawer';
import { ellipsePts, hull, limbPoly, type Pts } from '../draw/hand';
import { Ink, KEY } from '../print/ink';
import { Mode } from '../print/separation';
import { Actor } from '../world/actor';
import type { World } from '../world/world';
import type { Human } from './human';

export interface QuadSpec {
  kind: 'horse' | 'dog';
  /** Media distancia entre la cruz y el anca (m). */
  L: number;
  /** Altura del centro del cuerpo. */
  H: number;
  body: [number, number];
  chest: number;
  rump: number;
  front: [number, number, number];
  hind: [number, number, number];
  legW: [number, number, number];
  hindW: [number, number, number];
  neck: { len: number; w0: number; w1: number; ang: number };
  head: { len: number; w0: number; w1: number; w2: number; drop: number };
  tail: { len: number; w: number; ang: number; curl: number };
  ears: { len: number; w: number; floppy: boolean };
}

export const HORSE: QuadSpec = {
  kind: 'horse',
  L: 0.52,
  H: 1.13,
  body: [0.74, 0.3],
  chest: 0.3,
  rump: 0.31,
  front: [0.42, 0.36, 0.16],
  hind: [0.4, 0.44, 0.34],
  legW: [0.19, 0.1, 0.08],
  hindW: [0.26, 0.13, 0.08],
  neck: { len: 0.58, w0: 0.5, w1: 0.28, ang: 0.95 },
  head: { len: 0.5, w0: 0.3, w1: 0.22, w2: 0.16, drop: -1.6 },
  tail: { len: 0.75, w: 0.14, ang: -1.2, curl: -0.25 },
  ears: { len: 0.12, w: 0.05, floppy: false },
};

export const DOG: QuadSpec = {
  kind: 'dog',
  L: 0.22,
  H: 0.44,
  body: [0.3, 0.13],
  chest: 0.13,
  rump: 0.115,
  front: [0.17, 0.14, 0.06],
  hind: [0.15, 0.17, 0.12],
  legW: [0.075, 0.045, 0.04],
  hindW: [0.1, 0.055, 0.04],
  neck: { len: 0.16, w0: 0.14, w1: 0.1, ang: 0.85 },
  head: { len: 0.19, w0: 0.13, w1: 0.09, w2: 0.055, drop: -1.15 },
  tail: { len: 0.3, w: 0.05, ang: 0.6, curl: 0.9 },
  ears: { len: 0.07, w: 0.04, floppy: true },
};

export interface QuadLook {
  coat: Ink;
  mane: Ink;
  hoof?: Ink;
  /** Manchas en coordenadas locales: [x, y, rx, ry]. */
  patches?: number[];
  patchInk?: Ink;
  blaze?: boolean;
  saddle?: { blanket: Ink; stripe: Ink; pelero: Ink };
  size?: number;
}

export interface QuadPose {
  y: number;
  pitch: number;
  neck: number;
  head: number;
  tail: number;
  tailUp: number;
  legs: [number, number, number, number, number, number, number, number];
  jaw: number;
}

function qneutral(out?: QuadPose): QuadPose {
  const p = out ?? ({ legs: [0, 0, 0, 0, 0, 0, 0, 0] } as unknown as QuadPose);
  p.y = 0;
  p.pitch = 0;
  p.neck = 0;
  p.head = 0;
  p.tail = 0;
  p.tailUp = 0;
  p.jaw = 0;
  for (let i = 0; i < 8; i++) p.legs[i] = 0;
  return p;
}

function qlerp(a: QuadPose, b: QuadPose, t: number, o: QuadPose): void {
  o.y = a.y + (b.y - a.y) * t;
  o.pitch = a.pitch + (b.pitch - a.pitch) * t;
  o.neck = a.neck + (b.neck - a.neck) * t;
  o.head = a.head + (b.head - a.head) * t;
  o.tail = a.tail + (b.tail - a.tail) * t;
  o.tailUp = a.tailUp + (b.tailUp - a.tailUp) * t;
  o.jaw = a.jaw + (b.jaw - a.jaw) * t;
  for (let i = 0; i < 8; i++) o.legs[i] = a.legs[i] + (b.legs[i] - a.legs[i]) * t;
}

export interface QuadClip {
  dur: number;
  loop?: boolean;
  fn(p: QuadPose, u: number, t: number): void;
}

const { sin, cos, max } = Math;

/** legs: [balanceo, flexión] para mano cercana, mano lejana, pata cercana, pata lejana. */
function gait(p: QuadPose, u: number, offs: number[], amp: number, lift: number): void {
  for (let i = 0; i < 4; i++) {
    const ph = (u + offs[i]) * TAU;
    p.legs[2 * i] = amp * sin(ph);
    p.legs[2 * i + 1] = lift * max(0, cos(ph + 0.3)) ** 1.3;
  }
}

export const QUAD_CLIPS: Record<string, QuadClip> = {
  stand: {
    dur: 9,
    loop: true,
    fn(p, u, t) {
      p.tail = 0.12 * sin(t * 0.9) + 0.35 * pulse(u, 0.4, 0.48) * sin(t * 14);
      p.neck = 0.05 * sin(t * 0.37);
      p.head = 0.06 * sin(t * 0.53) - 0.1 * plateau(u, 0.7, 0.75, 0.82, 0.88);
      p.legs[7] = 0.35 * plateau(u, 0.1, 0.18, 0.55, 0.62);
      p.legs[6] = 0.05 * plateau(u, 0.1, 0.18, 0.55, 0.62);
    },
  },
  walk: {
    dur: 1.25,
    loop: true,
    fn(p, u, t) {
      gait(p, u, [0.25, 0.75, 0, 0.5], 0.3, 0.85);
      p.neck = 0.06 * sin(u * TAU * 2);
      p.head = 0.04 * sin(u * TAU * 2 + 1);
      p.tail = 0.1 * sin(t * 1.3);
      p.y = 0.012 * cos(u * TAU * 2);
    },
  },
  trot: {
    dur: 0.62,
    loop: true,
    fn(p, u, t) {
      gait(p, u, [0, 0.5, 0.5, 0], 0.42, 1.2);
      p.neck = 0.04 * sin(u * TAU * 2);
      p.tail = 0.25 + 0.1 * sin(t * 3);
      p.tailUp = 0.2;
      p.y = 0.025 * cos(u * TAU * 2);
    },
  },
  graze: {
    dur: 6,
    loop: true,
    fn(p, u, t) {
      p.neck = -1.05;
      p.head = 0.55 + 0.05 * sin(t * 3);
      p.jaw = max(0, sin(t * 5));
      p.tail = 0.1 * sin(t * 0.8);
      const step = plateau(u, 0.6, 0.66, 0.74, 0.8);
      p.legs[0] = 0.25 * step;
      p.legs[1] = 0.9 * step;
    },
  },
  toss: {
    dur: 1.4,
    fn(p, u, t) {
      const k = pulse(u, 0, 1);
      p.neck = 0.35 * k;
      p.head = 0.5 * k * sin(u * TAU * 2);
      p.legs[0] = 0.35 * pulse(u, 0.2, 0.6);
      p.legs[1] = 1.0 * pulse(u, 0.2, 0.6);
      p.tail = 0.3 * sin(t * 12) * k;
    },
  },
  lie: {
    dur: 5,
    loop: true,
    fn(p, u, t) {
      p.y = -0.3;
      p.legs[0] = 1.4;
      p.legs[2] = 1.4;
      p.legs[1] = 0.1;
      p.legs[3] = 0.1;
      p.legs[4] = 1.2;
      p.legs[5] = 2.4;
      p.legs[6] = 1.2;
      p.legs[7] = 2.4;
      p.neck = -0.55;
      p.head = 0.35 + 0.03 * sin(u * TAU);
      p.tail = 0.05 * sin(t);
    },
  },
  sniff: {
    dur: 3,
    loop: true,
    fn(p, u, t) {
      p.neck = -0.75;
      p.head = 0.4 + 0.12 * sin(t * 9);
      p.tail = 0.25 * sin(t * 6);
      p.tailUp = 0.2;
      gait(p, u, [0.25, 0.75, 0, 0.5], 0.08, 0.3);
    },
  },
  bark: {
    dur: 1.2,
    fn(p, u, t) {
      const k = pulse(u, 0, 1);
      p.neck = 0.35 * k;
      p.head = -0.25 * k;
      p.jaw = max(0, sin(u * TAU * 3)) * k;
      p.y = 0.08 * max(0, sin(u * TAU * 3)) * k;
      p.tail = 0.6 * sin(t * 18);
      p.tailUp = 0.4;
    },
  },
  sit: {
    dur: 6,
    loop: true,
    fn(p, _u, t) {
      p.pitch = 0.42;
      p.y = -0.1;
      p.legs[0] = -0.35;
      p.legs[2] = -0.35;
      p.legs[4] = 1.3;
      p.legs[5] = 2.6;
      p.legs[6] = 1.3;
      p.legs[7] = 2.6;
      p.neck = -0.25;
      p.head = 0.1 + 0.08 * sin(t * 0.7);
      p.tail = -0.4 + 0.3 * sin(t * 5);
    },
  },
};

const HOOF = Ink.of(0, 0, 0.2, 0.9);
const SHADOW = Ink.of(0, 0, 0.1, 0.32);
const SHADE = Ink.of(0, 0, 0.07, 0.13);

type V = [number, number];

export class Quadruped extends Actor {
  spec: QuadSpec;
  look: QuadLook;
  s: number;
  pose: QuadPose = qneutral();
  private from: QuadPose = qneutral();
  private tmp: QuadPose = qneutral();
  private blend = 1;
  private own = 0;
  rider: Human | null = null;
  /** Atado a un punto del mundo (el palenque). */
  tie: Vec3 | null = null;

  constructor(name: string, seed: number, spec: QuadSpec, look: QuadLook) {
    super(name, seed);
    this.spec = spec;
    this.look = look;
    this.s = look.size ?? 1;
    this.idleClip = 'stand';
    this.clip = 'stand';
    this.radius = spec.kind === 'horse' ? 0.55 : 0.25;
    this.own = this.phase * 40;
  }

  protected onClipChange(): void {
    qlerp(this.pose, this.pose, 0, this.from);
    this.blend = 0;
  }

  /** Sube un jinete. */
  mountRider(h: Human): void {
    this.rider = h;
    h.mount = this;
    h.carried = true;
    h.run([], null);
    h.idleClip = 'ride';
    h.setClip('ride');
  }

  dismount(x: number, y: number): Human | null {
    const h = this.rider;
    if (!h) return null;
    this.rider = null;
    h.mount = null;
    h.carried = false;
    h.place(x, y);
    h.z = 0;
    h.idleClip = 'idle';
    h.setClip('idle');
    return h;
  }

  update(dt: number, w: World): void {
    super.update(dt, w);
    this.own += dt;
    const c = QUAD_CLIPS[this.clip] ?? QUAD_CLIPS.stand;
    const base = this.spec.kind === 'horse' ? 1.15 : 1.0;
    const rate = (this.clip === 'walk' || this.clip === 'trot') && this.speed > 0 ? this.speed / (this.clip === 'trot' ? base * 2.6 : base) : 1;
    const u = c.loop ? (((this.clipT * rate) / c.dur + this.phase) % 1) : clamp(this.clipT / c.dur);
    const p = qneutral(this.tmp);
    c.fn(p, u, this.own);
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 0.3);
      qlerp(this.from, p, this.blend, this.pose);
    } else qlerp(p, p, 0, this.pose);
    if (this.rider) {
      this.rider.x = this.x;
      this.rider.y = this.y;
      this.rider.face = this.face;
      this.rider.footprint();
    }
  }

  record(d: Drawer, w: World): void {
    d.begin(this.seed, w.variant, w.zoom);
    if (this.visible) {
      d.alpha = this.alpha;
      this.draw(d, w);
    }
    this.keep(d);
  }

  private draw(d: Drawer, w: World): void {
    const S = this.spec;
    const s = this.s;
    const L = this.look;
    const p = this.pose;
    const f = this.face;
    const K = PX;
    const [ox, oy] = iso(this.x, this.y, this.z);
    const screenH = w.zoom * K * S.H * 2 * s;
    const detail = screenH > 60;
    const faceLod = screenH > 110;
    const ol = 0.45 + 0.6 / w.zoom;
    d.amp = Math.min(0.45, 0.25 + 0.3 / w.zoom);
    d.step = 5;

    // ——— Cinemática ———
    const B: V = [0, (S.H + p.y) * s];
    const cp = Math.cos(p.pitch);
    const sp = Math.sin(p.pitch);
    const R = (x: number, y: number): V => [B[0] + (x * cp - y * sp) * s, B[1] + (x * sp + y * cp) * s];
    const dir = (th: number, l: number, o: V): V => [o[0] + Math.sin(th) * l * s, o[1] - Math.cos(th) * l * s];
    const FA = R(S.L, -0.04);
    const HA = R(-S.L, 0.02);
    const legs: V[][] = [];
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      const sw = p.legs[2 * i];
      const bend = p.legs[2 * i + 1];
      const [l1, l2, l3] = front ? S.front : S.hind;
      const A = front ? FA : HA;
      let a1: number, a2: number, a3: number;
      if (front) {
        a1 = sw;
        a2 = a1 - bend * 1.25;
        a3 = a2 + bend * 0.55;
      } else {
        a1 = 0.42 + sw * 0.8;
        a2 = -0.42 + sw - bend * 0.35;
        a3 = 0.06 + sw + bend * 1.15;
      }
      const p1 = dir(a1, l1, A);
      const p2 = dir(a2, l2, p1);
      const p3 = dir(a3, l3, p2);
      legs.push([A, p1, p2, p3]);
    }
    const NB = R(S.L + 0.06, S.body[1] * 0.5);
    const na = S.neck.ang + p.pitch + p.neck;
    const poll: V = [NB[0] + Math.cos(na) * S.neck.len * s, NB[1] + Math.sin(na) * S.neck.len * s];
    const hd = na + S.head.drop + p.head;
    const hmid: V = [poll[0] + Math.cos(hd) * S.head.len * 0.45 * s, poll[1] + Math.sin(hd) * S.head.len * 0.45 * s];
    const muzzle: V = [poll[0] + Math.cos(hd) * S.head.len * s, poll[1] + Math.sin(hd) * S.head.len * s];
    const TB = R(-S.L - S.rump * 0.7, S.rump * 0.45);
    const tail: Pts = [...TB];
    const ta0 = S.tail.ang + p.tail * 0.4 + p.tailUp;
    let tp: V = TB;
    for (let i = 1; i <= 4; i++) {
      const a = Math.PI - ta0 - S.tail.curl * (i / 4) - p.tail * (i / 4);
      tp = [tp[0] + Math.cos(a) * (S.tail.len / 4) * s, tp[1] + Math.sin(a) * (S.tail.len / 4) * s];
      tail.push(...tp);
    }
    // Apoyo en el suelo
    let minY = Infinity;
    for (const lg of legs) minY = Math.min(minY, lg[3][1]);
    const lift = this.rider || this.clip === 'lie' || this.clip === 'sit' ? Math.min(minY, 0.02) : minY;
    const T = (pts: Pts): Pts => {
      const o: Pts = new Array(pts.length);
      for (let i = 0; i < pts.length; i += 2) {
        o[i] = ox + f * pts[i] * K;
        o[i + 1] = oy - (pts[i + 1] - lift) * K;
      }
      return o;
    };
    const shape = (pts: Pts, ink: Ink, outline = ol) => d.fill(T(pts), ink, { outline });

    // Sombra
    const [rx, ry] = groundRadii((S.L + S.body[0] * 0.6) * s);
    d.fill(ellipsePts(ox, oy, rx * 0.85, ry * 0.75, 14), SHADOW, { mode: Mode.Over, amp: 0.3 });

    const coat = L.coat;
    const coatF = coat.shade(0.2);
    const drawLeg = (lg: V[], front: boolean, ink: Ink) => {
      const wv = front ? S.legW : S.hindW;
      const chain = [...lg[0], ...lg[1], ...lg[2], ...lg[3]];
      shape(limbPoly(chain, [wv[0] * s, wv[1] * s, wv[2] * s, wv[2] * s * 0.9]), ink);
      // Vaso
      const [a, b] = [lg[2], lg[3]];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = len(dx, dy) || 1;
      const hw = wv[2] * s * 0.62;
      const h = (S.kind === 'horse' ? 0.08 : 0.03) * s;
      const ux = dx / l;
      const uy = dy / l;
      const hoof = [b[0] - uy * hw - ux * h, b[1] + ux * hw - uy * h, b[0] + uy * hw - ux * h, b[1] - ux * hw - uy * h, b[0] + uy * hw * 1.2, b[1] - ux * hw * 1.2, b[0] - uy * hw * 1.2, b[1] + ux * hw * 1.2];
      shape(hoof, L.hoof ?? HOOF, ol * 0.7);
    };

    // Patas lejanas
    drawLeg(legs[1], true, coatF);
    drawLeg(legs[3], false, coatF);

    // Cola
    if (S.kind === 'horse') {
      d.fill(T(limbPoly(tail, [S.tail.w * s, S.tail.w * 1.3 * s, S.tail.w * 1.4 * s, S.tail.w * 1.2 * s, S.tail.w * 0.6 * s])), L.mane, { outline: ol });
      if (detail) d.stroke(T(tail.map((v, i) => (i % 2 ? v : v + 0.02 * f))), 0.5, 0.3, L.mane.shade(0.4), { taper0: 0.2, taper1: 0.5 });
    } else {
      shape(limbPoly(tail, [S.tail.w * s, S.tail.w * 0.9 * s, S.tail.w * 0.8 * s, S.tail.w * 0.6 * s, S.tail.w * 0.3 * s]), coat);
    }

    // Cuerpo: primero todos los contornos, después todos los rellenos (una sola silueta).
    const barrel = ellipsePts(B[0], B[1], S.body[0] * s, S.body[1] * s, 20, p.pitch);
    const chest = ellipsePts(...R(S.L + 0.02 * s, 0.06), S.chest * s, S.chest * s * 1.02, 14);
    const rump = ellipsePts(...R(-S.L - 0.03 * s, 0.08), S.rump * s, S.rump * s, 14);
    const nax = Math.cos(na);
    const nay = Math.sin(na);
    const neck = [
      NB[0] - nay * S.neck.w0 * 0.5 * s - nax * 0.06 * s,
      NB[1] + nax * S.neck.w0 * 0.5 * s - nay * 0.06 * s,
      poll[0] - nay * S.neck.w1 * 0.5 * s,
      poll[1] + nax * S.neck.w1 * 0.5 * s,
      poll[0] + nay * S.neck.w1 * 0.5 * s,
      poll[1] - nax * S.neck.w1 * 0.5 * s,
      NB[0] + nay * S.neck.w0 * 0.5 * s + nax * 0.04 * s,
      NB[1] - nax * S.neck.w0 * 0.5 * s + nay * 0.04 * s,
      NB[0] - nax * 0.12 * s,
      NB[1] - 0.2 * s,
    ];
    const head = limbPoly([...poll, ...hmid, ...muzzle], [S.head.w0 * s, S.head.w1 * s, S.head.w2 * s]);
    const parts = [hull(neck), barrel, chest, rump, head];
    for (const pt of parts) d.outline(T(pt), ol);
    for (const pt of parts) d.fill(T(pt), coat, { amp: d.amp * 0.8 });
    if (detail) {
      d.fill(T(ellipsePts(B[0], B[1] - S.body[1] * 0.45 * s, S.body[0] * 0.85 * s, S.body[1] * 0.45 * s, 16, p.pitch)), SHADE, { mode: Mode.Add, amp: 0.4 });
    }
    if (L.patches && L.patchInk) {
      for (let i = 0; i < L.patches.length; i += 4) {
        const c = R(L.patches[i], L.patches[i + 1]);
        d.fill(T(ellipsePts(c[0], c[1], L.patches[i + 2] * s, L.patches[i + 3] * s, 12, 0.3 * i)), L.patchInk, { amp: 0.6 });
      }
    }
    // Orejas
    const ear = (off: number, ink: Ink) => {
      const ea = hd + Math.PI + (S.ears.floppy ? -0.6 : 0.5) + off;
      const b0: V = [poll[0] - Math.cos(hd) * 0.02 * s, poll[1] - Math.sin(hd) * 0.02 * s];
      const tip: V = [b0[0] + Math.cos(ea + (S.ears.floppy ? 1.2 : -1.6)) * S.ears.len * s, b0[1] + Math.sin(ea + (S.ears.floppy ? 1.2 : -1.6)) * S.ears.len * s];
      shape([b0[0] - S.ears.w * 0.5 * s, b0[1], tip[0], tip[1], b0[0] + S.ears.w * 0.5 * s, b0[1] - 0.01], ink, ol * 0.8);
    };
    ear(0.25, coatF);
    ear(0, coat);
    // Crin
    if (S.kind === 'horse') {
      const crin: Pts = [];
      for (let i = 0; i <= 5; i++) {
        const t = i / 5;
        const x = NB[0] + (poll[0] - NB[0]) * t - nay * (S.neck.w0 + (S.neck.w1 - S.neck.w0) * t) * 0.5 * s;
        const y = NB[1] + (poll[1] - NB[1]) * t + nax * (S.neck.w0 + (S.neck.w1 - S.neck.w0) * t) * 0.5 * s;
        crin.push(x - 0.03 * s, y + 0.02 * s);
      }
      d.stroke(T(crin), 0.09 * K * s, 0.05 * K * s, L.mane, { taper0: 0.15, taper1: 0.3, mode: Mode.Fill });
      if (detail) {
        for (let i = 1; i < 5; i++) {
          const x = crin[2 * i];
          const y = crin[2 * i + 1];
          d.stroke(T([x, y, x - nay * 0.12 * s + 0.02, y + nax * 0.12 * s - 0.08 * s]), 0.6, 0.2, L.mane, { taper0: 0, taper1: 0.6 });
        }
      }
    }
    // Lucero
    if (L.blaze) d.fill(T(limbPoly([...hmid, ...muzzle], [S.head.w1 * 0.25 * s, S.head.w2 * 0.35 * s])), Ink.of(0, 0.03, 0.02, 0), { amp: 0.3 });
    // Cara
    if (faceLod) {
      const e: V = [poll[0] + Math.cos(hd) * 0.12 * s - Math.sin(hd) * 0.03 * s, poll[1] + Math.sin(hd) * 0.12 * s + Math.cos(hd) * 0.03 * s];
      const [ex, ey] = T([...e]);
      d.dot(ex, ey, Math.max(0.6, 0.022 * K * s), KEY);
      const n: V = [muzzle[0] - Math.cos(hd) * 0.04 * s, muzzle[1] - Math.sin(hd) * 0.04 * s];
      const [nx, ny] = T([...n]);
      d.dot(nx, ny, Math.max(0.5, 0.015 * K * s), KEY);
      if (S.kind === 'dog' && p.jaw > 0.2) {
        d.stroke(T([...muzzle, muzzle[0] - Math.cos(hd - 0.5) * 0.08 * s, muzzle[1] - Math.sin(hd - 0.5) * 0.08 * s]), 1, 0.5, KEY);
      }
    }

    // Patas cercanas
    drawLeg(legs[2], false, coat);
    drawLeg(legs[0], true, coat);

    // Recado
    if (L.saddle) {
      const sa = L.saddle;
      const c = R(0.08, S.body[1] * 0.92);
      const blanket = [c[0] - 0.36 * s, c[1] + 0.03 * s, c[0] + 0.3 * s, c[1] + 0.03 * s, c[0] + 0.32 * s, c[1] - 0.32 * s, c[0] - 0.38 * s, c[1] - 0.3 * s];
      shape(blanket, sa.blanket);
      if (detail) d.fill(T([c[0] - 0.37 * s, c[1] - 0.22 * s, c[0] + 0.31 * s, c[1] - 0.24 * s, c[0] + 0.32 * s, c[1] - 0.29 * s, c[0] - 0.38 * s, c[1] - 0.27 * s]), sa.stripe, { amp: 0.3 });
      shape(ellipsePts(c[0] - 0.02 * s, c[1] + 0.08 * s, 0.3 * s, 0.09 * s, 14), sa.pelero);
      if (detail) {
        for (let i = 0; i < 5; i++) d.stroke(T([c[0] - 0.24 * s + i * 0.11 * s, c[1] + 0.02 * s, c[0] - 0.27 * s + i * 0.11 * s, c[1] - 0.04 * s]), 0.5, 0.2, sa.pelero.shade(0.35));
      }
      // Cincha
      d.stroke(T([c[0] - 0.02 * s, c[1] - 0.05 * s, B[0] + 0.02 * s, B[1] - S.body[1] * 0.98 * s]), 1.6, 1.4, Ink.of(0.2, 0.4, 0.1, 0.6), { taper0: 0, taper1: 0 });
    }
    // Riendas
    if (S.kind === 'horse' && detail) {
      const m: V = [muzzle[0] - Math.cos(hd) * 0.08 * s, muzzle[1] - Math.sin(hd) * 0.08 * s];
      d.stroke(T([...m, poll[0] - Math.cos(hd) * 0.04, poll[1] + 0.03]), 0.7, 0.7, Ink.of(0.2, 0.3, 0.05, 0.7), { taper0: 0, taper1: 0 });
      if (this.tie) {
        const [mx, my] = T([...m]);
        const [tx, ty] = iso(this.tie[0], this.tie[1], this.tie[2]);
        const midx = (mx + tx) / 2;
        const midy = (my + ty) / 2 + 6;
        d.stroke([mx, my, midx, midy, tx, ty], 0.8, 0.8, Ink.of(0.2, 0.35, 0.05, 0.75), { taper0: 0, taper1: 0, amp: 0.3 });
      }
    }
    // Jinete
    if (this.rider) {
      const c = R(0.06, S.body[1] * 0.98 + 0.08);
      const [sx, sy] = T([...c]);
      this.rider.face = f;
      this.rider.drawAt(d, w, sx, sy, true);
      if (S.kind === 'horse') {
        const hand = [sx + f * 0.3 * K, sy - 0.25 * K];
        const [mx, my] = T([muzzle[0] - Math.cos(hd) * 0.08 * s, muzzle[1] - Math.sin(hd) * 0.08 * s]);
        d.stroke([hand[0], hand[1], (hand[0] + mx) / 2, (hand[1] + my) / 2 + 3, mx, my], 0.7, 0.7, Ink.of(0.2, 0.3, 0.05, 0.75), { taper0: 0, taper1: 0, amp: 0.3 });
      }
    }
  }
}
