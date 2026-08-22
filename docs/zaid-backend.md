# Zaid · Backend / Datos

> Tú conviertes 16.181 filas del REPS en ~60 sedes de Bogotá que un
> jurado puede señalar en un mapa y reconocer. Sin ti, PULSO es una demo
> con datos inventados — y eso se nota en 10 segundos.

---

## Lo que cambió: el backend ya no vive en Next

El scaffold arrancó con toda la lógica dentro de `apps/frontend/app/api/*`. Funcionó
para el día 1 y hay que agradecerlo. Pero eso es un **monolito**: la pantalla y el
motor de ruteo en el mismo proceso, con las credenciales de Supabase y de Mapbox
viviendo al lado del código que se envía al navegador.

**La lógica de negocio YA VIVE en `apps/backend/core` (NestJS, puerto 3001).** El front no calcula nada: pide y pinta.

| Antes | Ahora |
|---|---|
| `apps/frontend/app/api/match/route.ts` | `POST http://localhost:3001/match` en core |
| `apps/frontend/lib/db.ts` | `SedesService` en core |
| `apps/frontend/lib/mapbox.ts` | `EtaService` en core |
| `apps/frontend/lib/scoring.ts` + `congestion.ts` | `ScoringService` + `CongestionService` en core |
| `apps/frontend/lib/mock.ts` | semillas en core |
| El front llamaba `fetch('/api/match')` | El front llama `fetch(`${API}/match`)` |

Lo que **sí se queda en el front**: las pantallas, y el cliente `anon` de Supabase
para Realtime (ese es de Juan y es legítimamente de navegador).

> **Para ti esto es buena noticia, no trabajo extra.** Tu capa de datos deja de
> ser un `lib/` prestado dentro de la app de otro y pasa a ser un módulo tuyo,
> con inyección de dependencias, con tests, y con las llaves del servidor donde
> deben estar: en el servidor.

---

## Tu punto de partida

Hoy todo corre sobre 14 sedes semilla. Tu trabajo sigue siendo el mismo:
reemplazarlas por datos reales de Bogotá **sin que nadie más cambie una línea**.
El contrato de salida de `SedesService.cercanas()` no cambia — solo cambia de casa.

## Tus archivos

| Archivo | Qué es |
|---|---|
| [`scripts/etl/extraer_reps.py`](../scripts/etl/extraer_reps.py) | ETL con la lógica y las trampas ya documentadas. **Léelo entero antes de correrlo.** Esto NO cambia con la mudanza. |
| [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) | Esquema + la RPC `sedes_cercanas`. Pegar en el SQL Editor y correr. Tampoco cambia. |
| [`apps/backend/core/src/sedes/sedes.service.ts`](../apps/backend/core/src/sedes/sedes.service.ts) | **Tu archivo.** RPC `sedes_cercanas` + fallback a semillas. |
| [`apps/backend/core/src/sedes/supabase.service.ts`](../apps/backend/core/src/sedes/supabase.service.ts) | Cliente de Supabase. Se crea una vez, en `onModuleInit`. |
| [`apps/backend/core/src/sedes/semillas.ts`](../apps/backend/core/src/sedes/semillas.ts) | Las 14 sedes de mentira que vas a reemplazar. |
| [`apps/backend/core/src/match/match.service.ts`](../apps/backend/core/src/match/match.service.ts) | Orquesta candidatos + ETA + score. Expone `POST /match`. |
| [`apps/frontend/app/crue/page.tsx`](../apps/frontend/app/crue/page.tsx) | Tablero del CRUE. Sigue en el front — es la vitrina de tu capa de datos, ahora consumiendo core por HTTP. |

### La forma que tiene core hoy

```
apps/backend/core/src/
├── contracts/    # Sede, Caso, Candidato… el contrato del dominio (LEY)
├── common/       # geo.ts — haversine
├── catalogo/     # códigos REPS + filtro duro de servicios
├── almacen/      # estado de sesión: casos, handshakes, historial (@Global)
├── sedes/        # ← TU MÓDULO. Supabase + RPC + semillas
├── eta/          # EtaService — Mapbox Matrix y geometría de ruta
├── scoring/      # ScoringService + CongestionService
├── canales/      # Telegram / WhatsApp / consola
├── handshake/    # POST /handshake/respond   ⭐ el núcleo
├── match/        # POST /match               ← tu endpoint
├── dispatch/     # POST /dispatch
├── estado/       # GET  /estado
├── triage/       # POST /triage
└── telegram/     # POST /telegram/webhook
```

