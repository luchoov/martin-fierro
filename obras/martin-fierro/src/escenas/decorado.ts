import { Ink, KEY, Mode, PX, Rng, iso, ellipsePts, type Drawer, type Light, type Pts, type World } from 'trama';
import { I, M, T } from '../tintas';

/**
 * Pulpería de campo, hacia 1870. Losa de 16 × 12 m:
 * - rancho de adobe en el rincón del fondo (x 0..9.3, y 0..7.3), cortado como casa de muñecas;
 * - ramada y palenque a la derecha; fogón, aljibe y ombú en el campo.
 */
export const SLAB = { w: 16, d: 12, depth: 1.3 };
export const ROOM = { x1: 9.3, y1: 7.3, h: 3 };
export const DOOR = { y0: 3.0, y1: 4.4 };

export interface Decorado {
  candiles: Light[];
  vela: Light;
  fogon: { x: number; y: number; light: Light; sparks(n: number): void };
  sombraInterior: { on: number };
  solPuerta: { on: number };
}

const ALL = Ink.of(1, 1, 1, 1);

/** Mancha irregular apoyada en el suelo. */
function blob(d: Drawer, x: number, y: number, rx: number, ry: number, ink: Ink, seed: number, mode: Mode = Mode.Fill, z = 0): void {
  const r = new Rng(seed);
  const xyz: number[] = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.72 + r.next() * 0.5;
    xyz.push(x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k, z);
  }
  d.fill(d.P(xyz), ink, { mode, amp: 1.2 });
}

/** Rectángulo sobre la cara interior de la pared izquierda (plano x = 0.3). */
const wallA = (d: Drawer, y0: number, z0: number, y1: number, z1: number, ink: Ink, outline = 0, x = 0.31) =>
  d.quad([x, y0, z0, x, y1, z0, x, y1, z1, x, y0, z1], ink, { outline, amp: 0.4 });

/** Rectángulo sobre la cara interior de la pared del fondo (plano y = 0.3). */
const wallB = (d: Drawer, x0: number, z0: number, x1: number, z1: number, ink: Ink, outline = 0, y = 0.31) =>
  d.quad([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], ink, { outline, amp: 0.4 });

