# Verificaciones del rasterizador

Desde la raíz del repo, con Node 22.18 o posterior:

```sh
node packages/trama/tests/geometry.mjs
```

Compara 302.100 muestras de polígonos simples, autointersectados y compuestos con
un cálculo independiente de vueltas nonzero. Verifica ausencia de huecos y doble
cobertura, triángulos válidos y el error de las curvas al acercarse hasta zoom 7.

Para las comprobaciones de WebGL2, iniciar el servidor habitual:

```sh
corepack pnpm --filter @obras/martin-fierro dev
```

Abrir en Chromium la URL que imprime este comando, ajustando el puerto si Vite
eligió otro:

```sh
node -p "'http://localhost:5178/@fs' + process.cwd() + '/packages/trama/tests/gpu.html'"
```

La página muestra el resultado de cada comparación de píxeles. El objeto
`window.tramaGpuVerification` permite automatizar la lectura con cualquier
herramienta de navegador. Una ejecución exitosa tiene `fallos: []` y verifica:

- Fill, Over con alfa aproximado, Add, Sub y ambos destinos MRT, incluida la máscara de línea.
- Stencil por operación, ejes finos, rellenos nonzero fusionados y ausencia de Path2D en GPU.
- Orden dentro de un lote, subidas estáticas y dinámicas, crecimiento de buffers y caché durante cámara.
- Redimensionado, alternancia de MSAA, resolve de cobertura parcial y reinicio de mallas.

Son 42 comprobaciones cuando hay MSAA (41 si el navegador no lo ofrece).
SwiftShader alcanza para validar corrección; estos tests no miden el rendimiento
que tendrá una Intel UHD.
