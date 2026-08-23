# Juan — tareas

> Carril histórico: Frontend / PWA, dueño de `/campo`, el mapa, `components/` y el cronómetro.
> **En este plan rota:** también le tocaron webhooks en Python, token de servicio en Nest, el
> constructor de RDA FHIR y la instrumentación con OpenTelemetry. Ver [README de tareas](README.md).

**Estado al 23 de agosto de 2026: 14 de 16 cerradas y en `main`** (PR #11, PR #23, PR #27).
Este archivo lista **solo lo pendiente**; el enunciado completo de cada tarea cerrada vive en el
historial de git (`git log --follow docs/tareas/juan.md`) y su evidencia, en los tests que dejó.

---

## Cerradas — una línea por tarea, con dónde quedó

| Id | Qué | Dónde quedó |
|---|---|---|
| 0.4 | Deduplicar webhooks por `wamid` | `voz/app/webhooks_recibidos.py`, migración `0003` |
| 0.7 | Test de espejo de tipos | `scripts/verificar-tipos.mts`, corre en `task test` |
| 1.4 | Login y sesión | `app/entrar/`, `lib/sesion*.ts`, renovación silenciosa en `lib/api.ts` |
| 1.8 | Token de servicio para `voz` | `core/src/auth/token-servicio.ts`; `svc:voz` recibe 403 en `/handshake/respond`, probado por HTTP |
| 2.1 | API de afiliación | `core/src/afiliacion/`, migración `0004`; máquina de 8 estados, nada queda `activa` solo |
| 2.5 | Equipo e invitaciones | `core/src/invitaciones/`, migración `0005`, `/equipo`; token de un solo uso, en base solo el hash |
| 2.9 | Autoverificación de ambulancias | `core/src/afiliacion/ambulancias.ts`; los 225 prestadores TAB/TAM por fin se consumen |
| 3.4 | Vista `/hospital/capacidad` | 2 toques para `contingencia`, sin botón Guardar; el contrato para 3.3 está en `lib/api-capacidad.ts` |
| 3.7 | Posición del móvil + `/crue/cobertura` | `core/src/moviles/`, migración `0006`; con `precisionM` visible y sin rastreo fuera de caso |
| 3.11 | Override del CRUE persistido | `core/src/eventos/` + `escalamiento`; salió de `localStorage`, exige justificación en servidor |
| 4.3 | Vista `/hospital/recepcion/:casoId` | SBAR, tres relojes, checklist con actor; contrato para 4.1/4.2 en `lib/api-recepcion.ts` |
| 4.8 | `rda-builder` FHIR R4 | `core/src/rda/`; **pre-llena, NO reporta al IHCE** — esa frase no se cambia sin verificar III §0 punto 3 |
| 4.12 | Vista forense `/auditoria/casos/:id` | `core/src/auditoria/` + `app/(auditoria)/`; correcciones visibles, lectura registrada |
| 5.11 | `/admin/catalogos` y `/admin/modelos` | `core/src/admin/`, migración `0008`; el código nunca cambia, la etiqueta versiona |

---

## 5.3 · OpenTelemetry + Pino con redacción de PII — **PENDIENTE, sin empezar**

**Ola 5** · sin dependencias · dominio `core/src/observabilidad/`, `ai-core/app/telemetria.py`

**Qué.** Trazas de punta a punta con `casoId`, y logs estructurados sin PII.

**Por qué.** Hoy no hay forma de saber por qué un caso tardó 40 s. Y sin redacción, el primer log
con un dictado clínico adentro es un incidente de datos sensibles.

**Pasos.**
1. OTel SDK en core con auto-instrumentación de Nest, `pg` y BullMQ.
2. `casoId` y `organizacion_id` como atributos de span. **Nunca** `textoCrudo`, `origen` ni teléfono.
3. Propagar el contexto a `ai-core` (headers `traceparent`) y **a través de la cola** — por eso
   `webhook_outbox` tiene columna `trace_id`.
4. `nestjs-pino` con redacción:
   ```ts
   redact: { paths: ['req.headers.authorization','req.headers.cookie',
                     '*.textoCrudo','*.texto','*.origen','*.telefono',
                     '*.pacienteToken','*.password','*.dictado'],
             censor: '[redactado]' }
   ```
5. **Test que falle si aparece PII en un log**: correr un caso y hacer grep del texto del dictado
   en la salida.

**Hecho cuando.**
- [ ] Una traza cubre `/campo → core → ai-core → Mapbox → canal → webhook`
- [ ] El salto por la cola no rompe la traza
- [ ] El test de PII en logs pasa
- [ ] Sin colector configurado, no revienta: no exporta y lo dice

**Trampas.** `ai-core` tiene las credenciales de proveedores. **Ni las URLs de proveedor deben salir
en las trazas.** Y es la única tarea del carril que necesita dependencias nuevas (`pnpm add` en core):
coordinar el momento, no correrlo mientras haya trabajo en vuelo de otros.

*Nota:* la lista de redacción ya tiene un consumidor esperando: `/invitacion/*` debe entrar en las
rutas redactadas (el token viaja en la URL del enlace — pedido explícito de 2.5).

---

## 5.7 · Prueba de carga con k6 — **escrita y en `main`, PENDIENTE DE EJECUTAR**

Los scripts están en `carga/` (6 SLOs del plan maestro §7.1 como `thresholds`, escenario del
vigilante con 50 handshakes, test de fuga de inquilino del caso límite 18) y el workflow en
`.github/workflows/carga.yml` (solo bajo etiqueta `carga`). `carga/RESULTADOS.md` está **vacío a
propósito**: cero números inventados.

**Falta, en orden:**
- [ ] Instalar k6 en la máquina que va a correr la prueba
- [ ] Esperar el merge de **1.2** (persistencia) — con `AlmacenService` en memoria la prueba mide
      un sistema que no existe, y el propio script lo avisa al arrancar
- [ ] Calibrar la latencia del mock con `node carga/calibrar.mjs` (exige `CALIBRAR_ACEPTO_COSTO=true`)
- [ ] Correr los tres escenarios y llenar `carga/RESULTADOS.md` con fecha y commit
- [ ] Quitar `CARGA_PERMITIR_MEMORIA=true` del workflow (está marcado con ⬇️)
- [ ] Añadir las tareas `carga` y `carga:doble` al `Taskfile.yml` (el bloque exacto está en el
      README de `carga/`)

**Hallazgo abierto que dejó esta tarea y no decide este carril:** sin `ANTHROPIC_API_KEY`,
`POST /triage` responde 400 siempre (`confianza 0.35 < umbral 0.5` → `PULSO_LOW_CONFIDENCE`).
La regla 2 del repo y el contrato de `/triage` hoy se contradicen. **Decidir en equipo** antes de
cualquier demo sin llave.

---

## Esperando a otros carriles — nada que hacer aquí hasta que mergeen

| Bloquea | Qué falta | De quién |
|---|---|---|
| El modo actor entero | 1.3 (`/auth/refresh`, `/auth/recuperar`, `/auth/organizacion`, `req.actor`). La rama `feat/o1-1.3-sesion-actor-real` existe; hasta el merge todo corre en legacy y la guarda de rol no filtra | Sebas |
| Filas de camas en `/hospital/capacidad` | 3.3 — el contrato exacto está escrito en `lib/api-capacidad.ts` | Zaid |
| ETA vivo y canal `caso:{id}` en recepción | 3.7 ya emite posición; falta 3.9 (canal) y 4.1/4.2 (paquete de prearribo) | Zaid/Sebas/Neid |
| Validación de perfiles del RDA | 4.9 | Neid |
| Firma del RDA (el borrador nunca se envía solo) | 4.10 | Sebas |
| Ejecutar 5.7 con datos que signifiquen algo | 1.2 y 5.6 | Neid/Zaid |

## Fuera de las 16 — apareció después

- **Ola 6** ([campo-agente-y-coordinacion.md](../campo-agente-y-coordinacion.md)): la tarea
  **6.5 · Vista de sector y de incidente en `/campo`** cae en dominio de este carril
  (`frontend/components/campo/`) pero **no está asignada**. Decidir en equipo si entra.
