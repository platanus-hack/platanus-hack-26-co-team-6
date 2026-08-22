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
| `GET /v1/stt` | Qué proveedor de STT correría ahora mismo. |

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

Dos proveedores detrás de la misma interfaz; cambiar es una variable de
entorno, no un refactor:

| Proveedor | Endpoint | Autenticación |
|---|---|---|
| Deepgram | `POST /v1/listen`, bytes crudos | `Authorization: Token <key>` — **"Token", no "Bearer"** |
| ElevenLabs | `POST /v1/speech-to-text`, multipart | header `xi-api-key` — **no** Authorization |

Esos dos detalles de auth son los errores de integración más comunes con estas
APIs y están cubiertos por tests.

```bash
curl localhost:8000/v1/stt                       # ¿hay proveedor?
curl -F archivo=@nota.ogg localhost:8000/v1/transcribir/archivo
```

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
