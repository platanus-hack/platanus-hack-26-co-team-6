# Neid · AI / LLM

> Tú tienes las dos piezas que el jurado va a interrogar: el parser
> clínico (¿de verdad entiende medicina?) y el motor de inferencia
> (¿de dónde sacan la ocupación?). Prepara las dos respuestas.

---

## Dónde vive tu carril: `apps/backend/ai-core`

**Cambió desde la versión anterior de este doc.** Tus cuatro piezas estaban en
`apps/frontend/lib/`. Ahora existen también en `apps/backend/ai-core`, en
Python, y ese es el sitio donde se trabaja. El frontend sigue funcionando
igual — no se tocó nada allá.

```bash
cd apps/backend/ai-core
uv sync
uv run fastapi dev app/main.py     # :8000
uv run pytest                       # 84 tests, sin red
```

| Ruta | Qué hace | Equivale a |
|---|---|---|
| `POST /v1/triage` | dictado → entidades clínicas | `/api/triage` |
| `POST /v1/score` | filtro duro + ranking en minutos | paso 3 de `/api/match` |

`/v1/score` **no** busca sedes ni calcula ETA: eso es de Zaid y se queda en
`/api/match`. Recibe `caso + sedes + etas + senales` y devuelve `candidatos`.
Es una función pura — ai-core no tiene base de datos a propósito.

## Tus archivos

| Archivo | Qué es |
|---|---|
| [`ai-core/app/triage.py`](../apps/backend/ai-core/app/triage.py) | Prompt del sistema, llamada a Claude, cinturón de seguridad, fallback. |
| [`ai-core/app/scoring.py`](../apps/backend/ai-core/app/scoring.py) | Score en minutos, `P(aceptación)` Beta-Bernoulli, rebote por sede. |
| [`ai-core/app/congestion.py`](../apps/backend/ai-core/app/congestion.py) | Índice de congestión, 4 señales. |
| [`ai-core/app/servicios_reps.py`](../apps/backend/ai-core/app/servicios_reps.py) | Catálogo FHIR de MinSalud + filtros duros. |
| [`ai-core/evals/corpus.py`](../apps/backend/ai-core/evals/corpus.py) | 14 dictados con sus asserts. |
| Los originales en `apps/frontend/lib/` | Siguen ahí, funcionando. Deuda conocida: dos motores. |

⚠️ **Hay dos parsers clínicos en el repo.** Este y el de TypeScript. Mientras
convivan, un cambio en el prompt o en el catálogo REPS hay que hacerlo en los
dos lados o divergen en silencio. Cuando el frontend migre a llamar a `core`,
se borran los cuatro archivos de `lib/`.

---

## Lo que ya está resuelto (no lo reconstruyas)

- **Modelo:** `claude-opus-5`, `effort: "low"` para latencia — ese número sale
  en el pitch. Configurable por `.env` (`MODELO_TRIAGE`, `ESFUERZO_TRIAGE`).
- **Salida estructurada:** `client.messages.parse()` con `output_format=` de un
  modelo Pydantic. Nada de parsear JSON a mano.
- **Cinturón de seguridad:** los `serviciosRequeridos` que devuelve el modelo se
  filtran contra `SERVICIOS_SELECCIONABLES`. Si alucina un código, se descarta
  silenciosamente.
- **Fallback total:** si Claude falla, revienta o no hay key, entra
  `extraccion_heuristica()` con `confianza: 0.35`. **El endpoint nunca devuelve
  error por falta de credencial.**
- **`motor` en la respuesta:** `"claude"` o `"heuristica"`. Campo nuevo, no
  estaba en el contrato. Sin él, la única pista de que estabas viendo la
  heurística era `confianza == 0.35` exacto.
- **El contrato sale en camelCase** (`serviciosRequeridos`, `dxCie10`) para
  espejar `types.ts`, que es ley. Serializa con `by_alias=True` o lo rompes.

---

## Tareas

