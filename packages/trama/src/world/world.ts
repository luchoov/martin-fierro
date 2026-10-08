import { iso, isoX, isoY, groundRadii } from '../core/iso';
import { Rng } from '../core/rng';
import type { Vec2 } from '../core/math';
import { Drawer } from '../draw/drawer';
import { ellipsePts, type Pts } from '../draw/hand';
import { EMPTY } from '../draw/mesh';
import { Ink } from '../print/ink';
import { Mode, type Layer, type Recording } from '../print/separation';
import type { Actor } from './actor';

/** Todo lo que se ordena por profundidad: objetos y actores. */
export interface Item {
  fx0: number;
  fy0: number;
  fx1: number;
  fy1: number;
  z0: number;
  b: number[];
  visible: boolean;
  carried?: boolean;
  /** Lugar fijo de la pieza en la tabla de profundidad de la impresión. */
  slot?: number;
  ops(w: World): Recording;
  record?(d: Drawer, w: World): void;
  /** Pie y altura cuando se grabó (lo grabado se corre con la pieza hasta la próxima vez). */
  at?: number[];
  /** Quedó fuera de lo que cubre la cámara: no se grabó ni se imprime. */
  culled?: boolean;
  onClick?: (w: World, at: Vec2) => void;
}

type DrawFn = (d: Drawer, w: World) => void;

/** Variantes de temblor: cada pieza fija se graba tres veces y se alternan a ~3 Hz. */
export const VARIANTS = 3;

/** Zoom hasta el que se tiene que ver bien lo que se graba una sola vez (curvas aplanadas). */
export const BAKE_ZOOM = 7;

/** Objeto fijo: se graba una vez por variante. */
export class Prop implements Item {
  fx0: number;
  fy0: number;
  fx1: number;
  fy1: number;
  z0: number;
  b: number[] = [0, 0, 0, 0];
  visible = true;
  slot?: number;
  onClick?: (w: World, at: Vec2) => void;
  private variants: Recording[] = [];

  constructor(fp: [number, number, number, number], readonly draw: DrawFn, readonly seed: number, z0 = 0) {
    [this.fx0, this.fy0, this.fx1, this.fy1] = fp;
    this.z0 = z0;
  }

  bake(d: Drawer, w: World): void {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (let v = 0; v < VARIANTS; v++) {
      d.begin(this.seed, v, 1).fine(BAKE_ZOOM);
      this.draw(d, w);
      this.variants[v] = d.take();
      b[0] = Math.min(b[0], d.b[0]);
      b[1] = Math.min(b[1], d.b[1]);
      b[2] = Math.max(b[2], d.b[2]);
      b[3] = Math.max(b[3], d.b[3]);
    }
    this.b = b;
  }

  ops(w: World): Recording {
    return this.variants[w.variant] ?? EMPTY;
  }

  /** La grabación de una variante de temblor. */
  rec(v: number): Recording {
    return this.variants[v] ?? EMPTY;
  }
}

/** Objeto que se mueve (pasto, fuego, faroles): se vuelve a grabar en cada cuadro de animación. */
export class Dyn implements Item {
  fx0: number;
  fy0: number;
  fx1: number;
  fy1: number;
  z0: number;
  b: number[] = [0, 0, 0, 0];
  visible = true;
  slot?: number;
  onClick?: (w: World, at: Vec2) => void;
  private recorded: Recording = EMPTY;

  constructor(fp: [number, number, number, number], readonly draw: DrawFn, readonly seed: number, z0 = 0) {
    [this.fx0, this.fy0, this.fx1, this.fy1] = fp;
    this.z0 = z0;
  }

  record(d: Drawer, w: World): void {
    d.begin(this.seed, w.variant, w.zoom);
    this.draw(d, w);
    this.recorded = d.take();
    this.b = d.b.slice();
  }

  ops(): Recording {
    return this.recorded;
  }
}

/** Charco de luz hecho de anillos de tinta escalonados, nunca un degradé. */
export interface Light {
  x: number;
  y: number;
  z: number;
  /** Radio del charco en el piso (m). */
  r: number;
  rings: number;
  /** Tinta que agrega cada anillo. */
  glow: Ink;
  /** Tinta que quita cada anillo (luz que disuelve la sombra). */
  clear?: Ink;
  /** Radio del halo alrededor de la llama (px de mundo). */
  halo?: number;
  flicker?: number;
  on: number;
}

