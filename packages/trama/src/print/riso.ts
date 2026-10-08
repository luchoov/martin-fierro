import { clamp, smoothstep } from '../core/math';
import { hexToRgb, type InkSet } from './ink';
import type { Separation } from './separation';

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Cada tinta se trama por separado con su propio ángulo, su desregistro y sus fallas,
// y se imprime multiplicando sobre el papel: los secundarios salen de la superposición.
const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uA;
uniform sampler2D uB;
uniform vec2 uView;
uniform float uDpr;
uniform vec2 uCam;
uniform vec2 uAnchor;
uniform float uZoom;
uniform float uCell;
uniform float uScreen;
uniform vec3 uInk[4];
uniform vec4 uAng;
uniform vec2 uMis[4];
uniform vec3 uPaper;
uniform vec4 uPress;
uniform vec4 uPlate;
uniform float uFeather;
uniform float uSeed;
out vec4 outColor;

float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x),
             mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Peso de un detalle de frecuencia f (ciclos por px de mundo): se apaga antes de que
// quede más chico que un píxel de dispositivo, en vez de chisporrotear.
float lod(float f) {
  return 1.0 - smoothstep(0.2, 0.45, f / (uZoom * uDpr));
}

// Grano fino del papel: dos octavas ancladas al mundo elegidas según el zoom, así siempre
// mide unos pocos píxeles de dispositivo y no se mueve al arrastrar.
float fineGrain(vec2 w) {
  float e = log2(uZoom * uDpr);
  float e0 = floor(e);
  float g0 = vn(w * 0.3 * exp2(e0) + e0 * 13.7);
  float g1 = vn(w * 0.3 * exp2(e0 + 1.0) + (e0 + 1.0) * 13.7);
  return mix(g0, g1, e - e0);
}

