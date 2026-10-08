import './estilo.css';
import { Stage, clamp } from 'trama';
import type { BenchOptions } from 'trama/bench';
import { crearPulperia } from './escenas/pulperia';
import { PAMPA } from './tintas';
import { ANTES, CANTO, DESPUES, ESTROFAS, PALABRAS } from './texto/canto8';

const params = new URLSearchParams(location.search);
/** ?bench: recorrido fijo de cámara que mide cada etapa del cuadro (?bench=manual sin requestAnimationFrame). */
const bench = params.has('bench');
const canvas = document.getElementById('lamina') as HTMLCanvasElement;
const relato = document.getElementById('relato') as HTMLElement;
const columna = document.getElementById('columna') as HTMLElement;
const folio = columna.querySelector('.folio') as HTMLElement;
const nota = document.getElementById('nota') as HTMLElement;
const ayuda = document.querySelector('.ayuda') as HTMLButtonElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const tactil = matchMedia('(pointer: coarse)').matches;
/** Escritorio: columna de texto a la izquierda. Si no, franja de papel abajo (misma consulta que en el CSS). */
const enColumna = matchMedia('(min-width: 760px) and (min-aspect-ratio: 11/10)');

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Comillas tipográficas para el texto de Gutenberg. */
const tipo = (s: string) => s.replace(/'/g, '’');

// ——— El libro: portada, argumento, una página por estrofa y cierre ———
type Tipo = 'portada' | 'intro' | 'estrofa' | 'cierre';
interface Paso {
  sec: HTMLElement;
  hoja: HTMLElement | null;
  tipo: Tipo;
  /** Momento de la escena que le corresponde. */
  beat: number;
  folio: string;
}
const pasos: Paso[] = [];
function paso(t: Tipo, beat: number, hoja: HTMLElement | null, texto: string, extra?: HTMLElement): void {
  const sec = el('section', `paso paso-${t}`);
  if (extra) sec.append(extra);
  if (hoja) sec.append(hoja);
  relato.append(sec);
  pasos.push({ sec, hoja, tipo: t, beat, folio: texto });
}

// Portada: una tapa de folleto, con el papel todavía en blanco.
{
  const tapa = el('header', 'tapa');
  tapa.append(
    ...['si', 'sd', 'ii', 'id'].map((c) => el('span', `corte ${c}`)),
    el('p', 'tapa-autor', CANTO.autor),
    el('h1', 'tapa-titulo', `<span class="tapa-el">El Gaucho</span><span class="tapa-nombre">Martín Fierro</span>`),
    el('div', 'ornamento', '<i></i>'),
    el('p', 'tapa-canto', `Canto ${CANTO.numero}`),
    el('p', 'tapa-sub', CANTO.titulo),
    el('p', 'tapa-escena', `${CANTO.escena} · estrofas ${ESTROFAS[0].n} a ${ESTROFAS[ESTROFAS.length - 1].n}`),
    el('p', 'tapa-tintas', '<i></i><i></i><i></i><i></i>'),
    el('p', 'tapa-imprenta', `Una lámina viva, impresa en risografía y dibujada en código.<br>Primera edición: ${CANTO.imprenta}.`),
    el('p', 'tapa-seguir', `${tactil ? 'Deslizá' : 'Bajá'} para empezar<i aria-hidden="true"></i>`),
  );
  tapa.querySelector('.tapa-tintas')!.setAttribute('aria-hidden', 'true');
  paso('portada', 0, null, '', tapa);
}

// Antes de leer: lo que pasó y lo que se va a ver. Mientras tanto, la prensa imprime la lámina.
{
  const h = el('article', 'hoja hoja-intro');
  let i = 0;
  const bloque = (e: HTMLElement) => {
    e.style.setProperty('--i', String(i++));
    e.classList.add('linea');
    h.append(e);
  };
  bloque(el('h2', 'rubro', ANTES.titulo));
  for (const p of ANTES.parrafos) bloque(el('p', '', p));
  bloque(el('h2', 'rubro', ANTES.ahora));
  bloque(el('p', '', ANTES.escena));
  const dl = el('dl', 'palabras');
  for (const [w, d] of PALABRAS) {
    const par = el('div');
    par.append(el('dt', '', w), el('dd', '', d));
    dl.append(par);
  }
  bloque(dl);
  paso('intro', 0, h, ANTES.titulo);
}

// Una página por estrofa: número en el margen, versos sin sangría alternada, capitular solo al empezar el canto.
ESTROFAS.forEach((e, i) => {
  const h = el('article', i === 0 ? 'hoja hoja-estrofa capitular' : 'hoja hoja-estrofa');
  h.setAttribute('aria-label', `Estrofa ${e.n}`);
  h.append(el('p', 'num', String(e.n)));
  const v = el('p', 'versos');
  e.versos.forEach((line, k) => {
    const s = el('span', 'linea');
    s.style.setProperty('--i', String(k));
    const txt = tipo(line);
    if (i === 0 && k === 0) s.innerHTML = `<span class="cap">${txt[0]}</span>${txt.slice(1)}`;
    else s.textContent = txt;
    v.append(s);
  });
  h.append(v);
  paso('estrofa', i + 1, h, `Estrofa ${e.n}`);
});

// Cierre
{
  const h = el('article', 'hoja hoja-cierre');
  let i = 0;
  const bloque = (e: HTMLElement) => {
    e.style.setProperty('--i', String(i++));
    e.classList.add('linea');
    h.append(e);
  };
  bloque(el('h2', 'rubro', DESPUES.titulo));
  bloque(el('p', '', DESPUES.texto));
  bloque(el('div', 'ornamento', '<i></i>'));
  bloque(
    el(
      'p',
      'creditos',
      `<i>${CANTO.obra}</i>, de ${CANTO.autor}. Primera edición: ${CANTO.imprenta}. Texto de dominio público, tomado de Project Gutenberg (#14765) con correcciones mínimas.<br><br>Cada persona, caballo y punto de tinta está dibujado en código con <b>Trama</b>, un motor abierto. Esta lámina es libre para escuelas (CC BY-NC-SA 4.0).`,
    ),
  );
  const volver = el('button', 'volver', 'Volver a la portada');
  volver.type = 'button';
  volver.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }));
  bloque(volver);
  paso('cierre', ESTROFAS.length + 1, h, 'Fin de la escena');
}

