"""Índice de congestión — 0 (vacío) a 1 (colapsado).

═══════════════════════════════════════════════════════════════════
 LEER ESTO ANTES DEL PITCH
═══════════════════════════════════════════════════════════════════
 No estamos midiendo camas en tiempo real. No tenemos ese sensor y
 nadie en 36h lo tiene. Lo que hacemos es mejor de explicar y además
 es cierto:

   El acto de rechazar YA ES el sensor.

 Hoy ese rechazo se pierde en una llamada telefónica. PULSO lo captura,
 lo fecha, y lo convierte en el prior de la siguiente decisión. Cero
 fricción para el hospital: no tipea nada, solo aprieta un botón que
 ya iba a apretar.

 El dataset "Registro diario de ocupacion de capacidad instalada"
 (uwc4-gvg3 en datos.gov.co) tiene 8.389 filas y UNA SOLA FECHA:
 2022-11-30. El Estado ya intentó pedir el reporte manual. Se apagó.
═══════════════════════════════════════════════════════════════════

Puerto de `apps/frontend/lib/congestion.ts`. Diferencia: allá las señales
se leen de un almacén en memoria; acá llegan en el request (`SenalesSede`),
porque ai-core no tiene estado.
"""

import re
from datetime import datetime

from .schemas import DesgloseCongestion, Sede, SenalesSede

#: Pesos de las cuatro señales. Suman 1.
PESOS = {
    "ocupacion_base": 0.35,
    "horario": 0.20,
    #: El más alto A PROPÓSITO: es la única señal viva del sistema.
    #: Defiende esta decisión en el pitch, no la escondas.
    "rechazo_reciente": 0.35,
    "epidemiologico": 0.10,
}

#: Rechazos en la ventana a partir de los cuales damos la sede por colapsada.
RECHAZOS_PARA_SATURAR = 4

_ES_UCI = re.compile(r"UCI|Intensivo", re.IGNORECASE)


def ocupacion_base(sede: Sede) -> float:
    """Señal 1 — ocupación estructural.

    Sale del snapshot REPS. Es un PRIOR de "qué tan apretada vive esta sede",
    no la ocupación de hoy. Ponderamos doble las camas de UCI porque son el
    cuello de botella real de un traslado de alta complejidad.
    """
    if not sede.camas:
        return 0.7  # sin dato → asumimos apretado

    numerador = 0.0
    denominador = 0.0
    for c in sede.camas:
        if c.total <= 0:
            continue
        peso = 2 if _ES_UCI.search(c.tipo) else 1
        numerador += (c.ocupadas_snapshot / c.total) * peso
        denominador += peso
    return _clamp01(numerador / denominador) if denominador else 0.7


#: Curva diurna de demanda de urgencias: valle de madrugada, pico 18:00–23:00.
_CURVA_HORA = {
    0: 0.55, 1: 0.45, 2: 0.35, 3: 0.30, 4: 0.30, 5: 0.35,
    6: 0.45, 7: 0.60, 8: 0.70, 9: 0.70, 10: 0.68, 11: 0.70,
    12: 0.72, 13: 0.70, 14: 0.68, 15: 0.70, 16: 0.75, 17: 0.82,
    18: 0.90, 19: 0.95, 20: 1.00, 21: 0.95, 22: 0.85, 23: 0.70,
}


def factor_horario(fecha: datetime) -> float:
    """Señal 2 — curva de demanda. 1 = pico.

    Los picos reales de urgencias en Bogotá son al final de la tarde/noche
    y los fines de semana.
    """
    base = _CURVA_HORA.get(fecha.hour, 0.7)
    # weekday(): 0 = lunes, 5 = sábado, 6 = domingo
    fin_de_semana = 1.12 if fecha.weekday() >= 5 else 1.0
    return _clamp01(base * fin_de_semana)


def senal_rechazo(senales: SenalesSede) -> float:
    """Señal 3 — ⭐ la señal viva, sin fricción.

    Cada rechazo en las últimas 6h empuja la congestión hacia arriba.
    Saturamos en 4: más allá ya sabemos que está colapsado.
    """
    return _clamp01(senales.rechazos_recientes / RECHAZOS_PARA_SATURAR)


def presion_epidemiologica(fecha: datetime) -> float:
    """Señal 4 — presión epidemiológica.

    ⚠️ STUB HONESTO. Hoy es estacional (picos respiratorios en temporada de
    lluvias bogotana: abril-mayo y octubre-noviembre). El upgrade real es
    cruzar con SIVIGILA/INS.

    Si no da tiempo, se queda así y SE DICE TAL CUAL en el pitch. Un stub
    declarado es integridad; un stub disfrazado es lo que un jurado técnico
    caza.
    """
    return 0.75 if fecha.month in (4, 5, 10, 11) else 0.4


def indice_congestion(sede: Sede, senales: SenalesSede, fecha: datetime) -> float:
    """Índice compuesto. Es lo que el paramédico ve como barra de color."""
    return _clamp01(
        PESOS["ocupacion_base"] * ocupacion_base(sede)
        + PESOS["horario"] * factor_horario(fecha)
        + PESOS["rechazo_reciente"] * senal_rechazo(senales)
        + PESOS["epidemiologico"] * presion_epidemiologica(fecha)
    )


def desglose_congestion(
    sede: Sede, senales: SenalesSede, fecha: datetime
) -> DesgloseCongestion:
    """Para el panel de "por qué" que Juan pinta al abrir una tarjeta."""
    return DesgloseCongestion(
        ocupacion_base=ocupacion_base(sede),
        horario=factor_horario(fecha),
        rechazo_reciente=senal_rechazo(senales),
        epidemiologico=presion_epidemiologica(fecha),
        total=indice_congestion(sede, senales, fecha),
    )


def etiqueta_congestion(c: float) -> str:
    if c < 0.5:
        return "baja"
    if c < 0.7:
        return "media"
    if c < 0.85:
        return "alta"
    return "crítica"


def _clamp01(n: float) -> float:
    return max(0.0, min(1.0, n))