Un módulo Nest por responsabilidad. `MatchService` **no toca Supabase directo**:
le pide sedes a `SedesService`. Ese es el punto de todo el ejercicio — si algún
día ves un `createClient(` fuera de `sedes/`, alguien rompió la frontera.

---

## Tareas

### Bloque 0 · ✅ HECHO — la mudanza a NestJS ya está aplicada

No tienes que migrar nada. Esto ya corre y está verificado end-to-end:

- [x] `@nestjs/config` instalado y cargado con `isGlobal`. `apps/backend/core/.env` **ahora sí lo lee alguien**.
- [x] Variables renombradas **sin** `NEXT_PUBLIC_`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MAPBOX_TOKEN`. El prefijo `NEXT_PUBLIC_` solo sobrevive en el front para `NEXT_PUBLIC_API_URL` y, cuando llegue, el token público de Mapbox GL y la llave `anon` de Realtime.
- [x] `lib/db.ts` → `SupabaseService` + `SedesService`. **La regla de oro se conservó**: sin credenciales cae a semillas y nadie se bloquea.
- [x] `lib/mapbox.ts` → `EtaService`; `lib/scoring.ts` y `lib/congestion.ts` → `ScoringService` y `CongestionService`.
- [x] Los seis endpoints viven en core. Las rutas viejas del front devuelven **404**, comprobado.
- [x] El front llama por `apps/frontend/lib/api.ts` con `NEXT_PUBLIC_API_URL`. CORS abierto solo para `http://localhost:3000`.

**Tu trabajo empieza en el Bloque 1.** Lo único que cambia para ti es dónde vive tu código: `apps/backend/core/src/sedes/`, no `lib/db.ts`.

### Bloque 1 · H2–H10 — datos reales en la mesa

