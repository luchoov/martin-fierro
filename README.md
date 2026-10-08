# Martín Fierro · Trama

Clásicos argentinos contados escena por escena como **dioramas vivos**: casas de muñecas isométricas, impresas en una risografía simulada y dibujadas enteramente en código. No hay imágenes, fuentes ni bibliotecas: cada persona, caballo, mata de pasto y punto de tinta sale del programa.

La primera obra es el **Canto VIII de *El Gaucho Martín Fierro*** (José Hernández, 1872): la pelea en la pulpería.

```
packages/trama/        el motor (MIT): impresión, trazo a mano, figuras, cámara, relato
obras/martin-fierro/   la obra (CC BY-NC-SA 4.0): decorado, elenco, dirección y texto
```

## Cómo correrlo

Requiere Node 20+ y pnpm.

```bash
pnpm install
pnpm dev
```

Abre en `http://localhost:5178`. Para el build estático (se sube a cualquier hosting, funciona sin servidor):

```bash
pnpm build
```

El build completo pesa **~50 KB comprimido**: anda en netbooks escolares y con mala conexión.

## Cómo se recorre

- **Portada**: una tapa de folleto sobre el papel en blanco. Al bajar aparece **Antes de leer** (lo que pasó en los cantos anteriores, la escena y seis palabras del léxico) mientras la prensa imprime la lámina tinta por tinta.
- **Scroll**: pasa de página. El texto queda fijo, impreso sobre el mismo papel, y cambia por estrofa; cada estrofa mueve la cámara y hace pasar algo en la escena. Se puede volver para atrás. Las marcas del folio («Estrofa 225 · 4 de 9») saltan directo a una estrofa.
- **Arrastrar**: mirar la lámina (con inercia). En táctil, el dedo de costado mueve la cámara y el vertical sigue el texto.
- **Ctrl + rueda / pellizco**: acercarse, anclado en el cursor. **Doble clic / doble toque**: ir a un punto.
- **Tocar**: la gente saluda, el perro ladra y sale corriendo, las gallinas se espantan, los caballos cabecean, el carancho levanta vuelo, el fuego chisporrotea. Tocar el piso manda al perro ahí.
- **Teclado**: flechas, `+` / `-`, `0` vuelve al encuadre del relato, `C` oculta el texto, `?` muestra cómo se mira.
- Las instrucciones aparecen una sola vez, como una nota, al llegar a la primera estrofa; después quedan en el botón `?`.
- Después de unos segundos sin tocar nada, la cámara vuelve sola al relato.

### El texto y la lámina

En escritorio el texto ocupa una columna fija a la izquierda (35 % del ancho); en el celular, una franja de papel abajo. No hay tarjetas flotantes: la lámina tiene **margen**, como un grabado en un libro. El shader desvanece la tinta en puntos cada vez más chicos antes de llegar al texto, y los encuadres se calculan en el espacio que queda libre. Cada estrofa nueva entra de arriba hacia abajo, como en la prensa; el número va en el margen y la capitular solo abre el canto.

## Modo `?debug`

Abrir con `?debug` (por ejemplo `http://localhost:5178/?debug`) muestra un panel con lo que cuesta cada paso del cuadro: mundo y cámara, grabación (cuadros de animación), piso, dibujo de las separaciones, rasterizado del lienzo 2D más la subida a la GPU, y el shader medido en la GPU (`EXT_disjoint_timer_query_webgl2`, o esperando a la GPU si el navegador no lo ofrece). Abajo, un gráfico apilado de los últimos 180 cuadros con líneas en 16,7 y 33 ms, y un recuadro punteado con el encuadre libre. `?q=0` … `?q=3` fija un escalón de calidad. El panel se descarga solo cuando se pide.

Ojo al leerlo: Chrome pinta el lienzo 2D recién cuando se lo sube a la GPU, así que **«raster 2D + subida»** incluye el rasterizado de todas las formas. En las primeras mediciones es, lejos, lo más caro.

## Modo `?bench`

`?bench` (por ejemplo `http://localhost:5178/?bench`) corre un recorrido fijo de cámara a los 1,5 s de cargar y al terminar muestra una tabla con la **mediana y el percentil 95** de cada etapa, que se copia en Markdown con un botón (también sale en la consola). Hay que dejar la pestaña visible y no tocar nada mientras mide (unos 40 s).

