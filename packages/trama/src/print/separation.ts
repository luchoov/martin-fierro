import type { Ink } from './ink';

/**
 * Modos de tinta:
 * - Fill: la forma "calada" reemplaza todo lo de abajo (knock-out de imprenta).
 * - Over: sobreimpresión; cada tinta queda con el máximo entre lo que había y lo nuevo.
 * - Add:  suma tinta (las luces apiladas forman anillos escalonados).
 * - Sub:  quita tinta en proporción (la luz que disuelve la sombra).
 */
export const Mode = { Fill: 0, Over: 1, Add: 2, Sub: 3 } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];

/** Una operación de tinta: una tinta y un modo sobre un rango de triángulos de su grabación. */
export interface Op {
  m: Mode;
  i: Ink;
  /** Opacidad (actores que se desvanecen). */
  a: number;
  /** Línea de tinta clave: marca la máscara de línea, que se imprime plena y sin trama. */
  l: boolean;
  /**
   * Contornos que se pisan con orientaciones contrarias: se imprime contando vueltas (regla
   * distinta de cero, como fill() del lienzo 2D), y no en lote.
   */
  u: boolean;
  /** Vértices [v0, v1), índices [t0, t1) y segmentos de eje [s0, s1) dentro de la grabación. */
  v0: number;
  v1: number;
  t0: number;
  t1: number;
  s0: number;
  s1: number;
}

/**
 * Lo que graba una pieza: triángulos en px de mundo (pos: x, y; idx: de a tres), ejes de trazos
 * (seg: x0, y0, x1, y1, grosor) y las operaciones que los pintan, en orden.
 */
export interface Recording {
  pos: Float32Array;
  idx: Uint32Array;
  seg: Float32Array;
  ops: Op[];
}

/** Una capa para imprimir: su grabación y su lugar (pieza) en el orden de profundidad. */
export interface Layer {
  rec: Recording;
  slot: number;
}

// Vértice: x, y (f32) · tinta a, b, c, k (u8) · alfa, línea (u8) · pieza, orden (u16).
const VSTRIDE = 20;
// Segmento de eje: x0, y0, x1, y1, grosor (f32) · tinta (u8) · alfa, línea, punta inicial y final (u8) · pieza, orden (u16).
const SSTRIDE = 32;
const MODES = 4;

