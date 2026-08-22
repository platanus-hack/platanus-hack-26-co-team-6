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
from .clientes import core
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


_ACCIONES: dict[str, Accion] = {
    "registrar_caso": _registrar_caso,
    "pedir_ubicacion": _pedir_ubicacion,
    "consultar_estado": _consultar_estado,
    "confirmar_llegada": _confirmar_llegada,
    "reportar_demora": _reportar_demora,
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