// ——— Cabeza y folio de la columna ———
columna.querySelector('.cabeza')!.innerHTML = `<span>${CANTO.obra}</span><span>Canto ${CANTO.numero}</span>`;
const folioTexto = el('span', 'folio-texto');
const marcas = el('span', 'marcas');
const estrofas = pasos.filter((p) => p.tipo === 'estrofa');
for (const p of estrofas) {
  const b = el('button', 'marca');
  b.type = 'button';
  b.setAttribute('aria-label', p.folio);
  b.addEventListener('click', () => saltar(pasos.indexOf(p)));
  marcas.append(b);
}
folio.append(folioTexto, marcas);

function saltar(k: number): void {
  // Salto directo: los momentos intermedios no se animan (la escena se acomoda de golpe).
  window.scrollTo({ top: pasos[k].sec.offsetTop + 1, behavior: 'instant' as ScrollBehavior });
}

// ——— La lámina ———
let stage: Stage;
try {
  const q = params.get('q');
  // El benchmark fija la calidad (la mejor, salvo ?q): si se adaptara, no se podría comparar.
  stage = new Stage(canvas, { inks: PAMPA, reducedMotion: reduced, autoPrint: false, quality: q === null ? (bench ? 0 : undefined) : Number(q) });
} catch (err) {
  console.error(err);
  document.body.append(el('p', 'aviso', 'Este navegador no puede imprimir la lámina (hace falta WebGL2). El texto sigue disponible.'));
  throw err;
}
// El panel de medición se baja solo si se pide.
if (params.has('debug')) void import('trama/debug').then(({ DebugPanel }) => new DebugPanel(stage));
const escena = crearPulperia(stage.world);
stage.bake();

// ——— Encuadre: la lámina se imprime en lo que deja libre el texto ———
let actual = -1;
let beatActual = -1;

/**
 * Alto de referencia: cambia solo con el ancho (al rotar), no cuando la barra del navegador
 * aparece o se va al desplazarse. Así la franja no salta.
 */
let altoFijo = window.innerHeight;

/** Muescas y barras del sistema (env(safe-area-inset-*)), en px. */
const sonda = el('div');
sonda.style.cssText =
  'position:fixed;inset:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
