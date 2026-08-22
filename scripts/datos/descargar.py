"""
Descarga las fuentes REPS de Bogota desde datos.gov.co.

    task datos:descargar        (o: python scripts/datos/descargar.py)

Son 17 MB que NO se commitean: se reconstruyen con este comando en 15
segundos. Lo que si se commitea es lo derivado — data/procesado/ y los dos
archivos .generado.ts — asi que quien clona el repo compila y corre el demo
sin descargar nada. Esto solo hace falta para volver a correr el pipeline.

═══════════════════════════════════════════════════════════════════
 DOS TRAMPAS DE LA API DE SOCRATA
═══════════════════════════════════════════════════════════════════
 1. SIN $limit DEVUELVE 1000 FILAS Y NO AVISA.
    No es un error, no hay paginacion visible, no hay advertencia: te da mil
    filas ordenadas alfabeticamente y parece que ese es el dataset. Asi
    llegaron a data/ tres archivos de 2.4 MB con dos registros de Bogota.

 2. EL DEPARTAMENTO VA SIN PUNTO FINAL: 'Bogotá D.C'.
    Con 'Bogotá D.C.' el filtro devuelve cero filas, sin error, y parece que
    Bogota no tiene datos.

 Por eso este script verifica el conteo contra la API ANTES de escribir: si
 lo que llega no cuadra con lo que la API dice que hay, revienta en vez de
 dejar un archivo truncado con pinta de estar bien.
═══════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from comun import DATOS  # noqa: E402

BASE = "https://www.datos.gov.co/resource"
DESTINO = DATOS / "reps_bogota"
DEPTO = "Bogotá D.C"  # sin punto final — ver la cabecera
LIMITE = 50000
TIEMPO_MAXIMO = 300

# id de Socrata, campo por el que se filtra, nombre del archivo de salida.
FUENTES = [
    ("c36g-9fc2", "departamentoprestadordesc", "sedes.json",
     "Directorio REPS: da el codigohabilitacionsede, la PK unica de sede"),
    ("s2ru-bqt6", "departamento", "capacidad.json",
     "Capacidad instalada: camas por sede (respaldo)"),
    ("uwc4-gvg3", "departamento_sede_prestador", "ocupacion.json",
     "Ocupacion 2022-11-30: camas totales Y ocupadas por sede"),
]


def _pedir(url: str):
    with urllib.request.urlopen(url, timeout=TIEMPO_MAXIMO) as r:  # noqa: S310
        return json.loads(r.read().decode("utf-8"))


def _url(id_socrata: str, campo: str, **extra) -> str:
    params = {"$where": f"{campo}='{DEPTO}'", **extra}
    return f"{BASE}/{id_socrata}.json?" + urllib.parse.urlencode(params)


def main() -> int:
    DESTINO.mkdir(parents=True, exist_ok=True)
    print(f"\nDescargando REPS de Bogota -> {DESTINO.relative_to(DATOS.parent)}\n")

    for id_socrata, campo, nombre, para_que in FUENTES:
        print(f"  {nombre}")
        print(f"      {para_que}")

        try:
            # Cuantas filas dice la API que hay. Es la referencia contra la
            # que se valida lo que llegue.
            esperadas = int(
                list(_pedir(_url(id_socrata, campo, **{"$select": "count(*)"}))[0].values())[0]
            )
            if esperadas == 0:
                print(f"      FALLO: la API dice 0 filas para {campo}='{DEPTO}'.")
                print("      Revisa el nombre del campo o del departamento.")
                return 1

            datos = _pedir(_url(id_socrata, campo, **{"$limit": LIMITE}))
        except Exception as e:  # noqa: BLE001
            print(f"      FALLO: {type(e).__name__}: {e}")
            return 1

        if len(datos) != esperadas:
            print(f"      FALLO: llegaron {len(datos)} filas y la API dice {esperadas}.")
            if len(datos) == 1000:
                print("      1000 exactas = el tope por defecto de Socrata: falto $limit.")
            elif len(datos) >= LIMITE:
                print(f"      Se alcanzo LIMITE={LIMITE}. Subelo en este archivo.")
            return 1

        ruta = DESTINO / nombre
        ruta.write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")
        print(f"      {len(datos)} filas · {ruta.stat().st_size / 1024 / 1024:.1f} MB\n")

    print("  Listo. Ahora: task datos\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
