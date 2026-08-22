"""Motor de scoring.

DECISIÓN DE DISEÑO CENTRAL: todo el score está en MINUTOS.
No son "puntos" ni una suma de pesos adimensionales. Cada término es una
cantidad de minutos de hora dorada que esa decisión cuesta o ahorra. Por eso
el jurado entiende el ranking sin que nadie se lo explique.

  Costo(sede) = ETA_con_tráfico
              + (1 − P_aceptación) × penalización_de_rebote(sede)
              + congestión × ESPERA_PUERTA_MAX
              − bono_por_camas_libres

MENOR ES MEJOR.

Puerto de `apps/frontend/lib/scoring.ts`, con un cambio de fondo: la
penalización de rebote dejó de ser una constante global y ahora se calibra
por sede. Ver `penalizacion_rebote()`.
"""

from datetime import datetime

from .congestion import indice_congestion
from .schemas import (
    Candidato,
    Caso,
    DesgloseScore,
    EtaSede,
    Sede,
    SenalesSede,
)
from .servicios_reps import (
    complejidad_suficiente,
    movil_compatible,
    nombres_servicios,
    servicios_faltantes,
)

# ─────────────────────────────────────────────────────────────────
# Constantes. Cada una tiene una justificación que se puede defender.
#
# ⚠️ SON PARÁMETROS CALIBRABLES, NO VERDADES. Salen de juicio informado,
#    no de una medición colombiana publicada. Decirlo en el pitch genera
#    confianza; fingir precisión la destruye.
# ─────────────────────────────────────────────────────────────────

#: Lo que tarda un hospital en contestar si acepta. Prior, antes de haber
#: visto un solo handshake de esa sede. Hoy esa respuesta llega por teléfono.
ESPERA_RESPUESTA_PRIOR = 4

#: El resto del rebote: descargar al paciente, re-llamar, re-rutear y volver
#: a salir. No es observable desde el handshake, así que se queda constante.
SOBRECOSTO_REBOTE = 18

#: Costo total de un rebote con una sede de la que no sabemos nada.
#: 22 min es conservador; en la práctica el "paseo de la muerte" cuesta más.
PENALIZACION_REBOTE = ESPERA_RESPUESTA_PRIOR + SOBRECOSTO_REBOTE

#: Cuántas respuestas observadas hacen falta para que los datos de una sede
#: pesen tanto como el prior. Bajo a propósito: con 3 handshakes ya se nota
#: en pantalla que el sistema aprendió algo de esa sede.
FUERZA_PRIOR_LATENCIA = 3

#: Espera máxima en puerta de urgencias cuando la sede está al 100%.
ESPERA_PUERTA_MAX = 25

#: Bono máximo por tener camas libres declaradas.
BONO_CAPACIDAD_MAX = 5

#: Prior Beta-Bernoulli de aceptación: alfa0 + beta0 = 10 equivale a "hemos
#: visto 10 casos previos". Con pocos datos manda el prior; con muchos
#: handshakes reales mandan los datos. Esa transición es visible en el demo
#: y es el punto del sistema. Si un rechazo no se nota en pantalla, BAJA
#: este número (menos prior = los datos mandan más rápido).
FUERZA_PRIOR = 10

_SIN_SENALES = SenalesSede()


# ─────────────────────────────────────────────────────────────────
# Penalización de rebote — por sede
# ─────────────────────────────────────────────────────────────────


