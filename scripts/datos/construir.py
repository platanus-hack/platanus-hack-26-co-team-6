"""
PULSO — pipeline de datos.

    python scripts/datos/construir.py

Lee data/ (crudo, jamas lo modifica) y escribe:

    data/CATALOGO.md            que hay en la carpeta y para que sirve
    data/procesado/*.json       artefactos tipados que consume la app
    data/procesado/reporte.json que salio de cada paso, con sus problemas

Y genera el codigo TypeScript que core importa:

    apps/backend/core/src/sedes/catalogo.generado.ts
    apps/backend/core/src/scoring/demanda.generada.ts
    apps/backend/core/src/afiliacion/ambulancias.generado.ts

Es idempotente: correlo las veces que quieras. Solo stdlib, sin pip install.
"""

from __future__ import annotations

import datetime as dt
import json
import sys
import traceback
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import catalogar  # noqa: E402
from comun import DATOS, RAIZ, SALIDA, escribir_json  # noqa: E402
from transformadores import casos, contexto, demanda, ocupacion, sedes  # noqa: E402

PASOS = [
    ("catalogo", "Inventario de data/", catalogar.construir),
    ("sedes", "84 IPS de urgencias -> sedes.json", sedes.construir),
    ("demanda", "9206 incidentes 123 -> demanda.json", demanda.construir),
    ("ocupacion", "Ocupacion por subred -> ocupacion.json", ocupacion.construir),
    ("casos", "Incidentes reales -> casos-demo.json", casos.construir),
    ("contexto", "Ambulancias, camas, tiempos -> contexto.json", contexto.construir),
]


# ── Generacion de TypeScript ──────────────────────────────────────

CABECERA = """/**
 * ARCHIVO GENERADO — no editar a mano.
 *
 * Lo produce `python scripts/datos/construir.py` a partir de data/.
 * Cualquier cambio aqui se pierde en la siguiente corrida. Si necesitas
 * cambiar el contenido, cambia la fuente o su transformador.
 *
 * Generado: {fecha}
 * Fuente:   {fuente}
 */
"""


def _ts_sedes() -> Path:
    """sedes.json -> un modulo TS tipado que core importa como cualquier otro."""
    datos = json.loads((SALIDA / "sedes.json").read_text(encoding="utf-8"))

    # Solo los campos del tipo Sede. Los de trazabilidad (subred, origenCodigo,
    # serviciosInferidos) se quedan en el JSON: sirven para auditar, no para el
    # ruteo, y meterlos aqui obligaria a tocar el contrato compartido.
    campos = (
        "codigo", "nombre", "direccion", "localidad", "coord",
        "naturaleza", "complejidad", "telefono", "servicios", "camas",
    )
    limpias = [{k: s[k] for k in campos} for s in datos]

    cuerpo = (
        CABECERA.format(
            fecha=dt.date.today().isoformat(),
            fuente=(
                "osb_ofertasrv-ips-urgencias.csv + reps_bogota/{sedes,capacidad,"
                "ocupacion}.json + osb_ocupacion-urgencias.csv"
            ),
        )
        + "\nimport type { Sede } from '../contracts/types';\n\n"
        + "/** 84 sedes de urgencias de Bogota. Ver data/CATALOGO.md. */\n"
        + "export const SEDES_CATALOGO: Sede[] = "
        + json.dumps(limpias, ensure_ascii=False, indent=2)
        + ";\n"
    )

    ruta = RAIZ / "apps/backend/core/src/sedes/catalogo.generado.ts"
    ruta.write_text(cuerpo, encoding="utf-8")
    return ruta


def _ts_demanda() -> Path:
    """demanda.json -> la curva horaria medida, lista para congestion.service.ts."""
    d = json.loads((SALIDA / "demanda.json").read_text(encoding="utf-8"))

    hora = {int(k): v for k, v in d["curvaHora"].items()}
    dia = d["factorDia"]

    cuerpo = (
        CABECERA.format(
            fecha=dt.date.today().isoformat(),
            fuente=f"llamadas123.csv — {d['incidentes']} incidentes, "
            f"{d['periodo']['desde']} a {d['periodo']['hasta']}",
        )
        + f"""
/**
 * Curva de demanda MEDIDA, no supuesta.
 *
 * {d["incidentes"]} incidentes reales del 123 entre {d["periodo"]["desde"]} y {d["periodo"]["hasta"]}.
 * Normalizada 0..1 sobre la hora pico ({d["horaPico"]}:00). Valle a las {d["horaValle"]}:00.
 */
export const CURVA_HORA: Record<number, number> = {json.dumps(hora, indent=2)};

/**
 * Factor por dia de semana, RELATIVO AL PROMEDIO (no al pico).
 *
 * Orbita 1.0: un dia flojo baja de 1, uno cargado sube. Se multiplica por la
 * curva horaria. Si aqui hubiera valores 0..1 normalizados al pico, multiplicar
 * encogeria la curva entera — que es un error facil de cometer y dificil de ver.
 */
export const CURVA_DIA: Record<string, number> = {json.dumps(dia, ensure_ascii=False, indent=2)};

/** Domingo=0, para calzar con Date.getDay(). */
export const CURVA_DIA_POR_INDICE: Record<number, number> = {{
  0: CURVA_DIA['domingo'],
  1: CURVA_DIA['lunes'],
  2: CURVA_DIA['martes'],
  3: CURVA_DIA['miercoles'],
  4: CURVA_DIA['jueves'],
  5: CURVA_DIA['viernes'],
  6: CURVA_DIA['sabado'],
}};

export const DEMANDA_META = {{
  incidentes: {d["incidentes"]},
  desde: '{d["periodo"]["desde"]}',
  hasta: '{d["periodo"]["hasta"]}',
  horaPico: {d["horaPico"]},
  horaValle: {d["horaValle"]},
}} as const;
"""
    )

    ruta = RAIZ / "apps/backend/core/src/scoring/demanda.generada.ts"
    ruta.write_text(cuerpo, encoding="utf-8")
    return ruta