/** Zona de sombra o tinte que se aplica encima de todo (antes de las luces). */
export interface Wash {
  pts: Pts;
  ink: Ink;
  on: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  kind: 'smoke' | 'spark' | 'dust' | 'firefly' | 'feather';
  seed: number;
}

export class World {
  t = 0;
  variant = 0;
  zoom = 1;
  boilHz = 3;
  rng = new Rng('trama');
  items: Item[] = [];
  actors: Actor[] = [];
  lights: Light[] = [];
  washes: Wash[] = [];
  particles: Particle[] = [];
  /** Regiones (px de mundo) sobre las que cae el tinte del atardecer. */
  duskRegion: Pts[] = [];
  dusk = 0;
  duskTarget = 0;
  duskInk = Ink.of(0.05, 0, 0.32, 0.2);
  sorted: Item[] = [];
  /** Lo que cubre la cámara (px de mundo, x0 y0 x1 y1): lo que se mueve fuera de acá no se graba. */
  cover = [-Infinity, -Infinity, Infinity, Infinity];
  private groundFns: { fn: DrawFn; seed: number }[] = [];
  private groundRecs: Recording[] = [];
  private overlayFns: DrawFn[] = [];
  private overlayRec: Recording = EMPTY;
  private lightRec: Recording = EMPTY;
  private hooks: ((dt: number, w: World) => void)[] = [];
  onGroundClick?: (at: Vec2) => void;

  /** Lo que siempre queda atrás: losa, piso, paredes del fondo, marcas de imprenta. */
  ground(fn: DrawFn, seed = this.groundFns.length + 1): void {
    this.groundFns.push({ fn, seed });
  }

  prop(fp: [number, number, number, number], fn: DrawFn, seed?: number, z0 = 0): Prop {
    const p = new Prop(fp, fn, seed ?? this.items.length * 7 + 11, z0);
    this.place(p);
    return p;
  }

  dyn(fp: [number, number, number, number], fn: DrawFn, seed?: number, z0 = 0): Dyn {
    const p = new Dyn(fp, fn, seed ?? this.items.length * 7 + 13, z0);
    this.place(p);
    return p;
  }

  add<A extends Actor>(a: A): A {
    this.actors.push(a);
    this.place(a);
    a.footprint();
    return a;
  }

  /** La pieza 0 es el piso; cada pieza tiene su lugar fijo en la tabla de profundidad. */
  private place(it: Item): void {
    this.items.push(it);
    it.slot = this.items.length;
  }

  /** Lugar de lo que va encima de todo (partículas y luces). */
  get topSlot(): number {
    return this.items.length + 1;
  }

  overlay(fn: DrawFn): void {
    this.overlayFns.push(fn);
  }

  light(l: Light): Light {
    this.lights.push(l);
    return l;
  }

  wash(w: Wash): Wash {
    this.washes.push(w);
    return w;
  }

  every(fn: (dt: number, w: World) => void): void {
    this.hooks.push(fn);
  }

  emit(p: Omit<Particle, 'seed' | 'life'> & { life?: number }): void {
    if (this.particles.length > 400) return;
    this.particles.push({ ...p, life: p.life ?? 0, seed: (Math.random() * 1e6) | 0 });
  }

  actor(name: string): Actor | undefined {
    return this.actors.find((a) => a.name === name);
  }

  bake(d: Drawer): void {
    for (let v = 0; v < VARIANTS; v++) {
      d.begin(0, v, 1).fine(BAKE_ZOOM);
      for (const g of this.groundFns) {
        d.reseed(g.seed * 977);
        g.fn(d, this);
      }
      this.groundRecs[v] = d.take();
    }
    for (const it of this.items) if (it instanceof Prop) it.bake(d, this);
  }

  /** Lo fijo de cada variante, para imprimir: el piso y las piezas que no se mueven. */
  staticLayers(): Layer[][] {
    const out: Layer[][] = [];
    for (let v = 0; v < VARIANTS; v++) {
      const layers: Layer[] = [{ rec: this.groundRecs[v] ?? EMPTY, slot: 0 }];
      for (const it of this.items) if (it instanceof Prop) layers.push({ rec: it.rec(v), slot: it.slot! });
      out.push(layers);
    }
    return out;
  }

  /** Lo que se volvió a grabar en este cuadro de animación. */
  dynamicLayers(): Layer[] {
    const out: Layer[] = [];
    for (const it of this.items) if (it.record && it.visible && !it.carried && !it.culled) out.push({ rec: it.ops(this), slot: it.slot! });
    return out;
  }

