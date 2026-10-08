/**
 * Esqueleto humano visto de perfil (x = hacia adelante, y = arriba, en metros).
 * Ángulos de miembros medidos desde la vertical hacia abajo; positivo = hacia adelante.
 * Las rodillas positivas doblan hacia atrás y los codos hacia adelante.
 */
export interface Pose {
  /** Desplazamiento de la pelvis (m). */
  x: number;
  y: number;
  /** Rotación de todo el cuerpo alrededor de la pelvis (positivo = cae de espaldas). */
  rot: number;
  lean: number;
  chest: number;
  neck: number;
  head: number;
  sN: number;
  eN: number;
  sF: number;
  eF: number;
  hN: number;
  kN: number;
  hF: number;
  kF: number;
  fN: number;
  fF: number;
}

const KEYS: (keyof Pose)[] = ['x', 'y', 'rot', 'lean', 'chest', 'neck', 'head', 'sN', 'eN', 'sF', 'eF', 'hN', 'kN', 'hF', 'kF', 'fN', 'fF'];

export function neutral(out?: Pose): Pose {
  const p = out ?? ({} as Pose);
  p.x = 0;
  p.y = 0;
  p.rot = 0;
  p.lean = 0.03;
  p.chest = 0;
  p.neck = 0.02;
  p.head = 0;
  p.sN = 0.06;
  p.eN = 0.16;
  p.sF = -0.05;
  p.eF = 0.14;
  p.hN = 0.03;
  p.kN = 0.05;
  p.hF = -0.03;
  p.kF = 0.05;
  p.fN = 0;
  p.fF = 0;
  return p;
}

export function copyPose(src: Pose, dst: Pose): Pose {
  for (const k of KEYS) dst[k] = src[k];
  return dst;
}

export function lerpPose(a: Pose, b: Pose, t: number, out: Pose): Pose {
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

/** Proporciones de un cuerpo (m) para una altura de 1,80. */
export const BODY = {
  thigh: 0.45,
  shin: 0.44,
  ankle: 0.075,
  spine1: 0.28,
  spine2: 0.25,
  neck: 0.085,
  head: 0.115,
  upper: 0.3,
  fore: 0.265,
};

export type P2 = [number, number];

export interface Joints {
  P: P2;
  C: P2;
  N: P2;
  Nt: P2;
  H: P2;
  S: P2;
  EN: P2;
  WN: P2;
  EF: P2;
  WF: P2;
  KN: P2;
  AN: P2;
  GN: P2;
  KF: P2;
  AF: P2;
  GF: P2;
  /** Ángulos: columna baja, columna alta, cabeza, y pies. */
  a1: number;
  a2: number;
  ha: number;
  phiN: number;
  phiF: number;
}

const dir = (th: number, l: number, o: P2): P2 => [o[0] + Math.sin(th) * l, o[1] - Math.cos(th) * l];
const up = (a: number, l: number, o: P2): P2 => [o[0] + Math.sin(a) * l, o[1] + Math.cos(a) * l];

/** Cinemática directa. k = escala por altura. Si grounded, apoya el punto más bajo en y = 0. */
export function solve(p: Pose, k: number, grounded: boolean): Joints {
  const B = BODY;
  const hip = (B.thigh + B.shin + B.ankle) * k;
  const P: P2 = [p.x, hip + p.y];
  const a1 = p.lean;
  const a2 = p.lean + p.chest;
  const C = up(a1, B.spine1 * k, P);
  const N = up(a2, B.spine2 * k, C);
  const na = a2 + p.neck;
  const Nt = up(na, B.neck * k, N);
  const ha = na + p.head;
  const H = up(ha, B.head * k * 0.92, Nt);
  const S: P2 = [N[0] - Math.sin(a2) * 0.045 * k - Math.cos(a2) * 0.012 * k, N[1] - Math.cos(a2) * 0.045 * k + Math.sin(a2) * 0.012 * k];
  const EN = dir(p.sN, B.upper * k, S);
  const WN = dir(p.sN + p.eN, B.fore * k, EN);
  const EF = dir(p.sF, B.upper * k, S);
  const WF = dir(p.sF + p.eF, B.fore * k, EF);
  const KN = dir(p.hN, B.thigh * k, P);
  const AN = dir(p.hN - p.kN, B.shin * k, KN);
  const GN = dir(p.hN - p.kN, B.ankle * k, AN);
  const KF = dir(p.hF, B.thigh * k, P);
  const AF = dir(p.hF - p.kF, B.shin * k, KF);
  const GF = dir(p.hF - p.kF, B.ankle * k, AF);
  const J: Joints = {
    P,
    C,
    N,
    Nt,
    H,
    S,
    EN,
    WN,
    EF,
    WF,
    KN,
    AN,
    GN,
    KF,
    AF,
    GF,
    a1,
    a2,
    ha,
    phiN: p.hN - p.kN + p.fN,
    phiF: p.hF - p.kF + p.fF,
  };
  const pts = [J.C, J.N, J.Nt, J.H, J.S, J.EN, J.WN, J.EF, J.WF, J.KN, J.AN, J.GN, J.KF, J.AF, J.GF];
  if (p.rot) {
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    for (const q of pts) {
      const dx = q[0] - P[0];
      const dy = q[1] - P[1];
      q[0] = P[0] + dx * c - dy * s;
      q[1] = P[1] + dx * s + dy * c;
    }
    J.a1 += p.rot;
    J.a2 += p.rot;
    J.ha += p.rot;
    J.phiN += p.rot;
    J.phiF += p.rot;
  }
  if (grounded) {
    const toe = 0.2 * k;
    let min = Infinity;
    for (const [G, phi] of [
      [J.GN, J.phiN],
      [J.GF, J.phiF],
    ] as const) {
      min = Math.min(min, G[1], G[1] + Math.sin(phi) * toe, G[1] - Math.sin(phi) * 0.06 * k);
    }
    if (p.rot) {
      min = Math.min(min, J.H[1] - 0.11 * k, J.C[1] - 0.12 * k, P[1] - 0.12 * k, J.N[1] - 0.1 * k);
    }
    for (const q of [P, ...pts]) q[1] -= min;
  }
  return J;
}
