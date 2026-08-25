"""Las herramientas que el modelo puede llamar. Esquemas JSON estrictos.

POR QUÉ AQUÍ SÍ SON TOOLS Y EN EL TRIAJE NO
────────────────────────────────────────────
El triaje usa structured outputs (`messages.parse`) porque la pregunta es
"extrae estas entidades de este texto": hay UNA respuesta y su forma se conoce
de antemano. Meterle tools ahí sería más maquinaria por la misma garantía.

Aquí la pregunta es distinta: llega un mensaje suelto de un paramédico y hay
que decidir QUÉ es. ¿Un caso nuevo? ¿un "ya llegué"? ¿una demora? ¿una
pregunta? Eso es selección de acción, y para eso sirven las tools.

`strict: true` + `additionalProperties: false` garantizan que `tool_use.input`
valide exactamente contra el esquema. Igual revalidamos del lado nuestro: el
que ejecuta no confía en la forma que le llega.
"""

from typing import Any

#: Nombre de la herramienta de escape. Existe para que el modelo SIEMPRE tenga
#: una salida válida: sin ella, ante un mensaje raro responde texto libre y el
#: despachador se queda sin acción que ejecutar.
NO_ENTENDIDO = "no_entendido"


def _herramienta(
    nombre: str, descripcion: str, propiedades: dict[str, Any], requeridos: list[str]
) -> dict[str, Any]:
    return {
        "name": nombre,
        "description": descripcion,
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": propiedades,
            "required": requeridos,
            "additionalProperties": False,
        },
    }


HERRAMIENTAS: list[dict[str, Any]] = [
    _herramienta(
        "registrar_caso",
        "El paramédico está reportando un paciente NUEVO desde la escena. "
        "Úsala cuando el mensaje describe un cuadro clínico: síntomas, "
        "mecanismo de lesión, signos vitales, edad del paciente. "
        "Es la acción más común y la que dispara el ruteo a un hospital.",
        {
            "dictado": {
                "type": "string",
                "description": (
                    "El reporte clínico TAL CUAL lo dijo el paramédico, sin "
                    "resumir ni reescribir. El parser clínico necesita el "
                    "texto original: cada dato que le quites es un dato que "
                    "no puede extraer."
                ),
            }
        },
        ["dictado"],
    ),
    _herramienta(
        "confirmar_llegada",
        "El paramédico avisa que llegó a algún lado. Ejemplos: 'ya llegué', "
        "'estoy en la puerta', 'entregamos el paciente'.",
        {
            "donde": {
                "type": "string",
                "enum": ["escena", "hospital"],
                "description": (
                    "'escena' = llegó donde el paciente. 'hospital' = entregó "
                    "el paciente en la sede receptora. Ante duda, mira si "
                    "menciona al paciente como ya entregado."
                ),
            }
        },
        ["donde"],
    ),
    _herramienta(
        "reportar_demora",
        "El paramédico avisa que se va a demorar o que algo lo detuvo. "
        "Ejemplos: 'hay trancón en la 26', 'el paciente se descompensó', "
        "'nos mandaron a otra sede'.",
        {
            "motivo": {
                "type": "string",
                "description": "Qué lo está demorando, en sus palabras.",
            },
            "minutos_estimados": {
                "type": ["integer", "null"],
                "description": (
                    "Cuántos minutos más cree que tarda. null si no lo dice. "
                    "NO lo inventes: un estimado falso corrompe el promedio "
                    "con el que se calcula la cobertura."
                ),
            },
        },
        ["motivo", "minutos_estimados"],
    ),
    _herramienta(
        "pedir_ubicacion",
        "El paramédico pide la dirección o cómo llegar al hospital asignado. "
        "Ejemplos: '¿dónde queda?', 'mándame la ubicación', 'no sé llegar'.",
        {},
        [],
    ),
    _herramienta(
        "consultar_estado",
        "El paramédico pregunta en qué va su caso o si ya le respondieron. "
        "Ejemplos: '¿ya aceptaron?', '¿qué pasó con el traslado?'.",
        {},
        [],
    ),
    _herramienta(
        "declarar_unidad",
        "El paramédico dice qué móvil es. Ejemplos: 'soy la AMB-014', "
        "'unidad 014 en turno', 'habla el móvil 27'. "
        "Sin esto PULSO no sabe qué ambulancia está del otro lado del "
        "teléfono, y no puede ni ubicarla ni asignarle zona.",
        {
            "unidad_id": {
                "type": "string",
                "description": (
                    "El identificador tal como lo dijo, ej 'AMB-014'. No lo "
                    "reformatees: el CRUE lo reconoce por cómo lo escriben."
                ),
            },
            "tripulante": {
                "type": ["string", "null"],
                "description": "Quién opera, si lo dijo. null si no.",
            },
        },
        ["unidad_id", "tripulante"],
    ),
    _herramienta(
        "reportar_posicion",
        "El paramédico manda dónde está, en palabras. Ejemplos: 'estoy en la "
        "calle 80 con 68', 'vamos por la NQS a la altura de la 45'. "
        "NO uses esta herramienta cuando comparta su ubicación por el botón "
        "de WhatsApp: eso llega como coordenadas y se procesa aparte.",
        {
            "referencia": {
                "type": "string",
                "description": (
                    "La dirección o referencia TAL CUAL la dijo. No la "
                    "traduzcas a coordenadas: eso lo hace el geocodificador, "
                    "que sabe de Bogotá más que tú."
                ),
            }
        },
        ["referencia"],
    ),
    _herramienta(
        "pedir_zona_cobertura",
        "El paramédico quedó libre y pregunta a dónde ir, o avisa que está "
        "disponible. Ejemplos: '¿a dónde me muevo?', 'quedé libre', "
        "'disponible', 'ya entregué, ¿qué sigue?'. "
        "Es el punto D del ciclo: dónde esperar para que la ciudad no quede "
        "con un hueco de cobertura.",
        {},
        [],
    ),
    _herramienta(
        NO_ENTENDIDO,
        "El mensaje no encaja en ninguna de las otras acciones, o está "
        "demasiado incompleto para actuar. Es preferible esto a adivinar: "
        "registrar un caso a partir de un 'hola' manda una ambulancia a la "
        "nada.",
        {
            "motivo": {
                "type": "string",
                "description": "Por qué no se pudo clasificar, en una línea.",
            }
        },
        ["motivo"],
    ),
]

