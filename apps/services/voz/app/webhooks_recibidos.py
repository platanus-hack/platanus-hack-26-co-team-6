"""Idempotencia de los webhooks entrantes. El candado contra el doble traslado.

EL PROBLEMA
  Meta reintenta un webhook con backoff exponencial HASTA 7 DÍAS ante 4xx,
  5xx o timeout. Twilio y Telegram también reintentan. Un reintento sobre
  `registrar_caso` crea DOS casos y despacha DOS ambulancias al mismo
  paciente. Es el bug más caro del sistema.

POR QUÉ NO ALCANZA UN `set` EN MEMORIA
  Porque deja de existir justo en el escenario donde importa. Con dos
  instancias en Render, el reintento cae en la OTRA instancia — la que nunca
  vio el primer mensaje — y se procesa como si fuera nuevo. La deduplicación
  tiene que vivir donde las dos instancias la vean: en Postgres.

EL CANDADO ES EL INSERT
  `insert ... on conflict do nothing`. Quien gana el insert procesa; quien
  choca es un reintento. No hay ventana entre "consultar" y "marcar" porque
  no hay consulta: la unicidad de la llave primaria hace de mutex, y lo hace
  bien incluso con las dos instancias insertando en el mismo milisegundo.

DEGRADACIÓN (regla del repo)
  Sin `PULSO_WEBHOOK_DATABASE_URL` esto cae al `set` en memoria y LO DICE, en
  el log al arrancar y en `GET /listo`. Una instancia sola con memoria es
  bastante mejor que nada; lo que no se puede es fingir que está persistido.
  `GET /listo` responde `deduplicacion.modo` para no tener que adivinarlo.

  Si la base se cae en caliente, también degrada a memoria y grita. Rechazar
  el webhook porque Postgres no responde sería peor: del otro lado hay un
  paramédico con un paciente, y Meta reintentaría igual.
"""

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any, Literal

from .config import settings
from .metricas import contar

log = logging.getLogger(__name__)

Proveedor = Literal["whatsapp", "telegram", "twilio"]

try:  # psycopg es opcional: sin él, este servicio sigue arrancando en memoria.
    from psycopg.rows import dict_row
    from psycopg_pool import AsyncConnectionPool

    _HAY_PSYCOPG = True
except ImportError:  # pragma: no cover - solo si alguien recorta dependencias
    _HAY_PSYCOPG = False


@dataclass(frozen=True)
class Acuse:
    """Qué hacer con este mensaje."""

    #: True = ya lo atendimos antes. No lo proceses; responde `resultado`.
    duplicado: bool
    #: Lo que se anotó la primera vez. None si nunca se anotó nada.
    resultado: dict[str, Any] | None = None
    #: False = la decisión salió de memoria, no de la base. Se pierde al
    #: reiniciar y no la ve la otra instancia.
    persistido: bool = False


# ── Estado de respaldo, cuando no hay base ───────────────────────

_vistos: set[str] = set()
_resultados: dict[str, dict[str, Any]] = {}
#: Cota simple. El demo no necesita un LRU, y una cota es mejor que una fuga.
_MAX_VISTOS = 5000

_pool: Any = None
_lock = asyncio.Lock()
#: Se apagó por un fallo en caliente. No se vuelve a intentar en cada webhook:
#: un Postgres caído no puede convertirse en un timeout por mensaje.
_degradado = False


def hay_base() -> bool:
    return bool(settings.webhook_database_url) and _HAY_PSYCOPG and not _degradado


def modo() -> str:
    """Lo que `GET /listo` publica. Que se vea sin tener que adivinarlo."""
    if not settings.webhook_database_url:
        return "memoria (sin PULSO_WEBHOOK_DATABASE_URL)"
    if not _HAY_PSYCOPG:
        return "memoria (falta psycopg)"
    if _degradado:
        return "memoria (la base falló y degradé)"
    return "postgres"


async def _obtener_pool() -> Any:
    """Pool perezoso. Abrirlo al importar rompería el arranque sin base.

    ⚠️ LA PRIMERA CONEXIÓN CUESTA. Medido contra el Supabase de producción
       desde Bogotá: ~2 s para abrir el pool. El presupuesto que da Meta es de
       ~3 s, así que el PRIMER webhook después de cada arranque se lleva dos
       tercios — y en el plan free de Render, que duerme el servicio a los 15
       minutos, «el primer webhook después de arrancar» es el del demo.

       Con el pool caliente el costo desaparece. La mitigación es mantener el
       servicio despierto (un ping cada 10 min) o abrir el pool al arrancar en
       vez de al primer uso; lo segundo hace que un Postgres caído impida el
       arranque, que es la razón por la que se dejó perezoso.
    """
    global _pool
    if _pool is not None:
        return _pool
    async with _lock:
        if _pool is None:
            pool = AsyncConnectionPool(
                settings.webhook_database_url,
                min_size=0,
                max_size=4,
                # El webhook tiene 3 s de presupuesto TOTAL frente a Meta.
                # Esperar una conexión más que esto ya perdió la carrera.
                timeout=2.0,
                open=False,
                kwargs={"row_factory": dict_row},
            )
            await pool.open(wait=False)
            _pool = pool
    return _pool


