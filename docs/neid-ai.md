# Neid · AI / LLM

> Tú tienes las dos piezas que el jurado va a interrogar: el parser
> clínico (¿de verdad entiende medicina?) y el motor de inferencia
> (¿de dónde sacan la ocupación?). Prepara las dos respuestas.

---

## Dónde vive tu carril

Después del refactor de Zaid (todo el backend salió de Next a NestJS) el carril
quedó partido en dos, y el corte es a propósito:

| Pieza | Dónde vive | Por qué ahí |
|---|---|---|
| **Parser clínico** | `apps/backend/ai-core` (Python) | Es una llamada texto → JSON sin estado. La API key vive en un solo sitio. |
| **Motor de scoring** | `apps/backend/core` (TypeScript) | Necesita el estado de `AlmacenService`. Es aritmética, no IA. |

`core` intenta el triaje en ai-core **primero**, y si no puede sigue con su
camino de siempre:

```
ai-core (Claude)  →  Claude local en core  →  heurística por palabras clave
```

La respuesta trae `motor` (qué produjo la extracción) y `via` (dónde corrió).
**Míralos siempre**: antes la única pista de que estabas viendo la heurística
era `confianza == 0.35` exacto.

Es opt-in: sin `AI_CORE_BASE_URL` en `apps/backend/core/.env`, core resuelve
todo local y nada cambia. Con ella puesta, si ai-core se cae el endpoint
responde igual — esa garantía es del contrato y está cubierta por tests.

```bash
task dev                            # los tres servicios
curl localhost:3001/health/ai-core  # ¿la costura está viva?

cd apps/backend/ai-core && uv run pytest    # 84 tests
cd apps/backend/core    && pnpm test        # 34 tests
```

Tu trabajo no es construirlo: es **hacer que la rama del LLM sea claramente
mejor que la heurística**, y que el modelo de congestión se pueda defender ante
un médico.

## Tus archivos

| Archivo | Qué es |
|---|---|
| [`ai-core/app/triage.py`](../apps/backend/ai-core/app/triage.py) | Prompt del sistema, llamada a Claude, cinturón de seguridad, fallback. |
| [`ai-core/evals/corpus.py`](../apps/backend/ai-core/evals/corpus.py) | 14 dictados con sus asserts. Tu banco de pruebas. |
| [`core/src/scoring/scoring.service.ts`](../apps/backend/core/src/scoring/scoring.service.ts) | Score en minutos, `P(aceptación)`, rebote por sede. |
| [`core/src/scoring/congestion.service.ts`](../apps/backend/core/src/scoring/congestion.service.ts) | Índice de congestión, 4 señales. |
| [`core/src/ai-core/ai-core.client.ts`](../apps/backend/core/src/ai-core/ai-core.client.ts) | La costura. Único archivo de core que conoce la URL de ai-core. |
| [`core/src/triage/triage.service.ts`](../apps/backend/core/src/triage/triage.service.ts) | El respaldo en TypeScript. Corre cuando ai-core no está. |

⚠️ **El parser existe dos veces**, con prompts idénticos carácter por carácter.
**Si tocas el prompt o el catálogo REPS, tócalo en los dos** o divergen en
silencio. El día que ai-core sea el único camino, el de TypeScript se borra.

⚠️ **El motor también.** `core/src/scoring/*` es el que corre en el demo;
`ai-core/app/scoring.py` es el mismo modelo en Python y hoy nadie lo llama.
Sirve para probar el modelo aislado y de forma reproducible.

---

## Evaluar el parser

14 dictados con asserts defendibles ante un médico: los 3 del pitch más los
feos (voz sin tildes ni puntuación, jerga como *SCACEST* y *TEC* con
anisocoria, truncados, sin edad ni sexo, ambiguos entre dos niveles, neonato vs.
pediátrico vs. adulto, obstétrico, intoxicación sin código REPS propio, y dos
trampas de sobre-pedido).

```bash
cd apps/backend/ai-core
uv run python -m evals.run --heuristica       # línea base MEDIDA: 4/14
uv run python -m evals.run                    # la rama de Claude
uv run python -m evals.run --esfuerzo medium  # ¿mejora si subo el effort?
uv run python -m evals.run --filtro trampa    # solo el sobre-pedido
```

La heurística falla exactamente donde debe: pide UCI de adultos para una
apendicitis estable, no reconoce `SCACEST` sin tildes, manda UCI de adultos a
un neonato. **Ese 4/14 es tu número de comparación** — si la rama del LLM no
gana por mucho, no hay nada que defender en el pitch.

