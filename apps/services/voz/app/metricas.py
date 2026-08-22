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

from collections import Counter

#: (nombre, etiquetas ordenadas) → valor. Solo contadores: nada que suba y baje.
_contadores: Counter[tuple[str, tuple[tuple[str, str], ...]]] = Counter()

_AYUDA = {
    "pulso_webhook_duplicados_total": (
        "Webhooks entrantes descartados por ser un reintento del proveedor.",
    ),
    "pulso_webhook_recibidos_total": (
        "Webhooks entrantes aceptados para procesar (no duplicados).",
    ),
}


def contar(nombre: str, **etiquetas: str) -> None:
    _contadores[(nombre, tuple(sorted(etiquetas.items())))] += 1


def leer(nombre: str, **etiquetas: str) -> int:
    return _contadores[(nombre, tuple(sorted(etiquetas.items())))]


def reiniciar() -> None:
    """Sólo para tests."""
    _contadores.clear()


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

    return "\n".join(lineas) + "\n" if lineas else ""


def _escapar(valor: str) -> str:
    return valor.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
