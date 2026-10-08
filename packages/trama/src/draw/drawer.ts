import { PX, ISO_C, ISO_S, iso, groundRadii } from '../core/iso';
import { Ink, KEY } from '../print/ink';
import { Mode, type Op, type Recording } from '../print/separation';
import { ellipsePts, offsetPoly, strokePoly, wobble, type Pts } from './hand';
import { Mesh, Shape } from './mesh';

/** Cuánto puede apartarse una curva aplanada de la verdadera, en px de pantalla. */
const FLAT = 0.3;

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
 * Graba operaciones de tinta (no dibuja): triángulos en px de mundo, listos para la GPU. Las
 * escenas lo usan una vez por variante de temblor para lo fijo, y en cada cuadro de animación
 * para lo que se mueve.
 */
export class Drawer {
  ops: Op[] = [];
  b: number[] = [Infinity, Infinity, -Infinity, -Infinity];
  amp = 0.55;
  step = 7;
  alpha = 1;
  /** Zoom de cámara al grabar: sirve para decidir el nivel de detalle. */
  lod = 1;
  /** Tolerancia del aplanado de curvas, en px de mundo (por defecto, FLAT px de pantalla al zoom lod). */
  tol = FLAT;
  line = 1.1;
  private seed = 1;
  private v = 0;
  private n = 0;
  private mesh = new Mesh();
  /** Subcontornos de la última operación: orientación y rectángulo (de a cinco). */
  private subs: number[] = [];

  begin(seed: number, variant: number, lod = 1): this {
    this.ops = [];
    this.mesh.reset();
    this.b = [Infinity, Infinity, -Infinity, -Infinity];
    this.reseed(seed);
    this.v = variant;
    this.lod = lod;
    this.tol = FLAT / lod;
    return this;
  }

  /** Sigue grabando en lo mismo con otra semilla (varias funciones en una sola grabación). */
  reseed(seed: number): this {
    this.seed = seed | 0;
    this.n = 0;
    this.alpha = 1;
    this.amp = 0.55;
    return this;
  }

  /** Lo grabado desde begin, listo para imprimir. */
  take(): Recording {
    return this.mesh.take(this.ops);
  }

  /** Grabación hecha para verse bien hasta el zoom z (lo fijo se graba una vez para todos). */
  fine(z: number): this {
    this.tol = FLAT / Math.max(z, this.lod);
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
   * Agrega una forma; Fill y Over consecutivos con la misma tinta se juntan en una sola operación.
   * line marca la máscara de línea; axis y width son el eje y el grosor de un trazo.
   * shape: Strip para el polígono de un trazo (se cose como tira); inner: el relleno que
   * rodea este contorno (entonces solo se graba el anillo, porque el relleno lo tapa).
   */
  push(m: Mode, pts: Pts, ink: Ink, smooth = true, line = false, axis?: Pts, width = 0, shape: Shape = Shape.Fill, inner?: Pts): void {
    if (pts.length < 6) return;
    this.grow(pts);
    const mesh = this.mesh;
    let op = this.ops[this.ops.length - 1];
    if (!(op && op.m === m && op.i === ink && op.a === this.alpha && op.l === line && (m === Mode.Fill || m === Mode.Over) && this.alpha === 1)) {
      op = { m, i: ink, a: this.alpha, l: line, u: false, v0: mesh.nv, v1: 0, t0: mesh.ni, t1: 0, s0: mesh.ns, s1: 0 };
      this.ops.push(op);
      this.subs.length = 0;
    }
    if (this.overlaps(pts)) op.u = true;
    if (inner) mesh.ring(pts, inner, smooth, this.tol);
    else mesh.fill(pts, smooth, this.tol, shape);
    if (axis) mesh.axis(axis, width);
    op.v1 = mesh.nv;
    op.t1 = mesh.ni;
    op.s1 = mesh.ns;
  }

  /**
   * Contornos juntados en una operación: si uno pisa a otro con la orientación contraria, el
   * lienzo 2D (regla distinta de cero) dejaba sin pintar lo que se superpone. Esa operación
   * se imprime contando vueltas, para que quede igual.
   */
  private overlaps(pts: Pts): boolean {
    let a = 0;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const n = pts.length >> 1;
    for (let i = 0; i < n; i++) {
      const j = i + 1 < n ? i + 1 : 0;
      a += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1];
      x0 = Math.min(x0, pts[2 * i]);
      x1 = Math.max(x1, pts[2 * i]);
      y0 = Math.min(y0, pts[2 * i + 1]);
      y1 = Math.max(y1, pts[2 * i + 1]);
    }
    const sg = a >= 0 ? 1 : -1;
    const S = this.subs;
    let hit = false;
    for (let k = 0; k < S.length && !hit; k += 5) {
      if (S[k] !== sg && S[k + 1] < x1 && x0 < S[k + 3] && S[k + 2] < y1 && y0 < S[k + 4]) hit = true;
    }
    S.push(sg, x0, y0, x1, y1);
    return hit;
  }

