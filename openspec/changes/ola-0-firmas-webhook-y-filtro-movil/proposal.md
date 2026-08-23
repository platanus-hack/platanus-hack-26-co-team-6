# Propuesta — Ola 0: firmas de webhook y filtro de móvil

Fase SDD: `sdd-propose` · Fecha: 2026-08-22 · Almacén: openspec · Entrega: un solo PR · Presupuesto: 800 líneas

Cerrar dos defectos de Ola 0 de [`docs/tareas/zaid.md`](../../../docs/tareas/zaid.md): **0.2** deja de aceptar
cualquier POST en el único servicio con cara a internet, y **0.8** deja de culpar al hospital por una
condición del móvil. Se entregan juntas porque no comparten archivos y caben holgadas en el presupuesto.

---

## 1. Por qué ahora

| Tarea | Defecto real | Consecuencia hoy |
|---|---|---|
| **0.2** | `rutas/whatsapp.py::recibir()` hace `await request.json()` sin validar `X-Hub-Signature-256`. El WebSocket `telefonia/rutas.py::audio()` no valida `X-Twilio-Signature`. Telegram sí usa `secret_token`. | Cualquiera inyecta un caso falso, o dispara llamadas de Twilio que cuestan dinero real. |
| **0.8** | `movilCompatible()` se evalúa **dentro** del bucle de sedes (`scoring.service.ts:211`), aunque no depende de la sede. | Las cuatro tarjetas salen grises con el mismo motivo. **No es una escalada faltante:** `RoutingService.match()` (`routing.service.ts:33`) ya escala a `PULSO_NO_ELIGIBLE_DESTINATION` y la regla 3 de `AGENTS.md` ya se cumple. Lo que falla es **la atribución de la culpa**: una condición del caso se pinta como defecto de cada hospital. |

---

## 2. Regla 2 de `AGENTS.md` — la excepción, en negrita

> **Todo degrada, menos la autenticación.** La tarea 0.2 es la única excepción documentada del repo.
> Un webhook abierto en producción **es** la vulnerabilidad, no una degradación aceptable.

| `WHATSAPP_APP_SECRET` | `entorno == "desarrollo"` | `entorno == "produccion"` |
|---|---|---|
| Ausente | Advertencia fuerte en log, **acepta** | **Rechaza todo** (o no arranca) |
| Presente, firma inválida | 401 + métrica | 401 + métrica |

Esta asimetría es intencional. Nadie debe "arreglarla" homogeneizándola.

---

## 3. Alcance

### Dentro

- `voz`: `verificar_firma_meta(...)` en `canales/whatsapp.py`, enganchada con `dependencies=[Depends(...)]` en el **decorador** de `rutas/whatsapp.py`.
- `voz`: validación de `X-Twilio-Signature` con `RequestValidator` en el handshake HTTP del WebSocket `telefonia/rutas.py::audio()` (único punto inbound real de Twilio; contemplar el quirk de la barra final).
- `voz`: campo `entorno` y `whatsapp_app_secret` en `config.py`; contador `pulso_webhook_firma_invalida_total{proveedor}` en `metricas.py`.
- `core`: sacar `movilCompatible()` del bucle de `ScoringService.rankear()` y evaluarlo una vez a nivel de caso, lanzando `PulsoError('PULSO_MOVIL_INCOMPATIBLE', ...)` con el detalle real (qué tipo se requiere, qué móvil hay).
- `core`: código `PULSO_MOVIL_INCOMPATIBLE` en `contracts/types.ts` (ver gate G3).
- `core`: conectar `evaluateEligibility()` desde `ScoringService` **sin** el filtro de camas.
- `frontend`: nuevo miembro en la unión `CodigoError` de `lib/api.ts` y su entrada en `GUION` de `RevisionRequerida.tsx`. `campo/page.tsx` no se toca.
- Tests: `test_whatsapp.py`, `test_telefonia.py`, `scoring.service.spec.ts`, `routing-policies.spec.ts`.

### Fuera (no-goals explícitos)

- **Unificar el filtro duro dentro de `evaluateEligibility()`** en bloque. `evaluateEligibility` no devuelve el detalle por servicio que el paramédico ve hoy en `Candidato.motivoDescarte`, que el frontend ya consume. Queda documentado como unificación futura.
- **Espejar `PulsoCode` / `CodigoError` en `lib/types.ts`.** Es territorio de la tarea 0.7 y `scripts/verificar-tipos.mts:74` lo tolera explícitamente (`lado: 'solo-core'`).
- **Reescribir el cuerpo de `rutas/whatsapp.py::recibir()`.** Eso es la tarea 0.3 (Neid).
- Modificar `catalogo/servicios-reps.ts`: `movilCompatible()` ya está importada en `scoring.service.ts:26`; solo cambia dónde se la llama.
- Alertar sobre la métrica (umbral / paging). Solo se expone el contador.

---

## 4. Capacidades

### Nuevas

