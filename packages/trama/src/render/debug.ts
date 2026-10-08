import type { FrameStats, Stage } from './stage';

/** Etapas que se apilan en el gráfico, con el color de la tinta que las representa. */
const PARTS: { key: keyof FrameStats; label: string; color: string }[] = [
  { key: 'update', label: 'mundo', color: '#9a9a9a' },
  { key: 'tick', label: 'grabación', color: '#EBA834' },
  { key: 'ground', label: 'piso', color: '#5C9DC9' },
  { key: 'items', label: 'dibujo', color: '#C9392E' },
  { key: 'upload', label: 'raster 2D + subida', color: '#26283A' },
  { key: 'gpuDraw', label: 'shader', color: '#7a5aa6' },
];

const N = 180;

/**
 * Panel de medición (se abre con ?debug): cuánto cuesta cada paso del cuadro. Los tiempos de
 * CPU salen de performance.now(); los de GPU, de EXT_disjoint_timer_query_webgl2 si el
 * navegador lo ofrece, y si no, esperando a la GPU con una lectura de un píxel.
 * Ojo: con lienzo 2D acelerado, parte del dibujo se ejecuta recién al subirlo a la GPU.
 */
export class DebugPanel {
  readonly el = document.createElement('aside');
  private text = document.createElement('pre');
  private graph = document.createElement('canvas');
  private hist = new Float32Array(N * PARTS.length);
  private drawn = new Uint8Array(N);
  private head = 0;
  private avg: Record<string, number> = {};
  private nextPaint = 0;
  private frames = 0;
  private draws = 0;
  private since = performance.now();
  private fps = 0;
  private drawsPerS = 0;
  private frameBox = document.createElement('div');

  constructor(stage: Stage) {
    stage.printer.measure = true;
    stage.debug = this;
    this.el.className = 'trama-debug';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.style.cssText =
      'position:fixed;top:8px;right:8px;z-index:50;padding:8px 10px;background:rgba(245,236,218,.94);color:#26283A;' +
      'font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;border:1px solid rgba(38,40,58,.35);pointer-events:none;min-width:250px';
    this.text.style.cssText = 'margin:0 0 6px;font:inherit;white-space:pre';
    this.graph.width = N;
    this.graph.height = 70;
    this.graph.style.cssText = `width:${N * 1.5}px;height:105px;display:block;image-rendering:pixelated`;
    this.el.append(this.text, this.graph, this.legend());
    document.body.append(this.el);
    this.frameBox.style.cssText = 'position:fixed;z-index:49;pointer-events:none;border:1px dashed rgba(201,57,46,.7)';
    document.body.append(this.frameBox);
  }

  private legend(): HTMLElement {
    const l = document.createElement('div');
    l.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px 8px;margin-top:4px';
    for (const p of PARTS) {
      const s = document.createElement('span');
      s.innerHTML = `<i style="display:inline-block;width:8px;height:8px;background:${p.color};margin-right:3px"></i>${p.label}`;
      l.append(s);
    }
    return l;
  }

  frame(s: FrameStats, stage: Stage): void {
    const i = this.head;
    this.head = (this.head + 1) % N;
    for (let k = 0; k < PARTS.length; k++) {
      let v = s[PARTS[k].key] as number;
      if (PARTS[k].key === 'gpuDraw') v = s.drawn ? Math.max(0, s.gpuDraw >= 0 ? s.gpuDraw : s.sync) : 0;
      this.hist[i * PARTS.length + k] = v;
      // Promedio solo sobre los cuadros que dibujaron (los demás no cuestan nada).
      if (s.drawn || PARTS[k].key === 'update' || PARTS[k].key === 'tick') {
        const a = this.avg[PARTS[k].key] ?? v;
        this.avg[PARTS[k].key] = a + (v - a) * 0.08;
      }
    }
    if (s.drawn) this.avg.draw = (this.avg.draw ?? s.draw) + (s.draw - (this.avg.draw ?? s.draw)) * 0.08;
    this.drawn[i] = s.drawn ? 1 : 0;
    this.frames++;
    if (s.drawn) this.draws++;
    const now = performance.now();
    if (now - this.since > 1000) {
      this.fps = (this.frames * 1000) / (now - this.since);
      this.drawsPerS = (this.draws * 1000) / (now - this.since);
      this.frames = this.draws = 0;
      this.since = now;
    }
    if (now < this.nextPaint) return;
    this.nextPaint = now + 250;
    this.paint(s, stage);
  }