  /** Varias regiones con una sola tinta, rellenas como un solo contorno (sin temblor ni suavizado). */
  union(regions: Pts[], ink: Ink, m: Mode = Mode.Add): void {
    const mesh = this.mesh;
    const op: Op = { m, i: ink, a: this.alpha, l: false, u: true, v0: mesh.nv, v1: 0, t0: mesh.ni, t1: 0, s0: mesh.ns, s1: 0 };
    for (const r of regions) {
      if (r.length < 6) continue;
      this.grow(r);
      mesh.fill(r, false, this.tol);
    }
    op.v1 = mesh.nv;
    op.t1 = mesh.ni;
    op.s1 = mesh.ns;
    this.ops.push(op);
  }

  fill(pts: Pts, ink: Ink, o: FillOpts = {}): void {
    const seed = this.s();
    const amp = o.amp ?? this.amp;
    const w = amp > 0 ? wobble(pts, true, amp, seed, o.step ?? this.step) : pts;
    const mode = o.mode ?? Mode.Fill;
    const smooth = o.smooth ?? true;
    if (o.outline) {
      const oi = o.outlineInk ?? KEY;
      // Si el relleno cala y es opaco, del contorno alcanza con el anillo.
      const ring = mode === Mode.Fill && this.alpha === 1 ? w : undefined;
      this.push(Mode.Fill, offsetPoly(w, o.outline, seed), oi, smooth, oi.isLine, undefined, 0, Shape.Fill, ring);
    }
    this.push(mode, w, ink, smooth);
  }

  /** Solo el contorno expandido (para dibujar varios rellenos que comparten silueta). */
  outline(pts: Pts, width: number, ink: Ink = KEY, amp?: number): void {
    const seed = this.s();
    const a = amp ?? this.amp;
    const w = a > 0 ? wobble(pts, true, a, seed, this.step) : pts;
    this.push(Mode.Fill, offsetPoly(w, width, seed), ink, true, ink.isLine);
  }

  stroke(pts: Pts, w0: number, w1: number = w0, ink: Ink = KEY, o: StrokeOpts = {}): void {
    const seed = this.s();
    const amp = o.amp ?? this.amp;
    let c = pts;
    if (o.closed) c = pts.concat(pts[0], pts[1]);
    c = amp > 0 ? wobble(c, false, amp, seed, o.step ?? this.step) : c;
    const poly = strokePoly(c, w0, w1, o.taper0 ?? 0.2, o.taper1 ?? 0.2, seed, o.jitter ?? 0.35);
    this.push(o.mode ?? Mode.Over, poly, ink, true, ink.isLine, c, Math.max(w0, w1), Shape.Strip);
  }

  dot(x: number, y: number, r: number, ink: Ink, mode: Mode = Mode.Fill): void {
    this.push(mode, ellipsePts(x, y, r, r, r > 3 ? 10 : 6), ink);
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
