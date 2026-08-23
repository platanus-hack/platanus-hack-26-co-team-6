"""Cliente de core (NestJS). El que tiene el estado y la base de datos.

Este servicio no guarda nada: no sabe qué caso es de quién. Todo lo que huela
a estado vive en core, y se le pregunta.

AUTENTICACIÓN — TOKEN DE SERVICIO (tarea 1.8)
core niega por defecto desde que tiene el guard de sesión: expone dictado
clínico, diagnóstico y las coordenadas del paciente. `voz` se identifica con un
token PROPIO, emitido por `POST /auth/servicio`, con `sub: 'svc:voz'` y alcance
`['caso:crear', 'caso:leer', 'notificar']`. Viaja como `Authorization: Bearer`.

Dos cosas cambian frente a la contraseña de turno que se usaba antes, y las dos
son el punto de la tarea:

  1. **La auditoría distingue el bot de la persona.** El `sub` viaja dentro del
     token y core lo cuelga del request: "quién despachó este caso" deja de
     responderse con "alguien con la contraseña".
  2. **`voz` no puede aceptar un traslado.** Un `POST /handshake/respond` con
     este token es 403 en core. Aceptar un paciente es una decisión humana
     (regla 6 del repo) y un webhook de WhatsApp no puede tener esa llave.

── SIN TOKEN ────────────────────────────────────────────────────
No hay modo permisivo. Antes, sin contraseña, este cliente mandaba el request
SIN cabecera y confiaba en que core no tuviera el guard puesto — eso es un
fallback abierto, la única degradación que el repo prohíbe. Ahora, sin token,
la llamada no se hace: se levanta `SinCredencial`, el despachador cae a su
respuesta de siempre ("reporta por radio al CRUE") y `GET /listo` lo dice antes
de que alguien lo descubra en vivo.

── ROTACIÓN ─────────────────────────────────────────────────────
El token vive en `CORE_SERVICE_TOKEN` (variable de entorno de Render) y dura
24 h. Rotarlo es cambiar la variable y redesplegar. Lo que hace que rotar no
tumbe el servicio está del lado de core: al rotar `SESION_SECRET` se deja el
anterior en `SESION_SECRET_ANTERIOR` y core sigue aceptando los tokens ya
emitidos durante una ventana (24 h por defecto). O sea: el token que `voz`
lleva en memoria no muere en el instante de la rotación.

Se lee de `settings` en cada llamada, no una vez al importar, para que cambiar
la variable no exija reiniciar el proceso si algún día se recarga en caliente.
"""

import base64
import binascii
import json
import logging
from datetime import UTC, datetime
from typing import Any

import httpx

from ..config import settings

log = logging.getLogger(__name__)


class CoreCaido(RuntimeError):
    """core no respondió o devolvió algo inesperado."""


class SinCredencial(CoreCaido):
    """No hay token de servicio. No se llama a core: se dice y se degrada."""


def configurado() -> bool:
    """Si `voz` tiene con qué identificarse ante core."""
    return bool(settings.core_service_token)


def identidad() -> dict[str, Any]:
    """Lo que `GET /listo` publica de esta credencial. **Nunca el token.**

    Se lee la carga del token sin verificar la firma —verificarla es cosa de
    core, que es quien tiene el secreto—. Es para reportar, no para autorizar:
    aquí solo sirve para que un operador vea de un vistazo con qué identidad
    está hablando `voz` y hasta cuándo, en vez de descubrirlo por un 401 en
    mitad de un turno.
    """
    if not configurado():
        return {
            "modo": "sin credencial",
            "puede_hablar": False,
            "detalle": (
                "falta CORE_SERVICE_TOKEN: emítelo en core con "
                "POST /auth/servicio. Mientras tanto `voz` no llama a core."
            ),
        }

    carga = _carga(settings.core_service_token)
    if carga is None:
        return {
            "modo": "token ilegible",
            "puede_hablar": False,
            "detalle": "CORE_SERVICE_TOKEN no tiene la forma de un token de core",
        }

    exp = carga.get("exp")
    vence = (
        datetime.fromtimestamp(exp / 1000, UTC).isoformat()
        if isinstance(exp, (int, float))
        else None
    )
    vencido = bool(
        isinstance(exp, (int, float)) and exp / 1000 < datetime.now(UTC).timestamp()
    )
    return {
        "modo": "token de servicio",
        "puede_hablar": not vencido,
        "identidad": carga.get("sub"),
        "alcance": carga.get("alc"),
        "expira": vence,
        "vencido": vencido,
    }


