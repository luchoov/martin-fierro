/** Evidencia visual determinista q0. Herramienta externa: playwright-core; navegador: Chromium. */
import { mkdir as crearDirectorio, writeFile as escribirArchivo } from 'node:fs/promises';
import { fileURLToPath as rutaDeURL } from 'node:url';
import { resolve as resolverRuta } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_CORE || '/tmp/trama-browser/node_modules/playwright-core/index.mjs');
const base = process.env.TRAMA_URL || 'http://localhost:5178/';
const salida = rutaDeURL(new URL('./', import.meta.url));
const rutaBench = '/@fs' + rutaDeURL(new URL('../../packages/trama/src/render/bench.ts', import.meta.url));
const salidaCanales = process.env.TRAMA_CANALES || '/tmp/trama-canales';
await crearDirectorio(salida, { recursive: true });
await crearDirectorio(salidaCanales, { recursive: true });
const navegador = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const encuadres = [
  { name: 'portada', folio: '', beat: 0 },
  { name: 'estrofa-224', folio: 'Estrofa 224', beat: 3 },
  { name: 'estrofa-230', folio: 'Estrofa 230', beat: 9 },
  { name: 'detalle-224', folio: 'Estrofa 224', beat: 3, zoom: 2 },
];
const resultados = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, quality: 0, seed: 8128, simulationSeconds: 2, encuadres: [], verificacion: [] };

function observar(pagina) {
  const eventos = [];
  pagina.on('pageerror', error => eventos.push({ type: 'pageerror', mensaje: error.message }));
  pagina.on('console', mensaje => {
    if (['error', 'warning'].includes(mensaje.type())) eventos.push({ type: mensaje.type(), mensaje: mensaje.text(), direccion: mensaje.location().url });
  });
  pagina.on('requestfailed', peticion => eventos.push({ type: 'requestfailed', mensaje: `${peticion.url()}: ${peticion.failure()?.errorText}` }));
  return eventos;
}

async function crearPagina() {
  const pagina = await navegador.newPage({ viewport: resultados.viewport, deviceScaleFactor: 1 });
  await pagina.addInitScript(() => {
    let seed = 8128;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    // Stage.step controla el dibujo: se suprimen el RAF inicial y los cambios por desplazamiento.
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
    window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
    // Se desactiva el HMR durante cada toma para evitar recargas por edición del repositorio.
    window.WebSocket = class { readyState = 0; addEventListener() {} send() {} close() {} };
    localStorage.setItem('trama.martin-fierro.nota', '1');
  });
  return pagina;
}

async function cargar(pagina, raster, depurar = false) {
  const direccion = new URL(base);
  direccion.searchParams.set('q', '0');
  if (raster === '2d') direccion.searchParams.set('raster', '2d');
  if (depurar) direccion.searchParams.set('debug', '');
  await pagina.goto(direccion.href, { waitUntil: 'networkidle', timeout: 30000 });
  await pagina.waitForFunction(() => window.trama?.stage, undefined, { timeout: 30000 });
  await pagina.evaluate(() => { window.trama.stage.stop(); return document.fonts.ready; });
  await pagina.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}.tapa{display:none!important}' });
  return direccion.href;
}

