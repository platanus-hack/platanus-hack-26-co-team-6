"""Corre el corpus contra el parser y dice que paso y que no.

    uv run python -m evals.run                  # rama Claude (necesita API key)
    uv run python -m evals.run --heuristica     # la linea base, sin API
    uv run python -m evals.run --esfuerzo medium
    uv run python -m evals.run --filtro trampa  # solo dictados que digan "trampa"

La comparacion contra `--heuristica` es el punto: si la rama del LLM no gana
por mucho, no hay nada que defender en el pitch.
"""

import argparse
import asyncio
import statistics
import sys
import time

from app.config import settings
from app.triage import extraer_con_claude
from app.triage_heuristico import extraccion_heuristica

from .asserts import verificar
from .corpus import CORPUS, Dictado

VERDE, ROJO, GRIS, RESET = "\033[32m", "\033[31m", "\033[90m", "\033[0m"


async def _correr_uno(d: Dictado, usar_heuristica: bool) -> tuple[Dictado, list[str], float, str | None]:
    t0 = time.perf_counter()
    try:
        if usar_heuristica:
            extraccion = extraccion_heuristica(d.texto)
        else:
            extraccion = await extraer_con_claude(d.texto)
    except Exception as e:  # noqa: BLE001 — aca queremos ver cualquier fallo
        return d, [], (time.perf_counter() - t0) * 1000, f"{type(e).__name__}: {e}"
    return d, verificar(d, extraccion), (time.perf_counter() - t0) * 1000, None


async def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--heuristica", action="store_true", help="línea base sin LLM")
    p.add_argument("--esfuerzo", default=None, help="low | medium | high | xhigh | max")
    p.add_argument("--filtro", default=None, help="subcadena de la etiqueta")
    p.add_argument("--concurrencia", type=int, default=4)
    args = p.parse_args()

    if args.esfuerzo:
        settings.esfuerzo_triage = args.esfuerzo

    if not args.heuristica and not settings.anthropic_api_key:
        print(
            f"{ROJO}No hay ANTHROPIC_API_KEY.{RESET} Ponla en apps/backend/ai-core/.env "
            f"o corre con --heuristica para ver la línea base.",
            file=sys.stderr,
        )
        return 2

    corpus = CORPUS
    if args.filtro:
        f = args.filtro.lower()
        corpus = [d for d in corpus if f in d.etiqueta.lower() or f in d.por_que.lower()]
    if not corpus:
        print("El filtro no dejó ningún dictado.", file=sys.stderr)
        return 2

    motor = "heurística" if args.heuristica else f"{settings.modelo_triage} · effort={settings.esfuerzo_triage}"
    print(f"\n{len(corpus)} dictados · motor: {motor}\n")

    limite = asyncio.Semaphore(args.concurrencia)

    async def con_limite(d: Dictado):
        async with limite:
            return await _correr_uno(d, args.heuristica)

    resultados = await asyncio.gather(*(con_limite(d) for d in corpus))

    ok = 0
    latencias: list[float] = []
    for d, fallas, ms, error in resultados:
        latencias.append(ms)
        if error:
            print(f"{ROJO}💥 {d.etiqueta}{RESET}  {GRIS}{ms:.0f}ms{RESET}")
            print(f"     {error}")
        elif fallas:
            print(f"{ROJO}❌ {d.etiqueta}{RESET}  {GRIS}{ms:.0f}ms{RESET}")
            for f in fallas:
                print(f"     · {f}")
            print(f"     {GRIS}{d.por_que}{RESET}")
        else:
            ok += 1
            print(f"{VERDE}✅ {d.etiqueta}{RESET}  {GRIS}{ms:.0f}ms{RESET}")

    total = len(resultados)
    color = VERDE if ok == total else ROJO
    print(f"\n{color}{ok}/{total} dictados correctos{RESET}")
    print(
        f"latencia · mediana {statistics.median(latencias):.0f}ms · "
        f"máx {max(latencias):.0f}ms\n"
    )
    return 0 if ok == total else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