def _degradar(e: Exception) -> None:
    global _degradado
    if not _degradado:
        _degradado = True
        log.error(
            "[voz] la base de deduplicación falló (%s). DEGRADO A MEMORIA: con "
            "más de una instancia, un reintento de Meta puede duplicar un "
            "traslado. Revisa PULSO_WEBHOOK_DATABASE_URL.",
            e,
        )


# ── La operación ─────────────────────────────────────────────────


async def reclamar(proveedor: Proveedor, id_externo: str) -> Acuse:
    """Intenta quedarse con este mensaje. `duplicado=True` → no lo proceses.

    Un `id_externo` vacío no se puede deduplicar: se deja pasar. Descartarlo
    sería peor — un mensaje sin id sigue siendo una emergencia.
    """
    if not id_externo:
        log.warning("[voz] webhook de %s sin id externo: no puedo deduplicarlo", proveedor)
        return Acuse(duplicado=False)

    if hay_base():
        try:
            return await _reclamar_en_base(proveedor, id_externo)
        except Exception as e:  # noqa: BLE001 - cualquier fallo degrada, no tumba
            _degradar(e)

    return _reclamar_en_memoria(proveedor, id_externo)


async def anotar_resultado(
    proveedor: Proveedor, id_externo: str, resultado: dict[str, Any]
) -> None:
    """Deja constancia de qué pasó, para responderle lo mismo al reintento.

    ⚠️ SIN PII. Aquí no entra el dictado ni las coordenadas del paciente: esta
       fila la lee cualquiera que administre la base. Un `caso_id` sí, que es
       un identificador opaco.
    """
    if not id_externo:
        return

    if hay_base():
        try:
            pool = await _obtener_pool()
            async with pool.connection() as cx:
                await cx.execute(
                    "update webhook_recibido set resultado = %s "
                    "where proveedor = %s and id_externo = %s",
                    (_json(resultado), proveedor, id_externo),
                )
            return
        except Exception as e:  # noqa: BLE001
            _degradar(e)

    _resultados[_clave(proveedor, id_externo)] = resultado


async def _reclamar_en_base(proveedor: str, id_externo: str) -> Acuse:
    pool = await _obtener_pool()
    async with pool.connection() as cx:
        cur = await cx.execute(
            "insert into webhook_recibido (proveedor, id_externo) values (%s, %s) "
            "on conflict do nothing",
            (proveedor, id_externo),
        )
        if cur.rowcount:
            contar("pulso_webhook_recibidos_total", proveedor=proveedor)
            return Acuse(duplicado=False, persistido=True)

        # rowcount == 0: alguien llegó primero. Es un reintento.
        cur = await cx.execute(
            "select resultado from webhook_recibido "
            "where proveedor = %s and id_externo = %s",
            (proveedor, id_externo),
        )
        fila = await cur.fetchone()

    contar("pulso_webhook_duplicados_total", proveedor=proveedor)
    log.info("[voz] reintento de %s %s: ya estaba atendido", proveedor, id_externo)
    return Acuse(
        duplicado=True,
        resultado=(fila or {}).get("resultado"),
        persistido=True,
    )


def _reclamar_en_memoria(proveedor: str, id_externo: str) -> Acuse:
    clave = _clave(proveedor, id_externo)
    if clave in _vistos:
        contar("pulso_webhook_duplicados_total", proveedor=proveedor)
        log.info("[voz] reintento de %s %s: ya estaba atendido", proveedor, id_externo)
        return Acuse(duplicado=True, resultado=_resultados.get(clave))

    if len(_vistos) >= _MAX_VISTOS:
        _vistos.clear()
        _resultados.clear()
    _vistos.add(clave)
    contar("pulso_webhook_recibidos_total", proveedor=proveedor)
    return Acuse(duplicado=False)


def _clave(proveedor: str, id_externo: str) -> str:
    """Un `wamid` y un `CallSid` no comparten espacio de nombres."""
    return f"{proveedor}:{id_externo}"


def _json(valor: dict[str, Any]) -> str:
    return json.dumps(valor, ensure_ascii=False)


def reiniciar() -> None:
    """Sólo para tests y para dejar limpio antes del pitch."""
    global _degradado
    _vistos.clear()
    _resultados.clear()
    _degradado = False


async def cerrar() -> None:
    """Cierra el pool al apagar el servicio."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
