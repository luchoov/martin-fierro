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

export interface Op {
  m: Mode;
  p: Path2D;
  i: Ink;
  a: number;
  /** Línea de tinta clave: marca la máscara de línea, que se imprime plena y sin trama. */
  l?: boolean;
  /** Ejes de los trazos (para no dejarlos más finos que minLine px de pantalla). */
  c?: Path2D;
  /** Grosor nominal (px de mundo) del trazo más fino de la operación. */
  w?: number;
}

const COMPOSITE: GlobalCompositeOperation[] = ['source-over', 'lighten', 'lighter', 'multiply'];

/**
 * Dos lienzos 2D que guardan las separaciones: c1 lleva las tintas A, B, C en sus canales
 * RGB; c2 lleva la tinta clave en R y la máscara de línea en G. Negro = papel sin tinta.
 */
export class Separation {
  readonly c1 = document.createElement('canvas');
  readonly c2 = document.createElement('canvas');
  readonly x1: CanvasRenderingContext2D;
  readonly x2: CanvasRenderingContext2D;
  scale = 1;
  w = 1;
  h = 1;
  /** Zoom de cámara de la vista actual. */
  zoom = 1;
  /** Grosor mínimo de un trazo, en px de pantalla (CSS). */
  minLine = 1;
  /** Operaciones reproducidas desde el último clear (para medir). */
  count = 0;

  constructor() {
    const opts: CanvasRenderingContext2DSettings = { alpha: false };
    this.x1 = this.c1.getContext('2d', opts)!;
    this.x2 = this.c2.getContext('2d', opts)!;
  }

  resize(cssW: number, cssH: number, scale: number): void {
    this.scale = scale;
    const w = Math.max(1, Math.round(cssW * scale));
    const h = Math.max(1, Math.round(cssH * scale));
    if (w !== this.w || h !== this.h) {
      this.w = this.c1.width = this.c2.width = w;
      this.h = this.c1.height = this.c2.height = h;
    }
  }

  clear(): void {
    for (const x of [this.x1, this.x2]) {
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalCompositeOperation = 'source-over';
      x.globalAlpha = 1;
      x.fillStyle = '#000';
      x.fillRect(0, 0, this.w, this.h);
      x.lineCap = x.lineJoin = 'round';
    }
    this.count = 0;
  }

  /** Transforma de px de mundo a px del lienzo de separación. */
  setView(camX: number, camY: number, zoom: number, anchorX: number, anchorY: number): void {
    this.zoom = zoom;
    const s = this.scale * zoom;
    const e = (anchorX - camX * zoom) * this.scale;
    const f = (anchorY - camY * zoom) * this.scale;
    this.x1.setTransform(s, 0, 0, s, e, f);
    this.x2.setTransform(s, 0, 0, s, e, f);
  }

  blit(from: Separation): void {
    for (const [x, c] of [
      [this.x1, from.c1],
      [this.x2, from.c2],
    ] as const) {
      x.save();
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalCompositeOperation = 'source-over';
      x.globalAlpha = 1;
      x.drawImage(c, 0, 0);
      x.restore();
    }
  }

  play(ops: readonly Op[]): void {
    const x1 = this.x1;
    const x2 = this.x2;
    // Un trazo que en pantalla quedaría más fino que minLine se repasa por su eje con ese grosor:
    // de lejos las líneas no se cortan en puntitos.
    const thin = this.minLine / this.zoom;
    x1.lineWidth = x2.lineWidth = thin;
    let mode = -1;
    let alpha = -1;
    this.count += ops.length;
    for (let n = 0; n < ops.length; n++) {
      const op = ops[n];
      if (op.m !== mode) {
        mode = op.m;
        x1.globalCompositeOperation = x2.globalCompositeOperation = COMPOSITE[mode];
      }
      if (op.a !== alpha) {
        alpha = op.a;
        x1.globalAlpha = x2.globalAlpha = alpha;
      }
      const ink = op.i;
      const s2 = op.l ? ink.l2 : ink.s2;
      const axis = op.c && op.w! < thin ? op.c : null;
      if (mode === Mode.Fill) {
        x1.fillStyle = ink.s1;
        x1.fill(op.p);
        x2.fillStyle = s2;
        x2.fill(op.p);
        if (axis) {
          x1.strokeStyle = ink.s1;
          x1.stroke(axis);
          x2.strokeStyle = s2;
          x2.stroke(axis);
        }
      } else if (mode === Mode.Sub) {
        if (ink.hasColor) {
          x1.fillStyle = ink.m1;
          x1.fill(op.p);
        }
        if (ink.k > 0) {
          x2.fillStyle = ink.m2;
          x2.fill(op.p);
        }
      } else {
        if (ink.hasColor) {
          x1.fillStyle = ink.s1;
          x1.fill(op.p);
          if (axis) {
            x1.strokeStyle = ink.s1;
            x1.stroke(axis);
          }
        }
        if (ink.k > 0 || op.l) {
          x2.fillStyle = s2;
          x2.fill(op.p);
          if (axis) {
            x2.strokeStyle = s2;
            x2.stroke(axis);
          }
        }
      }
    }
    x1.globalCompositeOperation = x2.globalCompositeOperation = 'source-over';
    x1.globalAlpha = x2.globalAlpha = 1;
  }
}
