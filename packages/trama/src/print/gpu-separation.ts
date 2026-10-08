import { Mode, type Op } from './separation';

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aDelta;
layout(location=2) in vec2 aQuad;
layout(location=3) in float aWidth;
layout(location=4) in float aAlpha;
layout(location=5) in vec4 aInk;
layout(location=6) in float aLine;
uniform vec2 uSize;
uniform vec2 uCam;
uniform vec2 uAnchor;
uniform float uScale;
uniform float uZoom;
uniform float uMinLine;
flat out vec4 vInk;
flat out float vAlpha;
flat out float vLine;
flat out float vAxis;
flat out float vLength;
out vec2 vLocal;
void main() {
  vec2 p = aPos;
  vAxis = aWidth >= 0.0 ? 1.0 : 0.0;
  vLocal = vec2(0.0);
  vLength = 0.0;
  if (vAxis > 0.0) {
    float len = max(length(aDelta), 0.000001);
    vec2 dir = aDelta / len;
    float t = aQuad.x * 0.5 + 0.5;
    float halfWidth = uMinLine / uZoom * 0.5;
    p += aDelta * t + (dir * aQuad.x + vec2(-dir.y, dir.x) * aQuad.y) * halfWidth;
    vLength = len * uZoom;
    vLocal = vec2(t * vLength + aQuad.x * uMinLine * 0.5, aQuad.y * uMinLine * 0.5);
  }
  vec2 px = ((p - uCam) * uZoom + uAnchor) * uScale;
  // La fila inferior de la textura representa el borde superior del mundo, igual que Canvas.
  gl_Position = vec4(px / uSize * 2.0 - 1.0, 0.0, 1.0);
  vInk = aInk;
  vAlpha = aAlpha;
  vLine = aLine;
}`;

const FRAG = `#version 300 es
precision highp float;
flat in vec4 vInk;
flat in float vAlpha;
flat in float vLine;
flat in float vAxis;
flat in float vLength;
in vec2 vLocal;
uniform int uMode;
uniform float uMinLine;
layout(location=0) out vec4 outA;
layout(location=1) out vec4 outB;
void main() {
  // Cada segmento es una cápsula: las tapas cierran también las uniones del eje.
  if (vAxis > 0.0 && length(vec2(vLocal.x - clamp(vLocal.x, 0.0, vLength), vLocal.y)) > uMinLine * 0.5) discard;
  if (uMode == 0) {
    outA = vec4(vInk.rgb, vAlpha);
    outB = vec4(vInk.a, vLine, 0.0, vAlpha);
  } else if (uMode == 3) {
    outA = vec4(vec3(1.0) - vInk.rgb * vAlpha, 1.0);
    outB = vec4(1.0 - vInk.a * vAlpha, 1.0, 1.0, 1.0);
  } else {
    // MAX aproxima lighten con alfa parcial; Add usa la misma tinta premultiplicada.
    outA = vec4(vInk.rgb * vAlpha, 1.0);
    outB = vec4(vInk.a * vAlpha, vLine * vAlpha, 0.0, 1.0);
  }
}`;

// Posición, delta, esquina del eje, ancho, alfa, cuatro densidades byte y línea byte.
const PASO = 40;
const ESQUINAS = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];

interface Rango {
  op: Op;
  primero: number;
  relleno: number;
  ejes: number;
}

interface Malla {
  dinamica: boolean;
  generacion: number;
  base: number;
  baseIndices: number;
  indices: Uint32Array;
  rangos: Rango[];
}

interface Pase {
  malla: Malla;
  local: number;
  primero: number;
  cantidad: number;
  modo: Mode;
  unaVez: boolean;
}

interface Lote {
  inicio: number;
  cantidad: number;
  modo: Mode;
  unaVez: boolean;
}

/** Las separaciones viven en la misma GPU que la prensa: no se rasteriza ni se sube Canvas. */
export class GpuSeparation {
  readonly texA: WebGLTexture;
  readonly texB: WebGLTexture;
  scale = 1;
  w = 1;
  h = 1;
  zoom = 1;
  minLine = 1;
  count = 0;
  /** Draw calls de separación del último cuadro; los blits de MSAA van aparte. */
  draws = 0;
  /** Cantidad efectiva de muestras (0 en la calidad más baja). */
  samples = 0;
  private readonly programa: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly elementos: WebGLBuffer;
  private vertices: WebGLBuffer;
  private readonly destino: WebGLFramebuffer;
  private readonly resuelto: WebGLFramebuffer;
  private readonly colorA: WebGLRenderbuffer;
  private readonly colorB: WebGLRenderbuffer;
  private readonly stencil: WebGLRenderbuffer;
  private readonly maxMuestras: number;
  private readonly u: Record<string, WebGLUniformLocation | null> = {};
  private mallas = new WeakMap<readonly Op[], Malla>();
  private capacidadFija = 4096;
  private capacidadMovil = 4096;
  private usadosFijos = 0;
  private usadosMoviles = 0;
  private movil = new ArrayBuffer(4096 * PASO);
  private movilPendiente = false;
  private generacion = 0;
  private camX = 0;
  private camY = 0;
  private anchorX = 0;
  private anchorY = 0;
  private pases: Pase[] = [];
  private cantidadPases = 0;
  private anteriores: { primero: number; cantidad: number; modo: Mode; unaVez: boolean }[] = [];
  private lotes: Lote[] = [];
  private indices = new Uint32Array(4096);
  private capacidadIndices = 0;
  private terminado = false;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.programa = this.link();
    this.vao = gl.createVertexArray()!;
    this.elementos = gl.createBuffer()!;
    this.vertices = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);
    gl.bufferData(gl.ARRAY_BUFFER, (this.capacidadFija + this.capacidadMovil) * PASO, gl.DYNAMIC_DRAW);
    this.atributos();
    this.texA = this.textura();
    this.texB = this.textura();
    this.destino = gl.createFramebuffer()!;
    this.resuelto = gl.createFramebuffer()!;
    this.colorA = gl.createRenderbuffer()!;
    this.colorB = gl.createRenderbuffer()!;
    this.stencil = gl.createRenderbuffer()!;
    const colores = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA8, gl.SAMPLES) as Int32Array);
    const stencils = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, gl.SAMPLES) as Int32Array);
    this.maxMuestras = Math.max(0, ...colores.filter((n) => n <= 4 && stencils.includes(n)));
    for (const nombre of ['uSize', 'uCam', 'uAnchor', 'uScale', 'uZoom', 'uMinLine', 'uMode']) {
      this.u[nombre] = gl.getUniformLocation(this.programa, nombre);
    }
    this.asignarDestinos();
  }

  private link(): WebGLProgram {
    const gl = this.gl;
    const compilar = (tipo: number, fuente: string): WebGLShader => {
      const shader = gl.createShader(tipo)!;
      gl.shaderSource(shader, fuente);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader de separación');
      return shader;
    };
    const vertex = compilar(gl.VERTEX_SHADER, VERT);
    const fragment = compilar(gl.FRAGMENT_SHADER, FRAG);
    const programa = gl.createProgram()!;
    gl.attachShader(programa, vertex);
    gl.attachShader(programa, fragment);
    gl.linkProgram(programa);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(programa) ?? 'programa de separación');
    return programa;
  }

  private textura(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private atributos(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.elementos);
    for (const [n, cantidad, tipo, normalizado, offset] of [
      [0, 2, gl.FLOAT, false, 0],
      [1, 2, gl.FLOAT, false, 8],
      [2, 2, gl.FLOAT, false, 16],
      [3, 1, gl.FLOAT, false, 24],
      [4, 1, gl.FLOAT, false, 28],
      [5, 4, gl.UNSIGNED_BYTE, true, 32],
      [6, 1, gl.UNSIGNED_BYTE, true, 36],
    ] as const) {
      gl.enableVertexAttribArray(n);
      gl.vertexAttribPointer(n, cantidad, tipo, normalizado, PASO, offset);
    }
  }

  resize(cssW: number, cssH: number, scale: number, msaa = true): void {
    this.scale = scale;
    const w = Math.max(1, Math.round(cssW * scale));
    const h = Math.max(1, Math.round(cssH * scale));
    const muestras = msaa ? this.maxMuestras : 0;
    if (w === this.w && h === this.h && muestras === this.samples) return;
    this.w = w;
    this.h = h;
    this.samples = muestras;
    this.asignarDestinos();
  }

  private asignarDestinos(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.resuelto);
    for (const [tex, attachment] of [[this.texA, gl.COLOR_ATTACHMENT0], [this.texB, gl.COLOR_ATTACHMENT1]] as const) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.w, this.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, tex, 0);
    }
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, null);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Texturas de separación incompletas');
    if (this.samples) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.destino);
      for (const [color, attachment] of [[this.colorA, gl.COLOR_ATTACHMENT0], [this.colorB, gl.COLOR_ATTACHMENT1]] as const) {
        gl.bindRenderbuffer(gl.RENDERBUFFER, color);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, gl.RGBA8, this.w, this.h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachment, gl.RENDERBUFFER, color);
      }
    }
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.stencil);
    if (this.samples) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, gl.DEPTH24_STENCIL8, this.w, this.h);
    else gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, this.w, this.h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, this.stencil);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      if (this.samples) {
        this.samples = 0;
        this.asignarDestinos();
        return;
      }
      throw new Error('Framebuffer de separación incompleto');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Un nuevo bake reutiliza la arena sin conservar las variantes anteriores. */
  resetMeshes(): void {
    this.mallas = new WeakMap();
    this.usadosFijos = 0;
    this.beginDynamic();
    this.anteriores.length = 0;
    this.lotes.length = 0;
    this.cantidadPases = 0;
    this.terminado = false;
  }

  private ampliarArena(fijos: number, moviles: number): void {
    let capacidadFija = this.capacidadFija;
    let capacidadMovil = this.capacidadMovil;
    while (capacidadFija < fijos) capacidadFija *= 2;
    while (capacidadMovil < moviles) capacidadMovil *= 2;
    if (capacidadFija === this.capacidadFija && capacidadMovil === this.capacidadMovil) return;
    const gl = this.gl;
    const nuevo = gl.createBuffer()!;
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, nuevo);
    gl.bufferData(gl.COPY_WRITE_BUFFER, (capacidadFija + capacidadMovil) * PASO, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.COPY_READ_BUFFER, this.vertices);
    // Al crecer, las mallas fijas se copian dentro de GPU: no vuelven a subir desde CPU.
    if (this.usadosFijos) gl.copyBufferSubData(gl.COPY_READ_BUFFER, gl.COPY_WRITE_BUFFER, 0, 0, this.usadosFijos * PASO);
    gl.deleteBuffer(this.vertices);
    this.vertices = nuevo;
    this.capacidadFija = capacidadFija;
    this.capacidadMovil = capacidadMovil;
    this.movilPendiente = this.usadosMoviles > 0;
    this.atributos();
  }

  beginDynamic(): void {
    this.generacion++;
    this.usadosMoviles = 0;
    this.movilPendiente = true;
  }

  /** Todas las piezas móviles del tick comparten una sola subida. */
  endDynamic(): void {
    if (!this.movilPendiente) return;
    this.ampliarArena(this.usadosFijos, this.usadosMoviles);
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);
    if (this.usadosMoviles) gl.bufferSubData(gl.ARRAY_BUFFER, this.capacidadFija * PASO, new Uint8Array(this.movil, 0, this.usadosMoviles * PASO));
    this.movilPendiente = false;
  }

  prepare(ops: readonly Op[], dynamic = false): void {
    if (!ops.length) return;
    const anterior = this.mallas.get(ops);
    if (anterior && (!dynamic || anterior.generacion === this.generacion)) return;
    const rangos: Rango[] = [];
    let cantidad = 0;
    for (const op of ops) {
      const relleno = op.t.length / 2;
      const ejes = op.s ? op.s.length / 4 * 6 : 0;
      rangos.push({ op, primero: cantidad, relleno, ejes });
      cantidad += relleno + ejes;
    }
    const base = dynamic ? this.usadosMoviles : this.usadosFijos;
    let datos: ArrayBuffer;
    let inicio = 0;
    if (dynamic) {
      const necesarios = (base + cantidad) * PASO;
      if (necesarios > this.movil.byteLength) {
        let capacidad = this.movil.byteLength;
        while (capacidad < necesarios) capacidad *= 2;
        const nuevo = new ArrayBuffer(capacidad);
        new Uint8Array(nuevo).set(new Uint8Array(this.movil, 0, base * PASO));
        this.movil = nuevo;
      }
      datos = this.movil;
      inicio = base;
    } else {
      datos = new ArrayBuffer(cantidad * PASO);
    }
    const floats = new Float32Array(datos);
    const bytes = new Uint8Array(datos);
    let vertice = inicio;
    const escribir = (op: Op, x: number, y: number, dx = 0, dy = 0, qx = 0, qy = 0, ancho = -1): void => {
      const f = vertice * (PASO / 4);
      floats[f] = x;
      floats[f + 1] = y;
      floats[f + 2] = dx;
      floats[f + 3] = dy;
      floats[f + 4] = qx;
      floats[f + 5] = qy;
      floats[f + 6] = ancho;
      floats[f + 7] = op.a;
      const b = vertice * PASO;
      bytes[b + 32] = op.i.a;
      bytes[b + 33] = op.i.b;
      bytes[b + 34] = op.i.c;
      bytes[b + 35] = op.i.k;
      bytes[b + 36] = op.l ? 255 : 0;
      vertice++;
    };
    for (const op of ops) {
      for (let i = 0; i < op.t.length; i += 2) escribir(op, op.t[i], op.t[i + 1]);
      if (op.s) {
        for (let i = 0; i < op.s.length; i += 4) {
          const x = op.s[i];
          const y = op.s[i + 1];
          const dx = op.s[i + 2] - x;
          const dy = op.s[i + 3] - y;
          for (let q = 0; q < ESQUINAS.length; q += 2) escribir(op, x, y, dx, dy, ESQUINAS[q], ESQUINAS[q + 1], op.w ?? 0);
        }
      }
    }
    const malla: Malla = { dinamica: dynamic, generacion: this.generacion, base, baseIndices: -1, indices: new Uint32Array(cantidad), rangos };
    this.mallas.set(ops, malla);
    if (dynamic) {
      this.usadosMoviles += cantidad;
      this.movilPendiente = true;
    } else {
      this.ampliarArena(this.usadosFijos + cantidad, this.usadosMoviles);
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);
      gl.bufferSubData(gl.ARRAY_BUFFER, base * PASO, bytes);
      this.usadosFijos += cantidad;
    }
  }

  clear(): void {
    // El clear real va con los draws en finish, dentro de la medición de raster.
    this.count = 0;
    this.draws = 0;
    this.cantidadPases = 0;
    this.terminado = false;
  }

  setView(camX: number, camY: number, zoom: number, anchorX: number, anchorY: number): void {
    this.camX = camX;
    this.camY = camY;
    this.zoom = zoom;
    this.anchorX = anchorX;
    this.anchorY = anchorY;
  }

  play(ops: readonly Op[]): void {
    this.count += ops.length;
    if (!ops.length) return;
    let malla = this.mallas.get(ops);
    if (!malla) {
      this.prepare(ops);
      malla = this.mallas.get(ops)!;
    }
    const base = malla.base + (malla.dinamica ? this.capacidadFija : 0);
    if (malla.baseIndices !== base) {
      for (let i = 0; i < malla.indices.length; i++) malla.indices[i] = base + i;
      malla.baseIndices = base;
    }
    for (const rango of malla.rangos) {
      const op = rango.op;
      if (op.a <= 0) continue;
      const ejes = op.m !== Mode.Sub && (op.w ?? Infinity) < this.minLine / this.zoom ? rango.ejes : 0;
      const cantidad = rango.relleno + ejes;
      if (!cantidad) continue;
      const pase = this.pases[this.cantidadPases] ?? (this.pases[this.cantidadPases] = {} as Pase);
      pase.malla = malla;
      pase.local = rango.primero;
      pase.primero = base + rango.primero;
      pase.cantidad = cantidad;
      pase.modo = op.m;
      pase.unaVez = !!op.once || (op.m === Mode.Fill && op.a < 1);
      this.cantidadPases++;
    }
    this.terminado = false;
  }

  private ordenarIndices(): void {
    let iguales = this.anteriores.length === this.cantidadPases;
    let cantidad = 0;
    for (let i = 0; i < this.cantidadPases; i++) {
      const pase = this.pases[i];
      const anterior = this.anteriores[i];
      if (!anterior || anterior.primero !== pase.primero || anterior.cantidad !== pase.cantidad || anterior.modo !== pase.modo || anterior.unaVez !== pase.unaVez) iguales = false;
      cantidad += pase.cantidad;
    }
    // Mover la cámara no vuelve a subir ni vértices ni índices mientras no cambie el recorte.
    if (iguales) return;
    if (cantidad > this.indices.length) {
      let capacidad = this.indices.length;
      while (capacidad < cantidad) capacidad *= 2;
      this.indices = new Uint32Array(capacidad);
    }
    this.lotes.length = 0;
    let inicio = 0;
    for (let i = 0; i < this.cantidadPases; i++) {
      const pase = this.pases[i];
      this.indices.set(pase.malla.indices.subarray(pase.local, pase.local + pase.cantidad), inicio);
      const ultimo = this.lotes[this.lotes.length - 1];
      if (ultimo && !ultimo.unaVez && !pase.unaVez && ultimo.modo === pase.modo) ultimo.cantidad += pase.cantidad;
      else this.lotes.push({ inicio, cantidad: pase.cantidad, modo: pase.modo, unaVez: pase.unaVez });
      const anterior = this.anteriores[i] ?? (this.anteriores[i] = {} as typeof this.anteriores[number]);
      anterior.primero = pase.primero;
      anterior.cantidad = pase.cantidad;
      anterior.modo = pase.modo;
      anterior.unaVez = pase.unaVez;
      inicio += pase.cantidad;
    }
    this.anteriores.length = this.cantidadPases;
    const gl = this.gl;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.elementos);
    if (cantidad > this.capacidadIndices) {
      this.capacidadIndices = this.indices.length;
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.capacidadIndices * 4, gl.STREAM_DRAW);
    }
    if (cantidad) gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, this.indices.subarray(0, cantidad));
  }

  finish(): void {
    if (this.terminado) return;
    this.endDynamic();
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.samples ? this.destino : this.resuelto);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, this.w, this.h);
    gl.bindVertexArray(this.vao);
    // Un prepare tardío puede haber agrandado la parte fija después de encolar un móvil.
    for (let i = 0; i < this.cantidadPases; i++) {
      const pase = this.pases[i];
      const malla = pase.malla;
      const base = malla.base + (malla.dinamica ? this.capacidadFija : 0);
      if (malla.baseIndices !== base) {
        for (let n = 0; n < malla.indices.length; n++) malla.indices[n] = base + n;
        malla.baseIndices = base;
      }
      pase.primero = base + pase.local;
    }
    this.ordenarIndices();
    gl.useProgram(this.programa);
    gl.uniform2f(this.u.uSize, this.w, this.h);
    gl.uniform2f(this.u.uCam, this.camX, this.camY);
    gl.uniform2f(this.u.uAnchor, this.anchorX, this.anchorY);
    gl.uniform1f(this.u.uScale, this.scale);
    gl.uniform1f(this.u.uZoom, this.zoom);
    gl.uniform1f(this.u.uMinLine, this.minLine);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    gl.stencilMask(255);
    gl.clearColor(0, 0, 0, 1);
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.BLEND);
    let modo = -1;
    for (const lote of this.lotes) {
      if (lote.modo !== modo) {
        modo = lote.modo;
        gl.uniform1i(this.u.uMode, modo);
        gl.blendEquation(modo === Mode.Over ? gl.MAX : gl.FUNC_ADD);
        if (modo === Mode.Fill) gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        else if (modo === Mode.Sub) gl.blendFunc(gl.DST_COLOR, gl.ZERO);
        else gl.blendFunc(gl.ONE, gl.ONE);
      }
      if (lote.unaVez) {
        // Stencil por muestra: relleno y ejes que se pisan reciben tinta una sola vez.
        gl.enable(gl.STENCIL_TEST);
        gl.stencilMask(255);
        gl.clearStencil(0);
        gl.clear(gl.STENCIL_BUFFER_BIT);
        gl.stencilFunc(gl.EQUAL, 0, 255);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
      } else gl.disable(gl.STENCIL_TEST);
      gl.drawElements(gl.TRIANGLES, lote.cantidad, gl.UNSIGNED_INT, lote.inicio * 4);
      this.draws++;
    }
    gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST);
    if (this.samples) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.destino);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resuelto);
      for (let i = 0; i < 2; i++) {
        gl.readBuffer(gl.COLOR_ATTACHMENT0 + i);
        gl.drawBuffers(i === 0 ? [gl.COLOR_ATTACHMENT0, gl.NONE] : [gl.NONE, gl.COLOR_ATTACHMENT1]);
        gl.blitFramebuffer(0, 0, this.w, this.h, 0, 0, this.w, this.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.terminado = true;
  }
}
