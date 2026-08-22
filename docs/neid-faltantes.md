# Neid · Faltantes

> 📌 **Documento de la hackathon (ago 2026).** Conserva contexto útil, pero **algunas rutas de archivo ya cambiaron**.
> El plan vigente está en [`docs/README.md`](README.md) y las tareas en [`docs/tareas/neid.md`](tareas/neid.md).

Lo que está a medias, lo que está bloqueado y lo que decidí NO hacer.
Complemento de [neid-ai.md](neid-ai.md), que dice lo que sí está.

Última actualización: rama `feat/ai-core-integracion` (PR #6).

## ✅ Cerrado en esta ronda

- **Nadie vigilaba el reloj.** `VigilanteService` en core barre cada 5s:
  vence handshakes sin respuesta (el estado `timeout` que nadie escribía
  nunca), **re-rutea solo** al siguiente candidato, y detecta traslados que se
  pasan de 1.5x su ETA para disparar la llamada de seguimiento.
- **El bucle no se cerraba.** `core` ahora conoce el servicio `voz`: cuando el
  hospital acepta o rechaza, el paramédico recibe el aviso por WhatsApp con la
  ubicación. Era el momento 1:50 del guion, el del cronómetro.
- **Bug encontrado y arreglado:** `voz` creaba el caso llamando a ai-core
  directo y después pedía `/dispatch` a core — que busca el caso en SU
  almacén y respondía **404 siempre**. Ahora va por `core.triage`, que además
  hace viajar el teléfono hasta el `Caso`.
- **El ETA se botaba.** Se calculaba al despachar, se mostraba y se perdía.
  Ahora se guarda en el handshake (`etaMinAlDespachar`): es la línea base sin
  la cual no existe "demora" que medir.

---

## 🔴 Bloqueado por credenciales

Nada de esto es trabajo pendiente: es trabajo hecho esperando una llave.

| Qué | Falta | Sin eso |
|---|---|---|
| Rama de Claude en el triaje | `ANTHROPIC_API_KEY` | Todo corre con la heurística (`confianza: 0.35`). El corpus mide la heurística contra sí misma. |
| Transcripción de notas de voz | `ELEVENLABS_API_KEY` | `/v1/transcribir` responde 503. La PWA sigue transcribiendo gratis con Web Speech API. |
| Llamada de seguimiento | Twilio + `URL_PUBLICA` | `/telefonia/llamar` responde 503 diciendo qué falta. |
| WhatsApp de verdad | `WHATSAPP_TOKEN` + `PHONE_NUMBER_ID` | El canal loguea y sigue; no manda nada. |

**El número de referencia que sí existe:** la heurística saca **4/14** en el
corpus. Cuando entre la key de Anthropic, `uv run python -m evals.run` dice
cuánto gana Claude y con qué latencia. Ese delta es el argumento del pitch.

---

## ⚠️ Deuda que dejé al mezclar con main

**`voz` se autentica contra core con la contraseña de turno.** Zaid puso un
guard global que niega por defecto — bien puesto, core expone dictado clínico
y coordenadas del paciente. Para que el flujo de WhatsApp no muriera en 401,
`voz` hace `POST /auth/login` con `CORE_PASSWORD` y reusa el token.

Funciona y no toca el diseño de nadie, pero **un servicio autenticándose con
la contraseña compartida de los operadores no distingue quién hizo qué en la
auditoría**. Lo correcto es un token de servicio propio (`sub: 'voz'`), que
son pocas líneas en `sesion.service.ts`. Carril de Zaid.

---

## ⚠️ A medias, con la mitad que falta identificada

### El puente de audio de la llamada

`WS /telefonia/twilio` acepta la conexión de Twilio y la cierra limpio, pero
no conecta con ningún agente de voz.

**Está sin hacer porque hay una decisión abierta**, no por falta de tiempo:

| Opción | A favor | En contra |
|---|---|---|
| **ElevenLabs Agents** | Misma llave que ya usamos para STT y TTS. Dos agentes ya diseñados. | Otra plataforma que aprender. |
| **Voice Agent de Deepgram** | STT + LLM + TTS en una sola conexión. Voces `aura-2-*-es` con acento colombiano. Ya lo hicimos en Tequendama. | El LLM se configura con BYOK en la consola de Deepgram, no en el código. |

Montar los dos es trabajo perdido. **Decidir esto desbloquea el último tramo.**

### La rama de APOYO del agente de seguimiento

En `app/agente/prompts/agente_seguimiento.txt` hay una sección `APOYO` que
dice explícitamente que está sin definir.

Cuando un paramédico pide apoyo en la llamada, **PULSO no tiene a quién
escalar**: no hay integración con el CRUE ni con el 123. El prompt reconoce,
no promete, y lo devuelve al canal que sí funciona.

**Pendiente de producto, no de código:** a quién escala, con qué tiempo de
respuesta, y quién lo recibe. Hasta que eso exista, prometer apoyo en una
llamada a alguien con un paciente complicado es peor que no ofrecerlo.

### El registro de demoras que reporta el paramédico

Ojo, son dos cosas distintas y sólo una está hecha:

- ✅ **Demora detectada por el reloj** (el traslado se pasó de su ETA): el
  vigilante la ve y dispara la llamada.
- ❌ **Demora que el paramédico reporta él mismo** ("hay trancón"): se
  clasifica bien y se le responde, pero el dato **sólo queda en el log**.
  Cuando `core` exponga dónde guardarlo, se manda allá.

---

## 🔁 Duplicación deliberada, con fecha de vencimiento

**El parser clínico existe dos veces:** `ai-core/app/triage.py` (Python) y
`core/src/triage/triage.service.ts` (TypeScript), con prompts idénticos
carácter por carácter. El de TS es el respaldo cuando ai-core no está.

**El motor de scoring también:** `core/src/scoring/` es el que corre en el
demo; `ai-core/app/scoring.py` es el mismo modelo en Python y hoy nadie lo
llama.

⚠️ **Si tocas el prompt o el catálogo REPS, tócalo en los dos** o divergen en
silencio. El día que ai-core sea el único camino, se borran los de TS.

**El contrato de tipos también está duplicado:** `core/src/contracts/types.ts`
es el dueño y `apps/frontend/lib/types.ts` es un espejo manual. Un cambio en
un solo lado no rompe el build — rompe el runtime, que es peor.

---

## 🧠 Estado en memoria (afecta a tres servicios)

Ni `core` ni `voz` persisten nada. Es el mismo hallazgo en tres lugares:

| Dónde | Qué se pierde | Consecuencia |
|---|---|---|
| `core/src/almacen/` | Casos y handshakes | El "dataset que se auto-etiqueta" se borra al reiniciar |
| `voz/app/sesiones.py` | Qué caso es de qué teléfono | Con 2 instancias, el "¿dónde queda?" responde vacío |
| Latencias por sede | La calibración del rebote | Vuelve al prior de 22 min en cada reinicio |

El arreglo es uno solo y es del carril de Zaid: escribir `caso` y `handshake`
en Supabase. Las tablas ya existen con sus índices. Detalle en
[zaid-backend.md](zaid-backend.md).

---

## ❌ Decidido NO hacer, y por qué

**Cobertura de flota y reposicionamiento de ambulancias.** No hay entidad de
móvil en el repo ni viajes propios de los cuales sacar un q10/q90.

⚠️ **Esto cambió parcialmente:** main ahora trae `data/llamadas_123/` (9.200
filas), `data/tiempo_promedio/` y `data/razon_ambulancias/`. Eso es demanda
histórica y tiempos reales — justo el insumo que yo daba por inexistente. Ya
no es cierto que "no hay datos"; sigue siendo cierto que no hay entidad de
móvil ni tiempo para construirla. Y reposicionar
ambulancias *es* la función operativa del CRUE (Res. 1220/2010), lo que
debilita la mejor respuesta legal de Sebas.

La versión que no cruza la línea: **PULSO no asigna, le muestra al CRUE la
cobertura.** `/crue` ya existe para eso. Como cierre del pitch, no como código.

**Grafo de carreteras propio en PostGIS.** Mapbox `driving-traffic` ya da
tiempo por calles **con tráfico**, que es estrictamente mejor que un grafo sin
datos de tráfico. pgRouting sobre un extract OSM cuesta horas y deja peor.

**Convertir la extracción clínica a tools.** El triaje usa structured outputs
porque tiene UNA respuesta de forma conocida. Con tools el modelo podría no
llamar la función, habría que manejar el loop, y la garantía sería la misma.
Las tools están donde corresponden: en `/v1/interpretar`, que sí elige entre
varias acciones.

---

## 🔬 Sin verificar

Cosas que escribí y probé con dobles, pero que **nadie ha corrido contra el
servicio real**:

- La costura `core → ai-core` de punta a punta (`task dev` + `curl
  localhost:3001/health/ai-core`). 30 segundos, y es justo lo que los tests
  unitarios no pueden cubrir.
- Las llamadas reales a Deepgram y ElevenLabs. Los detalles de auth están
  verificados contra la documentación y fijados con tests, pero no se ha
  hecho un request de verdad.
- El typecheck del frontend (`apps/frontend` no tiene `node_modules`
  instalado). El cambio son dos campos opcionales, así que el riesgo es nulo.
- El despliegue en Render.
