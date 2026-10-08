import { len } from '../core/math';
import { vnoise1 } from '../core/rng';

/** Puntos planos [x0, y0, x1, y1, ...] en px de mundo. */
export type Pts = number[];

/** Subdivide y desplaza en perpendicular con ruido suave: el pulso de una mano. */
export function wobble(src: Pts, closed: boolean, amp: number, seed: number, step: number): Pts {
  const n = src.length >> 1;
  if (n < 2 || amp <= 0) return src;
  const out: Pts = [];
  const segs = closed ? n : n - 1;
  const freq = 1 / Math.max(step * 2.4, 4);
  const phase = (seed % 9973) * 0.731;
  let s = 0;
  let nx = 0;
  let ny = 0;
  for (let i = 0; i < segs; i++) {
    const ax = src[2 * i];
    const ay = src[2 * i + 1];
    const j = (i + 1) % n;
    const dx = src[2 * j] - ax;
    const dy = src[2 * j + 1] - ay;
    const L = len(dx, dy) || 1e-6;
    nx = -dy / L;
    ny = dx / L;
    const k = Math.max(1, Math.ceil(L / step));
    for (let q = 0; q < k; q++) {
      const t = q / k;
      const d = amp * vnoise1(s * freq + phase, seed);
      out.push(ax + dx * t + nx * d, ay + dy * t + ny * d);
      s += L / k;
    }
  }
  if (!closed) {
    const d = amp * vnoise1(s * freq + phase, seed);
    out.push(src[2 * n - 2] + nx * d, src[2 * n - 1] + ny * d);
  }
  return out;
}

export function tracePath(p: Path2D, pts: Pts, closed: boolean, smooth: boolean): void {
  const n = pts.length >> 1;
  if (n < 2) return;
  if (!smooth || n < 3) {
    p.moveTo(pts[0], pts[1]);
    for (let i = 1; i < n; i++) p.lineTo(pts[2 * i], pts[2 * i + 1]);
    if (closed) p.closePath();
    return;
  }
  if (closed) {
    p.moveTo((pts[2 * n - 2] + pts[0]) / 2, (pts[2 * n - 1] + pts[1]) / 2);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      p.quadraticCurveTo(pts[2 * i], pts[2 * i + 1], (pts[2 * i] + pts[2 * j]) / 2, (pts[2 * i + 1] + pts[2 * j + 1]) / 2);
    }
    p.closePath();
  } else {
    p.moveTo(pts[0], pts[1]);
    for (let i = 1; i < n - 1; i++) {
      p.quadraticCurveTo(pts[2 * i], pts[2 * i + 1], (pts[2 * i] + pts[2 * i + 2]) / 2, (pts[2 * i + 1] + pts[2 * i + 3]) / 2);
    }
    p.lineTo(pts[2 * n - 2], pts[2 * n - 1]);
  }
}

/**
 * Convierte una línea central en un polígono con grosor variable que se afina en las
 * puntas (t0/t1 = fracción del largo que ocupa cada afinado; 0 = sin afinar).
 */
export function strokePoly(c: Pts, w0: number, w1: number, t0: number, t1: number, seed: number, jit: number): Pts {
  const n = c.length >> 1;
  if (n < 2) return [];
  const acc = new Float64Array(n);
  for (let i = 1; i < n; i++) acc[i] = acc[i - 1] + len(c[2 * i] - c[2 * i - 2], c[2 * i + 1] - c[2 * i - 1]);
  const L = acc[n - 1] || 1e-6;
  const left: Pts = [];
  const right: Pts = [];
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n - 1, i + 1);
    let tx = c[2 * i1] - c[2 * i0];
    let ty = c[2 * i1 + 1] - c[2 * i0 + 1];
    const tl = len(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const t = acc[i] / L;
    let w = w0 + (w1 - w0) * t;
    let f = 1;
    if (t0 > 0) f = Math.min(f, t / t0);
    if (t1 > 0) f = Math.min(f, (1 - t) / t1);
    w *= Math.sqrt(Math.max(0, f)) * (1 + jit * vnoise1(acc[i] * 0.09, seed + 7));
    const hw = Math.max(0.04, w * 0.5);
    left.push(c[2 * i] - ty * hw, c[2 * i + 1] + tx * hw);
    right.push(c[2 * i] + ty * hw, c[2 * i + 1] - tx * hw);
  }
  for (let i = n - 1; i >= 0; i--) left.push(right[2 * i], right[2 * i + 1]);
  return left;
}

