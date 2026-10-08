import { clamp } from '../core/math';

/** Densidad de clave (0..255) desde la que un trazo cuenta como línea. */
const LINE_K = 153;

/**
 * Una "tinta" de Trama no es un color: es la densidad (0..1) de cada una de las cuatro
 * tintas planas de la risografía. Los colores secundarios salen solo de la superposición
 * al imprimir. Las instancias se cachean, así que pueden compararse por referencia.
 */
export class Ink {
  /** Densidades cuantizadas a 0..255: tintas A, B, C y la tinta clave K (línea). */
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly k: number;
  /** Estilos precalculados para los dos lienzos de separación. */
  readonly s1: string;
  readonly s2: string;
  readonly m1: string;
  readonly m2: string;
  /** Igual que s2 pero marcando la máscara de línea (canal G del segundo lienzo). */
  readonly l2: string;

  private static cache = new Map<number, Ink>();

  private constructor(a: number, b: number, c: number, k: number) {
    this.a = a;
    this.b = b;
    this.c = c;
    this.k = k;
    this.s1 = `rgb(${a},${b},${c})`;
    this.s2 = `rgb(${k},0,0)`;
    this.m1 = `rgb(${255 - a},${255 - b},${255 - c})`;
    this.m2 = `rgb(${255 - k},255,255)`;
    this.l2 = `rgb(${k},255,0)`;
  }

  static of(a = 0, b = 0, c = 0, k = 0): Ink {
    const A = Math.round(clamp(a) * 255);
    const B = Math.round(clamp(b) * 255);
    const C = Math.round(clamp(c) * 255);
    const K = Math.round(clamp(k) * 255);
    const key = ((A * 256 + B) * 256 + C) * 256 + K;
    let ink = Ink.cache.get(key);
    if (!ink) {
      ink = new Ink(A, B, C, K);
      Ink.cache.set(key, ink);
    }
    return ink;
  }

  get hasColor(): boolean {
    return this.a + this.b + this.c > 0;
  }

  /** Tinta de línea: trazos y contornos con esta tinta se imprimen plenos, nunca tramados. */
  get isLine(): boolean {
    return this.k >= LINE_K;
  }

  /** Suma densidades. */
  add(a = 0, b = 0, c = 0, k = 0): Ink {
    return Ink.of(this.a / 255 + a, this.b / 255 + b, this.c / 255 + c, this.k / 255 + k);
  }

  scale(f: number): Ink {
    return Ink.of((this.a / 255) * f, (this.b / 255) * f, (this.c / 255) * f, (this.k / 255) * f);
  }

  mix(o: Ink, t: number): Ink {
    const m = (x: number, y: number) => (x + (y - x) * t) / 255;
    return Ink.of(m(this.a, o.a), m(this.b, o.b), m(this.c, o.c), m(this.k, o.k));
  }

  /** Versión en sombra: más tinta fría y más clave. */
  shade(f = 0.18): Ink {
    return this.add(0, 0, f * 0.45, f);
  }
}

export const NO_INK = Ink.of();
export const KEY = Ink.of(0, 0, 0, 1);

export interface InkDef {
  name: string;
  /** Color de la tinta impresa al 100 % sobre papel blanco. */
  hex: string;
  /** Ángulo de la trama en grados. */
  angle: number;
  /** Desregistro en px de mundo. */
  misreg: [number, number];
}

export interface InkSet {
  name: string;
  paper: string;
  inks: [InkDef, InkDef, InkDef, InkDef];
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