void main() {
  vec2 css = vec2(gl_FragCoord.x, uView.y * uDpr - gl_FragCoord.y) / uDpr;
  vec2 w = (css - uAnchor) / uZoom + uCam;

  // Papel: grano fino, nubes de fibra, fibras sueltas y alguna mota.
  float grain = (fineGrain(w) - 0.5) * 0.035
    + (vn(w * 0.08) - 0.5) * 0.025 * lod(0.08)
    + (vn(vec2(w.x * 0.03, w.y * 0.9)) - 0.5) * 0.015 * lod(0.9);
  vec3 col = uPaper * (1.005 + grain);
  col *= 1.0 - step(0.9975, h21(floor(w * 0.7))) * 0.08 * lod(0.7);

  // Margen de la lámina: hacia el texto la tinta se va en puntos cada vez más chicos,
  // con un borde irregular, como un pliego entintado a mano.
  vec2 a = css - uPlate.xy;
  vec2 b = uPlate.zw - css;
  float edge = min(min(a.x, b.x), min(a.y, b.y)) + (vn(css * 0.03) - 0.5) * uFeather * 0.5;
  float plate = smoothstep(0.0, uFeather, edge);
  if (plate <= 0.0) {
    outColor = vec4(col, 1.0);
    return;
  }

  float sweep = css.y / uView.y;

  for (int i = 0; i < 4; i++) {
    vec2 wi = w + uMis[i];
    vec2 uv = ((wi - uCam) * uZoom + uAnchor) / uView;
    float d;
    float line = 0.0;
    if (i == 3) {
      vec4 k = texture(uB, uv);
      d = k.r;
      // Máscara de línea: trazos y contornos de tinta clave salen plenos, sin trama.
      line = smoothstep(0.3, 0.62, k.g) * smoothstep(0.15, 0.85, plate);
    } else {
      vec4 c = texture(uA, uv);
      d = i == 0 ? c.r : i == 1 ? c.g : c.b;
    }
    d *= plate;
    if (d < 0.003 && line < 0.003) continue;

    // Pasada de prensa: cada tinta entra de arriba hacia abajo, una detrás de otra.
    float press = uPress[i] * 1.25 - 0.12 * vn(vec2(w.x * 0.02, float(i) * 7.0));
    if (sweep > press) continue;

    // Tambor desparejo: la carga de tinta varía en zonas grandes.
    d *= 0.9 + 0.14 * vn(wi * 0.011 + float(i) * 17.0 + uSeed);

    // Trama de puntos. Si la celda queda más chica que unos 3-4 px de dispositivo,
    // los puntos se funden en tono parejo (como el ojo ve una lámina desde lejos).
    float cov = d;
    if (uScreen > 0.0) {
      float ca = cos(uAng[i]);
      float sa = sin(uAng[i]);
      vec2 g = mat2(ca, sa, -sa, ca) * wi / uCell;
      vec2 id = floor(g);
      vec2 f = fract(g) - 0.5;
      f += (vec2(h21(id + float(i) * 9.1), h21(id.yx + float(i) * 3.7)) - 0.5) * 0.18 * (1.0 - d);
      float spot = 0.5 - 0.25 * (cos(6.2831853 * f.x) + cos(6.2831853 * f.y));
      float dd = d * (0.94 + 0.12 * h21(id * 1.7 + float(i)));
      float aa = max(fwidth(spot), 0.02) * 0.75;
      cov = mix(d, smoothstep(spot - aa, spot + aa, dd), uScreen);
    }
    cov = max(cov, smoothstep(0.86, 0.97, d));

    // Fallas en los plenos: manchas sin tinta y poros del papel (los poros se apagan de lejos).
    float n = vn(wi * 0.045 + float(i) * 31.0) * 0.65 + mix(0.5, vn(wi * 0.42 + float(i) * 7.0), lod(0.42)) * 0.35;
    float solid = smoothstep(0.5, 0.92, d);
    float drop = smoothstep(0.64, 0.86, n) * 0.5 + step(0.991, h21(floor(wi * 0.85) + float(i) * 5.0)) * 0.75 * lod(0.85);
    cov *= 1.0 - solid * drop * (1.0 - line);
    cov = max(cov, line);

    col *= mix(vec3(1.0), uInk[i], cov);
  }
  outColor = vec4(col, 1.0);
}`;

export interface PrintView {
  cssW: number;
  cssH: number;
  dpr: number;
  camX: number;
  camY: number;
  zoom: number;
  anchorX: number;
  anchorY: number;
  /** Rectángulo impreso (px CSS): fuera de él queda el papel (el margen del texto). */
  plate: [number, number, number, number];
  /** Ancho (px CSS) del borde donde la tinta se desvanece. */
  feather: number;
}

/** Tiempos del último cuadro impreso (ms). gpu* = -1 si no hay medición. */
export interface PrintTiming {
  upload: number;
  draw: number;
  gpuUpload: number;
  gpuDraw: number;
  /** Medición sincrónica (subida + shader esperando a la GPU), si no hay consulta de tiempos. */
  sync: number;
}

type TimerExt = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };

export class RisoPrinter {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private texA: WebGLTexture;
  private texB: WebGLTexture;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private sizeA = '';
  private sizeB = '';
  private inkRgb: number[] = [];
  private angles: number[] = [];
  private mis: number[] = [];
  private paper: [number, number, number];
  /** Celda de trama en px de mundo, y límites en px de pantalla (CSS). */
  cell = 3.2;
  minCellPx = 2.4;
  maxCellPx = 5.2;
  /** Por debajo de toneBelow px de dispositivo la celda es tono parejo; desde dotsAbove, puntos. */
  toneBelow = 3;
  dotsAbove = 4;
  /** Progreso de la pasada de prensa por tinta (0..1). */
  press: [number, number, number, number] = [1, 1, 1, 1];
  /** Medir tiempos de GPU (modo ?debug). */
  measure = false;
  /** Esperar a la GPU después de cada impresión (benchmark): sync mide raster 2D + subida + shader. */
  wait = false;
  readonly timing: PrintTiming = { upload: 0, draw: 0, gpuUpload: -1, gpuDraw: -1, sync: -1 };
  /** Celda (px de dispositivo) y mezcla puntos/tono del último cuadro. */
  cellDev = 0;
  screen = 1;
  private timer: TimerExt | null | undefined;
  private queries: { q: WebGLQuery; kind: 'gpuUpload' | 'gpuDraw' }[] = [];
  private pixel = new Uint8Array(4);

  constructor(readonly canvas: HTMLCanvasElement, inks: InkSet) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('Trama necesita WebGL2');
    this.gl = gl;
    this.prog = this.link(VERT, FRAG);
    this.texA = this.makeTex();
    this.texB = this.makeTex();
    for (const name of ['uA', 'uB', 'uView', 'uDpr', 'uCam', 'uAnchor', 'uZoom', 'uCell', 'uScreen', 'uInk', 'uAng', 'uMis', 'uPaper', 'uPress', 'uPlate', 'uFeather', 'uSeed']) {
      this.u[name] = gl.getUniformLocation(this.prog, name);
    }
    this.paper = hexToRgb(inks.paper);
    for (const ink of inks.inks) {
      this.inkRgb.push(...hexToRgb(ink.hex));
      this.angles.push((ink.angle * Math.PI) / 180);
      this.mis.push(ink.misreg[0], ink.misreg[1]);
    }
    gl.bindVertexArray(gl.createVertexArray());
  }

  private link(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    return p;
  }

  private makeTex(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private upload(tex: WebGLTexture, src: HTMLCanvasElement, unit: number, which: 'A' | 'B'): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const size = `${src.width}x${src.height}`;
    const prev = which === 'A' ? this.sizeA : this.sizeB;
    if (prev !== size) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      if (which === 'A') this.sizeA = size;
      else this.sizeB = size;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
    }
  }

  /** Celda de trama en px CSS para un zoom y su mezcla puntos/tono para un dpr. */
  screenFor(zoom: number, dpr: number): { cellPx: number; cellDev: number; screen: number } {
    const cellPx = clamp(this.cell * zoom, this.minCellPx, this.maxCellPx);
    const cellDev = cellPx * dpr;
    return { cellPx, cellDev, screen: smoothstep(this.toneBelow, this.dotsAbove, cellDev) };
  }

  render(sep: Separation, v: PrintView): void {
    const gl = this.gl;
    const W = Math.round(v.cssW * v.dpr);
    const H = Math.round(v.cssH * v.dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    if (this.measure) this.collect();
    const timer = this.measure ? this.timerExt() : null;

    const t0 = performance.now();
    let q = timer ? this.begin(timer, 'gpuUpload') : null;
    this.upload(this.texA, sep.c1, 0, 'A');
    this.upload(this.texB, sep.c2, 1, 'B');
    if (q && timer) gl.endQuery(timer.TIME_ELAPSED_EXT);
    const t1 = performance.now();

    gl.viewport(0, 0, W, H);
    gl.useProgram(this.prog);
    const u = this.u;
    gl.uniform1i(u.uA, 0);
    gl.uniform1i(u.uB, 1);
    gl.uniform2f(u.uView, v.cssW, v.cssH);
    gl.uniform1f(u.uDpr, v.dpr);
    gl.uniform2f(u.uCam, v.camX, v.camY);
    gl.uniform2f(u.uAnchor, v.anchorX, v.anchorY);
    gl.uniform1f(u.uZoom, v.zoom);
    // La trama está anclada al mundo (se agranda al acercarse, como una lupa sobre el papel)
    // pero se limita en pantalla; la decisión puntos/tono se toma en px de dispositivo.
    const s = this.screenFor(v.zoom, v.dpr);
    this.cellDev = s.cellDev;
    this.screen = s.screen;
    gl.uniform1f(u.uCell, s.cellPx / v.zoom);
    gl.uniform1f(u.uScreen, s.screen);
    gl.uniform3fv(u.uInk, this.inkRgb);
    gl.uniform4fv(u.uAng, this.angles);
    gl.uniform2fv(u.uMis, this.mis);
    gl.uniform3fv(u.uPaper, this.paper);
    gl.uniform4fv(u.uPress, this.press);
    gl.uniform4fv(u.uPlate, v.plate);
    gl.uniform1f(u.uFeather, Math.max(1, v.feather));
    gl.uniform1f(u.uSeed, 0);
    q = timer ? this.begin(timer, 'gpuDraw') : null;
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (q && timer) gl.endQuery(timer.TIME_ELAPSED_EXT);
    const t2 = performance.now();

    this.timing.upload = t1 - t0;
    this.timing.draw = t2 - t1;
    this.timing.sync = -1;
    if (this.wait || (this.measure && !timer)) {
      // Se espera a la GPU leyendo un píxel (frena, pero mide todo lo que la impresión le encargó).
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pixel);
      this.timing.sync = performance.now() - t0;
    }
  }

  private timerExt(): TimerExt | null {
    if (this.timer === undefined) this.timer = this.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
    return this.timer;
  }

  private begin(ext: TimerExt, kind: 'gpuUpload' | 'gpuDraw'): WebGLQuery | null {
    if (this.queries.length > 8) return null;
    const q = this.gl.createQuery();
    if (!q) return null;
    this.gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    this.queries.push({ q, kind });
    return q;
  }

  /** Lee las consultas de tiempo de GPU que ya terminaron (llegan unos cuadros después). */
  private collect(): void {
    const gl = this.gl;
    const ext = this.timer;
    if (!ext) return;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    while (this.queries.length) {
      const { q, kind } = this.queries[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.queries.shift();
      if (!disjoint) this.timing[kind] = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(q);
    }
  }
}