document.body.append(sonda);
function seguro(): { t: number; r: number; b: number; l: number } {
  const s = getComputedStyle(sonda);
  return { t: parseFloat(s.paddingTop) || 0, r: parseFloat(s.paddingRight) || 0, b: parseFloat(s.paddingBottom) || 0, l: parseFloat(s.paddingLeft) || 0 };
}

/** Alto de la franja de papel (celular): entra la estrofa más larga; la intro y el cierre piden más. */
function franja(t: Tipo): number {
  const h = altoFijo;
  const lista = t === 'estrofa' ? estrofas : pasos.filter((p) => p.tipo === (t === 'portada' ? 'intro' : t));
  let need = 0;
  for (const p of lista) if (p.hoja) need = Math.max(need, p.hoja.scrollHeight);
  // Folio, márgenes y lo que crece el folio en táctil (--folio, en el CSS).
  const cromo = 76 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--folio')) || 0);
  return Math.round(clamp(need + cromo, h * 0.3, h * (t === 'estrofa' ? 0.52 : 0.74)));
}

function layout(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const t = pasos[actual]?.tipo ?? 'portada';
  const sinTexto = document.body.classList.contains('sin-texto') && t !== 'portada';
  stage.feather = enColumna.matches ? 64 : 40;
  // El encuadre no se mete debajo de la muesca ni de la barra de inicio.
  const s = seguro();
  const x0 = Math.max(0.02, (s.l + 8) / w);
  const x1 = Math.min(0.98, 1 - (s.r + 8) / w);
  if (sinTexto) {
    stage.plate = { x0: -1, y0: -1, x1: 2, y1: 2 };
    stage.frame = { x0, y0: Math.max(0.03, (s.t + 8) / h), x1, y1: Math.min(0.97, 1 - (s.b + 8) / h) };
    return;
  }
  if (enColumna.matches) {
    document.body.style.removeProperty('--franja');
    const borde = columna.getBoundingClientRect().right;
    stage.plate = { x0: borde / w, y0: -1, x1: 2, y1: 2 };
    stage.frame = {
      x0: (borde + stage.feather * 0.5) / w,
      y0: Math.max(0.04, (s.t + 8) / h),
      x1: Math.min(0.985, 1 - (s.r + 8) / w),
      y1: Math.min(0.96, 1 - (s.b + 8) / h),
    };
  } else {
    const f = franja(t);
    document.body.style.setProperty('--franja', `${f}px`);
    const top = h - f;
    stage.plate = { x0: -1, y0: -1, x1: 2, y1: top / h };
    stage.frame = { x0, y0: Math.max(0.015, (s.t + 4) / h), x1, y1: (top - stage.feather * 0.5) / h };
  }
  desborde();
}

/** Marca la hoja activa si su texto no entra (se desvanece abajo hasta llegar al final). */
function desborde(): void {
  const h = pasos[actual]?.hoja;
  if (!h) return;
  h.classList.toggle('desborda', h.scrollHeight > h.clientHeight + 1);
  h.classList.toggle('al-final', h.scrollTop + h.clientHeight >= h.scrollHeight - 4);
}
for (const p of pasos) p.hoja?.addEventListener('scroll', desborde, { passive: true });

let anchoPrevio = 0;
function medidas(): void {
  // Los pasos se miden en px fijos: en el celular la barra del navegador cambia el alto al desplazarse.
  if (window.innerWidth !== anchoPrevio || !anchoPrevio) {
    anchoPrevio = window.innerWidth;
    altoFijo = window.innerHeight;
    document.documentElement.style.setProperty('--alto', `${window.innerHeight}px`);
  }
  layout();
}