### Bloque 1 · el parser

- [x] **Montar fixtures.** `evals/corpus.py` tiene 14 dictados: los 3 de
      `DICTADOS_DEMO` más 11 feos.
- [x] **Escribir 8–10 dictados más**, incluyendo los feos: voz sin tildes ni
      puntuación, jerga (*SCACEST*, *TEC* + anisocoria), truncados, sin edad ni
      sexo, ambiguos entre dos niveles, neonato vs. pediátrico vs. adulto,
      obstétrico, intoxicación sin código REPS propio, y **dos trampas de
      sobre-pedido**.
- [ ] 🔴 **Conseguir la API key.** Es lo único que bloquea el resto del bloque.
      Ponla en `apps/backend/ai-core/.env` y verifica que `motor` diga
      `"claude"`.
- [ ] **Correr el corpus y comparar contra la línea base.**
      ```bash
      uv run python -m evals.run --heuristica     # línea base medida: 4/14
      uv run python -m evals.run                  # la rama de Claude
      ```
      La heurística falla exactamente donde debe: pide UCI de adultos para una
      apendicitis estable, no reconoce `SCACEST` sin tildes, manda UCI de
      adultos a un neonato. **Ese 4/14 es tu número de comparación.**
- [ ] **Calibrar el sobre-pedido de servicios.** El error más caro del parser:
      pedir UCI cuando no hace falta descarta sedes viables y el ranking sale
      vacío. Hay dos dictados dedicados a esto — filtra con
      `uv run python -m evals.run --filtro trampa`.
- [ ] **Medir la latencia.** El runner ya imprime mediana y máximo. Si `low` no
      baja de ~2s, es el cuello de botella del número del pitch. Mide antes de
      optimizar; si la calidad falla, `--esfuerzo medium` y mide de nuevo.

### Bloque 2 · el motor

- [x] **`PENALIZACION_REBOTE` ya no es una constante global.** Ver abajo.
- [x] **Verificar que el aprendizaje se ve.** Hay un test que falla si un
      rechazo mueve el score menos de 1 minuto — el mínimo que un jurado
      alcanza a leer en pantalla. `FUERZA_PRIOR = 10` también está pinneado:
      si sube, el aprendizaje se vuelve invisible.
- [ ] **Calibrar `ESPERA_PUERTA_MAX` (25 min).** Sigue siendo juicio informado,
      no medición. Busca una cifra citable de espera en puerta de urgencias en
      Colombia. **Una fuente real vale más que un número afinado.** Si no la
      encuentras en 30 minutos, déjalo y **di en el pitch que son parámetros
      calibrables, no verdades**. Eso genera confianza; fingir precisión la
      destruye.
- [ ] **Revisar los pesos de congestión** en `PESOS`. `rechazo_reciente` pesa
      0.35 — es el más alto a propósito, porque es la única señal viva.
      Defiende esa decisión, no la escondas.
- [ ] **`presion_epidemiologica()` es un stub honesto** (estacional). El upgrade
      real es cruzar con SIVIGILA/INS. **Si no da tiempo, déjalo y dilo tal cual
      en el pitch.** Un stub declarado es integridad; un stub disfrazado es lo
      que un jurado técnico caza.

### Bloque 3 · preparar el interrogatorio

- [ ] Tener listas, en una tarjeta, las respuestas a:
  - *"¿De dónde sacan la ocupación?"* → la respuesta está abajo. **Apréndetela.**
  - *"¿Qué pasa si el LLM se equivoca en el CIE-10?"* → el CIE-10 es
    informativo; el **filtro duro** corre sobre `serviciosRequeridos`, y el
    médico receptor ve el resumen completo y decide. El LLM no diagnostica:
    prepara la decisión de un humano.
  - *"¿Por qué Claude y no un clasificador entrenado?"* → no hay dataset
    etiquetado de dictados de ambulancia en español colombiano. El LLM da
    cobertura desde el día 1; los handshakes que PULSO acumula **son** el
    dataset para entrenar después. Es un camino, no una excusa.

