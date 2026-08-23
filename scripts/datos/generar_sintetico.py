"""
PULSO — generador del turno de noche sintetico.

    python3 scripts/datos/generar_sintetico.py

Escribe:

    data/sintetico/*.csv                         el turno completo, 19:00 -> 07:00
    data/sintetico/README.md                     columnas, unidades y la advertencia
    apps/backend/core/src/semillas-demo/catalogo-demo.generado.ts
    supabase/seeds/0001_demo_sintetico.sql

POR QUE EXISTE
    Las consolas se ven vacias porque el estado vive en un Map en RAM que
    arranca en cero. Un demo sin casos no demuestra ranking, ni rebotes, ni
    escalamiento al CRUE: demuestra un formulario. Esto llena las vistas.

QUE ES REAL Y QUE NO
    REAL       las sedes, sus codigos REPS de 12 digitos, direcciones,
               localidades, coordenadas, complejidad y camas — salen de
               data/procesado/sedes.json, que es el REPS de Bogota.
               La curva horaria y el reparto por localidad salen de
               data/procesado/demanda.json (9206 incidentes del 123).
               La ocupacion por subred sale de data/procesado/ocupacion.json.
               Los operadores de ambulancia salen de ambulancias.json.
    SINTETICO  todo lo clinico y todo lo humano: pacientes, dictados,
               respuestas de los hospitales, actores, telefonos, mensajes.
               Ni un dato de una persona real. Ver data/sintetico/README.md.

DETERMINISTA A PROPOSITO
    Semilla fija. Un demo que cambia en cada corrida no se puede ensayar: el
    presentador tiene que poder decir "miren el caso de las 23:40" y que este
    ahi. Correlo dos veces y los CSV salen byte a byte iguales.

Solo stdlib, igual que construir.py: esto corre en la maquina de cualquiera.
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import math
import random
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
PROCESADO = RAIZ / "data" / "procesado"
SALIDA = RAIZ / "data" / "sintetico"
SALIDA_TS = RAIZ / "apps" / "backend" / "core" / "src" / "semillas-demo"
SALIDA_SQL = RAIZ / "supabase" / "seeds"

# Una semilla, una fecha, un turno. Los tres fijos: el id de un caso se
# deriva de su indice, asi que "CAS-0042" es siempre el mismo paciente.
SEMILLA = 20260822
TZ = "-05:00"  # Bogota no tiene horario de verano; el offset es constante.
NOCHE = dt.date(2026, 8, 22)  # sabado: el factorDia del 123 pone el pico aqui
HORAS_TURNO = [19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6]
TOTAL_CASOS = 120

rnd = random.Random(SEMILLA)


# ── Utilidades ────────────────────────────────────────────────────


def sin_tildes(t: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn"
    ).upper()


def ts(hora: int, minuto: int, segundo: int = 0, dia_extra: int = 0) -> str:
    """ISO 8601 con offset de Bogota. Las horas 0..6 caen al dia siguiente."""
    dia = NOCHE + dt.timedelta(days=(1 if hora < 19 else 0) + dia_extra)
    return f"{dia.isoformat()}T{hora:02d}:{minuto:02d}:{segundo:02d}{TZ}"


def mas(iso: str, segundos: int) -> str:
    base = dt.datetime.fromisoformat(iso)
    return (base + dt.timedelta(seconds=segundos)).isoformat()


def haversine(a: dict, b: dict) -> float:
    r = 6371.0
    dlat = math.radians(b["lat"] - a["lat"])
    dlng = math.radians(b["lng"] - a["lng"])
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(a["lat"]))
        * math.cos(math.radians(b["lat"]))
        * math.sin(dlng / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(h))


def escribir_csv(nombre: str, cabecera: list[str], filas: list[list]) -> int:
    ruta = SALIDA / nombre
    # newline="" + lineterminator="\n": sin esto Windows mete \r\n y el
    # sha256sum de la verificacion deja de cuadrar entre maquinas.
    with ruta.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(cabecera)
        w.writerows(filas)
    return len(filas)


def sql_txt(v) -> str:
    if v is None or v == "":
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def sql_num(v) -> str:
    if v is None or v == "":
        return "null"
    return str(v)


# ── Fuentes reales ────────────────────────────────────────────────

SEDES = json.loads((PROCESADO / "sedes.json").read_text(encoding="utf-8"))
DEMANDA = json.loads((PROCESADO / "demanda.json").read_text(encoding="utf-8"))
OCUPACION = json.loads((PROCESADO / "ocupacion.json").read_text(encoding="utf-8"))
AMBULANCIAS = json.loads((PROCESADO / "ambulancias.json").read_text(encoding="utf-8"))
CASOS_DEMO = json.loads((PROCESADO / "casos-demo.json").read_text(encoding="utf-8"))

POR_CODIGO = {s["codigo"]: s for s in SEDES}

# Origenes por localidad: los centroides que casos-demo.json ya calculo desde
# el 123. Se reusan en vez de inventar coordenadas para que el punto del
# paciente caiga donde de verdad hay ciudad y no en un potrero.
ORIGENES: dict[str, list[dict]] = {}
for c in CASOS_DEMO["casos"]:
    ORIGENES.setdefault(sin_tildes(c["localidad"]), []).append(c["origen"])


# ── Protocolos clinicos ───────────────────────────────────────────
#
# El dx tiene que casar con el triage Y con los servicios: un IAM que no exige
# hemodinamia (743, NO 408 que es radioterapia) es un caso que el ranking
# resuelve mal y nadie lo nota en el demo.
#
# `plantillas` son dictados de radio, no prosa: entrecortados, con muletillas y
# las cifras dichas en voz alta. Los marcados `ambiguo` existen para que la
# confianza baja y la revision humana tengan con que demostrarse.

PROTOCOLOS = [
    {
        "clave": "iam",
        "dx": "I21.0",
        "desc": "Infarto agudo de miocardio con elevación del ST",
        "triage": 1,
        "servicios": [1102, 743, 110],
        "complejidad": "alta",
        "medico": True,
        "edades": (45, 84),
        "signos": ["Dolor precordial opresivo", "Diaforesis", "Hipotensión", "ST elevado en DII-DIII"],
        "plantillas": [
            "central, {sexo_txt} de unos {edad} y tantos, dolor precordial opresivo irradiado a brazo izquierdo, veinte minutos, sudoroso, tensión noventa sobre sesenta, cambio",
            "reporto {sexo_txt} de {edad}, dolor de pecho desde hace media hora, se ve pálido, frío, tensión ochenta y cinco sobre cincuenta, requiere hemodinamia, cambio",
        ],
    },
    {
        "clave": "acv",
        "dx": "I63.9",
        "desc": "Accidente cerebrovascular isquémico agudo",
        "triage": 1,
        "servicios": [1102, 110, 744],
        "complejidad": "alta",
        "medico": True,
        "edades": (55, 90),
        "signos": ["Hemiparesia derecha", "Afasia", "Inicio hace 40 minutos", "Glasgow 13"],
        "plantillas": [
            "{sexo_txt} de {edad}, la familia dice que empezó hace cuarenta minutos, no mueve el lado derecho y no habla claro, glasgow trece, vamos con ventana, cambio",
            "posible ACV, {sexo_txt} de {edad}, boca desviada, debilidad en brazo derecho, inicio de síntomas siete y media, necesita tomografía ya",
        ],
    },
    {
        "clave": "trauma",
        "dx": "T07",
        "desc": "Politraumatismo grave",
        "triage": 1,
        "servicios": [1102, 110, 203],
        "complejidad": "alta",
        "medico": True,
        "edades": (18, 60),
        "signos": ["Trauma cerrado de tórax", "Fractura de fémur abierta", "Taquicardia 130", "Glasgow 12"],
        "plantillas": [
            "accidente de moto en la {via}, {sexo_txt} de {edad}, politrauma, fémur abierto, tórax con crepitación, frecuencia ciento treinta, glasgow doce, cambio",
            "atropellado, {sexo_txt} de {edad}, trauma cerrado de tórax y abdomen, tensión ochenta sobre cuarenta, va inestable, necesitamos cirugía y UCI",
        ],
    },
    {
        "clave": "tec",
        "dx": "S06.5",
        "desc": "Trauma craneoencefálico severo con hematoma subdural",
        "triage": 1,
        "servicios": [1102, 110, 245],
        "complejidad": "alta",
        "medico": True,
        "edades": (20, 75),
        "signos": ["Glasgow 7", "Anisocoria", "Vómito en proyectil", "Intubado en escena"],
        "plantillas": [
            "TEC severo, {sexo_txt} de {edad}, caída de altura, glasgow siete, pupila derecha midriática, ya intubamos, requiere neurocirugía, cambio",
            "{sexo_txt} de {edad}, golpe en la cabeza, deterioro progresivo, glasgow ocho, anisocoria, vamos con TAM, cambio",
        ],
    },
    {
        "clave": "herida",
        "dx": "S31.1",
        "desc": "Herida penetrante de abdomen",
        "triage": 1,
        "servicios": [1102, 203, 110],
        "complejidad": "alta",
        "medico": True,
        "edades": (18, 45),
        "signos": ["Herida penetrante en flanco izquierdo", "Abdomen en tabla", "Palidez", "Pulso filiforme"],
        "plantillas": [
            "herida penetrante en abdomen, {sexo_txt} de {edad}, sangrado activo, abdomen en tabla, tensión no la tomo, pulso filiforme, quirófano ya",
            "{sexo_txt} de {edad}, herida en flanco izquierdo, consciente pero pálido, taquicárdico, necesita cirugía general urgente",
        ],
    },
    {
        "clave": "sepsis",
        "dx": "A41.9",
        "desc": "Choque séptico de origen urinario",
        "triage": 2,
        "servicios": [1102, 110],
        "complejidad": "alta",
        "medico": True,
        "edades": (60, 92),
        "signos": ["Fiebre 39.2", "Hipotensión que no responde a líquidos", "Confusión", "Lactato alto"],
        "plantillas": [
            "{sexo_txt} de {edad}, fiebre alta tres días, hoy confundida, tensión ochenta sobre cincuenta, no levanta con líquidos, sospecho sepsis urinaria",
            "adulto mayor, {edad} años, decaimiento, fiebre, hipotenso, piel moteada, va para UCI probablemente, cambio",
        ],
    },
    {
        "clave": "asma",
        "dx": "J46",
        "desc": "Crisis asmática severa",
        "triage": 2,
        "servicios": [1102, 110],
        "complejidad": "media",
        "medico": False,
        "edades": (12, 55),
        "signos": ["Saturación 86%", "Sibilancias generalizadas", "Uso de músculos accesorios"],
        "plantillas": [
            "crisis asmática, {sexo_txt} de {edad}, satura ochenta y seis con oxígeno, sibilancias en todo el campo, ya lleva dos micronebulizaciones",
            "{sexo_txt} de {edad}, no puede completar frases, tiraje, satura ochenta y ocho, antecedente de asma, cambio",
        ],
    },
    {
        "clave": "obstetrico",
        "dx": "O14.1",
        "desc": "Preeclampsia severa",
        "triage": 2,
        "servicios": [1102, 320, 110],
        "complejidad": "alta",
        "medico": True,
        "edades": (16, 41),
        "sexo_fijo": "F",
        "signos": ["Tensión 170/110", "Cefalea y fosfenos", "Edema de miembros inferiores", "36 semanas"],
        "plantillas": [
            "gestante de {edad}, treinta y seis semanas, tensión ciento setenta sobre ciento diez, cefalea y ve lucecitas, requiere ginecobstetricia, cambio",
            "materna de {edad} años, dolor en epigastrio, tensión alta, edema, sospecha de preeclampsia severa, cambio",
        ],
    },
    {
        "clave": "hda",
        "dx": "K92.2",
        "desc": "Hemorragia de vías digestivas altas",
        "triage": 2,
        "servicios": [1102, 203, 712],
        "complejidad": "media",
        "medico": False,
        "edades": (35, 80),
        "signos": ["Hematemesis", "Melenas de dos días", "Palidez mucocutánea"],
        "plantillas": [
            "{sexo_txt} de {edad}, vomitó sangre dos veces, deposiciones negras desde ayer, pálido, tensión cien sobre sesenta",
            "sangrado digestivo, {sexo_txt} de {edad}, hematemesis en casa, consciente, taquicárdico, cambio",
        ],
    },
    {
        "clave": "abdomen",
        "dx": "K35.8",
        "desc": "Apendicitis aguda",
        "triage": 3,
        "servicios": [1102, 203],
        "complejidad": "media",
        "medico": False,
        "edades": (10, 45),
        "signos": ["Dolor en fosa ilíaca derecha", "Blumberg positivo", "Fiebre 38"],
        "plantillas": [
            "{sexo_txt} de {edad}, dolor abdominal desde ayer, ahora localizado en fosa ilíaca derecha, con fiebre, estable",
            "dolor abdominal, {sexo_txt} de {edad}, doce horas de evolución, defensa en cuadrante inferior derecho, signos vitales normales",
        ],
    },
    {
        "clave": "fractura",
        "dx": "S82.9",
        "desc": "Fractura cerrada de tibia",
        "triage": 3,
        "servicios": [1102, 744],
        "complejidad": "media",
        "medico": False,
        "edades": (15, 78),
        "signos": ["Deformidad de pierna izquierda", "Pulso distal presente", "Dolor 8/10"],
        "plantillas": [
            "caída en la vía, {sexo_txt} de {edad}, pierna izquierda deformada, pulso distal presente, dolor ocho de diez, inmovilizada",
            "{sexo_txt} de {edad}, trauma de miembro inferior, sospecha de fractura de tibia, estable, requiere radiología",
        ],
    },
    {
        "clave": "convulsion",
        "dx": "R56.8",
        "desc": "Crisis convulsiva",
        "triage": 3,
        "servicios": [1102, 744],
        "complejidad": "media",
        "medico": False,
        "edades": (5, 70),
        "signos": ["Convulsión tónico-clónica de 3 minutos", "Postictal", "Glasgow 14 al llegar"],
        "plantillas": [
            "convulsión en vía pública, {sexo_txt} de {edad}, duró unos tres minutos, ya cedió, está postictal, glasgow catorce",
            "{sexo_txt} de {edad}, episodio convulsivo, sin antecedente conocido, ahora somnoliento, estable",
        ],
    },
    {
        "clave": "bronquiolitis",
        "dx": "J21.9",
        "desc": "Bronquiolitis con dificultad respiratoria",
        "triage": 2,
        "servicios": [1102, 109],
        "complejidad": "alta",
        "medico": False,
        "edades": (0, 3),
        "signos": ["Saturación 89%", "Tiraje subcostal", "Rechazo de la vía oral"],
        "plantillas": [
            "lactante de {edad} años, dificultad respiratoria, satura ochenta y nueve, tiraje, no recibe seno, requiere pediatría",
            "menor de {edad} años, cuadro gripal de tres días, hoy respira rápido, tiraje subcostal, cambio",
        ],
    },
]

# Dictados a proposito confusos: ni el LLM ni la heuristica deberian salir de
# aqui con confianza alta, y esa es justamente la pantalla que queremos poder
# mostrar (revision humana antes de despachar).
DICTADOS_AMBIGUOS = [
    "central, tenemos un paciente aquí en la calle, no sabemos bien qué le pasó, está como raro, cambio",
    "señor mayor, lo encontró un vecino en el piso, no responde bien las preguntas, no hay familiar, cambio",
    "una señora dice que le duele todo desde ayer, no me sé la edad, se ve regular, cambio",
    "hay una persona aquí, parece que se cayó o lo empujaron, no está claro, sangra un poco de la cabeza",
    "paciente refiere malestar general, no precisa, tiene antecedentes pero no los recuerda, cambio",
]

MOTIVOS_RECHAZO = [
    "Sin camas UCI adultos",
    "Hemodinamia en procedimiento",
    "Sin especialista de turno",
    "Sala de reanimación ocupada",
    "Quirófano ocupado, tiempo estimado 90 minutos",
    "Urgencias en contingencia por sobreocupación",
    "Sin cupo en observación pediátrica",
    "Tomógrafo fuera de servicio",
]

VIAS = ["Avenida Boyacá", "Autopista Sur", "Calle 80", "Avenida Caracas", "Carrera Séptima", "Avenida Primero de Mayo", "NQS"]

# Nombres de fantasia. Ninguno corresponde a una persona: se arman combinando
# dos listas y se declara asi en data/sintetico/README.md.
NOMBRES = ["Aurelia", "Bernardo", "Cecilia", "Damián", "Elvira", "Fabián", "Gladys", "Horacio", "Irene", "Joaquín", "Karina", "Leonel", "Marcela", "Néstor", "Olga", "Prudencio", "Quintina", "Rosalba", "Saúl", "Teodora", "Ulises", "Vilma", "Wilmar", "Ximena", "Yolanda", "Zacarías"]
APELLIDOS = ["Aristizábal", "Bermúdez", "Cifuentes", "Dorado", "Escalante", "Fandiño", "Guarnizo", "Hurtado", "Izquierdo", "Jaramillo", "Lozano", "Mahecha", "Nempeque", "Ocampo", "Peñaloza", "Quiroga", "Rincón", "Sarmiento", "Tibaquirá", "Umaña", "Valbuena", "Yepes", "Zambrano"]


def nombre_fantasia(i: int) -> str:
    return f"{NOMBRES[i % len(NOMBRES)]} {APELLIDOS[(i * 7 + 3) % len(APELLIDOS)]}"


def telefono_ficticio(i: int) -> str:
    """
    Rango de ficcion 555-01xx sobre el indicativo de Bogota. No es asignable:
    ningun operador colombiano entrega estos numeros. Ver el README.
    """
    return f"+57160155501{i % 100:02d}"


# ── 1 · Estado declarado de cada sede ─────────────────────────────


def generar_sedes_estado() -> list[dict]:
    """
    Reparto ~55/30/10/5. No es aleatorio puro: las sedes de la subred con
    ocupacion real mas alta pesan hacia saturado, y las cuatro grandes de la
    noche (Kennedy, El Tunal, Simon Bolivar, Santa Clara) entran forzadas en
    saturado o contingencia. Un demo donde el ranking no tiene que trabajar no
    demuestra el ranking.
    """
    forzadas = {
        "110013029601": ("contingencia", "Sobreocupación de urgencias 281% — solo triage 1 con confirmación"),
        "110013029401": ("contingencia", "Sobreocupación de urgencias 281% — sin camas de observación"),
        "110013029101": ("saturado", "Ocupación 159% — recibe solo con aceptación explícita"),
        "110013028901": ("saturado", "Sala de reanimación ocupada, dos pacientes en espera de cama"),
        "110013029654": ("saturado", "Ocupación 138% — sin camas UCI adultos"),
    }
    motivos_saturado = [
        "Sin camas UCI adultos",
        "Urgencias por encima del 130% de su capacidad",
        "Espera en puerta mayor a 4 horas",
        "Sin especialista de turno en la noche",
    ]
    motivos_conting = [
        "Contingencia declarada por sobreocupación",
        "Falla de suministro de oxígeno en el piso 3",
        "Tomógrafo fuera de servicio hasta las 06:00",
    ]
    motivos_cerrado = [
        "Cierre temporal de urgencias por obra",
        "Cierre por brote intrahospitalario",
    ]

    filas = []
    for i, s in enumerate(SEDES):
        codigo = s["codigo"]
        if codigo in forzadas:
            estado, motivo = forzadas[codigo]
        else:
            # La ocupacion real de la subred inclina el dado. Es el unico
            # ingrediente no aleatorio del reparto y viene de ocupacion.json.
            ocup = s.get("ocupacionSubred") or 1.0
            sesgo = min(0.35, max(0.0, (ocup - 1.0) * 0.4))
            r = rnd.random() - sesgo
            if r < 0.55:
                estado, motivo = "recibiendo", ""
            elif r < 0.85:
                estado, motivo = "saturado", motivos_saturado[i % len(motivos_saturado)]
            elif r < 0.95:
                estado, motivo = "contingencia", motivos_conting[i % len(motivos_conting)]
            else:
                estado, motivo = "cerrado", motivos_cerrado[i % len(motivos_cerrado)]

        # La declaracion vence: una sede no queda "saturada para siempre"
        # porque alguien lo dijo a las siete de la noche.
        declarado = ts(19, rnd.randrange(0, 55), 0)
        vigencia = 0 if estado == "recibiendo" else rnd.choice([120, 180, 240, 360])
        filas.append(
            {
                "codigo_sede": codigo,
                "nombre_sede": s["nombre"],
                "localidad": s["localidad"] or "",
                "subred": s.get("subred") or "",
                "complejidad": s["complejidad"],
                "estado": estado,
                "motivo": motivo,
                "declarado_en": declarado,
                "vence_en": mas(declarado, vigencia * 60) if vigencia else "",
                "declarado_por": f"jefe_urgencias:{codigo}",
            }
        )
    return filas


# ── 2 · Camas ─────────────────────────────────────────────────────

FACTOR_OCUPACION = {
    "recibiendo": (0.55, 0.80),
    "saturado": (0.90, 1.00),
    "contingencia": (0.97, 1.00),
    "cerrado": (1.00, 1.00),
}


def generar_camas(estados: list[dict]) -> list[dict]:
    """
    Total = el instalado del REPS (real). Disponibles = lo que queda tras
    aplicar el factor del estado declarado. La coherencia con
    ocupacion.json ya viene dada porque el estado se derivo de ahi.
    """
    por_codigo = {e["codigo_sede"]: e for e in estados}
    filas = []
    for s in SEDES:
        est = por_codigo[s["codigo"]]["estado"]
        lo, hi = FACTOR_OCUPACION[est]
        for cama in s["camas"]:
            total = int(cama["total"])
            factor = rnd.uniform(lo, hi)
            ocupadas = min(total, int(round(total * factor)))
            filas.append(
                {
                    "codigo_sede": s["codigo"],
                    "tipo_cama": cama["tipo"],
                    "total": total,
                    "ocupadas": ocupadas,
                    "disponibles": total - ocupadas,
                    "ocupadas_snapshot_reps": int(cama["ocupadasSnapshot"]),
                    "medido_en": ts(19, 30, 0),
                }
            )
    return filas


# ── 3 · Casos y dictados ──────────────────────────────────────────


def reparto_horario() -> list[int]:
    """
    120 casos repartidos por la curva REAL del 123 restringida al turno. El
    reparto uniforme es lo que hace que un demo huela a inventado: a las 2 de
    la manana no pasa lo mismo que a las 21:00.
    """
    pesos = [DEMANDA["curvaHora"][str(h)] for h in HORAS_TURNO]
    total = sum(pesos)
    crudo = [TOTAL_CASOS * p / total for p in pesos]
    conteo = [int(x) for x in crudo]
    # El resto se reparte a las horas con mayor parte fraccionaria: sin esto se
    # pierden casos por truncamiento y el total deja de ser 120.
    resto = TOTAL_CASOS - sum(conteo)
    orden = sorted(range(len(crudo)), key=lambda i: (crudo[i] - conteo[i], -i), reverse=True)
    for i in orden[:resto]:
        conteo[i] += 1
    return conteo


LOCALIDADES = sorted(DEMANDA["porLocalidad"].items(), key=lambda kv: -kv[1])


def elegir_localidad() -> str:
    nombres = [sin_tildes(k) for k, _ in LOCALIDADES]
    pesos = [v for _, v in LOCALIDADES]
    return rnd.choices(nombres, weights=pesos, k=1)[0]


def generar_casos() -> tuple[list[dict], list[dict]]:
    conteo = reparto_horario()
    casos, dictados = [], []
    n = 0
    for hora, cuantos in zip(HORAS_TURNO, conteo):
        minutos = sorted(rnd.sample(range(0, 60), cuantos)) if cuantos <= 60 else sorted(rnd.choices(range(60), k=cuantos))
        for minuto in minutos:
            n += 1
            casos.append(_un_caso(n, hora, minuto, dictados))
    return casos, dictados


def _un_caso(n: int, hora: int, minuto: int, dictados: list[dict]) -> dict:
    proto = rnd.choice(PROTOCOLOS)
    loc = elegir_localidad()
    base = rnd.choice(ORIGENES.get(loc) or ORIGENES["KENNEDY"])
    origen = {
        # +-0.008 grados es ~900 m: mueve el punto dentro del barrio sin
        # sacarlo de la localidad ni de la caja de Bogota.
        "lat": round(base["lat"] + rnd.uniform(-0.008, 0.008), 6),
        "lng": round(base["lng"] + rnd.uniform(-0.008, 0.008), 6),
    }
    sexo = proto.get("sexo_fijo") or rnd.choice(["M", "F"])
    edad = rnd.randint(*proto["edades"])
    sexo_txt = "masculino" if sexo == "M" else "femenino"

    ambiguo = n % 10 == 7  # 12 de 120: suficiente para que la vista lo muestre
    if ambiguo:
        texto = DICTADOS_AMBIGUOS[n % len(DICTADOS_AMBIGUOS)]
        confianza = round(rnd.uniform(0.28, 0.47), 2)
        signos = ["Información insuficiente en el dictado"]
    else:
        texto = rnd.choice(proto["plantillas"]).format(
            sexo_txt=sexo_txt, edad=edad, via=rnd.choice(VIAS)
        )
        confianza = round(rnd.uniform(0.62, 0.96), 2)
        signos = rnd.sample(proto["signos"], k=min(3, len(proto["signos"])))

    creado = ts(hora, minuto, rnd.randrange(0, 60))
    caso_id = f"CAS-{n:04d}"
    movil = f"AMB-{((n * 3) % 40) + 1:03d}"

    dictados.append(
        {
            "caso_id": caso_id,
            "texto_crudo": texto,
            "canal": "whatsapp" if n % 3 else "consola",
            "duracion_s": len(texto) // 12 + 4,
            "ambiguo": "true" if ambiguo else "false",
            "confianza_declarada": confianza,
            "dictado_en": creado,
        }
    )

    return {
        "caso_id": caso_id,
        "creado_en": creado,
        "hora_turno": hora,
        "triage": proto["triage"],
        "dx_cie10": proto["dx"],
        "dx_descripcion": proto["desc"],
        "resumen": f"{'Hombre' if sexo == 'M' else 'Mujer'} de {edad} años, {proto['desc'].lower()}",
        "servicios_requeridos": " ".join(str(s) for s in proto["servicios"]),
        "complejidad_requerida": proto["complejidad"],
        "edad": edad,
        "sexo": sexo,
        "signos_alarma": " | ".join(signos),
        "requiere_medico_abordo": "true" if proto["medico"] else "false",
        "confianza": confianza,
        "tipo_movil": "TAM" if proto["medico"] else "TAB",
        "movil_id": movil,
        "localidad": loc,
        "origen_lat": origen["lat"],
        "origen_lng": origen["lng"],
        "telefono_reporta": telefono_ficticio(n),
        "protocolo": proto["clave"],
    }


# ── 4 · Handshakes y escalamientos ────────────────────────────────


def candidatas(caso: dict, estados: dict[str, str]) -> list[dict]:
    """Sedes que tienen TODOS los servicios exigidos, mas cerca primero."""
    req = {int(x) for x in caso["servicios_requeridos"].split()}
    origen = {"lat": caso["origen_lat"], "lng": caso["origen_lng"]}
    aptas = [s for s in SEDES if req.issubset(set(s["servicios"]))]
    if not aptas:  # ningun destino elegible: eso es un escalamiento, no un bug
        return []
    return sorted(aptas, key=lambda s: haversine(origen, s["coord"]))[:6]


def generar_handshakes(casos: list[dict], estados: list[dict]):
    est = {e["codigo_sede"]: e["estado"] for e in estados}
    handshakes, escalamientos = [], []
    hn = 0
    for i, caso in enumerate(casos):
        cands = candidatas(caso, est)
        if not cands:
            escalamientos.append(
                _escalamiento(len(escalamientos) + 1, caso, "sin-candidatos", [],
                              "El ranking no devolvió ninguna sede con los servicios exigidos")
            )
            continue

        # 25% rebota al menos una vez, 10% agota candidatos y sube al CRUE.
        suerte = (i * 37) % 100
        agota = suerte < 10
        rebota = agota or suerte < 40

        intentos = 1
        if agota:
            intentos = min(len(cands), rnd.randint(3, 4))
        elif rebota:
            intentos = min(len(cands), rnd.randint(2, 3))

        t = caso["creado_en"]
        # 40 s de triage + match antes del primer toque: el numero que el pitch
        # promete (< 90 s del dictado al hospital) tiene que verse en el dato.
        t = mas(t, rnd.randint(28, 52))
        intentadas = []
        for k in range(intentos):
            hn += 1
            sede = cands[k]
            ultimo = k == intentos - 1
            if ultimo and not agota:
                estado_h, motivo = "aceptado", ""
            else:
                # Un timeout de vez en cuando: el hospital que no contesta es
                # tan real como el que dice que no, y el vigilante lo vence.
                estado_h = "timeout" if (hn % 9 == 0) else "rechazado"
                motivo = "" if estado_h == "timeout" else MOTIVOS_RECHAZO[hn % len(MOTIVOS_RECHAZO)]
            latencia = 90 if estado_h == "timeout" else rnd.randint(9, 78)
            handshakes.append(
                {
                    "handshake_id": f"HSK-{hn:04d}",
                    "caso_id": caso["caso_id"],
                    "codigo_sede": sede["codigo"],
                    "nombre_sede": sede["nombre"],
                    "canal": "telegram" if k == 0 else rnd.choice(["telegram", "consola", "whatsapp"]),
                    "estado": estado_h,
                    "motivo_rechazo": motivo,
                    "enviado_en": t,
                    "expira_en": mas(t, 90),
                    "respondido_en": "" if estado_h == "timeout" else mas(t, latencia),
                    "latencia_s": "" if estado_h == "timeout" else latencia,
                    "eta_min_al_despachar": round(
                        haversine({"lat": caso["origen_lat"], "lng": caso["origen_lng"]}, sede["coord"]) / 0.38, 1
                    ),
                    "intento": k + 1,
                }
            )
            intentadas.append(sede["codigo"])
            t = mas(t, latencia + rnd.randint(4, 12))

        if agota:
            escalamientos.append(
                _escalamiento(len(escalamientos) + 1, caso, "candidatos-agotados", intentadas,
                              f"{len(intentadas)} sedes rechazaron o dejaron vencer la solicitud", t)
            )
        elif suerte == 41:
            # El paramedico sube el caso a mano. Es el tercer motivo del
            # contrato y sin un caso asi la consola del CRUE no lo muestra.
            escalamientos.append(
                _escalamiento(len(escalamientos) + 1, caso, "solicitud-paramedico", intentadas,
                              "La tripulación pidió regulación del CRUE desde /campo", t)
            )
    return handshakes, escalamientos


def _escalamiento(n, caso, motivo, intentadas, detalle, creado=None) -> dict:
    creado = creado or mas(caso["creado_en"], 45)
    # Dos de cada tres ya los tomo un regulador; el resto queda abierto para
    # que la consola del CRUE tenga cola de verdad al abrirla.
    atendido = n % 3 != 0
    return {
        "escalamiento_id": f"ESC-{n:03d}",
        "caso_id": caso["caso_id"],
        "motivo": motivo,
        "sedes_intentadas": " ".join(intentadas),
        "detalle": detalle,
        "creado_en": creado,
        "atendido_en": mas(creado, rnd.randint(45, 400)) if atendido else "",
        "atendido_por": f"regulador_crue:{nombre_fantasia(n + 11)}" if atendido else "",
    }


# ── 5 · Flota y rastro GPS ────────────────────────────────────────


def operadores_reales() -> list[dict]:
    """Prestadores con marca TAB/TAM reales del corte de la Secretaria."""
    tam = [p for p in AMBULANCIAS["prestadores"] if p["medicalizado"]][:12]
    tab = [p for p in AMBULANCIAS["prestadores"] if p["basico"]][:28]
    return tam + tab


def generar_moviles() -> list[dict]:
    ops = operadores_reales()
    filas = []
    for i in range(40):
        op = ops[i % len(ops)]
        tipo = "TAM" if i < 12 else "TAB"
        filas.append(
            {
                "movil_id": f"AMB-{i + 1:03d}",
                "tipo": tipo,
                "operador": op["prestador"],
                "placa": f"WGX{100 + i:03d}",  # placas de fantasia, no matriculadas
                "base_localidad": SEDES[(i * 5) % len(SEDES)]["localidad"] or "Kennedy",
                "tripulacion": nombre_fantasia(i) + " / " + nombre_fantasia(i + 13),
                "disponible": "true" if i % 4 else "false",
                "turno": "noche",
            }
        )
    return filas


def generar_posiciones(moviles: list[dict], casos: list[dict]) -> list[dict]:
    """
    15 puntos por movil a lo largo del turno. Se ancla en el origen de un caso
    del movil cuando lo hay: un rastro que no pasa por donde estuvo el paciente
    es un rastro que no cuadra con la linea de tiempo.
    """
    por_movil: dict[str, list[dict]] = {}
    for c in casos:
        por_movil.setdefault(c["movil_id"], []).append(c)

    filas = []
    for m in moviles:
        anclas = por_movil.get(m["movil_id"]) or []
        for k in range(15):
            hora = HORAS_TURNO[(k * 12 // 15) % len(HORAS_TURNO)]
            if anclas:
                a = anclas[k % len(anclas)]
                lat, lng = a["origen_lat"], a["origen_lng"]
            else:
                s = SEDES[(k * 7) % len(SEDES)]
                lat, lng = s["coord"]["lat"], s["coord"]["lng"]
            filas.append(
                {
                    "movil_id": m["movil_id"],
                    "lat": round(lat + rnd.uniform(-0.012, 0.012), 6),
                    "lng": round(lng + rnd.uniform(-0.012, 0.012), 6),
                    # En interiores el GPS del celular se va a cientos de
                    # metros. Sin este campo la posicion se lee como una
                    # certeza que no existe.
                    "precision_m": rnd.choice([8, 12, 18, 25, 40, 65, 120]),
                    "velocidad_kmh": rnd.choice([0, 0, 14, 22, 31, 45, 58]),
                    "disponible": m["disponible"],
                    "reportado_en": ts(hora, rnd.randrange(0, 60), rnd.randrange(0, 60)),
                }
            )
    return filas


# ── 6 · Linea de tiempo append-only ───────────────────────────────


def generar_eventos(casos, handshakes, escalamientos) -> list[dict]:
    """
    La vista forense (4.12) tiene que poder reconstruir el caso sin huecos:
    por eso cada handshake deja su evento y cada caso cierra su ciclo.
    Algunos eventos llevan `corrige_a`: una correccion no borra, apunta.
    """
    hs_por_caso: dict[str, list[dict]] = {}
    for h in handshakes:
        hs_por_caso.setdefault(h["caso_id"], []).append(h)
    esc_por_caso = {e["caso_id"]: e for e in escalamientos}

    filas: list[dict] = []
    n = 0

    def ev(caso_id, tipo, cuando, actor_id, actor_nombre, actor_tipo,
           detalle="", sede="", movil="", corrige=""):
        nonlocal n
        n += 1
        filas.append(
            {
                "evento_id": n,
                "caso_id": caso_id,
                "tipo": tipo,
                "ocurrido_en": cuando,
                "actor_id": actor_id,
                "actor_nombre": actor_nombre,
                "actor_tipo": actor_tipo,
                "codigo_sede": sede,
                "movil_id": movil,
                "detalle": detalle,
                "corrige_a": corrige,
            }
        )
        return n

    for i, caso in enumerate(casos):
        cid = caso["caso_id"]
        movil = caso["movil_id"]
        param = f"paramedico:{movil}"
        param_nombre = nombre_fantasia(i)

        # Quien creo el caso importa: 'svc:voz' es el webhook interpretando un
        # audio, y eso no es lo mismo que un humano escribiendolo.
        por_voz = i % 3 != 0
        ev(cid, "caso_creado", caso["creado_en"],
           "svc:voz" if por_voz else param,
           "voz (WhatsApp)" if por_voz else param_nombre,
           "servicio" if por_voz else "humano",
           f"triage {caso['triage']} · confianza {caso['confianza']}", movil=movil)

        if float(caso["confianza"]) < 0.5:
            ev(cid, "revision_humana", mas(caso["creado_en"], 22), param, param_nombre,
               "humano", "Confianza bajo el umbral: el paramédico confirmó el triage", movil=movil)

        hs = hs_por_caso.get(cid, [])
        if hs:
            ev(cid, "match_calculado", mas(caso["creado_en"], 12), "svc:match",
               "motor de ranking", "sistema",
               f"{len(hs)} candidatas evaluadas", movil=movil)

        for h in hs:
            ev(cid, "despachado", h["enviado_en"], param, param_nombre, "humano",
               f"canal {h['canal']} · ETA {h['eta_min_al_despachar']} min",
               sede=h["codigo_sede"], movil=movil)
            if h["estado"] == "aceptado":
                ev(cid, "aceptado", h["respondido_en"], f"jefe_urgencias:{h['codigo_sede']}",
                   nombre_fantasia(i + 5), "humano", "Traslado aceptado",
                   sede=h["codigo_sede"], movil=movil)
            elif h["estado"] == "rechazado":
                ev(cid, "rechazado", h["respondido_en"], f"jefe_urgencias:{h['codigo_sede']}",
                   nombre_fantasia(i + 5), "humano", h["motivo_rechazo"],
                   sede=h["codigo_sede"], movil=movil)
                ev(cid, "rerouteado", mas(h["respondido_en"], 6), "svc:vigilante",
                   "vigilante", "sistema", "Se pasa al siguiente candidato",
                   sede=h["codigo_sede"], movil=movil)
            else:
                ev(cid, "timeout", h["expira_en"], "svc:vigilante", "vigilante", "sistema",
                   "La solicitud venció sin respuesta", sede=h["codigo_sede"], movil=movil)

        esc = esc_por_caso.get(cid)
        if esc:
            ev(cid, "escalado", esc["creado_en"], "svc:vigilante", "vigilante", "sistema",
               esc["detalle"], movil=movil)
            if esc["atendido_en"]:
                ev(cid, "override_crue", esc["atendido_en"], "regulador_crue",
                   esc["atendido_por"].split(":")[-1], "humano",
                   "El regulador asignó destino por potestad de regulación", movil=movil)

        aceptado = next((h for h in hs if h["estado"] == "aceptado"), None)
        if aceptado:
            sede = aceptado["codigo_sede"]
            t_lleg = mas(aceptado["respondido_en"], rnd.randint(180, 540))
            ev(cid, "llegada_escena", mas(caso["creado_en"], rnd.randint(240, 720)),
               param, param_nombre, "humano", "", movil=movil)
            ev(cid, "salida_escena", mas(t_lleg, -60), param, param_nombre, "humano", "", movil=movil)
            id_puerta = ev(cid, "llegada_puerta", t_lleg, param, param_nombre, "humano",
                           "", sede=sede, movil=movil)
            # Una correccion de verdad, cada 17 casos: la hora de puerta se
            # confirma tarde y el mismo actor la corrige. La vista forense la
            # pinta como correccion, no como un segundo arribo.
            if i % 17 == 3:
                ev(cid, "llegada_puerta", mas(t_lleg, 300), param, param_nombre, "humano",
                   "Corrección de la hora de llegada a puerta", sede=sede, movil=movil,
                   corrige=id_puerta)
            ev(cid, "entrega", mas(t_lleg, rnd.randint(300, 1200)),
               f"jefe_urgencias:{sede}", nombre_fantasia(i + 5), "humano",
               "Paciente entregado en triage", sede=sede, movil=movil)
            ev(cid, "cerrado", mas(t_lleg, rnd.randint(1300, 2400)), "svc:core", "core",
               "sistema", "", sede=sede, movil=movil)
    return filas


# ── 7 · Mensajeria ────────────────────────────────────────────────


def generar_mensajes(casos, handshakes) -> list[dict]:
    filas = []
    n = 0
    for i, caso in enumerate(casos[:75]):
        n += 1
        tel = caso["telefono_reporta"]
        filas.append(
            {
                "wamid": f"wamid.DEMO{n:06d}",
                "proveedor": "whatsapp",
                "direccion": "entrada",
                "telefono": tel,
                "caso_id": caso["caso_id"],
                "cuerpo": "[audio 0:0{}] dictado del paramédico".format(n % 9 + 1),
                "ts": caso["creado_en"],
            }
        )
        n += 1
        acept = next((h for h in handshakes if h["caso_id"] == caso["caso_id"] and h["estado"] == "aceptado"), None)
        cuerpo = (
            f"PULSO · {caso['caso_id']}: {acept['nombre_sede']} ACEPTÓ. ETA {acept['eta_min_al_despachar']} min."
            if acept
            else f"PULSO · {caso['caso_id']}: sin aceptación aún, el caso pasó al CRUE."
        )
        filas.append(
            {
                "wamid": f"wamid.DEMO{n:06d}",
                "proveedor": "whatsapp",
                "direccion": "salida",
                "telefono": tel,
                "caso_id": caso["caso_id"],
                "cuerpo": cuerpo,
                "ts": mas(caso["creado_en"], 95),
            }
        )
    return filas


# ── 8 · Organizaciones y actores ──────────────────────────────────

ROLES = ["paramedico", "jefe_urgencias", "admin_organizacion", "regulador_crue", "auditor"]


def generar_organizaciones() -> list[dict]:
    filas = [
        {
            "organizacion_id": "ORG-000",
            "tipo": "crue",
            "razon_social": "Centro Regulador de Urgencias y Emergencias de Bogotá (demo)",
            "nombre_corto": "CRUE Bogotá",
            "nit": "900000000-0",
            "estado": "activa",
            "verificacion": "manual",
            "codigo_sede": "",
        }
    ]
    # 12 IPS: las de alta complejidad, que son las que el demo toca.
    altas = [s for s in SEDES if s["complejidad"] == "alta"][:12]
    for i, s in enumerate(altas):
        filas.append(
            {
                "organizacion_id": f"ORG-{i + 1:03d}",
                "tipo": "ips",
                "razon_social": s["nombre"],
                "nombre_corto": s["nombre"][:40],
                # NIT de fantasia con prefijo 9000 reservado en este set.
                "nit": f"9000{10000 + i}-{i % 10}",
                "estado": "activa",
                "verificacion": "reps_automatico",
                "codigo_sede": s["codigo"],
            }
        )
    # 7 operadores de ambulancia reales del corte de la Secretaria.
    for i, op in enumerate(operadores_reales()[:7]):
        filas.append(
            {
                "organizacion_id": f"ORG-{100 + i:03d}",
                "tipo": "operador_ambulancia",
                "razon_social": op["prestador"],
                "nombre_corto": op["prestador"][:40],
                "nit": f"9000{20000 + i}-{i % 10}",
                "estado": "activa",
                "verificacion": "manual",
                "codigo_sede": "",
            }
        )
    return filas


def generar_actores(orgs: list[dict]) -> list[dict]:
    filas = []
    n = 0
    for org in orgs:
        if org["tipo"] == "ips":
            roles = ["admin_organizacion", "jefe_urgencias", "jefe_urgencias", "auditor"]
        elif org["tipo"] == "crue":
            roles = ["admin_organizacion", "regulador_crue", "regulador_crue", "auditor"]
        else:
            roles = ["admin_organizacion", "paramedico", "paramedico", "paramedico"]
        for rol in roles:
            n += 1
            nom = nombre_fantasia(n)
            filas.append(
                {
                    "actor_id": f"ACT-{n:03d}",
                    "organizacion_id": org["organizacion_id"],
                    "tipo": "humano",
                    "nombre": nom,
                    # Dominio .invalid: reservado por RFC 2606, no resuelve
                    # nunca. Ningun correo de aqui puede llegarle a nadie.
                    "identificador": f"{sin_tildes(nom).lower().replace(' ', '.')}@demo.pulso.invalid",
                    "telefono": telefono_ficticio(n),
                    "rol": rol,
                    "codigo_sede": org["codigo_sede"] if rol == "jefe_urgencias" else "",
                    "activo": "true",
                }
            )
    # Los dos actores de servicio: la auditoria los distingue de un humano.
    for svc, org in (("svc:voz", "ORG-000"), ("svc:vigilante", "ORG-000")):
        n += 1
        filas.append(
            {
                "actor_id": f"ACT-{n:03d}",
                "organizacion_id": org,
                "tipo": "servicio",
                "nombre": svc,
                "identificador": svc,
                "telefono": "",
                "rol": "servicio",
                "codigo_sede": "",
                "activo": "true",
            }
        )
    return filas


# ── Salidas ───────────────────────────────────────────────────────

CABECERAS = {
    "sedes_estado.csv": ["codigo_sede", "nombre_sede", "localidad", "subred", "complejidad", "estado", "motivo", "declarado_en", "vence_en", "declarado_por"],
    "camas.csv": ["codigo_sede", "tipo_cama", "total", "ocupadas", "disponibles", "ocupadas_snapshot_reps", "medido_en"],
    "casos.csv": ["caso_id", "creado_en", "hora_turno", "triage", "dx_cie10", "dx_descripcion", "resumen", "servicios_requeridos", "complejidad_requerida", "edad", "sexo", "signos_alarma", "requiere_medico_abordo", "confianza", "tipo_movil", "movil_id", "localidad", "origen_lat", "origen_lng", "telefono_reporta", "protocolo"],
    "dictados.csv": ["caso_id", "texto_crudo", "canal", "duracion_s", "ambiguo", "confianza_declarada", "dictado_en"],
    "handshakes.csv": ["handshake_id", "caso_id", "codigo_sede", "nombre_sede", "canal", "estado", "motivo_rechazo", "enviado_en", "expira_en", "respondido_en", "latencia_s", "eta_min_al_despachar", "intento"],
    "eventos_caso.csv": ["evento_id", "caso_id", "tipo", "ocurrido_en", "actor_id", "actor_nombre", "actor_tipo", "codigo_sede", "movil_id", "detalle", "corrige_a"],
    "moviles.csv": ["movil_id", "tipo", "operador", "placa", "base_localidad", "tripulacion", "disponible", "turno"],
    "posiciones.csv": ["movil_id", "lat", "lng", "precision_m", "velocidad_kmh", "disponible", "reportado_en"],
    "mensajes.csv": ["wamid", "proveedor", "direccion", "telefono", "caso_id", "cuerpo", "ts"],
    "escalamientos.csv": ["escalamiento_id", "caso_id", "motivo", "sedes_intentadas", "detalle", "creado_en", "atendido_en", "atendido_por"],
    "organizaciones.csv": ["organizacion_id", "tipo", "razon_social", "nombre_corto", "nit", "estado", "verificacion", "codigo_sede"],
    "actores.csv": ["actor_id", "organizacion_id", "tipo", "nombre", "identificador", "telefono", "rol", "codigo_sede", "activo"],
}


def volcar(nombre: str, filas: list[dict]) -> int:
    cab = CABECERAS[nombre]
    return escribir_csv(nombre, cab, [[f.get(c, "") for c in cab] for f in filas])


# ── TypeScript compilado para el cargador de core ─────────────────


def escribir_ts(casos, handshakes, escalamientos, dictados):
    """
    El cargador de core no lee CSV en runtime: importa este modulo, igual que
    sedes/catalogo.generado.ts. Un `fs.readFileSync` sobre data/ se rompe en
    cuanto core corre desde dist/ o dentro del contenedor, y un demo que falla
    al arrancar es peor que un demo vacio.
    """
    por_caso_dictado = {d["caso_id"]: d for d in dictados}

    def caso_ts(c):
        d = por_caso_dictado[c["caso_id"]]
        return {
            "id": c["caso_id"],
            "resumen": c["resumen"],
            "triage": int(c["triage"]),
            "dxCie10": c["dx_cie10"],
            "dxDescripcion": c["dx_descripcion"],
            "serviciosRequeridos": [int(x) for x in c["servicios_requeridos"].split()],
            "complejidadRequerida": c["complejidad_requerida"],
            "edad": int(c["edad"]),
            "sexo": c["sexo"],
            "signosAlarma": c["signos_alarma"].split(" | "),
            "requiereMedicoABordo": c["requiere_medico_abordo"] == "true",
            "confianza": float(c["confianza"]),
            "telefonoReporta": c["telefono_reporta"],
            "textoCrudo": d["texto_crudo"],
            "origen": {"lat": c["origen_lat"], "lng": c["origen_lng"]},
            "tipoMovil": c["tipo_movil"],
            "unidad": {"id": c["movil_id"]},
            "creadoEn": c["creado_en"],
        }

    def hs_ts(h):
        return {
            "id": h["handshake_id"],
            "casoId": h["caso_id"],
            "sedeCodigo": h["codigo_sede"],
            "canal": h["canal"],
            "estado": h["estado"],
            "motivoRechazo": h["motivo_rechazo"] or None,
            "enviadoEn": h["enviado_en"],
            "expiraEn": h["expira_en"],
            "respondidoEn": h["respondido_en"] or None,
            "latenciaS": int(h["latencia_s"]) if h["latencia_s"] != "" else None,
            "etaMinAlDespachar": h["eta_min_al_despachar"],
        }

    def esc_ts(e):
        return {
            "id": e["escalamiento_id"],
            "casoId": e["caso_id"],
            "motivo": e["motivo"],
            "sedesIntentadas": e["sedes_intentadas"].split() if e["sedes_intentadas"] else [],
            "detalle": e["detalle"] or None,
            "creadoEn": e["creado_en"],
            "atendidoEn": e["atendido_en"] or None,
            "atendidoPor": e["atendido_por"] or None,
        }

    def j(obj):
        return json.dumps(obj, ensure_ascii=False, indent=2)

    cuerpo = f"""/**
 * ARCHIVO GENERADO — no editar a mano.
 *
 * Lo produce `python3 scripts/datos/generar_sintetico.py` desde
 * data/sintetico/*.csv. Cualquier cambio aqui se pierde en la siguiente
 * corrida: para cambiar el contenido se cambia el generador.
 *
 * ⚠️ DATOS SINTETICOS. Los pacientes, los dictados, las respuestas de los
 *    hospitales y las personas de este archivo NO EXISTEN. Las sedes y sus
 *    codigos REPS de 12 digitos si son reales (data/procesado/sedes.json).
 *
 * Solo se carga con PULSO_DEMO_SINTETICO=true. Ver semillas-demo.service.ts.
 *
 * Generado: {dt.date.today().isoformat()}
 * Turno:    {NOCHE.isoformat()} 19:00 → {(NOCHE + dt.timedelta(days=1)).isoformat()} 07:00
 */

