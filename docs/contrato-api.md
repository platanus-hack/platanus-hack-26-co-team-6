# Contrato entre los cuatro carriles

**Léelo antes de tocar nada.** Es corto a propósito.

La fuente de verdad es [`apps/backend/core/src/contracts/types.ts`](../apps/backend/core/src/contracts/types.ts). Este documento explica el *porqué*; el código manda sobre el texto.

---

## La regla

> **Nadie cambia un tipo de `apps/backend/core/src/contracts/types.ts` en silencio.**
> Se dice en voz alta / en el chat **antes** de guardar.

Un cambio silencioso ahí rompe el trabajo de los otros tres sin que se enteren, y lo descubren 40 minutos después. En una hackathon de 36 horas eso es catastrófico.

Si necesitas un campo nuevo: **agrégalo opcional** (`campo?: tipo`). Así nadie se rompe y tú avanzas.

---

## Quién produce qué

| Tipo | Lo produce | Lo consume |
|---|---|---|
| `Caso`, `ExtraccionClinica` | Neid — `/triage` | todos |
| `Sede` | Zaid — ETL + PostGIS | todos |
| `Candidato`, `DesgloseScore` | Zaid (ETA) + Neid (score) | Juan |
| `Handshake` | Sebas — `/dispatch` | Juan, Sebas |

Nota: `apps/frontend/lib/types.ts` es un espejo manual de `contracts/types.ts`.
Un campo nuevo hay que agregarlo en los dos o el runtime miente aunque el build pase.

---

## Todas las rutas exigen sesión

Salvo dos: `GET /health` y `POST /telegram/webhook` (a Telegram no le puedes pedir una cookie; se autentica con `secret_token`).

El resto responde **401** sin sesión. Se entra una vez:

```ts
POST /auth/login   → { password: string }   ← Set-Cookie: pulso_sesion (HttpOnly, 12h)
POST /auth/logout  → {}                     ← borra la cookie
GET  /auth/sesion  →                        ← { autenticado: boolean }   // público
```

Desde el navegador, `fetch` necesita `credentials: "include"` o la cookie no viaja — ya está puesto en [`lib/api.ts`](../apps/frontend/lib/api.ts). Desde curl, `-c/-b cookies.txt`, o `Authorization: Bearer <token>`.

La contraseña sale de `OPERADOR_PASSWORD`. Si no está configurada, core genera una e imprime en el log al arrancar.

---

## Las rutas

### `POST /triage` — Neid

```ts
→ { texto: string, origen?: Coordenada, tipoMovil?: "TAB" | "TAM", unidad?: Unidad }
← { caso: Caso, latenciaMs: number }
```

`unidad` (`{ id: "AMB-014", tripulante?: string }`) se guarda en el caso y **sí sale** en `CasoPublico`: es lo que permite al regulador del CRUE saber qué móvil está preguntando en vez de ver casos anónimos. **No es autenticación** — la sesión es una contraseña compartida por turno y cualquiera puede escribir el id que quiera. Es trazabilidad operativa, el equivalente a decir tu indicativo por radio.

Sin `ANTHROPIC_API_KEY` cae al extractor heurístico (confianza `0.35`, para que la UI lo pueda marcar). **Nunca devuelve error por falta de credencial.**

### `POST /match` — Zaid + Neid

```ts
→ { caso: Caso, limite?: number, radioKm?: number }
← { candidatos: Candidato[], evaluadas: number, compatibles: number, latenciaMs: number }
```

Devuelve **las viables ordenadas por score** (`rank` 1..N) **y hasta 3 descartadas** (`rank: 0`, `motivoDescarte` lleno). Las descartadas son parte del producto, no ruido: ver una clínica a 10 min tachada por no tener hemodinamia es lo que explica PULSO de un vistazo.

Una sede que ya rechazó **este** caso no vuelve a aparecer.

### `POST /dispatch` — Sebas

```ts
→ { casoId: string, sedeCodigo: string, canal?: "telegram" | "whatsapp" | "consola" }
← { handshake: Handshake }
```

Dispara la notificación. Si el canal falla, cae al siguiente. **Nunca devuelve "no se pudo notificar"** — la consola web siempre está.

El `Handshake` que vuelve trae **`expiraEn`**: el instante en que esta solicitud vence y pasa a `timeout`. Lo sella el servidor (`enviadoEn + HANDSHAKE_TIMEOUT_S`, default 45s) y quien lo hace cumplir es [`VigilanteService`](../apps/backend/core/src/vigilante/vigilante.service.ts), que además re-rutea solo al siguiente candidato. Viaja al cliente para que el cronómetro de `/campo` cuente contra el mismo reloj que core. **No inventes el plazo en el front** — la barra llegaría a cero mientras el servidor sigue esperando.

Cuando una sede deja vencer la solicitud, eso **sí** cuenta como rechazo para su `P(aceptación)`. Es una decisión discutida: no sabemos si habrían aceptado, pero si el silencio no se registra, una sede que nunca contesta sigue saliendo #1 recomendada para siempre.

