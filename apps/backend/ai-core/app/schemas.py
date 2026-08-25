"""Contrato de datos de ai-core.

⚠️ ESTE ARCHIVO ESPEJA `apps/frontend/lib/types.ts`, QUE ES LEY.
Los nombres en el cable son camelCase (`serviciosRequeridos`, `dxCie10`)
justamente para que el frontend pueda pasar de llamar a su propio
`/api/triage` a llamar a ai-core sin tocar un solo tipo de TypeScript.

Adentro de Python usamos snake_case; el alias_generator hace la traduccion.
Serializa SIEMPRE con `by_alias=True` o romperas el contrato.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

NivelTriage = Literal[1, 2, 3, 4, 5]
Complejidad = Literal["baja", "media", "alta"]
Sexo = Literal["M", "F", "desconocido"]
TipoMovil = Literal["TAB", "TAM"]


class ModeloCable(BaseModel):
    """Base: entra y sale en camelCase, se lee en snake_case."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class Coordenada(ModeloCable):
    lat: float
    lng: float


ORIGEN_DEMO = Coordenada(lat=4.5981, lng=-74.0758)


class ExtraccionClinica(ModeloCable):
    """Lo que el LLM extrae del dictado.

    Las `description` de cada campo NO son documentacion: viajan en el
    JSON Schema que recibe Claude y son parte del prompt. Cambiarlas
    cambia el comportamiento del modelo.
    """

    resumen: str = Field(
        description="Una linea, como la diria un medico por radio. Maximo 140 caracteres."
    )
    triage: int = Field(
        ge=1,
        le=5,
        description=(
            "Nivel de triage segun Resolucion 5596 de 2015 de Colombia. "
            "1=atencion inmediata por riesgo vital. 2=maximo 30 min. 3=maximo 120 min. "
            "4=maximo 240 min. 5=maximo 360 min."
        ),
    )
    dx_cie10: str | None = Field(
        description="Codigo CIE-10 mas probable, ej 'I21.1'. null si el dictado no alcanza."
    )
    dx_descripcion: str = Field(description="Diagnostico probable en palabras.")
    servicios_requeridos: list[int] = Field(
        description=(
            "Codigos de servicio REPS que la sede receptora DEBE tener habilitados. "
            "Usar UNICAMENTE codigos de la lista permitida. No incluir 1102 (urgencias): "
            "se agrega solo. Solo lo estrictamente necesario para resolver este caso."
        )
    )
    complejidad_requerida: Complejidad
    edad: int | None
    sexo: Sexo
    signos_alarma: list[str] = Field(
        description="Hallazgos concretos que justifican el nivel de triage. Maximo 4."
    )
    requiere_medico_a_bordo: bool = Field(
        description=(
            "true si el paciente necesita medico durante el traslado "
            "(inestabilidad hemodinamica, via aerea comprometida, Glasgow bajo, "
            "infusiones vasoactivas). Obliga movil TAM."
        )
    )
    confianza: float = Field(
        ge=0,
        le=1,
        description="Que tan seguro estas de esta extraccion, 0 a 1.",
    )


class Caso(ExtraccionClinica):
    """Extraccion + lo que agrega el servidor. Es lo que consume el matching."""

    id: str
    texto_crudo: str = Field(description="El dictado literal, sin tocar. Auditoria.")
    origen: Coordenada
    tipo_movil: TipoMovil
    creado_en: str  # ISO 8601


class Transcripcion(ModeloCable):
    """Lo que devolvió el proveedor de STT.

    `proveedor` viaja a propósito: si mañana el triaje empieza a fallar con los
    audios, lo primero que hay que saber es quién transcribió.
    """

    texto: str
    proveedor: Literal["deepgram", "elevenlabs"]
    latencia_ms: int
    idioma: str | None = None


class TranscribirRequest(ModeloCable):
    #: Bytes del audio en base64. Es lo que manda `core` después de bajar el
    #: media de WhatsApp — el navegador nunca habla con ai-core.
    audio_base64: str
    #: WhatsApp entrega notas de voz como audio/ogg (opus); la PWA, audio/webm.
    audio_mime: str = "audio/ogg"


