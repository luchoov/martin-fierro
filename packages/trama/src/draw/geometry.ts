import type { Pts } from './hand';

// A zoom 7 el error queda debajo de un quinto de píxel CSS. El bake también
// tiene que servir al acercar la cámara, así que la tolerancia es de mundo.
const ERROR_CURVA = 0.025;
const TRAMO_MAX = 16;
const EPS = 1e-9;

/** Aplana las mismas cuadráticas de puntos medios que usa tracePath. */
export function aplanarCurva(pts: Pts, cerrada: boolean, suave: boolean): Pts {
  const n = pts.length >> 1;
  if (!suave || n < 3) return pts.slice();
  const salida: Pts = [];
  const curva = (ax: number, ay: number, cx: number, cy: number, bx: number, by: number, nivel = 0): void => {
    const dx = bx - ax;
    const dy = by - ay;
    const largo = Math.hypot(dx, dy);
    const desvio = largo > EPS ? Math.abs(dx * (cy - ay) - dy * (cx - ax)) / largo : Math.hypot(cx - ax, cy - ay);
    // Un control colineal afuera del segmento también necesita subdivisión.
    const exceso = Math.hypot(cx - ax, cy - ay) + Math.hypot(bx - cx, by - cy) - largo;
    if (nivel >= 16 || (desvio <= ERROR_CURVA && exceso <= ERROR_CURVA && largo <= TRAMO_MAX)) {
      salida.push(bx, by);
      return;
    }
    const acx = (ax + cx) / 2;
    const acy = (ay + cy) / 2;
    const cbx = (cx + bx) / 2;
    const cby = (cy + by) / 2;
    const mx = (acx + cbx) / 2;
    const my = (acy + cby) / 2;
    curva(ax, ay, acx, acy, mx, my, nivel + 1);
    curva(mx, my, cbx, cby, bx, by, nivel + 1);
  };
  if (cerrada) {
    let ax = (pts[2 * n - 2] + pts[0]) / 2;
    let ay = (pts[2 * n - 1] + pts[1]) / 2;
    salida.push(ax, ay);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const bx = (pts[2 * i] + pts[2 * j]) / 2;
      const by = (pts[2 * i + 1] + pts[2 * j + 1]) / 2;
      curva(ax, ay, pts[2 * i], pts[2 * i + 1], bx, by);
      ax = bx;
      ay = by;
    }
    // El último punto vuelve al inicio: el contorno cerrado lo guarda una sola vez.
    salida.length -= 2;
  } else {
    let ax = pts[0];
    let ay = pts[1];
    salida.push(ax, ay);
    for (let i = 1; i < n - 1; i++) {
      const bx = (pts[2 * i] + pts[2 * i + 2]) / 2;
      const by = (pts[2 * i + 1] + pts[2 * i + 3]) / 2;
      curva(ax, ay, pts[2 * i], pts[2 * i + 1], bx, by);
      ax = bx;
      ay = by;
    }
    salida.push(pts[2 * n - 2], pts[2 * n - 1]);
  }
  return salida;
}

/** Los segmentos independientes permiten juntar trazos sin conectar sus ejes. */
export function segmentosEje(pts: Pts): number[] {
  const segmentos: number[] = [];
  for (let i = 2; i < pts.length; i += 2) {
    if (pts[i] !== pts[i - 2] || pts[i + 1] !== pts[i - 1]) segmentos.push(pts[i - 2], pts[i - 1], pts[i], pts[i + 1]);
  }
  return segmentos;
}

const cruz = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number =>
  (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

function limpiar(original: Pts): Pts {
  const pts: Pts = [];
  for (let i = 0; i + 1 < original.length; i += 2) {
    const x = original[i];
    const y = original[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!pts.length || Math.abs(x - pts[pts.length - 2]) > EPS || Math.abs(y - pts[pts.length - 1]) > EPS) pts.push(x, y);
  }
  if (pts.length >= 4 && Math.abs(pts[0] - pts[pts.length - 2]) <= EPS && Math.abs(pts[1] - pts[pts.length - 1]) <= EPS) pts.length -= 2;
  return pts;
}

/** El área firmada permite detectar contornos agrupados que pueden cancelarse. */
export function areaFirmada(pts: Pts): number {
  let area = 0;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) area += pts[j] * pts[i + 1] - pts[i] * pts[j + 1];
  return area * 0.5;
}