- **Tramos**: lejos (portada de la escena), cerca (estrofa 224) y atardecer (estrofa 230); en cada uno, cámara quieta, paneo y zoom de lejos a cerca y de vuelta. Las filas «todo quieto / paneo / zoom» juntan los casos.
- **Reproducible**: la cámara va por un riel (`stage.rail`), el mundo avanza con un paso fijo de 1/60 s, la prensa ya pasó, el atardecer ya cayó y la calidad queda fija en `q0` (o la de `?q=`).
- **Dos pasadas**: *fluido* mide los cuadros reales (cuadros por segundo, porcentaje de cuadros de más de 20 ms) y los tiempos de CPU; *desglose* espera a la GPU después de cada impresión y da **«impresión+GPU»**: piso + dibujo + rasterizado del lienzo 2D + subida + shader, lo que de otro modo queda escondido en la GPU. La columna **shader GPU** aparece si el navegador ofrece `EXT_disjoint_timer_query_webgl2`.
- `?bench=manual` avanza sin `requestAnimationFrame` (por ejemplo, con la pestaña oculta) y hace solo el desglose. Desde la consola: `await trama.medir({ manual: true })`.

Para comparar antes y después conviene la misma ventana (la tabla anota vista, dpr, GPU y tamaño de las separaciones).

## La escena: Canto VIII, estrofas 222–230

| Momento | Estrofa | Qué pasa |
| --- | --- | --- |
| Portada | — | Papel en blanco: la tapa del folleto. |
| Antes de leer | — | Pasa la prensa: el pliego entero, con rancho, ramada, palenque, fogón, aljibe y ombú. |
| «Otra vez en un boliche…» | 222 | El guapo llega al trote y mete el pingo hasta la ramada. |
| «Era un terne de aquel pago…» | 223 | El guapo, montado y entonao, bajo la ramada. |
| «¡Ah pobre!…» | 224 | Fierro en el mostrador. Un carancho mira desde el poste. |
| «Se tiró al suelo…» | 225 | Desmonta, entra, empuja al vasco y le ofrece el frasco a Fierro. |
| «¡Ah, gaucho!…» | 226 | Cara a cara. Todos en la pulpería se callan y miran. |
| «Y ya salimos trenzaos…» | 227 | Pelea a cuchillo afuera, poncho arrollado en el brazo. El fogón se levanta a mirar. |
| «…y el pulpero pegó el grito» | 228 | El guapo cae. El pulpero grita. Fierro va al palenque. |
| «Monté y me encomendé a Dios…» | 229 | Fierro monta y se va al trote; se pierde en el papel. |
| «El ser gaucho es un delito» | 230 | Atardecer, luciérnagas. La gente rodea al caído; el guitarrero sigue tocando. |

Mientras tanto, todos hacen lo suyo: el pulpero limpia, sirve y busca botellas; los del truco juegan y golpean la mesa; el guitarrero toca; el borracho duerme contra la pared; la china ceba y pasa el mate en ronda; el perro vaga, olfatea y se echa; las gallinas picotean; los caballos espantan moscas con la cola; el pasto y el ombú se mecen; el humo sube; los candiles parpadean; cada tanto pasa una bandada.