def penalizacion_rebote(senales: SenalesSede) -> float:
    """Cuántos minutos cuesta que ESTA sede diga que no.

    El rebote tiene dos mitades y solo una es observable:

      1. Lo que la sede tarda en contestar → SÍ lo medimos. Cada handshake
         deja su `latencia_s`. Una sede que contesta en 40 segundos cuesta
         mucho menos rebotar que una que se demora ocho minutos.
      2. Descargar, re-llamar, re-rutear y volver a salir → no lo medimos,
         y es igual para todas. Se queda en SOBRECOSTO_REBOTE.

    Sobre la mitad observable aplicamos el mismo encogimiento hacia el prior
    que usa P(aceptación): con 0 datos devuelve exactamente los 22 minutos de
    siempre, y cada respuesta observada lo mueve hacia lo que esa sede hace
    de verdad. Nadie reporta nada; el número se calibra solo.
    """
    observadas = senales.latencias_respuesta_min
    espera = (
        FUERZA_PRIOR_LATENCIA * ESPERA_RESPUESTA_PRIOR + sum(observadas)
    ) / (FUERZA_PRIOR_LATENCIA + len(observadas))
    return espera + SOBRECOSTO_REBOTE


# ─────────────────────────────────────────────────────────────────
# P(aceptación) — Beta-Bernoulli
# ─────────────────────────────────────────────────────────────────


def prior_aceptacion(sede: Sede) -> float:
    """Qué tan probable es que ESTA sede acepte, antes de ver un handshake.

    Sale de features del REPS. Racional defendible ante un jurado médico:
      - las privadas de alta complejidad aceptan más (capacidad y flujo)
      - las públicas de alta complejidad reciben el grueso de la demanda de
        urgencias de la ciudad → rechazan más por saturación
      - más camas = más holgura
    """
    p = 0.55
    if sede.naturaleza == "Privada":
        p += 0.12
    if sede.naturaleza == "Pública":
        p -= 0.08
    if sede.complejidad == "alta":
        p += 0.05

    camas_totales = sum(c.total for c in sede.camas)
    if camas_totales > 250:
        p += 0.05
    if 0 < camas_totales < 100:
        p -= 0.05

    return max(0.15, min(0.9, p))


def p_aceptacion(sede: Sede, senales: SenalesSede) -> float:
    """Posterior. Cada handshake respondido mueve este número.

      P = (alfa0 + aceptados) / (alfa0 + beta0 + aceptados + rechazados)

    Esto es lo que hace que la red "aprenda sola": nadie reporta nada, pero
    cada botón apretado es una observación etiquetada.
    """
    prior = prior_aceptacion(sede)
    alfa0 = prior * FUERZA_PRIOR
    beta0 = (1 - prior) * FUERZA_PRIOR
    return (alfa0 + senales.aceptados) / (
        alfa0 + beta0 + senales.aceptados + senales.rechazados
    )


# ─────────────────────────────────────────────────────────────────
# Score
# ─────────────────────────────────────────────────────────────────


def holgura(sede: Sede) -> float:
    """Fracción de camas libres declaradas (0..1)."""
    total = sum(c.total for c in sede.camas)
    if not total:
        return 0.0
    ocupadas = sum(c.ocupadas_snapshot for c in sede.camas)
    return max(0.0, (total - ocupadas) / total)


def calcular_desglose(
    sede: Sede, senales: SenalesSede, eta_min: float, fecha: datetime
) -> DesgloseScore:
    p = p_aceptacion(sede, senales)
    c = indice_congestion(sede, senales, fecha)
    return DesgloseScore(
        ruta=eta_min,
        riesgo_rechazo=(1 - p) * penalizacion_rebote(senales),
        espera=c * ESPERA_PUERTA_MAX,
        bono=-(holgura(sede) * BONO_CAPACIDAD_MAX),
    )


def sumar_desglose(d: DesgloseScore) -> float:
    return d.ruta + d.riesgo_rechazo + d.espera + d.bono


# ─────────────────────────────────────────────────────────────────
# Ranking
# ─────────────────────────────────────────────────────────────────


