import { Ink, type InkSet, type Material } from 'trama';

/**
 * Cuatro tintas para la pampa: punzó, ocre, celeste y una tinta de línea casi negra.
 * Ocre + celeste dan el verde del pasto; punzó + ocre, el naranja del fuego;
 * punzó + celeste, los morados del atardecer.
 */
export const PAMPA: InkSet = {
  name: 'Pampa',
  paper: '#F2E8D4',
  inks: [
    { name: 'Punzó', hex: '#C9392E', angle: 15, misreg: [0.7, -0.45] },
    { name: 'Ocre', hex: '#EBA834', angle: 0, misreg: [-0.55, 0.6] },
    { name: 'Celeste', hex: '#5C9DC9', angle: 75, misreg: [0.45, 0.8] },
    { name: 'Tinta', hex: '#26283A', angle: 45, misreg: [0, 0] },
  ],
};

/** Densidades: punzó, ocre, celeste, tinta. */
export const I = (a = 0, b = 0, c = 0, k = 0) => Ink.of(a, b, c, k);

export const T = {
  papel: I(),
  tierra: I(0.14, 0.3, 0.06, 0.05),
  tierraPisada: I(0.2, 0.38, 0.12, 0.12),
  tierraClara: I(0.1, 0.3, 0.0, 0.02),
  pasto: I(0.0, 0.5, 0.42, 0.03),
  pastoClaro: I(0.0, 0.42, 0.26, 0.0),
  pastoOsc: I(0.04, 0.6, 0.62, 0.18),
  paja: I(0.05, 0.55, 0.0, 0.04),
  pajaOsc: I(0.15, 0.62, 0.1, 0.22),
  cal: I(0.0, 0.06, 0.03, 0.0),
  calSombra: I(0.02, 0.13, 0.12, 0.05),
  adobe: I(0.3, 0.5, 0.05, 0.1),
  adobeOsc: I(0.38, 0.55, 0.12, 0.25),
  zocalo: I(0.5, 0.3, 0.06, 0.14),
  madera: I(0.32, 0.55, 0.06, 0.25),
  maderaClara: I(0.22, 0.5, 0.0, 0.1),
  maderaOsc: I(0.4, 0.5, 0.15, 0.5),
  hierro: I(0, 0, 0.3, 0.85),
  vidrio: I(0, 0.45, 0.55, 0.25),
  vidrioAmbar: I(0.35, 0.7, 0, 0.15),
  vidrioClaro: I(0, 0.12, 0.3, 0.06),
  piedra: I(0.05, 0.12, 0.25, 0.2),
  hueso: I(0, 0.1, 0.03, 0.02),
  suelo: I(0.3, 0.5, 0.15, 0.45),
  tosca: I(0.2, 0.45, 0.02, 0.12),
  base: I(0.32, 0.35, 0.25, 0.35),
  hoja: I(0.02, 0.55, 0.6, 0.3),
  hojaClara: I(0.0, 0.5, 0.42, 0.1),
  oscuro: I(0.05, 0.05, 0.25, 0.75),
  brasa: I(0.85, 0.75, 0, 0),
};

export const mat = (top: Ink, left: Ink, right: Ink, line?: number): Material => ({ top, left, right, line });

export const M = {
  madera: mat(T.maderaClara, T.madera, T.maderaOsc),
  maderaClara: mat(I(0.15, 0.4, 0, 0.06), T.maderaClara, T.madera),
  adobe: mat(T.adobe, T.cal, T.calSombra),
  adobeCrudo: mat(T.adobeOsc, T.adobe, T.adobeOsc),
  paja: mat(T.paja, T.pajaOsc, I(0.2, 0.65, 0.15, 0.35)),
  hierro: mat(T.hierro, T.hierro, T.hierro),
  piedra: mat(I(0.03, 0.1, 0.18, 0.12), T.piedra, I(0.08, 0.15, 0.3, 0.35)),
  barril: mat(T.maderaClara, I(0.3, 0.55, 0.04, 0.18), I(0.38, 0.55, 0.12, 0.38)),
};
