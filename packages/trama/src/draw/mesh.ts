import type { Op, Recording } from '../print/separation';
import type { Pts } from './hand';

/** Grabación vacía (pieza oculta o todavía sin grabar). */
export const EMPTY: Recording = { pos: new Float32Array(0), idx: new Uint32Array(0), seg: new Float32Array(0), ops: [] };

/** Formas de un contorno: relleno general, trazo (lado izquierdo y derecho) o anillo de contorno. */
export const Shape = { Fill: 0, Strip: 1 } as const;
export type Shape = (typeof Shape)[keyof typeof Shape];

/** Contornos que no se pudieron triangular del todo (para medir). */
export const meshStats = { failed: 0 };

/**
 * Lo que antes rasterizaba el lienzo 2D, convertido en triángulos para la GPU. Los contornos
 * se suavizan como los trazaba Path2D (cuadráticas por los puntos medios) y se aplanan con
 * una tolerancia en px de mundo; después se triangulan según su forma.
 */
export class Mesh {
  pos = new Float32Array(1 << 14);
  idx = new Uint32Array(1 << 15);
  seg = new Float32Array(1 << 12);
  nv = 0;
  ni = 0;
  ns = 0;
  private sa: number[] = [];
  private sb: number[] = [];
  private ks: number[] = [];

  reset(): void {
    this.nv = this.ni = this.ns = 0;
  }

  take(ops: Op[]): Recording {
    // Como antes con Path2D: si un trazo de la operación queda fino, se repasan todos sus ejes.
    for (const op of ops) {
      let w = Infinity;
      for (let q = op.s0; q < op.s1; q++) w = Math.min(w, this.seg[q * 5 + 4]);
      for (let q = op.s0; q < op.s1; q++) this.seg[q * 5 + 4] = w;
    }
    return { pos: this.pos.slice(0, this.nv * 2), idx: this.idx.slice(0, this.ni), seg: this.seg.slice(0, this.ns * 5), ops };
  }

  private vert(x: number, y: number): number {
    if (this.nv * 2 + 2 > this.pos.length) this.pos = grow(this.pos);
    this.pos[this.nv * 2] = x;
    this.pos[this.nv * 2 + 1] = y;
    return this.nv++;
  }

  private tri(a: number, b: number, c: number): void {
    if (this.ni + 3 > this.idx.length) this.idx = grow(this.idx);
    this.idx[this.ni++] = a;
    this.idx[this.ni++] = b;
    this.idx[this.ni++] = c;
  }

  /** Eje de un trazo: segmentos con el grosor nominal (para no dejarlo más fino que 1 px). */
  axis(pts: Pts, w: number): void {
    const n = pts.length >> 1;
    while ((this.ns + n) * 5 > this.seg.length) this.seg = grow(this.seg);
    for (let i = 0; i + 1 < n; i++) {
      const o = this.ns * 5;
      this.seg[o] = pts[2 * i];
      this.seg[o + 1] = pts[2 * i + 1];
      this.seg[o + 2] = pts[2 * i + 2];
      this.seg[o + 3] = pts[2 * i + 3];
      this.seg[o + 4] = w;
      this.ns++;
    }
  }

  /** Contorno cerrado relleno (regla distinta de cero, como fill() del lienzo). */
  fill(pts: Pts, smooth: boolean, tol: number, shape: Shape = Shape.Fill): void {
    if (pts.length < 6) return;
    const P = smooth ? flatten(pts, tol, this.sa, this.ks, shape === Shape.Strip) : pts;
    const m = P.length >> 1;
    const base = this.nv;
    for (let i = 0; i < m; i++) this.vert(P[2 * i], P[2 * i + 1]);
    if (shape === Shape.Strip && m % 2 === 0) this.strip(base, m);
    else this.poly(P, m, base);
  }

