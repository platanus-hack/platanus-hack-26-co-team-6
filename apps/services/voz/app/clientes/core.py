"""Cliente de core (NestJS). El que tiene el estado y la base de datos.

Este servicio no guarda nada: no sabe qué caso es de quién. Todo lo que huela
a estado vive en core, y se le pregunta.

AUTENTICACIÓN
core niega por defecto desde que tiene el guard de sesión: expone dictado
clínico, diagnóstico y las coordenadas del paciente. Este cliente se
autentica con el MISMO mecanismo que el navegador —`POST /auth/login` con la
contraseña de turno— y reusa el token hasta que expira.

El token viaja en la cookie que devuelve el login, así que hay que sacarlo de
ahí y remandarlo como `Authorization: Bearer`. El guard acepta las dos formas.

⚠️ Es una solución de turno, no una cuenta de servicio. Un servicio
   autenticándose con la contraseña compartida de los operadores no distingue
   quién hizo qué en la auditoría. Lo correcto es un token de servicio propio
   — anotado en docs/neid-faltantes.md.
"""

import logging
import time
from typing import Any

import httpx

from ..config import settings

log = logging.getLogger(__name__)


class CoreCaido(RuntimeError):
    """core no respondió o devolvió algo inesperado."""


def _invalidar() -> None:
    global _token, _expira_en
    _token, _expira_en = None, 0.0


#: Token de sesión y cuándo deja de servir (epoch en segundos).
_token: str | None = None
_expira_en: float = 0.0
#: Margen para no usar un token que expira mientras está en vuelo.
_MARGEN_S = 30

#: Tal cual la declara core en auth/sesion.service.ts.
COOKIE_SESION = "pulso_sesion"


async def _token_valido(cliente: httpx.AsyncClient) -> str | None:
    """Devuelve un token de sesión, renovándolo si hace falta. None si no hay
    contraseña configurada — core podría no tener el guard activo."""
    global _token, _expira_en

    if not settings.core_password:
        return None
    if _token and time.time() < _expira_en - _MARGEN_S:
        return _token

    res = await cliente.post(
        f"{settings.core_base_url.rstrip('/')}/auth/login",
        json={"password": settings.core_password},
    )
    if res.status_code >= 400:
        raise CoreCaido(f"core rechazó el login: {res.status_code}")

    # El token viene en la cookie, no en el cuerpo. El guard acepta Bearer.
    galleta = res.cookies.get(COOKIE_SESION)
    if not galleta:
        # Nombre de cookie distinto al esperado: mejor decirlo que fallar
        # después con un 401 sin explicación.
        nombres = ", ".join(res.cookies.keys()) or "ninguna"
        raise CoreCaido(f"el login no devolvió {COOKIE_SESION} (vinieron: {nombres})")

    _token = galleta
    # `expiraEn` viene en MILISEGUNDOS (core lo arma con Date.now()). Tratarlo
    # como segundos lo pone en el año 57000 y el token no se renovaría nunca.
    ms = float((res.json() or {}).get("expiraEn") or 0)
    _expira_en = ms / 1000 if ms else time.time() + 3600
    log.info("[voz] sesión con core renovada")
    return _token


async def _pedir(metodo: str, ruta: str, **kw: Any) -> dict[str, Any]:
    url = f"{settings.core_base_url.rstrip('/')}{ruta}"
    try:
        async with httpx.AsyncClient(timeout=settings.timeout_core_s) as c:
            token = await _token_valido(c)
            if token:
                kw.setdefault("headers", {})["Authorization"] = f"Bearer {token}"
            res = await c.request(metodo, url, **kw)

            # La sesión pudo vencer entre la comprobación y el request.
            # Un reintento con token fresco antes de darlo por perdido.
            if res.status_code == 401 and token:
                _invalidar()
                nuevo = await _token_valido(c)
                if nuevo:
                    kw["headers"]["Authorization"] = f"Bearer {nuevo}"
                    res = await c.request(metodo, url, **kw)
    except httpx.HTTPError as e:
        raise CoreCaido(f"core {ruta} inalcanzable: {e}") from e

    if res.status_code >= 400:
        raise CoreCaido(f"core {ruta} devolvió {res.status_code}: {res.text[:200]}")

    try:
        return res.json()
    except ValueError as e:
        raise CoreCaido(f"core {ruta} no devolvió JSON") from e


async def triage(texto: str, telefono: str) -> dict[str, Any]:
    """Dictado → caso, GUARDADO en el almacén de core.

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
    """Caso → ranking de sedes. core hace PostGIS + Mapbox + scoring."""
    return await _pedir("POST", "/match", json={"caso": caso, "limite": limite})


async def dispatch(caso_id: str, sede_codigo: str, canal: str = "whatsapp") -> dict[str, Any]:
    """Dispara el handshake con la sede."""
    return await _pedir(
        "POST",
        "/dispatch",
        json={"casoId": caso_id, "sedeCodigo": sede_codigo, "canal": canal},
    )


async def estado(caso_id: str) -> dict[str, Any]:
    """Estado vivo de un caso: handshakes, sede aceptada, etc."""
    return await _pedir("GET", "/estado", params={"casoId": caso_id})
