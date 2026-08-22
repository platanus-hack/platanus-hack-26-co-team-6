"""La deduplicación contra un Postgres de verdad.

SE SALTA sin `PULSO_TEST_DATABASE_URL`, igual que `postgres-routing.store.spec.ts`
en core. La lógica se prueba sin base en `test_deduplicacion.py`; lo que SOLO
se puede probar aquí es lo que el motor garantiza y un mock no: que dos
instancias insertando el mismo `wamid` a la vez produzcan un ganador y un
perdedor, no dos ganadores.

    createdb pulso_test
    PULSO_TEST_DATABASE_URL=postgresql://localhost/pulso_test uv run pytest
"""

import asyncio
import os
from pathlib import Path

import pytest

from app import metricas, webhooks_recibidos
from app.config import settings

URL = os.environ.get("PULSO_TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not URL, reason="sin PULSO_TEST_DATABASE_URL no hay base contra la cual probar"
)

MIGRACION = (
    Path(__file__).resolve().parents[4]
    / "supabase"
    / "migrations"
    / "0003_webhook_recibido.sql"
)


@pytest.fixture(autouse=True)
async def base(monkeypatch):
    import psycopg

    sql = MIGRACION.read_text(encoding="utf-8")
    async with await psycopg.AsyncConnection.connect(URL, autocommit=True) as cx:
        await cx.execute("drop table if exists webhook_recibido")
        # Las líneas de RLS son de Supabase: sin los roles `anon` y
        # `authenticated` un Postgres pelado se queja. Se aplican aparte y se
        # tolera el fallo — lo que se está probando aquí es el candado.
        for sentencia in _sin_supabase(sql):
            await cx.execute(sentencia)

    monkeypatch.setattr(settings, "webhook_database_url", URL)
    webhooks_recibidos.reiniciar()
    metricas.reiniciar()
    yield
    await webhooks_recibidos.cerrar()


def _sin_supabase(sql: str) -> list[str]:
    return [
        s
        for s in sql.split(";")
        if s.strip() and "anon" not in s and "authenticated" not in s
    ]


async def test_el_mismo_wamid_solo_lo_gana_uno():
    primera = await webhooks_recibidos.reclamar("whatsapp", "wamid.REAL")
    segunda = await webhooks_recibidos.reclamar("whatsapp", "wamid.REAL")

    assert (primera.duplicado, primera.persistido) == (False, True)
    assert (segunda.duplicado, segunda.persistido) == (True, True)


async def test_dos_instancias_a_la_vez_producen_un_ganador():
    # ESTE es el escenario que la memoria no cubría: dos procesos en Render
    # recibiendo el reintento de Meta en el mismo milisegundo.
    acuses = await asyncio.gather(
        *(webhooks_recibidos.reclamar("whatsapp", "wamid.CARRERA") for _ in range(8))
    )
    ganadores = [a for a in acuses if not a.duplicado]
    assert len(ganadores) == 1
    assert all(a.persistido for a in acuses)


async def test_el_resultado_anotado_se_le_devuelve_al_reintento():
    await webhooks_recibidos.reclamar("whatsapp", "wamid.ANOTA")
    await webhooks_recibidos.anotar_resultado(
        "whatsapp", "wamid.ANOTA", {"estado": "procesado", "accion": "registrar_caso"}
    )

    acuse = await webhooks_recibidos.reclamar("whatsapp", "wamid.ANOTA")
    assert acuse.resultado == {"estado": "procesado", "accion": "registrar_caso"}


async def test_proveedores_distintos_con_el_mismo_id_conviven():
    a = await webhooks_recibidos.reclamar("whatsapp", "IGUAL")
    b = await webhooks_recibidos.reclamar("twilio", "IGUAL")
    assert (a.duplicado, b.duplicado) == (False, False)


async def test_un_proveedor_inventado_lo_rechaza_el_check():
    # El check de la tabla es la última red: si algún día alguien manda
    # "kapso" sin agregarlo al check, se entera aquí y no en producción.
    with pytest.raises(Exception):
        await webhooks_recibidos._reclamar_en_base("inventado", "X")