try {
  for (const encuadre of encuadres) {
    for (const raster of ['2d', 'webgl2']) {
      const pagina = await crearPagina();
      const eventos = observar(pagina);
      const direccion = await cargar(pagina, raster);
      const estado = await pagina.evaluate(({ folio, beat, zoom }) => {
        const { stage, escena, pasos, irA } = window.trama;
        const k = folio ? pasos.findIndex(p => p.folio === folio) : 0;
        irA(k);
        stage.stop();
        stage.print(true, true); // La portada normalmente muestra papel: se revela la ilustración.
        stage.snapPlate();
        const s = escena.beats[beat].shot;
        stage.shot(s, true);
        // Se avanza la simulación en pasos idénticos sin rasterizar cuadros intermedios.
        for (let i = 0; i < 120; i++) stage.world.update(1 / 60);
        stage.shot(s, true);
        if (zoom) {
          stage.free = true;
          stage.camera.jump(stage.camera.x, stage.camera.y, Math.min(stage.camera.maxZ, stage.camera.z * zoom));
        }
        stage.step(0);
        const gl = stage.printer.gl;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          k, beat, t: stage.world.t, camera: [stage.camera.x, stage.camera.y, stage.camera.z],
          actors: stage.world.actors.map(a => ({ name: a.name, x: a.x, y: a.y, visible: a.visible })),
          particles: stage.world.particles.length, variant: stage.world.variant,
          raster: stage.raster, quality: stage.quality, canvas: [stage.canvas.width, stage.canvas.height],
          glVersion: gl.getParameter(gl.VERSION),
          renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER), glError: gl.getError(),
          ops: stage.stats.ops, samples: stage.sep.samples ?? 0, draws: stage.sep.draws ?? null,
          gpuTimer: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
        };
      }, encuadre);
      // La captura usa la salida del compositor; no hace falta preservar el buffer de dibujo.
      const archivo = `${encuadre.name}-${raster}.png`;
      await pagina.screenshot({ path: resolverRuta(salida, archivo), animations: 'disabled' });
      // Se leen las texturas reales, antes de la risografía, para comparar cada canal de tinta.
      const separaciones = await pagina.evaluate(() => {
        const { stage } = window.trama;
        const gl = stage.printer.gl;
        const sep = stage.sep;
        const texturas = stage.raster === '2d' ? [stage.printer.texA, stage.printer.texB] : [sep.texA, sep.texB];
        const anterior = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        const fbo = gl.createFramebuffer();
        const lienzo = document.createElement('canvas');
        lienzo.width = sep.w;
        lienzo.height = sep.h;
        const contexto = lienzo.getContext('2d');
        const imagenes = [];
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        for (const textura of texturas) {
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textura, 0);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Framebuffer de lectura incompleto');
          const datos = new Uint8Array(sep.w * sep.h * 4);
          gl.readPixels(0, 0, sep.w, sep.h, gl.RGBA, gl.UNSIGNED_BYTE, datos);
          for (let i = 3; i < datos.length; i += 4) datos[i] = 255;
          contexto.putImageData(new ImageData(new Uint8ClampedArray(datos), sep.w, sep.h), 0, 0);
          imagenes.push(lienzo.toDataURL('image/png').split(',')[1]);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, anterior);
        gl.deleteFramebuffer(fbo);
        return { imagenes, errorGL: gl.getError() };
      });
      for (let i = 0; i < separaciones.imagenes.length; i++) {
        await escribirArchivo(resolverRuta(salidaCanales, `${encuadre.name}-${raster}-${i === 0 ? 'ABC' : 'KL'}.png`), Buffer.from(separaciones.imagenes[i], 'base64'));
      }
      resultados.encuadres.push({ name: encuadre.name, archivo, direccion, estado, eventos });
      if (separaciones.errorGL) throw new Error(`Error GL al leer separaciones: ${separaciones.errorGL}`);
      console.log(`${archivo}: ${estado.raster}, q${estado.quality}, t=${estado.t.toFixed(6)}, GL=${estado.glError}, eventos=${eventos.length}`);
      await pagina.close();
    }
  }
  for (const raster of ['2d', 'webgl2']) {
    const pagina = await crearPagina();
    const eventos = observar(pagina);
    const direccion = await cargar(pagina, raster, true);
    await pagina.waitForSelector('.trama-debug');
    const verificacion = await pagina.evaluate(async (ruta) => {
      const { stage } = window.trama;
      stage.print(true, true);
      stage.step(0);
      const depurar = document.querySelector('.trama-debug').textContent;
      const { runBench } = await import(ruta);
      const c = [stage.camera.x, stage.camera.y, stage.camera.z];
      const informe = await runBench(stage, [{ name: 'smoke', kind: 'quieto', frames: 3, warmup: 1, cam: () => c }], { manual: true, overlay: false, passes: ['desglose'] });
      stage.stop();
      // SwiftShader sirve para verificar la instrumentación; no mide el rendimiento de hardware.
      return {
        raster: stage.raster, meta: informe.meta,
        tableHeader: informe.markdown.split('\n').find(linea => linea.startsWith('| tramo')),
        debugHasRaster: depurar.includes(stage.raster),
        debugLabels: depurar.split('\n').filter(linea => linea.includes('CPU') || linea.includes('GPU')).map(linea => linea.replace(/\d+(?:\.\d+)?/g, '#')),
        rows: informe.rows.map(fila => ({ name: fila.name, cpuSamples: fila.cpu.n, printSamples: fila.print?.n || 0, gpuRasterSamples: fila.gpuRaster?.n || 0, gpuSamples: fila.gpu?.n || 0 })),
        glError: stage.printer.gl.getError(),
      };
    }, rutaBench);
    resultados.verificacion.push({ direccion, ...verificacion, eventos });
    console.log(`verificacion-${raster}: ${verificacion.tableHeader}, GL=${verificacion.glError}, eventos=${eventos.length}`);
    await pagina.close();
  }
  for (const encuadre of encuadres) {
    const par = resultados.encuadres.filter(resultado => resultado.name === encuadre.name);
    const coinciden = JSON.stringify({ ...par[0].estado, raster: undefined, ops: undefined, glError: undefined, samples: undefined, draws: undefined }) === JSON.stringify({ ...par[1].estado, raster: undefined, ops: undefined, glError: undefined, samples: undefined, draws: undefined });
    if (!coinciden) throw new Error(`Estado de escena diferente para ${encuadre.name}`);
  }
  await escribirArchivo(resolverRuta(salida, 'verificacion.json'), JSON.stringify(resultados, null, 2) + '\n');
} finally {
  await navegador.close();
}
