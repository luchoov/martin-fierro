import type { Stage } from './stage';

/**
 * Mouse: arrastrar para mirar, Ctrl+rueda (o pellizco del trackpad) para acercar,
 * doble clic para ir a un punto. Táctil: el dedo vertical desplaza la página (el relato),
 * el horizontal mueve la cámara y dos dedos acercan. Teclado: flechas, + / - y 0.
 */
export class Input {
  private pointers = new Map<number, { x: number; y: number }>();
  private down: { x: number; y: number; t: number; moved: boolean } | null = null;
  private last = { x: 0, y: 0, t: 0 };
  private vel = { x: 0, y: 0 };
  private pinch: { d: number; cx: number; cy: number } | null = null;
  private lastTap = { t: 0, x: 0, y: 0 };
  private hoverT = 0;

  constructor(private el: HTMLElement, private stage: Stage) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('dblclick', this.onDbl);
    window.addEventListener('keydown', this.onKey);
  }

  private pos(e: PointerEvent | WheelEvent | MouseEvent) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent) => {
    const p = this.pos(e);
    this.pointers.set(e.pointerId, p);
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* algunos navegadores no lo permiten en táctil */
    }
    if (this.pointers.size === 1) {
      this.down = { x: p.x, y: p.y, t: performance.now(), moved: false };
      this.last = { x: p.x, y: p.y, t: performance.now() };
      this.vel = { x: 0, y: 0 };
      this.stage.camera.ix = this.stage.camera.iy = 0;
    } else if (this.pointers.size === 2) {
      this.pinch = this.pinchState();
      if (this.down) this.down.moved = true;
    }
  };

  private pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  private onMove = (e: PointerEvent) => {
    const p = this.pos(e);
    if (!this.pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') this.hover(p.x, p.y);
      return;
    }
    this.pointers.set(e.pointerId, p);
    const cam = this.stage.camera;
    if (this.pointers.size >= 2 && this.pinch) {
      const now = this.pinchState();
      const f = now.d / Math.max(1, this.pinch.d);
      this.stage.userInput();
      this.stage.zoomAt(f, now.cx, now.cy, true);
      cam.pan(-(now.cx - this.pinch.cx) / cam.z, -(now.cy - this.pinch.cy) / cam.z);
      this.pinch = now;
      return;
    }
    if (!this.down) return;
    const dx = p.x - this.last.x;
    const dy = p.y - this.last.y;
    if (!this.down.moved && Math.hypot(p.x - this.down.x, p.y - this.down.y) > 5) this.down.moved = true;
    if (this.down.moved) {
      this.stage.userInput();
      cam.pan(-dx / cam.z, -dy / cam.z);
      const t = performance.now();
      const dt = Math.max(1, t - this.last.t) / 1000;
      this.vel.x = this.vel.x * 0.6 + (-dx / cam.z / dt) * 0.4;
      this.vel.y = this.vel.y * 0.6 + (-dy / cam.z / dt) * 0.4;
      this.last.t = t;
    }
    this.last.x = p.x;
    this.last.y = p.y;
  };

  private onUp = (e: PointerEvent) => {
    const p = this.pos(e);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 1) {
      const [only] = [...this.pointers.values()];
      this.last = { x: only.x, y: only.y, t: performance.now() };
      return;
    }
    if (!this.down) return;
    const d = this.down;
    this.down = null;
    if (d.moved) {
      if (performance.now() - this.last.t < 80) {
        this.stage.camera.ix = this.vel.x;
        this.stage.camera.iy = this.vel.y;
      }
      return;
    }
    const now = performance.now();
    if (e.pointerType !== 'mouse' && now - this.lastTap.t < 320 && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < 30) {
      this.stage.userInput();
      this.stage.zoomAt(2, p.x, p.y, false);
      this.lastTap.t = 0;
      return;
    }
    this.lastTap = { t: now, x: p.x, y: p.y };
    this.stage.tap(p.x, p.y);
  };

  private onCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.pinch = null;
    this.down = null;
  };

  private onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && !this.pointers.size) this.el.style.cursor = '';
  };

  private hover(x: number, y: number) {
    const t = performance.now();
    if (t - this.hoverT < 60) return;
    this.hoverT = t;
    this.el.style.cursor = this.stage.pick(x, y) ? 'pointer' : 'grab';
  }

  private onWheel = (e: WheelEvent) => {
    // Sin Ctrl la rueda desplaza la página: es el relato. Con Ctrl (o pellizco) acerca.
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const p = this.pos(e);
    this.stage.userInput();
    this.stage.zoomAt(Math.exp(-e.deltaY * 0.01), p.x, p.y, true);
  };

  private onDbl = (e: MouseEvent) => {
    const p = this.pos(e);
    this.stage.userInput();
    this.stage.zoomAt(e.shiftKey ? 0.5 : 2, p.x, p.y, false);
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const cam = this.stage.camera;
    const step = 140 / cam.z;
    switch (e.key) {
      case 'ArrowLeft':
        this.stage.userInput();
        cam.aim(cam.tx - step, cam.ty, cam.tz, 30);
        break;
      case 'ArrowRight':
        this.stage.userInput();
        cam.aim(cam.tx + step, cam.ty, cam.tz, 30);
        break;
      case 'ArrowUp':
        if (!e.shiftKey) return;
        this.stage.userInput();
        cam.aim(cam.tx, cam.ty - step, cam.tz, 30);
        break;
      case 'ArrowDown':
        if (!e.shiftKey) return;
        this.stage.userInput();
        cam.aim(cam.tx, cam.ty + step, cam.tz, 30);
        break;
      case '+':
      case '=':
        this.stage.userInput();
        this.stage.zoomAt(1.4, this.stage.view.w / 2, this.stage.view.h / 2, false);
        break;
      case '-':
      case '_':
        this.stage.userInput();
        this.stage.zoomAt(1 / 1.4, this.stage.view.w / 2, this.stage.view.h / 2, false);
        break;
      case '0':
        this.stage.resumeFollow();
        break;
      default:
        return;
    }
    e.preventDefault();
  };
}
