import { Rng } from '../core/rng';
import { screenSide } from '../core/iso';
import type { Vec2 } from '../core/math';
import type { Drawer } from '../draw/drawer';
import { EMPTY } from '../draw/mesh';
import type { Recording } from '../print/separation';
import type { Item, World } from './world';

export type Task =
  | { kind: 'go'; path: Vec2[]; speed: number; clip: string; face?: Vec2 | (() => Vec2) }
  | { kind: 'play'; clip: string; dur: number; face?: Vec2 | (() => Vec2) }
  | { kind: 'call'; fn: (a: Actor) => void };

/** Caminar por una ruta de puntos. Con face, avanza mirando a otro lado (retroceder en guardia). */
export const go = (path: Vec2 | Vec2[], speed = 1.15, clip = 'walk', face?: Vec2 | (() => Vec2)): Task => ({
  kind: 'go',
  path: (typeof path[0] === 'number' ? [path as Vec2] : (path as Vec2[])).map((p) => [p[0], p[1]] as Vec2),
  speed,
  clip,
  face,
});

/** Hacer una acción durante un tiempo (Infinity = hasta nuevo aviso). */
export const play = (clip: string, dur = Infinity, face?: Vec2 | (() => Vec2)): Task => ({ kind: 'play', clip, dur, face });

export const call = (fn: (a: Actor) => void): Task => ({ kind: 'call', fn });

/** Un cerebro devuelve la próxima tanda de tareas cuando la anterior se termina. */
export type Brain = (a: Actor, rng: Rng) => Task[];

/** Repite tareas en ciclo, con variaciones de duración. */
export function loop(make: (rng: Rng, a: Actor) => Task[]): Brain {
  return (a, rng) => make(rng, a);
}

export abstract class Actor implements Item {
  x = 0;
  y = 0;
  z = 0;
  /** 1 = mira hacia la derecha de la pantalla, -1 = hacia la izquierda. */
  face = 1;
  visible = true;
  alpha = 1;
  fx0 = 0;
  fy0 = 0;
  fx1 = 0;
  fy1 = 0;
  z0 = 0;
  radius = 0.22;
  b: number[] = [0, 0, 0, 0];
  clip = 'idle';
  clipT = 0;
  /** Desfase propio para que nadie se mueva al unísono. */
  phase: number;
  idleClip = 'idle';
  tasks: Task[] = [];
  brain: Brain | null = null;
  rng: Rng;
  seed: number;
  protected wp = 0;
  protected taskT = 0;
  protected recorded: Recording = EMPTY;
  /** Velocidad actual (m/s), útil para animar el paso. */
  speed = 0;
  onClick?: (w: World, at: Vec2) => void;
  /** Mientras está montado o lo lleva otro actor, no se ordena ni dibuja por su cuenta. */
  carried = false;
  slot?: number;

  constructor(readonly name: string, seed: number) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.phase = this.rng.next();
  }

  ops(): Recording {
    return this.recorded;
  }

  place(x: number, y: number, face?: number): this {
    this.x = x;
    this.y = y;
    if (face) this.face = face;
    this.footprint();
    return this;
  }

  footprint(): void {
    const r = this.radius;
    this.fx0 = this.x - r;
    this.fy0 = this.y - r;
    this.fx1 = this.x + r;
    this.fy1 = this.y + r;
    this.z0 = this.z;
  }

  lookAt(tx: number, ty: number): void {
    const s = screenSide(tx - this.x, ty - this.y);
    if (s) this.face = s;
  }

  /** Reemplaza lo que esté haciendo. brain = null lo deja quieto al terminar. */
  run(tasks: Task[], brain?: Brain | null): this {
    this.tasks = tasks.slice();
    if (brain !== undefined) this.brain = brain;
    this.wp = 0;
    this.taskT = 0;
    return this;
  }

  /** Intercala una reacción breve y después sigue con lo suyo. */
  react(clip: string, dur: number): void {
    if (this.tasks[0]?.kind === 'play' && (this.tasks[0] as { clip: string }).clip === clip) return;
    const cur = this.tasks[0];
    if (cur && cur.kind === 'play' && cur.dur !== Infinity) {
      cur.dur = Math.max(0, cur.dur - this.taskT);
    } else if (cur && cur.kind === 'go') {
      cur.path = cur.path.slice(this.wp);
      this.wp = 0;
    }
    this.tasks.unshift(play(clip, dur));
    this.taskT = 0;
  }

  setClip(name: string): void {
    if (name !== this.clip) {
      this.onClipChange(this.clip, name);
      this.clip = name;
      this.clipT = 0;
    }
  }

  protected onClipChange(_from: string, _to: string): void {}

  get busy(): boolean {
    return this.tasks.length > 0;
  }

  update(dt: number, w: World): void {
    this.clipT += dt;
    if (!this.tasks.length && this.brain) this.tasks = this.brain(this, this.rng);
    let task = this.tasks[0];
    let guard = 0;
    while (task && task.kind === 'call' && guard++ < 16) {
      this.tasks.shift();
      task.fn(this);
      task = this.tasks[0];
      this.taskT = 0;
      this.wp = 0;
    }
    this.speed = 0;
    if (!task) {
      this.setClip(this.idleClip);
      this.footprint();
      return;
    }
    if (task.kind === 'go') {
      const target = task.path[this.wp];
      const dx = target[0] - this.x;
      const dy = target[1] - this.y;
      const dist = Math.hypot(dx, dy);
      const step = task.speed * dt;
      this.setClip(task.clip);
      if (task.face) {
        const f = typeof task.face === 'function' ? task.face() : task.face;
        this.lookAt(f[0], f[1]);
      } else if (dist > 1e-4) this.lookAt(target[0], target[1]);
      if (dist <= step) {
        this.x = target[0];
        this.y = target[1];
        this.wp++;
        if (this.wp >= task.path.length) this.next();
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
        this.speed = task.speed;
      }
    } else if (task.kind === 'play') {
      this.setClip(task.clip);
      if (task.face) {
        const f = typeof task.face === 'function' ? task.face() : task.face;
        this.lookAt(f[0], f[1]);
      }
      this.taskT += dt;
      if (this.taskT >= task.dur) this.next();
    }
    this.footprint();
    this.think(dt, w);
  }

  /** Para subclases: lógica extra por cuadro. */
  protected think(_dt: number, _w: World): void {}

  protected next(): void {
    this.tasks.shift();
    this.taskT = 0;
    this.wp = 0;
  }

  abstract record(d: Drawer, w: World): void;

  protected keep(d: Drawer): void {
    this.recorded = d.take();
    this.b = d.b.slice();
  }
}
