import { PX, ISO_C, ISO_S, iso, groundRadii } from '../core/iso';
import { Ink, KEY } from '../print/ink';
import { Mode, type Op } from '../print/separation';
import { ellipsePts, offsetPoly, strokePoly, tracePath, wobble, type Pts } from './hand';

export interface FillOpts {
  mode?: Mode;
  /** Amplitud del temblor en px de mundo (0 = recto). */
  amp?: number;
  step?: number;
  /** Grosor del contorno de tinta clave (0 = sin contorno). */
  outline?: number;
  outlineInk?: Ink;
  smooth?: boolean;
}

export interface StrokeOpts {
  mode?: Mode;
  amp?: number;
  step?: number;
  taper0?: number;
  taper1?: number;
  jitter?: number;
  closed?: boolean;
}

/** Material de un volumen isométrico: tinta de la tapa, cara izquierda y derecha. */
export interface Material {
  top: Ink;
  left: Ink;
  right: Ink;
  /** Grosor de las aristas (0 = sin aristas). */
  line?: number;
}

/**
 * Graba operaciones de tinta (no dibuja). Las escenas lo usan una vez por variante de
 * temblor para lo fijo, y en cada cuadro de animación para lo que se mueve.
 */
export class Drawer {
  ops: Op[] = [];
  b: number[] = [Infinity, Infinity, -Infinity, -Infinity];
  amp = 0.55;
  step = 7;
  alpha = 1;
  /** Zoom de cámara al grabar: sirve para decidir el nivel de detalle. */
  lod = 1;
  line = 1.1;
  private seed = 1;
  private v = 0;
  private n = 0;

  begin(seed: number, variant: number, lod = 1): this {
    this.ops = [];
    this.b = [Infinity, Infinity, -Infinity, -Infinity];
    this.seed = seed | 0;
    this.v = variant;
    this.n = 0;
    this.lod = lod;
    this.alpha = 1;
    this.amp = 0.55;
    return this;
  }

  get variant(): number {
    return this.v;
  }

  /** Semilla estable por primitiva y por variante de temblor. */
  private s(): number {
    this.n++;
    return (Math.imul(this.seed, 0x9e3779b1) ^ Math.imul(this.n, 0x85ebca77) ^ Math.imul(this.v + 1, 0xc2b2ae3d)) >>> 8;
  }

  /** Valor pseudoaleatorio estable entre variantes (no tiembla). */
  fixed(i: number): number {
    const x = Math.imul(this.seed ^ Math.imul(i + 1, 0x27d4eb2d), 0x165667b1);
    return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
  }

