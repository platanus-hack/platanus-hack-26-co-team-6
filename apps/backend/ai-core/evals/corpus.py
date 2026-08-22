"""Corpus de dictados para evaluar el parser clinico.

Los 3 primeros son los de `apps/frontend/lib/mock.ts` (los que salen en el
pitch). Los demas son los FEOS, que son los que rompen un demo en vivo:
transcripcion de voz sin tildes, jerga, dictados truncados, casos ambiguos,
y sobre todo el caso estable que NO debe pedir UCI.

Cada assert es una propiedad que se puede defender ante un medico, no un
match exacto contra una salida congelada: el LLM puede escribir el resumen
de mil formas y seguir estando bien.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Dictado:
    etiqueta: str
    texto: str
    por_que: str
    triage_esperado: int | None = None
    #: El triage puede ser este numero o mas grave (menor). Regla 5 del prompt.
    triage_maximo: int | None = None
    servicios_deben_incluir: list[int] = field(default_factory=list)
    servicios_no_deben_incluir: list[int] = field(default_factory=list)
    requiere_medico_a_bordo: bool | None = None
    confianza_maxima: float | None = None
    confianza_minima: float | None = None
    cie10_debe_ser_nulo: bool = False
    #: None = no lo reviso. Para exigir null, usa `edad_debe_ser_nula`.
    edad_esperada: int | None = None
    edad_debe_ser_nula: bool = False
    sexo_esperado: str | None = None


CORPUS: list[Dictado] = [
    # ── Los 3 del pitch ──────────────────────────────────────────────
    Dictado(
        etiqueta="IAM inferior",
        texto=(
            "Paciente masculino de 54 años, dolor precordial opresivo de 40 minutos de evolución, "
            "irradiado a mandíbula, diaforético. Electro con supradesnivel del ST en DII, DIII y aVF. "
            "Tensión 85 sobre 50, hemodinámicamente inestable. Vamos en móvil medicalizado."
        ),
        por_que="El caso canonico del pitch. Si este falla, no hay demo.",
        triage_esperado=2,
        servicios_deben_incluir=[743, 110],
        requiere_medico_a_bordo=True,
        edad_esperada=54,
        sexo_esperado="M",
    ),
    Dictado(
        etiqueta="ACV isquémico",
        texto=(
            "Femenina de 68 años, inicio súbito hace 50 minutos de hemiparesia derecha y afasia de "
            "expresión. Glasgow 13. Glicemia 110. Antecedente de fibrilación auricular. "
            "Presión 170 sobre 95."
        ),
        por_que="Ventana de trombolisis. Necesita imagenes antes que nada.",
        triage_esperado=2,
        servicios_deben_incluir=[245, 110],
        edad_esperada=68,
        sexo_esperado="F",
    ),
    Dictado(
        etiqueta="Politrauma pediátrico",
        texto=(
            "Menor de 9 años, atropellamiento en vía pública. Trauma craneoencefálico con Glasgow 9, "
            "deformidad en fémur izquierdo, abdomen distendido y doloroso. Taquicárdico en 140, "
            "palidez marcada. Requiere manejo de vía aérea."
        ),
        por_que="UCI PEDIATRICA, no de adultos. Pedir 110 aca descarta las sedes correctas.",
        triage_esperado=1,
        servicios_deben_incluir=[109, 203],
        servicios_no_deben_incluir=[110],
        requiere_medico_a_bordo=True,
        edad_esperada=9,
    ),
    # ── Los feos: transcripcion de voz ───────────────────────────────
    Dictado(
        etiqueta="Voz sin tildes ni puntuación",
        texto=(
            "hombre de 61 anos dolor toracico opresivo dos horas sudoracion frialdad "
            "electro con elevacion del st en cara anterior presion 90 60"
        ),
        por_que=(
            "Asi llega de verdad una transcripcion de voz: sin tildes, sin comas, "
            "sin mayusculas. Si el parser depende de la ortografia, se cae en vivo."
        ),
        triage_maximo=2,
        servicios_deben_incluir=[743],
        edad_esperada=61,
        sexo_esperado="M",
    ),
    Dictado(
        etiqueta="Jerga: SCACEST",
        texto=(
            "Paciente de 58 años con SCACEST anterior extenso, Killip II, "
            "dolor de 90 minutos. Va estable pero con disnea."
        ),
        por_que=(
            "SCACEST = sindrome coronario agudo con elevacion del ST. Es como lo dicen "
            "de verdad. Si el modelo no conoce la sigla, este paciente no llega a hemodinamia."
        ),
        triage_maximo=2,
        servicios_deben_incluir=[743],
    ),
    Dictado(
        etiqueta="Jerga: TEC + focalización",
        texto=(
            "Masculino 34 años, TEC severo por caída de altura, Glasgow 7, "
            "anisocoria derecha, intubado en escena."
        ),
        por_que="TEC + anisocoria = hernia cerebral. Neurocirugia YA.",
        triage_esperado=1,
        servicios_deben_incluir=[245],
        requiere_medico_a_bordo=True,
    ),
    # ── Los feos: sobre-pedido de servicios ──────────────────────────
    Dictado(
        etiqueta="Estable — la trampa del sobre-pedido",
        texto=(
            "Mujer de 29 años, dolor abdominal en fosa ilíaca derecha de 12 horas, "
            "Blumberg positivo, febrícula 38 grados. Signos vitales estables, "
            "consciente, orientada, camina sola."
        ),
        por_que=(
            "EL FALLO MAS CARO. Apendicitis estable necesita cirugia general, NO UCI. "
            "Pedir UCI aca descarta media ciudad y el ranking sale vacio — sin error, "
            "sin aviso, solo una lista en blanco en el peor momento posible."
        ),
        triage_maximo=3,
        servicios_deben_incluir=[203],
        servicios_no_deben_incluir=[110, 109, 108, 743, 245],
        requiere_medico_a_bordo=False,
    ),
    Dictado(
        etiqueta="Fractura cerrada sin compromiso",
        texto=(
            "Adulto joven de 25 años, caída jugando fútbol, deformidad en antebrazo "
            "izquierdo, dolor localizado. Pulso distal presente, buena perfusión, "
            "sin otras lesiones. Consciente y estable."
        ),
        por_que=(
            "La palabra 'deformidad' dispara la heuristica a triage 1 con UCI. "
            "El LLM tiene que ver que es una fractura aislada y estable. "
            "Este dictado es exactamente donde la rama de Claude debe verse mejor."
        ),
        triage_maximo=4,
        servicios_no_deben_incluir=[110, 109, 743, 245],
        requiere_medico_a_bordo=False,
    ),
    # ── Los feos: truncados y ambiguos ───────────────────────────────
    Dictado(
        etiqueta="Truncado",
        texto="Paciente con dolor, vamos en camino",
        por_que=(
            "Se corto la radio. El parser NO puede inventar un CIE-10 aca. "
            "Confianza baja es la respuesta correcta; un diagnostico es mentira."
        ),
        confianza_maxima=0.5,
        cie10_debe_ser_nulo=True,
    ),
    Dictado(
        etiqueta="Sin edad ni sexo",
        texto=(
            "Adulto encontrado en vía pública, no responde a estímulos, "
            "respiración irregular, no hay testigos ni antecedentes."
        ),
        por_que=(
            "Regla 3: si no lo dice el dictado, es null. Inventar 'masculino 45 años' "
            "es exactamente el tipo de alucinacion que un jurado medico caza."
        ),
        triage_esperado=1,
        requiere_medico_a_bordo=True,
        edad_debe_ser_nula=True,
        sexo_esperado="desconocido",
    ),
    Dictado(
        etiqueta="Ambiguo entre dos niveles",
        texto=(
            "Señora de 72 años con disnea progresiva de dos días, "
            "saturando 89 por ciento al ambiente, edemas en miembros inferiores. "
            "Habla en frases cortas."
        ),
        por_que=(
            "Podria leerse como triage 2 o 3. Regla 5: ante duda, el mas grave. "
            "En urgencias el falso negativo mata."
        ),
        triage_maximo=2,
        edad_esperada=72,
        sexo_esperado="F",
    ),
    # ── Los feos: cobertura de catalogo ──────────────────────────────
    Dictado(
        etiqueta="Obstétrico",
        texto=(
            "Gestante de 33 semanas, 24 años, sangrado vaginal abundante de inicio súbito, "
            "dolor abdominal continuo, útero hipertónico. Presión 100 sobre 60, "
            "taquicárdica en 118."
        ),
        por_que=(
            "Abruptio de placenta. Necesita ginecobstetricia (320), no una sede "
            "de alta complejidad cualquiera. Prueba que el catalogo se usa completo."
        ),
        triage_maximo=2,
        servicios_deben_incluir=[320],
        edad_esperada=24,
        sexo_esperado="F",
    ),
    Dictado(
        etiqueta="Neonato",
        texto=(
            "Recién nacido de 3 días de vida, madre refiere que no despierta para comer, "
            "hipotónico, ictérico hasta abdomen, temperatura 35.2 grados."
        ),
        por_que=(
            "UCI NEONATAL (108), no pediatrica (109) ni de adultos. Tres codigos "
            "distintos para 'cuidado intensivo' y el modelo tiene que escoger bien."
        ),
        triage_maximo=2,
        servicios_deben_incluir=[108],
        servicios_no_deben_incluir=[110],
    ),
    Dictado(
        etiqueta="Intoxicación",
        texto=(
            "Masculino de 19 años, ingesta voluntaria de organofosforado hace una hora. "
            "Sialorrea abundante, miosis puntiforme, broncorrea, bradicárdico en 45. "
            "Somnoliento."
        ),
        por_que=(
            "Sindrome colinergico. No hay codigo REPS de 'toxicologia' en el catalogo: "
            "el modelo debe resolverlo con UCI adultos y NO inventar un codigo. "
            "Prueba directa del cinturon de seguridad."
        ),
        triage_maximo=2,
        servicios_deben_incluir=[110],
        requiere_medico_a_bordo=True,
        edad_esperada=19,
        sexo_esperado="M",
    ),
]