export function armarPulperia(w: World): Decorado {
  const rng = new Rng('pulperia');

  // ——— Marcas de imprenta en los márgenes del pliego ———
  w.ground((d) => {
    d.amp = 0.25;
    const x0 = -470;
    const x1 = 610;
    const y0 = -230;
    const y1 = 690;
    const L = 26;
    const cm = (x: number, y: number, sx: number, sy: number) => {
      d.stroke([x + sx * 8, y, x + sx * (8 + L), y], 0.8, 0.8, ALL, { taper0: 0, taper1: 0 });
      d.stroke([x, y + sy * 8, x, y + sy * (8 + L)], 0.8, 0.8, ALL, { taper0: 0, taper1: 0 });
    };
    cm(x0, y0, -1, -1);
    cm(x1, y0, 1, -1);
    cm(x0, y1, -1, 1);
    cm(x1, y1, 1, 1);
    const target = (x: number, y: number) => {
      d.stroke([...ellipsePts(x, y, 9, 9, 24), x + 9, y], 0.8, 0.8, ALL, { taper0: 0, taper1: 0, amp: 0.1 });
      d.stroke([x - 16, y, x + 16, y], 0.7, 0.7, ALL, { taper0: 0, taper1: 0, amp: 0.1 });
      d.stroke([x, y - 16, x, y + 16], 0.7, 0.7, ALL, { taper0: 0, taper1: 0, amp: 0.1 });
      d.dot(x, y, 3.2, ALL, Mode.Over);
    };
    target((x0 + x1) / 2, y0 - 22);
    target((x0 + x1) / 2, y1 + 22);
    target(x0 - 26, (y0 + y1) / 2);
    target(x1 + 26, (y0 + y1) / 2);
    // Tira de control: cada tinta sola, sus mezclas y sus medios tonos.
    const sw = [I(1), I(0, 1), I(0, 0, 1), I(0, 0, 0, 1), I(1, 1), I(0, 1, 1), I(1, 0, 1), I(1, 1, 1), I(0.5), I(0, 0.5), I(0, 0, 0.5), I(0, 0, 0, 0.5), I(0.25), I(0, 0.25), I(0, 0, 0.25), I(0, 0, 0, 0.25)];
    const sx = x1 - sw.length * 15 - 6;
    const sy = y1 + 12;
    sw.forEach((ink, i) => d.fill([sx + i * 15, sy, sx + i * 15 + 13, sy, sx + i * 15 + 13, sy + 13, sx + i * 15, sy + 13], ink, { amp: 0.2, smooth: false }));
  }, 1);

  // ——— La losa: corte del terreno con sus capas ———
  w.ground((d) => {
    const { w: W, d: D, depth: H } = SLAB;
    d.amp = 1.1;
    const bands: [number, number, Ink][] = [
      [0, -0.28, T.suelo],
      [-0.28, -0.9, T.tosca],
      [-0.9, -H, T.base],
    ];
    for (const [za, zb, ink] of bands) {
      d.quad([0, D, za, W, D, za, W, D, zb, 0, D, zb], ink, { amp: 1.4 });
      d.quad([W, 0, za, W, D, za, W, D, zb, W, 0, zb], ink.shade(0.12), { amp: 1.4 });
    }
    const r = new Rng(77);
    for (let i = 0; i < 70; i++) {
      const onX = r.chance(0.45);
      const t = r.next();
      const z = -0.32 - r.next() * 0.9;
      const [cx, cy] = onX ? iso(W, t * D, z) : iso(t * W, D, z);
      const s = 1.5 + r.next() * 3.5;
      d.fill(ellipsePts(cx, cy, s * 1.3, s, 7), r.chance(0.5) ? T.piedra : I(0.1, 0.25, 0.3, 0.3), { amp: 0.5 });
    }
    for (let i = 0; i < 26; i++) {
      const onX = r.chance(0.45);
      const t = r.next();
      const [cx, cy] = onX ? iso(W, t * D, -0.05) : iso(t * W, D, -0.05);
      const len = (0.2 + r.next() * 0.45) * PX;
      d.stroke([cx, cy, cx + r.range(-6, 6), cy + len * 0.5, cx + r.range(-10, 10), cy + len], 0.9, 0.2, I(0.3, 0.45, 0.1, 0.6), { taper0: 0, taper1: 0.8 });
    }
    // Aristas del corte
    d.stroke(d.P([0, D, 0, W, D, 0, W, 0, 0]), 1.3, 1.3, KEY, { taper0: 0.02, taper1: 0.02 });
    d.stroke(d.P([0, D, 0, 0, D, -H, W, D, -H, W, 0, -H, W, 0, 0]), 1.0, 1.0, KEY, { taper0: 0.02, taper1: 0.02 });
    d.stroke(d.P([W, D, 0, W, D, -H]), 1.0, 1.0, KEY, { taper0: 0.05, taper1: 0.05 });
    // Superficie del campo
    d.quad([0, 0, 0, W, 0, 0, W, D, 0, 0, D, 0], T.pasto, { amp: 1.2 });
    for (let i = 0; i < 46; i++) {
      const x = r.range(0.3, W - 0.5);
      const y = r.range(0.3, D - 0.5);
      if (x < ROOM.x1 + 0.2 && y < ROOM.y1 + 0.2) continue;
      blob(d, x, y, r.range(0.4, 1.4), r.range(0.3, 1.0), r.pick([T.pastoClaro, T.pastoOsc, I(0, 0.55, 0.3, 0.05), T.paja]), 1000 + i);
    }
    // Pasto que asoma por el borde
    for (let i = 0; i < 90; i++) {
      const onX = r.chance(0.45);
      const t = r.next();
      const [cx, cy] = onX ? iso(W, t * D, 0) : iso(t * W, D, 0);
      const h = 3 + r.next() * 6;
      d.stroke([cx, cy + 2, cx + r.range(-3, 3), cy - h], 1.1, 0.2, T.pastoOsc, { taper0: 0, taper1: 0.8, amp: 0.3 });
    }
  }, 2);

  // ——— Huellas, sendero y piso de la ramada ———
  w.ground((d) => {
    d.amp = 1.2;
    const r = new Rng(91);
    // Sendero desde la ramada al campo (por ahí llegan y se van los jinetes).
    const path: [number, number][] = [
      [10.5, 4.5],
      [12.2, 7.4],
      [13.9, 9.4],
      [15.2, 11.0],
      [16, 12],
    ];
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, ay] = path[i];
      const [bx, by] = path[i + 1];
      for (let k = 0; k < 4; k++) {
        const t = k / 4;
        blob(d, ax + (bx - ax) * t, ay + (by - ay) * t, 0.9, 0.7, T.tierraClara, 200 + i * 10 + k);
      }
    }
    blob(d, 11.6, 3.7, 2.6, 3.4, T.tierra, 300);
    blob(d, 10.8, 5.6, 1.6, 1.5, T.tierraPisada, 301);
    blob(d, 13.4, 3.5, 1.2, 2.6, T.tierraPisada, 302);
    blob(d, 11.8, 9.3, 1.7, 1.4, T.tierra, 303);
    blob(d, 10.4, 7.9, 1.6, 1.0, T.tierraClara, 304);
    // Huellas de cascos y de alpargata.
    for (let i = 0; i < 40; i++) {
      const t = r.next();
      const seg = Math.min(path.length - 2, Math.floor(t * (path.length - 1)));
      const u = t * (path.length - 1) - seg;
      const x = path[seg][0] + (path[seg + 1][0] - path[seg][0]) * u + r.range(-0.4, 0.4);
      const y = path[seg][1] + (path[seg + 1][1] - path[seg][1]) * u + r.range(-0.4, 0.4);
      const [cx, cy] = iso(x, y, 0);
      d.fill(ellipsePts(cx, cy, 2.2, 1.3, 6), I(0.25, 0.5, 0.12, 0.2), { mode: Mode.Over, amp: 0.3 });
    }
    // Piedras del fogón y cenizas.
    const [fx, fy] = [11.8, 9.3];
    blob(d, fx, fy, 0.7, 0.6, I(0.05, 0.12, 0.2, 0.42), 305);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const rr = 0.07 + ((i * 37) % 5) * 0.012;
      d.lathe(fx + Math.cos(a) * 0.62, fy + Math.sin(a) * 0.55, 0, [rr, 0, rr * 1.1, 0.05, rr * 0.6, 0.09], M.piedra, { cap: true, amp: 0.6 });
    }
  }, 3);

  // ——— Piso del rancho ———
  w.ground((d) => {
    const r = new Rng(31);
    d.quad([0, 0, 0, ROOM.x1, 0, 0, ROOM.x1, ROOM.y1, 0, 0, ROOM.y1, 0], T.tierra, { amp: 0.6 });
    blob(d, 4.5, 3.2, 3.8, 0.9, T.tierraPisada, 400);
    blob(d, 7.6, 3.7, 1.8, 0.8, T.tierraPisada, 401);
    blob(d, 6.3, 4.7, 1.3, 1.0, T.tierraPisada, 402);
    for (let i = 0; i < 9; i++) blob(d, r.range(1, 8.5), r.range(2.6, 6.8), r.range(0.15, 0.4), r.range(0.1, 0.25), I(0.3, 0.45, 0.15, 0.28), 410 + i, Mode.Over);
    for (let i = 0; i < 60; i++) {
      const [cx, cy] = iso(r.range(0.4, 9), r.range(0.4, 7), 0);
      d.dot(cx, cy, 0.6 + r.next() * 0.9, I(0.25, 0.45, 0.1, 0.35), Mode.Over);
    }
    // Pajas y una tapa de botella tiradas.
    for (let i = 0; i < 14; i++) {
      const [cx, cy] = iso(r.range(0.8, 8.8), r.range(2.6, 6.9), 0);
      const a = r.range(0, Math.PI);
      d.stroke([cx, cy, cx + Math.cos(a) * 7, cy + Math.sin(a) * 3], 0.7, 0.4, T.paja.add(0, 0, 0, 0.1));
    }
  }, 4);

  // ——— Paredes del fondo, con todo lo que cuelga de ellas ———
  w.ground((d) => {
    const r = new Rng(41);
    const H = ROOM.h;
    // Pared izquierda (x = 0) y pared del fondo (y = 0)
    d.box(0, 0, 0, 0.3, ROOM.y1, H, M.adobe);
    d.box(0.3, 0, 0, ROOM.x1 - 0.3, 0.3, H, M.adobe);
    // Zócalo gastado
    wallA(d, 0.3, 0, ROOM.y1, 0.72, T.zocalo);
    wallB(d, 0.3, 0, ROOM.x1, 0.72, T.zocalo);
    d.line3([0.31, 0.3, 0.72, 0.31, ROOM.y1, 0.72], 0.8, 0.6, I(0.4, 0.3, 0.1, 0.4));
    d.line3([0.3, 0.31, 0.72, ROOM.x1, 0.31, 0.72], 0.8, 0.6, I(0.4, 0.3, 0.1, 0.4));
    // Revoque caído: asoman los adobes.
    const brick = (onA: boolean, a: number, z: number) => {
      for (let row = 0; row < 3; row++) {
        for (let c = 0; c < 3; c++) {
          const a0 = a + c * 0.24 + (row % 2) * 0.12;
          const z0 = z + row * 0.12;
          if (onA) wallA(d, a0, z0, a0 + 0.22, z0 + 0.1, T.adobe, 0.5);
          else wallB(d, a0, z0, a0 + 0.22, z0 + 0.1, T.adobe, 0.5);
        }
      }
    };
    brick(true, 6.1, 1.9);
    brick(false, 7.7, 2.2);
    brick(false, 0.6, 2.55);
    // Grietas y manchas de humedad
    for (let i = 0; i < 7; i++) {
      const onA = r.chance(0.5);
      const a = r.range(0.6, onA ? 7 : 9);
      const z = r.range(1.0, 2.7);
      const pts = onA ? d.P([0.31, a, z, 0.31, a + 0.1, z - 0.2, 0.31, a + 0.05, z - 0.4]) : d.P([a, 0.31, z, a + 0.12, 0.31, z - 0.18, a + 0.06, 0.31, z - 0.42]);
      d.stroke(pts, 0.7, 0.2, I(0.1, 0.2, 0.2, 0.55), { taper0: 0.1, taper1: 0.7 });
    }
    // Remate de paja sobre los muros (el techo, cortado)
    d.box(-0.05, -0.05, H, 0.4, ROOM.y1 + 0.05, 0.22, M.paja, { amp: 0.8 });
    d.box(0.35, -0.05, H, ROOM.x1 - 0.35, 0.4, 0.22, M.paja, { amp: 0.8 });
    for (let i = 0; i < 60; i++) {
      const t = r.next();
      const onA = i % 2 === 0;
      const [cx, cy] = onA ? iso(0.35, t * ROOM.y1, H + 0.22) : iso(0.4 + t * (ROOM.x1 - 0.4), 0.35, H + 0.22);
      d.stroke([cx, cy, cx + r.range(-2, 2), cy + r.range(4, 9)], 0.6, 0.2, T.pajaOsc);
    }

    // Ventana con reja en la pared izquierda, y el atardecer del otro lado.
    wallA(d, 4.6, 1.2, 5.7, 2.15, I(0.5, 0.75, 0.05, 0.05), 0.9);
    for (let i = 1; i < 6; i++) d.line3([0.32, 4.6 + i * 0.18, 1.2, 0.32, 4.6 + i * 0.18, 2.15], 1.0, 1.0, T.hierro, { taper0: 0, taper1: 0 });
    wallA(d, 4.45, 1.15, 4.6, 2.2, T.madera, 0.7, 0.33);
    wallA(d, 5.7, 1.15, 5.85, 2.2, T.madera, 0.7, 0.33);
    // Recado colgado de una estaca
    wallA(d, 3.0, 1.35, 3.85, 1.85, I(0.3, 0.5, 0.05, 0.35), 0.8, 0.34);
    wallA(d, 3.05, 1.5, 3.8, 1.62, I(0.85, 0.15, 0, 0.1), 0, 0.35);
    d.line3([0.34, 3.4, 1.9, 0.5, 3.4, 1.9], 1.4, 1.2, T.maderaOsc);
    // Boleadoras y lazo
    for (let i = 0; i < 3; i++) {
      const [bx, by] = iso(0.36, 2.75 + i * 0.12, 1.55 - (i % 2) * 0.12);
      const [tx, ty] = iso(0.36, 2.85, 2.25);
      d.stroke([tx, ty, bx, by], 0.6, 0.5, I(0.2, 0.35, 0.05, 0.6));
      d.dot(bx, by, 2.6, I(0.3, 0.45, 0.1, 0.55));
    }
    const lazo: Pts = [];
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      lazo.push(...iso(0.36, 6.45 + Math.cos(a) * 0.32, 1.65 + Math.sin(a) * 0.38));
    }
    d.stroke(lazo, 1.6, 1.4, I(0.25, 0.55, 0.05, 0.3), { taper0: 0, taper1: 0 });
    // Estampa de un santo
    wallA(d, 1.3, 2.0, 1.75, 2.55, I(0.1, 0.45, 0.2, 0.08), 0.8, 0.33);
    wallA(d, 1.4, 2.08, 1.65, 2.45, I(0.0, 0.2, 0.55, 0.15), 0, 0.34);

    // Estantería detrás del mostrador con botellas, frascos y damajuanas.
    const shelfX0 = 0.55;
    const shelfX1 = 5.5;
    for (const z of [1.15, 1.65, 2.15, 2.6]) d.box(shelfX0, 0.3, z, shelfX1 - shelfX0, 0.32, 0.04, M.madera, { amp: 0.3 });
    d.box(shelfX0 - 0.06, 0.3, 1.0, 0.06, 0.32, 1.66, M.madera, { amp: 0.3 });
    d.box(shelfX1, 0.3, 1.0, 0.06, 0.32, 1.66, M.madera, { amp: 0.3 });
    const glassMats = [
      { top: T.vidrio, left: T.vidrio, right: T.vidrio.shade(0.15), line: 0.7 },
      { top: T.vidrioAmbar, left: T.vidrioAmbar, right: T.vidrioAmbar.shade(0.15), line: 0.7 },
      { top: T.vidrioClaro, left: T.vidrioClaro, right: T.vidrioClaro.shade(0.15), line: 0.7 },
      { top: T.oscuro, left: T.oscuro, right: T.oscuro, line: 0.7 },
    ];
    for (const z of [1.19, 1.69, 2.19]) {
      let x = shelfX0 + 0.15;
      while (x < shelfX1 - 0.15) {
        const kind = r.next();
        if (kind < 0.62) {
          const h = r.range(0.24, 0.36);
          d.lathe(x, 0.46, z, [0.04, 0, 0.042, h * 0.62, 0.014, h * 0.82, 0.013, h], r.pick(glassMats), { amp: 0.25 });
          x += r.range(0.11, 0.17);
        } else if (kind < 0.85) {
          d.lathe(x + 0.04, 0.46, z, [0.06, 0, 0.07, 0.12, 0.05, 0.2, 0.045, 0.22], { top: I(0, 0.1, 0.1, 0.1), left: I(0.1, 0.55, 0.15, 0.15), right: I(0.1, 0.55, 0.2, 0.32), line: 0.7 }, { amp: 0.25 });
          x += 0.2;
        } else {
          d.box(x - 0.08, 0.36, z, 0.32, 0.22, 0.2, mat3(I(0.25, 0.55, 0.05, 0.15)), { amp: 0.25 });
          x += 0.38;
        }
      }
    }
    // Damajuanas forradas en mimbre sobre el estante alto.
    for (const x of [1.0, 2.2, 4.4]) {
      d.lathe(x, 0.47, 2.64, [0.1, 0, 0.15, 0.1, 0.12, 0.24, 0.04, 0.3, 0.035, 0.36], { top: T.vidrio, left: I(0.15, 0.6, 0.05, 0.2), right: I(0.2, 0.6, 0.12, 0.38), line: 0.8 }, { amp: 0.3 });
    }
    // Trastienda: una puerta oscura con cortina, y una ristra de ajos.
    wallB(d, 6.4, 0, 7.5, 2.15, I(0.15, 0.2, 0.35, 0.85), 1.0);
    wallB(d, 6.45, 0.6, 7.45, 2.1, I(0.75, 0.2, 0.05, 0.18), 0, 0.33);
    for (let i = 0; i < 4; i++) d.line3([6.55 + i * 0.27, 0.34, 2.1, 6.5 + i * 0.27, 0.34, 0.62], 0.8, 0.6, I(0.85, 0.2, 0.05, 0.4));
    for (let i = 0; i < 6; i++) {
      const [cx, cy] = iso(8.3, 0.36, 2.2 - i * 0.11);
      d.dot(cx + (i % 2 ? 2 : -2), cy, 3, T.hueso, Mode.Fill);
    }
    // Cueros de oveja y ponchos a la venta
    wallB(d, 5.75, 1.3, 6.25, 2.3, I(0.0, 0.2, 0.05, 0.08), 0.8, 0.33);
    wallB(d, 7.8, 0.9, 8.9, 1.25, I(0.8, 0.2, 0, 0.1), 0.8, 0.33);
    wallB(d, 7.8, 1.25, 8.9, 1.55, I(0, 0.1, 0.6, 0.3), 0.8, 0.33);
    wallB(d, 7.8, 1.55, 8.9, 1.8, I(0.3, 0.55, 0.05, 0.2), 0.8, 0.33);
  }, 5);

  // ——— Luz del sol poniente que entra por la puerta ———
  const solPuerta = { on: 1 };
  w.ground((d) => {
    for (let k = 0; k < 3; k++) {
      const len = 2.8 - k * 0.8;
      const wy = 0.12 * k;
      d.quad([ROOM.x1 - 0.3, DOOR.y0 + wy, 0, ROOM.x1 - 0.3 - len, DOOR.y0 + 0.3 + wy, 0, ROOM.x1 - 0.3 - len, DOOR.y1 + 0.5 - wy, 0, ROOM.x1 - 0.3, DOOR.y1 - wy, 0], I(0.06, 0.12, 0, 0), {
        mode: Mode.Add,
        amp: 0.6,
      });
    }
  }, 6);

  // ——— Muros cortados del frente (bajos, para ver adentro) ———
  const stub = M.adobeCrudo;
  const stubH = 0.5;
  for (let x = 0.3; x < ROOM.x1 - 0.3; x += 1.5) {
    const len = Math.min(1.5, ROOM.x1 - 0.3 - x);
    w.prop([x, ROOM.y1 - 0.3, x + len, ROOM.y1], (d) => {
      d.box(x, ROOM.y1 - 0.3, 0, len, 0.3, stubH, stub, { amp: 0.5 });
      for (let i = 0; i < 3; i++) d.line3([x, ROOM.y1, 0.12 + i * 0.14, x + len, ROOM.y1, 0.12 + i * 0.14], 0.5, 0.5, I(0.4, 0.45, 0.15, 0.35), { taper0: 0, taper1: 0 });
    });
  }
  w.prop([0, ROOM.y1 - 0.3, 0.3, ROOM.y1], (d) => d.box(0, ROOM.y1 - 0.3, 0, 0.3, 0.3, stubH, stub, { amp: 0.5 }));
  for (const [y0, y1] of [
    [0.3, DOOR.y0],
    [DOOR.y1, ROOM.y1 - 0.3],
  ]) {
    for (let y = y0; y < y1 - 0.01; y += 1.4) {
      const len = Math.min(1.4, y1 - y);
      w.prop([ROOM.x1 - 0.3, y, ROOM.x1, y + len], (d) => {
        d.box(ROOM.x1 - 0.3, y, 0, 0.3, len, stubH, stub, { amp: 0.5 });
        for (let i = 0; i < 3; i++) d.line3([ROOM.x1, y, 0.12 + i * 0.14, ROOM.x1, y + len, 0.12 + i * 0.14], 0.5, 0.5, I(0.4, 0.45, 0.15, 0.35), { taper0: 0, taper1: 0 });
      });
    }
  }
  // Umbral de la puerta y jambas cortadas
  w.prop([ROOM.x1 - 0.32, DOOR.y0 - 0.1, ROOM.x1, DOOR.y0], (d) => d.box(ROOM.x1 - 0.32, DOOR.y0 - 0.1, 0, 0.32, 0.1, 0.9, M.madera));
  w.prop([ROOM.x1 - 0.32, DOOR.y1, ROOM.x1, DOOR.y1 + 0.1], (d) => d.box(ROOM.x1 - 0.32, DOOR.y1, 0, 0.32, 0.1, 0.9, M.madera));

  // ——— Mostrador con reja ———
  const cx0 = 0.6;
  const cx1 = 5.4;
  const cy0 = 1.9;
  const cy1 = 2.45;
  const ch = 1.05;
  const vent = [2.75, 3.85];
  w.prop([cx0, cy0, cx1, cy1], (d) => {
    d.box(cx0, cy0, 0, cx1 - cx0, cy1 - cy0, ch, M.madera);
    for (let x = cx0 + 0.32; x < cx1; x += 0.32) d.line3([x, cy1, 0.05, x, cy1, ch - 0.06], 0.6, 0.6, T.maderaOsc, { taper0: 0.05, taper1: 0.05 });
    d.box(cx0 - 0.05, cy0 - 0.05, ch, cx1 - cx0 + 0.1, cy1 - cy0 + 0.1, 0.05, M.maderaClara);
    // Cosas sobre el mostrador
    d.lathe(1.4, 2.15, ch + 0.05, [0.04, 0, 0.042, 0.2, 0.014, 0.27, 0.013, 0.32], { top: T.vidrio, left: T.vidrio, right: T.vidrio.shade(0.2), line: 0.7 });
    d.lathe(3.2, 2.2, ch + 0.05, [0.03, 0, 0.034, 0.1], { top: T.vidrioClaro, left: T.vidrioClaro, right: T.vidrioClaro.shade(0.2), line: 0.6 });
    d.lathe(3.55, 2.18, ch + 0.05, [0.03, 0, 0.034, 0.1], { top: T.vidrioAmbar, left: T.vidrioAmbar, right: T.vidrioAmbar.shade(0.2), line: 0.6 });
    d.lathe(4.7, 2.15, ch + 0.05, [0.06, 0, 0.075, 0.12, 0.04, 0.2], { top: T.hueso, left: I(0.1, 0.4, 0.05, 0.1), right: I(0.15, 0.45, 0.1, 0.3), line: 0.7 });
    // Balanza
    d.box(2.0, 2.05, ch + 0.05, 0.3, 0.25, 0.05, M.hierro);
    d.line3([2.15, 2.17, ch + 0.1, 2.15, 2.17, ch + 0.45], 1, 0.8, T.hierro);
    d.line3([1.95, 2.17, ch + 0.45, 2.35, 2.17, ch + 0.45], 1, 1, T.hierro);
    // Reja de hierro, con la ventanilla para despachar.
    const top = 2.55;
    for (let x = cx0 + 0.08; x < cx1; x += 0.16) {
      if (x > vent[0] && x < vent[1]) continue;
      d.line3([x, cy1, ch + 0.05, x, cy1, top], 0.9, 0.9, T.hierro, { taper0: 0, taper1: 0 });
    }
    d.line3([cx0, cy1, top, cx1, cy1, top], 1.4, 1.4, T.hierro, { taper0: 0, taper1: 0 });
    d.line3([cx0, cy1, 1.75, vent[0], cy1, 1.75], 1.0, 1.0, T.hierro, { taper0: 0, taper1: 0 });
    d.line3([vent[1], cy1, 1.75, cx1, cy1, 1.75], 1.0, 1.0, T.hierro, { taper0: 0, taper1: 0 });
    d.line3([vent[0], cy1, 1.5, vent[1], cy1, 1.5], 1.2, 1.2, T.hierro, { taper0: 0, taper1: 0 });
  });

  // Pipas detrás del mostrador
  for (const [x, y] of [
    [5.0, 0.85],
    [5.85, 0.8],
  ]) {
    w.prop([x - 0.35, y - 0.35, x + 0.35, y + 0.35], (d) => barril(d, x, y, 0.34, 0.95));
  }
  // ——— Mesa del truco, banquitos, barril del guitarrero ———
  const tx0 = 5.6;
  const ty0 = 4.25;
  const tx1 = 6.9;
  const ty1 = 5.0;
  w.prop([tx0, ty0, tx1, ty1], (d) => {
    for (const [lx, ly] of [
      [tx0 + 0.08, ty0 + 0.08],
      [tx1 - 0.14, ty0 + 0.08],
      [tx0 + 0.08, ty1 - 0.14],
      [tx1 - 0.14, ty1 - 0.14],
    ]) {
      d.box(lx, ly, 0, 0.06, 0.06, 0.7, M.madera, { amp: 0.25 });
    }
    d.box(tx0, ty0, 0.7, tx1 - tx0, ty1 - ty0, 0.06, M.maderaClara);
    // Naipes, un vaso y la vela
    const card = (x: number, y: number, a: number, ink: Ink) => {
      const c = Math.cos(a) * 0.05;
      const s = Math.sin(a) * 0.05;
      d.quad([x - c * 1.2 + s, y - s * 1.2 - c, 0.765, x + c * 1.2 + s, y + s * 1.2 - c, 0.765, x + c * 1.2 - s, y + s * 1.2 + c, 0.765, x - c * 1.2 - s, y - s * 1.2 + c, 0.765], ink, { outline: 0.5, amp: 0.15 });
    };
    card(6.1, 4.55, 0.3, I(0, 0.04, 0.02, 0));
    card(6.25, 4.62, -0.5, I(0.6, 0.1, 0, 0));
    card(6.4, 4.5, 1.2, I(0, 0.04, 0.02, 0));
    card(6.55, 4.75, 0.1, I(0, 0.04, 0.02, 0));
    d.lathe(5.85, 4.8, 0.76, [0.03, 0, 0.034, 0.1], { top: T.vidrioAmbar, left: T.vidrioAmbar, right: T.vidrioAmbar.shade(0.2), line: 0.6 });
    d.lathe(6.65, 4.45, 0.76, [0.05, 0, 0.05, 0.03, 0.015, 0.04, 0.015, 0.16], { top: T.hueso, left: T.hueso, right: T.hueso.shade(0.1), line: 0.6 });
  });
  const banquito = (x: number, y: number, h = 0.45) =>
    w.prop([x - 0.2, y - 0.2, x + 0.2, y + 0.2], (d) => {
      for (const [lx, ly] of [
        [-0.15, -0.15],
        [0.1, -0.15],
        [-0.15, 0.1],
        [0.1, 0.1],
      ]) {
        d.box(x + lx, y + ly, 0, 0.05, 0.05, h - 0.05, M.madera, { amp: 0.2 });
      }
      d.box(x - 0.18, y - 0.18, h - 0.05, 0.36, 0.36, 0.05, M.maderaClara, { amp: 0.25 });
    });
  banquito(5.1, 4.55);
  banquito(7.45, 4.55);
  w.prop([0.92, 5.3, 1.48, 5.86], (d) => barril(d, 1.2, 5.58, 0.27, 0.6));
  // Banco largo contra la pared izquierda
  w.prop([0.32, 2.9, 0.75, 4.9], (d) => {
    d.box(0.35, 2.95, 0, 0.06, 0.06, 0.4, M.madera);
    d.box(0.35, 4.8, 0, 0.06, 0.06, 0.4, M.madera);
    d.box(0.33, 2.9, 0.4, 0.42, 2.0, 0.06, M.maderaClara);
  });
  // Botella tirada al lado del borracho
  w.prop([1.0, 3.25, 1.2, 3.45], (d) => {
    const [ax, ay] = iso(1.0, 3.3, 0.04);
    const [bx, by] = iso(1.24, 3.38, 0.04);
    d.stroke([ax, ay, bx, by], 3.2, 2.2, T.vidrio, { taper0: 0, taper1: 0.05 });
    d.stroke([bx, by, bx + 4, by + 1], 1.4, 1.2, T.vidrio, { taper0: 0, taper1: 0 });
  });

  // ——— Candiles: uno colgado de la reja del mostrador, otro de un brazo en la pared ———
  const candiles: Light[] = [];
  const candil = (x: number, y: number, z: number, hook: [number, number, number], arm?: [number, number, number]) => {
    const L = w.light({ x, y, z, r: 2.4, rings: 5, glow: I(0.0, 0.055, 0, 0), clear: I(0, 0, 0.07, 0.05), halo: 9, flicker: 0.05, on: 1 });
    candiles.push(L);
    w.dyn([x - 0.12, y - 0.12, x + 0.12, y + 0.12], (d, world) => {
      const sway = Math.sin(world.t * 0.9 + x) * 0.02;
      d.amp = 0.25;
      if (arm) d.line3([...arm, ...hook], 1.6, 1.4, T.hierro, { taper0: 0, taper1: 0 });
      const [tx, ty] = iso(...hook);
      const [lx, ly] = iso(x + sway, y + sway, z);
      d.stroke([tx, ty, (tx + lx) / 2 + 0.6, (ty + ly) / 2, lx, ly - 6], 0.6, 0.6, T.hierro, { taper0: 0, taper1: 0 });
      d.fill([lx - 5, ly - 5, lx + 5, ly - 5, lx + 6, ly - 2, lx + 3, ly + 1, lx - 3, ly + 1, lx - 6, ly - 2], T.hierro, { amp: 0.3 });
      const fl = 1 + Math.sin(world.t * 17 + x) * 0.18 + Math.sin(world.t * 7 + y) * 0.1;
      d.fill([lx + 2, ly - 5, lx + 4 + sway * 30, ly - 5 - 8 * fl, lx + 6, ly - 5], I(0.35, 0.95, 0, 0), { amp: 0.3 });
      d.fill([lx + 3, ly - 5, lx + 4 + sway * 30, ly - 5 - 4 * fl, lx + 5, ly - 5], I(0, 0.5, 0, 0), { amp: 0.2 });
    }, undefined, z);
  };
  candil(3.3, 2.5, 2.2, [3.3, 2.46, 2.55]);
  candil(0.95, 5.0, 2.15, [0.95, 5.0, 2.55], [0.31, 5.0, 2.55]);
  const vela = w.light({ x: 6.65, y: 4.45, z: 0.95, r: 1.0, rings: 3, glow: I(0, 0.07, 0, 0), clear: I(0, 0, 0.06, 0.05), halo: 5, flicker: 0.08, on: 1 });
  w.dyn([6.6, 4.4, 6.7, 4.5], (d, world) => {
    const [lx, ly] = iso(6.65, 4.45, 0.92);
    const fl = 1 + Math.sin(world.t * 19) * 0.2;
    d.fill([lx - 1.6, ly, lx, ly - 6 * fl, lx + 1.6, ly], I(0.3, 0.95, 0, 0), { amp: 0.2 });
  }, undefined, 0.95);

  // Sombra del interior: una tinta fría que los candiles disuelven.
  const sombraInterior = w.wash({
    pts: hullPts([0, 0, 0, ROOM.x1, 0, 0, ROOM.x1, ROOM.y1, 0, 0, ROOM.y1, 0, 0, 0, ROOM.h, ROOM.x1, 0, ROOM.h, 0, ROOM.y1, ROOM.h, ROOM.x1, ROOM.y1, 1.2]),
    ink: I(0.02, 0, 0.13, 0.1),
    on: 1,
  });

  // ——— Ramada ———
  const rx0 = 9.8;
  const rx1 = 13.3;
  const ry0 = 0.9;
  const ry1 = 6.3;
  const rh = 2.5;
  for (const [x, y] of [
    [rx0, ry0],
    [rx1, ry0],
    [rx0, ry1],
    [rx1, ry1],
    [rx0, (ry0 + ry1) / 2],
  ]) {
    w.prop([x - 0.1, y - 0.1, x + 0.1, y + 0.1], (d) => {
      d.lathe(x, y, 0, [0.1, 0, 0.09, rh * 0.6, 0.085, rh], M.madera, { amp: 0.35 });
      // Horqueta
      const [ax, ay] = iso(x, y, rh);
      d.stroke([ax, ay, ax - 4, ay - 7], 2.2, 1.2, T.madera);
      d.stroke([ax, ay, ax + 4, ay - 7], 2.2, 1.2, T.madera);
    });
  }
  w.prop([rx0 - 0.15, ry0 - 0.2, rx1 + 0.2, ry0 + 2.6], (d) => {
    d.box(rx0 - 0.1, ry0 - 0.08, rh, rx1 - rx0 + 0.25, 0.16, 0.14, M.madera, { amp: 0.4 });
    d.box(rx0 - 0.08, ry0 - 0.1, rh + 0.14, 0.16, ry1 - ry0 + 0.2, 0.12, M.madera, { amp: 0.4 });
    d.box(rx1 - 0.08, ry0 - 0.1, rh + 0.14, 0.16, ry1 - ry0 + 0.2, 0.12, M.madera, { amp: 0.4 });
    // Techo de paja sólo sobre el fondo: el frente queda abierto para mirar.
    d.box(rx0 - 0.25, ry0 - 0.25, rh + 0.26, rx1 - rx0 + 0.55, 2.7, 0.24, M.paja, { amp: 0.9 });
    const r = new Rng(55);
    for (let i = 0; i < 40; i++) {
      const x = rx0 - 0.2 + r.next() * (rx1 - rx0 + 0.45);
      const [cx, cy] = iso(x, ry0 + 2.45, rh + 0.26);
      d.stroke([cx, cy, cx + r.range(-2, 2), cy + r.range(4, 10)], 0.7, 0.2, T.pajaOsc);
    }
    for (let i = 0; i < 18; i++) {
      const [cx, cy] = iso(rx0 + r.next() * (rx1 - rx0), ry0 + r.next() * 2.5, rh + 0.5);
      d.stroke([cx - 5, cy, cx + 5, cy + r.range(-1, 1)], 0.6, 0.3, T.pajaOsc);
    }
  }, undefined, rh);
  // Palenque
  const px = 14.35;
  w.prop([px - 0.1, 1.5, px + 0.1, 6.5], (d) => {
    d.lathe(px, 1.6, 0, [0.09, 0, 0.08, 1.15], M.madera, { amp: 0.3 });
    d.lathe(px, 6.3, 0, [0.09, 0, 0.08, 1.15], M.madera, { amp: 0.3 });
    d.line3([px, 1.45, 1.02, px, 6.45, 1.0], 4.5, 4, T.madera, { taper0: 0.02, taper1: 0.02 });
    d.line3([px, 1.45, 1.06, px, 6.45, 1.04], 1.0, 1.0, T.maderaClara, { taper0: 0.05, taper1: 0.05 });
  });

  // ——— Fogón ———
  const fx = 11.8;
  const fy = 9.3;
  const fogonLight = w.light({ x: fx, y: fy, z: 0.4, r: 2.6, rings: 5, glow: I(0.03, 0.05, 0, 0), clear: I(0, 0, 0.05, 0.03), halo: 14, flicker: 0.09, on: 1 });
  const fogon = w.dyn([fx - 0.5, fy - 0.5, fx + 0.5, fy + 0.5], (d, world) => {
    d.amp = 0.4;
    // Leños cruzados
    for (const [a, b] of [
      [-0.45, 0.35],
      [0.4, 0.3],
      [0.0, -0.45],
    ]) {
      const [x0, y0] = iso(fx + a, fy + b, 0.05);
      const [x1, y1] = iso(fx - a * 0.15, fy - b * 0.15, 0.12);
      d.stroke([x0, y0, x1, y1], 5, 3.5, T.maderaOsc, { taper0: 0.02, taper1: 0.1 });
      d.dot(x0, y0, 2.4, I(0.3, 0.5, 0.05, 0.4));
    }
    const [bx, by] = iso(fx, fy, 0.1);
    d.fill(ellipsePts(bx, by, 11, 5, 12), I(0.9, 0.55, 0, 0.1), { amp: 0.8 });
    const t = world.t;
    for (let i = 0; i < 5; i++) {
      const ox = (i - 2) * 4.2;
      const h = (14 + 8 * Math.sin(t * 9.3 + i * 2.1) + 5 * Math.sin(t * 15.7 + i)) * (i === 2 ? 1.4 : 1);
      const lean = Math.sin(t * 3 + i) * 2 + 2;
      d.fill([bx + ox - 4, by, bx + ox + lean * 0.5, by - h * 0.55, bx + ox + lean, by - h, bx + ox + 4, by], I(0.75, 0.9, 0, 0), { amp: 0.6 });
      d.fill([bx + ox - 2, by, bx + ox + lean * 0.7, by - h * 0.55, bx + ox + 2, by], I(0.12, 0.95, 0, 0), { amp: 0.4 });
    }
    // La pava, sobre las brasas
    d.lathe(fx + 0.35, fy - 0.1, 0.06, [0.11, 0, 0.13, 0.09, 0.08, 0.17, 0.03, 0.2], M.hierro, { amp: 0.25 });
    const [sx, sy] = iso(fx + 0.48, fy - 0.1, 0.13);
    d.stroke([sx, sy, sx + 6, sy - 4], 1.4, 0.8, T.hierro);
  });
  fogon.onClick = () => sparks(18);
  const sparks = (n: number) => {
    const [bx, by] = iso(fx, fy, 0.3);
    for (let i = 0; i < n; i++) {
      w.emit({ x: bx + rng.range(-6, 6), y: by, vx: rng.range(-20, 20), vy: rng.range(-90, -40), max: rng.range(0.6, 1.4), r: rng.range(0.7, 1.3), kind: 'spark' });
    }
  };
  w.every((dt, world) => {
    if (rng.next() < dt * 2.4) {
      const [bx, by] = iso(fx + rng.range(-0.1, 0.1), fy, 0.7);
      world.emit({ x: bx, y: by, vx: rng.range(-3, 3), vy: rng.range(-22, -14), max: rng.range(3.5, 5.5), r: rng.range(3, 5), kind: 'smoke' });
    }
    if (rng.next() < dt * 1.2) sparks(1);
  });
  // Cráneo de vaca que hace de asiento
  w.prop([12.55, 9.75, 12.95, 10.15], (d) => {
    const [cx, cy] = iso(12.75, 9.95, 0.15);
    d.fill([cx - 9, cy + 4, cx - 10, cy - 6, cx - 3, cy - 9, cx + 6, cy - 7, cx + 9, cy + 1, cx + 3, cy + 6], T.hueso, { outline: 0.9, amp: 0.4 });
    d.stroke([cx - 9, cy - 6, cx - 18, cy - 12, cx - 21, cy - 18], 2.4, 0.4, T.hueso, { taper0: 0, taper1: 0.8 });
    d.stroke([cx + 6, cy - 7, cx + 14, cy - 13, cx + 15, cy - 19], 2.4, 0.4, T.hueso, { taper0: 0, taper1: 0.8 });
    d.dot(cx - 3, cy - 3, 1.6, KEY);
    d.dot(cx + 3, cy - 3, 1.6, KEY);
  });

  // ——— Aljibe ———
  const ax = 7.2;
  const ay = 10.2;
  w.prop([ax - 0.6, ay - 0.6, ax + 0.6, ay + 0.6], (d) => {
    d.lathe(ax, ay, 0, [0.6, 0, 0.6, 0.75, 0.62, 0.8], M.adobe, { amp: 0.4 });
    d.disc(ax, ay, 0.8, 0.45, I(0.05, 0.05, 0.35, 0.85), { amp: 0.3 });
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 4 + (i / 5) * Math.PI;
      const [bx, by] = iso(ax + Math.cos(a) * 0.6, ay + Math.sin(a) * 0.6, 0.35 + (i % 2) * 0.2);
      d.fill([bx - 4, by - 2, bx + 4, by - 2, bx + 4, by + 2, bx - 4, by + 2], T.adobe, { outline: 0.5, amp: 0.2 });
    }
    d.lathe(ax - 0.55, ay, 0.8, [0.05, 0, 0.05, 1.3], M.madera, { amp: 0.25 });
    d.lathe(ax + 0.55, ay, 0.8, [0.05, 0, 0.05, 1.3], M.madera, { amp: 0.25 });
    d.line3([ax - 0.6, ay, 2.05, ax + 0.6, ay, 2.05], 2.6, 2.6, T.madera, { taper0: 0.03, taper1: 0.03 });
    const [rx, ry] = iso(ax, ay, 2.0);
    d.dot(rx, ry, 3.2, T.hierro);
    const [bkx, bky] = iso(ax + 0.15, ay + 0.1, 0.95);
    d.stroke([rx, ry, bkx, bky - 8], 0.6, 0.6, I(0.2, 0.4, 0.05, 0.5), { taper0: 0, taper1: 0 });
    d.lathe(ax + 0.15, ay + 0.1, 0.8, [0.1, 0, 0.12, 0.18], M.barril, { amp: 0.2 });
  });

  // ——— Ombú ———
  const ox = 1.7;
  const oy = 10.6;
  w.prop([ox - 0.9, oy - 0.9, ox + 0.9, oy + 0.9], (d) => {
    const r = new Rng(12);
    // Raíces que salen por el piso
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const [x0, y0] = iso(ox + Math.cos(a) * 0.45, oy + Math.sin(a) * 0.45, 0.25);
      const [x1, y1] = iso(ox + Math.cos(a) * (1.1 + r.next() * 0.5), oy + Math.sin(a) * (1.1 + r.next() * 0.5), 0);
      d.stroke([x0, y0, (x0 + x1) / 2, (y0 + y1) / 2 - 2, x1, y1], 9, 1, I(0.32, 0.5, 0.12, 0.35), { taper0: 0, taper1: 0.9 });
    }
    d.lathe(ox, oy, 0, [0.75, 0, 0.62, 0.35, 0.5, 1.2, 0.55, 1.9, 0.4, 2.3], mat3(I(0.3, 0.48, 0.1, 0.3)), { amp: 0.8, cap: false });
    for (let i = 0; i < 6; i++) {
      const [x0, y0] = iso(ox - 0.3 + i * 0.12, oy + 0.3 - i * 0.1, 0.3 + r.next() * 0.3);
      d.stroke([x0, y0, x0 + r.range(-3, 3), y0 - r.range(25, 55)], 1.1, 0.5, I(0.35, 0.45, 0.2, 0.55), { taper0: 0.2, taper1: 0.5 });
    }
    // Ramas principales
    for (const [dx, dy, dz] of [
      [-1.2, 0.8, 3.3],
      [1.0, -0.6, 3.5],
      [0.2, 1.1, 3.6],
      [-0.6, -1.0, 3.4],
    ]) {
      d.line3([ox, oy, 2.1, ox + dx, oy + dy, dz], 6, 2, I(0.3, 0.48, 0.1, 0.38), { taper0: 0, taper1: 0.4 });
    }
  });
  w.dyn([ox - 0.9, oy - 0.9, ox + 0.9, oy + 0.9], (d, world) => {
    const r = new Rng(13);
    const t = world.t;
    d.amp = 1.0;
    const blobs: [number, number, number, number][] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const rr = i === 0 ? 0 : 1.3 + r.next() * 0.6;
      blobs.push([ox + Math.cos(a) * rr, oy + Math.sin(a) * rr, 3.5 + r.next() * 0.9, 1.0 + r.next() * 0.5]);
    }
    blobs.sort((p, q) => p[0] + p[1] + p[2] * 0.3 - (q[0] + q[1] + q[2] * 0.3));
    for (const [bx, by, bz, br] of blobs) {
      const sway = Math.sin(t * 0.8 + bx) * 1.5;
      const [cx, cy] = iso(bx, by, bz);
      d.outline(ellipsePts(cx + sway, cy, br * PX * 1.05, br * PX * 0.72, 16), 1.0);
    }
    blobs.forEach(([bx, by, bz, br], i) => {
      const sway = Math.sin(t * 0.8 + bx) * 1.5;
      const [cx, cy] = iso(bx, by, bz);
      d.fill(ellipsePts(cx + sway, cy, br * PX * 1.05, br * PX * 0.72, 16), i % 3 === 0 ? T.hoja.shade(0.1) : T.hoja, { amp: 1.0 });
      d.fill(ellipsePts(cx + sway - br * 8, cy - br * 9, br * PX * 0.55, br * PX * 0.35, 12), T.hojaClara, { amp: 0.8 });
    });
  }, undefined, 3);
  // Sombra del ombú
  w.ground((d) => blob(d, ox + 0.6, oy - 0.4, 2.6, 1.8, I(0.0, 0.1, 0.25, 0.22), 707, Mode.Over), 7);

  // ——— Pasto, paja brava y cardos que se mecen con el viento ———
  const free = (x: number, y: number) => {
    if (x < ROOM.x1 + 0.3 && y < ROOM.y1 + 0.3) return false;
    if (x > 9.4 && x < 14.6 && y < 6.9) return false;
    if (Math.hypot(x - fx, y - fy) < 1.6) return false;
    if (Math.hypot(x - ax, y - ay) < 1.0) return false;
    if (Math.hypot(x - ox, y - oy) < 1.0) return false;
    if (x > 9.6 && x < 13.6 && y > 6.8 && y < 9.0) return false;
    // sendero
    if (Math.abs(x - y * 1.15 - 1.2) < 0.9 && x > 11 && y > 6) return false;
    return true;
  };
  let placed = 0;
  for (let i = 0; i < 400 && placed < 95; i++) {
    const x = rng.range(0.3, SLAB.w - 0.25);
    const y = rng.range(0.3, SLAB.d - 0.25);
    if (!free(x, y)) continue;
    placed++;
    const kind = rng.next();
    if (kind < 0.12) cardo(w, x, y, 3000 + i);
    else mata(w, x, y, 2000 + i, kind < 0.4 ? 'paja' : 'pasto', rng.range(0.7, 1.35));
  }
  // Algunas matas pegadas a la losa por el frente
  for (let i = 0; i < 18; i++) {
    const onX = i % 2 === 0;
    const t = 0.05 + rng.next() * 0.9;
    const x = onX ? SLAB.w - 0.15 : t * SLAB.w;
    const y = onX ? t * SLAB.d : SLAB.d - 0.15;
    if (free(x, y)) mata(w, x, y, 4000 + i, 'pasto', 0.8);
  }

  // Región del atardecer: la losa y lo que se levanta sobre ella.
  // Losa, rancho, ramada y ombú: lo impreso, nunca el papel del margen.
  w.duskRegion = [
    hullPts([0, 0, 0, SLAB.w, 0, 0, SLAB.w, SLAB.d, 0, 0, SLAB.d, 0, 0, SLAB.d, -SLAB.depth, SLAB.w, SLAB.d, -SLAB.depth, SLAB.w, 0, -SLAB.depth]),
    hullPts([0, 0, 0, ROOM.x1, 0, 0, ROOM.x1, 0, ROOM.h + 0.25, 0, 0, ROOM.h + 0.25, 0, ROOM.y1, ROOM.h + 0.25, 0, ROOM.y1, 0]),
    hullPts([9.6, 0.6, 0, 13.6, 0.6, 0, 13.6, 0.6, 2.9, 9.6, 0.6, 2.9, 9.6, 3.6, 2.9, 13.6, 3.6, 2.9, 14.5, 1.4, 0, 14.5, 1.4, 1.5]),
    ellipsePts(...iso(ox, oy, 3.9), 2.7 * PX, 1.75 * PX, 24),
    hullPts([ox - 0.8, oy, 0, ox, oy - 0.8, 0, ox + 0.8, oy, 0, ox, oy + 0.8, 0, ox - 0.6, oy, 2.6, ox + 0.6, oy, 2.6]),
  ];

  return {
    candiles,
    vela,
    fogon: { x: fx, y: fy, light: fogonLight, sparks },
    sombraInterior,
    solPuerta,
  };
}

