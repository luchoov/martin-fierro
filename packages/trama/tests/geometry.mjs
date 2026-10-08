// Node 22.18+ (borra tipos nativamente): node packages/trama/tests/geometry.mjs
import assert from 'node:assert/strict';
import { aplanarCurva, segmentosEje, triangular, triangularRegiones } from '../src/draw/geometry.ts';

let semilla = 20261008;
const azar = () => ((semilla = Math.imul(semilla, 1664525) + 1013904223) >>> 0) / 4294967296;
const cruz = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

// Oráculo independiente: el número de vueltas del contorno determina el relleno nonzero.
function vueltas(puntos, x, y) {
  let n = 0;
  for (let i = 0; i < puntos.length; i += 2) {
    const j = (i + 2) % puntos.length;
    const a = puntos[i + 1];
    const b = puntos[j + 1];
    const c = cruz(puntos[i], a, puntos[j], b, x, y);
    if (a <= y && b > y && c > 0) n++;
    if (a > y && b <= y && c < 0) n--;
  }
  return n;
}

function cobertura(triangulos, x, y) {
  let n = 0;
  for (let i = 0; i < triangulos.length; i += 6) {
    const a = cruz(triangulos[i], triangulos[i + 1], triangulos[i + 2], triangulos[i + 3], x, y);
    const b = cruz(triangulos[i + 2], triangulos[i + 3], triangulos[i + 4], triangulos[i + 5], x, y);
    const c = cruz(triangulos[i + 4], triangulos[i + 5], triangulos[i], triangulos[i + 1], x, y);
    if (a > 1e-7 && b > 1e-7 && c > 1e-7) n++;
  }
  return n;
}

const casos = [
  [[0, 0, 40, 0, 40, 40, 0, 40]],
  [[0, 0, 40, 40, 0, 40, 40, 0]], // Moño que se cruza y tiene área firmada cero.
  [[0, 0, 40, 0, 40, 40, 0, 40], [10, 10, 10, 30, 30, 30, 30, 10]], // Hueco.
  [[0, 0, 40, 0, 40, 40, 0, 40], [10, 10, 30, 10, 30, 30, 10, 30]], // Sin hueco.
  [[0, 0, 20, 0, 20, 20, 0, 20], [20, 0, 40, 0, 40, 20, 20, 20]], // Borde compartido.
  [[0, 0, 40, 0, 40, 40, 0, 40], [20, -10, 20, 20, 50, 20, 50, -10]],
  [[0, 0, 20, 0, 40, 0, 40, 40, 20, 40, 20, 0, 0, 40]], // Arista repetida.
];
let muestras = 0;
function comprobar(regiones, nombre) {
  const t = regiones.length === 1 ? triangular(regiones[0]) : triangularRegiones(regiones);
  assert.equal(t.length % 6, 0, nombre);
  assert.ok(t.every(Number.isFinite), nombre);
  for (let i = 0; i < t.length; i += 6) assert.ok(cruz(...t.slice(i, i + 6)) > 0, nombre);
  for (let i = 0; i < 300; i++) {
    const x = azar() * 80 - 20;
    const y = azar() * 80 - 20;
    const nonzero = regiones.reduce((suma, p) => suma + vueltas(p, x, y), 0) !== 0;
    // También detecta doble cobertura: Add y Fill con alfa deben pintar una sola vez.
    assert.equal(cobertura(t, x, y), Number(nonzero), `${nombre}: ${JSON.stringify({ regiones, x, y })}`);
    muestras++;
  }
}
casos.forEach((regiones, i) => comprobar(regiones, `caso ${i}`));
for (let i = 0; i < 1000; i++) {
  const regiones = [];
  const cantidad = 1 + Math.floor(azar() * 3);
  for (let k = 0; k < cantidad; k++) {
    const puntos = [];
    const n = 3 + Math.floor(azar() * 15);
    for (let j = 0; j < n; j++) puntos.push(Math.round(azar() * 80 - 20), Math.round(azar() * 80 - 20));
    regiones.push(puntos);
  }
  comprobar(regiones, `aleatorio ${i}`);
}

assert.deepEqual(triangular([]), []);
assert.deepEqual(triangular([1, 1, 1, 1, 1, 1]), []);
assert.deepEqual(triangularRegiones([]), []);
assert.deepEqual(segmentosEje([0, 0, 0, 0, 2, 3, 4, 5]), [0, 0, 2, 3, 2, 3, 4, 5]);

// La curva abierta debe conservar las puntas; la cerrada empieza en el mismo midpoint que Canvas.
const control = [0, 0, 50, 100, 100, 0];
const abierta = aplanarCurva(control, false, true);
assert.deepEqual(abierta.slice(0, 2), [0, 0]);
assert.deepEqual(abierta.slice(-2), [100, 0]);
assert.deepEqual(aplanarCurva(control, true, true).slice(0, 2), [50, 0]);
assert.deepEqual(aplanarCurva(control, true, false), control);

function distanciaSegmento(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
for (let i = 0; i <= 1000; i++) {
  const t = i / 1000;
  // Primera cuadrática de tracePath abierto: (0,0) → control (50,100) → (75,50).
  const x = 2 * (1 - t) * t * 50 + t * t * 75;
  const y = 2 * (1 - t) * t * 100 + t * t * 50;
  let distancia = Infinity;
  for (let j = 2; j < abierta.length; j += 2) distancia = Math.min(distancia, distanciaSegmento(x, y, abierta[j - 2], abierta[j - 1], abierta[j], abierta[j + 1]));
  assert.ok(distancia * 7 < 0.2, `error de curva en zoom 7: ${distancia * 7}`);
}
console.log(`Geometría: ${muestras} muestras nonzero sin agujeros ni doble cobertura; curvas verificadas en zoom 7.`);
