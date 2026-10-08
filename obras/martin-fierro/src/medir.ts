import type { Stage } from 'trama';
import { rails, runBench, type BenchLeg, type BenchOptions } from 'trama/bench';
import type { Beat } from './escenas/pulperia';

interface Contexto {
  stage: Stage;
  escena: { beats: Beat[] };
  pasos: { tipo: string; folio: string; beat: number; sec: HTMLElement }[];
  irA: (k: number) => void;
  io: IntersectionObserver;
}

/** Recorrido del benchmark: lejos (portada de la escena), cerca (estrofa 224) y atardecer (estrofa 230). */
export async function medir({ stage, escena, pasos, irA, io }: Contexto, opts: BenchOptions = {}) {
  const k = (folio: string) => pasos.findIndex((p) => p.folio === folio);
  const intro = pasos.findIndex((p) => p.tipo === 'intro');
  const [e224, e230] = [k('Estrofa 224'), k('Estrofa 230')];
  // Pasa de momento sin animar: la prensa ya pasó y el atardecer ya cayó, igual en cada corrida.
  const ir = (n: number) => () => {
    irA(n);
    stage.print(true, true);
    stage.snapPlate();
    stage.world.dusk = stage.world.duskTarget;
  };
  const cam = (n: number) => {
    const s = escena.beats[pasos[n].beat].shot;
    return stage.camFor(typeof s === 'function' ? s() : s);
  };
  const [lejos, cerca, tarde] = [() => cam(intro), () => cam(e224), () => cam(e230)];
  const pan = (c: () => [number, number, number]) => (u: number) => rails.pan(c(), stage.view.w)(u);
  const legs: BenchLeg[] = [
    { name: 'lejos quieto', kind: 'quieto', frames: 90, warmup: 60, setup: ir(intro), cam: lejos },
    { name: 'lejos paneo', kind: 'paneo', frames: 120, cam: pan(lejos) },
    { name: 'lejos→cerca zoom', kind: 'zoom', frames: 120, cam: (u) => rails.zoom(lejos(), cerca())(u) },
    { name: 'cerca quieto 224', kind: 'quieto', frames: 90, warmup: 60, setup: ir(e224), cam: cerca },
    { name: 'cerca paneo', kind: 'paneo', frames: 120, cam: pan(cerca) },
    { name: 'cerca→lejos zoom', kind: 'zoom', frames: 120, cam: (u) => rails.zoom(cerca(), lejos())(u) },
    { name: 'atardecer quieto 230', kind: 'quieto', frames: 90, warmup: 60, setup: ir(e230), cam: tarde },
    { name: 'atardecer paneo', kind: 'paneo', frames: 120, cam: pan(tarde) },
  ];
  // El scroll no cambia de momento mientras se mide.
  io.disconnect();
  try {
    return await runBench(stage, legs, opts);
  } finally {
    pasos.forEach((p) => io.observe(p.sec));
  }
}