function mat3(ink: Ink) {
  return { top: ink.mix(Ink.of(), 0.25), left: ink, right: ink.shade(0.2) };
}

function barril(d: Drawer, x: number, y: number, r: number, h: number): void {
  d.lathe(x, y, 0, [r * 0.86, 0, r, h * 0.5, r * 0.86, h], M.barril, { amp: 0.35 });
  for (const t of [0.12, 0.35, 0.65, 0.88]) {
    const rr = r * (0.86 + 0.14 * Math.sin(Math.PI * t));
    d.ring(x, y, h * t, rr * 1.01, 1.4, T.hierro);
  }
}

function hullPts(xyz: number[]): Pts {
  const pts: Pts = [];
  for (let i = 0; i < xyz.length; i += 3) pts.push(...iso(xyz[i], xyz[i + 1], xyz[i + 2]));
  // Envolvente convexa simple
  const n = pts.length >> 1;
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => pts[2 * a] - pts[2 * b] || pts[2 * a + 1] - pts[2 * b + 1]);
  const cross = (o: number, a: number, b: number) => (pts[2 * a] - pts[2 * o]) * (pts[2 * b + 1] - pts[2 * o + 1]) - (pts[2 * a + 1] - pts[2 * o + 1]) * (pts[2 * b] - pts[2 * o]);
  const lo: number[] = [];
  for (const i of idx) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], i) <= 0) lo.pop();
    lo.push(i);
  }
  const up: number[] = [];
  for (let k = idx.length - 1; k >= 0; k--) {
    const i = idx[k];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], i) <= 0) up.pop();
    up.push(i);
  }
  lo.pop();
  up.pop();
  const out: Pts = [];
  for (const i of lo.concat(up)) out.push(pts[2 * i], pts[2 * i + 1]);
  return out;
}