### `POST /handshake/respond` — Sebas ⭐

```ts
→ { handshakeId: string, decision: "aceptado" | "rechazado", motivo?: string }
← { handshake: Handshake, congestionActualizada: number, aplicada: boolean }
```

**El endpoint más importante del producto.** Lo llaman dos clientes: la consola `/hospital` y el webhook de Telegram. Por eso la lógica vive en [`apps/backend/core/src/handshake/handshake.service.ts`](../apps/backend/core/src/handshake/handshake.service.ts) y no dentro del route.

Es **idempotente**: un doble toque en el celular no duplica la señal. En un demo en vivo esto pasa siempre.

⚠️ **Mira `aplicada` antes de decirle a nadie que el traslado quedó aceptado.** Vale `false` cuando la respuesta no cambió nada: doble toque, o la solicitud ya había vencido y el caso siguió a otra sede. Aceptar tarde no revive el handshake — dos hospitales preparando cama para el mismo paciente es peor que un rechazo.

### `POST /escalamiento` — cuando el ruteo no cierra

```ts
→ { casoId: string, motivo: "sin-candidatos" | "candidatos-agotados" | "solicitud-paramedico", detalle?: string }
← { escalamiento: Escalamiento }
```

El caso pasa a un regulador humano y aparece en `GET /estado`. Es lo que `/campo` muestra **en vez de una lista vacía**: sin esto, un ranking sin candidatos deja al paramédico solo frente a la pantalla con un paciente en la camilla — el escenario que PULSO dice eliminar, reproducido en una interfaz nueva.

`sedesIntentadas` se llena solo con las que ya rechazaron o dejaron vencer, para que el regulador no empiece llamando a la que acaba de decir que no.

**Idempotente por caso**: si ya hay uno abierto devuelve ese mismo. `/campo` puede llamarlo desde dos caminos sin duplicar filas en el tablero del CRUE.

`POST /escalamiento/atender` (`{ escalamientoId, atendidoPor? }`) lo marca como tomado. Lo llama `/crue`.

### `GET /capacidades`

```ts
← { ia, ruteo, voz, canal, datos, handshakeTimeoutS, ts }
```

En qué modo corre cada integración ahora mismo. Existe porque la degradación de la tabla de abajo era **invisible**: un ETA estimado por regla de tres se pintaba idéntico a uno de Mapbox con tráfico real. Lo consume la barra persistente de `/campo` para poder ser honesta. No devuelve credenciales ni URLs, solo el modo.

### Voz: vive en `ai-core`, no en core

La transcripción del dictado la sirve `POST /v1/transcribir` de
[`ai-core`](../apps/backend/ai-core/app/routers/transcribir.py), con ElevenLabs
por defecto y Deepgram como plan B. Las credenciales viven **solo** en
`apps/backend/ai-core/.env` — ni core ni el frontend las tienen.

Importa porque la Web Speech API del navegador **no existe en Safari/iOS**, y
ahí el paramédico se queda sin dictado. `GET /capacidades` dice cuál está
activo (`voz: "ai-core" | "navegador"`).

### `GET /estado?casoId=…`

```ts
← { casos: CasoPublico[], handshakes: Handshake[], congestion: CongestionSede[],
    escalamientos: Escalamiento[], ts: string }
```

Estado vivo para polling (2s). Lo consumen `/hospital` y `/crue`.

⚠️ **`CasoPublico`, no `Caso`.** Es `Caso` sin `textoCrudo` (el dictado literal del paramédico) ni `origen` (las coordenadas de recogida del paciente). Son los dos campos más sensibles del sistema y ninguna consola los pinta: el mapa de `/campo` usa el `origen` que ya recibió en la respuesta de `POST /triage`.

Si una vista llega a necesitarlos, se expone un endpoint por caso con su propia autorización — **no se re-abren en el listado**.

`despojar()` en [`estado.service.ts`](../apps/backend/core/src/estado/estado.service.ts) construye la respuesta **campo por campo**, no con `...resto`. Así que agregar un campo a `Caso` rompe el build hasta que alguien decida si ese dato puede salir del servidor. Es la parte del diseño que impide que esto se vuelva a filtrar solo.

Sí, polling y no WebSockets. Deliberado: funciona desde el minuto 0 sin configurar nada. Si sobra tiempo después de H20, se cambia a Supabase Realtime y se ve idéntico.

---

## Los tres invariantes

Si rompes uno de estos, el demo miente:

1. **El filtro de servicios es duro, no ponderado.** Una sede sin `743` jamás puede recibir un IAM con supra ST, así esté al lado. Vive en `serviciosFaltantes()` de [`apps/backend/core/src/catalogo/servicios-reps.ts`](../apps/backend/core/src/catalogo/servicios-reps.ts).
2. **Todo el score está en minutos.** Si agregas un término al score, tiene que ser en minutos y tienes que poder justificarlo ante un médico. Nada de constantes mágicas adimensionales.
3. **Cada respuesta de un hospital se registra.** `registrarRespuesta()` alimenta `P(aceptación)` y la congestión. Si alguien hace un atajo que salte eso, el producto pierde su tesis.