const TRI_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec4 aInk;
layout(location = 2) in vec4 aFlag;
layout(location = 3) in uvec2 aMeta;
uniform vec4 uView;
uniform highp sampler2D uBase;
uniform float uTotal;
out vec4 vInk;
out vec2 vFlag;
void main() {
  float base = texelFetch(uBase, ivec2(int(aMeta.x & 1023u), int(aMeta.x >> 10u)), 0).r;
  vInk = aInk;
  vFlag = aFlag.xy;
  // Pieza oculta: fuera del recorte.
  if (base < 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  float z = 1.0 - 2.0 * (base + float(aMeta.y) + 1.0) / (uTotal + 2.0);
  gl_Position = vec4(aPos * uView.xy + uView.zw, z, 1.0);
}`;

// Eje de un trazo fino: un rectángulo de minLine px de pantalla alrededor de cada segmento.
const AXIS_VS = `#version 300 es
layout(location = 0) in vec4 aSeg;
layout(location = 1) in vec4 aInk;
layout(location = 2) in vec4 aFlag;
layout(location = 3) in uvec2 aMeta;
layout(location = 4) in float aW;
uniform vec4 uView;
uniform highp sampler2D uBase;
uniform float uTotal;
uniform float uThin;
out vec4 vInk;
out vec2 vFlag;
void main() {
  float base = texelFetch(uBase, ivec2(int(aMeta.x & 1023u), int(aMeta.x >> 10u)), 0).r;
  vInk = aInk;
  vFlag = aFlag.xy;
  if (base < 0.0 || aW >= uThin) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vec2 d = aSeg.zw - aSeg.xy;
  float L = length(d);
  vec2 t = L > 1e-5 ? d / L : vec2(1.0, 0.0);
  vec2 n = vec2(-t.y, t.x);
  // Como las líneas finas del lienzo 2D: un píxel por columna (o fila), sea cual sea el ángulo.
  float h = uThin * 0.5 * max(abs(t.x), abs(t.y));
  // Las líneas finas no llevan tapa; solo se cierran las juntas entre segmentos de un mismo trazo.
  vec2 cap = (1.0 - aFlag.zw) * h;
  int k = gl_VertexID == 3 ? 1 : gl_VertexID == 4 ? 3 : gl_VertexID == 5 ? 2 : gl_VertexID;
  vec2 p = (k < 2 ? aSeg.xy - t * cap.x : aSeg.zw + t * cap.y) + n * ((k & 1) == 1 ? h : -h);
  float z = 1.0 - 2.0 * (base + float(aMeta.y) + 1.0) / (uTotal + 2.0);
  gl_Position = vec4(p * uView.xy + uView.zw, z, 1.0);
}`;

const FS = `#version 300 es
precision mediump float;
in vec4 vInk;
in vec2 vFlag;
uniform int uMode;
layout(location = 0) out vec4 o1;
layout(location = 1) out vec4 o2;
void main() {
  float a = vFlag.x;
  if (uMode == 0) {
    // Calado: reemplaza (o mezcla por opacidad), máscara de línea incluida.
    o1 = vec4(vInk.rgb, a);
    o2 = vec4(vInk.a, vFlag.y, 0.0, a);
  } else if (uMode == 3) {
    // Quitar: multiplica por 1 - tinta; no toca la máscara de línea.
    o1 = vec4(vInk.rgb * a, 1.0);
    o2 = vec4(vInk.a * a, 0.0, 0.0, 1.0);
  } else {
    o1 = vec4(vInk.rgb * a, a);
    o2 = vec4(vInk.a * a, vFlag.y * a, 0.0, a);
  }
}`;

/** Un juego de búferes en la GPU: triángulos e índices agrupados por modo, y ejes. */
interface Batch {
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
  sbo: WebGLBuffer;
  triVao: WebGLVertexArrayObject;
  axisVao: WebGLVertexArrayObject;
  /** Por modo: [primer índice, cantidad] y [primer segmento, cantidad]. */
  tri: [number, number][];
  axis: [number, number][];
  /** Grosor de cada segmento de eje, de menor a mayor dentro de cada modo (en lo que no va en orden). */
  widths: Float32Array;
  /** Por modo: operaciones que se imprimen contando vueltas, una por una. */
  nz: [number, number][][];
  /** Calados translúcidos (actores que se desvanecen): después de los opacos y en orden. */
  trans: [number, number];
  /** Tramos en orden (para lo que va encima de todo, donde importa la secuencia de modos). */
  runs: { m: Mode; u: boolean; t: [number, number]; s: [number, number] }[];
  verts: number;
}

/** Arma los arreglos de un juego de búferes a partir de capas. */
class Packer {
  private v = new ArrayBuffer(1 << 16);
  private s = new ArrayBuffer(1 << 14);
  private idx: Uint32Array[] = [];
  private nv = 0;
  private ns = 0;
  private ni: number[] = [];
  private segAt: number[][] = [];

  /** Pieza más alta que pasó por pack (la tabla de lugares tiene que cubrirla). */
  maxSlot = 0;

  pack(
    layers: Layer[],
    ordered: boolean,
  ): { v: Uint8Array; i: Uint32Array; s: Uint8Array; tri: [number, number][]; axis: [number, number][]; widths: Float32Array; nz: [number, number][][]; trans: [number, number]; runs: Batch['runs'] } {
    let verts = 0;
    let tris = 0;
    let segs = 0;
    for (const L of layers) {
      if (L.slot > this.maxSlot) this.maxSlot = L.slot;
      verts += L.rec.pos.length >> 1;
      tris += L.rec.idx.length;
      segs += L.rec.seg.length / 5;
    }
    if (this.v.byteLength < verts * VSTRIDE) this.v = new ArrayBuffer(Math.ceil(verts * 1.5) * VSTRIDE);
    if (this.s.byteLength < segs * SSTRIDE) this.s = new ArrayBuffer(Math.ceil(segs * 1.5 + 2) * SSTRIDE);
    // Sin orden: un grupo de índices por modo, otro por modo para las que cuentan vueltas y
    // uno para los calados translúcidos.
    const groups = ordered ? 1 : 2 * MODES + 1;
    const nzAt: [number, number][][] = [];
    // Rangos de cada operación calada: se imprimen de adelante hacia atrás (lo tapado no se pinta).
    const fills: number[] = [];
    for (let g = 0; g < groups; g++) {
      if (!this.idx[g] || this.idx[g].length < tris) this.idx[g] = new Uint32Array(Math.max(1024, tris * 1.5));
      this.ni[g] = 0;
      this.segAt[g] = [];
      nzAt[g] = [];
    }
    const f = new Float32Array(this.v);
    const b = new Uint8Array(this.v);
    const h = new Uint16Array(this.v);
    const sf = new Float32Array(this.s);
    const sb = new Uint8Array(this.s);
    const sh = new Uint16Array(this.s);
    this.nv = this.ns = 0;
    const runs: Batch['runs'] = [];
    for (const L of layers) {
      const { pos, idx, seg, ops } = L.rec;
      for (let k = 0; k < ops.length; k++) {
        const op = ops[k];
        const ink = op.i;
        const al = Math.round(op.a * 255);
        const ln = op.l ? 255 : 0;
        const g = ordered ? 0 : op.u ? MODES + op.m : op.m === Mode.Fill && op.a < 1 ? 2 * MODES : op.m;
        const base = this.nv - op.v0;
        for (let q = op.v0; q < op.v1; q++) {
          const o = this.nv * VSTRIDE;
          f[o >> 2] = pos[2 * q];
          f[(o >> 2) + 1] = pos[2 * q + 1];
          b[o + 8] = ink.a;
          b[o + 9] = ink.b;
          b[o + 10] = ink.c;
          b[o + 11] = ink.k;
          b[o + 12] = al;
          b[o + 13] = ln;
          h[(o >> 1) + 8] = L.slot;
          h[(o >> 1) + 9] = k;
          this.nv++;
        }
        const I = this.idx[g];
        const t0 = this.ni[g];
        for (let q = op.t0; q < op.t1; q++) I[this.ni[g]++] = idx[q] + base;
        const s0 = this.ns;
        for (let q = op.s0; q < op.s1; q++) {
          const o = this.ns * SSTRIDE;
          for (let e = 0; e < 5; e++) sf[(o >> 2) + e] = seg[5 * q + e];
          // Un trazo empieza o termina donde el segmento no sigue al anterior o al siguiente.
          sb[o + 26] = q === op.s0 || seg[5 * q - 3] !== seg[5 * q] || seg[5 * q - 2] !== seg[5 * q + 1] ? 255 : 0;
          sb[o + 27] = q === op.s1 - 1 || seg[5 * q + 5] !== seg[5 * q + 2] || seg[5 * q + 6] !== seg[5 * q + 3] ? 255 : 0;
          sb[o + 20] = ink.a;
          sb[o + 21] = ink.b;
          sb[o + 22] = ink.c;
          sb[o + 23] = ink.k;
          sb[o + 24] = al;
          sb[o + 25] = ln;
          sh[(o >> 1) + 14] = L.slot;
          sh[(o >> 1) + 15] = k;
          this.ns++;
        }
        if (ordered) {
          const last = runs[runs.length - 1];
          if (last && last.m === op.m && !last.u && !op.u) {
            last.t[1] += this.ni[0] - t0;
            last.s[1] += this.ns - s0;
          } else runs.push({ m: op.m, u: op.u, t: [t0, this.ni[0] - t0], s: [s0, this.ns - s0] });
        } else {
          this.segAt[op.m].push(s0, this.ns - s0);
          if (op.u) nzAt[g].push([t0, this.ni[g] - t0]);
          else if (g === Mode.Fill) fills.push(t0, this.ni[g] - t0);
        }
      }
    }
    // Índices juntos y agrupados por modo; los segmentos se reordenan igual.
    const total = this.ni.slice(0, groups).reduce((x, y) => x + y, 0);
    const i = new Uint32Array(total);
    const tri: [number, number][] = [];
    const nz: [number, number][][] = [];
    let trans: [number, number] = [0, 0];
    let at = 0;
    for (let g = 0; g < groups; g++) {
      if (g === Mode.Fill && !ordered) {
        let o = at;
        for (let r = fills.length - 2; r >= 0; r -= 2) {
          i.set(this.idx[g].subarray(fills[r], fills[r] + fills[r + 1]), o);
          o += fills[r + 1];
        }
      } else i.set(this.idx[g].subarray(0, this.ni[g]), at);
      if (g < MODES || ordered) tri.push([at, this.ni[g]]);
      else if (g < 2 * MODES) nz.push(nzAt[g].map(([t, n]) => [at + t, n]));
      else trans = [at, this.ni[g]];
      at += this.ni[g];
    }
    let s = new Uint8Array(this.s, 0, this.ns * SSTRIDE);
    const axis: [number, number][] = [];
    let widths = new Float32Array(0);
    if (ordered) axis.push([0, this.ns]);
    else {
      // Por modo y de más fino a más grueso: al imprimir se dibujan solo los que quedan finos.
      const out = new Uint8Array(this.ns * SSTRIDE);
      widths = new Float32Array(this.ns);
      let n = 0;
      for (let g = 0; g < MODES; g++) {
        const start = n;
        const list = this.segAt[g];
        const ids: number[] = [];
        for (let r = 0; r < list.length; r += 2) for (let q = list[r]; q < list[r] + list[r + 1]; q++) ids.push(q);
        ids.sort((a, b) => sf[a * 8 + 4] - sf[b * 8 + 4]);
        for (const q of ids) {
          out.set(s.subarray(q * SSTRIDE, (q + 1) * SSTRIDE), n * SSTRIDE);
          widths[n++] = sf[q * 8 + 4];
        }
        axis.push([start, n - start]);
      }
      s = out;
    }
    return { v: new Uint8Array(this.v, 0, this.nv * VSTRIDE), i, s, tri, axis, widths, nz, trans, runs };
  }
}

/**
 * Las separaciones, dibujadas directo en la GPU: un framebuffer multisample con dos salidas.
 * c1 lleva las tintas A, B, C en RGB; c2 lleva la clave en R y la máscara de línea en G.
 * Negro = papel sin tinta. El orden de profundidad se resuelve con el búfer de profundidad:
 * cada operación tiene su lugar (pieza + orden) y los calados escriben profundidad; así los
 * modos se agrupan en pocas llamadas: calados, sobreimpresiones, sumas y restas.
 */
export class Separation {
  /** Textura resuelta de c1 y de c2 (las lee el shader de trama). */
  texA!: WebGLTexture;
  texB!: WebGLTexture;
  scale = 1;
  w = 1;
  h = 1;
  /** Grosor mínimo de un trazo, en px de pantalla (CSS). */
  minLine = 1;
  /** Muestras por píxel del suavizado. */
  samples: number;
  /** Operaciones y vértices de la última impresión (para medir). */
  count = 0;
  verts = 0;
  private triProg: WebGLProgram;
  private axisProg: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null>[] = [];
  private ms: WebGLFramebuffer;
  private rbs: WebGLRenderbuffer[] = [];
  private fbA: WebGLFramebuffer;
  private fbB: WebGLFramebuffer;
  private baseTex: WebGLTexture;
  private base = new Float32Array(1024);
  private packer = new Packer();
  private statics: Batch[] = [];
  private dynamic: Batch;
  private top: Batch;

  constructor(readonly gl: WebGL2RenderingContext) {
    this.samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number);
    this.triProg = link(gl, TRI_VS, FS);
    this.axisProg = link(gl, AXIS_VS, FS);
    for (const p of [this.triProg, this.axisProg]) {
      const u: Record<string, WebGLUniformLocation | null> = {};
      for (const n of ['uView', 'uBase', 'uTotal', 'uThin', 'uMode']) u[n] = gl.getUniformLocation(p, n);
      this.u.push(u);
    }
    this.ms = gl.createFramebuffer()!;
    this.fbA = gl.createFramebuffer()!;
    this.fbB = gl.createFramebuffer()!;
    this.baseTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.baseTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1024, 1, 0, gl.RED, gl.FLOAT, null);
    this.dynamic = this.batch();
    this.top = this.batch();
  }

  private batch(): Batch {
    const gl = this.gl;
    const b: Batch = {
      vbo: gl.createBuffer()!,
      ibo: gl.createBuffer()!,
      sbo: gl.createBuffer()!,
      triVao: gl.createVertexArray()!,
      axisVao: gl.createVertexArray()!,
      tri: [],
      axis: [],
      widths: new Float32Array(0),
      nz: [],
      trans: [0, 0],
      runs: [],
      verts: 0,
    };
    gl.bindVertexArray(b.triVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.ibo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, VSTRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, VSTRIDE, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, VSTRIDE, 12);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribIPointer(3, 2, gl.UNSIGNED_SHORT, VSTRIDE, 16);
    gl.bindVertexArray(b.axisVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.sbo);
    for (let a = 0; a < 5; a++) {
      gl.enableVertexAttribArray(a);
      gl.vertexAttribDivisor(a, 1);
    }
    this.axisPointers(0);
    gl.bindVertexArray(null);
    return b;
  }

  /** Apunta los atributos de los ejes al segmento first (WebGL2 no tiene instancia base). */
  private axisPointers(first: number): void {
    const gl = this.gl;
    const o = first * SSTRIDE;
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, SSTRIDE, o);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, SSTRIDE, o + 16);
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, SSTRIDE, o + 20);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, SSTRIDE, o + 24);
    gl.vertexAttribIPointer(3, 2, gl.UNSIGNED_SHORT, SSTRIDE, o + 28);
  }

  private fillBatch(b: Batch, layers: Layer[], ordered: boolean, usage: number): void {
    const gl = this.gl;
    const p = this.packer.pack(layers, ordered);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, p.v, usage);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, p.i, usage);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.sbo);
    gl.bufferData(gl.ARRAY_BUFFER, p.s, usage);
    b.tri = p.tri;
    b.axis = p.axis;
    b.widths = p.widths;
    b.nz = p.nz;
    b.trans = p.trans;
    b.runs = p.runs;
    b.verts = p.v.length / VSTRIDE;
  }

  /** Lo fijo, una vez por variante de temblor: piso y piezas que no se mueven. */
  setStatic(variants: Layer[][]): void {
    variants.forEach((layers, v) => {
      if (!this.statics[v]) this.statics[v] = this.batch();
      this.fillBatch(this.statics[v], layers, false, this.gl.STATIC_DRAW);
    });
  }

  /** Lo que se mueve (en cada cuadro de animación) y lo que va encima de todo, en orden. */
  setDynamic(layers: Layer[], top: Layer[]): void {
    this.fillBatch(this.dynamic, layers, false, this.gl.DYNAMIC_DRAW);
    this.fillBatch(this.top, top, true, this.gl.DYNAMIC_DRAW);
  }

  resize(cssW: number, cssH: number, scale: number): void {
    this.scale = scale;
    const w = Math.max(1, Math.round(cssW * scale));
    const h = Math.max(1, Math.round(cssH * scale));
    if (w === this.w && h === this.h && this.rbs.length) return;
    this.w = w;
    this.h = h;
    const gl = this.gl;
    for (const r of this.rbs) gl.deleteRenderbuffer(r);
    this.rbs = [];
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.ms);
    const att = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.DEPTH_STENCIL_ATTACHMENT];
    const fmt = [gl.RGBA8, gl.RGBA8, gl.DEPTH24_STENCIL8];
    for (let k = 0; k < 3; k++) {
      const rb = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, fmt[k], w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, att[k], gl.RENDERBUFFER, rb);
      this.rbs.push(rb);
    }
    for (const [fb, which] of [
      [this.fbA, 'texA'],
      [this.fbB, 'texB'],
    ] as const) {
      if (this[which]) gl.deleteTexture(this[which]);
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      this[which] = t;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Imprime las separaciones. variant: juego fijo a usar; order: piezas de atrás hacia
   * adelante con su cantidad de operaciones (la pieza 0, el piso, va siempre primero).
   */
  draw(variant: number, order: { slot: number; ops: number }[], camX: number, camY: number, zoom: number, anchorX: number, anchorY: number): void {
    const gl = this.gl;
    const st = this.statics[variant];
    // Lugar de cada pieza en el orden de profundidad (-1 = no se imprime).
    let maxSlot = this.packer.maxSlot;
    for (const o of order) maxSlot = Math.max(maxSlot, o.slot);
    const rows = Math.max(1, Math.ceil((maxSlot + 1) / 1024));
    if (this.base.length < rows * 1024) this.base = new Float32Array(rows * 1024);
    this.base.fill(-1);
    let acc = 0;
    for (const o of order) {
      this.base[o.slot] = acc;
      acc += o.ops;
    }
    this.count = acc;
    this.verts = (st?.verts ?? 0) + this.dynamic.verts + this.top.verts;
    gl.bindTexture(gl.TEXTURE_2D, this.baseTex);
    if (rows > 1 && this.baseRows !== rows) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1024, rows, 0, gl.RED, gl.FLOAT, null);
      this.baseRows = rows;
    }
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1024, rows, gl.RED, gl.FLOAT, this.base, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.ms);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, this.w, this.h);
    // Los borrados respetan las máscaras: se dejan abiertas antes de borrar.
    gl.colorMask(true, true, true, true);
    gl.depthMask(true);
    gl.stencilMask(0xff);
    gl.disable(gl.STENCIL_TEST);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 0]);
    gl.clearBufferfi(gl.DEPTH_STENCIL, 0, 1, 0);
    // Px de mundo a recorte; la fila 0 de la textura queda arriba, como en el lienzo 2D.
    const s = this.scale * zoom;
    const e = (anchorX - camX * zoom) * this.scale;
    const f = (anchorY - camY * zoom) * this.scale;
    const view = [(2 * s) / this.w, (2 * s) / this.h, (2 * e) / this.w - 1, (2 * f) / this.h - 1];
    const thin = this.minLine / zoom;
    for (let p = 0; p < 2; p++) {
      const u = this.u[p];
      gl.useProgram(p ? this.axisProg : this.triProg);
      gl.uniform4fv(u.uView, view);
      gl.uniform1i(u.uBase, 2);
      gl.uniform1f(u.uTotal, acc);
      gl.uniform1f(u.uThin, thin);
    }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.baseTex);
    gl.enable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    // Lo que se mueve suele estar adelante: va primero, así lo fijo de atrás se descarta.
    const batches = st ? [this.dynamic, st] : [this.dynamic];
    for (let m = 0; m < MODES; m++) {
      this.blend(m as Mode);
      gl.depthMask(m === Mode.Fill);
      for (const b of batches) {
        this.tris(b, b.tri[m]);
        this.axes(b, thinOnly(b, m, thin), m);
      }
      for (const b of batches) for (const r of b.nz[m] ?? []) this.nonzero(b, r, true, m === Mode.Fill);
      if (m === Mode.Fill) for (const b of batches) this.tris(b, b.trans);
    }
    gl.depthMask(true);
    gl.disable(gl.DEPTH_TEST);
    // Lo que va encima de todo (partículas, luces, atardecer): en orden, por tramos de un modo.
    const T = this.top;
    for (const r of T.runs) {
      this.blend(r.m);
      if (r.u) this.nonzero(T, r.t, false, false);
      else this.tris(T, r.t);
      this.axes(T, r.s, r.m);
    }
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    // Resolver el suavizado en las dos texturas.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.ms);
    for (const [k, fb] of [
      [0, this.fbA],
      [1, this.fbB],
    ] as const) {
      gl.readBuffer(gl.COLOR_ATTACHMENT0 + k);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fb);
      gl.blitFramebuffer(0, 0, this.w, this.h, 0, 0, this.w, this.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  }

  private baseRows = 1;

  /**
   * Una operación con la regla distinta de cero: primero se cuentan las vueltas en el
   * esténcil (sin color) y después se pinta donde no dan cero, dejándolo otra vez en cero.
   */
  private nonzero(b: Batch, r: [number, number], depth: boolean, writeDepth: boolean): void {
    if (!r[1]) return;
    const gl = this.gl;
    gl.enable(gl.STENCIL_TEST);
    gl.colorMask(false, false, false, false);
    // Con la prueba de profundidad puesta: lo que ya está tapado no se cuenta (ni cuesta).
    if (depth) gl.depthMask(false);
    gl.stencilFunc(gl.ALWAYS, 0, 0xff);
    gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
    gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
    this.tris(b, r);
    gl.colorMask(true, true, true, true);
    if (depth) gl.depthMask(writeDepth);
    gl.stencilFunc(gl.NOTEQUAL, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.ZERO, gl.ZERO);
    this.tris(b, r);
    gl.disable(gl.STENCIL_TEST);
  }

  private blend(m: Mode): void {
    const gl = this.gl;
    if (m === Mode.Over) gl.blendEquation(gl.MAX);
    else {
      gl.blendEquation(gl.FUNC_ADD);
      if (m === Mode.Fill) gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      else if (m === Mode.Add) gl.blendFunc(gl.ONE, gl.ONE);
      else gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
    }
    this.mode = m;
  }

  private mode: Mode = Mode.Fill;

  private tris(b: Batch, r: [number, number] | undefined): void {
    if (!r || !r[1]) return;
    const gl = this.gl;
    gl.useProgram(this.triProg);
    gl.uniform1i(this.u[0].uMode, this.mode);
    gl.bindVertexArray(b.triVao);
    gl.drawElements(gl.TRIANGLES, r[1], gl.UNSIGNED_INT, r[0] * 4);
  }

  private axes(b: Batch, r: [number, number] | undefined, m: number): void {
    if (!r || !r[1] || m === Mode.Sub) return;
    const gl = this.gl;
    gl.useProgram(this.axisProg);
    gl.uniform1i(this.u[1].uMode, this.mode);
    gl.bindVertexArray(b.axisVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.sbo);
    this.axisPointers(r[0]);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, r[1]);
  }
}

/** Del rango de ejes de un modo, solo los que con este zoom quedan más finos que el mínimo. */
function thinOnly(b: Batch, m: number, thin: number): [number, number] | undefined {
  const r = b.axis[m];
  if (!r || !r[1]) return r;
  let lo = r[0];
  let hi = r[0] + r[1];
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (b.widths[mid] < thin) lo = mid + 1;
    else hi = mid;
  }
  return [r[0], lo - r[0]];
}

export function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
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
