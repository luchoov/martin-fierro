import type { FrameStats, Stage } from './stage';

/** Qué mide un tramo: cámara quieta (solo anima el mundo), paneo o zoom. */
export type BenchKind = 'quieto' | 'paneo' | 'zoom';

/**
 * Pasadas del recorrido:
 * - fluido: cuadros reales (requestAnimationFrame) sin esperar a la GPU; da los cuadros por segundo.
 * - desglose: espera a la GPU después de cada impresión; da lo que cuesta la impresión entera
 *   desde el envío de las separaciones hasta el shader y su espera.
 */
export type BenchPass = 'fluido' | 'desglose';

/** Un tramo del recorrido de cámara. */
export interface BenchLeg {
  name: string;
  kind: BenchKind;
  /** Cuadros medidos. */
  frames: number;
  /** Cuadros de calentamiento sin medir, después de setup (la cámara queda en cam(0)). */
  warmup?: number;
  /** Acomoda la escena antes del tramo (pasar de momento, por ejemplo). */
  setup?: () => void;
  /** Cámara en px de mundo y zoom, para u de 0 a 1. */
  cam: (u: number) => [number, number, number];
}

export interface BenchOptions {
  passes?: BenchPass[];
  /** Sin requestAnimationFrame (pestaña oculta): avanza con mensajes. Los intervalos no valen. */
  manual?: boolean;
  /** Paso de simulación fijo (s): el mundo anima igual en cada corrida. */
  dt?: number;
  /** Mostrar el progreso y el informe en pantalla. */
  overlay?: boolean;
}

/** Mediana y percentil 95 (ms), y cuántas muestras hubo. */
export interface Dist {
  p50: number;
  p95: number;
  n: number;
}

export interface BenchRow {
  name: string;
  kind: BenchKind | 'todo';
  /** Intervalo entre cuadros (pasada fluido). */
  frame?: Dist;
  /** Cuadros por segundo medidos y porcentaje de cuadros que no llegan a 60 Hz (> 20 ms). */
  fps?: number;
  late?: number;
  /** Impresiones por cuadro. */
  prints: number;
  /** Trabajo del hilo principal por cuadro (mundo + grabación/subida de mallas + cola + raster + shader). */
  cpu: Dist;
  update: Dist;
  tick: Dist;
  ground: Dist;
  items: Dist;
  raster: Dist;
  draw: Dist;
  /** Impresión entera esperando a la GPU: piso + ítems + separaciones + shader (pasada desglose). */
  print?: Dist;
  /** Raster + resolve WebGL2, o subida de los lienzos 2D, medido en la GPU. */
  gpuRaster?: Dist;
  /** Shader medido en la GPU (si el navegador ofrece la consulta de tiempos). */
  gpu?: Dist;
  ops: number;
}

export interface BenchReport {
  meta: Record<string, string | number | boolean>;
  rows: BenchRow[];
  text: string;
  markdown: string;
}

interface Sample {
  interval: number;
  update: number;
  tick: number;
  ticked: boolean;
  ground: number;
  items: number;
  raster: number;
  draw: number;
  sync: number;
  gpuRaster: number;
  gpu: number;
  drawn: boolean;
  ops: number;
}

const sample = (s: FrameStats, interval: number): Sample => ({
  interval,
  update: s.update,
  tick: s.tick,
  ticked: s.ticked,
  ground: s.drawn ? s.ground : 0,
  items: s.drawn ? s.items : 0,
  raster: s.drawn ? s.raster : 0,
  draw: s.drawn ? s.draw : 0,
  sync: s.drawn ? s.sync : -1,
  gpuRaster: s.drawn ? s.gpuRaster : -1,
  gpu: s.drawn ? s.gpuDraw : -1,
  drawn: s.drawn,
  ops: s.drawn ? s.ops : 0,
});

