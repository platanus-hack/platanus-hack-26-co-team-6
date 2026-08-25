"""Decisión → acciones reales. El puente entre lo que el agente decidió y el mundo.

`ai-core` decide QUÉ hacer; aquí se hace. Cada acción es una función, igual
que el `function_handlers.py` de Tequendama: para cambiar lo que hace una
herramienta se toca una función, no un `if` gigante.

Ninguna acción lanza. Un fallo se convierte en un mensaje al paramédico, no en
un 500: del otro lado hay alguien con un paciente esperando una respuesta.
"""

import logging
from typing import Any, Callable, Coroutine

from .canales import whatsapp
from .clientes import ai_core, core
from .zonas import zonas
from . import turno
from .sesiones import Sesion, guardar, obtener

log = logging.getLogger(__name__)

Accion = Callable[[str, dict[str, Any]], Coroutine[Any, Any, str]]


async def despachar(telefono: str, accion: str, argumentos: dict[str, Any]) -> str:
    """Ejecuta la acción y devuelve lo que ya se le respondió al paramédico."""
    manejador = _ACCIONES.get(accion)
    if manejador is None:
        log.warning("[voz] acción desconocida: %s", accion)
        return await _responder(telefono, "No entendí. ¿Me repites?")

    try:
        return await manejador(telefono, argumentos)
    except Exception:
        log.exception("[voz] la acción %s falló", accion)
        return await _responder(
            telefono,
            "Tuvimos un problema procesando eso. Reporta por radio al CRUE mientras lo revisamos.",
        )


# ─────────────────────────────────────────────────────────────────
# Acciones
# ─────────────────────────────────────────────────────────────────


async def _registrar_caso(telefono: str, args: dict[str, Any]) -> str:
    dictado = (args.get("dictado") or "").strip()
    if len(dictado) < 10:
        return await _responder(telefono, "El reporte llegó muy corto. ¿Me lo repites?")

    # Por core, NO por ai-core directo: core es quien guarda el caso en su
    # almacén, y sin eso el /dispatch de abajo responde 404.
    triaje = await core.triage(dictado, telefono)
    caso = triaje["caso"]

    ranking = await core.match(caso)
    viables = [c for c in ranking.get("candidatos", []) if c.get("rank", 0) >= 1]

    if not viables:
        # Ranking vacío es el fallo más caro y el más silencioso del sistema.
        # Nunca se calla: se dice y se devuelve al canal que sí funciona.
        log.error("[voz] ranking vacío para el caso %s", caso.get("id"))
        return await _responder(
            telefono,
            "No encontré ninguna sede que cumpla lo que este paciente necesita. "
            "Escala al CRUE por radio.",
        )

    ganador = viables[0]
    sede = ganador["sede"]

    s = obtener(telefono)
    s.caso_id = caso["id"]
    s.sede_codigo = sede["codigo"]
    s.sede_nombre = sede["nombre"]
    s.sede_lat = sede["coord"]["lat"]
    s.sede_lng = sede["coord"]["lng"]
    s.sede_direccion = sede.get("direccion") or ""
    guardar(s)

    await core.dispatch(caso["id"], sede["codigo"])

    # Si esta unidad tiene turno abierto, el ranking lo mueve de B a C. Sin
    # esto el turno se queda en `con_paciente` para siempre y el botón de
    # «entregué» nunca aplica.
    t = turno.de_telefono(telefono)
    if t is not None:
        from .logistica import asignar_hospital
        from .turno import Lugar

        await asignar_hospital(
            t.unidad_id,
            Lugar(
                lat=s.sede_lat, lng=s.sede_lng,
                direccion=s.sede_direccion, nombre=s.sede_nombre,
                eta_min=ganador.get("etaMin"),
            ),
        )

    texto = (
        f"🚑 {sede['nombre']}\n"
        f"{round(ganador['etaMin'])} min · triage {caso['triage']}\n"
        f"Avisando a urgencias, te confirmo apenas respondan."
    )
    await _responder(telefono, texto)
    await _mandar_ubicacion(s)
    return texto


async def _pedir_ubicacion(telefono: str, args: dict[str, Any]) -> str:
    s = obtener(telefono)
    if not s.sede_codigo:
        return await _responder(telefono, "Todavía no tienes un destino asignado.")
    await _mandar_ubicacion(s)
    return f"Ubicación de {s.sede_nombre}"


