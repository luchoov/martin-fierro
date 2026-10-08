import {
  Carancho,
  Chicken,
  DOG,
  HORSE,
  Human,
  Quadruped,
  Rng,
  call,
  flock,
  go,
  iso,
  loop,
  play,
  type Actor,
  type Brain,
  type Shot,
  type Task,
  type Vec2,
  type World,
} from 'trama';
import { DOG_LOOK, HORSES, LOOKS } from '../elenco';
import { I } from '../tintas';
import { SLAB, armarPulperia } from './decorado';

export interface Beat {
  shot: Shot | (() => Shot);
  /** seq = se llegó desde el momento anterior (se anima); si no, se acomoda de golpe. */
  enter(seq: boolean): void;
}

const S = (x: number, y: number, z: number, span: number, stiffness?: number): Shot => ({ x, y, z, span, stiffness });

const SEATED = new Set(['sit', 'sitDrink', 'mate', 'guitar', 'guitarRest', 'truco', 'think', 'tipHatSit']);

/** Canto VIII: la pelea en la pulpería. */
export function crearPulperia(w: World): { beats: Beat[] } {
  const deco = armarPulperia(w);
  const rng = new Rng('direccion');
  const F = deco.fogon;

  // ——— Elenco ———
  let seed = 100;
  const H = (name: string, look: string, x: number, y: number, face = 1, seat = 0.45) => {
    const h = w.add(new Human(name, seed++, LOOKS[look]));
    h.place(x, y, face);
    h.seat = seat;
    return h;
  };
  const fierro = H('fierro', 'fierro', 3.3, 2.85, 1);
  const vasco = H('vasco', 'vasco', 4.55, 2.9, 1);
  const pulpero = H('pulpero', 'pulpero', 3.4, 1.2, -1);
  const guapo = H('guapo', 'guapo', 16.6, 12.4, -1);
  const guitarrero = H('guitarrero', 'guitarrero', 1.36, 5.74, 1, 0.62);
  const trucoA = H('trucoA', 'trucoA', 5.2, 4.66, 1);
  const trucoB = H('trucoB', 'trucoB', 7.47, 4.66, -1);
  const miron = H('miron', 'mirón', 6.25, 5.62, 1);
  const borracho = H('borracho', 'borracho', 0.62, 3.95, 1);
  const fogonA = H('fogonA', 'fogonA', 11.05, 9.05, 1);
  const fogonB = H('fogonB', 'fogonB', 12.82, 10.02, -1, 0.3);
  const china = H('china', 'china', 12.25, 8.55, -1);

  const horse = (name: string, look: string, x: number, y: number) => {
    const q = w.add(new Quadruped(name, seed++, HORSE, HORSES[look]));
    q.place(x, y, 1);
    return q;
  };
  const oscuro = horse('oscuro', 'oscuro', 13.1, 2.5);
  oscuro.tie = [14.35, 2.55, 1.02];
  const tordillo = horse('tordillo', 'tordillo', 13.1, 4.35);
  tordillo.tie = [14.35, 4.4, 1.02];
  const zaino = horse('zaino', 'zaino', 16.8, 12.6);
  const perro = w.add(new Quadruped('perro', seed++, DOG, DOG_LOOK));
  perro.place(8.6, 7.9, 1);
  const gallinas = [
    new Chicken('g1', seed++, I(0.5, 0.55, 0.05, 0.12)),
    new Chicken('g2', seed++, I(0, 0.05, 0.03, 0)),
    new Chicken('g3', seed++, I(0.05, 0.1, 0.2, 0.45)),
    new Chicken('g4', seed++, I(0.5, 0.55, 0.05, 0.12)),
  ].map((g, i) => w.add(g).place(7.6 + i * 0.7, 8.2 + (i % 2) * 0.8, i % 2 ? 1 : -1));
  const carancho = w.add(new Carancho('carancho', seed++, [13.3, 6.3, 2.62]));

  flock(w, { y: -260, x0: -620, x1: 760, every: 17, count: 7, seed: 3 });

  // ——— Rutinas: todos hacen lo suyo todo el tiempo ———
  const at = (a: Actor) => (): Vec2 => [a.x, a.y];
  const fire: Vec2 = [F.x, F.y];
  const counter: Vec2 = [3.6, 2.0];
  const table: Vec2 = [6.25, 4.6];

  const brains: Record<string, Brain> = {
    pulpero: loop((r) => [
      play('wipe', r.range(4, 7), [2.0, 3.6]),
      ...(r.chance(0.5)
        ? [go([1.75, 0.9], 0.9), play('reach', 2.4, [1.75, 0.0]), go([3.4, 1.2], 0.9)]
        : [play('pour', 3, [3.0, 3.4])]),
      play('idle', r.range(2, 4), [2.4, 3.6]),
    ]),
    fierro: loop((r) => [
      play('bar', r.range(7, 12), counter),
      r.chance(0.45) ? play('talk', r.range(3, 5), at(vasco)) : play('idle', r.range(2, 4), [9, 3.7]),
    ]),
    vasco: loop((r) => [play('bar', r.range(6, 10), [4.55, 2.0]), play('talk', r.range(2, 4), at(fierro))]),
    guitarrero: loop((r) => [play('guitar', r.range(14, 24), [3, 3]), play('guitarRest', r.range(3, 6), [3, 3])]),
    trucoA: loop((r) => [play(r.chance(0.6) ? 'truco' : 'think', r.range(6, 11), table)]),
    trucoB: loop((r) => [play(r.chance(0.6) ? 'truco' : 'think', r.range(6, 11), table)]),
    miron: loop((r) => [
      play('watch', r.range(4, 8), table),
      r.chance(0.35) ? play('talk', 3, at(trucoA)) : play('idle', 3, table),
      r.chance(0.2) ? play('stretch', 2.6) : play('watch', 2, table),
    ]),
    borracho: loop(() => [play('sleepFloor', 60)]),
    fogonA: loop((r) => [play('crouch', r.range(10, 18), fire), ...(r.chance(0.35) ? [play('idle', 2.5, fire), play('stretch', 2.6)] : [])]),
    fogonB: loop((r) => [play('mate', r.range(10, 16), fire), play('sit', r.range(4, 8), fire)]),
    china: loop((r) => [
      play('cebar', r.range(4, 6), fire),
      go([11.5, 8.6], 0.75),
      play('give', 1.4, at(fogonA)),
      go([12.25, 8.55], 0.75),
      play('cebar', r.range(4, 6), fire),
      go([12.5, 9.55], 0.75),
      play('give', 1.4, at(fogonB)),
      go([12.25, 8.55], 0.75),
    ]),
    perro: loop((r) => {
      const spots: Vec2[] = [
        [8.6, 7.9],
        [10.2, 8.4],
        [12.6, 7.6],
        [7.8, 5.6],
        [6.8, 3.4],
        [4.4, 3.6],
        [10.8, 4.8],
        [13.6, 8.6],
        [5.4, 8.9],
        [2.9, 8.6],
      ];
      return [go(r.pick(spots), r.range(0.9, 1.3), 'walk'), play(r.pick(['sniff', 'stand', 'sit', 'lie', 'sniff']), r.range(3, 9))];
    }),
    caballo: loop((r) => [play('stand', r.range(8, 16)), r.chance(0.35) ? play('toss', 1.4) : play('stand', 2)]),
  };
  const gallinaBrain: Brain = loop((r, a) => {
    const nx = Math.min(10.8, Math.max(5.8, a.x + r.range(-1.3, 1.3)));
    const ny = Math.min(11.3, Math.max(7.7, a.y + r.range(-1.1, 1.1)));
    const okay = Math.hypot(nx - 7.2, ny - 10.2) > 0.9 && Math.hypot(nx - F.x, ny - F.y) > 1.1;
    return [play('peck', r.range(2, 6)), go(okay ? [nx, ny] : [a.x, a.y], 0.35, 'walk')];
  });
  gallinas.forEach((g) => (g.brain = gallinaBrain));
  for (const q of [oscuro, tordillo]) q.brain = brains.caballo;
  perro.brain = brains.perro;
  carancho.brain = null;

  const extras: [Human, string][] = [
    [guitarrero, 'guitarrero'],
    [trucoA, 'trucoA'],
    [trucoB, 'trucoB'],
    [miron, 'miron'],
    [borracho, 'borracho'],
    [fogonA, 'fogonA'],
    [fogonB, 'fogonB'],
    [china, 'china'],
  ];
  const homes = new Map<Human, [number, number, number]>();
  for (const [h] of extras) homes.set(h, [h.x, h.y, h.face]);
  for (const [h, b] of [...extras, [pulpero, 'pulpero'] as [Human, string], [fierro, 'fierro'] as [Human, string], [vasco, 'vasco'] as [Human, string]]) {
    h.brain = brains[b];
    homes.set(h, homes.get(h) ?? [h.x, h.y, h.face]);
  }

  // ——— Vida de fondo ———
  let caranchoT = 25;
  w.every((dt, world) => {
    caranchoT -= dt;
    if (caranchoT <= 0) {
      caranchoT = rng.range(35, 70);
      if (beat < 6) carancho.takeOff();
    }
    // Polvo de los cascos al trote
    for (const q of [zaino, oscuro]) {
      if (q.visible && q.clip === 'trot' && q.speed > 0 && rng.next() < dt * 14) {
        const [x, y] = iso(q.x + rng.range(-0.5, 0.5), q.y + rng.range(-0.3, 0.3), 0.05);
        world.emit({ x, y, vx: rng.range(-10, 10), vy: rng.range(-12, -4), max: rng.range(0.8, 1.6), r: rng.range(3, 6), kind: 'dust' });
      }
    }
    // Luciérnagas al caer la tarde
    if (world.dusk > 0.35 && rng.next() < dt * 3 && world.particles.filter((p) => p.kind === 'firefly').length < 26) {
      const x = rng.range(1, SLAB.w - 0.5);
      const y = rng.range(7.6, SLAB.d - 0.5);
      const [sx, sy] = iso(x, y, rng.range(0.3, 1.3));
      world.emit({ x: sx, y: sy, vx: 0, vy: 0, max: rng.range(5, 10), r: 1.1, kind: 'firefly' });
    }
    // El jinete que se va se pierde en el papel
    if (leaving && leaving.visible) {
      const out = Math.max(leaving.x - SLAB.w, leaving.y - SLAB.d);
      leaving.alpha = Math.max(0, 1 - Math.max(0, out + 0.4) / 1.6);
      if (leaving.alpha <= 0.01) {
        leaving.visible = false;
        leaving.run([], null);
      }
    }
  });
  let leaving: Quadruped | null = null;

  // ——— Interacción: tocar a la gente ———
  const locked = new Set<Actor>();
  const greet = (h: Human) => () => {
    if (locked.has(h) || h.mount) return;
    if (h.clip === 'sleepFloor') return;
    h.react(SEATED.has(h.clip) ? 'tipHatSit' : 'tipHat', 1.3);
  };
  for (const h of [fierro, vasco, pulpero, guapo, guitarrero, trucoA, trucoB, miron, fogonA, fogonB, china]) h.onClick = greet(h);
  borracho.onClick = () => borracho.react('sleepFloor', 1);
  const dogTo = (p: Vec2) => {
    if (locked.has(perro)) return;
    perro.run([go(p, 2.4, 'trot'), play('sniff', 3), play('sit', 4)], brains.perro);
  };
  perro.onClick = () => {
    if (locked.has(perro)) return;
    perro.run([play('bark', 1.2), go([perro.x + rng.range(-2.5, 2.5), Math.min(11.3, perro.y + rng.range(0.5, 2.5))], 2.4, 'trot')], brains.perro);
  };
  for (const q of [oscuro, tordillo, zaino]) q.onClick = () => q.react('toss', 1.4);
  gallinas.forEach((g) => {
    g.onClick = (_w, at) => {
      void at;
      const a = rng.range(0, Math.PI * 2);
      const tx = Math.min(10.8, Math.max(5.8, g.x + Math.cos(a) * 2));
      const ty = Math.min(11.4, Math.max(7.6, g.y + Math.sin(a) * 1.6));
      g.run([go([tx, ty], 2.4, 'run'), play('peck', 3)], gallinaBrain);
      for (let i = 0; i < 3; i++) {
        const [x, y] = iso(g.x, g.y, 0.3);
        w.emit({ x, y, vx: rng.range(-30, 30), vy: rng.range(-30, -10), max: 1.5, r: 3, kind: 'feather' });
      }
    };
  });
  carancho.onClick = () => carancho.takeOff();
  w.onGroundClick = ([x, y]) => {
    if (x < 0.3 || y < 0.3 || x > SLAB.w - 0.2 || y > SLAB.d - 0.2) return;
    dogTo([x, y]);
  };

  // ——— Ayudantes de puesta en escena ———
  const home = (h: Human) => {
    const p = homes.get(h)!;
    h.visible = true;
    h.alpha = 1;
    h.place(p[0], p[1], p[2]);
  };
  const ambient = (h: Human, name: string) => {
    h.hold = undefined;
    h.run([], brains[name]);
  };
  const mount = (q: Quadruped, h: Human) => {
    if (q.rider !== h) q.mountRider(h);
    q.visible = h.visible = true;
    q.alpha = h.alpha = 1;
  };
  const unmount = (q: Quadruped, x: number, y: number) => {
    if (q.rider) q.dismount(x, y);
  };
  const stay = (clip: string, face?: Vec2 | (() => Vec2)): Task[] => [play(clip, Infinity, face)];
  const walkThen = (seq: boolean, h: Actor, path: Vec2[], after: Task[], speed = 1.2): Task[] => {
    if (!seq) {
      const last = path[path.length - 1];
      h.place(last[0], last[1]);
      return after;
    }
    return [go(path, speed), ...after];
  };
  const fightBrain = (me: Human, other: Human, spot: Vec2): Brain =>
    loop((r) => {
      const o = at(other);
      const side = me === fierro ? -1 : 1;
      const back: Vec2 = [spot[0] + side * 0.25, spot[1] - side * 0.25];
      return [
        play('fight', r.range(1.0, 2.2), o),
        r.chance(0.5) ? play('lunge', 0.7, o) : go(back, 0.7, 'fight', o),
        play('fight', r.range(0.7, 1.5), o),
        go(spot, 0.6, 'fight', o),
      ];
    });
  const spotF: Vec2 = [10.5, 8.3];
  const spotG: Vec2 = [11.3, 7.5];

  /** Los de afuera y los de adentro, según el momento. */
  let crowdMode = '';
  const crowd = (mode: 'ambient' | 'inside' | 'fight' | 'body', seq: boolean) => {
    if (mode === 'fight' || mode === 'body') for (const h of [miron, fogonA, fogonB, china]) locked.add(h);
    if (mode === crowdMode && seq) return;
    crowdMode = mode;
    if (mode === 'ambient') {
      for (const [h, name] of extras) {
        if (!seq) home(h);
        ambient(h, name);
      }
      return;
    }
    const face = mode === 'inside' ? (): Vec2 => [3.8, 2.9] : mode === 'fight' ? (): Vec2 => [guapo.x, guapo.y] : (): Vec2 => [guapo.x, guapo.y];
    guitarrero.run(stay(mode === 'body' ? 'guitar' : 'guitarRest', mode === 'inside' ? [3.8, 2.9] : [9, 3.7]), null);
    trucoA.run(stay(mode === 'inside' ? 'think' : 'sit', mode === 'inside' ? [3.8, 2.9] : [9, 3.7]), null);
    trucoB.run(stay('sit', mode === 'inside' ? [3.8, 2.9] : [9, 3.7]), null);
    borracho.run([], brains.borracho);
    if (mode === 'inside') {
      for (const h of [miron, fogonA, fogonB, china]) if (!seq) home(h);
      miron.run(stay('watch', face), null);
      ambient(fogonA, 'fogonA');
      ambient(fogonB, 'fogonB');
      ambient(china, 'china');
      return;
    }
    const spots: [Human, Vec2, Vec2][] =
      mode === 'fight'
        ? [
            [miron, [9.3, 7.0], [9.3, 7.0]],
            [fogonA, [11.6, 9.9], [11.6, 9.9]],
            [fogonB, [13.05, 10.1], [13.05, 10.1]],
            [china, [13.1, 9.0], [13.1, 9.0]],
          ]
        : [
            [miron, [10.4, 6.95], [10.4, 6.95]],
            [fogonA, [12.05, 8.65], [12.05, 8.65]],
            [fogonB, [10.75, 8.95], [10.75, 8.95]],
            [china, [12.7, 8.15], [12.7, 8.15]],
          ];
    for (const [h, p] of spots) {
      h.visible = true;
      const path: Vec2[] = h === miron && h.x < 9 ? [[8.6, 4.2], [9.7, 4.2], p] : [p];
      h.run(walkThen(seq, h, path, stay('watch', face), 1.0), null);
    }
  };

  // ——— Estado de los protagonistas en cada momento ———
  const lights = (dusk: number, interior = 1) => {
    w.duskTarget = dusk;
    for (const c of deco.candiles) c.on = interior * (0.75 + dusk * 0.6);
    deco.vela.on = interior;
    F.light.on = 0.55 + dusk * 0.8;
  };

  const intro = () => {
    unmount(zaino, 16.6, 12.4);
    zaino.visible = false;
    zaino.run([], null).place(16.8, 12.6, -1);
    guapo.visible = false;
    guapo.place(16.6, 12.4, -1);
    guapo.run([], null);
  };
  const resetFierro = () => {
    leaving = null;
    if (oscuro.rider) {
      unmount(oscuro, 3.3, 2.85);
      counterOn = false;
    }
    if (!oscuro.visible || !oscuro.tie || oscuro.alpha < 1 || Math.hypot(oscuro.x - 13.1, oscuro.y - 2.5) > 0.01) {
      oscuro.visible = true;
      oscuro.alpha = 1;
      oscuro.tie = [14.35, 2.55, 1.02];
      oscuro.place(13.1, 2.5, 1);
      oscuro.run([], brains.caballo);
    }
    if (!fierro.visible) counterOn = false;
    fierro.visible = true;
    fierro.alpha = 1;
  };
  let counterOn = false;
  const atCounter = () => {
    if (counterOn) return;
    counterOn = true;
    home(fierro);
    fierro.place(3.3, 2.85, 1);
    ambient(fierro, 'fierro');
    vasco.place(4.55, 2.9, 1);
    ambient(vasco, 'vasco');
    pulpero.place(3.4, 1.2, -1);
    ambient(pulpero, 'pulpero');
  };
  const guapoAtRamada = () => {
    zaino.visible = true;
    zaino.alpha = 1;
    zaino.place(11.5, 5.7, -1);
    zaino.run([], null);
    zaino.setClip('stand');
    mount(zaino, guapo);
  };
  /** Desde que llegó, el zaino del guapo queda bajo la ramada. */
  const zainoAtRamada = () => {
    if (zaino.rider) unmount(zaino, 11.0, 5.25);
    if (!zaino.visible || Math.hypot(zaino.x - 11.5, zaino.y - 5.7) > 0.3) {
      zaino.visible = true;
      zaino.alpha = 1;
      zaino.place(11.5, 5.7, -1);
      zaino.run([], brains.caballo);
    }
  };
  const guapoInside = () => {
    unmount(zaino, 11.0, 5.2);
    zaino.visible = true;
    zaino.place(11.5, 5.7, -1);
    zaino.run([], brains.caballo);
    guapo.visible = true;
    guapo.place(4.25, 2.95, -1);
  };

  const beats: Beat[] = [
    // 0 — Portada: el pliego entero
    {
      shot: S(8, 6.5, 0.6, 30),
      enter() {
        lights(0);
        resetFierro();
        intro();
        atCounter();
        crowd('ambient', false);
      },
    },
    // 222 — Cae el guapo
    {
      shot: S(10.4, 6.6, 0.8, 19),
      enter(seq) {
        lights(0);
        resetFierro();
        atCounter();
        crowd('ambient', seq);
        if (seq) {
          zaino.visible = true;
          zaino.alpha = 1;
          zaino.place(16.8, 12.6, -1);
          mount(zaino, guapo);
          zaino.run(
            [
              go(
                [
                  [15.2, 10.7],
                  [13.7, 8.7],
                  [12.5, 7.2],
                ],
                2.7,
                'trot',
              ),
              go([11.5, 5.7], 1.0, 'walk'),
              play('toss', 1.4),
              play('stand', Infinity, [9, 4]),
            ],
            null,
          );
          perro.run([go([12.2, 7.9], 2.4, 'trot'), play('bark', 1.2), play('bark', 1.2), play('stand', 2)], brains.perro);
        } else guapoAtRamada();
      },
    },
    // 223 — Un terne del pago
    {
      shot: S(11.3, 5.9, 1.7, 7.5),
      enter(seq) {
        lights(0);
        resetFierro();
        atCounter();
        crowd('ambient', seq);
        const arriving = seq && zaino.rider === guapo && zaino.tasks[0]?.kind === 'go';
        if (!arriving) {
          guapoAtRamada();
          zaino.run([play('toss', 1.4), play('stand', Infinity, [9, 4])], null);
        }
      },
    },
    // 224 — La muerte que lo aguaita
    {
      shot: S(3.9, 2.7, 1.25, 5.6),
      enter(seq) {
        lights(0.15);
        resetFierro();
        if (zaino.rider !== guapo) guapoAtRamada();
        atCounter();
        crowd('ambient', seq);
        carancho.face = -1;
      },
    },
    // 225 — El empellón al vasco y el medio frasco
    {
      shot: S(5.6, 3.3, 1.1, 9),
      enter(seq) {
        lights(0.2);
        resetFierro();
        crowd('ambient', seq);
        counterOn = false;
        locked.add(fierro).add(guapo).add(vasco);
        if (seq && zaino.rider === guapo) {
          if (Math.hypot(zaino.x - 11.5, zaino.y - 5.7) > 0.5) zaino.place(11.5, 5.7, -1);
          home(fierro);
          fierro.place(3.3, 2.85, 1);
          vasco.place(4.55, 2.9, 1);
          pulpero.run(brains.pulpero(pulpero, pulpero.rng), brains.pulpero);
          unmount(zaino, 11.0, 5.25);
          zaino.run([play('stand', 3), play('stand', Infinity, [9, 4])], brains.caballo);
          guapo.run(
            [
              go(
                [
                  [10.2, 4.3],
                  [9.6, 3.75],
                  [8.6, 3.6],
                  [5.25, 3.05],
                ],
                1.25,
              ),
              play('shove', 0.8, at(vasco)),
              call(() => vasco.run([go([5.6, 3.85], 0.7, 'stumble', at(guapo)), play('watch', Infinity, at(guapo))], null)),
              go([4.25, 2.95], 0.8),
              play('offer', Infinity, at(fierro)),
            ],
            null,
          );
          fierro.run([play('bar', 7, counter), play('guapo', Infinity, at(guapo))], null);
          vasco.run([play('bar', Infinity, [4.55, 2.0])], null);
        } else {
          guapoInside();
          guapo.run(stay('offer', at(fierro)), null);
          home(fierro);
          fierro.place(3.3, 2.85, 1);
          fierro.run(stay('guapo', at(guapo)), null);
          vasco.place(5.6, 3.85, -1);
          vasco.run(stay('watch', at(guapo)), null);
          pulpero.place(3.4, 1.2, -1);
          ambient(pulpero, 'pulpero');
        }
      },
    },
    // 226 — ¡Ah, gaucho!
    {
      shot: S(3.85, 2.95, 1.45, 4.4),
      enter() {
        lights(0.25);
        resetFierro();
        counterOn = false;
        if (guapo.mount || !guapo.visible || guapo.x > 6) guapoInside();
        crowd('inside', true);
        locked.add(fierro).add(guapo).add(vasco).add(pulpero);
        guapo.run(stay('angry', at(fierro)), null);
        fierro.place(3.3, 2.85);
        fierro.run(stay('guapo', at(guapo)), null);
        if (vasco.x < 5) vasco.place(5.6, 3.85, -1);
        vasco.run(stay('watch', at(guapo)), null);
        pulpero.place(3.4, 1.2, -1);
        pulpero.run(stay('watch', at(guapo)), null);
      },
    },
    // 227 — Salimos trenzaos
    {
      shot: S(10.9, 7.7, 1.0, 7.5),
      enter(seq) {
        lights(0.35);
        zainoAtRamada();
        resetFierro();
        counterOn = false;
        if (guapo.mount || !guapo.visible) guapoInside();
        crowd('fight', seq);
        locked.add(fierro).add(guapo).add(vasco).add(pulpero).add(perro);
        const fromInside = seq && fierro.x < 9 && guapo.x < 9;
        fierro.run(
          walkThen(
            fromInside,
            fierro,
            [
              [4.8, 3.55],
              [8.6, 3.8],
              [9.8, 3.8],
              [10.3, 6.2],
              spotF,
            ],
            [],
            1.3,
          ),
          fightBrain(fierro, guapo, spotF),
        );
        guapo.run(
          walkThen(
            fromInside,
            guapo,
            [
              [5.6, 3.3],
              [8.6, 3.55],
              [9.8, 3.55],
              [11.0, 6.0],
              spotG,
            ],
            [],
            1.35,
          ),
          fightBrain(guapo, fierro, spotG),
        );
        vasco.run(walkThen(seq && vasco.x < 9, vasco, [[8.6, 4.0], [9.8, 4.7], [9.95, 6.65]], stay('watch', at(guapo)), 1.1), null);
        pulpero.place(3.4, 1.2);
        pulpero.run(stay('watch', [9, 3.7]), null);
        perro.run([go([12.3, 7.0], 2.2, 'trot'), play('bark', 1.2), play('stand', 1), play('bark', 1.2), play('stand', Infinity, at(guapo))], null);
        gallinas.forEach((g, i) => g.run([go([6.2 + i * 0.4, 10.6 + (i % 2) * 0.5], 2.0, 'run'), play('peck', 6)], gallinaBrain));
      },
    },
    // 228 — El pulpero pegó el grito
    {
      shot: S(11.2, 5.6, 0.9, 10.5),
      enter(seq) {
        lights(0.45);
        zainoAtRamada();
        resetFierro();
        counterOn = false;
        if (guapo.mount || !guapo.visible) guapoInside();
        crowd('fight', seq);
        locked.add(fierro).add(guapo).add(vasco).add(pulpero).add(perro);
        const fighting = seq && Math.hypot(fierro.x - spotF[0], fierro.y - spotF[1]) < 1.2;
        const toHorse: Vec2[] = [
          [11.6, 6.6],
          [11.7, 3.5],
          [12.8, 3.15],
        ];
        if (fighting) {
          fierro.run([play('lunge', 0.7, at(guapo)), play('fight', 0.9, at(guapo)), go(toHorse, 1.35), play('idle', Infinity, [13.1, 2.5])], null);
          guapo.run([play('fight', 0.45, at(fierro)), play('stumble', 0.7), play('fall', 1.5), play('lie', Infinity)], null);
          pulpero.run([play('watch', 1.5, [9, 3.7]), play('shout', 4, [9, 3.7]), play('watch', Infinity, [9, 3.7])], null);
          perro.run([play('bark', 1.2), play('bark', 1.2), go([12.0, 8.1], 0.8), play('sniff', Infinity)], null);
        } else {
          guapo.place(spotG[0], spotG[1], -1);
          guapo.run(stay('lie'), null);
          fierro.place(12.8, 3.15, 1);
          fierro.run(stay('idle', [13.1, 2.5]), null);
          pulpero.place(3.4, 1.2);
          pulpero.run([play('shout', 3, [9, 3.7]), play('watch', Infinity, [9, 3.7])], null);
          perro.place(12.0, 8.1);
          perro.run(stay('sniff'), null);
        }
        vasco.run(walkThen(seq && vasco.x < 9, vasco, [[8.6, 4.0], [9.8, 4.7], [9.95, 6.65]], stay('watch', at(guapo)), 1.1), null);
      },
    },
    // 229 — Monté y me encomendé a Dios
    {
      shot: () => {
        const q = oscuro.visible ? oscuro : null;
        return q ? S(q.x, q.y, 1.0, 12, 3.2) : S(13.5, 9, 0.5, 13);
      },
      enter(seq) {
        lights(0.65);
        zainoAtRamada();
        counterOn = false;
        if (guapo.mount) unmount(zaino, 11.0, 5.25);
        guapo.visible = true;
        guapo.place(spotG[0], spotG[1], -1);
        guapo.run(stay('lie'), null);
        crowd('fight', true);
        locked.add(fierro).add(guapo).add(vasco).add(pulpero).add(perro);
        if (!seq || Math.hypot(fierro.x - 12.8, fierro.y - 3.15) > 1.5) {
          resetFierro();
          fierro.place(12.8, 3.15, 1);
        }
        oscuro.visible = true;
        oscuro.alpha = 1;
        oscuro.place(13.1, 2.5, 1);
        oscuro.tie = null;
        mount(oscuro, fierro);
        leaving = oscuro;
        oscuro.run(
          [
            play('toss', 1.0),
            go([12.4, 3.05], 0.8, 'walk'),
            go(
              [
                [11.8, 5.2],
                [12.2, 6.9],
              ],
              1.3,
              'walk',
            ),
            go(
              [
                [13.9, 9.3],
                [15.2, 10.9],
                [16.4, 12.2],
                [17.6, 13.4],
              ],
              2.9,
              'trot',
            ),
          ],
          null,
        );
        pulpero.place(3.4, 1.2);
        pulpero.run(stay('watch', [9, 3.7]), null);
        perro.place(12.0, 8.1);
        perro.run(stay('sniff'), null);
      },
    },
    // 230 — El ser gaucho es un delito
    {
      shot: S(9.5, 6.8, 0.6, 22),
      enter(seq) {
        lights(1);
        zainoAtRamada();
        counterOn = false;
        unmount(oscuro, 13, 3);
        oscuro.visible = false;
        oscuro.run([], null);
        fierro.visible = false;
        leaving = null;
        if (guapo.mount) unmount(zaino, 11.0, 5.25);
        guapo.visible = true;
        guapo.place(spotG[0], spotG[1], -1);
        guapo.run(stay('lie'), null);
        crowd('body', seq);
        locked.add(guapo).add(vasco).add(pulpero);
        vasco.run(walkThen(seq, vasco, [[11.7, 7.0]], stay('kneel', at(guapo)), 0.9), null);
        pulpero.run(walkThen(seq && pulpero.x < 6, pulpero, [[4.5, 1.25], [5.8, 1.5], [6.2, 2.9], [8.6, 3.8], [9.55, 3.85]], stay('watch', at(guapo)), 1.0), null);
        perro.place(12.4, 8.3);
        perro.run([play('sniff', 4), play('lie', Infinity)], null);
      },
    },
    // Cierre
    {
      shot: S(8, 6.5, 0.6, 31),
      enter(seq) {
        beats[9].enter(seq && beat === 9);
      },
    },
  ];

  let beat = -1;
  const original = beats.map((b) => b.enter);
  beats.forEach((b, i) => {
    b.enter = (seq: boolean) => {
      locked.clear();
      original[i](seq);
      beat = i;
    };
  });

  return { beats };
}