/** Mata de pasto o paja: cada hoja se mece con una ola de viento que cruza el campo. */
function mata(w: World, x: number, y: number, seed: number, kind: 'pasto' | 'paja', size: number): void {
  const r = new Rng(seed);
  const n = kind === 'paja' ? r.int(7, 11) : r.int(4, 7);
  const blades = Array.from({ length: n }, () => ({
    a: r.range(-0.75, 0.75),
    l: (kind === 'paja' ? r.range(0.32, 0.62) : r.range(0.16, 0.34)) * size,
    ink: kind === 'paja' ? r.pick([T.paja, T.pajaOsc, I(0.08, 0.5, 0.15, 0.1)]) : r.pick([T.pastoOsc, I(0.0, 0.55, 0.5, 0.1), T.hojaClara]),
    off: r.range(-2.5, 2.5),
  }));
  blades.sort((p, q) => (p.ink === q.ink ? 0 : p.ink.k - q.ink.k));
  w.dyn([x - 0.12, y - 0.12, x + 0.12, y + 0.12], (d, world) => {
    const [bx, by] = iso(x, y, 0);
    const wind = Math.sin(world.t * 1.25 - (x + y) * 0.32) * 0.2 + Math.sin(world.t * 3.3 + x * 2) * 0.04;
    d.amp = 0.2;
    for (const b of blades) {
      const a = b.a + wind * (0.6 + b.l * 1.5);
      const L = b.l * PX;
      const x0 = bx + b.off;
      const tipX = x0 + Math.sin(a) * L;
      const tipY = by - Math.cos(a) * L;
      const midX = x0 + Math.sin(a * 0.55) * L * 0.5;
      const midY = by - Math.cos(a * 0.55) * L * 0.5;
      d.stroke([x0, by + 1, midX, midY, tipX, tipY], kind === 'paja' ? 1.5 : 1.8, 0.15, b.ink, { taper0: 0, taper1: 0.75 });
    }
  });
}