function dist(v: number[]): Dist {
  if (!v.length) return { p50: NaN, p95: NaN, n: 0 };
  const s = Float64Array.from(v).sort();
  // Rango más cercano: con pocas muestras el p95 es la más alta que no es un caso aislado.
  const at = (q: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
  return { p50: at(0.5), p95: at(0.95), n: s.length };
}

const cpuOf = (s: Sample) => s.update + s.tick + s.ground + s.items + s.raster + s.draw;

function row(name: string, kind: BenchRow['kind'], fluid: Sample[], split: Sample[]): BenchRow {
  // Los tiempos de CPU salen de la pasada fluida si la hubo (la otra frena a propósito).
  const base = fluid.length ? fluid : split;
  const drawn = base.filter((s) => s.drawn);
  const r: BenchRow = {
    name,
    kind,
    prints: base.length ? drawn.length / base.length : 0,
    cpu: dist(base.map(cpuOf)),
    update: dist(base.map((s) => s.update)),
    tick: dist(base.filter((s) => s.ticked).map((s) => s.tick)),
    ground: dist(drawn.map((s) => s.ground)),
    items: dist(drawn.map((s) => s.items)),
    raster: dist(drawn.map((s) => s.raster)),
    draw: dist(drawn.map((s) => s.draw)),
    ops: dist(drawn.map((s) => s.ops)).p50,
  };
  if (fluid.length) {
    const iv = fluid.map((s) => s.interval);
    r.frame = dist(iv);
    const total = iv.reduce((a, b) => a + b, 0);
    r.fps = total > 0 ? (iv.length * 1000) / total : 0;
    r.late = iv.filter((v) => v > 20).length / iv.length;
  }
  const printed = split.filter((s) => s.drawn && s.sync >= 0);
  if (printed.length) r.print = dist(printed.map((s) => s.ground + s.items + s.sync));
  const gpu = split.filter((s) => s.drawn && s.gpu >= 0);
  if (gpu.length) r.gpu = dist(gpu.map((s) => s.gpu));
  const gpuRaster = split.filter((s) => s.drawn && s.gpuRaster >= 0);
  if (gpuRaster.length) r.gpuRaster = dist(gpuRaster.map((s) => s.gpuRaster));
  return r;
}

const COLS: { key: keyof BenchRow; label: string }[] = [
  { key: 'frame', label: 'cuadro' },
  { key: 'cpu', label: 'CPU/cuadro' },
  { key: 'tick', label: 'grabación' },
  { key: 'ground', label: 'piso CPU' },
  { key: 'items', label: 'ítems CPU' },
  { key: 'raster', label: 'separaciones CPU' },
  { key: 'draw', label: 'shader CPU' },
  { key: 'print', label: 'impresión+GPU' },
  { key: 'gpuRaster', label: 'separaciones GPU' },
  { key: 'gpu', label: 'shader GPU' },
];

const num = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '–');
const cell = (d: Dist | undefined) => (d && d.n ? `${num(d.p50)}/${num(d.p95)}` : '–');

