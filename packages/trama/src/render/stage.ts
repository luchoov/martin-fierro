import { iso, unIso, PX } from '../core/iso';
import { clamp, damp, type Vec2 } from '../core/math';
import { Drawer } from '../draw/drawer';
import type { InkSet } from '../print/ink';
import { RisoPrinter } from '../print/riso';
import { Separation } from '../print/separation';
import { World, type Item } from '../world/world';
import { Camera } from './camera';
import { Input } from './input';

/** Encuadre: un punto del mundo (m) y cuántos metros entran a lo ancho del cuadro. */
export interface Shot {
  x: number;
  y: number;
  z: number;
  span: number;
  /** Rigidez del resorte de cámara (más alto = más rápido). */
  stiffness?: number;
}

export interface StageOptions {
  inks: InkSet;
  /** Cuadros por segundo de la animación de personajes (dibujo "en dos"). */
  animFps?: number;
  maxDpr?: number;
  reducedMotion?: boolean;
  /** Imprimir apenas arranca (si no, esperar a print(true)). */
  autoPrint?: boolean;
  /** Fija un escalón de calidad (0 = el mejor) y apaga la adaptación. */
  quality?: number;
}

/** Rectángulo normalizado (0..1) sobre la pantalla; puede salirse para no tener borde de ese lado. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Lo que costó cada paso del último cuadro (ms). gpu* y sync = -1 si no hay medición. */
export interface FrameStats {
  /** Intervalo entre cuadros. */
  dt: number;
  update: number;
  /** Grabación de lo que se mueve (0 si en este cuadro no tocaba). */
  tick: number;
  /** Armado y subida de los triángulos de lo que se mueve (con la grabación). */
  pack: number;
  /** Si en este cuadro tocaba grabar (cuadro de animación). */
  ticked: boolean;
  /** Encargar las separaciones a la GPU (CPU). */
  sep: number;
  /** Encargar el shader de trama (CPU). */
  draw: number;
  gpuSep: number;
  gpuDraw: number;
  /** Impresión entera esperando a la GPU (?bench, o ?debug sin consulta de tiempos). */
  sync: number;
  drawn: boolean;
  ops: number;
  verts: number;
}

/**
 * Escalones de calidad: lo que se resigna cuando el equipo no llega. Nunca baja la
 * resolución de las separaciones (eso vuelve la lámina borrosa y corta las líneas):
 * primero la resolución del shader y los cuadros de animación.
 */
const LADDER = [
  { dpr: 2, fps: 15 },
  { dpr: 1.5, fps: 12 },
  { dpr: 1.25, fps: 10 },
  { dpr: 1, fps: 8 },
];

/** Duración total de la pasada de prensa (s): cuatro tintas escalonadas. */
const PRESS_END = 0.15 + 3 * 0.75 + 1.3;

/**
 * El escenario: un lienzo de pantalla completa donde se imprime el mundo. Une la cámara,
 * la entrada, la grabación de lo que se mueve y la imprenta.
 */
