import type { Vec2 } from './math';

/**
 * Proyección isométrica. El mundo se mide en metros; el plano proyectado ("px de mundo")
 * usa PX píxeles por metro a zoom 1. El espectador mira desde +x,+y hacia el origen:
 * mayor x+y es más cerca, y las paredes del fondo quedan en x=0 e y=0.
 */
export const PX = 40;
export const ISO_C = Math.cos(Math.PI / 6);
export const ISO_S = 0.5;

export function isoX(x: number, y: number): number {
  return (x - y) * ISO_C * PX;
}

export function isoY(x: number, y: number, z = 0): number {
  return ((x + y) * ISO_S - z) * PX;
}

export function iso(x: number, y: number, z = 0): Vec2 {
  return [isoX(x, y), isoY(x, y, z)];
}

/** Inversa sobre el plano z dado. */
export function unIso(sx: number, sy: number, z = 0): Vec2 {
  const a = sx / (ISO_C * PX);
  const b = (sy / PX + z) / ISO_S;
  return [(a + b) / 2, (b - a) / 2];
}

/** Signo horizontal en pantalla de una dirección del mundo (para orientar perfiles). */
export function screenSide(dx: number, dy: number): number {
  const s = dx - dy;
  return s > 1e-4 ? 1 : s < -1e-4 ? -1 : 0;
}

/** Semiejes en px de mundo de un círculo de radio r apoyado en el suelo. */
export function groundRadii(r: number): Vec2 {
  return [r * Math.SQRT2 * ISO_C * PX, r * Math.SQRT2 * ISO_S * PX];
}
