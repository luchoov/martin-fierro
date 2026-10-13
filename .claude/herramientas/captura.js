// Captura determinista de la lámina: misma semilla, mismo paso de tiempo, cámara fija.
export async function capturar(nombre, k, { frames = 90, zoom = 1, dx = 0, dy = 0, samples = 0, hair = 0 } = {}) {
  const T = window.trama;
  const st = T.stage;
  st.stop();
  if (hair) st['sep'].hair = hair;
  if (samples) {
    st['sep'].samples = samples;
    st['sep'].w = 0;
  }
  let s = 12345;
  Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  T.irA(k);
  st.print(true, true);
  st.snapPlate();
  st.world.dusk = st.world.duskTarget;
  const shot = T.escena.beats[T.pasos[k].beat].shot;
  const c = st.camFor(typeof shot === 'function' ? shot() : shot);
  const cam = [c[0] + dx, c[1] + dy, c[2] * zoom];
  st.rail = () => cam;
  for (let i = 0; i < frames; i++) st.step(1 / 60);
  st['dirty'] = true;
  st.step(1 / 60);
  const url = st.canvas.toDataURL('image/png');
  const blob = await (await fetch(url)).blob();
  await fetch('/__captura?n=' + nombre, { method: 'POST', body: blob });
  return { nombre, w: st.canvas.width, h: st.canvas.height, kb: Math.round(blob.size / 1024), zoom: cam[2].toFixed(3) };
}

const FS = '/@fs/C:/dev/martin-fierro/.claude/herramientas/capturas/';

async function pixeles(nombre) {
  const img = await createImageBitmap(await (await fetch(FS + nombre + '.png?' + Date.now())).blob());
  const c = new OffscreenCanvas(img.width, img.height);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  return x.getImageData(0, 0, c.width, c.height);
}

/** Diferencia entre dos capturas: promedio, píxeles que cambian a simple vista, y una imagen de diferencias (×4). */
export async function comparar(a, b, salida) {
  const A = await pixeles(a);
  const B = await pixeles(b);
  const n = A.width * A.height;
  let sum = 0;
  let big = 0;
  let max = 0;
  const D = new ImageData(A.width, A.height);
  for (let i = 0; i < n; i++) {
    const dr = Math.abs(A.data[4 * i] - B.data[4 * i]);
    const dg = Math.abs(A.data[4 * i + 1] - B.data[4 * i + 1]);
    const db = Math.abs(A.data[4 * i + 2] - B.data[4 * i + 2]);
    const d = Math.max(dr, dg, db);
    sum += (dr + dg + db) / 3;
    if (d > 40) big++;
    if (d > max) max = d;
    const v = 255 - Math.min(255, d * 4);
    D.data[4 * i] = 255;
    D.data[4 * i + 1] = v;
    D.data[4 * i + 2] = v;
    D.data[4 * i + 3] = 255;
  }
  if (salida) {
    const c = new OffscreenCanvas(A.width, A.height);
    c.getContext('2d').putImageData(D, 0, 0);
    const blob = await c.convertToBlob({ type: 'image/png' });
    await fetch('/__captura?n=' + salida, { method: 'POST', body: blob });
  }
  return { a, b, promedio: +(sum / n).toFixed(3), cambian40: +((100 * big) / n).toFixed(3) + '%', max };
}

/** Recortes ampliados de varias capturas, lado a lado (para mirar detalles). */
export async function recorte(nombres, x, y, w, h, escala, salida) {
  const imgs = [];
  for (const n of nombres) imgs.push(await createImageBitmap(await (await fetch(FS + n + '.png?' + Date.now())).blob()));
  const c = new OffscreenCanvas(w * escala * imgs.length + 8 * (imgs.length - 1), h * escala);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  imgs.forEach((im, i) => g.drawImage(im, x, y, w, h, i * (w * escala + 8), 0, w * escala, h * escala));
  const blob = await c.convertToBlob({ type: 'image/png' });
  await fetch('/__captura?n=' + salida, { method: 'POST', body: blob });
  return salida;
}

