# core

El dominio de PULSO y el dueño del estado. NestJS, puerto **3001**. **Servicio interno**: lo llama el
frontend y `voz`; nunca debe quedar expuesto a internet.

```bash
pnpm install
pnpm start:dev        # :3001
pnpm test             # unitarios
pnpm test:e2e
```

## Qué expone

| Ruta | Qué hace | Dueño histórico |
|---|---|---|
| `POST /triage` | Dictado → `Caso` estructurado (delega en ai-core, cae a heurística) | Neid |
| `POST /match` | Caso → ranking de sedes. PostGIS + Mapbox + score en minutos | Zaid + Neid |
| `POST /dispatch` | Dispara el handshake por Telegram/WhatsApp/consola | Sebas |
| `POST /handshake/respond` | ⭐ Aceptar/rechazar. Lo llaman la consola **y** el webhook de Telegram | Sebas |
| `POST /escalamiento` | El caso pasa a un regulador humano | — |
| `GET /estado` | Estado vivo para `/hospital` y `/crue` (polling 2 s) | — |
| `GET /capacidades` | En qué modo está cada integración | — |
| `POST /auth/login` · `/logout` · `GET /auth/sesion` | Sesión | Sebas |
| `GET /health` | Liveness. No toca nada aguas abajo | — |
| `POST /telegram/webhook` | Webhook de Telegram (`secret_token`) | Sebas |

**Todas exigen sesión** salvo `GET /health` y el webhook de Telegram. El `SesionGuard` es global y
**niega por defecto**: para abrir una ruta hay que marcarla con `@Publico()` a propósito.

Los contratos exactos están en [`src/contracts/types.ts`](src/contracts/types.ts) — **es ley** — y
explicados en [`docs/contrato-api.md`](../../../docs/contrato-api.md).

## Reglas que no se rompen

1. **Todo degrada sin credenciales, y lo dice.** Sin Supabase → semillas. Sin Mapbox → ETA por
   distancia. Sin ai-core → extractor heurístico. Sin Telegram → log. `GET /capacidades` hace visible
   en qué modo está corriendo cada pieza; sin eso, un ETA estimado se ve igual que uno con tráfico.
   **La única excepción es la autenticación**: ahí un fallback abierto *es* la vulnerabilidad.
2. **`src/contracts/types.ts` no se cambia en silencio.** Campos nuevos siempre opcionales.
3. **El conjunto vacío es un evento, no una respuesta muda.** Si el ranking sale vacío, se escala al
   CRUE — nunca se devuelve una lista en blanco.
4. **La auditoría es append-only.** `pulso_routing_decision_audit` tiene triggers que rechazan
   `UPDATE`, `DELETE` y `TRUNCATE`. Una corrección es un evento nuevo.
5. **Sin PII en logs ni en URLs.** `textoCrudo`, `origen`, teléfono y token de paciente nunca salen.

## Estado actual y hacia dónde va

| Pieza | Hoy | Destino | Tarea |
|---|---|---|---|
| `AlmacenService` | **`Map` en RAM** — se pierde al reiniciar | Postgres | [1.2](../../../docs/tareas/neid.md#12--persistir-caso-y-handshake) |
| Sesión | Contraseña de turno compartida | Actor + organización + roles | [1.3](../../../docs/tareas/sebas.md#13--sesión-con-actor-real) |
| Aislamiento | No existe | RLS + alcance + guard | [1.5](../../../docs/tareas/zaid.md#15--rol-no-owner--force-rls--encontextode), [1.6](../../../docs/tareas/neid.md#16--policies-de-rls--caso_acceso) |
| `VigilanteService` | `@Interval` en el proceso web | Worker con lock distribuido | [3.8](../../../docs/tareas/neid.md#38--vigilante-a-worker-con-lock-distribuido) |
| Eventos | 3 de 22 se guardan | `evento_caso` append-only | [3.1](../../../docs/tareas/neid.md#31--evento_caso--registroservice), [3.2](../../../docs/tareas/sebas.md#32--cablear-los-22-eventos) |
| Aceptación única | Guard escrito, **nadie lo llama** | Conectado | [0.1](../../../docs/tareas/sebas.md#01--conectar-el-guard-de-aceptación-única) |

Plan completo en [`docs/`](../../../docs/README.md).

## Estructura

```
src/
├── contracts/      types.ts (LEY) + schemas zod
├── auth/           sesión + guard global
├── triage/         dictado → caso (respaldo TS del prompt de ai-core)
├── match/          orquesta sedes + ETA + scoring
├── sedes/          catálogo REPS (Supabase o semillas)
├── eta/            Mapbox Matrix, o distancia/22 km-h
├── scoring/        filtro duro + costo en minutos + congestión
├── routing/        políticas clínicas, elegibilidad, evidencia de decisión
├── dispatch/ handshake/ canales/   el apretón de manos
├── escalamiento/   cuando el ruteo no cierra
├── vigilante/      vence handshakes, detecta demoras, re-rutea
├── almacen/        estado en memoria (→ Postgres)
├── persistence/    RoutingStore: memoria | Postgres
└── migration/      ETL del REPS
```

## Migraciones

Viven en [`supabase/migrations/`](../../../supabase/migrations/), numeradas y con `down`.
`0001_init.sql` trae el esquema base y **RLS habilitada en todas las tablas** — con la advertencia de
que la service role key se la salta, que es justo lo que hay que corregir en la tarea 1.5.