  private grow(pts: Pts): void {
    const b = this.b;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i];
      const y = pts[i + 1];
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
    }
  }

  /**
   * Agrega una forma; Fill y Over consecutivos con la misma tinta se juntan en un solo Path2D.
   * line marca la máscara de línea; axis y width son el eje y el grosor de un trazo.
   */
  push(m: Mode, pts: Pts, ink: Ink, closed = true, smooth = true, line = false, axis?: Pts, width = 0): void {
    if (pts.length < 4) return;
    this.grow(pts);
    const last = this.ops[this.ops.length - 1];
    if (last && last.m === m && last.i === ink && last.a === this.alpha && !!last.l === line && (m === Mode.Fill || m === Mode.Over)) {
      tracePath(last.p, pts, closed, smooth);
      if (axis) {
        if (!last.c) last.c = new Path2D();
        tracePath(last.c, axis, false, true);
        last.w = Math.min(last.w ?? Infinity, width);
      }
      return;
    }
    const p = new Path2D();
    tracePath(p, pts, closed, smooth);
    const op: Op = { m, p, i: ink, a: this.alpha };
    if (line) op.l = true;
    if (axis) {
      op.c = new Path2D();
      tracePath(op.c, axis, false, true);
      op.w = width;
    }
    this.ops.push(op);
  }

  fill(pts: Pts, ink: Ink, o: FillOpts = {}): void {
    const seed = this.s();
    const amp = o.amp ?? this.amp;
    const w = amp > 0 ? wobble(pts, true, amp, seed, o.step ?? this.step) : pts;
    if (o.outline) {
      const oi = o.outlineInk ?? KEY;
      this.push(Mode.Fill, offsetPoly(w, o.outline, seed), oi, true, o.smooth ?? true, oi.isLine);
    }
    this.push(o.mode ?? Mode.Fill, w, ink, true, o.smooth ?? true);
  }

  /** Solo el contorno expandido (para dibujar varios rellenos que comparten silueta). */
  outline(pts: Pts, width: number, ink: Ink = KEY, amp?: number): void {
    const seed = this.s();
    const a = amp ?? this.amp;
    const w = a > 0 ? wobble(pts, true, a, seed, this.step) : pts;
    this.push(Mode.Fill, offsetPoly(w, width, seed), ink, true, true, ink.isLine);
  }

  stroke(pts: Pts, w0: number, w1: number = w0, ink: Ink = KEY, o: StrokeOpts = {}): void {
    const seed = this.s();
    const amp = o.amp ?? this.amp;
    let c = pts;
    if (o.closed) c = pts.concat(pts[0], pts[1]);
    c = amp > 0 ? wobble(c, false, amp, seed, o.step ?? this.step) : c;
    const poly = strokePoly(c, w0, w1, o.taper0 ?? 0.2, o.taper1 ?? 0.2, seed, o.jitter ?? 0.35);
    this.push(o.mode ?? Mode.Over, poly, ink, true, true, ink.isLine, c, Math.max(w0, w1));
  }

  dot(x: number, y: number, r: number, ink: Ink, mode: Mode = Mode.Fill): void {
    this.push(mode, ellipsePts(x, y, r, r, r > 3 ? 10 : 6), ink, true, true);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, ink: Ink, o: FillOpts = {}, rot = 0): void {
    const n = Math.max(10, Math.min(28, Math.round((rx + ry) * 0.5)));
    this.fill(ellipsePts(cx, cy, rx, ry, n, rot), ink, o);
  }

  // ——— Ayudantes isométricos (coordenadas en metros) ———

  /** Proyecta una lista de tripletes x,y,z a puntos planos. */
  P(xyz: number[]): Pts {
    const out: Pts = [];
    for (let i = 0; i < xyz.length; i += 3) {
      out.push((xyz[i] - xyz[i + 1]) * ISO_C * PX, ((xyz[i] + xyz[i + 1]) * ISO_S - xyz[i + 2]) * PX);
    }
    return out;
  }

  quad(xyz: number[], ink: Ink, o: FillOpts = {}): void {
    this.fill(this.P(xyz), ink, o);
  }

  line3(xyz: number[], w0: number, w1: number = w0, ink: Ink = KEY, o: StrokeOpts = {}): void {
    this.stroke(this.P(xyz), w0, w1, ink, o);
  }

  /** Caja isométrica con sus tres caras visibles y aristas dibujadas. */
  box(x: number, y: number, z: number, w: number, d: number, h: number, m: Material, o: { amp?: number; edges?: boolean } = {}): void {
    const amp = o.amp ?? this.amp * 0.7;
    const X = x + w;
    const Y = y + d;
    const Z = z + h;
    if (h > 0) {
      this.quad([x, Y, z, X, Y, z, X, Y, Z, x, Y, Z], m.left, { amp });
      this.quad([X, y, z, X, Y, z, X, Y, Z, X, y, Z], m.right, { amp });
    }
    this.quad([x, y, Z, X, y, Z, X, Y, Z, x, Y, Z], m.top, { amp });
    const lw = m.line ?? this.line;
    if (lw > 0 && o.edges !== false) {
      const e = (a: number[]) => this.line3(a, lw, lw * 0.8, KEY, { taper0: 0.08, taper1: 0.12 });
      e([x, y, Z, X, y, Z]);
      e([x, y, Z, x, Y, Z]);
      e([x, Y, Z, X, Y, Z]);
      e([X, y, Z, X, Y, Z]);
      if (h > 0) {
        e([X, Y, Z, X, Y, z]);
        e([x, Y, Z, x, Y, z]);
        e([X, y, Z, X, y, z]);
        e([x, Y, z, X, Y, z]);
        e([X, Y, z, X, y, z]);
      }
    }
  }

  /**
   * Superficie de revolución vertical (barriles, postes, botellas, damajuanas).
   * profile: pares [radio, altura] de abajo hacia arriba.
   */
  lathe(x: number, y: number, z: number, profile: number[], m: Material, o: { cap?: boolean; edges?: boolean; amp?: number } = {}): void {
    const n = profile.length >> 1;
    const at = (r: number, h: number, th: number): [number, number] => {
      const px = x + Math.cos(th) * r;
      const py = y + Math.sin(th) * r;
      return iso(px, py, z + h);
    };
    const L = (3 * Math.PI) / 4;
    const F = Math.PI / 4;
    const R = -Math.PI / 4;
    const arc = (r: number, h: number, a0: number, a1: number, k = 6): Pts => {
      const out: Pts = [];
      for (let i = 0; i <= k; i++) out.push(...at(r, h, a0 + ((a1 - a0) * i) / k));
      return out;
    };
    const amp = o.amp ?? this.amp * 0.6;
    // Silueta completa (cara izquierda)
    const side: Pts = [];
    side.push(...arc(profile[0], profile[1], R, L));
    for (let i = 0; i < n; i++) side.push(...at(profile[2 * i], profile[2 * i + 1], L));
    for (let i = n - 1; i >= 0; i--) side.push(...at(profile[2 * i], profile[2 * i + 1], R));
    this.fill(side, m.left, { amp });
    // Mitad derecha en sombra
    const right: Pts = [];
    for (let i = 0; i < n; i++) right.push(...at(profile[2 * i], profile[2 * i + 1], F));
    for (let i = n - 1; i >= 0; i--) right.push(...at(profile[2 * i], profile[2 * i + 1], R));
    right.push(...arc(profile[0], profile[1], R, F, 3));
    this.fill(right, m.right, { amp });
    const rt = profile[2 * n - 2];
    const ht = profile[2 * n - 1];
    if (o.cap !== false && rt > 0.005) {
      const [cx, cy] = iso(x, y, z + ht);
      const [rx, ry] = groundRadii(rt);
      this.ellipse(cx, cy, rx, ry, m.top, { amp });
    }
    const lw = m.line ?? this.line;
    if (lw > 0 && o.edges !== false) {
      const sl: Pts = [];
      const sr: Pts = [];
      for (let i = 0; i < n; i++) {
        sl.push(...at(profile[2 * i], profile[2 * i + 1], L));
        sr.push(...at(profile[2 * i], profile[2 * i + 1], R));
      }
      this.stroke(sl, lw, lw * 0.7, KEY, { taper0: 0.05, taper1: 0.15 });
      this.stroke(sr, lw, lw * 0.7, KEY, { taper0: 0.05, taper1: 0.15 });
      this.stroke(arc(profile[0], profile[1], R, L, 8), lw, lw, KEY, { taper0: 0.1, taper1: 0.1 });
      if (o.cap !== false && rt > 0.005) this.stroke(arc(rt, ht, 0, Math.PI * 2, 14), lw * 0.8, lw * 0.8, KEY, { taper0: 0, taper1: 0 });
    }
  }

  /** Aro horizontal sobre una superficie de revolución (zunchos de barril, etc.). */
  ring(x: number, y: number, z: number, r: number, w: number, ink: Ink = KEY): void {
    const pts: Pts = [];
    for (let i = 0; i <= 8; i++) {
      const th = -Math.PI / 4 + (Math.PI * i) / 8;
      pts.push(...iso(x + Math.cos(th) * r, y + Math.sin(th) * r, z));
    }
    this.stroke(pts, w, w, ink, { taper0: 0.12, taper1: 0.12 });
  }

  /** Círculo apoyado en un plano horizontal. */
  disc(x: number, y: number, z: number, r: number, ink: Ink, o: FillOpts = {}): void {
    const [cx, cy] = iso(x, y, z);
    const [rx, ry] = groundRadii(r);
    this.ellipse(cx, cy, rx, ry, ink, o);
  }
}