class InterpretarRequest(ModeloCable):
    """Un mensaje suelto de WhatsApp que hay que clasificar."""

    mensaje: str = ""
    #: Camino de audio: nota de voz → texto → decisión, en una sola llamada.
    audio_base64: str | None = None
    audio_mime: str = "audio/ogg"
    #: Qué sabe `core` de este paramédico ahora mismo (caso abierto, sede
    #: asignada, estado del handshake). Sin esto el modelo no puede
    #: distinguir "ya llegué" a la escena de "ya llegué" al hospital.
    contexto: str | None = None


class InterpretarResponse(ModeloCable):
    #: Nombre de la herramienta elegida. `no_entendido` es una respuesta
    #: válida y esperada, no un error.
    accion: str
    argumentos: dict[str, object] = Field(default_factory=dict)
    motor: Literal["claude", "heuristica"]
    latencia_ms: int
    transcripcion: Transcripcion | None = None


class Sbar(ModeloCable):
    """La entrega estándar entre clínicos. CUATRO LÍNEAS, no cuatro párrafos.

    La lee un médico de urgencias en una pantalla, a dos metros, mientras hace
    otra cosa. Tiene entre cinco y diez segundos.
    """

    situacion: str = Field(
        description=(
            "S — quién es y qué le pasa AHORA. Una línea, frase de radio. "
            "Nunca empieces con 'El paciente presenta' ni 'Se trata de'."
        )
    )
    antecedente: str = Field(
        description=(
            "B — el antecedente que cambia la conducta. Una línea. "
            "Si el caso no trae antecedentes, di 'Sin antecedentes referidos' "
            "o pon el tiempo de evolución o el mecanismo. NUNCA lo inventes."
        )
    )
    analisis: str = Field(
        description=(
            "A — qué se piensa que está pasando. Una línea. Si la confianza "
            "de la extracción es baja, dilo aquí."
        )
    )
    recomendacion: str = Field(
        description=(
            "R — qué hay que tener listo y con qué urgencia. Una línea. "
            "Sale de los servicios requeridos del caso."
        )
    )


class SbarRequest(ModeloCable):
    caso: Caso


class SbarResponse(ModeloCable):
    sbar: Sbar
    #: "claude" o "plantilla". El respaldo arma el SBAR desde los campos ya
    #: estructurados del caso: peor redactado, igual de correcto.
    motor: Literal["claude", "plantilla"]
    latencia_ms: int
    #: Versión del prompt con que se generó. Prepara la 3.12.
    version_prompt: str | None = None


class HablarRequest(ModeloCable):
    """Texto → audio, para la llamada de seguimiento."""

    texto: str
    #: Voz de ElevenLabs. Omitir usa TTS_VOZ_ID del .env.
    voz_id: str | None = None


class TriageRequest(ModeloCable):
    #: El dictado ya transcrito. Si viene vacío y hay audio, se transcribe.
    texto: str = ""
    origen: Coordenada | None = None
    tipo_movil: TipoMovil | None = None
    #: Camino de audio: una sola llamada hace STT + extracción. Es lo que
    #: conviene para WhatsApp, que paga latencia por cada salto.
    audio_base64: str | None = None
    audio_mime: str = "audio/ogg"


class TriageResponse(ModeloCable):
    caso: Caso
    latencia_ms: int
    # De donde salio la extraccion. El frontend nunca tuvo este campo y lo
    # necesitabamos: `confianza == 0.35` era la unica pista de que estabas
    # viendo la heuristica y no a Claude.
    motor: Literal["claude", "heuristica"]
    #: Presente solo si el dictado entró como audio. Trae el texto que de
    #: verdad leyó el parser — cuando una extracción salga rara, lo primero
    #: que hay que mirar es si el STT oyó bien.
    transcripcion: Transcripcion | None = None


# ─────────────────────────────────────────────────────────────────
# Sede — el universo de destinos. Lo produce Zaid (ETL + PostGIS);
# ai-core solo lo recibe. Este servicio NO tiene base de datos.
# ─────────────────────────────────────────────────────────────────


class CamaSede(ModeloCable):
    tipo: str
    total: int
    #: Ocupación del snapshot REPS 2022. Es un PRIOR, no la ocupación de hoy.
    ocupadas_snapshot: int