import type {{ Caso, Escalamiento, Handshake }} from '../contracts/types';

/** {len(casos)} casos del turno de noche. */
export const CASOS_DEMO: Caso[] = {j([caso_ts(c) for c in casos])};

/** {len(handshakes)} solicitudes a sedes, con sus rebotes. */
export const HANDSHAKES_DEMO: Handshake[] = {j([hs_ts(h) for h in handshakes])};

/** {len(escalamientos)} casos que el ruteo automatico no cerro. */
export const ESCALAMIENTOS_DEMO: Escalamiento[] = {j([esc_ts(e) for e in escalamientos])};
"""
    (SALIDA_TS / "catalogo-demo.generado.ts").write_text(cuerpo, encoding="utf-8")


# ── SQL idempotente ───────────────────────────────────────────────


def escribir_sql(datos: dict[str, list[dict]]):
    """
    Los mismos datos como INSERTs `on conflict do nothing`, para cuando haya
    Postgres. Solo entran las tablas que el esquema 0001..0008 tiene de verdad:
    `escalamiento`, `movil` y `mensaje` NO existen todavia como tablas, asi que
    no se inventan aqui — inventarlas seria una migracion disfrazada de seed.
    """
    partes: list[str] = []
    ap = partes.append
    ap("-- ═══════════════════════════════════════════════════════════════")
    ap("--  PULSO — seed 0001 · turno de noche sintetico (demo)")
    ap("--  Generado por scripts/datos/generar_sintetico.py. No editar a mano.")
    ap("-- ═══════════════════════════════════════════════════════════════")
    ap("--")
    ap("--  ⚠️ DATOS SINTETICOS. Ni un paciente, ni un actor, ni un telefono de")
    ap("--     este archivo corresponde a una persona real. Las sedes y sus")
    ap("--     codigos REPS de 12 digitos si son reales.")
    ap("--")
    ap("--  Idempotente: todo va con `on conflict do nothing`. Correlo las veces")
    ap("--  que quieras. NO borra nada — la auditoria es append-only (regla 4).")
    ap("--")
    ap("--  Requiere 0001..0008 aplicadas. Las tablas `escalamiento`, `movil` y")
    ap("--  `mensaje` no existen en el esquema: esos CSV se cargan solo en el")
    ap("--  almacen en memoria de core.")
    ap("")
    ap("begin;")
    ap("")

    ap("-- ── Organizaciones y actores ──────────────────────────────────")
    ap("-- El uuid se deriva del id legible (md5 del texto, que ya son 32 hex y")
    ap("-- castea a uuid) en vez de dejar el default gen_random_uuid(): asi")
    ap("-- reejecutar el seed choca contra la PK en vez de crear un duplicado con")
    ap("-- id nuevo, que es como un seed 'idempotente' deja de serlo.")
    for o in datos["organizaciones.csv"]:
        ap(
            "insert into organizacion (id, tipo, razon_social, nombre_corto, nit, estado, verificacion) values "
            f"(md5({sql_txt('pulso-demo-' + o['organizacion_id'])})::uuid, {sql_txt(o['tipo'])}, {sql_txt(o['razon_social'])}, "
            f"{sql_txt(o['nombre_corto'])}, {sql_txt(o['nit'])}, {sql_txt(o['estado'])}, {sql_txt(o['verificacion'])}) "
            "on conflict do nothing;"
        )
    ap("")
    for o in datos["organizaciones.csv"]:
        if o["codigo_sede"]:
            ap(
                "insert into organizacion_sede (organizacion_id, codigo_sede, verificada, activa) values "
                f"(md5({sql_txt('pulso-demo-' + o['organizacion_id'])})::uuid, {sql_txt(o['codigo_sede'])}, true, true) "
                "on conflict do nothing;"
            )
    ap("")
    for a in datos["actores.csv"]:
        ap(
            "insert into actor (id, organizacion_id, tipo, nombre, identificador, telefono, activo) values "
            f"(md5({sql_txt('pulso-demo-' + a['actor_id'])})::uuid, md5({sql_txt('pulso-demo-' + a['organizacion_id'])})::uuid, "
            f"{sql_txt(a['tipo'])}, {sql_txt(a['nombre'])}, {sql_txt(a['identificador'])}, {sql_txt(a['telefono'])}, true) "
            "on conflict do nothing;"
        )
    ap("")
    for a in datos["actores.csv"]:
        ap(
            "insert into actor_rol (actor_id, rol, codigo_sede) values "
            f"(md5({sql_txt('pulso-demo-' + a['actor_id'])})::uuid, {sql_txt(a['rol'])}, {sql_txt(a['codigo_sede'])}) "
            "on conflict do nothing;"
        )
    ap("")

    ap("-- ── Casos ─────────────────────────────────────────────────────")
    ap("-- caso.id es uuid: se deriva del id legible del CSV (CAS-0001) para que")
    ap("-- handshake y evento_caso puedan apuntar al mismo sin una tabla puente.")
    dict_por_caso = {d["caso_id"]: d for d in datos["dictados.csv"]}
    for c in datos["casos.csv"]:
        d = dict_por_caso[c["caso_id"]]
        servicios = "{" + ",".join(c["servicios_requeridos"].split()) + "}"
        signos = "{" + ",".join('"' + s.replace('"', "") + '"' for s in c["signos_alarma"].split(" | ")) + "}"
        ap(
            "insert into caso (id, texto_crudo, resumen, triage, dx_cie10, dx_descripcion, servicios_requeridos, "
            "complejidad_requerida, edad, sexo, signos_alarma, requiere_medico_abordo, confianza, tipo_movil, origen, creado_en) values "
            f"(md5({sql_txt('pulso-demo-' + c['caso_id'])})::uuid, {sql_txt(d['texto_crudo'])}, {sql_txt(c['resumen'])}, "
            f"{c['triage']}, {sql_txt(c['dx_cie10'])}, {sql_txt(c['dx_descripcion'])}, {sql_txt(servicios)}::int[], "
            f"{sql_txt(c['complejidad_requerida'])}, {c['edad']}, {sql_txt(c['sexo'])}, {sql_txt(signos)}::text[], "
            f"{'true' if c['requiere_medico_abordo'] == 'true' else 'false'}, {c['confianza']}, {sql_txt(c['tipo_movil'])}, "
            f"st_makepoint({c['origen_lng']}, {c['origen_lat']})::geography, {sql_txt(c['creado_en'])}::timestamptz) "
            "on conflict do nothing;"
        )
    ap("")

    ap("-- ── Handshakes ────────────────────────────────────────────────")
    for h in datos["handshakes.csv"]:
        ap(
            "insert into handshake (id, caso_id, codigo_sede, canal, estado, motivo_rechazo, enviado_en, respondido_en, latencia_s) values "
            f"(md5({sql_txt('pulso-demo-' + h['handshake_id'])})::uuid, md5({sql_txt('pulso-demo-' + h['caso_id'])})::uuid, "
            f"{sql_txt(h['codigo_sede'])}, {sql_txt(h['canal'])}, {sql_txt(h['estado'])}, {sql_txt(h['motivo_rechazo'])}, "
            f"{sql_txt(h['enviado_en'])}::timestamptz, "
            f"{(sql_txt(h['respondido_en']) + '::timestamptz') if h['respondido_en'] else 'null'}, {sql_num(h['latencia_s'])}) "
            "on conflict do nothing;"
        )
    ap("")

    ap("-- ── Linea de tiempo ───────────────────────────────────────────")
    ap("-- evento_caso es append-only y su id es `generated always as identity`:")
    ap("-- no se puede fijar desde aqui, asi que `corrige_a` se resuelve por")
    ap("-- subconsulta contra la clave de idempotencia del evento corregido.")
    for e in datos["eventos_caso.csv"]:
        corrige = (
            f"(select id from evento_caso where clave_idempotencia = {sql_txt('demo-' + str(e['corrige_a']))})"
            if e["corrige_a"] != "" else "null"
        )
        ap(
            "insert into evento_caso (caso_id, tipo, actor_id, actor_nombre, actor_tipo, codigo_sede, movil_id, detalle, corrige_a, clave_idempotencia, ocurrido_en) values "
            f"(md5({sql_txt('pulso-demo-' + e['caso_id'])})::uuid, {sql_txt(e['tipo'])}, {sql_txt(e['actor_id'])}, "
            f"{sql_txt(e['actor_nombre'])}, {sql_txt(e['actor_tipo'])}, {sql_txt(e['codigo_sede'])}, {sql_txt(e['movil_id'])}, "
            f"{sql_txt(json.dumps({'nota': e['detalle']}, ensure_ascii=False))}::jsonb, {corrige}, "
            f"{sql_txt('demo-' + str(e['evento_id']))}, {sql_txt(e['ocurrido_en'])}::timestamptz) "
            "on conflict do nothing;"
        )
    ap("")

    ap("-- ── Rastro GPS de la flota ────────────────────────────────────")
    ap("-- movil_posicion es append-only y no tiene clave natural: el `on")
    ap("-- conflict` no aplica, asi que se guarda con un centinela para poder")
    ap("-- saber que ya se cargo y no duplicar el rastro en una segunda corrida.")
    ap("do $$")
    ap("begin")
    ap("  if not exists (select 1 from movil_posicion where movil_id = 'AMB-001') then")
    for p in datos["posiciones.csv"]:
        ap(
            "    insert into movil_posicion (movil_id, geom, precision_m, velocidad_kmh, disponible, reportado_en) values "
            f"({sql_txt(p['movil_id'])}, st_makepoint({p['lng']}, {p['lat']})::geography, {p['precision_m']}, "
            f"{p['velocidad_kmh']}, {'true' if p['disponible'] == 'true' else 'false'}, {sql_txt(p['reportado_en'])}::timestamptz);"
        )
    ap("  end if;")
    ap("end $$;")
    ap("")

    ap("-- ── Acuse de los webhooks de entrada ──────────────────────────")
    for m in datos["mensajes.csv"]:
        if m["direccion"] == "entrada":
            ap(
                "insert into webhook_recibido (proveedor, id_externo, recibido_en, resultado) values "
                f"({sql_txt(m['proveedor'])}, {sql_txt(m['wamid'])}, {sql_txt(m['ts'])}::timestamptz, "
                f"{sql_txt(json.dumps({'casoId': m['caso_id'], 'demo': True}, ensure_ascii=False))}::jsonb) "
                "on conflict do nothing;"
            )
    ap("")
    ap("commit;")
    ap("")
    (SALIDA_SQL / "0001_demo_sintetico.sql").write_text("\n".join(partes), encoding="utf-8")


# ── README ────────────────────────────────────────────────────────

DICCIONARIO = {
    "sedes_estado.csv": [
        ("codigo_sede", "codigo_habilitacion_sede del REPS, 12 digitos. PK. REAL."),
        ("nombre_sede", "nombre de la IPS segun el REPS. REAL."),
        ("localidad", "localidad de Bogota. REAL."),
        ("subred", "subred integrada de servicios de salud. REAL."),
        ("complejidad", "baja | media | alta (Res. 3100/2019). REAL."),
        ("estado", "recibiendo | saturado | contingencia | cerrado. SINTETICO."),
        ("motivo", "texto libre; vacio cuando el estado es `recibiendo`."),
        ("declarado_en", "ISO 8601 con offset -05:00."),
        ("vence_en", "ISO 8601; vacio si el estado no vence."),
        ("declarado_por", "rol:alcance de quien lo declaro."),
    ],
    "camas.csv": [
        ("codigo_sede", "FK a sedes_estado.codigo_sede."),
        ("tipo_cama", "nombre REPS del tipo de cama. REAL."),
        ("total", "camas instaladas (unidad: camas). REAL, del REPS."),
        ("ocupadas", "camas ocupadas al corte del turno (camas). SINTETICO."),
        ("disponibles", "total - ocupadas (camas)."),
        ("ocupadas_snapshot_reps", "ocupadas del snapshot REPS 2022-11-30. REAL, es un prior."),
        ("medido_en", "ISO 8601 del corte."),
    ],
    "casos.csv": [
        ("caso_id", "CAS-NNNN. Estable entre corridas."),
        ("creado_en", "ISO 8601 -05:00. Reparte segun la curva horaria real del 123."),
        ("hora_turno", "hora local 0-23, para agrupar sin parsear fechas."),
        ("triage", "1..5 (Res. 5596/2015)."),
        ("dx_cie10", "codigo CIE-10 del protocolo."),
        ("dx_descripcion", "descripcion clinica del dx."),
        ("resumen", "una linea, como la diria un medico."),
        ("servicios_requeridos", "codigos REPS separados por espacio. 743 = hemodinamia (NO 408)."),
        ("complejidad_requerida", "baja | media | alta."),
        ("edad", "anios."),
        ("sexo", "M | F."),
        ("signos_alarma", "hallazgos separados por ' | '."),
        ("requiere_medico_abordo", "true | false. true obliga TAM."),
        ("confianza", "0..1 del parser. < 0.5 exige revision humana."),
        ("tipo_movil", "TAB | TAM."),
        ("movil_id", "FK a moviles.movil_id."),
        ("localidad", "localidad del origen, sin tildes y en mayuscula (como el 123)."),
        ("origen_lat", "grados decimales, dentro de la caja de Bogota."),
        ("origen_lng", "grados decimales, dentro de la caja de Bogota."),
        ("telefono_reporta", "telefono FICTICIO, rango 555-01xx. No es asignable."),
        ("protocolo", "clave del protocolo clinico usado."),
    ],
    "dictados.csv": [
        ("caso_id", "FK a casos.caso_id, 1:1."),
        ("texto_crudo", "el dictado literal. PII sintetica: no sale del servidor."),
        ("canal", "whatsapp | consola."),
        ("duracion_s", "segundos de audio estimados."),
        ("ambiguo", "true = escrito a proposito para forzar confianza baja."),
        ("confianza_declarada", "0..1, la misma de casos.confianza."),
        ("dictado_en", "ISO 8601."),
    ],
    "handshakes.csv": [
        ("handshake_id", "HSK-NNNN."),
        ("caso_id", "FK a casos.caso_id."),
        ("codigo_sede", "FK a sedes_estado.codigo_sede."),
        ("nombre_sede", "denormalizado, para leer el CSV sin join."),
        ("canal", "telegram | whatsapp | consola."),
        ("estado", "enviado | aceptado | rechazado | timeout."),
        ("motivo_rechazo", "texto; vacio salvo en `rechazado`."),
        ("enviado_en", "ISO 8601."),
        ("expira_en", "ISO 8601 = enviado_en + 90 s."),
        ("respondido_en", "ISO 8601; vacio en `timeout`."),
        ("latencia_s", "segundos hasta la respuesta; vacio en `timeout`."),
        ("eta_min_al_despachar", "minutos estimados (haversine / 0.38 km-min)."),
        ("intento", "1 = primer toque; > 1 = rebote."),
    ],
    "eventos_caso.csv": [
        ("evento_id", "entero creciente. Es la clave a la que apunta corrige_a."),
        ("caso_id", "FK a casos.caso_id."),
        ("tipo", "uno de los 22 tipos de la migracion 0007."),
        ("ocurrido_en", "ISO 8601."),
        ("actor_id", "`svc:*` para servicios, `rol:alcance` para humanos."),
        ("actor_nombre", "nombre de fantasia, o el nombre del servicio."),
        ("actor_tipo", "humano | servicio | sistema."),
        ("codigo_sede", "sede implicada; vacio si no aplica."),
        ("movil_id", "movil implicado; vacio si no aplica."),
        ("detalle", "texto SIN PII: aqui no entra el dictado ni el origen."),
        ("corrige_a", "evento_id que este evento corrige. Vacio = no corrige nada."),
    ],
    "moviles.csv": [
        ("movil_id", "AMB-NNN."),
        ("tipo", "TAB | TAM."),
        ("operador", "prestador de transporte asistencial. REAL (corte 01/07/2026)."),
        ("placa", "placa FICTICIA."),
        ("base_localidad", "localidad de la base."),
        ("tripulacion", "dos nombres de fantasia."),
        ("disponible", "true | false."),
        ("turno", "noche."),
    ],
    "posiciones.csv": [
        ("movil_id", "FK a moviles.movil_id."),
        ("lat", "grados decimales, dentro de Bogota."),
        ("lng", "grados decimales, dentro de Bogota."),
        ("precision_m", "radio de error del GPS en METROS. No es decorativo."),
        ("velocidad_kmh", "kilometros por hora."),
        ("disponible", "true | false al momento del reporte."),
        ("reportado_en", "ISO 8601, sello del servidor."),
    ],
    "mensajes.csv": [
        ("wamid", "id del mensaje de WhatsApp. FICTICIO, prefijo `wamid.DEMO`."),
        ("proveedor", "whatsapp."),
        ("direccion", "entrada | salida."),
        ("telefono", "FICTICIO, rango 555-01xx."),
        ("caso_id", "FK a casos.caso_id."),
        ("cuerpo", "texto del mensaje."),
        ("ts", "ISO 8601."),
    ],
    "escalamientos.csv": [
        ("escalamiento_id", "ESC-NNN."),
        ("caso_id", "FK a casos.caso_id."),
        ("motivo", "sin-candidatos | candidatos-agotados | solicitud-paramedico."),
        ("sedes_intentadas", "codigos de sede separados por espacio."),
        ("detalle", "texto."),
        ("creado_en", "ISO 8601."),
        ("atendido_en", "ISO 8601; vacio = sigue en la cola del CRUE."),
        ("atendido_por", "regulador_crue:<nombre de fantasia>; vacio si no lo tomo nadie."),
    ],
    "organizaciones.csv": [
        ("organizacion_id", "ORG-NNN."),
        ("tipo", "ips | operador_ambulancia | crue | entidad_pagadora."),
        ("razon_social", "para IPS y operadores es REAL (REPS / Secretaria)."),
        ("nombre_corto", "para pintar en la UI."),
        ("nit", "FICTICIO, prefijo 9000."),
        ("estado", "activa (solo `activa` es despachable, migracion 0004)."),
        ("verificacion", "reps_automatico | manual | pendiente."),
        ("codigo_sede", "sede REPS vinculada; vacio para operadores y CRUE."),
    ],
    "actores.csv": [
        ("actor_id", "ACT-NNN."),
        ("organizacion_id", "FK a organizaciones.organizacion_id."),
        ("tipo", "humano | servicio."),
        ("nombre", "nombre de FANTASIA, o el id del servicio."),
        ("identificador", "correo @demo.pulso.invalid (RFC 2606: nunca resuelve) o `svc:*`."),
        ("telefono", "FICTICIO, rango 555-01xx."),
        ("rol", "paramedico | jefe_urgencias | admin_organizacion | regulador_crue | auditor | servicio."),
        ("codigo_sede", "alcance del rol; vacio = toda la organizacion."),
        ("activo", "true | false."),
    ],
}


def escribir_readme(conteos: dict[str, int]):
    L = []
    L.append("# DATOS SINTETICOS — ni un paciente, ni una persona, ni un telefono de esta carpeta es real.")
    L.append("")
    L.append("> Los pacientes, los dictados, las respuestas de los hospitales, los actores, los correos,")
    L.append("> los telefonos, las placas y los NIT son **inventados**. Los nombres se arman combinando")
    L.append("> dos listas de fantasia. Los correos usan `@demo.pulso.invalid` (`.invalid` esta reservado")
    L.append("> por la RFC 2606 y no resuelve nunca). Los telefonos usan el rango de ficcion `555-01xx`")
    L.append("> sobre el indicativo de Bogota: ningun operador colombiano entrega esos numeros.")
    L.append("")
    L.append("## Que SI es real")
    L.append("")
    L.append("| Dato | Fuente |")
    L.append("|---|---|")
    L.append("| Sedes, codigos REPS de 12 digitos, direcciones, localidades, coordenadas, complejidad, camas instaladas | `data/procesado/sedes.json` (REPS de Bogota) |")
    L.append("| Curva horaria y reparto por localidad de los casos | `data/procesado/demanda.json` (9206 incidentes del 123) |")
    L.append("| Ocupacion por subred que inclina el estado de cada sede | `data/procesado/ocupacion.json` |")
    L.append("| Operadores de transporte asistencial y su marca TAB/TAM | `data/procesado/ambulancias.json` |")
    L.append("| Codigos de servicio REPS | `data/procesado/servicios.json` |")
    L.append("")
    L.append("El codigo de sede es **`codigohabilitacionsede`, de 12 digitos**. No es `codigoprestador`,")
    L.append("de 10, que colapsa una subred entera en un solo codigo. Ver `data/CATALOGO.md`.")
    L.append("")
    L.append("## Como se regenera")
    L.append("")
    L.append("```bash")
    L.append("python3 scripts/datos/generar_sintetico.py")
    L.append("```")
    L.append("")
    L.append(f"Determinista: semilla `{SEMILLA}` fija. Dos corridas dan archivos identicos byte a byte.")
    L.append("Un demo que cambia en cada corrida no se puede ensayar.")
    L.append("")
    L.append("## Como se enciende en el demo")
    L.append("")
    L.append("```bash")
    L.append("PULSO_DEMO_SINTETICO=true pnpm --filter core start")
    L.append("```")
    L.append("")
    L.append("Por defecto esta **apagado**. Arrancar produccion con datos falsos por accidente es peor")
    L.append("que un demo vacio.")
    L.append("")
    L.append(f"## El turno: {NOCHE.isoformat()} 19:00 → {(NOCHE + dt.timedelta(days=1)).isoformat()} 07:00")
    L.append("")
    L.append("| Archivo | Filas |")
    L.append("|---|---|")
    for nombre in CABECERAS:
        L.append(f"| `{nombre}` | {conteos[nombre]} |")
    L.append("")
    L.append("Todas las marcas de tiempo son ISO 8601 con offset `-05:00` (Bogota no tiene horario de verano).")
    L.append("Los CSV son `utf-8`, separador coma, con cabecera, terminador de linea `\\n`.")
    L.append("")
    L.append("## Diccionario de columnas")
    for nombre, cols in DICCIONARIO.items():
        L.append("")
        L.append(f"### `{nombre}`")
        L.append("")
        L.append("| Columna | Que es |")
        L.append("|---|---|")
        for c, d in cols:
            L.append(f"| `{c}` | {d} |")
    L.append("")
    (SALIDA / "README.md").write_text("\n".join(L), encoding="utf-8")


# ── Orquestacion ──────────────────────────────────────────────────


def main() -> int:
    SALIDA.mkdir(parents=True, exist_ok=True)
    SALIDA_TS.mkdir(parents=True, exist_ok=True)
    SALIDA_SQL.mkdir(parents=True, exist_ok=True)

    estados = generar_sedes_estado()
    camas = generar_camas(estados)
    casos, dictados = generar_casos()
    handshakes, escalamientos = generar_handshakes(casos, estados)
    moviles = generar_moviles()
    posiciones = generar_posiciones(moviles, casos)
    eventos = generar_eventos(casos, handshakes, escalamientos)
    mensajes = generar_mensajes(casos, handshakes)
    orgs = generar_organizaciones()
    actores = generar_actores(orgs)

    datos = {
        "sedes_estado.csv": estados,
        "camas.csv": camas,
        "casos.csv": casos,
        "dictados.csv": dictados,
        "handshakes.csv": handshakes,
        "eventos_caso.csv": eventos,
        "moviles.csv": moviles,
        "posiciones.csv": posiciones,
        "mensajes.csv": mensajes,
        "escalamientos.csv": escalamientos,
        "organizaciones.csv": orgs,
        "actores.csv": actores,
    }

    conteos = {nombre: volcar(nombre, filas) for nombre, filas in datos.items()}
    escribir_readme(conteos)
    escribir_ts(casos, handshakes, escalamientos, dictados)
    escribir_sql(datos)

    print(f"PULSO — turno sintetico {NOCHE.isoformat()} 19:00 → 07:00  (semilla {SEMILLA})")
    for nombre, n in conteos.items():
        print(f"  {n:6d}  data/sintetico/{nombre}")
    print(f"          apps/backend/core/src/semillas-demo/catalogo-demo.generado.ts")
    print(f"          supabase/seeds/0001_demo_sintetico.sql")

    rebotados = len({h["caso_id"] for h in handshakes if h["intento"] > 1})
    print(
        f"\n  casos {len(casos)} · con rebote {rebotados} ({100 * rebotados // len(casos)}%)"
        f" · escalados al CRUE {len(escalamientos)} ({100 * len(escalamientos) // len(casos)}%)"
    )
    por_estado: dict[str, int] = {}
    for e in estados:
        por_estado[e["estado"]] = por_estado.get(e["estado"], 0) + 1
    print("  sedes: " + " · ".join(f"{k} {v}" for k, v in sorted(por_estado.items())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