async def _consultar_estado(telefono: str, args: dict[str, Any]) -> str:
    s = obtener(telefono)
    if not s.caso_id:
        return await _responder(telefono, "No tienes un caso abierto.")

    datos = await core.estado(s.caso_id)
    handshakes = datos.get("handshakes", []) or []
    aceptado = next((h for h in handshakes if h.get("estado") == "aceptado"), None)

    if aceptado:
        texto = f"✅ {s.sede_nombre} aceptó. Van para allá."
    elif handshakes:
        texto = f"⏳ Esperando respuesta de {s.sede_nombre}."
    else:
        texto = "Todavía no se ha despachado la solicitud."
    return await _responder(telefono, texto)


async def _confirmar_llegada(telefono: str, args: dict[str, Any]) -> str:
    donde = args.get("donde", "escena")
    if donde == "hospital":
        s = obtener(telefono)
        s.caso_id = None
        s.sede_codigo = None
        guardar(s)
        return await _responder(telefono, "Copiado, traslado cerrado. Gracias.")
    return await _responder(telefono, "Copiado. Cuando tengas el reporte, mándalo.")


async def _reportar_demora(telefono: str, args: dict[str, Any]) -> str:
    motivo = args.get("motivo") or "sin detalle"
    minutos = args.get("minutos_estimados")
    # TODO: cuando core exponga registro de demoras, mandarlo allá. Hoy sólo
    # queda en el log — decirlo es mejor que fingir que se guardó.
    log.info("[voz] demora de %s: %s (est. %s min)", telefono, motivo, minutos)
    cola = f" Te esperamos en ~{minutos} min." if minutos else ""
    return await _responder(telefono, f"Copiado.{cola}")


async def _no_entendido(telefono: str, args: dict[str, Any]) -> str:
    return await _responder(
        telefono,
        "No te entendí. Si es un paciente nuevo, mándame el reporte completo "
        "(edad, qué le pasó y signos vitales).",
    )


# ── Punto A · qué móvil es y dónde está ──────────────────────────


async def _declarar_unidad(telefono: str, args: dict[str, Any]) -> str:
    unidad = (args.get("unidad_id") or "").strip().upper()
    if not unidad:
        return await _responder(telefono, "¿Cuál es tu unidad? Ej: AMB-014")

    s = obtener(telefono)
    s.unidad_id = unidad
    guardar(s)
    # Abrir el turno aquí no es un detalle: este mensaje del paramédico es lo
    # que ABRE LA VENTANA DE 24 HORAS de WhatsApp. Sin él, PULSO no puede
    # escribirle primero para despacharlo — necesitaría una plantilla aprobada
    # por Meta, que tarda 24-48 h en salir.
    turno.abrir(unidad, telefono)

    return await _responder(
        telefono,
        f"Copiado, {unidad}. Turno abierto — te aviso si entra una emergencia "
        f"en tu zona.",
    )


async def _reportar_posicion(telefono: str, args: dict[str, Any]) -> str:
    """El paramédico dice dónde está EN PALABRAS.

    ⚠️ No se geocodifica todavía: convertir "la 80 con 68" en coordenadas
    necesita el geocodificador de Mapbox, que es del carril de Zaid y hoy
    sólo se usa en el ETL. Se acusa y se guarda el texto para no perderlo.

    La posición que SÍ sirve es la que llega por el botón de ubicación de
    WhatsApp — esa trae lat/lng y entra por otro camino.
    """
    referencia = (args.get("referencia") or "").strip()
    log.info("[voz] posición declarada por %s: %s", telefono, referencia)
    return await _responder(
        telefono,
        "Copiado. Para ubicarte en el mapa, mándame tu ubicación con el clip 📎 "
        "→ Ubicación: así llega exacta.",
    )


async def actualizar_posicion(telefono: str, lat: float, lng: float) -> None:
    """Punto A de verdad: coordenadas del botón de ubicación de WhatsApp.

    Nunca lanza: si core no responde, la sesión igual guarda la posición y el
    turno sigue. Perder un reporte de telemetría no puede tumbar un traslado.
    """
    s = obtener(telefono)
    s.lat, s.lng = lat, lng
    guardar(s)
    if not s.unidad_id:
        return
    try:
        await core.reportar_movil(s.unidad_id, lat, lng)
    except Exception:
        log.warning("[voz] no pude reportar la posición de %s a core", s.unidad_id)


