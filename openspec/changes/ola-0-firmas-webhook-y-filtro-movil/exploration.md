# Exploracion — ola-0-firmas-webhook-y-filtro-movil

Fase SDD: `sdd-explore` · Fecha: 2026-08-22 · Almacen de artefactos: openspec

Alcance: tareas **0.2** (verificar firma de WhatsApp y Twilio) y **0.8** (corregir el filtro de
movil) de [`docs/tareas/zaid.md`](../../../docs/tareas/zaid.md). Ambas son Ola 0 y ambas estan sin
dependencias. El usuario eligio agruparlas en un solo cambio despues de que se le advirtiera el
tradeoff (dos servicios, dos lenguajes, dos preocupaciones sin relacion entre si).

---

## 1. Verificacion del stack real — `openspec/config.yaml` esta obsoleto

`openspec/config.yaml` afirma que `apps/Backend` esta vacio, que hay una sola app Next.js y que no
hay test runner instalado. Las tres afirmaciones son falsas hoy.

| Servicio | Test runner real | Comando exacto | Evidencia |
|---|---|---|---|
| `apps/backend/core` | Jest | `pnpm test` (en el directorio del servicio) | `package.json:17` (`"test": "jest"`), `Taskfile.yml:213-216` |
| `apps/services/voz` | pytest | `uv run pytest` | `pyproject.toml` (`pytest>=9.1.1`, `pytest-asyncio`), `Taskfile.yml:218-221` |
| `apps/backend/ai-core` | pytest | `uv run pytest` (84 tests) | `Taskfile.yml:218-221`, `docs/contrato-api.md:274` |
| CI (GitHub Actions) | solo espejo de tipos | `npm run test:tipos` + `npm run verificar:tipos` | `.github/workflows/verificaciones.yml` |

**Prerrequisito.** `openspec/config.yaml` debe actualizarse antes de cualquier fase `sdd-apply` o
`sdd-verify` gateada por tests: su `test_command: ""` no sirve para este monorepo.

**Riesgo de red de seguridad.** CI hoy **no corre jest ni pytest**. La unica verificacion automatica
antes de merge es el espejo de tipos. La red real es `task test` local.

---

## 2. Estado actual — tarea 0.2 (firmas en `voz`)

### Entrada del webhook

`app/rutas/whatsapp.py::recibir()` (lineas 44-79) hace `payload = await request.json()` directo.
Starlette cachea el cuerpo crudo internamente, asi que `await request.body()` sigue devolviendo los
bytes exactos aunque se llame despues de `.json()`. **No hay perdida de datos**: falta unicamente el
paso de leerlos y compararlos.

### Configuracion

- `app/config.py` **no tiene** `entorno` / `ENTORNO` ni `NODE_ENV`. `core` (NestJS) si usa `NODE_ENV`
  real (`auth.controller.ts:90`), pero `voz` no comparte runtime Node. El campo natural, consistente
  con el resto del archivo (snake_case, sin tildes), es `entorno: str = "desarrollo"` leyendo
  `ENTORNO`.
- `app/config.py` **no tiene** `whatsapp_app_secret` (el App Secret de Meta para el HMAC): hay que
  agregarlo.
- `twilio_auth_token` **ya existe** y es exactamente lo que consume
  `twilio.request_validator.RequestValidator`. No hace falta campo nuevo para Twilio.

### Metricas

`app/metricas.py` **ya es** un registro de contadores en formato Prometheus, expuesto en
`GET /metrics`. Agregar `pulso_webhook_firma_invalida_total{proveedor}` es una entrada en `_AYUDA`
mas una llamada a `contar(...)`. No hace falta infraestructura nueva.

### El punto de entrada real de Twilio

**No existe hoy un endpoint HTTP inbound de Twilio cuya firma se pueda validar.**
`telefonia/llamadas.py::llamar()` pasa `twiml=twiml_stream()` inline, de modo que Twilio no hace GET
contra una URL nuestra. El unico punto donde Twilio nos alcanza desde afuera es el WebSocket
`telefonia/rutas.py::audio()` (`/telefonia/twilio`). Twilio si envia `X-Twilio-Signature` en el
handshake HTTP del upgrade de un Media Stream, con un quirk conocido: a veces requiere una barra
final en la URL validada. Ese es el lugar correcto para la validacion, y cae dentro de `telefonia/`,
que es dominio permitido de 0.2.

### Colision con la tarea 0.3 (Neid) — confirmada con texto literal