  /**
   * Contorno de tinta clave alrededor de un relleno calado: solo el anillo entre el relleno y
   * su expansión (lo de adentro lo tapa el relleno, que va justo después).
   */
  ring(outer: Pts, inner: Pts, smooth: boolean, tol: number): void {
    const n = outer.length >> 1;
    if (n < 3 || inner.length !== outer.length) return this.fill(outer, smooth, tol);
    let O = outer;
    let I = inner;
    if (smooth) {
      O = flatten(outer, tol, this.sa, this.ks, false);
      I = flatten(inner, tol, this.sb, this.ks, false, true);
    }
    const m = O.length >> 1;
    const bo = this.nv;
    for (let i = 0; i < m; i++) this.vert(O[2 * i], O[2 * i + 1]);
    const bi = this.nv;
    for (let i = 0; i < m; i++) this.vert(I[2 * i], I[2 * i + 1]);
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      this.tri(bo + i, bo + j, bi + i);
      this.tri(bo + j, bi + j, bi + i);
    }
  }

  /** Trazo: el polígono es el lado izquierdo y después el derecho al revés; se cose como tira. */
  private strip(base: number, m: number): void {
    const h = m >> 1;
    for (let j = 0; j + 1 < h; j++) {
      this.tri(base + j, base + j + 1, base + m - 1 - j);
      this.tri(base + j + 1, base + m - 2 - j, base + m - 1 - j);
    }
  }

  /** Polígono general: abanico si es estrellado desde su centroide; si no, recorte de orejas. */
  private poly(P: Pts, m: number, base: number): void {
    let a2 = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < m; i++) {
      const j = i + 1 < m ? i + 1 : 0;
      const c = P[2 * i] * P[2 * j + 1] - P[2 * j] * P[2 * i + 1];
      a2 += c;
      cx += (P[2 * i] + P[2 * j]) * c;
      cy += (P[2 * i + 1] + P[2 * j + 1]) * c;
    }
    if (Math.abs(a2) < 1e-9) return;
    cx /= 3 * a2;
    cy /= 3 * a2;
    const sg = a2 > 0 ? 1 : -1;
    const eps = -1e-6 * Math.abs(a2);
    let star = true;
    for (let i = 0; i < m && star; i++) {
      const j = i + 1 < m ? i + 1 : 0;
      if (((P[2 * i] - cx) * (P[2 * j + 1] - cy) - (P[2 * j] - cx) * (P[2 * i + 1] - cy)) * sg < eps) star = false;
    }
    if (star) {
      const c = this.vert(cx, cy);
      for (let i = 0; i < m; i++) this.tri(c, base + i, base + (i + 1 < m ? i + 1 : 0));
      return;
    }
    const ids: number[] = [];
    for (let i = 0; i < m; i++) ids.push(i);
    earclip(P, ids, sg, (a, b, c) => this.tri(base + a, base + b, base + c), 0);
  }
}

function grow<T extends Float32Array | Uint32Array>(a: T): T {
  const b = new (a.constructor as { new (n: number): T })(a.length * 2);
  b.set(a);
  return b;
}

/**
 * Suaviza un contorno cerrado como tracePath (de punto medio a punto medio, con cada vértice
 * de control) y lo aplana: cada curva se parte en k tramos según cuánto se aparta de su cuerda.
 * sym: los vértices i y n-1-i usan el mismo k (los dos lados de un trazo quedan alineados).
 * reuse: usa los k de la llamada anterior (un contorno paralelo, como el anillo de un relleno).
 */
function flatten(src: Pts, tol: number, out: number[], ks: number[], sym: boolean, reuse = false): number[] {
  const n = src.length >> 1;
  out.length = 0;
  if (!reuse) {
    ks.length = n;
    for (let i = 0; i < n; i++) {
      const h = i > 0 ? i - 1 : n - 1;
      const j = i + 1 < n ? i + 1 : 0;
      // La curva se aparta de la cuerda |s - 2c + e| / 4, con s y e los puntos medios.
      const dx = (src[2 * h] + src[2 * j]) / 2 - src[2 * i];
      const dy = (src[2 * h + 1] + src[2 * j + 1]) / 2 - src[2 * i + 1];
      const dev = Math.hypot(dx, dy) / 4;
      ks[i] = Math.min(8, Math.max(1, Math.ceil(Math.sqrt(dev / tol))));
    }
    if (sym) for (let i = 0; i < n >> 1; i++) ks[i] = ks[n - 1 - i] = Math.max(ks[i], ks[n - 1 - i]);
  }
  for (let i = 0; i < n; i++) {
    const h = i > 0 ? i - 1 : n - 1;
    const j = i + 1 < n ? i + 1 : 0;
    const sx = (src[2 * h] + src[2 * i]) / 2;
    const sy = (src[2 * h + 1] + src[2 * i + 1]) / 2;
    const ex = (src[2 * i] + src[2 * j]) / 2;
    const ey = (src[2 * i + 1] + src[2 * j + 1]) / 2;
    const k = ks[i];
    for (let q = 0; q < k; q++) {
      const t = q / k;
      const u = 1 - t;
      out.push(u * u * sx + 2 * u * t * src[2 * i] + t * t * ex, u * u * sy + 2 * u * t * src[2 * i + 1] + t * t * ey);
    }
  }
  return out;
}

