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
| `POST /v1/triage` | Dictado en crudo → entidades clínicas estructuradas. |

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
