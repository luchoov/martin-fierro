/**
 * Cámara con resortes críticamente amortiguados: arranca y frena suave, como un travelling.
 * x, y en px de mundo (el punto que queda en el ancla de la pantalla), z = zoom.
 */
export class Camera {
  x = 0;
  y = 0;
  z = 1;
  tx = 0;
  ty = 0;
  tz = 1;
  private vx = 0;
  private vy = 0;
  private vz = 0;
  /** Inercia del arrastre (px de mundo por segundo). */
  ix = 0;
  iy = 0;
  stiffness = 3;
  minZ = 0.3;
  maxZ = 7;

  aim(x: number, y: number, z: number, stiffness = 3): void {
    this.tx = x;
    this.ty = y;
    this.tz = Math.min(this.maxZ, Math.max(this.minZ, z));
    this.stiffness = stiffness;
  }

  jump(x: number, y: number, z: number): void {
    this.x = this.tx = x;
    this.y = this.ty = y;
    this.z = this.tz = z;
    this.vx = this.vy = this.vz = 0;
    this.ix = this.iy = 0;
  }

  /**
   * Lleva la cámara por un riel (recorrido fijo del benchmark): la pone en el punto y deja
   * como velocidad la del recorrido, así `moving` dice lo mismo que con un paneo real.
   */
  track(x: number, y: number, z: number, dt: number): void {
    const k = dt > 0 ? 1 / dt : 0;
    this.vx = (x - this.x) * k;
    this.vy = (y - this.y) * k;
    this.vz = (Math.log(z) - Math.log(this.z)) * k;
    this.x = this.tx = x;
    this.y = this.ty = y;
    this.z = this.tz = z;
    this.ix = this.iy = 0;
  }

  /** Mueve cámara y objetivo juntos (arrastre directo). */
  pan(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.tx += dx;
    this.ty += dy;
  }

  update(dt: number): void {
    if (Math.abs(this.ix) + Math.abs(this.iy) > 0.5) {
      this.pan(this.ix * dt, this.iy * dt);
      const decay = Math.exp(-dt * 4.5);
      this.ix *= decay;
      this.iy *= decay;
    } else {
      this.ix = this.iy = 0;
    }
    const k = this.stiffness;
    const c = 2 * Math.sqrt(k);
    // Integración en pasos chicos para que los resortes rígidos no se vuelvan inestables.
    const n = Math.max(1, Math.ceil(dt * Math.sqrt(k) * 8));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.vx += (k * (this.tx - this.x) - c * this.vx) * h;
      this.vy += (k * (this.ty - this.y) - c * this.vy) * h;
      this.x += this.vx * h;
      this.y += this.vy * h;
      const lz = Math.log(this.z);
      this.vz += (k * (Math.log(this.tz) - lz) - c * this.vz) * h;
      this.z = Math.exp(lz + this.vz * h);
    }
  }

  get moving(): boolean {
    return (
      Math.abs(this.vx) + Math.abs(this.vy) > 0.02 ||
      Math.abs(this.vz) > 0.0005 ||
      Math.abs(this.tx - this.x) + Math.abs(this.ty - this.y) > 0.05 ||
      Math.abs(this.tz - this.z) > 0.0005 ||
      this.ix !== 0
    );
  }
}