class Sede(ModeloCable):
    codigo: str
    nombre: str
    direccion: str | None = None
    localidad: str | None = None
    coord: Coordenada
    naturaleza: Literal["Pública", "Privada", "Mixta"]
    complejidad: Complejidad
    telefono: str | None = None
    servicios: list[int] = Field(default_factory=list)
    camas: list[CamaSede] = Field(default_factory=list)


class EtaSede(ModeloCable):
    codigo: str
    eta_min: float
    dist_km: float


class SenalesSede(ModeloCable):
    """La historia viva de una sede: lo que el motor aprende de los handshakes.

    ai-core no tiene DB, así que estas señales llegan en el request. Las
    produce Zaid desde la tabla `handshake`. Sin señales, cada sede corre
    con su prior estructural del REPS y el motor sigue funcionando.
    """

    aceptados: int = 0
    rechazados: int = 0
    #: Rechazos en las últimas 6h. Es LA señal viva de congestión.
    rechazos_recientes: int = 0
    #: Minutos que ESTA sede tardó en responder handshakes anteriores
    #: (`handshake.latencia_s / 60`). Calibra su penalización de rebote.
    latencias_respuesta_min: list[float] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────
# Cobertura — qué zona queda descubierta y quién va
#
# El modelo del traslado tiene cuatro puntos:
#   A  donde está la ambulancia cuando entra el caso
#   B  donde está el paciente
#   C  el hospital receptor
#   D  la zona que debe ir a cubrir DESPUÉS de entregar
#
# A→B→C ya lo resuelve el ranking. Esto resuelve C→D.
# En D no se mide tiempo de permanencia: es donde espera. Lo que sí importa
# es el trayecto C→D, que es lo que decide si vale la pena que ESA unidad
# cubra ESA zona en vez de otra.
# ─────────────────────────────────────────────────────────────────


EstadoUnidad = Literal[
    "libre",  # disponible para cubrir
    "en_ruta_escena",
    "en_escena",
    "en_traslado",
    "en_puerta",  # entregando; se libera pronto → candidata a D
    "fuera_servicio",  # turno terminado, comida, mantenimiento
]


class Unidad(ModeloCable):
    """Una ambulancia con existencia propia, fuera de un caso.

    Es lo que no existía: hasta ahora el móvil nacía y moría con el traslado.
    """

    id: str
    estado: EstadoUnidad = "libre"
    posicion: Coordenada
    tipo_movil: TipoMovil = "TAB"
    #: ISO 8601. Sin latido reciente la unidad sale del pool SOLA, sin
    #: preguntar. Una que no responde y una que salió a almorzar son
    #: indistinguibles desde aquí, y deben tratarse igual.
    ultimo_latido_en: str | None = None
    #: Zona que ya tiene asignada, si alguna.
    zona_asignada: str | None = None


class Zona(ModeloCable):
    """Un sector de cobertura. Hoy = localidad de Bogotá.

    ⚠️ La granularidad la impone el dato: las llamadas del 123 NO traen
    coordenadas, sólo localidad. Sin puntos no hay grilla de hexágonos que
    construir. Cuando haya datos con lat/lng, esto se subdivide sin cambiar
    el motor: `id` es opaco a propósito.
    """

    id: str
    nombre: str
    #: Fracción de la demanda de la ciudad que cae aquí (0..1). Sale de
    #: `data/derivados/demanda_localidad.json`, calculado con llamadas reales.
    demanda_relativa: float = Field(ge=0, le=1)
    #: A dónde va la ambulancia a esperar. El polígono es para pintar; para
    #: calcular basta el centroide.
    centroide: Coordenada
    #: GeoJSON opcional. ai-core no lo usa; viaja para que el mapa lo pinte.
    poligono: dict[str, object] | None = None


class Lock(ModeloCable):
    """Reserva de una zona por una unidad.

    Sin TTL, una unidad que se desconecta camino a D deja esa zona reservada
    y descubierta para siempre: el peor de los dos mundos.
    """

    zona_id: str
    unidad_id: str
    #: ISO 8601. Vencido = la zona vuelve al pool.
    expira_en: str


