Seguimos la optimización del motor Trama en C:\dev\martin-fierro, rama `optimizacion`. Leé primero el README.md y `git log --oneline -3`. Hablame en español rioplatense; usá siempre `corepack pnpm`. No hagas push ni PR sin preguntarme. Cuidá el contexto: tengo poco límite, así que trabajá en pasos chicos, sin volcar archivos enteros ni salidas largas.

ESTADO
- main y optimizacion apuntan a e20f053 (ya incluye 3fefad1, subido a origin/main). Seguimos en `optimizacion`.
- a850703 y 2171b96 (solo local, sesión 4): recorte de lo que queda fuera de cuadro (`world.cover`, margen COVER=0.25, y si la vista se sale de lo cubierto se graba en ese mismo cuadro); `begin()` reinicia `d.step` (las figuras lo dejaban en 4–5 y lo heredaba el pasto y las luces según el orden: cambia 0,05–0,13 % de píxeles); `len()` en vez de Math.hypot (−30 % en grabar una persona); el aplanado escribe directo en el Float32Array. Con y sin recorte las capturas son idénticas.
- 4e5c99c (está en GitHub): `?bench` reproducible (motor `trama/bench`, recorrido en obras/martin-fierro/src/medir.ts). Mis números reales antes de optimizar (Chrome, Intel UHD, 1366×633, dpr 1): paneo lejos 6–8 cuadros/s, paneo cerca 17 cuadros/s, quieto 27; impresión+GPU de 130 a 185 ms.
- 3fefad1 (solo local): las separaciones ya no usan lienzos 2D. Skia cobraba ~75 µs por forma sin importar el tamaño. Ahora el Drawer graba triángulos (packages/trama/src/draw/mesh.ts: suavizado aplanado, abanico, recorte de orejas, tiras para trazos y anillos para contornos) y print/separation.ts los imprime en un framebuffer WebGL2 multisample ×4 con dos salidas:
  - Orden por búfer de profundidad: pieza + orden, con la tabla de lugares en una textura R32F.
  - Modos agrupados: calados de adelante hacia atrás, Over como MAX, sumas, restas, y aparte los calados translúcidos.
  - Operaciones con contornos que se pisan con orientación contraria (`op.u`): se imprimen contando vueltas en el esténcil, como la regla distinta de cero del lienzo.
  - Ejes de 1 px: imitan las líneas finas de Skia (`0.5·max(|tx|,|ty|)`), ordenados por grosor, y solo se dibujan los finos.
  - Resultado (panel oculto, 1280×720): impresión+GPU lejos 183→11 ms (separaciones 7 + shader 6), cerca 93→29 ms (separaciones 20 + shader 9,5). Capturas antes/después en lejos, 224, 230, detalle y muy lejos: menos del 1 % de píxeles distintos, solo en bordes.

PENDIENTE (en este orden; medí antes y después de cada paso)
1. HECHO con la máquina cargada (GPT desktop + Docker): tabla en `.claude/herramientas/bench-2026-10-08-cargada.md`. Repetir `?bench` con la máquina libre antes del README.
2. CPU de grabación (EN CURSO; hecho: recorte, hypot, aplanado directo). Queda: decidir pasto quieto de lejos (118 matas ≈ 45 % de la grabación lejos, pero el viento se ve: ±2–3 px a zoom 0,7); push/overlaps ~20 %; figura+temblor ~30 %. Texto original: empeoró a 9–17 ms por cuadro de animación (antes 5–7) por aplanar y triangular. Perfilá flatten, el recorte de orejas y take() (copias con slice). Ideas: tolerancia según zoom, no regrabar lo que no cambió (punto 5 del plan), recortar fuera de cuadro (punto 2), nivel de detalle con pasto quieto (punto 3).
3. GPU de las separaciones de cerca (~20 ms): lo caro es el multisample ×4 en la Intel (×1 da 8 ms, ×2 ~18). ×2 casi no se distingue después de la trama; ×1 escalona las diagonales lejos. Evaluar ×2 por defecto o como escalón de calidad. La operación 150 del piso (pared, `op.u`) cubre mucha área de cerca.
4. Shader (punto 7): 6–10 ms. Ruido en textura precalculada, rotaciones como uniforms, saltear la prensa cuando uPress=1.
5. Peso: el JS principal pasó de 47,3 a 52,6 KB comprimido. Sacar código muerto: tracePath en draw/hand.ts, los estilos s1/s2/m1/m2/l2 de Ink.
6. Escalera de calidad (punto 9) con los costos nuevos; que pueda volver a subir.
7. README: sección del motor, `?debug` (las etapas cambiaron: grabación, armado, separaciones CPU/GPU, shader) y `?bench`, más una tabla antes/después. Después commit.

HERRAMIENTAS PARA COMPARAR (en .claude/herramientas, ignorado por git)
- `perfil.js`: `perfil(paso, ticks, {sinEnvolver, sinRecorte})` mide world.tick; `porPieza(paso)` costo por tipo de pieza y cuántas caen en vista; `banco(n, tandas, zoom)` graba siempre a Fierro y 20 matas (µs). Con la máquina cargada el ruido es ±20 %.
- Ojo: Python en Windows escribe CRLF; usar `open(..., newline='')`.
- `vite.capturas.mjs`: servidor en el puerto 5179 que guarda en `.claude/herramientas/capturas/` los PNG que manda la página. Está en .claude/launch.json como "capturas" (preview_start name "capturas").
- `captura.js`: se carga en la página con `await import('/@fs/C:/dev/martin-fierro/.claude/herramientas/captura.js?' + Date.now())`. Funciones:
  - `capturar(nombre, paso, {zoom, dx, dy, samples})`: determinista. Recargá la página antes de cada captura. Pasos: 1 = lejos, 4 = 224, 10 = 230; detalle = paso 4 con {zoom: 2.6, dx: -10, dy: -30}; muy lejos = paso 1 con {zoom: 0.55}.
  - `comparar(a, b, salida)`, `recorte([...], x, y, w, h, escala, salida)`, `brillo(nombre, zonas)`, `separaciones(nombre)`.
  - `medirVista(paso, {parte: 'todo'|'sep'|'shader'})`: mediana de la impresión esperando a la GPU, con calentamiento. La GPU integrada cambia de frecuencia: el ruido es de ±3 ms.
- Las referencias `antes-*.png` son del motor viejo (lienzo 2D) a 1280×720. Fijá el viewport en 1280×720 antes de capturar.
- Para comparar contra el motor viejo, levantá `git worktree add --detach <dir> 4e5c99c` con un vite config que haga alias de `trama` a ese worktree, en el puerto 5180.
- El panel del navegador suele estar oculto: sin requestAnimationFrame, manejá todo con `trama.stage.step(dt)` y `trama.irA(k)`.
