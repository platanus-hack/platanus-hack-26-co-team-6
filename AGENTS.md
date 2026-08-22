# PULSO — instrucciones para agentes

Motor de ruteo de urgencias hospitalarias. **Del dictado del paramédico al hospital que sí puede
recibirlo, en menos de 90 segundos.** Bogotá, track Emergencias.

## Antes de escribir código

1. **[`docs/README.md`](docs/README.md)** — índice. El plan vigente son cuatro documentos (I→IV).
2. **[`docs/contrato-api.md`](docs/contrato-api.md)** — **es ley**.
3. **[`docs/tareas/`](docs/tareas/)** — 64 tareas, 16 por persona, con dependencias y orden de merge.
4. Si tocas frontend: `node_modules/next/dist/docs/` — **Next 16.3.1 tiene breaking changes**.

## Las reglas que no se rompen

1. **`apps/backend/core/src/contracts/types.ts` no se cambia en silencio.** Se avisa antes de guardar.
   Campos nuevos **siempre opcionales**. Su espejo manual es `apps/frontend/lib/types.ts`: cambiar uno
   solo no rompe el build, **rompe el runtime**.
2. **Todo degrada sin credenciales, y lo dice.** Sin Supabase → semillas. Sin Mapbox → ETA por
   distancia. Sin ai-core → heurística (`confianza: 0.35`). Sin Telegram → log.
   **No "arregles" esa degradación: es la regla.** `GET /capacidades` la hace visible.
   **Única excepción: la autenticación.** Ahí un fallback abierto *es* la vulnerabilidad.
3. **El conjunto vacío es un evento, no una respuesta muda.** Ranking vacío → escala al CRUE.
4. **La auditoría es append-only.** Nadie edita ni borra: una corrección es un evento nuevo.
5. **Sin PII en logs ni en URLs.** `textoCrudo` (el dictado literal) y `origen` (dónde está el
   paciente) son los dos campos más sensibles y **no salen del servidor**. `estado.service.ts::despojar()`
   es una lista blanca escrita campo por campo a propósito: si deja de compilar, es porque alguien
   agregó un campo y **tiene que decidir** si puede salir.
6. **PULSO propone, el humano decide.** El sistema rankea; el paramédico despacha, el jefe de urgencias
   acepta, el CRUE regula. Nada con consecuencia clínica o legal ocurre sin confirmación humana
   registrada. **Ningún trámite se firma solo.**
7. **Dominio en español sin tildes en identificadores.** Tildes solo en texto visible.
8. **Después de cada pull:** `grep -rn "<<<<<<<" apps/`. Ya se commiteó una vez un merge con
   marcadores de conflicto adentro (`4b6efce`).

## Lo que está roto ahora mismo

Contexto necesario antes de tocar nada. Detalle en [`docs/pulso-agente-campo-y-roles.md`](docs/pulso-agente-campo-y-roles.md).

| Qué | Dónde | Tarea |
|---|---|---|
| **El estado vive en un `Map` en RAM** — reiniciar core borra casos, handshakes y el historial por sede | `core/src/almacen/` | [1.2](docs/tareas/neid.md#12--persistir-caso-y-handshake) |
| **Una contraseña compartida abre las tres consolas** — cualquiera puede aceptar por cualquier hospital | `core/src/auth/` | [1.3](docs/tareas/sebas.md#13--sesión-con-actor-real) |
| **El guard de aceptación única existe y nadie lo llama** (`RoutingService.respond()` es código muerto) | `core/src/handshake/` | [0.1](docs/tareas/sebas.md#01--conectar-el-guard-de-aceptación-única) |
| **Los webhooks no verifican firma, no deduplican y tardan 4-8 s** (Meta espera 3 s y ya reintenta) | `services/voz/` | [0.2](docs/tareas/zaid.md#02--verificar-firma-de-whatsapp-y-twilio), [0.3](docs/tareas/neid.md#03--responder-el-webhook-en--3-s), [0.4](docs/tareas/juan.md#04--deduplicar-webhooks-por-wamid) |
| **De 22 eventos del sistema, 3 se guardan** | transversal | [3.1](docs/tareas/neid.md#31--evento_caso--registroservice), [3.2](docs/tareas/sebas.md#32--cablear-los-22-eventos) |
| **El prompt clínico está duplicado** en Python y TypeScript | `ai-core` + `core/src/triage` | [0.5](docs/tareas/neid.md#05--un-solo-prompt-clínico) |
| **El override del CRUE vive en `localStorage`** | `components/crue/bitacora.ts` | [3.11](docs/tareas/juan.md#311--persistir-el-override-del-crue) |

## Estructura

```
apps/frontend          Next 16, las consolas         :3000   pnpm
apps/backend/core      NestJS, el dominio            :3001   pnpm   ← interno
apps/backend/ai-core   FastAPI, la IA                :8000   uv     ← interno, tiene las llaves
apps/services/voz      FastAPI, WhatsApp y Twilio    :8090   uv     ← ÚNICO público
supabase/migrations    esquema, numerado, con down
data/                  fuentes REPS y 123 + pipeline (ver data/CATALOGO.md)
docs/                  plan vigente y tareas
```

```bash
task setup && task doctor && task dev
```