- [ ] **Crear el proyecto en Supabase** y llenar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_DB_URL` en `apps/backend/core/.env`. La URL de PostgreSQL debe ser directa o session pooler en el puerto `5432`; no uses el transaction pooler `6543`.
- [ ] **Aplicar el esquema de forma registrada:**
  ```bash
  task migrate
  task migrate:status
  ```
  `task migrate` aplica cada archivo de `supabase/migrations/` en su propia transacción. La segunda ejecución es segura y debe decir `Sin migraciones pendientes`. `task migrate:status` también detecta si alguien editó una migración ya aplicada.
- [ ] **Para cargar datos reales, correr el ETL:**
  ```bash
  cd scripts/etl
  pip install -r requirements.txt
  python extraer_reps.py
  ```
  Produce `salida/sedes.csv`, `salida/capacidad.csv` y `salida/reporte.txt`. **Lee el reporte.**
- [ ] **Sembrar y verificar:**
  ```bash
  task migrate:seed FUENTE=csv
  task migrate:verify
  ```
  La siembra carga `sede`, `servicio_sede` (si existe `salida/servicios.csv`) y `capacidad_sede`; calcula `geom` durante el insert y se puede repetir sin duplicar datos. La verificación falla si hay coordenadas fuera de Bogotá, `geom` nulos, faltan urgencias o hemodinamia, o la RPC `sedes_cercanas` no devuelve filas.
- [ ] **Arreglar las que fallaron** agregándolas a `COORDS_MANUALES` en el ETL. Ya hay 12 clínicas grandes ahí verificadas a mano.

### Bloque 2 · el problema de `servicio_sede`

**Este es tu riesgo número uno.** Sin saber qué servicios tiene habilitados cada sede, el filtro duro no filtra nada y PULSO deja de tener sentido.

No hay un dataset nacional limpio en Socrata. Dos caminos:

- [ ] **Plan A — timebox de 90 minutos, ni un minuto más.** `prestadores.minsalud.gov.co/habilitacion` → consulta pública → filtrar Bogotá → exportar servicios → cargar a `servicio_sede`.
- [ ] **Plan B — si el Plan A pelea, cámbiate sin culpa.** Llena a mano las ~60 sedes que sobreviven al filtro. **Son 60 filas.** Una persona las hace en una hora mirando la consulta pública del REPS, y quedan *perfectas* — mejores que un scraper frágil.

> **No gastes 6 horas peleando con un scraper.** Ese no es el trabajo. El trabajo es que a la hora 10 existan datos reales de Bogotá en la base. Cómo llegaron ahí no sale en el pitch.

### Bloque 3 · H10–H20 — que la query sea rápida y honesta

- [ ] **Verificar que la RPC funciona.** `SedesService` conserva el fallback silencioso: si `sedes_cercanas` falla, loguea y sigue con semillas — o sea, **puede estar rota y tú no enterarte**. En Nest usa el `Logger` de `@nestjs/common`, no `console.warn`, para que el mensaje salga con contexto y no se pierda entre el ruido del watch.
  ```sql
  select codigo, nombre from sedes_cercanas(4.5981, -74.0758, 25000) limit 5;
  ```
- [ ] **Confirmar que el índice GiST se usa:** `explain analyze` sobre esa query. Sin índice, con 16k filas, se nota.
- [ ] **Mapbox Matrix.** Consigue el token y verifica que `EtaService.matriz()` devuelve `conTrafico: true`. El perfil `driving-traffic` acepta **pocas** coordenadas por llamada (`MAX_DESTINOS = 9`). Si Mapbox devuelve 422, es eso: baja el número, no subas el límite.
- [ ] **Sanidad de los ETA.** De la Plaza de Bolívar a Kennedy no son 3 minutos. Si ves tiempos absurdos, el problema es casi siempre lat/lng invertidos — **Mapbox espera `lng,lat`**, al revés de lo intuitivo.
- [ ] **Un test de `ScoringService`.** Ahora que es un servicio inyectable, `pnpm test` en core te lo prueba sin levantar nada. Es la única pieza del sistema donde un bug no se ve en pantalla: un score mal calculado *parece* razonable.
- [ ] **Pulir `/crue`.** Es la pantalla que responde "¿ustedes reemplazan al CRUE?" (no: PULSO propone, el CRUE regula) y donde se ve que la congestión se mueve sola con cada rechazo.

---

## Cómo pruebas lo tuyo

Ahora le pegas a **core en el 3001**, no al front en el 3000:

```bash
task dev
curl -s -X POST localhost:3001/match -H "Content-Type: application/json" \
  -d '{"caso":{"id":"t","origen":{"lat":4.5981,"lng":-74.0758},"serviciosRequeridos":[743,110],"complejidadRequerida":"alta","tipoMovil":"TAM","requiereMedicoABordo":true,"triage":2,"resumen":"prueba","dxCie10":null,"dxDescripcion":"x","edad":54,"sexo":"M","signosAlarma":[],"confianza":1,"textoCrudo":"x","creadoEn":"2026-08-22T00:00:00Z"},"limite":5}'