`docs/tareas/neid.md`, tarea 0.3, paso 1, dice textualmente: *"La ruta valida firma (0.2, Zaid) y
deduplica (0.4, Juan), encola, y responde 200"*. Es decir, **0.3 espera que la verificacion de firma
ya este llamada dentro de `rutas/whatsapp.py::recibir()`** antes de que Neid reescriba esa misma
funcion. Pero 0.2 declara: *"tu solo tocas `canales/whatsapp.py` y `telefonia/`"* — y la firma de
Meta necesita el `Request` crudo, que solo existe en `rutas/whatsapp.py`.

**Salida recomendada:** toda la logica vive en `canales/whatsapp.py::verificar_firma_meta(...)` y se
engancha en `rutas/whatsapp.py` como `dependencies=[Depends(...)]` en el decorador. Es un toque de
una linea al decorador, no al cuerpo de la funcion, lo que minimiza el conflicto de merge con la
reescritura de 0.3.

---

## 3. Estado actual — tarea 0.8 (filtro de movil en `core`)

### El flujo real

`MatchController.rankear()` -> `RoutingService.assess()` (clinico) -> `MatchService.rankear()`
(sedes + ETA) -> `ScoringService.rankear()` (filtro duro + score, `scoring.service.ts:190-255`).

El bug esta en `scoring.service.ts:211`: `const movilOk = movilCompatible(...)` se calcula **dentro**
del `for (const sede of sedes)` que abre en la linea 202.

### Matiz importante sobre el sintoma

`RoutingService.match()` (`routing.service.ts:33`) ya busca
`candidates.find(c => c.motivoDescarte === null)` y ya escala a `PULSO_NO_ELIGIBLE_DESTINATION` si no
encuentra ninguno. **El invariante "ranking vacio escala al CRUE" ya existe** (regla 3 de
`AGENTS.md`). El defecto real es que todas las tarjetas salen con el mismo motivo textual,
disfrazando una condicion del caso como si fuera un defecto de cada sede.

### `evaluateEligibility()` esta muerto — confirmado

Unico importador: `routing/routing-policies.spec.ts`. Verificado por grep y por blast radius de
codegraph (1 caller, el propio spec).

### Correccion a una premisa de la tarea: el espejo de CI NO cubre `PulsoCode`

`scripts/verificar-tipos.mts:74` declara `PulsoCode` dentro de `TOLERADOS` con `lado: 'solo-core'` y
la razon *"el front compara el string crudo; espejarlo es tarea aparte"*. Por lo tanto **el checker
de CI no exige que `PulsoCode` exista en `apps/frontend/lib/types.ts` y no fallara** si
`PULSO_MOVIL_INCOMPATIBLE` se agrega solo a `contracts/types.ts`.

El punto real de sincronia con el frontend, sin cobertura de CI, es otro par de archivos:

- `apps/frontend/lib/api.ts` declara su propia union manual `CodigoError`, independiente de
  `lib/types.ts`.
- `apps/frontend/components/campo/RevisionRequerida.tsx:33` tiene
  `const GUION: Record<CodigoError, Guion>`.

Si se agrega el codigo a `CodigoError` sin agregar la entrada correspondiente a `GUION`,
`tsc --noEmit` **si** falla (un `Record` exige todas las claves). Pero **nada avisa** si se olvida
tocar `lib/api.ts` en primer lugar. Es un hueco real de disciplina de contrato, no cubierto por el
script de la tarea 0.7.

### `RevisionRequerida` — reusable tal cual

`RevisionRequerida.tsx:79` recibe `{codigo, detalle, onVolver}`. En `campo/page.tsx:226-233`,
cualquier `ErrorApi` con `.codigo` ya dispara esta pantalla **sin tocar `campo/page.tsx`**. Solo
faltan la entrada nueva en `GUION` y el miembro nuevo en `CodigoError`.

### Correccion a la colision declarada con 0.6 (Sebas)

La tarea 0.8 advierte que `catalogo/servicios-reps.ts` lo toca Sebas en 0.6. Leyendo
`docs/tareas/sebas.md`, la 0.6 real tiene dominio `core/src/catalogo/` (la carpeta completa) mas
`components/hospital/MotivosCapacidad.tsx`, y trata sobre un catalogo **nuevo** de motivos de rechazo
de hospital (`handshake.motivoRechazo`), no sobre `servicios-reps.ts` en particular. Es coincidencia
de carpeta, no de archivo.

Ademas, `movilCompatible()` — que ya vive en `servicios-reps.ts` — **no necesita modificarse**: ya
esta importada en `scoring.service.ts` (linea 26); solo cambia donde se la llama. **0.8 puede evitar
tocar `servicios-reps.ts` por completo.**

---

## 4. Enfoques comparados

### 0.2 — firmas