class Asignacion(ModeloCable):
    unidad_id: str
    zona_id: str
    zona_nombre: str
    #: Minutos estimados de C→D (o de donde esté la unidad al centroide).
    eta_min: float
    dist_km: float
    expira_en: str
    motivo: str


class ZonaCobertura(ModeloCable):
    id: str
    nombre: str
    demanda_relativa: float
    #: Cuántas de las unidades DISPONIBLES le tocan, por su peso en la
    #: demanda. Es un reparto de lo que hay: suma exactamente la flota libre.
    cupo: int
    #: Cuántas haría falta según `flotaObjetivo`. Independiente de cuántas
    #: haya. Sin `flotaObjetivo` en el request, es igual a `cupo`.
    requeridas: int
    cubierta_por: list[str]
    #: requeridas − cubiertas. Positivo = a la ciudad le falta flota, no que
    #: el reparto esté mal hecho. Son cosas distintas y confundirlas hace que
    #: el tablero siempre diga verde.
    deficit: int
    #: Sin una sola unidad. Es el número que de verdad mira el CRUE.
    descubierta: bool
    poligono: dict[str, object] | None = None


class CoberturaRequest(ModeloCable):
    zonas: list[Zona]
    unidades: list[Unidad]
    locks: list[Lock] = Field(default_factory=list)
    #: ISO 8601. Fijarlo hace el reparto reproducible — úsalo en el demo.
    ahora: str | None = None
    #: Cuánto dura una reserva antes de volver al pool.
    ttl_lock_min: int = 15
    #: Sin latido en este tiempo, la unidad se da por no disponible.
    latido_maximo_min: int = 5
    #: Cuántas unidades DEBERÍA tener la ciudad. Sirve para medir el hueco
    #: real: sin esto, el déficit se calcula contra las que hay y siempre da
    #: cero, porque el reparto usa exactamente las disponibles.
    #: None = no se opina sobre el tamaño de la flota.
    flota_objetivo: int | None = None


class CoberturaResponse(ModeloCable):
    zonas: list[ZonaCobertura]
    asignaciones: list[Asignacion]
    #: Zonas sin una sola unidad. Es el número honesto y el que se pinta en
    #: rojo: no depende de suponer cuál debería ser el tamaño de la flota.
    descubiertas: list[str]
    #: Zonas cuyo `requeridas` no se alcanzó. Vacío si no se mandó
    #: `flotaObjetivo` — no se inventa un déficit contra un objetivo que
    #: nadie declaró.
    con_deficit: list[str]
    #: Locks que vencieron o cuya unidad dejó de estar disponible.
    liberadas: list[Lock]
    unidades_disponibles: int
    unidades_totales: int
    latencia_ms: int


# ─────────────────────────────────────────────────────────────────
# Candidato — el ranking
# ─────────────────────────────────────────────────────────────────


class DesgloseScore(ModeloCable):
    """TODO ESTÁ EN MINUTOS. Esa es la decisión de diseño del producto."""

    ruta: float
    riesgo_rechazo: float
    espera: float
    bono: float


class Candidato(ModeloCable):
    sede: Sede
    #: 1 = mejor opción. 0 = descartada.
    rank: int
    eta_min: float
    dist_km: float
    p_aceptacion: float
    congestion: float
    #: Costo total en minutos. MENOR ES MEJOR.
    score: float
    desglose: DesgloseScore
    servicios_faltantes: list[int]
    motivo_descarte: str | None


class ScoreRequest(ModeloCable):
    caso: Caso
    sedes: list[Sede]
    etas: list[EtaSede]
    #: codigo de sede → señales. Las que falten corren con su prior.
    senales: dict[str, SenalesSede] = Field(default_factory=dict)
    limite: int = 5
    incluir_descartadas: bool = True
    #: Timestamp ISO para la curva horaria. Omitir = ahora.
    #: Fijarlo hace el score reproducible — úsalo en modo demo y en tests.
    ahora: str | None = None


class DesgloseCongestion(ModeloCable):
    ocupacion_base: float
    horario: float
    rechazo_reciente: float
    epidemiologico: float
    total: float


class ScoreResponse(ModeloCable):
    candidatos: list[Candidato]
    evaluadas: int
    compatibles: int
    latencia_ms: int