export class Stage {
  readonly world = new World();
  readonly camera = new Camera();
  readonly printer: RisoPrinter;
  readonly view = { w: 1, h: 1 };
  /** Rectángulo libre de texto, normalizado (0..1): ahí se centran los encuadres. */
  frame: Rect = { x0: 0, y0: 0, x1: 1, y1: 1 };
  /** Rectángulo impreso: fuera de él la tinta se desvanece y queda el papel (el margen del texto). */
  plate: Rect = { x0: -1, y0: -1, x1: 2, y1: 2 };
  /** Ancho del desvanecido del margen, en px CSS. */
  feather = 56;
  free = false;
  resumeAfter = 14;
  onFrame?: (dt: number) => void;
  onSettle?: () => void;
  readonly stats: FrameStats = { dt: 0, update: 0, tick: 0, pack: 0, ticked: false, sep: 0, draw: 0, gpuSep: -1, gpuDraw: -1, sync: -1, drawn: false, ops: 0, verts: 0 };
  /** Panel de medición (?debug), si hay uno. */
  debug?: { frame(s: FrameStats, stage: Stage): void };
  /** Recorrido fijo de cámara (benchmark): x, y en px de mundo y zoom. Reemplaza al encuadre y a la entrada. */
  rail?: (dt: number) => [number, number, number];
  private sep: Separation;
  private drawer = new Drawer();
  private shotSrc: Shot | (() => Shot) | null = null;
  private freeT = 0;
  private last = 0;
  private tickAcc = 1;
  private animFps: number;
  private q = 0;
  private fixedQ: boolean;
  private maxDpr: number;
  private ema = 1 / 60;
  private slowT = 0;
  private pressT = 0;
  private pressDir = 1;
  private running = false;
  private raf = 0;
  private wasMoving = true;
  private drewLast = false;
  private dirty = true;
  private viewKey = '';
  private platePx: [number, number, number, number] | null = null;

  constructor(readonly canvas: HTMLCanvasElement, opts: StageOptions) {
    this.printer = new RisoPrinter(canvas, opts.inks);
    this.sep = new Separation(this.printer.gl);
    this.animFps = opts.animFps ?? 15;
    this.maxDpr = opts.maxDpr ?? 2;
    if (opts.reducedMotion) this.world.boilHz = 0;
    if (opts.autoPrint === false) this.pressDir = 0;
    this.fixedQ = opts.quality !== undefined;
    new Input(canvas, this);
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    this.resize();
    if (opts.quality !== undefined) this.q = clamp(Math.round(opts.quality), 0, LADDER.length - 1);
    // Arranca más liviano en pantallas chicas.
    else if (Math.min(window.innerWidth, window.innerHeight) < 700) this.q = 1;
  }

  /** Graba todo lo fijo. Llamar una vez que la escena está armada. */
  bake(): void {
    this.world.bake(this.drawer);
    this.sep.setStatic(this.world.staticLayers());
    this.world.tick(this.drawer);
    this.sep.setDynamic(this.world.dynamicLayers(), this.world.topLayers());
  }

  get anchor(): Vec2 {
    const f = this.frame;
    return [((f.x0 + f.x1) / 2) * this.view.w, ((f.y0 + f.y1) / 2) * this.view.h];
  }

  /** Escalón de calidad actual (0 = el mejor). */
  get quality(): number {
    return this.q;
  }

  /** Muestras por píxel del suavizado de las separaciones. */
  get samples(): number {
    return this.sep.samples;
  }

  /** Resolución de las separaciones respecto de los px CSS: depende solo del equipo. */
  get sepScale(): number {
    return clamp(Math.min(this.maxDpr, window.devicePixelRatio || 1), 1, 1.5);
  }

  zoomFor(span: number): number {
    const f = this.frame;
    const w = (f.x1 - f.x0) * this.view.w;
    const h = (f.y1 - f.y0) * this.view.h;
    return clamp(Math.min(w / (span * PX), h / (span * PX * 0.62)), this.camera.minZ, this.camera.maxZ);
  }

  /** Posición de cámara (px de mundo) y zoom que corresponden a un encuadre. */
  camFor(s: Shot): [number, number, number] {
    const [x, y] = iso(s.x, s.y, s.z);
    return [x, y, this.zoomFor(s.span)];
  }

  /** Sigue un encuadre (fijo o calculado en cada cuadro). */
  shot(s: Shot | (() => Shot), immediate = false): void {
    this.shotSrc = s;
    this.free = false;
    this.freeT = 0;
    if (immediate) this.camera.jump(...this.camFor(typeof s === 'function' ? s() : s));
  }

  /** Pasada de prensa: true imprime tinta por tinta; false levanta la tinta y vuelve el papel en blanco. */
  print(on: boolean, immediate = false): void {
    this.pressDir = on ? 1 : -2.5;
    if (immediate) this.pressT = on ? PRESS_END : 0;
  }