---

## El rebote ahora se aprende por sede

`PENALIZACION_REBOTE = 22` era una constante global para todos los hospitales
de Bogotá, y este doc mismo admitía que era *"juicio informado, no medición"*.

Ahora está descompuesto en sus dos mitades, y solo una es observable:

```
rebote(sede) = espera_de_respuesta(sede)   ← SÍ lo medimos: handshake.latenciaS
             + SOBRECOSTO_REBOTE (18 min)  ← descargar, re-llamar, re-rutear
```

Sobre la mitad observable va el mismo encogimiento hacia el prior que usa
`P(aceptación)`: con cero handshakes devuelve **exactamente 22 minutos** —el
número que ya está en el pitch no se mueve— y cada respuesta observada lo
acerca a lo que esa sede hace de verdad. Una sede que contesta en 40 segundos
cuesta menos rebotarla que una que se demora ocho minutos.

Para el pitch: convierte *"asumimos 22 minutos"* en *"arrancamos en 22 y cada
handshake lo calibra por hospital, sin pedirle nada al hospital"*. Es la misma
tesis del rechazo-como-sensor, aplicada al tiempo.

**Ojo con la dependencia:** se alimenta de `handshake.latenciaS`, que hoy vive
solo en memoria. Al reiniciar core, la calibración vuelve al prior. Ver el
hallazgo abierto en [zaid-backend.md](zaid-backend.md).

---

## Lo que ya está resuelto (no lo reconstruyas)

- **Modelo:** `claude-opus-5`, `effort: "low"` para latencia — ese número sale en el pitch.
- **Salida estructurada:** `client.messages.parse()` + `zodOutputFormat(EsquemaExtraccion)`. Nada de parsear JSON a mano.
- **Cinturón de seguridad:** los `serviciosRequeridos` que devuelve el modelo se filtran contra `SERVICIOS_SELECCIONABLES`. Si alucina un código, se descarta silenciosamente.
- **Fallback total:** si Claude falla, revienta o no hay key, entra `extraccionHeuristica()` con `confianza: 0.35`. **El endpoint nunca devuelve error por falta de credencial.**

⚠️ Requiere `zod` **v4** (`@anthropic-ai/sdk/helpers/zod` no acepta zod 3). Ya está instalado así — no lo bajes.

---

## Tareas

### Bloque 1 · H2–H10 — que el parser sea bueno de verdad

- [ ] **Conseguir la API key** y verificar que la rama de Claude entra (la `confianza` sube de 0.35).
- [ ] **Montar fixtures.** Los 3 dictados de [`apps/backend/core/src/sedes/semillas.ts`](../apps/backend/core/src/sedes/semillas.ts) (`DICTADOS_DEMO`) traen su salida esperada. Escribe un script que corra los 3 y compare. No necesitas un framework de tests — un `.mjs` que imprima ✅/❌ es suficiente y lo vas a correr 40 veces.
- [ ] **Escribir 8–10 dictados más**, incluyendo los feos: transcripción de voz con errores, jerga (*"paciente con SCACEST"*), dictados truncados, casos ambiguos. Los bonitos ya funcionan; los feos son los que rompen el demo en vivo.
- [ ] **Calibrar el sobre-pedido de servicios.** El error más caro del parser: pedir UCI cuando no hace falta descarta sedes viables y el ranking sale vacío. Un ranking vacío en el escenario es el peor escenario posible. El prompt ya lo advierte — verifica que obedece.
- [ ] **Medir la latencia.** Si `effort: "low"` con `claude-opus-5` no baja de ~2s, es el cuello de botella del número del pitch. Mide antes de optimizar.

### Bloque 2 · H10–H20 — el motor