/** Un contorno cruzado puede tener lóbulos de distinto sentido aunque su área no sea cero. */
export function sentidoUniforme(pts: Pts): number {
  const limpio = limpiar(pts);
  return intersecciones(aristasDe([limpio])) ? 0 : Math.sign(areaFirmada(limpio));
}

interface Arista {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  contorno: number;
  indice: number;
  cantidad: number;
}

function aristasDe(regiones: Pts[]): Arista[] {
  const aristas: Arista[] = [];
  for (let c = 0; c < regiones.length; c++) {
    const p = regiones[c];
    const n = p.length >> 1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = p[2 * i];
      const ay = p[2 * i + 1];
      const bx = p[2 * j];
      const by = p[2 * j + 1];
      if (ax === bx && ay === by) continue;
      aristas.push({ ax, ay, bx, by, minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minY: Math.min(ay, by), maxY: Math.max(ay, by), contorno: c, indice: i, cantidad: n });
    }
  }
  return aristas;
}

/** Compara sólo aristas con cajas que se pisan para abaratar el barrido. */
function intersecciones(aristas: Arista[], ys?: number[]): boolean {
  const ordenadas = aristas.slice().sort((a, b) => a.minX - b.minX);
  let hayCruces = false;
  for (let i = 0; i < ordenadas.length; i++) {
    const a = ordenadas[i];
    for (let j = i + 1; j < ordenadas.length && ordenadas[j].minX <= a.maxX + EPS; j++) {
      const b = ordenadas[j];
      if (a.minY > b.maxY + EPS || b.minY > a.maxY + EPS) continue;
      if (a.contorno === b.contorno && (Math.abs(a.indice - b.indice) === 1 || Math.abs(a.indice - b.indice) === a.cantidad - 1)) continue;
      const dx = a.bx - a.ax;
      const dy = a.by - a.ay;
      const ex = b.bx - b.ax;
      const ey = b.by - b.ay;
      const den = dx * ey - dy * ex;
      const qx = b.ax - a.ax;
      const qy = b.ay - a.ay;
      if (Math.abs(den) <= EPS) {
        if (Math.abs(qx * dy - qy * dx) <= EPS) {
          hayCruces = true;
          if (!ys) return true;
        }
        continue;
      }
      const t = (qx * ey - qy * ex) / den;
      const u = (qx * dy - qy * dx) / den;
      if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) {
        hayCruces = true;
        if (!ys) return true;
        ys.push(a.ay + Math.max(0, Math.min(1, t)) * dy);
      }
    }
  }
  return hayCruces;
}

