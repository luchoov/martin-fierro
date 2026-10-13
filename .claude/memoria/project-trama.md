---
name: project-trama
description: "Vision for the martin-fierro project — \"Trama\" engine, living risograph scrollytelling of Argentine classics"
metadata:
  node_type: memory
  type: project
  originSessionId: 6c18efc9-f428-40f3-bc41-2a129be93682
  modified: 2026-10-08T06:15:33.602Z
---

User is building interactive, code-drawn (procedural canvas, risograph/halftone look, isometric dollhouse dioramas) retellings of Argentine literary classics, starting with Martín Fierro. Inspired by Kevin Ngo's "a small light" and an AI benchmark "Moby Dick scene by scene" build.

- Engine name: **Trama** (open source). Works licensed but free for schools; later sell to editoriales/diarios/gobierno.
- One scene at a time (scrollytelling), NOT all scenes rendered at once — the all-at-once poster is too heavy for school netbooks/phones.
- Must feel ALIVE: constant motion, crowds of people doing things (ambient behaviors), interactive.
- Candidate launch: Día de la Tradición, 10 Nov 2026.
- User writes in rioplatense Spanish; answer in Spanish.

Status 2026-10-08 (2nd session): far-view fix done (halftone→flat tone below ~3–4 device px, line mask in sep c2.G + 1px min strokes, noise LOD, ladder never lowers sep res, skip redraw when nothing changed); `?debug` panel (lazy `trama/debug`); text redesign done (typographic cover with blank paper, "Antes de leer" intro while the press prints, fixed column 35% desktop / bottom strip mobile, shader plate margin fades ink before text, one-time instructions note). Debug finding: 2D canvas raster (shows up inside "upload") dominates cost. Next per user's list: perf item 2 (LOD by zoom, ground image cache, culling), then horses, mount/dismount, teacher guide, Canto VII framing.

Status 2026-10-08 (3rd session): optimization work on branch `optimizacion` (pushed only 4e5c99c at user's request; no push/PR without asking). Done: `?bench` (4e5c99c) and GPU separations replacing Canvas2D (3fefad1, local only): Path2D raster cost ~75 µs/op in Skia regardless of size, so ops are now triangles drawn in a WebGL2 MSAA×4 FBO with depth ordering. Print+GPU: far 183→11 ms, close 93→29 ms; visual diff <1% px. Pending: CPU recording regressed (9–17 ms/tick), close-up separations GPU ~20 ms (MSAA cost), shader 6–10 ms, bundle 52.6 KB gz (+5), README. Comparison tooling lives in `.claude/herramientas/` (captura.js, vite.capturas.mjs on port 5179, reference PNGs `antes-*`). User is token-limited: keep sessions lean.

Status 2026-10-08 (4th session): user's ?bench under heavy machine load (GPT desktop + Docker) — far pan 60 fps, close pan 29 (was 6–8 / 17). Recording CPU work: view culling (world.cover + forced tick when view leaves cover), Drawer.begin resets step (state leak), len() instead of Math.hypot, flatten writes straight into Float32Array — commits a850703, 2171b96 local. Open look decision: freeze grass at far zoom (wind still visible ±2–3 px). Profiler in .claude/herramientas/perfil.js.

Testing notes: the Browser pane can be fully hidden (rAF and IntersectionObserver don't run at all) — drive with `trama.stage.step(dt)` and `trama.irA(k)`; port 5178 may be served by another chat's server, open it by URL. Root `pnpm build` calls global pnpm (broken) — use `corepack pnpm --filter @obras/martin-fierro build`.

Related: [[use-pnpm]]