- [ ] **Calibrar `PENALIZACION_REBOTE` (22 min) y `ESPERA_PUERTA_MAX` (25 min).** Ahora mismo son juicio informado, no medición. Busca una cifra citable de tiempo de rebote / espera en puerta en urgencias en Colombia. **Una fuente real vale más que un número afinado.** Si no la encuentras en 30 minutos, déjalos y **di en el pitch que son parámetros calibrables, no verdades**. Eso genera confianza; fingir precisión la destruye.
- [ ] **Revisar los pesos de congestión** en `PESOS`. `rechazoReciente` pesa 0.35 — es el más alto a propósito, porque es la única señal viva. Defiende esa decisión, no la escondas.
- [ ] **Verificar que el aprendizaje se ve.** Despacha, rechaza, vuelve a matchear: `pAceptacion` de esa sede debe bajar y su congestión subir. Si no se mueve lo suficiente para notarse en pantalla, sube `FUERZA_PRIOR`… **al revés**: bájalo (menos prior = los datos mandan más rápido). Ajústalo hasta que 1 rechazo se vea, pero sin que el modelo quede ridículo.
- [ ] **`presionEpidemiologica()` es un stub honesto** (estacional). El upgrade real es cruzar con SIVIGILA/INS. **Si no da tiempo, déjalo y dilo tal cual en el pitch.** Un stub declarado es integridad; un stub disfrazado es lo que un jurado técnico caza.

### Bloque 3 · H20+ — preparar el interrogatorio

- [ ] Tener listas, en una tarjeta, las respuestas a:
  - *"¿De dónde sacan la ocupación en tiempo real?"* → la respuesta está abajo. **Apréndetela.**
  - *"¿Qué pasa si el LLM se equivoca en el CIE-10?"* → el CIE-10 es informativo; el **filtro duro** corre sobre `serviciosRequeridos`, y el médico receptor ve el resumen completo y decide. El LLM no diagnostica: prepara la decisión de un humano.
  - *"¿Por qué Claude y no un clasificador entrenado?"* → no hay dataset etiquetado de dictados de ambulancia en español colombiano. El LLM da cobertura desde el día 1; los handshakes que PULSO acumula **son** el dataset para entrenar después. Es un camino, no una excusa.

---

## La respuesta que decide el pitch

Alguien **va a preguntar** de dónde sale la ocupación. Es tu momento, no tu problema.

**No digas** "inferimos ocupación en tiempo real por telemetría". No la tenemos y un jurado médico lo huele en dos segundos.

**Di esto, que es más fuerte porque es cierto:**

> En 36 horas no construimos un sensor de camas. Construimos algo mejor: un sistema donde **el acto de rechazar ya es el sensor**. Hoy ese rechazo se pierde en una llamada telefónica. Nosotros lo capturamos, lo fechamos y lo convertimos en el prior de la siguiente decisión — sin pedirle al hospital que tipee nada.
>
> Y el reporte manual ya se intentó: el registro *diario* de ocupación del Ministerio tiene 8.389 filas y **una sola fecha, noviembre de 2022**. Se apagó cuando terminó el mandato.

---

## Cómo pruebas lo tuyo

```bash
curl -s -X POST localhost:3001/triage -H "Content-Type: application/json" \
  -d '{"texto":"Femenina de 68 anos, hemiparesia derecha subita hace 50 minutos, afasia, Glasgow 13, FA conocida."}'
```

Asserts:

- [ ] IAM con supra ST → `triage: 2`, `serviciosRequeridos` contiene `743` y `110`
- [ ] ACV → contiene `245`, `110`
- [ ] Politrauma pediátrico → contiene `109` (no `110`), `requiereMedicoABordo: true`
- [ ] Ningún código fuera de `SERVICIOS_SELECCIONABLES`
- [ ] Dictado truncado ("paciente con dolor") → `confianza < 0.5`, y **no** inventa un CIE-10
- [ ] Ante duda entre dos niveles de triage, escoge el más grave

---

## Trampas conocidas

**Sobre-pedir servicios vacía el ranking.** Es el fallo más caro y el más silencioso: no da error, simplemente no hay candidatos. Si en un ensayo el ranking sale vacío, mira `serviciosRequeridos` **antes** de mirar el matching.

**No confundas `triage` con `complejidadRequerida`.** Triage es urgencia temporal (Res. 5596/2015); complejidad es capacidad instalada (Res. 3100/2019). Un triage I puede resolverse en complejidad media; un triage III puede exigir complejidad alta. Son ejes distintos y el prompt los trata por separado.

**`effort: "low"` es una decisión de latencia, no de costo.** Si la calidad de extracción falla en los dictados feos, **súbelo a `"medium"` y mide de nuevo** — el pitch aguanta 2 segundos más; no aguanta una extracción equivocada en vivo.

**La heurística se te va a colar.** Si `ANTHROPIC_API_KEY` no está cargada en el entorno del server (no basta editar `.env.local` sin reiniciar `pnpm dev`), todo sigue funcionando con la heurística y parece que el LLM anda. **Revisa siempre `confianza`**: 0.35 exacto = estás viendo la heurística.
