"""Contadores del servicio, en formato Prometheus.

DELIBERADAMENTE MÍNIMO. No hay `prometheus-client` ni OpenTelemetry todavía:
la instrumentación de verdad es la tarea 5.3 y va en core con OTel. Meter un
SDK entero hoy para un contador sería adelantar una decisión que no es de este
servicio.

Lo que sí hace falta ya es poder responder "¿cuántos reintentos de Meta
estamos absorbiendo?" sin leer logs a mano. Un contador en proceso alcanza:
el número se pierde al reiniciar, y eso es exactamente lo que un contador
Prometheus espera (el scraper ve el reinicio y no lo suma mal).

⚠️ En proceso significa POR INSTANCIA. Con dos instancias en Render hay que
   sumar los dos `/metrics`, que es justo lo que hace cualquier scraper.
"""

import math
from collections import Counter, defaultdict

Clave = tuple[str, tuple[tuple[str, str], ...]]

#: (nombre, etiquetas ordenadas) → valor. Solo contadores: nada que suba y baje.
_contadores: Counter[Clave] = Counter()

#: (nombre, etiquetas) → lista de observaciones. Para histogramas.
_observaciones: dict[Clave, list[float]] = defaultdict(list)

#: Cortes en MILISEGUNDOS. Elegidos alrededor del límite que importa: Meta
#: espera 2xx en ~3 s, así que el corte de 1000 es el que hay que vigilar y
#: el de 3000 es la línea roja. Sin buckets alrededor del umbral, un
#: histograma no responde la única pregunta que se le va a hacer.
CORTES_MS = (25, 50, 100, 250, 500, 1000, 3000, 10000)

_AYUDA = {
    "pulso_webhook_duplicados_total": (
        "Webhooks entrantes descartados por ser un reintento del proveedor.",
    ),
    "pulso_webhook_recibidos_total": (
        "Webhooks entrantes aceptados para procesar (no duplicados).",
    ),
    "pulso_webhook_latencia_ms": (
        "Tiempo hasta responder el webhook. Meta espera 2xx en ~3 s.",
    ),
    "pulso_acuse_enviado_total": (
        "Acuses inmediatos al paramédico, antes de procesar.",
    ),
}


def contar(nombre: str, **etiquetas: str) -> None:
    _contadores[(nombre, tuple(sorted(etiquetas.items())))] += 1


def leer(nombre: str, **etiquetas: str) -> int:
    return _contadores[(nombre, tuple(sorted(etiquetas.items())))]


def observar(nombre: str, valor: float, **etiquetas: str) -> None:
    """Anota una medición en un histograma."""
    _observaciones[(nombre, tuple(sorted(etiquetas.items())))].append(valor)


def percentil(nombre: str, p: float, **etiquetas: str) -> float | None:
    """p50, p99… sobre lo observado en ESTE proceso. Para tests y para /listo.

    No es lo que Prometheus calcula (él interpola sobre los buckets); esto es
    exacto sobre la muestra local. Sirve para verificar, no para el tablero.
    """
    datos = sorted(_observaciones[(nombre, tuple(sorted(etiquetas.items())))])
    if not datos:
        return None
    # Nearest-rank: el valor real observado, sin interpolar entre dos.
    i = max(0, math.ceil(p / 100 * len(datos)) - 1)
    return datos[i]


def reiniciar() -> None:
    """Sólo para tests."""
    _contadores.clear()
    _observaciones.clear()


def exponer() -> str:
    """Formato de exposición de Prometheus (text/plain; version=0.0.4)."""
    lineas: list[str] = []
    vistos: set[str] = set()

    for (nombre, etiquetas), valor in sorted(_contadores.items()):
        if nombre not in vistos:
            vistos.add(nombre)
            ayuda = _AYUDA.get(nombre)
            if ayuda:
                lineas.append(f"# HELP {nombre} {ayuda[0]}")
            lineas.append(f"# TYPE {nombre} counter")
        etiquetado = ",".join(f'{k}="{_escapar(v)}"' for k, v in etiquetas)
        lineas.append(f"{nombre}{{{etiquetado}}} {valor}" if etiquetado
                      else f"{nombre} {valor}")

    for (nombre, etiquetas), datos in sorted(_observaciones.items()):
        if not datos:
            continue
        if nombre not in vistos:
            vistos.add(nombre)
            ayuda = _AYUDA.get(nombre)
            if ayuda:
                lineas.append(f"# HELP {nombre} {ayuda[0]}")
            lineas.append(f"# TYPE {nombre} histogram")

        base = [f'{k}="{_escapar(v)}"' for k, v in etiquetas]
        for corte in CORTES_MS:
            # Los buckets de Prometheus son ACUMULATIVOS: cada uno cuenta
            # todo lo que cae por debajo, no solo lo de su tramo.
            acumulado = sum(1 for d in datos if d <= corte)
            lineas.append(
                f"{nombre}_bucket{{{','.join(base + [f'le=\"{corte}\"'])}}} {acumulado}"
            )
        lineas.append(
            f"{nombre}_bucket{{{','.join(base + ['le=\"+Inf\"'])}}} {len(datos)}"
        )
        etiquetado = ",".join(base)
        sufijo = f"{{{etiquetado}}}" if etiquetado else ""
        lineas.append(f"{nombre}_sum{sufijo} {sum(datos):.3f}")
        lineas.append(f"{nombre}_count{sufijo} {len(datos)}")

    return "\n".join(lineas) + "\n" if lineas else ""


def _escapar(valor: str) -> str:
    return valor.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