---

## Degradación: nadie se bloquea por una credencial

| Falta | Qué pasa |
|---|---|
| `ANTHROPIC_API_KEY` | Extractor heurístico por palabras clave |
| Supabase | 14 sedes semilla de [`apps/backend/core/src/sedes/semillas.ts`](../apps/backend/core/src/sedes/semillas.ts) |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | ETA estimado por distancia (22 km/h efectivos) |
| `TELEGRAM_BOT_TOKEN` | La tarjeta se imprime en la consola del servidor |
| Credenciales de voz en ai-core | El dictado usa la Web Speech API del navegador (y no existe en Safari/iOS) |

**Ahora se puede saber en qué modo está cada una**: `GET /capacidades`. Antes esta tabla describía una degradación silenciosa — la consola pintaba el número estimado igual que el real.

**Esto es a propósito y no se debe "arreglar".** Es lo que permite que los cuatro trabajen en paralelo desde la hora cero.

---

## Convenciones

- **Español en el dominio** (`sede`, `caso`, `candidato`, `handshake`). Es un producto colombiano; que el código se lea igual que la conversación con un médico.
- **Sin tildes en nombres de identificadores y comentarios de código.** Con tildes en todo lo que ve el usuario.
- Errores: siempre `{ error: string, detalle?: string }`.
- Timestamps: ISO 8601 en string. Nada de `Date` cruzando la red.

---

## Los servicios de `apps/backend` (agregado H+)

**Ningún doc mencionaba esto y es la mitad del repo.** El scaffold de
`openspec/changes/scaffold-backend-services/` creó dos servicios que las cinco
rutas de arriba ignoran:

```
apps/backend/core/      NestJS  :3001   gateway. Único origen que ve el navegador.
apps/backend/ai-core/   FastAPI :8000   IA. Interno, sin CORS. Aquí van las API keys.
```

La topología es `frontend → core → ai-core`. **La costura ya está conectada
para el triaje**: `POST /triage` de core intenta resolver en ai-core y, si no
puede, resuelve local.

```
POST /triage → ai-core (Claude) → Claude local en core → heurística
               solo si AI_CORE_BASE_URL está puesta
```

Sin `AI_CORE_BASE_URL`, core resuelve todo local y el comportamiento es
idéntico al de antes. Con ella puesta, si ai-core se cae el endpoint responde
igual: **la garantía de "nunca falla por falta de credencial" ahora también
cubre "nunca falla porque ai-core esté caído"**, y está bajo test.

`GET /health/ai-core` prueba la costura sin tocar la liveness de core.

### Lo que ya expone ai-core

| Ruta | Equivale a | Estado |
|---|---|---|
| `GET /health` | — | ✅ |
| `POST /v1/triage` | `/api/triage` | ✅ paridad completa |
| `POST /v1/score` | el **paso 3** de `/api/match` | ✅ filtro duro + ranking |

Los cuerpos son **los mismos tipos de `types.ts`, en camelCase**, a propósito:
migrar una ruta del frontend a ai-core no debe tocar un solo tipo de TypeScript.

**Dos campos nuevos en `TriageResponse`, los dos opcionales:**

- `motor?: "claude" | "heuristica"` — qué produjo la extracción. Sin él, la
  única pista de que estabas viendo la heurística era `confianza == 0.35`
  exacto, y eso se pasa por alto justo cuando importa.
- `via?: "core" | "ai-core"` — dónde corrió.

**`POST /v1/score` no está conectado.** El scoring del demo corre en core
(`ScoringService`) porque necesita el estado de `AlmacenService`; mandarlo
afuera obligaría a serializar señales de ~60 sedes en cada `/match` sin ganar
nada — el scoring es aritmética, no IA. La versión de ai-core sirve para probar
el modelo aislado y de forma reproducible (fija `ahora` y da el mismo ranking).

### `senales` — lo que ai-core necesita para aprender

ai-core **no tiene base de datos** por diseño. La historia de cada sede viaja
en el request:

```ts
senales: {
  [codigoSede: string]: {
    aceptados: number;              // handshakes aceptados
    rechazados: number;             // handshakes rechazados
    rechazosRecientes: number;      // en las últimas 6h ← la señal viva
    latenciasRespuestaMin: number[];// handshake.latencia_s / 60
  }
}
```

Todo es opcional: una sede sin señales corre con su prior estructural del REPS
y el motor funciona igual. **Pero sin señales el sistema no aprende**, que es
la tesis del producto — ver la nota en [zaid-backend.md](zaid-backend.md).

### Correrlo

```bash
cd apps/backend/ai-core
uv sync
uv run fastapi dev app/main.py    # :8000
uv run pytest                      # 84 tests, sin red
```
