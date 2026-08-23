"""El despacho saliente: PULSO le dice a la ambulancia a dónde ir.

Es el flujo INVERSO al que había. Antes el paramédico escribía primero y
PULSO respondía; aquí PULSO inicia.

⚠️ LA VENTANA DE 24 HORAS ES EL MURO DE ESTE FLUJO
   Mandarle un WhatsApp a alguien que no te ha escrito en las últimas 24 h
   exige una plantilla aprobada por Meta — el trámite de 24 a 48 h.

   La salida no es una plantilla: es que el paramédico mande «soy la AMB-014»
   al empezar el turno. Ese mensaje **abre la ventana** y de ahí en adelante
   PULSO le escribe libre por 24 h. Por eso `declarar_unidad` no es sólo
   identificación: es lo que destraba el canal, y sin ella el despacho
   saliente simplemente no llega.

   Si no hay turno abierto, aquí se dice — no se intenta y se falla en
   silencio.
"""

import logging
from typing import Any

from .canales import whatsapp
from .clientes import core
from .turno import Estado, Lugar, Turno, de_unidad

log = logging.getLogger(__name__)

#: Ids de los botones. Constantes porque los manda el servidor y los recibe el
#: webhook: un typo entre los dos lados deja al paramédico tocando un botón
#: que no hace nada.
BOTON_VOY = "voy_en_camino"
BOTON_EN_ESCENA = "llegue_a_la_escena"
BOTON_A_BORDO = "paciente_a_bordo"
BOTON_ENTREGADO = "paciente_entregado"
#: Salió del hospital. Es el momento en que la unidad vuelve al pool y la
#: ciudad puede volver a contar con ella — antes de esto sigue ocupada.
BOTON_SALI = "sali_del_hospital"
#: Llegó al punto D. Cierra el ciclo y confirma que la zona quedó cubierta de
#: verdad, no sólo asignada en un tablero.
BOTON_EN_ZONA = "llegue_a_la_zona"

#: botón → (estado que DEBE tener, estado al que lleva).
#: El origen es tan importante como el destino: ver la nota en `confirmar`.
DE_BOTON: dict[str, tuple["Estado", "Estado"]] = {}


async def asignar(
    unidad_id: str,
    incidente: Lugar,
    descripcion: str,
    caso_id: str | None = None,
) -> bool:
    """Punto A → B. Le dice a la ambulancia que salga.

    Devuelve False si no hay turno abierto para esa unidad: sin el mensaje de
    «soy la AMB-014» no hay ventana de 24 h y el mensaje no llegaría.
    """
    t = de_unidad(unidad_id)
    if t is None:
        log.warning(
            "[logistica] %s no tiene turno abierto — sin ventana de 24h no se "
            "le puede escribir. Tiene que declararse primero.", unidad_id
        )
        return False

    if not t.mover(Estado.ASIGNADA):
        log.warning("[logistica] %s no puede aceptar asignación desde %s",
                    unidad_id, t.estado.value)
        return False

    t.caso_id = caso_id
    t.b = incidente
    await _con_ruta(t, incidente)

    nombre = t.unidad_id
    donde = incidente.direccion or _coordenadas(incidente)
    lineas = [f"🚨 {nombre}, emergencia en tu zona.", "", f"📍 {donde}"]
    if incidente.detalle:
        lineas.append(f"   {incidente.detalle}")
    if descripcion:
        lineas += ["", descripcion]
    if incidente.eta_min:
        lineas.append(f"\n⏱️ {round(incidente.eta_min)} min desde donde estás")

    await whatsapp.enviar_botones(
        t.telefono, "\n".join(lineas), [(BOTON_VOY, "Voy en camino")]
    )
    await _ubicacion(t, incidente, "Lugar de la emergencia")
    return True