/** Los cinco encuadres de comparación (cada uno pide una página recién cargada). */
export const ENCUADRES = {
  lejos: [1, {}],
  '224': [4, {}],
  '230': [10, {}],
  detalle: [4, { zoom: 2.6, dx: -10, dy: -30 }],
  muylejos: [1, { zoom: 0.55 }],
};

/**
 * Medición de un encuadre en movimiento: mediana de la impresión esperando a la GPU, con
 * calentamiento (la GPU integrada sube de frecuencia con la carga). parte: 'todo', 'sep'
 * (sin shader) o 'shader' (sin separaciones).
 */
export function medirVista(k, { zoom = 1, n = 40, warm = 30, parte = 'todo' } = {}) {
  const T = window.trama;
  const st = T.stage;
  const sep = st['sep'];
  const pr = st.printer;
  st.stop();
  T.irA(k);
  st.print(true, true);
  st.snapPlate();
  const shot = T.escena.beats[T.pasos[k].beat].shot;
  const c = st.camFor(typeof shot === 'function' ? shot() : shot);
  let i = 0;
  st.rail = () => [c[0] + (i % 2) * 3, c[1], c[2] * zoom];
  pr.wait = true;
  if (parte === 'sep') pr.render = () => {};
  if (parte === 'shader') sep.draw = () => {};
  const r = { sync: [], tick: [], pack: [] };
  for (let f = 0; f < n + warm; f++) {
    i++;
    st.step(1 / 60);
    const s = st.stats;
    if (f < warm) continue;
    r.sync.push(s.sync);
    if (s.ticked) {
      r.tick.push(s.tick);
      r.pack.push(s.pack);
    }
  }
  delete pr.render;
  delete sep.draw;
  st.rail = undefined;
  pr.wait = false;
  const med = (a) => (a.length ? +a.sort((x, y) => x - y)[a.length >> 1].toFixed(1) : null);
  return { k, parte, zoom: +(c[2] * zoom).toFixed(2), sync: med(r.sync), tick: med(r.tick), pack: med(r.pack), ops: st.stats.ops, kv: Math.round(st.stats.verts / 1000) };
}

/** Guarda las separaciones de la última impresión (c1: tintas; c2: clave y máscara de línea). */
export async function separaciones(nombre) {
  const st = window.trama.stage;
  const sep = st['sep'];
  const save = async (c, n) => {
    const blob = c.convertToBlob ? await c.convertToBlob({ type: 'image/png' }) : await new Promise((r) => c.toBlob(r, 'image/png'));
    await fetch('/__captura?n=' + n, { method: 'POST', body: blob });
  };
  if (sep.c1) {
    // Motor anterior: lienzos 2D.
    await save(sep.c1, nombre + '-c1');
    await save(sep.c2, nombre + '-c2');
    return 'lienzo';
  }
  const gl = st.printer.gl;
  for (const [fb, n] of [
    [sep['fbA'], '-c1'],
    [sep['fbB'], '-c2'],
  ]) {
    const w = sep.w;
    const h = sep.h;
    const px = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    for (let i = 3; i < px.length; i += 4) px[i] = 255;
    const c = new OffscreenCanvas(w, h);
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.buffer), w, h), 0, 0);
    await save(c, nombre + n);
  }
  return 'gpu';
}

/** Brillo medio de zonas de una captura. */
export async function brillo(n, zonas) {
  const img = await createImageBitmap(await (await fetch(FS + n + '.png?' + Date.now())).blob());
  const cc = new OffscreenCanvas(img.width, img.height);
  const x = cc.getContext('2d');
  x.drawImage(img, 0, 0);
  const out = {};
  for (const [k, [x0, y0, w, h]] of Object.entries(zonas)) {
    const d = x.getImageData(x0, y0, w, h).data;
    let L = 0;
    for (let i = 0; i < d.length; i += 4) L += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    out[k] = +(L / (d.length / 4)).toFixed(1);
  }
  return out;
}