| Enfoque | Pros | Contras | Esfuerzo |
|---|---|---|---|
| **(recomendado)** Logica en `canales/whatsapp.py`, enganche via `Depends()` en el decorador de `rutas/whatsapp.py` | Minimiza la colision con 0.3; respeta el dominio declarado de la tarea | El patron `Depends()` leyendo cuerpo crudo es menos obvio de leer | Bajo-medio |
| Reescribir `recibir()` completo inline | Mas explicito | Colisiona de lleno con la reescritura de 0.3 sobre la misma funcion | Medio |

### 0.8 — filtro de movil y `evaluateEligibility`

| Enfoque | Pros | Contras | Esfuerzo |
|---|---|---|---|
| **(recomendado)** Extraer `movilCompatible()` del loop y verificar una vez a nivel de caso, lanzando `PulsoError('PULSO_MOVIL_INCOMPATIBLE', ...)`; agregar `{checkBeds?: boolean}` a `eligibility-policy.ts` (default `true`) y usarla desde `ScoringService` con `checkBeds: false` | Quirurgico; respeta el dominio de archivos; no rompe `routing-policies.spec.ts:15`, que exige `NO_AVAILABLE_BED` en el comportamiento por defecto; conecta `evaluateEligibility` de verdad | Dos fuentes de verdad del filtro duro conviven un tiempo | Medio |
| Reemplazar todo el filtro duro del loop por `evaluateEligibility()` | Fuente unica de verdad | `evaluateEligibility` devuelve codigos sin el detalle especifico que hoy ve el paramedico (que servicio exacto falta); diff mayor y riesgo sobre `Candidato.motivoDescarte`, que el frontend ya consume | Alto |

El segundo enfoque queda documentado como unificacion futura, fuera de este corte.

---

## 5. Lineas estimadas contra el presupuesto de 800

**0.2** — `canales/whatsapp.py` ~30 · `config.py` ~10 · `metricas.py` ~5 · `rutas/whatsapp.py` ~5
(solo decorador) · `telefonia/rutas.py` ~25 · tests en `test_whatsapp.py` y `test_telefonia.py`
(ambos ya existen) ~60-100 → **135-195 lineas**

**0.8** — `contracts/types.ts` ~1 · `scoring.service.ts` ~25 · `eligibility-policy.ts` ~15 ·
`scoring.service.spec.ts` ~40-60 · `routing-policies.spec.ts` ~10-15 · `lib/api.ts` ~5 ·
`RevisionRequerida.tsx` ~10 → **106-131 lineas**

**Total: ~240-330 lineas.** Holgado contra el presupuesto de 800; un solo PR es viable por tamano.

---

## 6. Preguntas abiertas

1. **Literal del entorno en `voz`.** Se propone el campo `entorno` leyendo `ENTORNO`. Falta confirmar
   el valor literal esperado en produccion (`"produccion"` u otro) y que Render lo inyecte con ese
   nombre.
2. **Orden de merge entre 0.2 (Zaid) y 0.3 (Neid)** sobre `rutas/whatsapp.py::recibir()`: quien va
   primero, o si se coordinan en el mismo PR.
3. **Regla 1 de `AGENTS.md`:** hay que avisar al dueno de tipos de la ola antes de guardar
   `PULSO_MOVIL_INCOMPATIBLE` en `contracts/types.ts`. Zaid no es dueno de tipos en la ola 0.
4. **Alcance del espejo de tipos:** agregar o no `PulsoCode` / `CodigoError` a `lib/types.ts` como
   mejora de disciplina de contrato. Hoy el checker de CI no lo exige.
5. **Diseno exacto de "sin `NO_AVAILABLE_BED`"** en `evaluateEligibility`: parametro opcional contra
   wrapper. Decision para `sdd-design`.

---

## 7. Riesgos

- **Coordinacion humana, no tecnica.** El toque a `rutas/whatsapp.py`, aunque sea de una linea, es
  territorio de Neid segun el propio `neid.md`. Sin coordinacion explicita hay riesgo real de
  conflicto de merge.
- **Regla 1 de `AGENTS.md`:** `contracts/types.ts` requiere aviso previo. Zaid no es dueno de tipos
  en esta ola.
- **CI no corre jest ni pytest.** La unica red de seguridad automatica antes de merge es el espejo de
  tipos; el resto depende de `task test` local.
- **Regla 2 de `AGENTS.md` (excepcion de autenticacion).** La tarea 0.2 es precisamente la excepcion
  documentada: un webhook abierto en produccion *es* la vulnerabilidad. La degradacion sin secreto
  solo es aceptable en desarrollo.
- **Dos preocupaciones en un PR.** El usuario acepto el tradeoff a sabiendas: 0.2 y 0.8 no comparten
  servicio, lenguaje ni dominio. Entra en presupuesto, pero es un PR con dos temas.