def _tabla_botones() -> None:
    """Se arma después de importar Estado, para no repetir el enum arriba."""
    DE_BOTON.update({
        BOTON_VOY: (Estado.ASIGNADA, Estado.EN_RUTA_A_B),
        BOTON_EN_ESCENA: (Estado.EN_RUTA_A_B, Estado.EN_ESCENA),
        BOTON_A_BORDO: (Estado.EN_ESCENA, Estado.CON_PACIENTE),
        BOTON_ENTREGADO: (Estado.EN_RUTA_A_C, Estado.EN_PUERTA),
        BOTON_SALI: (Estado.EN_PUERTA, Estado.LIBRE),
        BOTON_EN_ZONA: (Estado.LIBRE, Estado.CUBRIENDO),
    })


_tabla_botones()


async def asignar_hospital(unidad_id: str, hospital: Lugar) -> bool:
    """Punto B → C. Lo dispara el MOTOR, no un botón.

    Es el eslabón que une los dos flujos: el saliente termina cuando el
    paciente está a bordo, y ahí empieza el que ya existía —el paramédico
    dicta, el motor rankea, sale un hospital—. Ese resultado es el que mueve
    el turno, y por eso no hay botón: el paramédico no elige el destino.
    """
    t = de_unidad(unidad_id)
    if t is None or not t.mover(Estado.EN_RUTA_A_C):
        return False

    t.c = hospital
    t.a = Lugar(lat=t.b.lat, lng=t.b.lng)  # ahora sale desde la escena
    await _con_ruta(t, hospital)
    await _ubicacion(t, hospital, hospital.nombre or "Hospital receptor")
    await whatsapp.enviar_botones(
        t.telefono,
        f"🚑 {hospital.nombre or 'Hospital'}\n"
        + (f"{hospital.direccion}\n" if hospital.direccion else "")
        + (f"{round(hospital.eta_min)} min" if hospital.eta_min else ""),
        [(BOTON_ENTREGADO, "Entregué al paciente")],
    )
    return True


async def confirmar(unidad_id: str, boton: str) -> str | None:
    """Un botón tocado → la transición que le corresponde.

    El id del botón es la intención sin ambigüedad. Por eso los botones son
    mejores que el texto libre aquí: «listo» puede significar tres cosas
    distintas según dónde vaya el turno; `paciente_a_bordo` sólo una.
    """
    t = de_unidad(unidad_id)
    if t is None:
        return None

    paso = DE_BOTON.get(boton)
    if paso is None:
        return None
    desde, siguiente = paso

    # ⚠️ SE EXIGE EL ESTADO DE ORIGEN, no sólo que la transición sea legal.
    #    En WhatsApp los botones viejos SIGUEN TOCABLES en el historial: un
    #    paramédico puede subir en el chat y tocar «Ya salí» de hace dos
    #    traslados. Sin esta comprobación, ese toque cancela la asignación en
    #    curso —porque `asignada → libre` sí es una transición válida— y nadie
    #    entiende por qué la unidad se soltó.
    if t.estado is not desde:
        log.info(
            "[logistica] %s tocó %s desde %s (esperaba %s): botón viejo, se ignora",
            t.unidad_id, boton, t.estado.value, desde.value,
        )
        return None

    if not t.mover(siguiente):
        return None

    return await _al_llegar(t, siguiente)


