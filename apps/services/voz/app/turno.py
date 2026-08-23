"""El turno de una ambulancia: la máquina de estados de los cuatro puntos.

  A  donde está el móvil cuando le asignan   → asignada
  B  donde está el paciente                  → en_ruta_a_B, en_escena
  C  el hospital que lo recibe               → con_paciente, en_ruta_a_C, en_puerta
  D  la zona que cubre al quedar libre       → libre

POR QUÉ UNA MÁQUINA DE ESTADOS Y NO UN PUÑADO DE MENSAJES
  Sin estado, el agente no puede interpretar un «listo». ¿Listo salí, listo
  llegué, listo lo tengo? Cada uno lleva el turno a un punto distinto y
  dispara una respuesta distinta. El estado es lo que convierte una palabra
  ambigua en una acción correcta.

LO QUE ESTO NO ES
  ⚠️ NO es vigilancia. No se persigue cada movimiento del móvil: se guarda en
     qué PUNTO del turno va y cuál es la ruta que debería estar tomando. La
     diferencia importa — un sistema que registra cada paso de un trabajador
     es otra cosa, y no es esta.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

log = logging.getLogger(__name__)


class Punto(str, Enum):
    """En cuál de los cuatro puntos va el turno."""

    A = "A"  # con el móvil, antes de salir
    B = "B"  # hacia el paciente / en la escena
    C = "C"  # hacia el hospital / en la puerta
    D = "D"  # cubriendo zona


class Estado(str, Enum):
    LIBRE = "libre"
    ASIGNADA = "asignada"
    EN_RUTA_A_B = "en_ruta_a_B"
    EN_ESCENA = "en_escena"
    CON_PACIENTE = "con_paciente"
    EN_RUTA_A_C = "en_ruta_a_C"
    EN_PUERTA = "en_puerta"
    CUBRIENDO = "cubriendo"


#: En qué punto del mapa cae cada estado. Es lo que el mapa resalta.
PUNTO_DE: dict[Estado, Punto] = {
    Estado.LIBRE: Punto.A,
    Estado.ASIGNADA: Punto.A,
    Estado.EN_RUTA_A_B: Punto.B,
    Estado.EN_ESCENA: Punto.B,
    Estado.CON_PACIENTE: Punto.B,
    Estado.EN_RUTA_A_C: Punto.C,
    Estado.EN_PUERTA: Punto.C,
    Estado.CUBRIENDO: Punto.D,
}

#: Qué transición es válida desde dónde. Un salto fuera de esta tabla es un
#: mensaje mal interpretado, no un turno raro — y se rechaza en vez de
#: corromper el estado.
PERMITIDO: dict[Estado, set[Estado]] = {
    Estado.LIBRE: {Estado.ASIGNADA, Estado.CUBRIENDO},
    Estado.ASIGNADA: {Estado.EN_RUTA_A_B, Estado.LIBRE},
    Estado.EN_RUTA_A_B: {Estado.EN_ESCENA, Estado.LIBRE},
    Estado.EN_ESCENA: {Estado.CON_PACIENTE, Estado.LIBRE},
    # Con paciente a bordo NO se vuelve a libre: si el traslado se cancela,
    # alguien tiene que decir explícitamente qué pasó con la persona.
    Estado.CON_PACIENTE: {Estado.EN_RUTA_A_C},
    Estado.EN_RUTA_A_C: {Estado.EN_PUERTA},
    Estado.EN_PUERTA: {Estado.LIBRE, Estado.CUBRIENDO},
    Estado.CUBRIENDO: {Estado.ASIGNADA, Estado.LIBRE},
}


@dataclass
class Lugar:
    """Un punto del turno: dónde, cómo se llama, y cuánto falta."""

    lat: float | None = None
    lng: float | None = None
    #: La dirección en palabras. Es lo que el paramédico lee y teclea en el
    #: navegador; unas coordenadas no le sirven de nada al volante.
    direccion: str | None = None
    #: «Apto 302», «portería del conjunto», «tercer piso sin ascensor».
    #: Se repite al llegar, que es cuando de verdad se necesita.
    detalle: str | None = None
    nombre: str | None = None
    eta_min: float | None = None


@dataclass
class Turno:
    """El estado vivo de una ambulancia. Uno por móvil, no por caso."""

    unidad_id: str
    telefono: str
    estado: Estado = Estado.LIBRE
    caso_id: str | None = None
    a: Lugar = field(default_factory=Lugar)
    b: Lugar = field(default_factory=Lugar)
    c: Lugar = field(default_factory=Lugar)
    d: Lugar = field(default_factory=Lugar)
    #: Geometría de la pata en curso, para resaltarla en el mapa.
    ruta: dict[str, Any] | None = None
    #: Ya se le recordó el detalle al acercarse. Evita repetirlo cada latido.
    detalle_recordado: bool = False
    actualizado_en: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    @property
    def punto(self) -> Punto:
        return PUNTO_DE[self.estado]

    def puede(self, siguiente: Estado) -> bool:
        return siguiente in PERMITIDO.get(self.estado, set())

    def mover(self, siguiente: Estado) -> bool:
        """Avanza si la transición es válida. False si no, sin lanzar.

        No lanza a propósito: un mensaje mal interpretado no puede tumbar el
        procesamiento. Se registra y el turno se queda donde estaba, que es
        recuperable — un estado corrupto no lo es.
        """
        if not self.puede(siguiente):
            log.warning(
                "[turno] %s: transición inválida %s → %s, se ignora",
                self.unidad_id, self.estado.value, siguiente.value,
            )
            return False
        self.estado = siguiente
        self.detalle_recordado = False
        self.actualizado_en = datetime.now(timezone.utc).isoformat()
        return True

    def destino(self) -> Lugar | None:
        """A dónde debería estar yendo AHORA. Es la pata que el mapa resalta."""
        return {
            Estado.ASIGNADA: self.b,
            Estado.EN_RUTA_A_B: self.b,
            Estado.CON_PACIENTE: self.c,
            Estado.EN_RUTA_A_C: self.c,
            Estado.CUBRIENDO: self.d,
        }.get(self.estado)

    def resumen(self) -> dict[str, Any]:
        """Lo que el mapa necesita para pintar el turno completo."""
        return {
            "unidadId": self.unidad_id,
            "estado": self.estado.value,
            "punto": self.punto.value,
            "casoId": self.caso_id,
            "puntos": {
                k: {
                    "lat": v.lat, "lng": v.lng, "direccion": v.direccion,
                    "detalle": v.detalle, "nombre": v.nombre, "etaMin": v.eta_min,
                }
                for k, v in (("A", self.a), ("B", self.b), ("C", self.c), ("D", self.d))
                if v.lat is not None
            },
            # La pata en curso, resaltada. No es el rastro de por dónde pasó:
            # es por dónde DEBERÍA ir.
            "rutaActual": self.ruta,
            "actualizadoEn": self.actualizado_en,
        }


#: unidad → turno. Mismo alcance y misma limitación que `sesiones.py`:
#: en memoria, se pierde al reiniciar, no se comparte entre instancias.
_turnos: dict[str, Turno] = {}


def abrir(unidad_id: str, telefono: str) -> Turno:
    """Al declarar unidad. Si ya había turno, se reusa — declararse dos veces
    no puede borrar un traslado en curso."""
    t = _turnos.get(unidad_id)
    if t is None:
        t = Turno(unidad_id=unidad_id, telefono=telefono)
        _turnos[unidad_id] = t
    t.telefono = telefono
    return t


def de_unidad(unidad_id: str) -> Turno | None:
    return _turnos.get(unidad_id)


def de_telefono(telefono: str) -> Turno | None:
    return next((t for t in _turnos.values() if t.telefono == telefono), None)


def todos() -> list[Turno]:
    return list(_turnos.values())


def reiniciar() -> None:
    """Sólo para tests y para dejar limpio antes del pitch."""
    _turnos.clear()