function format(meta: BenchReport['meta'], rows: BenchRow[]): { text: string; markdown: string } {
  const webgl = meta.rasterizador === 'webgl2';
  const labels: Partial<Record<keyof BenchRow, string>> = webgl
    ? { tick: 'grabación+mallas', ground: 'cola piso CPU', items: 'cola ítems CPU', raster: 'envío+resolve CPU', gpuRaster: 'raster+resolve GPU' }
    : { raster: 'raster 2D+subida CPU', gpuRaster: 'subida GPU' };
  const head = ['tramo', 'fps', '>20ms', 'impr/c', ...COLS.map((c) => labels[c.key] ?? c.label), 'ops'];
  const body = rows.map((r) => [
    r.name,
    r.fps === undefined ? '–' : num(r.fps, 0),
    r.late === undefined ? '–' : `${num(r.late * 100, 0)}%`,
    num(r.prints, 2),
    ...COLS.map((c) => cell(r[c.key] as Dist | undefined)),
    num(r.ops, 0),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
  const metaLines = Object.entries(meta).map(([k, v]) => `${k}: ${v}`);
  const text = [
    'TRAMA · benchmark (ms, mediana/p95)',
    ...metaLines,
    '',
    line(head),
    ...body.map((b, i) => (rows[i].kind === 'todo' && (i === 0 || rows[i - 1].kind !== 'todo') ? `\n${line(b)}` : line(b))),
  ].join('\n');
  const md = [
    `| ${head.join(' | ')} |`,
    `| ${head.map((_, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`,
    ...body.map((b) => `| ${b.join(' | ')} |`),
  ].join('\n');
  const markdown = `${metaLines.map((l) => `- ${l}`).join('\n')}\n\nms, mediana/p95\n\n${md}`;
  return { text, markdown };
}

function gpuName(stage: Stage): string {
  const gl = stage.canvas.getContext('webgl2');
  if (!gl) return '?';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
}

/** Espera el próximo cuadro (o, sin requestAnimationFrame, el próximo mensaje). */
function ticker(manual: boolean): () => Promise<number> {
  if (!manual) return () => new Promise((r) => requestAnimationFrame(r));
  const ch = new MessageChannel();
  let wake: (() => void) | null = null;
  ch.port1.onmessage = () => wake?.();
  return () =>
    new Promise((r) => {
      wake = () => r(performance.now());
      ch.port2.postMessage(0);
    });
}

class Overlay {
  readonly el = document.createElement('aside');
  private pre = document.createElement('pre');
  private bar = document.createElement('div');

  constructor() {
    this.el.className = 'trama-bench';
    this.el.style.cssText =
      'position:fixed;top:8px;left:8px;z-index:60;padding:8px 10px;background:rgba(245,236,218,.96);color:#26283A;' +
      'font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;border:1px solid rgba(38,40,58,.35);max-width:calc(100vw - 16px);' +
      'max-height:calc(100vh - 16px);overflow:auto;box-sizing:border-box';
    this.pre.style.cssText = 'margin:0;font:inherit;white-space:pre';
    this.bar.style.cssText = 'display:flex;gap:8px;margin-top:8px';
    this.el.append(this.pre);
    document.body.append(this.el);
  }

  progress(s: string): void {
    this.pre.textContent = s;
  }

  done(r: BenchReport): void {
    this.pre.textContent = r.text;
    const btn = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'font:inherit;padding:3px 8px;background:#f6eedd;color:inherit;border:1px solid rgba(38,40,58,.45);cursor:pointer';
      b.addEventListener('click', fn);
      this.bar.append(b);
      return b;
    };
    const copy = btn('Copiar (Markdown)', () => {
      void navigator.clipboard?.writeText(r.markdown).then(
        () => (copy.textContent = 'Copiado'),
        () => (copy.textContent = 'No se pudo copiar: está en la consola'),
      );
    });
    btn('Cerrar', () => this.el.remove());
    this.el.append(this.bar);
  }
}

/**
 * Recorre los tramos con la cámara en un riel y un paso de simulación fijo, y devuelve la
 * mediana y el percentil 95 de cada etapa del cuadro. Fija la calidad mientras mide.
 */
export async function runBench(stage: Stage, legs: BenchLeg[], o: BenchOptions = {}): Promise<BenchReport> {
  const manual = o.manual ?? false;
  const passes = o.passes ?? (manual ? ['desglose'] : ['fluido', 'desglose']);
  const dt = o.dt ?? 1 / 60;
  const overlay = o.overlay === false ? null : new Overlay();
  const next = ticker(manual);
  const printer = stage.printer;
  const was = { measure: printer.measure, wait: printer.wait };
  const samples: Record<BenchPass, Sample[][]> = { fluido: [], desglose: [] };
  stage.stop();
  try {
    for (const pass of passes) {
      printer.wait = pass === 'desglose';
      printer.measure = pass === 'desglose' || was.measure;
      for (let li = 0; li < legs.length; li++) {
        const leg = legs[li];
        const out: Sample[] = [];
        samples[pass][li] = out;
        leg.setup?.();
        const warm = leg.warmup ?? 10;
        let u = 0;
        stage.rail = () => leg.cam(u);
        let last = await next();
        for (let f = 0; f < warm + leg.frames; f++) {
          const now = await next();
          const interval = now - last;
          last = now;
          u = f < warm ? 0 : (f - warm) / Math.max(1, leg.frames - 1);
          stage.step(dt);
          if (f >= warm) out.push(sample(stage.stats, interval));
          if (overlay && f % 15 === 0) overlay.progress(`TRAMA · benchmark\npasada ${pass} (${passes.indexOf(pass) + 1}/${passes.length})\ntramo ${li + 1}/${legs.length}: ${leg.name}\n${Math.round((100 * f) / (warm + leg.frames))}%`);
        }
      }
    }
  } finally {
    stage.rail = undefined;
    printer.measure = was.measure;
    printer.wait = was.wait;
    stage.start();
  }

  const get = (pass: BenchPass, i: number) => samples[pass][i] ?? [];
  const rows: BenchRow[] = legs.map((leg, i) => row(leg.name, leg.kind, get('fluido', i), get('desglose', i)));
  for (const kind of ['quieto', 'paneo', 'zoom'] as const) {
    const idx = legs.map((l, i) => (l.kind === kind ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    rows.push(row(`todo ${kind}`, 'todo', idx.flatMap((i) => get('fluido', i)), idx.flatMap((i) => get('desglose', i))));
  }
  const all = legs.map((_, i) => i);
  rows.push(row('todo', 'todo', all.flatMap((i) => get('fluido', i)), all.flatMap((i) => get('desglose', i))));

  const sep = `${Math.round(stage.view.w * stage.sepScale)}×${Math.round(stage.view.h * stage.sepScale)}`;
  const meta: BenchReport['meta'] = {
    fecha: new Date().toISOString().slice(0, 16).replace('T', ' '),
    navegador: navigator.userAgent.replace(/^Mozilla\/5\.0 /, ''),
    gpu: gpuName(stage),
    vista: `${stage.view.w}×${stage.view.h} css · dpr ${window.devicePixelRatio || 1}`,
    lamina: `${stage.canvas.width}×${stage.canvas.height}`,
    separaciones: `${sep} (×${stage.sepScale})`,
    calidad: `q${stage.quality}`,
    rasterizador: stage.raster,
    pasadas: passes.join(' + ') + (manual ? ' (manual: sin requestAnimationFrame)' : ''),
  };
  const { text, markdown } = format(meta, rows);
  const report: BenchReport = { meta, rows, text, markdown };
  console.log(text);
  overlay?.done(report);
  return report;
}

/** Tramos de paneo y zoom alrededor de encuadres (cámara en px de mundo y zoom). */
export const rails = {
  still: (c: [number, number, number]) => () => c,
  /** Ida y vuelta de costado, con algo de vaivén vertical; a recorre una fracción del ancho visible. */
  pan:
    (c: [number, number, number], viewW: number, a = 0.25) =>
    (u: number): [number, number, number] => {
      const A = (a * viewW) / c[2];
      return [c[0] + A * Math.sin(2 * Math.PI * u), c[1] + A * 0.3 * Math.sin(4 * Math.PI * u), c[2]];
    },
  /** De un encuadre a otro: posición lineal y zoom geométrico, con arranque y frenada suaves. */
  zoom:
    (a: [number, number, number], b: [number, number, number]) =>
    (u: number): [number, number, number] => {
      const e = u * u * (3 - 2 * u);
      return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] * Math.pow(b[2] / a[2], e)];
    },
};