async def _al_llegar(t: Turno, estado: Estado) -> str:
    """Qué responde el agente en cada punto del turno."""
    if estado == Estado.EN_RUTA_A_B:
        texto = "Copiado. Te aviso cuando estés cerca."
        botones = [(BOTON_EN_ESCENA, "Ya llegué")]

    elif estado == Estado.EN_ESCENA:
        # El detalle se repite AQUÍ, que es cuando de verdad sirve: el
        # paramédico está frente al edificio buscando el apartamento.
        extra = f"\n📍 {t.b.detalle}" if t.b.detalle else ""
        texto = (
            f"Copiado, en escena.{extra}\n\n"
            "Cuando tengas al paciente, tócalo y me dictas el reporte."
        )
        botones = [(BOTON_A_BORDO, "Paciente a bordo")]

    elif estado == Estado.CON_PACIENTE:
        # Aquí es donde el flujo se cruza con el que ya existía: a partir de
        # este punto el paramédico dicta y el motor elige hospital.
        texto = (
            "Listo. Mándame el reporte del paciente —texto o nota de voz— y "
            "te digo a qué hospital llevarlo."
        )
        botones = []

    elif estado == Estado.EN_PUERTA:
        # Entregar el paciente y quedar libre NO son el mismo momento: entre
        # los dos está el papeleo, la camilla y la limpieza. Contar la unidad
        # como disponible al entregar la pone a cubrir una zona a la que no
        # puede llegar todavía.
        texto = "Copiado, entregado. Tócalo cuando salgas del hospital."
        botones = [(BOTON_SALI, "Ya salí")]

    elif estado == Estado.LIBRE:
        # Aquí se cruza con el punto D: al quedar libre, el sistema propone
        # zona. Es el trigger que faltaba — no debería tener que preguntar.
        zona = await _proponer_zona(t)
        if zona:
            texto = f"📍 Cubre {zona}. Tócalo cuando llegues."
            botones = [(BOTON_EN_ZONA, "Llegué a la zona")]
        else:
            texto = "Copiado, quedaste libre. Te aviso si entra algo."
            botones = []

    else:  # CUBRIENDO
        nombre = t.d.nombre or "la zona"
        texto = f"Copiado, cubriendo {nombre}. Te aviso si entra una emergencia."
        botones = []

    if botones:
        await whatsapp.enviar_botones(t.telefono, texto, botones)
    else:
        await whatsapp.enviar_texto(t.telefono, texto)
    return texto


async def _proponer_zona(t: Turno) -> str | None:
    """Punto D: qué zona cubrir al quedar libre.

    Nunca lanza: si el reparto falla, la unidad queda libre igual. Perder la
    propuesta de zona es molesto; dejar el turno colgado es otra cosa.
    """
    from .clientes import ai_core
    from .zonas import zonas

    try:
        zs = zonas()
        if not zs:
            return None
        unidad = {
            "id": t.unidad_id,
            "estado": "libre",
            "posicion": {
                "lat": t.c.lat if t.c.lat is not None else 4.6097,
                "lng": t.c.lng if t.c.lng is not None else -74.0817,
            },
        }
        r = await ai_core.cobertura(zs, [unidad])
        a = next((x for x in r.get("asignaciones", []) if x["unidadId"] == t.unidad_id), None)
        if not a:
            return None
        t.d = Lugar(
            lat=None, lng=None, nombre=a["zonaNombre"], eta_min=a.get("etaMin")
        )
        zona = next((z for z in zs if z["id"] == a["zonaId"]), None)
        if zona:
            t.d.lat = zona["centroide"]["lat"]
            t.d.lng = zona["centroide"]["lng"]
            await _con_ruta(t, t.d)
            await _ubicacion(t, t.d, f"Zona {a['zonaNombre']}")
        return a["zonaNombre"]
    except Exception:
        log.warning("[logistica] no pude proponer zona a %s", t.unidad_id)
        return None


# ─────────────────────────────────────────────────────────────────


async def _con_ruta(t: Turno, destino: Lugar) -> None:
    """La ruta que DEBERÍA tomar, para resaltarla en el mapa.

    No es el rastro de por dónde pasó: es la pata en curso. Si Mapbox no
    responde, el turno sigue sin geometría — el mapa pinta los puntos y no la
    línea, que es peor pero no bloquea a nadie.
    """
    if t.a.lat is None or destino.lat is None:
        return
    try:
        r = await core.ruta(
            {"lat": t.a.lat, "lng": t.a.lng},
            {"lat": destino.lat, "lng": destino.lng},
        )
        t.ruta = r.get("geometria") if isinstance(r, dict) else None
        if isinstance(r, dict) and r.get("duracionMin"):
            destino.eta_min = r["duracionMin"]
    except Exception:
        log.warning("[logistica] sin geometría de ruta para %s", t.unidad_id)


async def _ubicacion(t: Turno, l: Lugar, titulo: str) -> None:
    if l.lat is None or l.lng is None:
        return
    await whatsapp.enviar_ubicacion(
        t.telefono, l.lat, l.lng, titulo, l.direccion or ""
    )


def _coordenadas(l: Lugar) -> str:
    return f"{l.lat}, {l.lng}" if l.lat is not None else "ubicación sin definir"