El texto sale de [Project Gutenberg #14765](https://www.gutenberg.org/ebooks/14765), con correcciones mínimas (mayúsculas perdidas por la capitular, una tilde). **Antes de publicar conviene cotejarlo con una edición crítica.** La escena termina en la estrofa 230, pero el Canto VIII sigue hasta la 241; el cierre lo aclara.

## Las cuatro tintas

| Tinta | Color | Trama | Para qué |
| --- | --- | --- | --- |
| Punzó | `#C9392E` | 15° | chiripás, fuego, recados, ladrillo |
| Ocre | `#EBA834` | 0° | tierra, paja, luz de candil, piel |
| Celeste | `#5C9DC9` | 75° | ponchos, sombras, atardecer |
| Tinta | `#26283A` | 45° | línea, hierro, pelo |

Los verdes del pasto son ocre sobre celeste; los naranjas, punzó sobre ocre; los morados, punzó sobre celeste. Ningún color secundario está "pintado": salen de la superposición, como en una riso de verdad.

## Cómo funciona la impresión

1. **Separaciones.** Todo se dibuja en dos lienzos 2D que no guardan colores sino *densidades de tinta*: uno lleva punzó, ocre y celeste en sus canales R, G, B y el otro la tinta de línea. Cada forma elige un modo: *calar* (knock-out: tapa lo de abajo), *sobreimprimir* (máximo), *sumar* (las luces) o *quitar* (la luz que disuelve la sombra).
2. **Trama.** Un shader WebGL2 lee las separaciones y trama cada tinta por separado: celda de puntos con su ángulo propio, puntos con un leve temblor, fallas de tinta en los plenos, carga desigual del tambor, y un desregistro distinto por tinta. Las tintas se multiplican sobre el papel crema con grano. La trama está anclada al mundo: al acercarte, los puntos crecen como bajo una lupa. De lejos, cuando la celda mide menos de 3 a 4 px de dispositivo, los puntos se funden en tono parejo (como ve el ojo una lámina a distancia), y el grano del papel y los poros se eligen por octavas según el zoom para no chisporrotear.
3. **Líneas plenas.** Los trazos y contornos de tinta clave marcan además una máscara de línea (el canal G de la segunda separación) que se imprime sin trama, y ningún trazo queda más fino que 1 px de pantalla: de lejos las líneas no se cortan en puntitos.
4. **La luz es tinta.** Candiles, vela y fogón son anillos escalonados que suman ocre y quitan sombra. El atardecer es una tinta más que cae en cuatro escalones.
5. **Pasada de prensa.** Al empezar a leer, cada tinta entra de arriba hacia abajo, una después de otra, como saliendo de la máquina.
6. **Trazo a mano.** Las líneas tiemblan y se afinan en las puntas. Cada pieza fija se graba en tres variantes de temblor que se alternan a 3 Hz (la línea "hierve", como animación en dos). Todo el azar tiene semilla: la lámina se dibuja igual en cada carga.

## Cómo funciona el motor (Trama)

- **Una escena por vez.** A diferencia del pliego con todas las escenas juntas, Trama carga y anima una sola. Lo fijo se graba una vez; el piso y las paredes se guardan en caché cuando la cámara está quieta; lo que se mueve se vuelve a grabar a 15 cuadros por segundo (animación "en dos") mientras la cámara se mueve a 60. Si la vista no cambió y no tocaba cuadro de animación, no se vuelve a imprimir. Si el equipo no llega, baja sola la resolución del shader y después los cuadros de animación (15, 12, 10, 8); la de las separaciones nunca, porque eso borronea la lámina y corta las líneas.
- **Figuras.** Un esqueleto de perfil compartido (pelvis, columna, cuello, cabeza, brazos y piernas) con clips de pose: caminar, correr, sentarse, tomar mate, cebar, tocar la guitarra, jugar al truco, acodarse en el mostrador, servir, limpiar, empujar, trastabillar, pelear, tirarse a fondo, caer, yacer, dormir, gritar, saludar… Sobre el esqueleto van volúmenes con sombra y la ropa de época: chiripá, calzoncillo cribado, botas de potro, faja, tirador con monedas, poncho con guarda, chambergo, vincha, boina, pollera, rebozo, delantal. De cerca aparecen ojos, cejas, nariz, bigote y barba.
- **Cuadrúpedos.** Caballos criollos (oscuro, tordillo, zaino) con recado, riendas atadas al palenque y jinete; perro. Paso de cuatro tiempos y trote diagonal.
- **Actores con tareas.** Cada actor tiene una cola de tareas (`go`, `play`, `call`) y un "cerebro" que genera la próxima tanda cuando se termina: así nadie se queda quieto. El relato reemplaza tareas y cerebros en cada momento; si se salta de golpe, acomoda a todos sin animar.
- **Orden de dibujo.** Orden topológico isométrico: solo se comparan las piezas que se pisan en pantalla, por su huella en el piso.

## Licencias

- **Motor (`packages/trama`)**: [MIT](packages/trama/LICENSE). Cualquiera puede usarlo, también para obras comerciales.
- **Obras (`obras/*`)**: [CC BY-NC-SA 4.0](obras/martin-fierro/LICENSE). Libres para escuelas, docentes, bibliotecas y cualquier uso sin fines de lucro, citando la fuente. Para usos comerciales (editoriales, medios, organismos) se licencian aparte.
- **Textos**: los de Hernández son de dominio público.

## Próximos pasos

- Rendimiento, guiado por `?debug`: el costo mayor es rasterizar ~1.500 formas en los lienzos 2D en cada impresión. Siguen el nivel de detalle por zoom (figuras simplificadas, menos temblor, pasto quieto y pasado al fondo, animación a 8 cuadros por segundo), el piso cacheado como imagen del mundo en varias resoluciones, no dibujar lo que está fuera de cuadro y, más adelante, un worker o dibujo directo en GPU.
- Más trabajo sobre los caballos (cabeza, rodillas, galope) y montar/desmontar animados.
- Guía docente y notas al pie del texto (léxico gauchesco, contexto histórico). El Canto VII, con insultos racistas explícitos, necesita un marco pedagógico antes de ilustrarse.
- Resto de *La Ida* (13 cantos) y *La Vuelta*.
- Modo sin conexión (PWA) y embebido para diarios.
- Formato de escena declarativo y un editor, para que otras obras no requieran programar.
