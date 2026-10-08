export const TAU = Math.PI * 2;

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const smoothstep = (a: number, b: number, x: number) => smooth(clamp((x - a) / (b - a)));

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Suavizado exponencial independiente del frame rate. */
export function damp(a: number, b: number, lambda: number, dt: number): number {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

/** Pulso suave 0→1→0 dentro de [a, b] de una fase u ∈ [0, 1). */
export function pulse(u: number, a: number, b: number): number {
  if (u <= a || u >= b) return 0;
  const t = (u - a) / (b - a);
  return Math.sin(t * Math.PI);
}

/** Envolvente con subida y bajada: 0 fuera, 1 en la meseta. */
export function plateau(u: number, a: number, b: number, c: number, d: number): number {
  if (u <= a || u >= d) return 0;
  if (u < b) return smooth((u - a) / (b - a));
  if (u > c) return smooth(1 - (u - c) / (d - c));
  return 1;
}
