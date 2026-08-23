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
| `POST /auth/login` · `/refresh` · `/logout` · `GET /auth/sesion` · `/auth/yo` | Sesión con actor real: token con organización, roles y alcance | Sebas |
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

## Autenticación — lo que hay que saber antes de tocarla

**Dos puertas.** Una persona entra con `identificador` + contraseña y su token lleva quién es, de qué
organización, con qué roles y sobre qué sedes. El **turno compartido** sigue abierto mientras
`PULSO_AUTH_LEGACY` no diga `false` — viene encendido a propósito, porque la tabla `actor` llega con
[1.1](../../../docs/tareas/zaid.md#11--migración-0003_identidad) y apagarlo antes deja al equipo fuera.
Quien entra por ahí queda marcado `legado: true`: la auditoría no lo confunde con una persona.

**Dos tokens.** Access de 15 min (cookie `pulso_sesion`, `path=/`) y refresh de 30 días (cookie
`pulso_refresco`, `path=/auth/refresh` — **no viaja en cada petición**). El refresh **rota en cada uso**
y un `jti` ya gastado que reaparece revoca la cadena completa: es lo que convierte un token robado en un
incidente detectable. El front renueva solo, con una única renovación en vuelo — si cada petición del
polling pidiera la suya, la rotación las leería como reuso y cerraría la sesión sola.

**Dos guards, en este orden.** `SesionGuard` (global, niega por defecto, resuelve el actor) y `RolGuard`
(`@Rol()`, `@AlcanceSede()`). Una sede fuera del alcance es `403` **más evento `intento_cruzado`**: un
403 mudo pierde la señal más interesante del sistema.

⚠️ **Lo que todavía vive en RAM:** las sesiones y los actores (`PULSO_ACTORES`). Se pierden al
reiniciar — el lado seguro del fallo, nunca al revés. Las contraseñas se hashean con **Argon2id si el
módulo está instalado, y si no con scrypt** (`N=2^15,r=8,p=3`); el arranque dice cuál está activo y cada
login migra su propio hash el día que se instale `argon2`.

## Estado actual y hacia dónde va

| Pieza | Hoy | Destino | Tarea |
|---|---|---|---|
| `AlmacenService` | **`Map` en RAM** — se pierde al reiniciar | Postgres | [1.2](../../../docs/tareas/neid.md#12--persistir-caso-y-handshake) |
| Sesión | ✅ Actor + organización + roles + alcance. El turno compartido sigue abierto con `PULSO_AUTH_LEGACY` | Tabla `actor` en Postgres y 2FA | [1.3](../../../docs/tareas/sebas.md#13--sesión-con-actor-real) ✅ · [1.1](../../../docs/tareas/zaid.md#11--migración-0003_identidad) |
| Aislamiento | No existe | RLS + alcance + guard | [1.5](../../../docs/tareas/zaid.md#15--rol-no-owner--force-rls--encontextode), [1.6](../../../docs/tareas/neid.md#16--policies-de-rls--caso_acceso) |
| `VigilanteService` | `@Interval` en el proceso web | Worker con lock distribuido | [3.8](../../../docs/tareas/neid.md#38--vigilante-a-worker-con-lock-distribuido) |
| Eventos | 3 de 22 se guardan | `evento_caso` append-only | [3.1](../../../docs/tareas/neid.md#31--evento_caso--registroservice), [3.2](../../../docs/tareas/sebas.md#32--cablear-los-22-eventos) |
| Aceptación única | ✅ Conectado en `HandshakeService` | — | [0.1](../../../docs/tareas/sebas.md#01--conectar-el-guard-de-aceptación-única) ✅ |

Plan completo en [`docs/`](../../../docs/README.md).

## Estructura

```
src/
├── contracts/      types.ts (LEY) + schemas zod
├── auth/           sesión con actor, roles y alcance + los dos guards globales
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