/**
 * Recorte de orejas sobre los vértices ids de P (sg = orientación del polígono). Si se traba
 * (contornos que se cruzan), primero cura los cruces locales y después parte el polígono por
 * una diagonal válida; si ni así, deja lo que falta sin rellenar.
 */
function earclip(P: Pts, ids: number[], sg: number, tri: (a: number, b: number, c: number) => void, depth: number): void {
  let n = ids.length;
  const nx = new Int32Array(n);
  const pv = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    nx[i] = i + 1 < n ? i + 1 : 0;
    pv[i] = i > 0 ? i - 1 : n - 1;
  }
  const X = (k: number) => P[2 * ids[k]];
  const Y = (k: number) => P[2 * ids[k] + 1];
  const area = (a: number, b: number, c: number) => ((X(b) - X(a)) * (Y(c) - Y(a)) - (Y(b) - Y(a)) * (X(c) - X(a))) * sg;
  const same = (a: number, b: number) => X(a) === X(b) && Y(a) === Y(b);
  const remove = (k: number) => {
    nx[pv[k]] = nx[k];
    pv[nx[k]] = pv[k];
    n--;
  };
  const inside = (a: number, b: number) =>
    area(pv[a], a, nx[a]) > 0 ? area(a, nx[a], b) >= 0 && area(a, b, pv[a]) >= 0 : area(a, b, pv[a]) > 0 || area(a, nx[a], b) > 0;
  const sign = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const cross = (p1: number, q1: number, p2: number, q2: number) =>
    sign(area(p1, q1, p2)) !== sign(area(p1, q1, q2)) && sign(area(p2, q2, p1)) !== sign(area(p2, q2, q1));
  const isEar = (a: number, b: number, c: number) => {
    for (let p = nx[c]; p !== a; p = nx[p]) {
      if (same(p, a) || same(p, b) || same(p, c)) continue;
      if (area(a, b, p) >= 0 && area(b, c, p) >= 0 && area(c, a, p) >= 0) return false;
    }
    return true;
  };

  let ear = 0;
  let stop = 0;
  let pass = 0;
  while (n > 3) {
    const a = pv[ear];
    const c = nx[ear];
    const ar = area(a, ear, c);
    if (ar === 0 || (ar > 0 && isEar(a, ear, c))) {
      // Un vértice alineado o en punta no encierra nada: se saca sin triángulo.
      if (ar > 0) tri(ids[a], ids[ear], ids[c]);
      remove(ear);
      ear = stop = nx[c];
      pass = 0;
      continue;
    }
    ear = c;
    if (ear !== stop) continue;
    if (pass === 0) {
      // Cruces locales: a-p-q-b con a-p cruzando q-b; se corta el triángulo a-p-b.
      let p = ear;
      do {
        const q = nx[p];
        const pa = pv[p];
        const b = nx[q];
        if (n > 3 && !same(pa, b) && cross(pa, p, q, b) && inside(pa, b) && inside(b, pa)) {
          tri(ids[pa], ids[p], ids[b]);
          remove(p);
          remove(q);
          p = ear = stop = b;
        }
        p = nx[p];
      } while (p !== ear && n > 3);
      pass = 1;
      stop = ear;
      continue;
    }
    // Partir por una diagonal que no corte ningún lado.
    if (depth < 8) {
      let a0 = ear;
      do {
        for (let b0 = nx[nx[a0]]; b0 !== pv[a0]; b0 = nx[b0]) {
          if (same(a0, b0) || !inside(a0, b0) || !inside(b0, a0)) continue;
          let ok = true;
          let e = a0;
          do {
            const f = nx[e];
            if (e !== a0 && f !== a0 && e !== b0 && f !== b0 && cross(e, f, a0, b0)) ok = false;
            e = f;
          } while (ok && e !== a0);
          if (!ok) continue;
          const left: number[] = [];
          const right: number[] = [];
          for (let k = a0; ; k = nx[k]) {
            left.push(ids[k]);
            if (k === b0) break;
          }
          for (let k = b0; ; k = nx[k]) {
            right.push(ids[k]);
            if (k === a0) break;
          }
          earclip(P, left, sg, tri, depth + 1);
          earclip(P, right, sg, tri, depth + 1);
          return;
        }
        a0 = nx[a0];
      } while (a0 !== ear);
    }
    meshStats.failed++;
    return;
  }
  if (n === 3 && area(pv[ear], ear, nx[ear]) > 0) tri(ids[pv[ear]], ids[ear], ids[nx[ear]]);
}