- `verificacion-firma-webhook`: autenticidad de los webhooks entrantes de WhatsApp y Twilio, con la asimetría desarrollo/producción de la sección 2.
- `filtro-movil-caso`: la compatibilidad móvil–paciente como condición del caso, no como descarte por sede.

### Modificadas

Ninguna. `openspec/specs/` está vacío hoy.

---

## 5. Enfoque elegido y por qué

| Tarea | Enfoque | Razón |
|---|---|---|
| 0.2 | Lógica en `canales/whatsapp.py`, enganche con `Depends()` en el decorador | Un toque de una línea al decorador en vez de al cuerpo de la función. Minimiza el conflicto de merge con la reescritura de 0.3 y respeta el dominio declarado de la tarea. Starlette cachea el cuerpo crudo, así que `await request.body()` devuelve los bytes exactos aun después de `.json()`: no hay pérdida de datos. |
| 0.8 | Extraer `movilCompatible()` del bucle + parámetro que apague el chequeo de camas en `eligibility-policy.ts` | Quirúrgico, respeta el dominio de archivos y **no rompe** `routing-policies.spec.ts:15`, que exige `NO_AVAILABLE_BED` en el comportamiento por defecto. Acepta que dos fuentes de verdad del filtro duro convivan un tiempo. |

`hmac.compare_digest`, nunca `==`. HMAC contra bytes crudos, nunca contra JSON re-serializado.

---

## 6. Supuestos declarados (modo `auto`)

Se procede bajo estos supuestos. **Ninguno está confirmado.**

| # | Supuesto | Dueño de la confirmación | Si es falso |
|---|---|---|---|
| S1 | `voz` gana `entorno: str = "desarrollo"` leyendo la variable `ENTORNO`, y el literal de producción es `"produccion"`. | Quien administra Render | **El camino de rechazo en producción nunca se dispara y el webhook queda abierto en silencio.** Debe verificarse contra la configuración de Render **antes del merge**. |
| S2 | 0.2 mergea **antes** que 0.3 (Neid): 0.2 toca el decorador, 0.3 reescribe el cuerpo de la misma función. | Neid | Conflicto de merge sobre `rutas/whatsapp.py`. Es un supuesto de coordinación humana, no técnico. **Requiere confirmación explícita de Neid.** |
| S3 | Agregar `PULSO_MOVIL_INCOMPATIBLE` a `contracts/types.ts` exige avisar al dueño de tipos de la Ola 0 **antes de guardar** (regla 1 de `AGENTS.md`). Zaid no es dueño de tipos en Ola 0. | Dueño de tipos de Ola 0 | Se viola una regla del proyecto. Es un **gate duro de pre-merge (G3)**, no una cortesía. |
| S4 | `PulsoCode` / `CodigoError` en `lib/types.ts` queda fuera de este cambio. | Dueño de 0.7 | Nada se rompe hoy: el checker de CI lo tolera. Queda como seguimiento. |
| S5 | La forma exacta de "sin `NO_AVAILABLE_BED`" (parámetro opcional contra wrapper) la decide `sdd-design`. La restricción que la ata: `routing-policies.spec.ts:15` exige `NO_AVAILABLE_BED` en el comportamiento por defecto, **que no puede cambiar**. | `sdd-design` | Se rompe un test verde existente. |

---

## 7. Áreas afectadas

| Área | Impacto | Qué cambia |
|---|---|---|
| `apps/services/voz/app/canales/whatsapp.py` | Nuevo | `verificar_firma_meta(...)` (~30 líneas) |
| `apps/services/voz/app/rutas/whatsapp.py` | Modificado | Solo `dependencies=[...]` en el decorador (~5) |
| `apps/services/voz/app/telefonia/rutas.py` | Modificado | Validación Twilio en el upgrade (~25) |
| `apps/services/voz/app/config.py` | Modificado | `entorno`, `whatsapp_app_secret` (~10) |
| `apps/services/voz/app/metricas.py` | Modificado | Contador nuevo (~5) |
| `apps/backend/core/src/scoring/scoring.service.ts` | Modificado | Chequeo fuera del bucle (~25) |
| `apps/backend/core/src/routing/eligibility-policy.ts` | Modificado | Camas desactivables (~15) |
| `apps/backend/core/src/contracts/types.ts` | Modificado | Un código nuevo (~1) — **gate G3** |
| `apps/frontend/lib/api.ts` + `components/campo/RevisionRequerida.tsx` | Modificado | Unión + entrada en `GUION` (~15) |
| Tests (`voz` y `core`) | Nuevo | ~110-175 |

**Prerrequisito:** `openspec/config.yaml` tiene un bloque `context` y `testing` obsoleto (afirma que `apps/Backend`
está vacío y que no hay test runner). Debe actualizarse **antes** de cualquier `sdd-apply` o `sdd-verify`
gateado por tests, o esas fases quedarán mal gateadas con `test_command: ""`.

---

## 8. Verificación

