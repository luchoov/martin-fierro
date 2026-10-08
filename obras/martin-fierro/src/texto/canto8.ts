/**
 * José Hernández, "El Gaucho Martín Fierro" (1872), Canto VIII. Dominio público.
 * Fuente: Project Gutenberg #14765 (https://www.gutenberg.org/ebooks/14765).
 * Correcciones mínimas sobre esa transcripción: se restituyó la mayúscula inicial perdida
 * por la capitular ("Otra", "Él") y la tilde de "hacía". El resto va tal cual; conviene
 * cotejarlo con una edición crítica antes de publicar.
 */
export const CANTO = {
  numero: 'VIII',
  titulo: 'El ser gaucho es un delito',
  obra: 'El Gaucho Martín Fierro',
  autor: 'José Hernández',
  anio: '1872',
  /** Pie de imprenta de la primera edición. */
  imprenta: 'Buenos Aires, Imprenta de La Pampa, 1872',
  escena: 'La pelea en la pulpería',
};

/**
 * Lo que pasó antes (Cantos III a VII) y lo que se va a ver. Breve y para leer en voz alta en
 * clase: no adelanta el final de la pelea.
 */
export const ANTES = {
  titulo: 'Antes de leer',
  parrafos: [
    'Martín Fierro era un gaucho con rancho, mujer y dos hijos. Un día, mientras cantaba en una fiesta, se lo llevó la leva: lo mandaron a servir en un fortín de la frontera.',
    'Años después desertó y volvió a su pago. Del rancho quedaba la tapera; la mujer se había ido con otro y los hijos andaban conchabados de peones.',
    'Desde entonces anda matrero, perseguido por la justicia. En el canto anterior mató a un hombre en un baile.',
  ],
  ahora: 'En este canto',
  escena:
    'Otra vez está en una pulpería —el almacén y despacho de bebidas del campo— cuando cae un guapo protegido por el comandante del pago. Lo cuenta el mismo Fierro: todo el poema está en primera persona.',
};

/** Palabras que conviene tener a mano para estas estrofas. */
export const PALABRAS: [string, string][] = [
  ['boliche', 'pulpería chica'],
  ['terne', 'guapo, valentón'],
  ['pingo', 'caballo'],
  ['ramada', 'cobertizo de paja'],
  ['palenque', 'poste para atar el caballo'],
  ['facón', 'cuchillo largo'],
];

/** La escena termina en la estrofa 230, pero el canto sigue hasta la 241. */
export const DESPUES = {
  titulo: 'Hasta acá, la pelea',
  texto:
    'El Canto VIII sigue once estrofas más: Fierro cuenta la suerte del gaucho perseguido y termina jurando abrirse camino con el facón. En el Canto IX, mientras anda matreriando, lo rodea una partida.',
};

export interface Estrofa {
  n: number;
  versos: string[];
}

export const ESTROFAS: Estrofa[] = [
  {
    n: 222,
    versos: [
      'Otra vez en un boliche',
      'estaba haciendo la tarde;',
      'cayó un gaucho que hacía alarde',
      'de guapo y peliador;',
      'a la llegada metió',
      'el pingo hasta la ramada,',
      'y yo sin decirle nada',
      'me quedé en el mostrador.',
    ],
  },
  {
    n: 223,
    versos: [
      'Era un terne de aquel pago',
      'que naides lo reprendía,',
      'que sus enriedos tenía',
      'con el señor comendante;',
      'y como era protegido,',
      'andaba muy entonao,',
      'y a cualquier desgraciao',
      'lo llevaba por delante.',
    ],
  },
  {
    n: 224,
    versos: [
      '¡Ah pobre! Si él mismo creiba',
      'que la vida le sobraba;',
      'ninguno diría que andaba',
      'aguaitándolo la muerte.',
      'Pero ansí pasa en el mundo,',
      'es ansí la triste vida:',
      'pa todos está escondida',
      'la güena o la mala suerte.',
    ],
  },
  {
    n: 225,
    versos: [
      'Se tiró al suelo; al dentrar',
      'le dio un empellón a un vasco,',
      'y me alargó un medio frasco',
      'diciendo: beba cuñao.',
      'Por su hermana, contesté.',
      'Que por la mía no hay cuidao.',
    ],
  },
  {
    n: 226,
    versos: [
      '¡Ah, gaucho!, Me respondió;',
      '¿de que pago será crioyo?',
      '¿Lo andará buscando el hoyo?',
      'Deberá tener güen cuero;',
      'pero ande bala este toro',
      'no bala ningún ternero.',
    ],
  },
  {
    n: 227,
    versos: [
      'Y ya salimos trenzaos',
      'porque el hombre no era lerdo,',
      'mas como el tino no pierdo,',
      'y soy medio ligerón,',
      'le dejé mostrando el sebo',
      'de un revés con el facón.',
    ],
  },
  {
    n: 228,
    versos: [
      'Y como con la justicia',
      'no andaba bien por allí,',
      'cuanto pataliar lo vi,',
      'y el pulpero pegó el grito,',
      'ya pa el palenque salí',
      'como haciéndome chiquito.',
    ],
  },
  {
    n: 229,
    versos: [
      'Monté y me encomendé a Dios,',
      'rumbiando para otro pago,',
      'que el gaucho que llaman vago',
      'no puede tener querencia,',
      'y ansí de estrago en estrago',
      'vive llorando la ausencia.',
    ],
  },
  {
    n: 230,
    versos: [
      'Él andaba siempre juyendo,',
      'siempre pobre y perseguido,',
      'no tiene cueva ni nido',
      'como si juera maldito;',
      'porque el ser gaucho- ¡barajo!,',
      'El ser gaucho es un delito.',
    ],
  },
];
