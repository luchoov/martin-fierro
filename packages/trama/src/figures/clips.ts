import { TAU, clamp, plateau, pulse, smooth } from '../core/math';
import type { Pose } from './pose';

export type Held = 'vaso' | 'frasco' | 'mate' | 'facon' | 'guitarra' | 'naipes' | 'trapo' | 'pava' | 'botella' | null;

export interface HumanClip {
  /** Duración del ciclo (s). */
  dur: number;
  loop?: boolean;
  grounded?: boolean;
  /** Objeto en la mano cercana / lejana. */
  hold?: Held;
  holdF?: Held;
  /** Poncho envuelto en el brazo lejano (para pelear). */
  wrap?: boolean;
  /** No dibujar la pierna lejana (a caballo). */
  ride?: boolean;
  /**
   * u = fase normalizada (0..1), t = tiempo propio del actor en segundos,
   * seat = altura del asiento si corresponde.
   */
  fn(p: Pose, u: number, t: number, seat: number, hipH: number): void;
}

const { sin, cos, max } = Math;

function legsStand(p: Pose, t: number): void {
  p.hF = -0.03 + 0.035 * sin(t * 0.35);
  p.kF = 0.06 + 0.04 * max(0, sin(t * 0.35));
  p.hN = 0.04;
  p.kN = 0.04;
}

function breathe(p: Pose, t: number, amt = 1): void {
  p.chest += 0.018 * amt * sin(t * 1.6);
  p.neck += 0.012 * amt * sin(t * 1.6 + 0.6);
}

function sitBase(p: Pose, seat: number, hipH: number): void {
  p.y = seat + 0.07 - hipH;
  p.hN = 1.42;
  p.kN = 1.5;
  p.hF = 1.38;
  p.kF = 1.42;
  p.lean = -0.04;
  p.sN = 0.55;
  p.eN = 0.75;
  p.sF = 0.5;
  p.eF = 0.7;
}

