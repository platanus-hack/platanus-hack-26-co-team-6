"""
Curva de demanda de urgencias, medida — no supuesta.

Sale de los 9206 incidentes reales del 123 de junio 2026.

═══════════════════════════════════════════════════════════════════
 POR QUE ESTO IMPORTA
═══════════════════════════════════════════════════════════════════
 congestion.service.ts traia una curva escrita a mano que asumia el pico a
 las 20:00 y el valle a las 03:00-04:00. Los datos dicen otra cosa:

   pico real     09:00  (683 incidentes)
   segundo pico  15:00  (585) y 19:00 (501)
   las 20:00     443, o sea el 65% del pico — no el 100%
   valle real    05:00  (145)

 La forma general (valle de madrugada, meseta de dia) estaba bien. La
 ubicacion del pico estaba corrida siete horas. Un ranking que castiga a un
 hospital por "hora pico" a las 20:00 estaba castigando en el momento
 equivocado.

 Normalizamos a 0..1 sobre el maximo, que es el contrato que espera
 factorHorario().
═══════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import collections
import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from comun import DATOS, escribir_json, leer_csv, limpiar  # noqa: E402
from fuentes import POR_ID, leer as leer_fuente  # noqa: E402

# PRIORIDAD_FINAL del 123 -> triage Res. 5596/2015.
# El 123 usa cuatro niveles y el triage colombiano cinco: 'Baja' cubre los
# niveles 4 y 5, que para efectos de traslado se comportan igual.
PRIORIDAD_A_TRIAGE = {"Critica": 1, "Alta": 2, "Media": 3, "Baja": 4}

DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]

# Una hora es sospechosa si cae por debajo de esta fraccion de la MEDIANA de su
# ventana de +-4 horas.
#
# La ventana tiene que ser ancha: el desplome de las 17-18h dura dos horas
# seguidas, asi que comparar contra las vecinas inmediatas no lo ve — cada hora
# hundida hace de coartada de la otra.
#
# 0.6 esta calibrado para atrapar ese hueco sin tocar el valle real de la
# madrugada (05h esta en 145 contra una mediana de 240: 0.60, justo por encima
# del umbral, y se queda). Si mueves este numero, revisa que las horas de
# madrugada sigan SIN marcarse: ese valle es demanda de verdad.
UMBRAL_ANOMALIA = 0.6
VENTANA_ANOMALIA = 4


def _fecha(s: str | None) -> dt.datetime | None:
    try:
        return dt.datetime.strptime((s or "").strip(), "%d/%m/%Y %H:%M")
    except ValueError:
        return None


def construir() -> dict:
    filas, encoding = leer_fuente("llamadas_123")

    fechas: list[dt.datetime] = []
    por_hora = collections.Counter()
    por_dia = collections.Counter()
    por_localidad = collections.Counter()
    por_tipo = collections.Counter()
    por_prioridad = collections.Counter()
    # Triage x localidad: donde se concentra lo grave, no solo lo frecuente.
    critico_por_localidad = collections.Counter()

    for f in filas:
        fecha = _fecha(f.get("FECHA_INICIO_DESPLAZAMIENTO_MOVIL"))
        if not fecha:
            continue
        fechas.append(fecha)
        por_hora[fecha.hour] += 1
        por_dia[fecha.weekday()] += 1

        loc = limpiar(f.get("LOCALIDAD"))
        if loc:
            por_localidad[loc] += 1

        tipo = limpiar(f.get("TIPO_INCIDENTE"))
        if tipo:
            por_tipo[tipo] += 1

        prio = limpiar(f.get("PRIORIDAD_FINAL"))
        if prio:
            por_prioridad[prio] += 1
            if PRIORIDAD_A_TRIAGE.get(prio, 5) <= 2 and loc:
                critico_por_localidad[loc] += 1

    if not fechas:
        raise ValueError("llamadas123.csv: ninguna fila con fecha valida")

    pico_hora = max(por_hora.values())
    pico_dia = max(por_dia.values())

    crudo = {h: por_hora.get(h, 0) for h in range(24)}

    # ── Deteccion de artefactos de reporte ────────────────────────
    #
    # Las 17h y 18h caen a 190 y 212 cuando las vecinas estan en 376 y 501:
    # un desplome del 50% durante exactamente dos horas y despues vuelve. Eso
    # no es que Bogota deje de accidentarse a las 5 de la tarde; es el cambio
    # de turno del CRUE, cuando el despacho no queda registrado a tiempo.
    #
    # Meter ese hueco en el modelo haria que PULSO viera los hospitales
    # DESCONGESTIONADOS en plena hora pico, que es justo al reves. Asi que se
    # detecta, se reporta, y para el modelo se interpola con las vecinas.
    # El conteo crudo queda intacto en conteoPorHora.
    def _mediana_ventana(h: int) -> float:
        alrededor = sorted(
            crudo[(h + d) % 24]
            for d in range(-VENTANA_ANOMALIA, VENTANA_ANOMALIA + 1)
        )
        medio = len(alrededor) // 2
        return alrededor[medio]

    anomalas = []
    suavizado = dict(crudo)
    for h in range(24):
        base = _mediana_ventana(h)
        if base > 0 and crudo[h] < base * UMBRAL_ANOMALIA:
            anomalas.append(h)
            # Se reemplaza por la mediana de la ventana, no por el promedio de
            # las vecinas: si la vecina tambien esta hundida, promediar arrastra
            # el hueco en vez de taparlo.
            suavizado[h] = round(base)

    pico_modelo = max(suavizado.values())
    curva_hora = {str(h): round(suavizado[h] / pico_modelo, 4) for h in range(24)}
    curva_hora_cruda = {str(h): round(crudo[h] / pico_hora, 4) for h in range(24)}
    curva_dia = {DIAS[d]: round(por_dia.get(d, 0) / pico_dia, 4) for d in range(7)}

    # Factor de dia RELATIVO AL PROMEDIO, no al pico.
    #
    # curvaDia (0..1 sobre el pico) sirve para pintar una barra, pero NO para
    # multiplicar la curva horaria: multiplicar dos cosas normalizadas a 1
    # encoge todo. El factor que consume factorHorario() tiene que orbitar
    # 1.0 — un dia flojo baja un poco, uno cargado sube un poco.
    media_dia = sum(por_dia.values()) / 7
    factor_dia = {
        DIAS[d]: round(por_dia.get(d, 0) / media_dia, 4) if media_dia else 1.0
        for d in range(7)
    }

    salida = {
        "fuente": "Llamadas 123 Bogota, NUSE",
        "periodo": {
            "desde": min(fechas).date().isoformat(),
            "hasta": max(fechas).date().isoformat(),
        },
        "incidentes": len(fechas),
        "encodingOrigen": encoding,
        # Lo que consume congestion.service.ts: 0..1, 1 = hora pico.
        # Con las horas anomalas interpoladas — ver el comentario en el codigo.
        "curvaHora": curva_hora,
        "curvaHoraCruda": curva_hora_cruda,
        "horasAnomalas": anomalas,
        "curvaDia": curva_dia,
        "factorDia": factor_dia,
        "horaPico": max(por_hora, key=por_hora.get),
        "horaValle": min(por_hora, key=por_hora.get),
        "conteoPorHora": {str(h): por_hora.get(h, 0) for h in range(24)},
        "porLocalidad": dict(por_localidad.most_common()),
        "criticosPorLocalidad": dict(critico_por_localidad.most_common()),
        "porTipoIncidente": dict(por_tipo.most_common()),
        "porPrioridad": dict(por_prioridad.most_common()),
        "prioridadATriage": PRIORIDAD_A_TRIAGE,
    }

    escribir_json("demanda.json", salida)

    return {
        "incidentes": len(fechas),
        "periodo": f"{salida['periodo']['desde']} -> {salida['periodo']['hasta']}",
        "hora_pico": salida["horaPico"],
        "hora_valle": salida["horaValle"],
        "horas_anomalas_interpoladas": anomalas,
        "localidades": len(por_localidad),
        "tipos_incidente": len(por_tipo),
    }
