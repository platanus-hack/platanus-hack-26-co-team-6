# Neid · AI / LLM

> Tú tienes las dos piezas que el jurado va a interrogar: el parser
> clínico (¿de verdad entiende medicina?) y el motor de inferencia
> (¿de dónde sacan la ocupación?). Prepara las dos respuestas.

---

## Tu punto de partida

Ya funciona. `/api/triage` extrae entidades estructuradas con Claude vía structured outputs, y cae a un extractor heurístico si no hay API key. `lib/scoring.ts` y `lib/congestion.ts` implementan el modelo completo.

Tu trabajo no es construirlo: es **hacer que la rama del LLM sea claramente mejor que la heurística**, y que el modelo de congestión se pueda defender ante un médico.

## Tus archivos

| Archivo | Qué es |
|---|---|
| [`app/api/triage/route.ts`](../app/api/triage/route.ts) | Parser clínico. Esquema Zod + prompt + fallback heurístico. |
| [`lib/scoring.ts`](../lib/scoring.ts) | Score en minutos, `P(aceptación)` Beta-Bernoulli. |
| [`lib/congestion.ts`](../lib/congestion.ts) | Índice de congestión, 4 señales. |
| [`lib/servicios-reps.ts`](../lib/servicios-reps.ts) | Catálogo FHIR de MinSalud + filtros duros. |

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
- [ ] **Montar fixtures.** Los 3 dictados de [`lib/mock.ts`](../lib/mock.ts) (`DICTADOS_DEMO`) traen su salida esperada. Escribe un script que corra los 3 y compare. No necesitas un framework de tests — un `.mjs` que imprima ✅/❌ es suficiente y lo vas a correr 40 veces.
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
curl -s -X POST localhost:3000/api/triage -H "Content-Type: application/json" \
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

**La heurística se te va a colar.** Si `ANTHROPIC_API_KEY` no está cargada en el entorno del server (no basta editar `.env.local` sin reiniciar `npm run dev`), todo sigue funcionando con la heurística y parece que el LLM anda. **Revisa siempre `confianza`**: 0.35 exacto = estás viendo la heurística.