  /** Lo que va encima de todo, en orden: partículas y agregados de la escena, después las luces. */
  topLayers(): Layer[] {
    return [
      { rec: this.overlayRec, slot: this.topSlot },
      { rec: this.lightRec, slot: this.topSlot },
    ];
  }

  /** Orden de impresión: piso, piezas de atrás hacia adelante y lo de encima, con sus operaciones. */
  printOrder(): { slot: number; ops: number }[] {
    const out = [{ slot: 0, ops: (this.groundRecs[this.variant] ?? EMPTY).ops.length }];
    for (const it of this.sorted) out.push({ slot: it.slot!, ops: it.culled ? 0 : it.ops(this).ops.length });
    out.push({ slot: this.topSlot, ops: this.overlayRec.ops.length + this.lightRec.ops.length });
    return out;
  }

  update(dt: number): void {
    this.t += dt;
    this.variant = Math.floor(this.t * this.boilHz) % VARIANTS;
    this.dusk += (this.duskTarget - this.dusk) * (1 - Math.exp(-dt * 0.8));
    for (const h of this.hooks) h(dt, this);
    for (const a of this.actors) a.update(dt, this);
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life += dt;
      if (p.life >= p.max) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'smoke') {
        p.vx += Math.sin(this.t * 0.7 + p.seed) * dt * 3 + dt * 2.5;
        p.vy *= 1 - dt * 0.15;
      } else if (p.kind === 'spark') {
        p.vy += dt * 12;
        p.vx *= 1 - dt;
      } else if (p.kind === 'firefly') {
        p.vx += Math.sin(this.t * 1.3 + p.seed) * dt * 6;
        p.vy += Math.cos(this.t * 1.1 + p.seed * 0.3) * dt * 6;
        p.vx *= 1 - dt * 0.8;
        p.vy *= 1 - dt * 0.8;
      } else if (p.kind === 'feather') {
        p.vy += dt * 8;
        p.vx *= 1 - dt * 2;
        p.vy *= 1 - dt * 2.2;
      } else {
        p.vx *= 1 - dt * 2;
        p.vy *= 1 - dt * 2;
      }
    }
  }

  /** Cuadro de animación: graba lo que se mueve y reordena por profundidad. */
  tick(d: Drawer): void {
    for (const it of this.items) {
      if (!(it.record && it.visible && !it.carried)) continue;
      it.culled = !this.covers(it);
      if (it.culled) continue;
      it.record(d, this);
      const at = (it.at ??= [0, 0, 0]);
      at[0] = it.fx0;
      at[1] = it.fy0;
      at[2] = it.z0;
    }
    d.begin(4242, this.variant, this.zoom);
    for (const fn of this.overlayFns) fn(d, this);
    this.drawParticles(d);
    this.overlayRec = d.take();
    d.begin(5151, this.variant, this.zoom);
    this.drawLights(d);
    this.lightRec = d.take();
    this.sort();
  }

  /** Si lo último que grabó la pieza, corrido hasta donde está ahora, cae dentro de cover. */
  private covers(it: Item): boolean {
    const b = it.b;
    const a = it.at;
    // Sin grabar todavía, o sin nada grabado (puede aparecer en cualquier momento).
    if (!a || !(b[0] <= b[2])) return true;
    const dx = isoX(it.fx0, it.fy0) - isoX(a[0], a[1]);
    const dy = isoY(it.fx0, it.fy0, it.z0) - isoY(a[0], a[1], a[2]);
    const c = this.cover;
    return b[0] + dx < c[2] && b[2] + dx > c[0] && b[1] + dy < c[3] && b[3] + dy > c[1];
  }

  private drawParticles(d: Drawer): void {
    for (const p of this.particles) {
      const u = p.life / p.max;
      if (p.kind === 'smoke') {
        const r = p.r * (0.6 + u * 1.8);
        const k = (1 - u) * 0.32;
        d.fill(ellipsePts(p.x, p.y, r, r * 0.85, 9), Ink.of(0, 0, k * 0.6, k * 0.55), { mode: Mode.Over, amp: r * 0.12 });
      } else if (p.kind === 'spark') {
        d.dot(p.x, p.y, p.r * (1 - u * 0.6), Ink.of(0.7, 0.9, 0, 0), Mode.Add);
      } else if (p.kind === 'firefly') {
        const blink = Math.max(0, Math.sin(this.t * 2.6 + p.seed));
        if (blink > 0.2) {
          d.dot(p.x, p.y, p.r * 2.2, Ink.of(0, 0.18 * blink, 0, 0), Mode.Add);
          d.dot(p.x, p.y, p.r, Ink.of(0, 0.8 * blink, 0, 0), Mode.Add);
        }
      } else if (p.kind === 'feather') {
        d.stroke([p.x - p.r, p.y, p.x + p.r, p.y - p.r * 0.4], 1, 0.4, Ink.of(0, 0.1, 0.05, 0.4 * (1 - u)), { amp: 0.2 });
      } else {
        const r = p.r * (0.5 + u);
        d.fill(ellipsePts(p.x, p.y, r, r * 0.6, 8), Ink.of(0.12 * (1 - u), 0.25 * (1 - u), 0, 0.04 * (1 - u)), { mode: Mode.Over, amp: 0.3 });
      }
    }
  }

  private drawLights(d: Drawer): void {
    for (const w of this.washes) {
      if (w.on <= 0.01) continue;
      d.fill(w.pts, w.ink.scale(w.on), { mode: Mode.Add, amp: 0 });
    }
    if (this.dusk > 0.01 && this.duskRegion.length) {
      // El atardecer cae en escalones, como una tinta más.
      const steps = Math.round(this.dusk * 4) / 4;
      if (steps > 0) {
        // Un solo relleno para todas las regiones: donde se pisan no se suma dos veces.
        d.union(this.duskRegion, this.duskInk.scale(steps));
      }
    }
    for (const L of this.lights) {
      if (L.on <= 0.01) continue;
      const fl = L.flicker ?? 0;
      const flick = 1 + fl * (Math.sin(this.t * 13.1 + L.x) * 0.5 + Math.sin(this.t * 7.3 + L.y) * 0.5);
      const [gx, gy] = iso(L.x, L.y, 0);
      for (let k = 0; k < L.rings; k++) {
        const f = (1 - k / L.rings) * flick;
        const [rx, ry] = groundRadii(L.r * f);
        const pts = ellipsePts(gx, gy, rx, ry, 22);
        if (L.clear) d.fill(pts, L.clear.scale(L.on), { mode: Mode.Sub, amp: 0.8 });
        d.fill(pts, L.glow.scale(L.on), { mode: Mode.Add, amp: 0.8 });
      }
      if (L.halo) {
        const [hx, hy] = iso(L.x, L.y, L.z);
        for (let k = 0; k < 3; k++) {
          const r = L.halo * (1 - k * 0.3) * flick;
          d.fill(ellipsePts(hx, hy, r, r, 14), L.glow.scale(L.on * 0.9), { mode: Mode.Add, amp: 0.5 });
        }
      }
    }
  }

  /** Orden topológico: solo se comparan las piezas que se pisan en pantalla. */
  private sort(): void {
    const items = this.items.filter((i) => i.visible && !i.carried);
    const n = items.length;
    const before: number[][] = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      const a = items[i];
      for (let j = i + 1; j < n; j++) {
        const b = items[j];
        if (a.b[2] < b.b[0] || b.b[2] < a.b[0] || a.b[3] < b.b[1] || b.b[3] < a.b[1]) continue;
        const r = compare(a, b);
        if (r < 0) before[j].push(i);
        else if (r > 0) before[i].push(j);
      }
    }
    const order = Array.from({ length: n }, (_, i) => i).sort(
      (i, j) => items[i].fx0 + items[i].fx1 + items[i].fy0 + items[i].fy1 - (items[j].fx0 + items[j].fx1 + items[j].fy0 + items[j].fy1),
    );
    const state = new Uint8Array(n);
    const out: Item[] = [];
    const visit = (i: number) => {
      if (state[i]) return;
      state[i] = 1;
      for (const j of before[i]) visit(j);
      state[i] = 2;
      out.push(items[i]);
    };
    for (const i of order) visit(i);
    this.sorted = out;
  }
}

/** -1 si a va detrás de b, 1 si va delante. */
function compare(a: Item, b: Item): number {
  const e = 1e-3;
  const ax = a.fx1 <= b.fx0 + e;
  const bx = b.fx1 <= a.fx0 + e;
  const ay = a.fy1 <= b.fy0 + e;
  const by = b.fy1 <= a.fy0 + e;
  const aBehind = ax || ay;
  const bBehind = bx || by;
  if (aBehind && !bBehind) return -1;
  if (bBehind && !aBehind) return 1;
  if (a.z0 !== b.z0) return a.z0 < b.z0 ? -1 : 1;
  const sa = a.fx0 + a.fx1 + a.fy0 + a.fy1;
  const sb = b.fx0 + b.fx1 + b.fy0 + b.fy1;
  return sa < sb ? -1 : 1;
}