  private paint(s: FrameStats, stage: Stage): void {
    const a = this.avg;
    const f = (v: number | undefined) => (v === undefined ? '  –  ' : v.toFixed(2).padStart(5));
    const p = stage.printer;
    const dprOut = stage.canvas.width / Math.max(1, stage.view.w);
    const gpu = s.gpuDraw >= 0 ? `shader GPU  ${f(a.gpuDraw)} ms   subida GPU ${f(s.gpuUpload)}` : s.sync >= 0 ? `subida+shader (esperando GPU) ${f(a.gpuDraw)} ms` : 'shader GPU   sin medición';
    const total = (a.update ?? 0) + (a.tick ?? 0) + (a.ground ?? 0) + (a.items ?? 0) + (a.upload ?? 0) + (a.draw ?? 0);
    this.text.textContent = [
      `TRAMA · debug          calidad q${stage.quality}`,
      `${this.fps.toFixed(0).padStart(3)} cuadros/s · ${this.drawsPerS.toFixed(0).padStart(2)} impresos/s`,
      `mundo + cámara   ${f(a.update)} ms`,
      `grabación        ${f(a.tick)} ms  (al animar)`,
      `piso             ${f(a.ground)} ms  ${s.cached ? 'caché' : 'redibujo'}`,
      `dibujo           ${f(a.items)} ms  ${s.ops} ops`,
      `raster 2D+subida ${f(a.upload)} ms  (el lienzo 2D se pinta al subirlo)`,
      `shader (CPU)     ${f(a.draw)} ms`,
      `CPU por cuadro   ${f(total)} ms`,
      gpu,
      `lienzo  ${stage.canvas.width}×${stage.canvas.height} (×${dprOut.toFixed(2)})`,
      `separ.  ${Math.round(stage.view.w * stage.sepScale)}×${Math.round(stage.view.h * stage.sepScale)} (×${stage.sepScale.toFixed(2)})`,
      `zoom ${stage.camera.z.toFixed(2)} · celda ${p.cellDev.toFixed(1)} px disp · ${p.screen <= 0 ? 'tono' : p.screen >= 1 ? 'puntos' : `puntos ${(p.screen * 100).toFixed(0)}%`}`,
    ].join('\n');
    this.plot();
    const fr = stage.frame;
    const b = this.frameBox.style;
    b.left = `${fr.x0 * stage.view.w}px`;
    b.top = `${fr.y0 * stage.view.h}px`;
    b.width = `${(fr.x1 - fr.x0) * stage.view.w}px`;
    b.height = `${(fr.y1 - fr.y0) * stage.view.h}px`;
  }

  private plot(): void {
    const g = this.graph.getContext('2d')!;
    const H = this.graph.height;
    const scale = H / 40; // 40 ms de alto
    g.clearRect(0, 0, N, H);
    for (let x = 0; x < N; x++) {
      const i = (this.head + x) % N;
      let y = H;
      for (let k = 0; k < PARTS.length; k++) {
        const v = this.hist[i * PARTS.length + k] * scale;
        if (v <= 0) continue;
        g.fillStyle = PARTS[k].color;
        g.fillRect(x, y - v, 1, v);
        y -= v;
      }
      if (!this.drawn[i]) {
        g.fillStyle = 'rgba(38,40,58,.18)';
        g.fillRect(x, H - 2, 1, 2);
      }
    }
    g.fillStyle = 'rgba(201,57,46,.6)';
    g.fillRect(0, Math.round(H - 16.7 * scale), N, 1);
    g.fillStyle = 'rgba(38,40,58,.35)';
    g.fillRect(0, Math.round(H - 33.3 * scale), N, 1);
  }
}
