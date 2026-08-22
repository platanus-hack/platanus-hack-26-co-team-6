"""
El inventario de data/, declarado una sola vez.

Este archivo es la respuesta a "¿que tenemos y para que sirve?". Antes esa
respuesta vivia en la cabeza de quien descargo cada archivo; ahora vive aqui y
`catalogar.py` la publica en data/CATALOGO.md.

REGLA: si alguien agrega un archivo a data/, agrega su FUENTE aqui. Un archivo
sin declarar sale reportado como huerfano cuando corres `task datos`.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Fuente:
    id: str
    ruta: str
    """Que es, en una linea que se entienda sin abrir el archivo."""
    que_es: str
    """'bogota' | 'nacional' | 'referencia' — para que nadie asuma cobertura."""
    cobertura: str
    """'usable' | 'truncado' | 'metadato' — el estado real del archivo."""
    estado: str
    """Que artefacto de data/procesado/ alimenta. Vacio = no alimenta ninguno."""
    produce: tuple[str, ...] = ()
    notas: str = ""
    sep: str = ";"
    """True si el archivo trae codepages mezclados. Ver REPARACIONES_CP850."""
    reparar: bool = False


# ── Lo que de verdad mueve el producto ────────────────────────────

FUENTES: list[Fuente] = [
    Fuente(
        id="ips_urgencias",
        ruta="instituciones_emergencia/osb_ofertasrv-ips-urgencias.csv",
        que_es="84 IPS de Bogota con servicio de urgencias: coords, complejidad, subred, telefono.",
        cobertura="bogota",
        estado="usable",
        produce=("sedes.json",),
        notas=(
            "LA fuente del catalogo de sedes. Reemplaza las 14 semillas escritas a mano. "
            "Ojo: 2 filas traen lat/lng invertidas (Hospital de Usme, Centro de Salud "
            "Patio Bonito) y no trae codigo REPS — se cruza con ins.geojson para sacarlo."
        ),
    ),
    Fuente(
        id="ins_geojson",
        ruta="instituciones_salud/ins.geojson",
        que_es="2900 IPS de Bogota geolocalizadas, con codigo REPS, direccion, telefono y naturaleza.",
        cobertura="bogota",
        estado="usable",
        notas=(
            "Corte REPS jul-2020. YA NO ALIMENTA sedes.json: se uso para sacar el "
            "codigo y resulto ser el del PRESTADOR, no el de la sede — colapsaba 9 "
            "sedes en un codigo. Ese trabajo ahora lo hace reps_bogota/sedes.json. "
            "Se conserva porque es el unico universo geolocalizado de las 2900 IPS "
            "de Bogota, util si algun dia se sale de urgencias."
        ),
    ),
    Fuente(
        id="llamadas_123",
        ruta="llamadas_123/llamadas123.csv",
        que_es="9206 incidentes reales del 123 (jun-2026): localidad, tipo, prioridad, edad, sexo, hora.",
        cobertura="bogota",
        estado="usable",
        produce=("demanda.json", "casos-demo.json"),
        reparar=True,
        notas=(
            "La joya de la carpeta. Da la curva de demanda REAL por hora y dia, que "
            "contradice la curva inventada que tenia congestion.service.ts. Ademas "
            "PRIORIDAD_FINAL (Critica/Alta/Media/Baja) mapea a triage 1..4. "
            "OJO: trae cp850 y latin-1 MEZCLADOS en la misma linea; se lee con "
            "reparar=True. Sin eso, 'USAQUEN' y 'TORACICO' salen corruptos y las "
            "localidades no cruzan con las otras fuentes."
        ),
    ),
    Fuente(
        id="ocupacion_urgencias",
        ruta="ocupacion_urgencias/osb_ocupacion-urgencias.csv",
        que_es="Ocupacion mensual de urgencias por subred, 2021-2025. Llega a 219%.",
        cobertura="bogota",
        estado="usable",
        produce=("ocupacion.json", "sedes.json"),
        notas=(
            "El prior estructural de congestion, con numero citable. Cruza con las 84 "
            "IPS por Subred: los nombres calzan exacto entre las dos fuentes."
        ),
    ),
    Fuente(
        id="transporte_especial",
        ruta="urgencias_ambulancias/transporte-especial-de-pacientes-01_07_2026.csv",
        que_es="225 prestadores de transporte asistencial con marca BASICO / MEDICALIZADO.",
        cobertura="bogota",
        estado="usable",
        produce=("ambulancias.json",),
        notas="Corte jul-2026. Da el universo TAB/TAM real por prestador.",
        sep=";",
    ),
    Fuente(
        id="codesystem_reps",
        ruta="CodeSystem-REPShealthcareServices.json",
        que_es="CodeSystem FHIR de MinSalud: 157 servicios de salud con su codigo REPS.",
        cobertura="referencia",
        estado="usable",
        produce=("servicios.json",),
        notas="Ya lo usa catalogo/servicios-reps.ts. Aqui se valida que los codigos existan.",
    ),

    # ── REPS de Bogota, descargado con el filtro correcto ─────────
    #
    # Reemplazan a los tres JSON truncados de mas abajo. Se bajaron con
    # $limit=50000 y $where del departamento — ver REDESCARGA en el README.

    Fuente(
        id="reps_sedes_bogota",
        ruta="reps_bogota/sedes.json",
        que_es="16181 sedes REPS de Bogota con su codigo de habilitacion de sede (PK real).",
        cobertura="bogota",
        estado="usable",
        produce=("sedes.json",),
        notas=(
            "El campo que importa es `codigohabilitacionsede`, de 12 digitos y "
            "UNICO (16181 de 16181). NO uses `codigoprestador`, de 10: una subred "
            "entera es un solo prestador con decenas de sedes, y usarlo colapsa "
            "9 sedes distintas en un mismo codigo. Cruza con las 84 de urgencias "
            "por nombre: 83 con match unico."
        ),
    ),
    Fuente(
        id="reps_ocupacion_bogota",
        ruta="reps_bogota/ocupacion.json",
        que_es="Ocupacion de capacidad instalada por sede, Bogota. 548 filas, corte 2022-11-30.",
        cobertura="bogota",
        estado="usable",
        produce=("sedes.json",),
        notas=(
            "La mejor fuente de camas que tenemos: trae total Y ocupadas por sede. "
            "UNA SOLA FECHA, 2022-11-30 — el registro 'diario' obligatorio se apago "
            "al terminar el mandato COVID. Eso no es un defecto del dato: es la "
            "evidencia de la tesis de PULSO, y va en la primera slide."
        ),
    ),
    Fuente(
        id="reps_capacidad_bogota",
        ruta="reps_bogota/capacidad.json",
        que_es="Capacidad instalada REPS de Bogota: 4647 filas (camas, salas, ambulancias, consultorios).",
        cobertura="bogota",
        estado="usable",
        produce=("sedes.json",),
        notas=(
            "Respaldo de camas para las sedes que no estan en el registro de "
            "ocupacion. Trae el total instalado, no la ocupacion. La PK se arma "
            "concatenando `c_digo_sede` (10) + `n_mero_sede` (2)."
        ),
    ),

    # ── Contexto: alimentan el pitch y los priors, no el ruteo ─────

    Fuente(
        id="tiempo_centro_medico",
        ruta="tiempo_promedio/osb_ofertasrv-mincentromedico.csv",
        que_es="Minutos promedio de desplazamiento al centro medico por localidad, 2017-2021.",
        cobertura="bogota",
        estado="usable",
        produce=("contexto.json",),
        notas="Baseline por localidad para comparar contra el ETA de PULSO.",
    ),
    Fuente(
        id="razon_camas",
        ruta="razon_camas/osb_tiporazoncamas.csv",
        que_es="Camas de Bogota por tipo y naturaleza (publica/privada), con tasa por habitante.",
        cobertura="bogota",
        estado="usable",
        produce=("contexto.json", "sedes.json"),
        notas=(
            "Distribucion de camas de TODA la ciudad, no por sede. Se usa como prior "
            "estructural para repartir camas por nivel de complejidad."
        ),
    ),
    Fuente(
        id="razon_ambulancias",
        ruta="razon_ambulancias/osb_tiporazonambulancias.csv",
        que_es="952 ambulancias en Bogota: 792 basicas, 236 medicalizadas. Tasa 1,20 por 10k hab.",
        cobertura="bogota",
        estado="usable",
        produce=("contexto.json",),
        notas="Numero de pitch: solo 236 TAM para 7,9 millones de personas.",
    ),

    # ── Rotas y ya reemplazadas ───────────────────────────────────
    #
    # Se conservan solo para que nadie las vuelva a usar por error. Sus
    # reemplazos correctos estan arriba, en reps_bogota/.

    Fuente(
        id="reps_ocupacion_nacional",
        ruta="uwc4-gvg3.json",
        que_es="Registro diario de ocupacion de capacidad instalada (REPS).",
        cobertura="nacional",
        estado="truncado",
        notas=(
            "INUTILIZABLE tal como esta. Son las primeras 1000 filas del tope por "
            "defecto de Socrata, ordenadas alfabeticamente: Antioquia (799), "
            "Barranquilla (166), Atlantico (30). CERO registros de Bogota. "
            "REEMPLAZADA por reps_bogota/ocupacion.json (548 filas, todas de Bogota). Se puede borrar."
        ),
    ),
    Fuente(
        id="reps_sedes_nacional",
        ruta="c36g-9fc2.json",
        que_es="Registro Especial de Prestadores y Sedes (REPS), directorio nacional.",
        cobertura="nacional",
        estado="truncado",
        notas=(
            "INUTILIZABLE tal como esta: 1000 filas, solo Medellin (933) y Leticia (67). "
            "CERO de Bogota. REEMPLAZADA por reps_bogota/sedes.json (16181 filas). Se puede borrar."
        ),
    ),
    Fuente(
        id="reps_capacidad_nacional",
        ruta="s2ru-bqt6.json",
        que_es="Capacidad instalada por grupo (camas, salas, ambulancias) del REPS.",
        cobertura="nacional",
        estado="truncado",
        notas=(
            "INUTILIZABLE tal como esta: 1000 filas, 2 registros de Bogota. "
            "REEMPLAZADA por reps_bogota/capacidad.json (4647 filas). Se puede borrar."
        ),
    ),

    # ── Metadatos: documentan a su vecino, no traen datos ─────────

    Fuente(
        id="meta_ips_urgencias",
        ruta="instituciones_emergencia/metadato-osb_ips-urgencias.csv",
        que_es="Ficha tecnica de osb_ofertasrv-ips-urgencias.csv.",
        cobertura="referencia",
        estado="metadato",
    ),
    Fuente(
        id="meta_ocupacion",
        ruta="ocupacion_urgencias/metadato_osb_ocupacion-urgencias.csv",
        que_es="Ficha tecnica de osb_ocupacion-urgencias.csv.",
        cobertura="referencia",
        estado="metadato",
    ),
    Fuente(
        id="meta_camas",
        ruta="razon_camas/metadato-osb_tiporazoncamas.csv",
        que_es="Ficha tecnica de osb_tiporazoncamas.csv.",
        cobertura="referencia",
        estado="metadato",
    ),
    Fuente(
        id="meta_ambulancias",
        ruta="razon_ambulancias/metadato-osb_tiporazonambulancias.csv",
        que_es="Ficha tecnica de osb_tiporazonambulancias.csv.",
        cobertura="referencia",
        estado="metadato",
    ),
    Fuente(
        id="meta_tiempo",
        ruta="tiempo_promedio/metadato_tiempocentrosalud.csv",
        que_es="Ficha tecnica de osb_ofertasrv-mincentromedico.csv.",
        cobertura="referencia",
        estado="metadato",
    ),
]


POR_ID = {f.id: f for f in FUENTES}


def ruta_de(id_fuente: str):
    """Ruta absoluta de una fuente declarada. Revienta si el id no existe."""
    from comun import DATOS

    return DATOS / POR_ID[id_fuente].ruta


def leer(id_fuente: str):
    """
    Lee una fuente con SU separador y SU reparacion de encoding.

    Usa siempre esto en vez de leer_csv(ruta) a pelo: es lo que garantiza que
    nadie vuelva a leer llamadas123.csv sin reparar el mojibake.
    """
    from comun import leer_csv

    f = POR_ID[id_fuente]
    return leer_csv(ruta_de(id_fuente), sep=f.sep, reparar=f.reparar)