  /** Lleva el margen de la lámina a su lugar sin animar (después de un cambio de tamaño). */
  snapPlate(): void {
    this.platePx = null;
    this.dirty = true;
  }

  userInput(): void {
    this.free = true;
    this.freeT = 0;
  }

  resumeFollow(): void {
    this.free = false;
    this.freeT = 0;
  }

  resize(): void {
    this.view.w = window.innerWidth;
    this.view.h = window.innerHeight;
    this.dirty = true;
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    const [ax, ay] = this.anchor;
    const c = this.camera;
    return [(sx - ax) / c.z + c.x, (sy - ay) / c.z + c.y];
  }

  zoomAt(f: number, sx: number, sy: number, immediate: boolean): void {
    const c = this.camera;
    const [ax, ay] = this.anchor;
    const wx = (sx - ax) / c.tz + c.tx;
    const wy = (sy - ay) / c.tz + c.ty;
    const z = clamp(c.tz * f, c.minZ, c.maxZ);
    c.aim(wx - (sx - ax) / z, wy - (sy - ay) / z, z, immediate ? 80 : 9);
  }

  pick(sx: number, sy: number): Item | null {
    const [wx, wy] = this.screenToWorld(sx, sy);
    const pad = 4 / this.camera.z;
    const list = this.world.sorted;
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      if (!it.onClick || !it.visible) continue;
      const b = it.b;
      if (wx >= b[0] - pad && wx <= b[2] + pad && wy >= b[1] - pad && wy <= b[3] + pad) return it;
    }
    return null;
  }

  tap(sx: number, sy: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy);
    const it = this.pick(sx, sy);
    if (it?.onClick) it.onClick(this.world, [wx, wy]);
    else this.world.onGroundClick?.(unIso(wx, wy));
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Detiene el bucle propio (el benchmark avanza los cuadros con step). */
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const raw = (now - this.last) / 1000;
    this.last = now;
    // Solo el intervalo que sigue a un cuadro dibujado dice cuánto cuesta dibujar.
    if (this.drewLast && !this.fixedQ) this.adapt(raw);
    this.stats.dt = raw * 1000;
    this.step(clamp(raw, 0, 0.05));
  };

  /** Avanza un cuadro: mundo, cámara, grabación y (si algo cambió) impresión. */
  step(dt: number): void {
    const st = this.stats;
    const t0 = performance.now();
    const pressing = this.animatePress(dt);

    if (this.free) {
      this.freeT += dt;
      if (this.freeT > this.resumeAfter) this.resumeFollow();
    }
    if (!this.free && this.shotSrc && !this.rail) {
      const s = typeof this.shotSrc === 'function' ? this.shotSrc() : this.shotSrc;
      const [x, y, z] = this.camFor(s);
      this.camera.aim(x, y, z, s.stiffness ?? 2.6);
    }
    this.onFrame?.(dt);
    this.world.update(dt);
    if (this.rail) {
      const [x, y, z] = this.rail(dt);
      this.camera.track(x, y, z, dt);
    } else this.camera.update(dt);
    this.world.zoom = this.camera.z;
    const moving = this.camera.moving;
    if (this.wasMoving && !moving) this.onSettle?.();
    this.wasMoving = moving;
    const t1 = performance.now();
    st.update = t1 - t0;

    st.tick = st.pack = 0;
    let ticked = false;
    const fps = Math.min(this.animFps, LADDER[this.q].fps);
    this.tickAcc += dt;
    if (this.tickAcc >= 1 / fps) {
      this.tickAcc %= 1 / fps;
      this.world.tick(this.drawer);
      ticked = true;
      const t2 = performance.now();
      st.tick = t2 - t1;
      this.sep.setDynamic(this.world.dynamicLayers(), this.world.topLayers());
      st.pack = performance.now() - t2;
    }
    st.ticked = ticked;

    const plateMoving = this.easePlate(dt);
    const c = this.camera;
    const [ax, ay] = this.anchor;
    // Redondeada: el resorte de la cámara se sigue acomodando en milésimas de píxel que no se ven.
    const key = `${c.x.toFixed(2)}|${c.y.toFixed(2)}|${c.z.toFixed(4)}|${ax}|${ay}|${this.view.w}|${this.view.h}`;
    // Si no cambió la vista ni hubo cuadro de animación, la lámina impresa sigue igual.
    const need = ticked || pressing || plateMoving || this.dirty || key !== this.viewKey;
    st.drawn = need;
    if (need) {
      this.viewKey = key;
      this.dirty = false;
      this.draw();
    } else {
      st.sep = st.draw = 0;
    }
    this.drewLast = need;
    this.debug?.frame(st, this);
  }

  private animatePress(dt: number): boolean {
    const prev = this.pressT;
    this.pressT = clamp(this.pressT + dt * this.pressDir, 0, PRESS_END);
    // Orden de pasada: ocre, celeste, punzó y por último la tinta de línea.
    const order = [2, 0, 1, 3];
    for (let i = 0; i < 4; i++) {
      const start = 0.15 + order[i] * 0.75;
      this.printer.press[i] = clamp((this.pressT - start) / 1.3);
    }
    return this.pressT !== prev;
  }

  /** Acerca el margen impreso a su destino; devuelve si todavía se mueve. */
  private easePlate(dt: number): boolean {
    const { w, h } = this.view;
    const p = this.plate;
    const target: [number, number, number, number] = [p.x0 * w, p.y0 * h, p.x1 * w, p.y1 * h];
    if (!this.platePx) {
      this.platePx = target;
      return true;
    }
    let moving = false;
    for (let i = 0; i < 4; i++) {
      const v = damp(this.platePx[i], target[i], 7, dt);
      this.platePx[i] = Math.abs(v - target[i]) < 0.3 ? target[i] : v;
      if (this.platePx[i] !== target[i]) moving = true;
    }
    return moving;
  }

  /** Baja la calidad si el equipo no llega a mantener el cuadro. */
  private adapt(raw: number): void {
    if (raw <= 0 || raw > 0.25) return;
    this.ema = this.ema * 0.95 + raw * 0.05;
    if (this.ema > 1 / 42 && this.q < LADDER.length - 1) {
      this.slowT += raw;
      if (this.slowT > 2.5) {
        this.q++;
        this.slowT = 0;
        this.ema = 1 / 60;
      }
    } else this.slowT = Math.max(0, this.slowT - raw);
  }

  private draw(): void {
    const st = this.stats;
    const dpr = Math.min(this.maxDpr, LADDER[this.q].dpr, window.devicePixelRatio || 1);
    const { w, h } = this.view;
    const c = this.camera;
    const [ax, ay] = this.anchor;
    const sep = this.sep;
    const printer = this.printer;
    const t0 = performance.now();
    sep.resize(w, h, this.sepScale);
    printer.gpu('gpuSep', () => sep.draw(this.world.variant, this.world.printOrder(), c.x, c.y, c.z, ax, ay));
    st.sep = performance.now() - t0;
    st.ops = sep.count;
    st.verts = sep.verts;
    printer.render(sep, {
      cssW: w,
      cssH: h,
      dpr,
      camX: c.x,
      camY: c.y,
      zoom: c.z,
      anchorX: ax,
      anchorY: ay,
      plate: this.platePx ?? [-w, -h, 2 * w, 2 * h],
      feather: this.feather,
    });
    st.draw = printer.timing.draw;
    st.gpuSep = printer.timing.gpuSep;
    st.gpuDraw = printer.timing.gpuDraw;
    st.sync = -1;
    if (printer.wait || (printer.measure && !printer.canTime)) {
      printer.finish();
      st.sync = performance.now() - t0;
    }
  }
}