# ── Punto D · a dónde ir al quedar libre ─────────────────────────


async def _pedir_zona_cobertura(telefono: str, args: dict[str, Any]) -> str:
    """La ambulancia quedó libre: ¿dónde espera para no dejar hueco?

    El reparto lo calcula ai-core sobre la demanda REAL del 123. Aquí sólo se
    arma la foto de la flota y se transporta la respuesta.
    """
    s = obtener(telefono)
    if not s.unidad_id:
        return await _responder(
            telefono, "Primero dime qué unidad eres. Ej: «soy la AMB-014»."
        )

    zs = zonas()
    if not zs:
        return await _responder(
            telefono, "No tengo el mapa de demanda cargado. Reporta al CRUE por radio."
        )

    # La flota sale de core. Si no responde, se calcula con esta sola unidad:
    # un reparto para una es peor que uno para toda la flota, y es mucho mejor
    # que dejar al paramédico sin respuesta.
    unidades = [_yo(s)]
    try:
        flota = await core.moviles()
        otras = [
            _de_core(m) for m in (flota.get("moviles") or [])
            if m.get("id") and m["id"] != s.unidad_id and m.get("posicion")
        ]
        unidades += [u for u in otras if u]
    except Exception:
        log.warning("[voz] core no dio la flota; reparto con una sola unidad")

    r = await ai_core.cobertura(zs, unidades)
    mia = next(
        (a for a in r.get("asignaciones", []) if a["unidadId"] == s.unidad_id), None
    )

    if not mia:
        descubiertas = len(r.get("descubiertas", []))
        return await _responder(
            telefono,
            f"Por ahora quédate donde estás; la cobertura está repartida."
            + (f" ({descubiertas} zonas sin unidad)" if descubiertas else ""),
        )

    s.zona_id, s.zona_nombre = mia["zonaId"], mia["zonaNombre"]
    guardar(s)

    zona = next((z for z in zs if z["id"] == mia["zonaId"]), None)
    texto = (
        f"📍 Cubre {mia['zonaNombre']}\n"
        f"{round(mia['etaMin'])} min · {mia['motivo']}"
    )
    await _responder(telefono, texto)
    if zona:
        await whatsapp.enviar_ubicacion(
            telefono,
            zona["centroide"]["lat"],
            zona["centroide"]["lng"],
            f"Zona {mia['zonaNombre']}",
            "Punto de referencia de la zona, no una dirección exacta",
        )
    return texto


def _yo(s: Sesion) -> dict[str, Any]:
    """Esta unidad, para el cálculo. Sin posición conocida, el centro."""
    return {
        "id": s.unidad_id,
        "estado": "libre",
        "posicion": {
            "lat": s.lat if s.lat is not None else 4.6097,
            "lng": s.lng if s.lng is not None else -74.0817,
        },
    }


def _de_core(m: dict[str, Any]) -> dict[str, Any] | None:
    pos = m.get("posicion") or {}
    if pos.get("lat") is None or pos.get("lng") is None:
        return None
    return {
        "id": m["id"],
        "estado": "libre" if m.get("disponible") else "fuera_servicio",
        "posicion": {"lat": pos["lat"], "lng": pos["lng"]},
        "ultimoLatidoEn": m.get("reportadoEn"),
    }


_ACCIONES: dict[str, Accion] = {
    "registrar_caso": _registrar_caso,
    "pedir_ubicacion": _pedir_ubicacion,
    "consultar_estado": _consultar_estado,
    "confirmar_llegada": _confirmar_llegada,
    "reportar_demora": _reportar_demora,
    "declarar_unidad": _declarar_unidad,
    "reportar_posicion": _reportar_posicion,
    "pedir_zona_cobertura": _pedir_zona_cobertura,
    "no_entendido": _no_entendido,
}


# ─────────────────────────────────────────────────────────────────


async def _responder(telefono: str, texto: str) -> str:
    await whatsapp.enviar_texto(telefono, texto)
    return texto


async def _mandar_ubicacion(s: Sesion) -> None:
    if s.sede_lat is None or s.sede_lng is None:
        return
    await whatsapp.enviar_ubicacion(
        s.telefono, s.sede_lat, s.sede_lng, s.sede_nombre or "Sede", s.sede_direccion or ""
    )