---

## El rebote ahora se aprende por sede

Antes: `PENALIZACION_REBOTE = 22`, igual para todos los hospitales de Bogotá.
Este doc mismo admitía que era *"juicio informado, no medición"*.

Ahora está descompuesto en sus dos mitades, y solo una es observable:

```
rebote(sede) = espera_de_respuesta(sede)   ← SÍ lo medimos: handshake.latencia_s
             + SOBRECOSTO_REBOTE (18 min)  ← descargar, re-llamar, re-rutear
```

Sobre la mitad observable va el mismo encogimiento hacia el prior que usa
`P(aceptación)`: con cero handshakes devuelve **exactamente 22 minutos** —el
número que ya está en el pitch no cambia—, y cada respuesta observada lo mueve
hacia lo que esa sede hace de verdad. Una sede que contesta en 40 segundos
cuesta menos rebotarla que una que se demora ocho minutos.

Por qué importa en el pitch: convierte *"asumimos 22 minutos"* en *"arrancamos
en 22 y cada handshake lo calibra por hospital, sin pedirle nada al hospital"*.
Es la misma tesis del rechazo-como-sensor, aplicada al tiempo.

**Dependencia:** necesita `senales[codigo].latenciasRespuestaMin` en el request,
que sale de la tabla `handshake`. Hoy esa tabla no se está escribiendo — ver el
hallazgo en [zaid-backend.md](zaid-backend.md). Sin eso, el motor corre igual
pero con el prior de siempre.

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
cd apps/backend/ai-core
uv run fastapi dev app/main.py

curl -s -X POST localhost:8000/v1/triage -H "Content-Type: application/json" \
  -d '{"texto":"Femenina de 68 anos, hemiparesia derecha subita hace 50 minutos, afasia, Glasgow 13, FA conocida."}'
```

Asserts (los 6 primeros están automatizados en `evals/corpus.py`):

- [ ] IAM con supra ST → `triage: 2`, `serviciosRequeridos` contiene `743` y `110`
- [ ] ACV → contiene `245`, `110`
- [ ] Politrauma pediátrico → contiene `109` (no `110`), `requiereMedicoABordo: true`
- [ ] Ningún código fuera de `SERVICIOS_SELECCIONABLES`
- [ ] Dictado truncado ("paciente con dolor") → `confianza < 0.5`, y **no** inventa un CIE-10
- [ ] Ante duda entre dos niveles de triage, escoge el más grave
- [ ] `motor` dice `"claude"`, no `"heuristica"`

---

## Trampas conocidas

**Sobre-pedir servicios vacía el ranking.** Es el fallo más caro y el más silencioso: no da error, simplemente no hay candidatos. Si en un ensayo el ranking sale vacío, mira `serviciosRequeridos` **antes** de mirar el matching.

**No confundas `triage` con `complejidadRequerida`.** Triage es urgencia temporal (Res. 5596/2015); complejidad es capacidad instalada (Res. 3100/2019). Un triage I puede resolverse en complejidad media; un triage III puede exigir complejidad alta. Son ejes distintos y el prompt los trata por separado.

**`effort: "low"` es una decisión de latencia, no de costo.** Si la calidad de extracción falla en los dictados feos, **súbelo a `"medium"` y mide de nuevo** — el pitch aguanta 2 segundos más; no aguanta una extracción equivocada en vivo.

**La heurística se te va a colar.** Antes la única pista era `confianza: 0.35`. Ahora la respuesta trae `motor` — míralo. Y recuerda que `.env` se lee al arrancar el proceso: editarlo sin reiniciar `fastapi dev` no hace nada.

**El score depende de la hora.** La curva horaria de congestión cambia el ranking entre las 3 a.m. y las 8 p.m. Para tests y para el video de respaldo, manda `ahora` en el request de `/v1/score` y es reproducible al minuto.
