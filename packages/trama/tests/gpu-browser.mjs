import { GpuSeparation } from '../src/print/gpu-separation.ts';
import { Drawer } from '../src/draw/drawer.ts';
import { Mode } from '../src/print/separation.ts';
import { Ink } from '../src/print/ink.ts';
import { triangular } from '../src/draw/geometry.ts';

/** Ejecutar desde gpu.html servido por Vite; no agrega dependencias al motor. */
export function verificarGpu() {
  const gl = document.createElement('canvas').getContext('webgl2', { antialias: false });
  if (!gl) throw new Error('La verificación necesita WebGL2');
  const sep = new GpuSeparation(gl);
  const lectura = gl.createFramebuffer();
  const pixel = new Uint8Array(4);
  const resultados = [];
  const cuadrado = triangular([4, 4, 28, 4, 28, 28, 4, 28]);
  const op = (m, i, a = 1, l = false, t = cuadrado) => ({ m, i, a, l, t });
  const comprobar = (nombre, actual, esperado, tolerancia = 1) => {
    const ok = actual.every((valor, i) => Math.abs(valor - esperado[i]) <= tolerancia);
    resultados.push({ nombre, actual, esperado, ok });
  };
  const leer = (textura, x = 12, y = 12) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, lectura);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textura, 0);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return [...pixel.slice(0, 3)];
  };
  const ejecutar = (ops, msaa = false, x = 12, y = 12, zoom = 1) => {
    sep.prepare(ops);
    sep.resize(32, 32, 1, msaa);
    sep.clear();
    sep.setView(0, 0, zoom, 0, 0);
    sep.play(ops);
    sep.finish();
    return [leer(sep.texA, x, y), leer(sep.texB, x, y)];
  };

  const tinta = Ink.of(.8, .2, .5, .6);
  for (const msaa of [false, true]) {
    const salida = ejecutar([op(Mode.Fill, tinta, 1, true), op(Mode.Fill, Ink.of(0, .5, 0), .5)], msaa);
    comprobar(`Fill alfa: RGB, MSAA=${msaa}`, salida[0], [102, 90, 64]);
    comprobar(`Fill alfa: borra máscara, MSAA=${msaa}`, salida[1], [77, 128, 0]);
  }
  let salida = ejecutar([op(Mode.Fill, tinta, 1, true), op(Mode.Fill, Ink.of())]);
  comprobar('Fill sin tinta cala RGB', salida[0], [0, 0, 0]);
  comprobar('Fill sin tinta cala clave y línea', salida[1], [0, 0, 0]);
  salida = ejecutar([op(Mode.Fill, tinta, 1, true), op(Mode.Sub, Ink.of(.5, .25, 1, .5), .5)]);
  comprobar('Sub multiplica RGB', salida[0], [153, 45, 64]);
  comprobar('Sub conserva máscara', salida[1], [115, 255, 0]);
  salida = ejecutar([op(Mode.Fill, Ink.of(.3, .8, .2, .4)), op(Mode.Over, Ink.of(.8, .4, .6, .8), .5, true)]);
  comprobar('Over alfa: aproximación MAX documentada', salida[0], [102, 204, 77]);
  comprobar('Over alfa: clave y línea', salida[1], [102, 128, 0]);

  for (const modo of [Mode.Add, Mode.Fill]) {
    for (const msaa of [false, true]) {
      const duplicado = op(modo, Ink.of(.5, .2, .3, .4), .5, true, cuadrado.concat(cuadrado));
      duplicado.once = true;
      salida = ejecutar([duplicado], msaa);
      comprobar(`Una sola aplicación RGB: modo=${modo}, MSAA=${msaa}`, salida[0], [64, 26, 38]);
      comprobar(`Una sola aplicación clave/línea: modo=${modo}, MSAA=${msaa}`, salida[1], [51, 128, 0]);
    }
  }
  salida = ejecutar([op(Mode.Fill, Ink.of(.5), .5), op(Mode.Fill, Ink.of(.5), .5)]);
  comprobar('Dos ops alfa distintas se acumulan', salida[0], [96, 0, 0]);
  salida = ejecutar(Array.from({ length: 300 }, (_, i) => op(Mode.Fill, Ink.of(i / 300))));
  comprobar('Respeta orden de 300 ops en un lote', salida[0], [254, 0, 0]);
  comprobar('Un solo draw para 300 Fill consecutivos', [sep.draws], [1], 0);

  const eje = op(Mode.Fill, Ink.of(.5, 0, 0, 1), .5, true, []);
  eje.s = [4, 8.5, 28, 8.5];
  eje.w = .1;
  sep.minLine = 4;
  salida = ejecutar([eje], false, 12, 9);
  comprobar('Expansión de eje en vertex shader', salida[0], [64, 0, 0]);
  comprobar('Expansión de máscara de línea', salida[1], [128, 128, 0]);
  comprobar('Fuera del grosor mínimo', ejecutar([eje], false, 12, 11)[0], [0, 0, 0]);
  const ejeYRelleno = { ...eje, t: triangular([4, 8, 28, 8, 28, 9, 4, 9]) };
  comprobar('Eje y relleno parcial no duplican alfa', ejecutar([ejeYRelleno], false, 12, 8)[0], [64, 0, 0]);
  sep.minLine = 1;

  // Bloquea Path2D: si el camino predeterminado lo construye, el test falla enseguida.
  const PathViejo = window.Path2D;
  window.Path2D = class { constructor() { throw new Error('Path2D en el camino GPU'); } };
  let dibujo;
  try {
    dibujo = new Drawer().begin(1, 0);
    dibujo.push(Mode.Fill, [0, 0, 40, 40, 0, 40, 20, 0], tinta, true, false);
    dibujo.push(Mode.Fill, [11, 9, 13, 9, 13, 11, 11, 11], tinta, true, false);
    dibujo.regions(Mode.Add, [[4, 4, 12, 4, 12, 12, 4, 12]], tinta);
    comprobar('GPU no graba Path2D', [Number(dibujo.ops.every(o => !o.p && !o.c))], [1], 0);
  } finally {
    window.Path2D = PathViejo;
  }
  comprobar('Lóbulo autointersectado cancela contorno del mismo signo global', ejecutar([dibujo.ops[0]], false, 12, 10)[0], [0, 0, 0]);
  const viejo = new Drawer(true).begin(1, 0);
  viejo.push(Mode.Fill, [4, 4, 28, 4, 28, 28, 4, 28], tinta, true, false);
  comprobar('Modo 2D conserva sólo Path2D', [Number(viejo.ops[0].p instanceof PathViejo && viejo.ops[0].t.length === 0 && !viejo.ops[0].s)], [1], 0);

  // Cuenta subidas reales: la cámara no debería transferir otra vez las mallas.
  let verticesSubidos = 0;
  let indicesSubidos = 0;
  const subir = gl.bufferSubData.bind(gl);
  gl.bufferSubData = (...args) => {
    if (args[0] === gl.ARRAY_BUFFER) verticesSubidos++;
    if (args[0] === gl.ELEMENT_ARRAY_BUFFER) indicesSubidos++;
    return subir(...args);
  };
  const fija = [op(Mode.Fill, Ink.of(1))];
  sep.prepare(fija);
  const antes = verticesSubidos;
  sep.prepare(fija);
  comprobar('Malla estática se sube una sola vez', [verticesSubidos - antes], [0], 0);
  sep.beginDynamic();
  const movil = [op(Mode.Fill, Ink.of(0, 1), 1, false, triangular([8, 8, 24, 8, 24, 24, 8, 24]))];
  sep.prepare(movil, true);
  const antesMovil = verticesSubidos;
  sep.endDynamic();
  comprobar('Todo el tick móvil usa una subida', [verticesSubidos - antesMovil], [1], 0);
  const grande = [op(Mode.Fill, Ink.of(0, 0, 1), 1, false, Array.from({ length: 1500 }, () => cuadrado).flat())];
  sep.prepare(grande);
  sep.resize(32, 32, 1, false);
  const imprimir = () => { sep.clear(); sep.setView(0, 0, 1, 0, 0); sep.play(fija); sep.play(movil); sep.finish(); };
  imprimir();
  comprobar('Crecer arena fija conserva malla anterior', leer(sep.texA, 6, 6), [255, 0, 0]);
  comprobar('Reubica arena móvil al crecer la fija', leer(sep.texA), [0, 255, 0]);
  const antesCamara = [verticesSubidos, indicesSubidos];
  imprimir();
  comprobar('Reimprimir sin tick no sube vértices ni índices', [verticesSubidos - antesCamara[0], indicesSubidos - antesCamara[1]], [0, 0], 0);
  sep.beginDynamic();
  const grandeMovil = [op(Mode.Fill, Ink.of(0, 0, 1), 1, false, grande[0].t)];
  sep.prepare(grandeMovil, true);
  sep.endDynamic();
  sep.clear(); sep.setView(0, 0, 1, 0, 0); sep.play(fija); sep.play(grandeMovil); sep.finish();
  comprobar('Crecer arena móvil conserva la fija y la nueva móvil', leer(sep.texA), [0, 0, 255]);

  // Cubre crecimiento de arena después de encolar rangos móviles (API de preparación tardía).
  const tardia = new GpuSeparation(gl);
  tardia.resize(32, 32, 1, false);
  tardia.beginDynamic();
  tardia.prepare(movil, true);
  tardia.endDynamic();
  tardia.clear(); tardia.setView(0, 0, 1, 0, 0); tardia.play(movil);
  tardia.prepare(grande);
  tardia.finish();
  comprobar('Reubica rangos ya encolados al crecer la arena fija', leer(tardia.texA), [0, 255, 0]);

  for (const msaa of [true, false, true]) {
    sep.beginDynamic();
    const siguiente = [op(Mode.Fill, Ink.of(0, 0, 1))];
    sep.prepare(siguiente, true);
    sep.endDynamic();
    sep.resize(48, 48, 1, msaa);
    sep.clear(); sep.setView(0, 0, 1, 0, 0); sep.play(siguiente); sep.finish();
    comprobar(`Redimensiona y alterna MSAA=${msaa}`, leer(sep.texA), [0, 0, 255]);
  }
  salida = ejecutar([op(Mode.Fill, Ink.of(1), 1, false, triangular([4, 4, 28, 4, 4, 28]))], true, 16, 15);
  if (sep.samples) comprobar('Resolve MSAA deja cobertura parcial en diagonal', [Number(salida[0][0] > 0 && salida[0][0] < 255)], [1], 0);
  sep.resetMeshes(); sep.clear(); sep.finish();
  comprobar('Bake vacío no reproduce lotes anteriores', leer(sep.texA), [0, 0, 0]);
  comprobar('Bake vacío no emite draws', [sep.draws], [0], 0);
  comprobar('Sin errores de WebGL', [gl.getError()], [gl.NO_ERROR], 0);
  const fallos = resultados.filter(r => !r.ok);
  return { muestrasMSAA: sep.samples, comprobaciones: resultados.length, fallos, resultados };
}