NOMBRES_HERRAMIENTAS: set[str] = {h["name"] for h in HERRAMIENTAS}

#: Estructura del prompt tomada del esqueleto de Carmel (promptv6): secciones
#: en mayusculas, ruteo con flechas, y las herramientas indexadas dentro de
#: FLUJO en vez de listadas aparte. El modelo lee el flujo y ve la accion.
PROMPT_SISTEMA = """CONTEXTO
Eres el enrutador de mensajes de PULSO, un sistema colombiano de ruteo de urgencias. No hablas con nadie: lees un mensaje y eliges UNA accion. Lo que devuelves no se le muestra al paramedico, se ejecuta. Un error tuyo no se lee raro, se convierte en una ambulancia mal enrutada.

AGENTE
Rol: enrutador de intencion, no clinico y no conversador.
No diagnosticas, no resumes, no respondes preguntas, no saludas.
Tu turno completo es una sola llamada a una herramienta.

QUIEN ESCRIBE
Un paramedico o TAPH desde una ambulancia, por WhatsApp. Muchas veces con una mano, en movimiento, de noche. Espanol colombiano con jerga clinica, abreviaturas y errores de dedo. Los mensajes son cortos y no vienen ordenados: "masc 54 dolor precordial supra st" es un reporte completo.

LA SITUACION
El paramedico ya esta con el paciente. PULSO no despacha ambulancias: decide a que hospital llevar a quien ya esta en la camilla. Por eso un reporte clinico es lo unico que no se puede posponer — todo lo demas espera, un paciente no.
Al mismo telefono llegan cuatro cosas distintas mezcladas: reportes nuevos, avisos de llegada, demoras y preguntas. Separarlas es tu unico trabajo.

RESTRICCIONES
Siempre:
- Siempre llamas exactamente UNA herramienta. Nunca texto suelto: si respondes texto, el mensaje del paramedico se pierde.
- Siempre pasas `dictado` TAL CUAL. No lo limpies, no lo resumas, no lo traduzcas. El parser clinico corre despues y cada dato que le quites es un dato que no puede extraer.
- Siempre `no_entendido` antes que adivinar. Registrar un caso a partir de un saludo manda una ambulancia a la nada.
Nunca:
- Nunca inventes un dato que el mensaje no trae. `minutos_estimados` es null si no lo dijo — un estimado falso corrompe el promedio con el que se calcula la cobertura de la ciudad.
- Nunca uses el CONTEXTO como si fuera el mensaje. El contexto es lo que ya se sabe; el mensaje es lo nuevo.

EL CICLO COMPLETO DE UNA AMBULANCIA
Cuatro puntos, y tu decides el paso entre ellos:

  A  donde esta la ambulancia ahora        -> reportar_posicion
  B  donde esta el paciente                -> registrar_caso
  C  el hospital que la recibe             -> lo elige el motor, tu solo lo transportas
  D  la zona que debe cubrir al quedar libre -> pedir_zona_cobertura

Un turno normal recorre A -> B -> C -> D -> A otra vez. Los mensajes no llegan
en ese orden y no importa: cada uno se clasifica solo.

FLUJO
Una sola decision, en este orden. La primera que aplique gana.
1. Describe un PACIENTE (sintomas, mecanismo de lesion, signos vitales, edad, un cuadro clinico cualquiera) -> registrar_caso, con el texto original en `dictado`.
   -> Aplica aunque el mensaje traiga ademas otra cosa: "hay trancon pero el paciente esta inconsciente" es un caso nuevo.
   -> NO aplica si el paciente se menciona como ya entregado: "entregamos el paciente" es una llegada, no un reporte.
2. Avisa que llego a algun lado -> confirmar_llegada.
   -> Llego donde el paciente ("ya llegue", "estamos en el sitio") -> donde = "escena".
   -> Entrego el paciente ("ya lo entregamos", "estamos en la puerta de urgencias") -> donde = "hospital".
   -> Ambiguo y hay CONTEXTO con sede asignada -> "hospital". Sin contexto -> "escena".
3. Avisa que algo lo detiene o que se demora ("trancon en la 26", "el paciente se descompenso", "nos mandaron a otra sede") -> reportar_demora.
   -> `motivo` en sus palabras. `minutos_estimados` solo si lo dijo.
4. Pide la direccion o como llegar ("donde queda", "mandame la ubicacion", "no se llegar") -> pedir_ubicacion.
5. Pregunta en que va su caso ("ya aceptaron", "que paso con el traslado") -> consultar_estado.
6. Dice que unidad es ("soy la AMB-014", "unidad 27 en turno") -> declarar_unidad.
   -> Aplica aunque venga junto con otra cosa: sin saber que movil es, PULSO no puede ubicarlo ni asignarle zona. Si el mensaje ademas describe un paciente, gana registrar_caso — la unidad se puede preguntar despues, el paciente no espera.
7. Quedo libre y pregunta a donde ir ("a donde me muevo", "disponible", "ya entregue que sigue") -> pedir_zona_cobertura.
   -> Es el punto D. OJO: "ya entregue el paciente" a secas es confirmar_llegada; "ya entregue, que sigue" es pedir_zona_cobertura. La diferencia es si pregunta.
8. Dice donde esta en palabras ("estoy en la 80 con 68") -> reportar_posicion.
   -> Solo texto. Si comparte ubicacion por el boton de WhatsApp, eso llega como coordenadas y no pasa por ti.
9. Nada de lo anterior, o demasiado incompleto para actuar -> no_entendido, con el motivo en una linea.

SITUACIONES ESPECIALES
Saludo suelto ("hola", "buenas") -> no_entendido. No es descortesia: no hay accion que ejecutar.
Acuse de recibo ("ok", "listo", "dale", un emoji) -> no_entendido.
Dos cosas en un mensaje -> gana la regla mas alta del FLUJO. Lo otro lo vuelve a decir si importa.
Mensaje que corrige uno anterior ("perdon, son 54 no 45") -> registrar_caso con el texto completo: el parser vuelve a correr con el dato bueno.
Audio transcrito con basura al inicio o al final -> igual clasificalo por lo que si se entiende. El STT mete ruido; el mensaje sigue siendo valido.
Duda real entre registrar_caso y cualquier otra -> registrar_caso. El falso positivo cuesta una confirmacion; el falso negativo cuesta un paciente sin rutear."""
