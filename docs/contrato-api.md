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

---

## Las cinco rutas

### `POST /triage` — Neid

```ts
→ { texto: string, origen?: Coordenada, tipoMovil?: "TAB" | "TAM" }
← { caso: Caso, latenciaMs: number }
```

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

### `POST /handshake/respond` — Sebas ⭐

```ts
→ { handshakeId: string, decision: "aceptado" | "rechazado", motivo?: string }
← { handshake: Handshake, congestionActualizada: number }
```

**El endpoint más importante del producto.** Lo llaman dos clientes: la consola `/hospital` y el webhook de Telegram. Por eso la lógica vive en [`apps/backend/core/src/handshake/handshake.service.ts`](../apps/backend/core/src/handshake/handshake.service.ts) y no dentro del route.

Es **idempotente**: un doble toque en el celular no duplica la señal. En un demo en vivo esto pasa siempre.

### `GET /estado?casoId=…`

Estado vivo para polling (2s). Lo consumen `/hospital` y `/crue`.

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

La topología que diseñó ese scaffold es `frontend → core → ai-core`, con las
credenciales de proveedor **solo** en ai-core. Hoy el frontend llama a Claude
directo con su propia key. **Las dos realidades conviven y ninguna está mal**;
solo hay que saber cuál se usa en el demo.

### Lo que ya expone ai-core

| Ruta | Equivale a | Estado |
|---|---|---|
| `GET /health` | — | ✅ |
| `POST /v1/triage` | `/api/triage` | ✅ paridad completa |
| `POST /v1/score` | el **paso 3** de `/api/match` | ✅ filtro duro + ranking |

Los cuerpos son **los mismos tipos de `types.ts`, en camelCase**, a propósito:
migrar una ruta del frontend a ai-core no debe tocar un solo tipo de TypeScript.

**Dos diferencias contra el contrato de arriba, ambas aditivas:**

1. `POST /v1/triage` devuelve un campo extra `motor: "claude" | "heuristica"`.
   Sin él, la única pista de que estabas viendo la heurística era
   `confianza == 0.35` exacto — y eso se pasa por alto justo cuando importa.
2. `POST /v1/score` **no** busca sedes ni calcula ETA: eso es el carril de Zaid
   y se queda en `/api/match`. Recibe `caso + sedes + etas + senales` y devuelve
   `candidatos`. Es una función pura: el mismo request siempre da el mismo
   ranking (fija `ahora` y es reproducible al minuto).

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