| Qué | Comando exacto | Dónde |
|---|---|---|
| Core (Jest) | `pnpm test` | `apps/backend/core` |
| Voz (pytest) | `uv run pytest` | `apps/services/voz` |
| Todo | `task test` | raíz |
| Espejo de tipos | `npm run test:tipos` + `npm run verificar:tipos` | CI |

> **CI no corre jest ni pytest.** `.github/workflows/verificaciones.yml` solo valida el espejo de tipos.
> La red de seguridad real antes del merge es un humano corriendo `task test` local. No se asuma verde por CI verde.

Casos que deben quedar cubiertos: firma correcta → 200; firma alterada → 401; payload real de Meta con su firma;
producción sin secreto → rechazo; caso TAM con móvil TAB → error de caso, no ranking vacío; ninguna sede con
`motivoDescarte` por una condición que no es suya; `routing-policies.spec.ts` sigue verde.

---

## 9. Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Conflicto de merge con 0.3 sobre `rutas/whatsapp.py` | Alta | El toque es de una línea al decorador; confirmar orden con Neid (S2) |
| Regla 1 de `AGENTS.md` sin aviso previo al dueño de tipos | Media | Gate G3 bloqueante antes de guardar `contracts/types.ts` |
| Literal de `ENTORNO` equivocado → webhook abierto en producción | Media | **Alto impacto.** Verificar contra Render antes del merge (S1) |
| CI no corre los tests que este cambio agrega | Alta | `task test` local obligatorio; documentado arriba |
| Dos preocupaciones sin relación en un PR (dos servicios, dos lenguajes) | Alta | **Riesgo aceptado a sabiendas por el usuario.** Mitigado por revisión en dos bloques separados y por reversión independiente (§10) |
| Hueco de contrato: nada avisa si se olvida tocar `lib/api.ts` | Media | Si se toca `CodigoError` sin tocar `GUION`, `tsc --noEmit` falla (el `Record` exige todas las claves). El olvido de `lib/api.ts` no lo detecta nada: revisión manual |

---

## 10. Plan de reversión

**0.2 y 0.8 no comparten un solo archivo, así que se revierten por separado.**

| Escenario | Acción |
|---|---|
| Falso positivo de firma bloqueando webhooks reales | Quitar `dependencies=[Depends(...)]` del decorador y el bloque Twilio del WebSocket. Revierte a `apps/services/voz/**`, cero impacto en `core`. Alternativa sin deploy: dejar `WHATSAPP_APP_SECRET` vacío en un entorno no productivo (en producción **no** es una salida válida — ver §2). |
| Regresión del ranking en `core` | Revertir `apps/backend/core/src/**` + los dos archivos de frontend. `PULSO_MOVIL_INCOMPATIBLE` sale de `contracts/types.ts` en el mismo commit; el frontend deja de referirlo en el mismo revert, así que `tsc --noEmit` queda consistente. |
| Ambos | `git revert` del merge commit. Ningún cambio de esquema, ninguna migración, ningún dato persistido: la reversión es limpia. |

Sin migraciones y sin estado nuevo, no hay reversión de datos que planificar.

---

## 11. Presupuesto de tamaño

| Bloque | Líneas estimadas |
|---|---|
| 0.2 (`voz` + tests) | 135-195 |
| 0.8 (`core` + `frontend` + tests) | 106-131 |
| **Total** | **~240-330** |

Contra el presupuesto de **800**. Riesgo de exceder: **bajo**. Un solo PR es viable por tamaño.

---

## 12. Criterios de éxito

- [ ] Firma correcta → 200; firma alterada → 401, con `hmac.compare_digest`
- [ ] En producción sin `WHATSAPP_APP_SECRET`, el servicio rechaza todo (o no arranca)
- [ ] En desarrollo sin secreto, acepta y **lo dice fuerte** en el log
- [ ] `pulso_webhook_firma_invalida_total{proveedor}` existe y se incrementa
- [ ] Twilio validado en el handshake del WebSocket de `telefonia/`
- [ ] Caso TAM con móvil TAB → `PULSO_MOVIL_INCOMPATIBLE` pintado por `RevisionRequerida`, sin tocar `campo/page.tsx`
- [ ] Ninguna sede recibe `motivoDescarte` por una condición del caso
- [ ] `evaluateEligibility()` conectado y con test, sin el filtro de camas
- [ ] `routing-policies.spec.ts` sigue verde
- [ ] `task test` verde en local antes del merge
- [ ] Gate G3 cumplido: el dueño de tipos de Ola 0 avisado **antes** de guardar `contracts/types.ts`

---

## 13. Seguimiento (fuera de este cambio)

1. Espejar `PulsoCode` / `CodigoError` en `lib/types.ts` — tarea 0.7.
2. Unificar el filtro duro de `ScoringService` dentro de `evaluateEligibility()` con detalle por servicio.
3. Actualizar `openspec/config.yaml` (prerrequisito de §7).
4. Alerta operativa cuando `pulso_webhook_firma_invalida_total > 0`.

**Siguiente fase:** `sdd-spec` y `sdd-design` (pueden correr en paralelo). `sdd-design` decide S5.
