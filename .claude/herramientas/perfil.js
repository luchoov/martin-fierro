// Perfil de la grabación (world.tick) por partes. Uso en la página:
//   const p = await import('/@fs/C:/dev/martin-fierro/.claude/herramientas/perfil.js?' + Date.now());
//   await p.perfil(4, 60)   // paso, cantidad de ticks
const T = {};
const wrapped = new Set();

function wrap(proto, name, key) {
  const id = key;
  if (wrapped.has(id)) return;
  wrapped.add(id);
  const f = proto[name];
  proto[name] = function (...a) {
    const t = performance.now();
    try {
      return f.apply(this, a);
    } finally {
      const e = T[key] || (T[key] = { ms: 0, n: 0 });
      e.ms += performance.now() - t;
      e.n++;
    }
  };
}

export async function perfil(paso, ticks = 60, opts = {}) {
  // Los prototipos salen de las instancias: un import() con variable lleva ?import y es otro módulo.
  const st = window.trama.stage;
  const Drawer = { prototype: Object.getPrototypeOf(st.drawer) };
  const Mesh = { prototype: Object.getPrototypeOf(st.drawer.mesh) };
  if (!opts.sinEnvolver) {
    wrap(Mesh.prototype, 'fill', 'mesh.fill');
    wrap(Mesh.prototype, 'ring', 'mesh.ring');
    wrap(Mesh.prototype, 'axis', 'mesh.axis');
    wrap(Mesh.prototype, 'poly', 'mesh.poly');
    wrap(Mesh.prototype, 'strip', 'mesh.strip');
    wrap(Mesh.prototype, 'take', 'mesh.take');
    wrap(Drawer.prototype, 'push', 'drawer.push');
  }
  if (paso != null) window.trama.irA(paso);
  for (let i = 0; i < 90; i++) st.step(1 / 30);
  const w = st.world;
  const d = st.drawer;
  if (opts.zoom) w.zoom = opts.zoom;
  const cover = w.cover;
  if (opts.sinRecorte) w.cover = [-Infinity, -Infinity, Infinity, Infinity];
  for (const k in T) delete T[k];
  for (let i = 0; i < 5; i++) w.tick(d);
  for (const k in T) delete T[k];
  const ts = [];
  for (let i = 0; i < ticks; i++) {
    w.update(1 / 30);
    const t = performance.now();
    w.tick(d);
    ts.push(performance.now() - t);
  }
  w.cover = cover;
  ts.sort((a, b) => a - b);
  const out = { zoom: +w.zoom.toFixed(2), tick: +ts[ts.length >> 1].toFixed(2), p25: +ts[ts.length >> 2].toFixed(2), grabadas: w.items.filter((i) => i.record && !i.culled).length };
  for (const k in T) out[k] = `${(T[k].ms / ticks).toFixed(2)} ms · ${Math.round(T[k].n / ticks)}`;
  return out;
}

/** Costo de grabar cada pieza (agrupado por tipo) y cuántas caen dentro de la vista. */
export async function porPieza(paso, ticks = 30) {
  const st = window.trama.stage;
  if (paso != null) window.trama.irA(paso);
  for (let i = 0; i < 90; i++) st.step(1 / 30);
  const w = st.world;
  const d = st.drawer;
  const G = {};
  const c = st.camera;
  const [ax, ay] = st.anchor;
  const vx0 = c.x - ax / c.z, vy0 = c.y - ay / c.z, vx1 = c.x + (st.view.w - ax) / c.z, vy1 = c.y + (st.view.h - ay) / c.z;
  for (let i = 0; i < ticks; i++) {
    w.update(1 / 30);
    for (const it of w.items) {
      if (!(it.record && it.visible && !it.carried)) continue;
      const t = performance.now();
      it.record(d, w);
      const ms = performance.now() - t;
      const k = it.constructor.name + ':' + (it.name || '').replace(/\d+$/, '');
      const g = G[k] || (G[k] = { ms: 0, n: 0, verts: 0, vis: 0, msVis: 0 });
      g.ms += ms;
      g.n++;
      const b = it.b;
      if (b[0] < vx1 && b[2] > vx0 && b[1] < vy1 && b[3] > vy0) (g.vis++, (g.msVis += ms));
      g.verts += it.ops(w).pos.length >> 1;
    }
  }
  const rows = Object.entries(G)
    .map(([k, g]) => [k, +(g.ms / ticks).toFixed(2), Math.round(g.n / ticks), Math.round(g.vis / ticks), Math.round(g.verts / ticks), +(g.msVis / ticks).toFixed(2)])
    .sort((a, b) => b[1] - a[1]);
  const sum = (j) => +rows.reduce((s, r) => s + r[j], 0).toFixed(1);
  return { zoom: +w.zoom.toFixed(2), ms: sum(1), msVis: sum(5), n: sum(2), vis: sum(3), cols: 'tipo,ms,n,enVista,vért,msEnVista', rows: rows.slice(0, 12).map((r) => r.join(' ')) };
}

/** Banco fijo: graba siempre lo mismo (una persona, matas de pasto) y da el mínimo de varias tandas, en µs. */
export function banco(n = 200, tandas = 5, zoom = 3) {
  const st = window.trama.stage;
  const w = st.world;
  const d = st.drawer;
  const z = w.zoom;
  w.zoom = zoom;
  const persona = w.items.find((i) => i.name === 'fierro');
  const matas = w.items.filter((i) => i.constructor.name === 'Dyn').slice(10, 30);
  const medir = (fn) => {
    let best = Infinity;
    for (let t = 0; t < tandas; t++) {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) fn();
      best = Math.min(best, performance.now() - t0);
    }
    return +((best / n) * 1000).toFixed(1);
  };
  const r = {
    persona: medir(() => persona.record(d, w)),
    matas20: medir(() => { for (const m of matas) m.record(d, w); }),
    vertsPersona: persona.ops(w).pos.length >> 1,
  };
  w.zoom = z;
  return r;
}