def _carga(token: str) -> dict[str, Any] | None:
    """Decodifica `<carga>.<firma>` sin verificar. Solo para reportar."""
    trozo = token.rsplit(".", 1)[0]
    try:
        crudo = base64.urlsafe_b64decode(trozo + "=" * (-len(trozo) % 4))
        datos = json.loads(crudo)
    except (ValueError, binascii.Error):
        return None
    return datos if isinstance(datos, dict) else None


def _cliente() -> httpx.AsyncClient:
    """Fábrica aparte: es el punto por donde los tests meten un transporte."""
    return httpx.AsyncClient(timeout=settings.timeout_core_s)


async def _pedir(metodo: str, ruta: str, **kw: Any) -> dict[str, Any]:
    token = settings.core_service_token
    if not token:
        raise SinCredencial(
            f"core {ruta}: falta CORE_SERVICE_TOKEN. `voz` no habla con core "
            "sin identidad propia — emite uno con POST /auth/servicio."
        )

    url = f"{settings.core_base_url.rstrip('/')}{ruta}"
    kw.setdefault("headers", {})["Authorization"] = f"Bearer {token}"

    try:
        async with _cliente() as c:
            res = await c.request(metodo, url, **kw)
    except httpx.HTTPError as e:
        raise CoreCaido(f"core {ruta} inalcanzable: {e}") from e

    # 401 y 403 dicen cosas distintas y se arreglan distinto. Un mensaje
    # genérico manda a alguien a mirar la red cuando lo que pasó fue que el
    # token venció.
    if res.status_code == 401:
        raise CoreCaido(
            f"core {ruta} rechazó el token de servicio (401): venció, o se "
            "rotó SESION_SECRET y ya pasó la ventana de gracia. Emite otro."
        )
    if res.status_code == 403:
        raise CoreCaido(
            f"core {ruta} respondió 403: svc:voz no tiene el alcance de esa "
            "ruta. Antes de ampliarlo, mira si la ruta debería estar al "
            "alcance de un servicio — aceptar un traslado no lo está."
        )
    if res.status_code >= 400:
        raise CoreCaido(f"core {ruta} devolvió {res.status_code}: {res.text[:200]}")

    try:
        return res.json()
    except ValueError as e:
        raise CoreCaido(f"core {ruta} no devolvió JSON") from e


async def triage(texto: str, telefono: str) -> dict[str, Any]:
    """Dictado → caso, GUARDADO en el almacén de core. Alcance `caso:crear`.

    ⚠️ Va por core y no por ai-core directo, aunque ai-core sea quien piensa.
    Si el caso no queda en el almacén de core, el `/dispatch` siguiente
    responde 404: busca el caso por id y no lo encuentra.

    De paso el teléfono viaja hasta el Caso, que es lo que permite avisarle
    al paramédico cuando el hospital responde.
    """
    return await _pedir(
        "POST", "/triage", json={"texto": texto, "telefonoReporta": telefono}
    )


async def match(caso: dict[str, Any], limite: int = 5) -> dict[str, Any]:
    """Caso → ranking de sedes. core hace PostGIS + Mapbox + scoring.

    Alcance `caso:leer`.
    """
    return await _pedir("POST", "/match", json={"caso": caso, "limite": limite})


async def dispatch(
    caso_id: str, sede_codigo: str, canal: str = "whatsapp"
) -> dict[str, Any]:
    """Dispara el handshake con la sede. Alcance `notificar`.

    Notificar a la sede sí; responder por ella, no: `POST /handshake/respond`
    exige `handshake:responder`, que este token no lleva.
    """
    return await _pedir(
        "POST",
        "/dispatch",
        json={"casoId": caso_id, "sedeCodigo": sede_codigo, "canal": canal},
    )


async def reportar_movil(
    movil_id: str, lat: float, lng: float, disponible: bool = True
) -> dict[str, Any]:
    """Punto A: dónde está la ambulancia ahora.

    `PUT /moviles/:id/estado`. Es la telemetría, no un evento auditable: core
    la guarda en su tabla de posiciones y no en `evento_caso`.
    """
    return await _pedir(
        "PUT",
        f"/moviles/{movil_id}/estado",
        json={"lat": lat, "lng": lng, "disponible": disponible},
    )


async def moviles() -> dict[str, Any]:
    """La flota visible. Alimenta el cálculo de cobertura (punto D)."""
    return await _pedir("GET", "/moviles")


async def estado(caso_id: str) -> dict[str, Any]:
    """Estado vivo de un caso: handshakes, sede aceptada, etc.

    Alcance `caso:leer`.
    """
    return await _pedir("GET", "/estado", params={"casoId": caso_id})