export const HUMAN_CLIPS: Record<string, HumanClip> = {
  idle: {
    dur: 6,
    loop: true,
    grounded: true,
    fn(p, u, t) {
      legsStand(p, t);
      breathe(p, t);
      p.head = 0.05 * sin(t * 0.45) + 0.04 * sin(u * TAU);
      p.sN = 0.05 + 0.02 * sin(t * 1.6);
      p.sF = -0.06;
    },
  },
  /** Parado con las manos en el tirador, sacando pecho. */
  guapo: {
    dur: 5,
    loop: true,
    grounded: true,
    fn(p, _u, t) {
      legsStand(p, t);
      breathe(p, t);
      p.lean = -0.06;
      p.chest = -0.05;
      p.head = -0.08 + 0.05 * sin(t * 0.6);
      p.sN = -0.25;
      p.eN = 1.4;
      p.sF = -0.3;
      p.eF = 1.3;
    },
  },
  walk: {
    dur: 1.05,
    loop: true,
    grounded: true,
    fn(p, u) {
      const ph = u * TAU;
      const s = sin(ph);
      p.hN = 0.42 * s;
      p.hF = -0.42 * s;
      p.kN = 0.08 + 0.78 * max(0, cos(ph + 0.35)) ** 1.4;
      p.kF = 0.08 + 0.78 * max(0, cos(ph + 0.35 + Math.PI)) ** 1.4;
      p.fN = -0.25 * max(0, cos(ph + 0.6));
      p.fF = -0.25 * max(0, cos(ph + 0.6 + Math.PI));
      p.sN = -0.3 * s;
      p.sF = 0.3 * s;
      p.eN = 0.28 + 0.12 * s;
      p.eF = 0.28 - 0.12 * s;
      p.lean = 0.07;
      p.head = -0.05;
      p.chest = 0.02 * cos(ph * 2);
    },
  },
  run: {
    dur: 0.62,
    loop: true,
    grounded: true,
    fn(p, u) {
      const ph = u * TAU;
      const s = sin(ph);
      p.hN = 0.7 * s;
      p.hF = -0.7 * s;
      p.kN = 0.25 + 1.3 * max(0, cos(ph + 0.2));
      p.kF = 0.25 + 1.3 * max(0, cos(ph + 0.2 + Math.PI));
      p.sN = -0.7 * s;
      p.sF = 0.7 * s;
      p.eN = 1.3;
      p.eF = 1.3;
      p.lean = 0.22;
    },
  },
  sit: {
    dur: 7,
    loop: true,
    fn(p, u, t, seat, hip) {
      sitBase(p, seat, hip);
      breathe(p, t);
      p.head = 0.06 * sin(t * 0.4);
      p.kN += 0.15 * sin(u * TAU);
    },
  },
  /** Sentado, tomando de un vaso de tanto en tanto. */
  sitDrink: {
    dur: 6.5,
    loop: true,
    hold: 'vaso',
    fn(p, u, t, seat, hip) {
      sitBase(p, seat, hip);
      breathe(p, t);
      const k = plateau(u, 0.55, 0.68, 0.82, 0.92);
      p.sN = 0.45 + k * 1.0;
      p.eN = 1.2 + k * 1.3;
      p.head = -0.18 * k + 0.05 * sin(t * 0.5);
      p.lean = -0.04 - 0.06 * k;
    },
  },
  /** Mate: sentado o en cuclillas, se lleva el mate a la boca. */
  mate: {
    dur: 7,
    loop: true,
    hold: 'mate',
    fn(p, u, t, seat, hip) {
      sitBase(p, seat, hip);
      breathe(p, t);
      const k = plateau(u, 0.25, 0.35, 0.75, 0.85);
      p.sN = 0.4 + k * 1.05;
      p.eN = 1.4 + k * 1.15;
      p.head = 0.1 - 0.12 * k;
      p.lean = 0.12 - 0.08 * k;
      p.sF = 0.55;
      p.eF = 0.6;
    },
  },
  crouch: {
    dur: 7,
    loop: true,
    grounded: true,
    hold: 'mate',
    fn(p, u, t) {
      p.hN = 1.95;
      p.kN = 2.55;
      p.hF = 1.75;
      p.kF = 2.45;
      p.lean = 0.42;
      p.chest = 0.05;
      breathe(p, t);
      const k = plateau(u, 0.3, 0.4, 0.7, 0.8);
      p.sN = 0.7 + k * 0.85;
      p.eN = 1.0 + k * 1.5;
      p.sF = 0.9;
      p.eF = 0.5;
      p.head = -0.25 - 0.15 * k;
      p.neck = -0.1;
    },
  },
  /** Cebando: en cuclillas, la pava sobre el mate. */
  cebar: {
    dur: 5,
    loop: true,
    grounded: true,
    hold: 'pava',
    holdF: 'mate',
    fn(p, u, t) {
      p.hN = 1.9;
      p.kN = 2.5;
      p.hF = 1.7;
      p.kF = 2.4;
      p.lean = 0.5;
      breathe(p, t);
      const k = plateau(u, 0.2, 0.3, 0.6, 0.7);
      p.sN = 1.0 + 0.25 * k;
      p.eN = 0.6 - 0.2 * k;
      p.sF = 0.85;
      p.eF = 0.75;
      p.head = 0.15;
    },
  },
  /** Ofrece algo con el brazo estirado. */
  give: {
    dur: 1.4,
    grounded: true,
    hold: 'mate',
    fn(p, u, t) {
      legsStand(p, t);
      const k = plateau(u, 0, 0.3, 0.7, 1);
      p.sN = 0.2 + k * 1.1;
      p.eN = 0.4 - k * 0.2;
      p.lean = 0.08 + 0.12 * k;
      p.head = 0.1 * k;
    },
  },
  guitar: {
    dur: 2,
    loop: true,
    hold: 'guitarra',
    fn(p, u, t, seat, hip) {
      sitBase(p, seat, hip);
      p.lean = 0.06 + 0.03 * sin(t * 1.1);
      p.sN = 0.18;
      p.eN = 1.25 + 0.16 * sin(t * 9.5) * (0.6 + 0.4 * sin(t * 0.7));
      p.sF = 1.12 + 0.05 * sin(t * 0.8);
      p.eF = 0.32 + 0.08 * sin(t * 1.9);
      p.head = 0.18 + 0.07 * sin(u * TAU);
      p.neck = 0.1;
      p.kN = 1.5 + 0.12 * max(0, sin(t * 4.7));
    },
  },
  /** Con la guitarra quieta, escuchando o mirando. */
  guitarRest: {
    dur: 5,
    loop: true,
    hold: 'guitarra',
    fn(p, _u, t, seat, hip) {
      sitBase(p, seat, hip);
      breathe(p, t);
      p.sN = 0.25;
      p.eN = 1.05;
      p.sF = 1.0;
      p.eF = 0.3;
      p.head = -0.05;
    },
  },
  truco: {
    dur: 7,
    loop: true,
    hold: 'naipes',
    fn(p, u, t, seat, hip) {
      sitBase(p, seat, hip);
      breathe(p, t);
      p.lean = 0.16;
      p.sF = 0.95;
      p.eF = 0.85;
      const up = plateau(u, 0.72, 0.8, 0.84, 0.86);
      const slam = pulse(u, 0.86, 0.92);
      p.sN = 0.95 + up * 1.1 - slam * 0.25;
      p.eN = 0.75 + up * 0.6;
      p.head = 0.12 + 0.06 * sin(t * 0.9) - up * 0.15;
      p.chest = 0.04 * up;
    },
  },
  /** Mirando las cartas, mano en el mentón. */
  think: {
    dur: 6,
    loop: true,
    hold: null,
    holdF: 'naipes',
    fn(p, _u, t, seat, hip) {
      sitBase(p, seat, hip);
      p.lean = 0.2;
      p.sN = 1.05;
      p.eN = 2.45;
      p.sF = 0.9;
      p.eF = 0.9;
      p.head = 0.15 + 0.04 * sin(t * 0.7);
      breathe(p, t);
    },
  },
  /** Acodado al mostrador, copa en mano. */
  bar: {
    dur: 8,
    loop: true,
    grounded: true,
    hold: 'vaso',
    fn(p, u, t) {
      legsStand(p, t);
      breathe(p, t);
      p.lean = 0.1;
      p.sF = 0.95;
      p.eF = 0.65;
      const k = plateau(u, 0.55, 0.65, 0.78, 0.86);
      p.sN = 0.35 + k * 1.1;
      p.eN = 1.45 + k * 1.05;
      p.head = 0.05 * sin(t * 0.5) - 0.15 * k;
    },
  },
  talk: {
    dur: 4,
    loop: true,
    grounded: true,
    fn(p, u, t) {
      legsStand(p, t);
      breathe(p, t, 1.5);
      p.sN = 0.55 + 0.35 * sin(t * 2.3) * (0.5 + 0.5 * sin(u * TAU));
      p.eN = 1.0 + 0.45 * sin(t * 3.1);
      p.head = 0.06 * sin(t * 4.2);
      p.lean = 0.06;
    },
  },
  /** El pulpero limpia el mostrador. */
  wipe: {
    dur: 6,
    loop: true,
    grounded: true,
    hold: 'trapo',
    fn(p, u, t) {
      legsStand(p, t);
      p.lean = 0.2;
      p.head = 0.25;
      const k = plateau(u, 0, 0.1, 0.7, 0.8);
      p.sN = 0.85 + 0.18 * cos(t * 5) * k;
      p.eN = 0.75 + 0.22 * sin(t * 5) * k;
      p.sF = 0.6;
      p.eF = 0.6;
    },
  },
  /** Sirve de una botella. */
  pour: {
    dur: 3,
    grounded: true,
    hold: 'botella',
    holdF: 'vaso',
    fn(p, u, t) {
      legsStand(p, t);
      const k = plateau(u, 0.05, 0.3, 0.75, 0.95);
      p.lean = 0.12;
      p.sN = 0.6 + k * 0.7;
      p.eN = 0.9 - k * 0.3;
      p.sF = 0.8;
      p.eF = 0.9;
      p.head = 0.2;
    },
  },
  /** Estira la mano a un estante alto. */
  reach: {
    dur: 2.4,
    grounded: true,
    fn(p, u, t) {
      legsStand(p, t);
      const k = plateau(u, 0.05, 0.35, 0.65, 0.95);
      p.sN = 0.3 + k * 2.2;
      p.eN = 0.4 - k * 0.2;
      p.head = -0.3 * k;
      p.lean = -0.05 * k;
    },
  },
  /** Saluda tocándose el ala del sombrero. */
  tipHat: {
    dur: 1.3,
    grounded: true,
    fn(p, u, t) {
      legsStand(p, t);
      const k = plateau(u, 0, 0.3, 0.6, 1);
      p.sN = 0.1 + k * 2.15;
      p.eN = 0.2 + k * 1.75;
      p.head = 0.12 * k;
      p.lean = 0.05 + 0.04 * k;
    },
  },
  /** Saludo sentado. */
  tipHatSit: {
    dur: 1.3,
    fn(p, u, _t, seat, hip) {
      sitBase(p, seat, hip);
      const k = plateau(u, 0, 0.3, 0.6, 1);
      p.sN = 0.5 + k * 1.75;
      p.eN = 0.7 + k * 1.25;
      p.head = 0.12 * k;
    },
  },
  point: {
    dur: 3,
    loop: true,
    grounded: true,
    fn(p, _u, t) {
      legsStand(p, t);
      p.sN = 1.45 + 0.04 * sin(t * 3);
      p.eN = 0.05;
      p.lean = 0.05;
      p.head = -0.05;
    },
  },
  /** Ofrece el frasco con el brazo estirado (el guapo). */
  offer: {
    dur: 4,
    loop: true,
    grounded: true,
    hold: 'frasco',
    fn(p, _u, t) {
      legsStand(p, t);
      breathe(p, t);
      p.lean = -0.04;
      p.sN = 1.2 + 0.05 * sin(t * 2);
      p.eN = 0.25;
      p.sF = -0.3;
      p.eF = 1.3;
      p.head = -0.08;
    },
  },
  angry: {
    dur: 1.6,
    loop: true,
    grounded: true,
    fn(p, u, t) {
      legsStand(p, t);
      p.lean = 0.14;
      p.neck = 0.12;
      p.head = -0.12;
      p.sN = 1.3 + 0.18 * pulse(u, 0.1, 0.4);
      p.eN = 0.15;
      p.sF = -0.2;
      p.eF = 0.5;
    },
  },
  shove: {
    dur: 0.8,
    grounded: true,
    fn(p, u, t) {
      legsStand(p, t);
      const k = pulse(u, 0, 0.75);
      p.sN = 0.5 + k * 1.0;
      p.eN = 1.4 - k * 1.2;
      p.sF = 0.4 + k * 0.9;
      p.eF = 1.3 - k * 1.0;
      p.lean = 0.1 + 0.2 * k;
      p.hN = 0.25 * k;
      p.kN = 0.15;
    },
  },
  stumble: {
    dur: 1.4,
    grounded: true,
    fn(p, u, t) {
      const k = pulse(u, 0, 1);
      p.lean = -0.35 * k;
      p.sN = 0.4 + k * 1.9 + 0.3 * sin(t * 14) * k;
      p.sF = 0.3 + k * 1.5 + 0.3 * sin(t * 12 + 1) * k;
      p.eN = 0.6;
      p.eF = 0.6;
      p.hN = -0.35 * k + 0.25 * sin(u * TAU * 2) * k;
      p.hF = 0.3 * k - 0.2 * sin(u * TAU * 2) * k;
      p.kN = 0.3 * k;
      p.kF = 0.2;
      p.head = 0.2 * k;
    },
  },
  /** Guardia de cuchillo, poncho envuelto en el brazo. */
  fight: {
    dur: 2.2,
    loop: true,
    grounded: true,
    hold: 'facon',
    wrap: true,
    fn(p, u, t) {
      const sway = sin(u * TAU);
      p.hN = 0.55 + 0.1 * sway;
      p.kN = 0.95;
      p.hF = -0.35 - 0.08 * sway;
      p.kF = 0.55;
      p.lean = 0.32 + 0.05 * sway;
      p.chest = 0.05;
      p.head = -0.22;
      p.neck = -0.05;
      p.sF = 1.25 + 0.1 * sin(t * 3.1);
      p.eF = 1.0;
      p.sN = 0.6 + 0.25 * sin(t * 4.3 + 1);
      p.eN = 0.75 + 0.2 * sin(t * 5.1);
      p.x = 0.06 * sway;
    },
  },
  lunge: {
    dur: 0.7,
    grounded: true,
    hold: 'facon',
    wrap: true,
    fn(p, u) {
      const k = pulse(u, 0, 1);
      p.hN = 0.6 + 0.45 * k;
      p.kN = 0.95 - 0.3 * k;
      p.hF = -0.35 - 0.35 * k;
      p.kF = 0.5;
      p.lean = 0.35 + 0.3 * k;
      p.head = -0.25;
      p.sF = 1.25 - 0.3 * k;
      p.eF = 1.0;
      p.sN = 0.6 + 1.0 * k;
      p.eN = 0.75 - 0.7 * k;
      p.x = 0.15 * k;
    },
  },
  fall: {
    dur: 1.5,
    grounded: true,
    fn(p, u) {
      const k = smooth(clamp(u * 1.15));
      const buckle = pulse(u, 0, 0.7);
      p.rot = 1.5 * k;
      p.kN = 0.2 + 1.1 * buckle;
      p.kF = 0.2 + 0.9 * buckle;
      p.hN = 0.3 * buckle + 0.35 * k;
      p.hF = 0.5 * buckle;
      p.sN = 0.4 + 1.6 * k;
      p.sF = 0.3 + 2.3 * k;
      p.eN = 0.4;
      p.eF = 0.6;
      p.head = 0.35 * buckle - 0.2 * k;
    },
  },
  lie: {
    dur: 6,
    loop: true,
    grounded: true,
    fn(p) {
      p.rot = 1.5;
      p.hN = 0.35;
      p.kN = 0.25;
      p.hF = 0.05;
      p.kF = 0.55;
      p.sN = 2.0;
      p.eN = 0.4;
      p.sF = 2.6;
      p.eF = 0.6;
      p.head = -0.2;
    },
  },
  /** Borracho dormido, sentado en el piso contra la pared. */
  sleepFloor: {
    dur: 4.5,
    loop: true,
    fn(p, u, _t, _seat, hip) {
      p.y = 0.13 - hip;
      p.hN = 1.38;
      p.kN = 0.15;
      p.hF = 1.45;
      p.kF = 0.55;
      p.lean = -0.38;
      p.chest = 0.1 + 0.03 * sin(u * TAU);
      p.neck = 0.45;
      p.head = 0.3 + 0.05 * sin(u * TAU);
      p.sN = 0.25;
      p.eN = 0.45;
      p.sF = 0.15;
      p.eF = 0.35;
    },
  },
  shout: {
    dur: 1.2,
    loop: true,
    grounded: true,
    fn(p, u, t) {
      legsStand(p, t);
      p.lean = -0.12;
      p.head = -0.35;
      p.sN = 2.5 + 0.2 * sin(u * TAU * 2);
      p.eN = 0.4;
      p.sF = 2.2 + 0.2 * sin(u * TAU * 2 + 1);
      p.eF = 0.5;
    },
  },
  /** Mira algo con atención, inclinado. */
  watch: {
    dur: 5,
    loop: true,
    grounded: true,
    fn(p, _u, t) {
      legsStand(p, t);
      breathe(p, t, 1.4);
      p.lean = 0.1;
      p.neck = 0.08;
      p.head = -0.05 + 0.04 * sin(t * 0.8);
      p.sN = 0.1;
      p.eN = 0.4;
      p.sF = -0.1;
      p.eF = 0.3;
    },
  },
  /** Se agacha sobre el caído. */
  kneel: {
    dur: 6,
    loop: true,
    grounded: true,
    fn(p, _u, t) {
      p.hN = 1.6;
      p.kN = 1.65;
      p.hF = 0.05;
      p.kF = 1.75;
      p.lean = 0.35;
      p.head = 0.2;
      p.sN = 0.5;
      p.eN = 0.4;
      p.sF = 0.4;
      p.eF = 0.3;
      breathe(p, t);
    },
  },
  ride: {
    dur: 1.05,
    loop: true,
    ride: true,
    fn(p, u) {
      const b = sin(u * TAU * 2);
      p.y = 0;
      p.hN = 0.85;
      p.kN = 1.0;
      p.hF = 0.85;
      p.kF = 1.0;
      p.lean = 0.04 + 0.03 * b;
      p.sN = 0.55;
      p.eN = 0.85;
      p.sF = 0.55;
      p.eF = 0.85;
      p.head = 0.02 * b;
    },
  },
  /** Estira los brazos y bosteza. */
  stretch: {
    dur: 2.6,
    grounded: true,
    fn(p, u, t) {
      legsStand(p, t);
      const k = plateau(u, 0.05, 0.35, 0.65, 0.95);
      p.sN = 0.1 + k * 2.8;
      p.sF = 0 + k * 2.7;
      p.eN = 0.2 + k * 0.3;
      p.eF = 0.2;
      p.lean = -0.15 * k;
      p.head = -0.3 * k;
    },
  },
};

export function registerHumanClip(name: string, clip: HumanClip): void {
  HUMAN_CLIPS[name] = clip;
}