def rankear(
    caso: Caso,
    sedes: list[Sede],
    etas: list[EtaSede],
    senales: dict[str, SenalesSede] | None = None,
    fecha: datetime | None = None,
    limite: int = 5,
    incluir_descartadas: bool = True,
) -> list[Candidato]:
    """Convierte sedes + ETAs en el ranking final.

    Dos pasos, en este orden y no al revés:
      1. FILTRO DURO    — servicios habilitados, complejidad, tipo de móvil.
                          Esto NO se pondera. Una sede sin hemodinamia no es
                          "peor opción", es NO OPCIÓN.
      2. RANKING BLANDO — costo en minutos sobre las que sobrevivieron.

    Las descartadas igual se devuelven (con `servicios_faltantes` lleno) para
    que Juan las pinte en gris. Ver una sede a 4 minutos tachada por "no tiene
    hemodinamia" es lo que hace entender el producto de un vistazo.
    """
    senales = senales or {}
    fecha = fecha or datetime.now()
    mapa_eta = {e.codigo: e for e in etas}

    evaluados: list[Candidato] = []

    for sede in sedes:
        eta = mapa_eta.get(sede.codigo)
        if eta is None:
            continue

        s = senales.get(sede.codigo, _SIN_SENALES)

        faltantes = servicios_faltantes(sede.servicios, caso.servicios_requeridos)
        complejidad_ok = complejidad_suficiente(
            sede.complejidad, caso.complejidad_requerida
        )
        movil_ok = movil_compatible(caso.tipo_movil, caso.requiere_medico_a_bordo)

        # El primer motivo que aparezca es el que se muestra. Un solo motivo
        # claro se lee mejor que una lista de tres.
        motivo_descarte: str | None = None
        if faltantes:
            motivo_descarte = f"No tiene {nombres_servicios(faltantes)}"
        elif not complejidad_ok:
            motivo_descarte = (
                f"Complejidad {sede.complejidad}, "
                f"el caso requiere {caso.complejidad_requerida}"
            )
        elif not movil_ok:
            motivo_descarte = "El paciente requiere médico a bordo (móvil TAM)"

        desglose = calcular_desglose(sede, s, eta.eta_min, fecha)

        evaluados.append(
            Candidato(
                sede=sede,
                rank=0,  # se asigna abajo
                eta_min=eta.eta_min,
                dist_km=eta.dist_km,
                p_aceptacion=p_aceptacion(sede, s),
                congestion=indice_congestion(sede, s, fecha),
                score=sumar_desglose(desglose),
                desglose=desglose,
                servicios_faltantes=faltantes,
                motivo_descarte=motivo_descarte,
            )
        )

    viables = sorted(
        (c for c in evaluados if c.motivo_descarte is None), key=lambda c: c.score
    )[:limite]
    for i, c in enumerate(viables, start=1):
        c.rank = i

    if not incluir_descartadas:
        return viables

    descartadas = sorted(
        (c for c in evaluados if c.motivo_descarte is not None),
        key=lambda c: c.eta_min,
    )[:4]

    return [*viables, *descartadas]


def explicar_ganador(ganador: Candidato, segundo: Candidato | None = None) -> str:
    """Una línea que explica POR QUÉ ganó el #1.

    Sebas la usa en el pitch, Juan la pinta debajo de la tarjeta ganadora.
    """
    if segundo is None:
        return (
            f"{ganador.sede.nombre}: {round(ganador.eta_min)} min de ruta, "
            f"{round(ganador.p_aceptacion * 100)}% de probabilidad de aceptación."
        )

    dif = segundo.score - ganador.score
    if segundo.eta_min < ganador.eta_min:
        return (
            f"{segundo.sede.nombre} está {round(segundo.eta_min - ganador.eta_min)} min "
            f"más cerca, pero su riesgo de rechazo y congestión suman "
            f"{round(segundo.desglose.riesgo_rechazo + segundo.desglose.espera)} min. "
            f"{ganador.sede.nombre} gana por {round(dif)} min efectivos."
        )
    return (
        f"{ganador.sede.nombre} gana por {round(dif)} min efectivos "
        f"sobre {segundo.sede.nombre}."
    )
