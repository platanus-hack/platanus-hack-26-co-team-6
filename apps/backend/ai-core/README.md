# ai-core

Servicio de IA de PULSO. Interno: lo llama `core` (:3001), nunca el navegador
— por eso no tiene CORS. Las credenciales de proveedor viven aquí y solo aquí.

```bash
uv sync
uv run fastapi dev app/main.py     # :8000
uv run pytest                      # 52 tests, sin red
```

## Qué expone

| Ruta | Qué hace |
|---|---|
| `GET /health` | Liveness. No toca nada aguas abajo. |
| `POST /v1/triage` | Dictado (texto **o audio**) → entidades clínicas estructuradas. |
| `POST /v1/score` | Filtro duro + ranking en minutos. Sin estado. |
| `POST /v1/transcribir` | Audio → texto. Deepgram o ElevenLabs. |
| `POST /v1/transcribir/archivo` | Lo mismo, con `curl -F`. Para probar a mano. |
| `POST /v1/hablar` | Texto → audio (TTS). Devuelve bytes, no JSON. |
| `GET /v1/voz` | Qué hay disponible de voz, en los dos sentidos. |

```bash
curl -s -X POST localhost:8000/v1/triage -H "Content-Type: application/json" \
  -d '{"texto":"Femenina de 68 anos, hemiparesia derecha subita hace 50 minutos, afasia, Glasgow 13, FA conocida."}'
```

## El parser clínico

Dos ramas, y la respuesta **siempre** dice cuál corrió:

| `motor` | Qué es | Cuándo |
|---|---|---|
| `claude` | `claude-opus-5` + structured outputs (`messages.parse` con Pydantic) | Hay `ANTHROPIC_API_KEY` |
| `heuristica` | Palabras clave, `confianza: 0.35` | No hay key, o Claude falló |

El campo `motor` existe porque sin él la única pista de que estabas viendo la
heurística era `confianza == 0.35` exacto — y eso se pasa por alto justo
cuando importa.

**Cinturón de seguridad:** los `serviciosRequeridos` que devuelve el modelo se
filtran contra `SERVICIOS_SELECCIONABLES`. Un código alucinado no da error:
simplemente ninguna sede lo tiene y el ranking sale **vacío**. Es el fallo más
caro del sistema y el más silencioso.

## Audio: el paso que Claude no puede dar

La API de Claude recibe texto, imágenes y PDFs — **no audio**. Una nota de voz
de WhatsApp necesita transcripción antes de que el parser vea nada.

**ElevenLabs cubre los dos lados con la misma llave**, y por eso es el default:

| | Endpoint | Autenticación |
|---|---|---|
| STT | `POST /v1/speech-to-text` (multipart, `scribe_v2`) | `xi-api-key` |
| TTS | `POST /v1/text-to-speech/{voice_id}` (JSON, `eleven_multilingual_v2`) | `xi-api-key` |

**Deepgram sigue disponible** como plan B de una sola variable
(`STT_PROVEEDOR=deepgram`) si ElevenLabs limita o la llave no llega. Su
autenticación es distinta y es el error de integración más común:
`Authorization: **Token** <key>` — no "Bearer". Está cubierto por tests.

```bash
curl localhost:8000/v1/voz                       # ¿qué hay disponible?
curl -F archivo=@nota.ogg localhost:8000/v1/transcribir/archivo
curl -X POST localhost:8000/v1/hablar -H 'Content-Type: application/json' \
  -d '{"texto":"La ambulancia no ha reportado."}' --output aviso.mp3
```

`POST /v1/hablar` devuelve **bytes de audio, no JSON**: es un archivo, y
envolverlo en base64 le agregaría 33% de peso a algo que quien llama manda tal
cual por la red telefónica.

⚠️ **ai-core no marca teléfonos.** Devuelve el audio; quien haga la llamada
(Twilio, Kapso) vive en `core`.

⚠️ **Aquí no hay heurística a la que caer.** Todo el resto de PULSO degrada con
gracia cuando falta una credencial; esto no puede — sin proveedor no hay texto,
y sin texto no hay triaje. Por eso devuelve **503 explícito** en vez de fingir.

Corolario para el demo: **el dictado desde la PWA usa Web Speech API en el
navegador** — gratis, instantáneo y sin dependencias. Esto sólo hace falta para
el audio que entra por WhatsApp.

`POST /v1/triage` acepta `audioBase64` y hace STT + extracción en **una sola
llamada**, porque WhatsApp ya paga suficientes saltos de red. Si mandas `texto`
y audio a la vez, gana el texto: quien ya transcribió sabe algo que nosotros no.

## El contrato es camelCase a propósito

`app/schemas.py` espeja [`apps/frontend/lib/types.ts`](../../frontend/lib/types.ts),
que es ley compartida por los cuatro carriles. Adentro de Python se lee en
snake_case; en el cable sale `serviciosRequeridos`, `dxCie10`, `requiereMedicoABordo`.
Así el frontend puede pasar de su propio `/api/triage` a este servicio sin
tocar un solo tipo de TypeScript.

Serializa siempre con `by_alias=True` o rompes el contrato.

## Evaluar el parser

14 dictados con asserts defendibles ante un médico — los 3 del pitch más los
feos (voz sin tildes, jerga como *SCACEST*, truncados, ambiguos, y el caso
estable que **no** debe pedir UCI).

```bash
uv run python -m evals.run --heuristica          # línea base: 4/14
uv run python -m evals.run                       # rama Claude
uv run python -m evals.run --esfuerzo medium     # ¿mejora si subo el effort?
uv run python -m evals.run --filtro trampa       # solo un subconjunto
```

La comparación contra `--heuristica` es el punto: si la rama del LLM no gana
por mucho, no hay nada que defender en el pitch.

## Mapa

| Archivo | Qué es |
|---|---|
| `app/triage.py` | Prompt del sistema, llamada a Claude, cinturón de seguridad, fallback |
| `app/triage_heuristico.py` | Extractor por palabras clave. La red de seguridad |
| `app/servicios_reps.py` | Catálogo REPS de MinSalud + filtro duro |
| `app/schemas.py` | El contrato. Espeja `types.ts` |
| `app/routers/triage.py` | `POST /v1/triage` |
| `evals/corpus.py` | Los 14 dictados y qué debe cumplir cada uno |