function triangulo(salida: number[], ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void {
  const area = cruz(ax, ay, bx, by, cx, cy);
  if (Math.abs(area) <= EPS) return;
  if (area > 0) salida.push(ax, ay, bx, by, cx, cy);
  else salida.push(ax, ay, cx, cy, bx, by);
}

/** Recorta orejas en contornos simples; un abanico rellenaría sus concavidades. */
function orejas(pts: Pts): number[] | null {
  const n = pts.length >> 1;
  const sentido = areaFirmada(pts) < 0 ? -1 : 1;
  const indices = Array.from({ length: n }, (_, i) => i);
  const salida: number[] = [];
  const giro = (a: number, b: number, c: number): number => cruz(pts[2 * a], pts[2 * a + 1], pts[2 * b], pts[2 * b + 1], pts[2 * c], pts[2 * c + 1]) * sentido;
  let convexo = true;
  for (let i = 0; i < n; i++) if (giro((i + n - 1) % n, i, (i + 1) % n) < -EPS) convexo = false;
  if (convexo) {
    for (let i = 1; i < n - 1; i++) triangulo(salida, pts[0], pts[1], pts[2 * i], pts[2 * i + 1], pts[2 * i + 2], pts[2 * i + 3]);
    return salida;
  }
  let actual = 0;
  let fallos = 0;
  while (indices.length > 3) {
    const largo = indices.length;
    const a = indices[(actual + largo - 1) % largo];
    const b = indices[actual];
    const c = indices[(actual + 1) % largo];
    const angulo = giro(a, b, c);
    let oreja = angulo > EPS;
    if (oreja) {
      const minX = Math.min(pts[2 * a], pts[2 * b], pts[2 * c]);
      const maxX = Math.max(pts[2 * a], pts[2 * b], pts[2 * c]);
      const minY = Math.min(pts[2 * a + 1], pts[2 * b + 1], pts[2 * c + 1]);
      const maxY = Math.max(pts[2 * a + 1], pts[2 * b + 1], pts[2 * c + 1]);
      for (const p of indices) {
        if (p === a || p === b || p === c || pts[2 * p] < minX - EPS || pts[2 * p] > maxX + EPS || pts[2 * p + 1] < minY - EPS || pts[2 * p + 1] > maxY + EPS) continue;
        if (giro(a, b, p) >= -EPS && giro(b, c, p) >= -EPS && giro(c, a, p) >= -EPS) {
          oreja = false;
          break;
        }
      }
    }
    if (oreja || Math.abs(angulo) <= EPS) {
      if (oreja) triangulo(salida, pts[2 * a], pts[2 * a + 1], pts[2 * b], pts[2 * b + 1], pts[2 * c], pts[2 * c + 1]);
      indices.splice(actual, 1);
      actual %= indices.length;
      fallos = 0;
    } else {
      actual = (actual + 1) % largo;
      if (++fallos >= largo) return null;
    }
  }
  triangulo(salida, pts[2 * indices[0]], pts[2 * indices[0] + 1], pts[2 * indices[1]], pts[2 * indices[1] + 1], pts[2 * indices[2]], pts[2 * indices[2] + 1]);
  return salida;
}

/**
 * Relleno nonzero para autointersecciones y contornos compuestos. Al cortar en
 * cada vértice e intersección Y, las aristas no cambian de orden dentro de la
 * banda: los intervalos forman trapecios sin pisarse, respetando los huecos.
 */
function bandas(regiones: Pts[], aristas = aristasDe(regiones)): number[] {
  const ys: number[] = [];
  for (const p of regiones) for (let i = 1; i < p.length; i += 2) ys.push(p[i]);
  intersecciones(aristas, ys);
  ys.sort((a, b) => a - b);
  const alturas: number[] = [];
  for (const y of ys) if (!alturas.length || y - alturas[alturas.length - 1] > EPS) alturas.push(y);
  const salida: number[] = [];
  const xEn = (e: Arista, y: number): number => e.ax + ((y - e.ay) / (e.by - e.ay)) * (e.bx - e.ax);
  for (let i = 1; i < alturas.length; i++) {
    const arriba = alturas[i - 1];
    const abajo = alturas[i];
    const medio = (arriba + abajo) / 2;
    const activas = aristas.filter(e => e.minY < medio && e.maxY > medio).map(e => ({ e, x: xEn(e, medio) }));
    activas.sort((a, b) => a.x - b.x);
    let vueltas = 0;
    let izquierda: Arista | null = null;
    for (let j = 0; j < activas.length;) {
      const inicio = j;
      const antes = vueltas;
      const x = activas[j].x;
      do {
        vueltas += activas[j].e.by > activas[j].e.ay ? 1 : -1;
        j++;
      } while (j < activas.length && Math.abs(activas[j].x - x) <= EPS);
      if (antes === 0 && vueltas !== 0) izquierda = activas[inicio].e;
      else if (antes !== 0 && vueltas === 0 && izquierda) {
        const derecha = activas[inicio].e;
        const lx0 = xEn(izquierda, arriba);
        const lx1 = xEn(izquierda, abajo);
        const rx0 = xEn(derecha, arriba);
        const rx1 = xEn(derecha, abajo);
        triangulo(salida, lx0, arriba, rx0, arriba, rx1, abajo);
        triangulo(salida, lx0, arriba, rx1, abajo, lx1, abajo);
        izquierda = null;
      }
    }
  }
  return salida;
}

/** Triángulos nonzero de área positiva que no se pisan. */
export function triangular(original: Pts): number[] {
  const pts = limpiar(original);
  if (pts.length < 6) return [];
  const aristas = aristasDe([pts]);
  if (!intersecciones(aristas)) {
    const salida = orejas(pts);
    if (salida) return salida;
  }
  return bandas([pts], aristas);
}

/** Un relleno compuesto nonzero, sin aplicar tinta dos veces donde se pisan. */
export function triangularRegiones(regiones: Pts[]): number[] {
  const validas = regiones.map(limpiar).filter(p => p.length >= 6);
  if (validas.length === 1) return triangular(validas[0]);
  return bandas(validas);
}
