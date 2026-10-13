Bench del usuario después de 3fefad1, con la notebook cargada (GPT desktop + Docker/WSL abiertos). Chrome 154, Intel UHD, 1366×633 dpr 1, q0, separaciones ×1 suavizado ×4. Valores en ms, mediana/p95.

| tramo | fps | >20ms | impr/c | cuadro | grabación | armado | impresión+GPU | separ. GPU | shader GPU | ops | vért. |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lejos quieto | 58 | 1% | 0,24 | 16,6/16,8 | 9,1/12,3 | 1,8/2,6 | 15,3/16,4 | 7,7/8,7 | 4,4/4,7 | 2022 | 104k |
| lejos paneo | 60 | 0% | 0,99 | 16,7/16,8 | 15,4/21,7 | 2,9/5,5 | 16,9/21,7 | 8,3/10,6 | 5,8/6,4 | 2022 | 104k |
| lejos→cerca zoom | 41 | 30% | 1,00 | 16,7/50,0 | 17,8/28,8 | 4,3/6,7 | 35,3/47,7 | 18,8/32,5 | 9,1/13,5 | 2125 | 113k |
| cerca quieto 224 | 60 | 0% | 0,26 | 16,6/16,9 | 13,3/19,9 | 2,9/4,4 | 54,2/61,1 | 38,6/43,9 | 11,3/13,5 | 2251 | 128k |
| cerca paneo | 29 | 83% | 1,00 | 33,3/50,4 | 27,7/46,9 | 4,7/11,2 | 47,6/54,2 | 34,7/40,3 | 9,0/11,3 | 2252 | 128k |
| cerca→lejos zoom | 35 | 38% | 0,99 | 16,9/66,6 | 44,4/79,2 | 7,6/13,3 | 36,7/55,2 | 23,9/40,7 | 8,9/9,1 | 2233 | 117k |
| atardecer quieto 230 | 59 | 1% | 0,24 | 16,6/17,0 | 15,7/21,3 | 3,2/3,9 | 31,1/31,9 | 16,1/16,8 | 11,6/11,6 | 1997 | 107k |
| atardecer paneo | 49 | 21% | 0,99 | 16,7/33,5 | 30,6/40,7 | 4,9/7,5 | 30,6/35,3 | 16,1/18,5 | 10,1/11,7 | 2002 | 107k |
| todo | 45 | 24% | 0,76 | 16,7/50,0 | 20,0/52,2 | 3,6/10,6 | 31,9/53,2 | 16,9/39,4 | 9,0/11,8 | 2101 | 107k |

Antes (4e5c99c, máquina libre): paneo lejos 6–8 fps, paneo cerca 17, quieto 27; impresión+GPU 130–185 ms.