/** Expande un polígono hacia afuera con grosor irregular (para contornos de tinta clave). */
export function offsetPoly(p: Pts, w: number, seed: number, jit = 0.45): Pts {
  const n = p.length >> 1;
  if (n < 3) return p;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1];
  }
  const sg = area > 0 ? 1 : -1;
  const out: Pts = new Array(p.length);
  for (let i = 0; i < n; i++) {
    const h = (i + n - 1) % n;
    const j = (i + 1) % n;
    let ax = p[2 * i] - p[2 * h];
    let ay = p[2 * i + 1] - p[2 * h + 1];
    let bx = p[2 * j] - p[2 * i];
    let by = p[2 * j + 1] - p[2 * i + 1];
    const la = len(ax, ay) || 1;
    const lb = len(bx, by) || 1;
    ax /= la;
    ay /= la;
    bx /= lb;
    by /= lb;
    const n1x = ay * sg;
    const n1y = -ax * sg;
    const n2x = by * sg;
    const n2y = -bx * sg;
    let mx = n1x + n2x;
    let my = n1y + n2y;
    const ml = len(mx, my);
    if (ml < 1e-6) {
      mx = n1x;
      my = n1y;
    } else {
      mx /= ml;
      my /= ml;
    }
    const cosHalf = Math.max(0.4, mx * n1x + my * n1y);
    const ww = (w * (1 + jit * vnoise1(i * 0.37, seed))) / cosHalf;
    out[2 * i] = p[2 * i] + mx * ww;
    out[2 * i + 1] = p[2 * i + 1] + my * ww;
  }
  return out;
}

export function ellipsePts(cx: number, cy: number, rx: number, ry: number, n = 16, rot = 0): Pts {
  const out: Pts = [];
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    out.push(cx + x * cr - y * sr, cy + x * sr + y * cr);
  }
  return out;
}

/** Envolvente convexa (cadena monótona) de puntos planos. */
export function hull(pts: Pts): Pts {
  const n = pts.length >> 1;
  if (n < 3) return pts.slice();
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => pts[2 * a] - pts[2 * b] || pts[2 * a + 1] - pts[2 * b + 1]);
  const cross = (o: number, a: number, b: number) =>
    (pts[2 * a] - pts[2 * o]) * (pts[2 * b + 1] - pts[2 * o + 1]) - (pts[2 * a + 1] - pts[2 * o + 1]) * (pts[2 * b] - pts[2 * o]);
  const lower: number[] = [];
  for (const i of idx) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], i) <= 0) lower.pop();
    lower.push(i);
  }
  const upper: number[] = [];
  for (let k = idx.length - 1; k >= 0; k--) {
    const i = idx[k];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], i) <= 0) upper.pop();
    upper.push(i);
  }
  lower.pop();
  upper.pop();
  const out: Pts = [];
  for (const i of lower.concat(upper)) out.push(pts[2 * i], pts[2 * i + 1]);
  return out;
}

/**
 * Polígono de un miembro: cadena de articulaciones con anchos por punto y puntas redondas.
 */
export function limbPoly(c: Pts, w: number[], cap0 = true, cap1 = true): Pts {
  const n = c.length >> 1;
  const L: Pts = [];
  const R: Pts = [];
  let an0 = 0;
  let an1 = 0;
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n - 1, i + 1);
    let tx = c[2 * i1] - c[2 * i0];
    let ty = c[2 * i1 + 1] - c[2 * i0 + 1];
    const tl = len(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const nx = -ty;
    const ny = tx;
    const hw = w[i] * 0.5;
    L.push(c[2 * i] + nx * hw, c[2 * i + 1] + ny * hw);
    R.push(c[2 * i] - nx * hw, c[2 * i + 1] - ny * hw);
    if (i === 0) an0 = Math.atan2(ny, nx);
    if (i === n - 1) an1 = Math.atan2(ny, nx);
  }
  const out: Pts = [];
  if (cap0) {
    const r = w[0] * 0.5;
    for (let j = 0; j <= 4; j++) {
      const a = an0 + Math.PI * (1 - j / 4);
      out.push(c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r);
    }
  } else out.push(R[0], R[1], L[0], L[1]);
  for (let i = 1; i < n; i++) out.push(L[2 * i], L[2 * i + 1]);
  if (cap1) {
    const r = w[n - 1] * 0.5;
    for (let j = 1; j < 4; j++) {
      const a = an1 - (Math.PI * j) / 4;
      out.push(c[2 * n - 2] + Math.cos(a) * r, c[2 * n - 1] + Math.sin(a) * r);
    }
  }
  for (let i = n - 1; i >= 1; i--) out.push(R[2 * i], R[2 * i + 1]);
  return out;
}