# Cuantos casos reales viajan al bundle del navegador. casos-demo.json tiene
# 400 y pesa 197 KB: no hay razon para mandarlos todos a un telefono. Con 8 por
# nivel de triage alcanza para que nadie vea el mismo dos veces en un demo.
CASOS_POR_TRIAGE = 8


def _ts_casos_reales() -> Path:
    """
    casos-demo.json -> un modulo delgado para el selector de /campo.

    NO reemplaza a DICTADOS_DEMO. Los tres dictados escritos a mano son
    clinicamente ricos (supra ST en DII-DIII-aVF, Glasgow 9, afasia de
    expresion) y estan hechos para lucir el parser: esos son el guion.

    Estos otros prueban algo distinto y que el guion no puede probar: que el
    sistema come la mezcla REAL de patologias de Bogota, no cuatro casos
    escogidos para quedar bonitos. Cuando el jurado pregunte "¿y esto solo
    funciona con sus ejemplos?", la respuesta es tocar un boton y que salga el
    incidente CRU-00286112-26 del 1 de junio a las 00:40.
    """
    datos = json.loads((SALIDA / "casos-demo.json").read_text(encoding="utf-8"))

    por_nivel: dict[int, list] = {}
    for c in datos["casos"]:
        por_nivel.setdefault(c["triage"], []).append(c)

    escogidos = []
    for nivel in sorted(por_nivel):
        grupo = por_nivel[nivel]
        # Repartidos a lo largo del grupo para no llevarnos solo una hora ni
        # una sola localidad.
        paso = max(1, len(grupo) // CASOS_POR_TRIAGE)
        escogidos.extend(grupo[::paso][:CASOS_POR_TRIAGE])

    campos = ("incidente", "texto", "triage", "localidad", "fecha", "origen")
    limpios = [{k: c.get(k) for k in campos} for c in escogidos]

    cuerpo = (
        CABECERA.format(
            fecha=dt.date.today().isoformat(),
            fuente=f"llamadas123.csv — {datos['total']} incidentes reales, muestra estratificada",
        )
        + """
/** Un incidente real del 123. El `texto` es plantilla; el resto es el dato. */
export interface CasoReal {
  /** Numero de incidente del CRUE. Se pinta: es lo que lo hace verificable. */
  incidente: string;
  texto: string;
  triage: number;
  localidad: string | null;
  fecha: string;
  origen: { lat: number; lng: number } | null;
}

/**
 * Muestra estratificada de incidentes reales del 123 de Bogota.
 *
 * ⚠️ Los campos del incidente son REALES: tipo, prioridad, edad, sexo,
 *    localidad y hora salen del dato publicado. El campo `texto` es una
 *    plantilla armada con esos campos, porque el 123 no publica la narrativa
 *    clinica — seria dato personal de salud. Si alguien pregunta, esa es la
 *    respuesta exacta.
 */
export const CASOS_REALES: CasoReal[] = """
        + json.dumps(limpios, ensure_ascii=False, indent=2)
        + ";\n"
    )

    ruta = RAIZ / "apps/frontend/lib/casos-reales.generado.ts"
    ruta.write_text(cuerpo, encoding="utf-8")
    return ruta


def _ts_ambulancias() -> Path:
    """
    ambulancias.json -> el catalogo contra el que se autoverifica un operador.

    Es la tarea 2.9. Hasta hoy estos 225 prestadores estaban en
    data/procesado/ y no los consumia NADIE — el universo real de transporte
    asistencial de Bogota, con la marca TAB/TAM del corte oficial, sin usar.

    Mismo patron que _ts_sedes(): un modulo TS tipado que core importa como
    cualquier otro, para que la autoverificacion funcione sin base de datos.

    ⚠️ ESTA FUENTE NO TRAE NIT. El plan de la tarea dice "cruce por NIT si
       esta, y por nombre si no": el "si esta" nunca se cumple con este CSV.
       El cruce es siempre por nombre normalizado. Se emite `nit: null` en vez
       de omitir el campo para que se vea que falta y no que se olvido.
    """
    datos = json.loads((SALIDA / "ambulancias.json").read_text(encoding="utf-8"))
    prestadores = [
        {
            "prestador": p["prestador"],
            "sede": p["sede"],
            "direccion": p["direccion"],
            "telefono": p["telefono"] or None,
            "correo": p["email"] or None,
            "nit": None,
            "basico": p["basico"],
            "medicalizado": p["medicalizado"],
            "urgencias": p["urgencias"],
        }
        for p in datos["prestadores"]
    ]

    cuerpo = (
        CABECERA.format(
            fecha=dt.date.today().isoformat(),
            fuente=datos["fuente"],
        )
        + """
/** Un prestador de transporte asistencial del corte de la Secretaria. */
export interface PrestadorAmbulancia {
  prestador: string;
  sede: string;
  direccion: string;
  telefono: string | null;
  correo: string | null;
  /**
   * SIEMPRE null: el CSV de transporte asistencial no publica NIT.
   *
   * El campo existe para que el dia que la fuente lo traiga, el cruce por
   * NIT de `ambulancias.ts` se encienda sin tocar una linea. Hoy el cruce
   * es por nombre normalizado, y eso esta declarado.
   */
  nit: string | null;
  /** TAB — Transporte Asistencial Basico. */
  basico: boolean;
  /** TAM — Transporte Asistencial Medicalizado. */
  medicalizado: boolean;
  /** El prestador declara ademas servicio de urgencias en el mismo corte. */
  urgencias: boolean;
}

/**
 * """
        + f"{datos['total']} prestadores de transporte asistencial de Bogota "
        + f"({datos['conBasico']} TAB, {datos['conMedicalizado']} TAM)."
        + """
 *
 * Ver data/CATALOGO.md. Los nombres vienen en MAYUSCULAS SIN TILDES y con
 * `utf-8-sig`: normalizar antes de comparar o no cruza nada.
 */
export const AMBULANCIAS_CATALOGO: PrestadorAmbulancia[] = """
        + json.dumps(prestadores, ensure_ascii=False, indent=2)
        + ";\n"
    )

    ruta = RAIZ / "apps/backend/core/src/afiliacion/ambulancias.generado.ts"
    ruta.write_text(cuerpo, encoding="utf-8")
    return ruta


# ── Orquestacion ────────────────────────────────────────────


def _faltan_descargas() -> list[str]:
    """
    Las fuentes REPS no van al repo: 17 MB reproducibles con un comando.

    Se comprueba ANTES de empezar. Sin esto el pipeline corre cinco pasos, dos
    minutos, y falla al final con un FileNotFoundError que no le dice a nadie
    que lo que hay que hacer es descargar.
    """
    return [
        n
        for n in ("sedes.json", "capacidad.json", "ocupacion.json")
        if not (DATOS / "reps_bogota" / n).exists()
    ]


def main() -> int:
    print("\nPULSO · pipeline de datos\n")

    faltan = _faltan_descargas()
    if faltan:
        print(f"  Faltan las fuentes REPS de Bogota: {', '.join(faltan)}")
        print("  No estan en el repo a proposito: son 17 MB reproducibles.\n")
        print("      task datos:descargar")
        print("      (o: python scripts/datos/descargar.py)\n")
        return 1

    reporte, fallidos = {}, []

    for clave, titulo, fn in PASOS:
        print(f"  {titulo}")
        try:
            reporte[clave] = fn()
            for k, v in (reporte[clave] or {}).items():
                if k == "medidas":
                    continue
                if isinstance(v, list) and len(v) > 4:
                    v = f"{len(v)} elementos: {v[:3]} ..."
                print(f"      {k}: {v}")
        except Exception as e:  # noqa: BLE001
            fallidos.append(clave)
            reporte[clave] = {"error": f"{type(e).__name__}: {e}"}
            print(f"      FALLO: {e}")
            traceback.print_exc(limit=2)
        print()

    if not fallidos:
        print("  Generando TypeScript para core")
        for ruta in (_ts_sedes(), _ts_demanda(), _ts_casos_reales(), _ts_ambulancias()):
            print(f"      {ruta.relative_to(RAIZ)}")
        print()

    reporte["_generado"] = dt.datetime.now().isoformat(timespec="seconds")
    reporte["_fallidos"] = fallidos
    escribir_json("reporte.json", reporte)

    if fallidos:
        print(f"  {len(fallidos)} paso(s) fallaron: {', '.join(fallidos)}\n")
        return 1

    print("  Listo. Ver data/CATALOGO.md y data/procesado/reporte.json\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