/** Cardo con su flor violeta (punzó sobre celeste). */
function cardo(w: World, x: number, y: number, seed: number): void {
  const r = new Rng(seed);
  const h = r.range(0.45, 0.8);
  w.dyn([x - 0.1, y - 0.1, x + 0.1, y + 0.1], (d, world) => {
    const [bx, by] = iso(x, y, 0);
    const sway = Math.sin(world.t * 1.25 - (x + y) * 0.32) * 4;
    const tx = bx + sway;
    const ty = by - h * PX;
    d.amp = 0.25;
    d.stroke([bx, by, bx + sway * 0.4, by - h * PX * 0.5, tx, ty], 1.6, 1.0, T.pastoOsc, { taper0: 0, taper1: 0.1 });
    for (let i = 0; i < 4; i++) {
      const yy = by - h * PX * (0.15 + i * 0.18);
      const s = i % 2 ? 1 : -1;
      const xx = bx + sway * (0.15 + i * 0.18);
      d.fill([xx, yy, xx + s * 8, yy - 4, xx + s * 5, yy - 1, xx + s * 9, yy + 2, xx, yy + 2], T.pastoOsc, { amp: 0.3 });
    }
    d.fill(ellipsePts(tx, ty + 2, 3.2, 3.6, 8), I(0.15, 0.4, 0.35, 0.15), { outline: 0.6, amp: 0.3 });
    d.fill([tx - 3, ty - 1, tx - 2, ty - 7, tx, ty - 3, tx + 2, ty - 7, tx + 3, ty - 1], I(0.62, 0.0, 0.6, 0.08), { amp: 0.3 });
  });
}
