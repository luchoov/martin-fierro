"""Compara las capturas RGB y las cinco separaciones reales; requiere Pillow y NumPy."""
from pathlib import Path
import json
import os

import numpy as np
from PIL import Image, ImageFilter

salida = Path(__file__).resolve().parent
canales = Path(os.environ.get("TRAMA_CANALES", "/tmp/trama-canales"))
encuadres = ["portada", "estrofa-224", "estrofa-230", "detalle-224"]


def diferencias(antes, despues):
    diferencia = np.abs(antes.astype(np.int16) - despues.astype(np.int16))
    return {
        "media_absoluta_0_255": round(float(diferencia.mean()), 4),
        "p95_absoluto_0_255": float(np.percentile(diferencia, 95)),
        "porcentaje_diferencia_mayor_16": round(float((diferencia > 16).mean() * 100), 4),
    }


def cobertura_cercana(antes, despues):
    # Tolerancia de dos píxeles para diferencias de antialiasing en los bordes.
    a = antes > 16
    b = despues > 16
    dilatada_a = np.asarray(Image.fromarray(a).filter(ImageFilter.MaxFilter(5)))
    dilatada_b = np.asarray(Image.fromarray(b).filter(ImageFilter.MaxFilter(5)))
    return {
        "cobertura_2d_porcentaje": round(float(a.mean() * 100), 4),
        "cobertura_webgl2_porcentaje": round(float(b.mean() * 100), 4),
        "pixeles_2d_con_tinta_webgl2_a_2px_porcentaje": round(float((a & dilatada_b).sum() / max(1, a.sum()) * 100), 4),
        "pixeles_webgl2_con_tinta_2d_a_2px_porcentaje": round(float((b & dilatada_a).sum() / max(1, b.sum()) * 100), 4),
    }


resultados = []
for encuadre in encuadres:
    rgb_2d = np.asarray(Image.open(salida / f"{encuadre}-2d.png").convert("RGB"))
    rgb_gpu = np.asarray(Image.open(salida / f"{encuadre}-webgl2.png").convert("RGB"))
    resultado = {"encuadre": encuadre, "rgb_final": diferencias(rgb_2d, rgb_gpu), "canales": {}}
    for grupo, nombres in [("ABC", ["A", "B", "C"]), ("KL", ["clave", "mascara_linea"])]:
        textura_2d = np.asarray(Image.open(canales / f"{encuadre}-2d-{grupo}.png"))
        textura_gpu = np.asarray(Image.open(canales / f"{encuadre}-webgl2-{grupo}.png"))
        for indice, nombre in enumerate(nombres):
            a = textura_2d[:, :, indice]
            b = textura_gpu[:, :, indice]
            resultado["canales"][nombre] = {**diferencias(a, b), **cobertura_cercana(a, b)}
    resultados.append(resultado)
    print(encuadre, json.dumps(resultado["rgb_final"], ensure_ascii=False))

(salida / "comparacion.json").write_text(json.dumps(resultados, ensure_ascii=False, indent=2) + "\n")