function irA(k: number): void {
  if (k === actual) return;
  const antes = actual;
  actual = k;
  const p = pasos[k];
  pasos.forEach((q, i) => {
    const on = i === k;
    q.sec.classList.toggle('activo', on);
    q.hoja?.classList.toggle('activo', on);
    if (on) q.hoja?.setAttribute('aria-current', 'step');
    else q.hoja?.removeAttribute('aria-current');
  });
  document.body.dataset.tipo = p.tipo;
  document.body.dataset.sentido = k >= antes ? 'adelante' : 'atras';
  if (p.beat !== beatActual) {
    const seq = p.beat === beatActual + 1;
    beatActual = p.beat;
    escena.beats[p.beat].enter(seq);
    stage.shot(escena.beats[p.beat].shot);
  }
  // En la portada el papel está en blanco; al empezar a leer pasa la prensa.
  stage.print(p.tipo !== 'portada');
  const n = estrofas.indexOf(p);
  folioTexto.textContent = n >= 0 ? `${p.folio} · ${n + 1} de ${estrofas.length}` : p.folio;
  marcas.querySelectorAll('.marca').forEach((m, i) => {
    m.classList.toggle('hecha', p.tipo === 'cierre' || i < n);
    m.classList.toggle('actual', i === n);
  });
  layout();
  if (p.tipo === 'estrofa' && !bench) mostrarNotaUnaVez();
}

irA(0);
medidas();
stage.snapPlate();
stage.shot(escena.beats[0].shot, true);
window.addEventListener('resize', () => {
  medidas();
  stage.snapPlate();
});
enColumna.addEventListener('change', () => {
  layout();
  stage.snapPlate();
});

// El paso activo es el que cruza la mitad de la pantalla.
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) if (e.isIntersecting) irA(pasos.findIndex((p) => p.sec === e.target));
  },
  { rootMargin: '-50% 0px -50% 0px' },
);
pasos.forEach((p) => io.observe(p.sec));

// ——— Nota de instrucciones: aparece sola una vez, y después con el botón «?» ———
const NOTA_VISTA = 'trama.martin-fierro.nota';
nota.innerHTML = `<p class="rubro">Cómo se mira</p><ul>${(tactil
  ? ['Deslizá hacia arriba para seguir leyendo.', 'Con un dedo de costado recorrés la lámina; con dos te acercás.', 'Dos toques te llevan a un punto.', 'Tocá a la gente, a los animales y al fuego.']
  : ['La rueda sigue el relato.', 'Arrastrá la lámina para mirarla; <kbd>Ctrl</kbd> + rueda para acercarte.', 'Doble clic te lleva a un punto; <kbd>0</kbd> vuelve al relato.', 'Tocá a la gente, a los animales y al fuego.', '<kbd>C</kbd> oculta el texto.']
)
  .map((s) => `<li>${s}</li>`)
  .join('')}</ul><button type="button" class="entendido">Entendido</button>`;
let notaT = 0;
function abrirNota(abrir: boolean): void {
  nota.hidden = !abrir;
  ayuda.setAttribute('aria-expanded', String(abrir));
  window.clearTimeout(notaT);
  if (!abrir) {
    try {
      localStorage.setItem(NOTA_VISTA, '1');
    } catch {
      /* sin almacenamiento: la nota puede volver a aparecer */
    }
  }
}
function mostrarNotaUnaVez(): void {
  let vista = false;
  try {
    vista = localStorage.getItem(NOTA_VISTA) === '1';
  } catch {
    /* sin almacenamiento */
  }
  if (vista || notaT || !nota.hidden) return;
  notaT = window.setTimeout(() => {
    abrirNota(true);
    notaT = window.setTimeout(() => abrirNota(false), 16000);
  }, 1400);
}
nota.querySelector('.entendido')!.addEventListener('click', () => abrirNota(false));
ayuda.addEventListener('click', () => abrirNota(!!nota.hidden));
// Si ya está tocando la lámina, la nota sobra.
canvas.addEventListener('pointerdown', () => {
  if (!nota.hidden) window.setTimeout(() => abrirNota(false), 600);
});

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'c' || e.key === 'C') {
    document.body.classList.toggle('sin-texto');
    layout();
  } else if (e.key === '?') abrirNota(!!nota.hidden);
  else if (e.key === 'Escape' && !nota.hidden) abrirNota(false);
});

// ——— Benchmark (?bench): se baja solo si se pide ———
const medir = async (opts: BenchOptions = {}) => (await import('./medir')).medir({ stage, escena, pasos, irA, io }, opts);
if (bench) window.setTimeout(() => void medir({ manual: params.get('bench') === 'manual' }), 1500);

stage.start();
// Para jugar desde la consola.
(window as unknown as { trama: unknown }).trama = { stage, escena, irA, pasos, medir };