```

Asserts duros (no "se ve bien"):

- [ ] `evaluadas` > 40 cuando la DB real esté cargada (con semillas son 14 — si sigue en 14, **estás leyendo mock sin saberlo**).
- [ ] **Toda** sede con `rank ≥ 1` tiene `743` en `sede.servicios`.
- [ ] **Ninguna** sede sin `743` tiene `rank ≥ 1`.
- [ ] Aparecen 1–3 sedes con `rank: 0` y `motivoDescarte` lleno.
- [ ] Los ETA son plausibles para Bogotá.
- [ ] `latenciaMs` < 2000 con Mapbox activo.
- [ ] El mismo `curl` contra `localhost:3000/api/match` da **404**. Si responde, quedó backend viejo vivo y estás probando el equivocado.

---

## Trampas conocidas

**`apps/backend/core/.env` no lo lee nadie todavía.** No hay `@nestjs/config` instalado y `main.ts` usa `process.env` directo. Es el Bloque 0 y es la trampa que más tiempo te puede costar, porque falla en silencio: pones las credenciales correctas y el servicio sigue en semillas.

**El filtro de Bogotá.** `departamentodededesc='Bogotá D.C'` — sin punto final, sin coma. Así viene el string en el dataset. Si lo "corriges" a `'Bogotá, D.C.'` devuelve **0 filas** y vas a perder media hora buscando el error en otro lado. (Ya me pasó verificándolo.)

**El dataset de ocupación está muerto.** `uwc4-gvg3` tiene una sola `fecha_corte`: 2022-11-30. **No es un bug del ETL.** Es un snapshot y se usa como *prior* estructural, no como ocupación de hoy. Y es la primera slide del pitch — no lo "arregles", explótalo.

**El fallback silencioso viaja contigo.** Si la RPC no existe o el nombre no coincide, `SedesService` devuelve semillas. Eso es bueno (nadie se bloquea) y peligroso (puedes creer que estás sobre datos reales cuando no). **Revisa los logs de core a propósito** cada vez que toques la DB.

**El nombre de la columna en la RPC.** El SQL devuelve `coord` como `jsonb` con `{lat, lng}` justamente para que TypeScript no tenga que mapear nada. Si cambias la forma de salida, se rompe en silencio (llega un `any`).

**Dos backends vivos a la vez.** Ya no aplica: las rutas viejas del front están borradas y devuelven 404. Si alguien reintroduce un `app/api/*` "para probar rápido", vuelve el problema — arreglas un bug en uno y lo pruebas en el otro.

**El `.env` correcto.** Ahora hay tres: `apps/frontend/.env.local`, `apps/backend/core/.env` y `apps/backend/ai-core/.env`. `SUPABASE_SERVICE_ROLE_KEY` va en el de **core** y en ningún otro. Esa llave se salta RLS: si termina en el bundle del front, la regalaste.

---

## Hallazgos de Neid, revisados después de tu refactor

Los levanté antes de tu mudanza a NestJS. **Uno lo arreglaste tú sin saberlo;
los otros dos siguen abiertos y son tuyos.**

### ✅ Resuelto por el refactor: el riesgo de Vercel

Cuando el estado vivía en `apps/frontend/lib/almacen.ts`, el comentario decía
*"para el demo da igual: una sola sesión, un solo proceso"* — y eso **no se
cumple en Vercel**, donde el webhook de Telegram y el polling de `/campo`
pueden caer en instancias serverless distintas. El jefe de urgencias acepta y
la pantalla del paramédico no se entera. Es el momento 1:30 del guion.

Con `AlmacenService` dentro de un proceso Nest largo eso deja de aplicar, y
por eso pudiste quitar el truco de `globalThis`. **El riesgo solo vuelve si
core termina desplegado en serverless** — si lo mandas a Vercel Functions en
vez de a un contenedor, vuelve tal cual.

### 🔴 Abierto: los handshakes siguen sin escribirse en Supabase

Lo único que toca la base es la RPC `sedes_cercanas` en `sedes.service.ts`.
`AlmacenService` sigue siendo memoria pura: `caso` y `handshake` nunca reciben
un `insert`.

El README llama a la tabla `handshake` *"el dataset que se auto-etiqueta — el
activo del producto"*. Hoy ese activo se borra al reiniciar core. Si el jurado
pregunta *"¿dónde queda ese dataset que dicen que se entrena solo?"*, la
respuesta honesta es "en RAM".

Las tablas ya están con sus índices. Son dos `insert` y un `select`, no un
refactor. Y desbloquea lo de abajo.

### 🔴 Abierto: nadie escribe el estado `timeout`

`EstadoHandshake` lo incluye y `match.service.ts:53` lo lee para no volver a
ofrecer una sede que no contestó. **Pero ningún código lo asigna nunca.** Un
hospital que no responde deja el caso colgado para siempre. Está anotado
también en [sebas-producto.md](sebas-producto.md), porque el escalamiento es
de su carril.

---

## Lo que cambié en tu código (rama `feat/ai-core-integracion` · PR #6)

Todo aditivo: sin `AI_CORE_BASE_URL` el comportamiento es idéntico al de hoy.
Aun así son archivos tuyos — revísalos antes de mezclar.

### 1. La penalización de rebote se calibra por sede

`PENALIZACION_REBOTE = 22` era global. Ahora se descompone en la mitad
observable (lo que **esa sede** tarda en contestar, que ya calculabas en
`handshake.service.ts` como `latenciaS`) más el sobrecosto fijo de descargar y
re-rutear. Con cero handshakes devuelve **exactamente 22** — el número del
pitch no se mueve. Cada respuesta observada lo acerca a lo que esa sede hace de
verdad, con el mismo encogimiento hacia el prior que ya usa `P(aceptación)`.

Se alimenta de `AlmacenService`, así que hoy la calibración se pierde al
reiniciar core. Es la misma dependencia del hallazgo de arriba.

### 2. `core` ya le habla a `ai-core`

`AiCoreClient` siguiendo el `design.md` del scaffold: `fetch` +
`AbortSignal.timeout`, mapeo 503/504/502, y **nunca** filtra la URL ni el
cuerpo upstream al navegador (eso va al log). `TriageService` lo intenta
primero **solo si `AI_CORE_BASE_URL` está configurada**:

```
POST /triage → ai-core (Claude) → Claude local en core → heurística
```

Si ai-core no responde, tarda de más o devuelve basura, core sigue local. No
es un proxy duro a propósito: un proxy metería una dependencia nueva en el
camino del demo en vivo.

Un caso que quizá no es obvio: **si ai-core responde con SU heurística pero
core sí tiene `ANTHROPIC_API_KEY`, core la rechaza y resuelve local.** Sin esa
regla, un ai-core sin credencial degradaría en silencio a un core que sí podía
llamar a Claude.

### 3. ⚠️ Toqué `contracts/types.ts` — te lo aviso, como pide la regla

Dos campos nuevos en `TriageResponse`, **los dos opcionales**:

```ts
motor?: "claude" | "heuristica";   // qué produjo la extracción
via?:   "core" | "ai-core";        // dónde corrió
```

`motor` existe porque antes la única pista de que estabas viendo la heurística
era `confianza === 0.35` exacto, y eso se pasa por alto justo cuando importa.

Los repliqué en `apps/frontend/lib/types.ts`, que es el espejo manual. Si algún
día duele mantener los dos, la salida es un paquete compartido en el workspace,
no seguir copiando a mano.

### Archivos tocados

| Archivo | Qué |
|---|---|
| `src/ai-core/*` | **Nuevo.** Cliente, módulo, tipos y su spec. |
| `src/scoring/scoring.service.ts` | `penalizacionRebote(sedeCodigo)` + constantes descompuestas. |
| `src/almacen/almacen.service.ts` | Guarda la latencia por sede; `latenciasRespuestaMin()`. |
| `src/handshake/handshake.service.ts` | Una línea: le pasa `latenciaS` a `registrarRespuesta()`. |
| `src/triage/triage.service.ts` | La cascada. El camino local queda intacto. |
| `src/triage/triage.module.ts` | Importa `AiCoreModule`. |
| `src/health/health.controller.ts` | **`GET /health/ai-core`** — prueba la costura sin tocar la liveness. |
| `src/app.module.ts` | Registra `AiCoreModule`. |
| `src/contracts/types.ts` | Los dos campos opcionales. |
| `env.example` | Documenta `AI_CORE_BASE_URL` y `AI_CORE_TIMEOUT_MS`. |
| `apps/frontend/lib/types.ts` | El espejo. |

### Tests

Core pasó de **1 test a 34**. Nada de red: todo con dobles.

| Spec | Qué protege |
|---|---|
| `ai-core.client.spec.ts` | La tabla de traducción de errores del `design.md` y que no se filtre la URL upstream. |
| `triage.service.spec.ts` | Que `/triage` NUNCA falle porque ai-core esté caído, lento o devuelva basura. |
| `scoring.service.spec.ts` | Que sin handshakes el rebote dé exactamente 22, y que las sedes no se contaminen. |
| `health.controller.spec.ts` | Que la liveness NO llame a ai-core (si no, reinicios en cascada). |

```bash
cd apps/backend/core && pnpm test      # 34
cd apps/backend/ai-core && uv run pytest   # 84
```

**Lo que no verifiqué:** la costura de punta a punta con los tres servicios
arriba. Son 30 segundos y es justo lo que los unitarios no cubren:

```bash
task dev
curl localhost:3001/health/ai-core
```

### Por qué el scoring se queda en core y no se va a ai-core

Porque necesita el estado de `AlmacenService` (historial, rechazos y ahora
latencias por sede). Mandarlo a ai-core obligaría a serializar señales de ~60
sedes en cada `/match`, y no gana nada: el scoring es aritmética, no IA. Lo que
sí encaja en ai-core es el triaje, que es una llamada texto → JSON sin estado.

`POST /v1/score` existe en ai-core y **nadie lo llama**: es el mismo modelo en
Python, útil para probarlo aislado y de forma reproducible (fija `ahora` y da
siempre el mismo ranking). Si algún día el scoring se muda, ya está escrito.
