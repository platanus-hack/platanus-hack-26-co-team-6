# Tareas — Ola 0: firmas de webhook y filtro de movil

Fase SDD: `sdd-tasks` · Almacen: openspec · Entrega: un solo PR (`delivery_strategy: single-pr`)

Dos unidades de trabajo sin un archivo en comun, cada una revertible por separado dentro del mismo
PR: **Fase 1** cubre la tarea `0.2` de `docs/tareas/zaid.md` (firmas de webhook, `voz`/Python) y
**Fase 2** cubre la tarea `0.8` del mismo archivo (filtro de movil, `core`/TypeScript). No comparten
ni un solo archivo modificado (ver design.md §4), asi que cada una se commitea y se revierte
independiente de la otra. Strict TDD: cada slice de implementacion tiene su paso de test en rojo
antes del paso de codigo.

---

## Fase 0 — Prerrequisitos y puertas humanas

Bloqueantes antes de abrir el PR o antes de tocar produccion. Ninguna tiene un test automatizado:
son confirmaciones que solo un humano puede dar.

### 0.1 — Corregir `openspec/config.yaml` (desactualizado)

El bloque `context` dice que `apps/Backend` esta vacio y que no hay test runner; `testing.test_command`
esta vacio; `rules.tasks` pide agregar un test runner como prerrequisito. Los tres extremos son falsos
hoy: `apps/backend/core` tiene Jest, `apps/services/voz` tiene pytest, y el frontend tiene `tsc`.

- [x] Actualizar `context:` para reflejar el stack real: `apps/frontend` (Next 16, React 19),
      `apps/backend/core` (NestJS + Jest), `apps/backend/ai-core` (FastAPI + pytest, interno),
      `apps/services/voz` (FastAPI + pytest, unico servicio publico).
- [x] Actualizar `testing:` con los comandos verificados: `test_runner` deja de ser `none detected`;
      `test_command` deja de ser `""` — documentar los tres comandos reales (`pnpm test` en
      `apps/backend/core`, `uv run pytest` en `apps/services/voz`,
      `pnpm --dir apps/frontend exec tsc --noEmit` para el frontend) porque no hay un unico comando
      raiz que corra los tres.
- [x] Quitar de `rules.tasks` la linea `Include "add a test runner" as an explicit prerequisite task
      before TDD-gated work` — ya existe test runner en los dos backends.
- [x] Actualizar `notes:` para dejar de decir que `apps/Backend` no tiene archivos.
- **Verificacion:** lectura manual del diff; no hay comando automatizado para un archivo de
      configuracion de OpenSpec. Confirmar que `sdd-apply` y `sdd-verify` puedan leer comandos de test
      reales de aqui en vez de cadenas vacias.
- **Rollback:** revertir el commit de este archivo no afecta codigo de producto.

### 0.2 — Confirmar el literal de `ENTORNO` que Render inyecta para `voz`

El diseno (D4/S1) invierte el default: cualquier valor fuera de la lista blanca de desarrollo
(`{desarrollo, dev, local, test, ci}`) cuenta como produccion. Pero esa lista blanca es una apuesta
sobre que literal usa Render; si Render inyecta, por ejemplo, `"prod"` con mayuscula distinta o un
valor no previsto, la propiedad `es_produccion` sigue siendo correcta (falla cerrado), pero si Render
inyecta algo que **si** deberia tratarse como desarrollo y no esta en la lista, el guard cierra el
entorno de staging por error.

- [ ] Revisar la configuracion de variables de entorno de Render para el servicio `voz` y confirmar el
      valor exacto de `ENTORNO` en cada ambiente desplegado.
- [ ] Si el valor no coincide con `ENTORNOS_DESARROLLO` de la Fase 1, decidir si se agrega a la lista
      blanca o si el ambiente correspondiente debe tratarse como produccion.
- **Verificacion:** confirmacion humana registrada (comentario en el PR o en el canal del equipo), no
      hay comando.

### 0.3 — Confirmar con Neid el orden de merge 0.2 → 0.3

`docs/tareas/neid.md`, tarea `0.3` paso 1, dice que la ruta "valida firma (0.2, Zaid)" — Neid espera
este guard dentro de una funcion que el reescribe (`recibir()` en `rutas/whatsapp.py`). El diseno
(D3) redujo el toque de esta ola a dos lineas en el decorador de esa misma ruta, precisamente para que
sobreviva el reescritura de Neid sin fusionarse en silencio, pero el orden real de merge sigue siendo
un acuerdo entre personas, no algo que el codigo resuelva solo.

- [ ] Coordinar con Neid si su tarea 0.3 mergea antes o despues de esta Fase 1, y si el mergea sobre
      un `rutas/whatsapp.py` que ya tiene el `Depends(...)` en el decorador.
- **Verificacion:** confirmacion humana registrada, no hay comando.

### 0.4 — Avisar antes de guardar `contracts/types.ts` (regla 1 de `AGENTS.md`)

Agregar `PULSO_MOVIL_INCOMPATIBLE` a `PulsoCode` es un campo/miembro nuevo y aditivo, pero la regla 1
exige avisar antes de guardar, sin excepcion por ser aditivo. `docs/tareas/*.md` solo nombra dueno de
tipos para las olas 1, 3, 4 y 5 — **la Ola 0 no tiene dueno de tipos designado**, y Zaid (autor de la
tarea 0.8) no es ese dueno por default.

- [ ] Identificar quien revisa el cambio de contrato para la Ola 0 (o confirmar que no hay uno
      designado y que el aviso va al equipo completo).
- [ ] Avisar antes de guardar el commit que toca `apps/backend/core/src/contracts/types.ts`, no
      despues.
- **Verificacion:** confirmacion humana registrada (mensaje al equipo o aprobacion explicita en el
      PR) antes de que la tarea 3.1 se mergee.
- **Gate:** bloquea la tarea 3.1.

### 0.5 — Confirmar empiricamente que Twilio firma el upgrade de Media Streams

El diseno (D5, pregunta abierta) toma como dado que Twilio firma el handshake HTTP de upgrade del
WebSocket con `X-Twilio-Signature`, igual que firma sus webhooks HTTP normales. Es una suposicion
razonable pero no verificada en este repositorio: si es falsa, activar `TWILIO_AUTH_TOKEN` en
produccion rechaza **todo** el trafico real de Twilio, no solo el trafico falso.

- [ ] Antes de fijar `TWILIO_AUTH_TOKEN` en el entorno de produccion, hacer una llamada de prueba real
      (o revisar la documentacion vigente de Twilio Media Streams) y confirmar que la cabecera
      `X-Twilio-Signature` llega en la solicitud de upgrade y que `RequestValidator.validate(...)`
      la acepta contra alguna de las 4 URLs candidatas de la Fase 1.
- **Verificacion:** evidencia de una llamada de prueba exitosa contra un despliegue con el guard
      activo, o cita de la documentacion oficial de Twilio confirmando la firma del upgrade.
- **Riesgo si se omite:** telefonia real cae completa al activar el token en produccion.

---

## Fase 1 — Bloque A: verificacion de firma de webhook (`voz`, Python)

Corresponde a `docs/tareas/zaid.md` 0.2. Unidad de trabajo independiente: no toca ningun archivo de
la Fase 2. Puede implementarse y revisarse en paralelo con la Fase 2 sin conflicto de merge (aunque
depende de las puertas 0.2, 0.3 y 0.5 de la Fase 0 antes de ir a produccion).

### 1.1 [TEST] — Firma de WhatsApp: casos rojo en `test_whatsapp.py`

- [x] Extender `apps/services/voz/tests/test_whatsapp.py` (o ruta equivalente existente) con, como
      minimo:
  - firma valida calculada sobre el cuerpo crudo → 200 y procesa.
  - cuerpo alterado con firma calculada para el cuerpo original → 401, no procesa.
  - firma calculada contra un payload real de Meta (fixture) → 200.
  - `entorno` fuera de la lista blanca de desarrollo y sin `whatsapp_app_secret` → 401 (o no arranca).
  - secreto presente, firma ausente o incorrecta, en cualquier `entorno` → 401 y
    `pulso_webhook_firma_invalida_total{proveedor="whatsapp"}` incrementado (llamar
    `metricas.reiniciar()` antes de aseverar, per design.md §6).
  - el HMAC se calcula contra `request.body()`, nunca contra una re-serializacion del JSON ya
    parseado (payload cuyo JSON re-serializado difiere byte a byte del original, y la firma sigue
    validando contra el crudo).
- [x] Confirmar que los tests existentes que postean sin firma siguen en 200 (secreto vacio +
      `entorno` default `desarrollo`) — no deben romperse.
- **Verificacion:** `cd apps/services/voz && uv run pytest tests/test_whatsapp.py -v` — deben fallar
      los casos nuevos (rojo) y seguir pasando los existentes.
- **Satisface:** requirements "Verificacion de la firma de WhatsApp contra bytes crudos",
      "Asimetria desarrollo/produccion cuando falta el secreto", "Firma invalida o ausente con
      secreto presente se rechaza en cualquier entorno", "Ninguna PII en la verificacion de firma" de
      `specs/verificacion-firma-webhook/spec.md`.

### 1.2 [IMPL] — `config.py`: `whatsapp_app_secret`, `entorno`, `es_produccion`

- [x] Agregar a `class Settings` en `apps/services/voz/app/config.py`:
      `whatsapp_app_secret: str = ""` (env `WHATSAPP_APP_SECRET`),
      `entorno: str = "desarrollo"` (env `ENTORNO`).
- [x] Agregar `ENTORNOS_DESARROLLO = frozenset({"desarrollo", "dev", "local", "test", "ci"})` y la
      propiedad `es_produccion` que devuelve `True` cuando `entorno.strip().lower()` **no** esta en
      esa lista blanca (default invertido: cierra S1 del design.md).
- **Verificacion:** `cd apps/services/voz && uv run pytest tests/test_whatsapp.py -v -k "produccion or secreto"`
      — los casos de esa categoria de 1.1 deben empezar a pasar.
- **Rollback:** revertir este archivo solo, sin tocar `canales/whatsapp.py`.

### 1.3 [IMPL] — `canales/whatsapp.py`: `_firma_valida()` y `verificar_firma_meta()`

- [x] Implementar `_firma_valida(crudo: bytes, cabecera: str | None, secreto: str) -> bool` con
      `hmac.compare_digest` sobre el hexdigest — nunca `==`.
- [x] Implementar `verificar_firma_meta(request: Request) -> None` como dependencia de FastAPI (no
      devuelve nada; pasa o lanza `HTTPException(401)`), con la logica de ramas del design.md §1 y
      §5: sin secreto + desarrollo → `log.error` + pasa; sin secreto + no-desarrollo → 401 +
      metrica; con secreto + firma ausente/distinta → 401 + metrica en cualquier entorno; con secreto
      + firma correcta → pasa.
- [x] Definir `FIRMA_CABECERA = "X-Hub-Signature-256"`.
- **Verificacion:** `cd apps/services/voz && uv run pytest tests/test_whatsapp.py -v` — todos los
      casos de 1.1 en verde.
- **Rollback:** revertir este archivo solo; `rutas/whatsapp.py` sin el `Depends` de 1.4 deja de
      invocar esta funcion pero el archivo sigue siendo valido por si solo.

### 1.4 [IMPL] — `rutas/whatsapp.py`: enganchar la dependencia (dos lineas)

- [x] Agregar `from fastapi import Depends` (si no esta importado) y
      `dependencies=[Depends(whatsapp.verificar_firma_meta)]` en el decorador de
      `POST /webhooks/whatsapp`. **No tocar el cuerpo de `recibir()`** — es la tarea 0.3 de Neid
      (fuera de alcance, ver spec §"Fuera de alcance").
- [x] Confirmar que `GET /whatsapp` (el handshake de Meta) **no** lleva esta dependencia — se
      autentica con `hub.verify_token`.
- **Verificacion:** `cd apps/services/voz && uv run pytest tests/test_whatsapp.py -v` sigue en verde;
      revisar que el diff de este archivo sea exactamente esas dos lineas (mas el import si hacia
      falta).
- **Rollback:** revertir dos lineas; el resto de la Fase 1 sigue siendo codigo valido, solo no
      queda enganchado a la ruta.

### 1.5 [IMPL] — `metricas.py`: entrada `pulso_webhook_firma_invalida_total`

- [x] Agregar a `_AYUDA` en `apps/services/voz/app/metricas.py` la entrada
      `"pulso_webhook_firma_invalida_total": ("Webhooks rechazados por firma ausente o invalida, por
      proveedor.",)`. Etiqueta unica: `proveedor` ∈ {`whatsapp`, `twilio`} — cardinalidad 2, sin PII.
- **Verificacion:** `cd apps/services/voz && uv run pytest tests/test_whatsapp.py -v -k metrica` en
      verde; `GET /metrics` expone el contador (verificacion manual con el servidor local corriendo).
- **Satisface:** requirement "Metrica de firmas invalidas expuesta en Prometheus".

### 1.6 [TEST] — Firma de Twilio: casos rojo en `test_telefonia.py`

- [x] Extender `apps/services/voz/tests/test_telefonia.py` con, como minimo:
  - upgrade a `/telefonia/twilio` con `X-Twilio-Signature` valida (con y sin barra final en la URL) →
    conexion WebSocket aceptada.
  - firma ausente o invalida → conexion rechazada **antes** de `ws.accept()` (codigo de cierre 1008 /
    handshake denegado, no aceptar-y-cerrar-despues).
  - `entorno` no-desarrollo sin `twilio_auth_token` → rechazo.
  - metrica `pulso_webhook_firma_invalida_total{proveedor="twilio"}` incrementada en cada rechazo.
- [x] Confirmar que el test existente (sin token, desarrollo, sigue aceptando) no se rompe.
- **Verificacion:** `cd apps/services/voz && uv run pytest tests/test_telefonia.py -v` — rojo en los
      casos nuevos.
- **Satisface:** requirement "Validacion de la firma de Twilio en el handshake del WebSocket" de
      `specs/verificacion-firma-webhook/spec.md`.

### 1.7 [IMPL] — `telefonia/rutas.py`: `_urls_candidatas()` + guard antes de `ws.accept()`

- [x] Implementar `_urls_candidatas(query: str) -> list[str]` con el conjunto cerrado de 4 URLs
      (`{wss, https} × {sin barra, con barra}`, mas `?{query}` si viene), construidas desde
      `settings.url_publica` + `/telefonia/twilio` — **nunca desde `ws.url`** (detras del proxy de
      Render el esquema/host son internos).
- [x] Implementar `_firma_twilio_valida(firma: str | None, query: str) -> bool` probando
      `RequestValidator.validate(...)` contra cada candidata; acepta si alguna valida.
- [x] En `telefonia/rutas.py::audio()`, invocar la validacion **antes** de `await ws.accept()`; si
      falla, `await ws.close(code=1008)` y `return` sin aceptar nunca. Aplicar la misma politica de
      `settings.es_produccion` de la Fase 1 (asimetria desarrollo/produccion, misma propiedad que
      WhatsApp).
- **Verificacion:** `cd apps/services/voz && uv run pytest tests/test_telefonia.py -v` — todos los
      casos de 1.6 en verde.
- **Rollback:** revertir este archivo solo; no afecta `canales/whatsapp.py` ni ningun archivo de la
      Fase 2.

### 1.8 — Cierre de Fase 1: suite completa de `voz`

- [x] `cd apps/services/voz && uv run pytest` — suite completa en verde, incluyendo los tests
      preexistentes no tocados por esta ola.
- **Rollback de la fase completa:** los 5 archivos de esta fase (`config.py`, `canales/whatsapp.py`,
      `rutas/whatsapp.py`, `telefonia/rutas.py`, `metricas.py`) mas sus dos archivos de test se
      revierten juntos sin tocar ningun archivo de `apps/backend/core` ni del frontend.

---

## Fase 2 — Bloque B: filtro de compatibilidad movil-caso (`core`, TypeScript)

Corresponde a `docs/tareas/zaid.md` 0.8. No comparte archivos con la Fase 1. Incluye el punto A del
brief: el swallow de `reRutear()` que queda latente en cuanto `ScoringService.rankear()` empieza a
lanzar.

### 2.1 [TEST] — `eligibility-policy.ts`: opt-out de camas sin romper el default

- [x] Antes de tocar el codigo, confirmar via `git grep -n "checkBeds"` que no hay call sites
      previos (debe ser cero: este parametro es nuevo).
- [x] Agregar un test (en `routing-policies.spec.ts` o un archivo nuevo dedicado, segun convencion
      del repo) que llame `evaluateEligibility(caso, destinos, { checkBeds: false })` sobre una sede
      sin camas disponibles y confirme que **no** reporta `NO_AVAILABLE_BED` para esa sede.
- [x] Confirmar (sin editar) que los tests existentes de `routing-policies.spec.ts` (lineas 15 y 23,
      llamados con dos argumentos) siguen esperando el default `true` sin cambios.
- **Verificacion:** `cd apps/backend/core && pnpm test -- routing-policies.spec.ts` — el caso nuevo
      en rojo, los 4 existentes ya en verde (no deben requerir edicion).
- **Satisface:** requirement "evaluateEligibility conectado sin el filtro de camas, sin cambiar su
      comportamiento por defecto" de `specs/filtro-movil-caso/spec.md`.

### 2.2 [IMPL] — `eligibility-policy.ts`: `EligibilityOptions` y exportar tipos locales

- [x] Exportar `EligibilityCase` y `Destination` (ya existen sin `export`).
- [x] Agregar `export interface EligibilityOptions { checkBeds?: boolean }` con el comentario de
      intencion del design.md §5 (snapshot del 2022-11-30, opt-out temporal hasta la tarea 3.3).
- [x] Cambiar la firma a
      `evaluateEligibility(caso, destinations, options: EligibilityOptions = {})`, y el unico cambio
      interno: `if (checkBeds && !destination.camas.some(...)) reasons.push('NO_AVAILABLE_BED')`
      (default `checkBeds` implicito en `true` via destructuring, o explicito — cualquiera que
      preserve el comportamiento actual sin el opt-out).
- **Verificacion:** `cd apps/backend/core && pnpm test -- routing-policies.spec.ts` — el test nuevo de
      2.1 en verde, los 4 existentes sin editar siguen en verde.
- **Rollback:** revertir este archivo solo; `ScoringService` (2.4) todavia no lo invoca, asi que
      revertirlo no rompe nada mas.

### 2.3 [TEST] — `scoring.service.spec.ts`: precondicion de caso, no de sede

- [x] Localizar (con `git grep -n "medico a bordo" apps/backend/core/src/scoring/scoring.service.spec.ts`)
      la aserción actual que espera `motivoDescarte === 'El paciente requiere medico a bordo (movil
      TAM)'` y cambiarla para esperar `expect(() => rankear(...)).toThrow(PulsoError)` con
      `codigo === 'PULSO_MOVIL_INCOMPATIBLE'`.
- [x] Agregar un test que confirme que, ante un caso TAM despachado con movil TAB y N sedes
      candidatas, **ninguna** sede llega a evaluarse (el bucle no corre) — se puede verificar con un
      spy sobre la funcion de calculo por sede, o confirmando que el error se lanza antes de cualquier
      efecto observable por sede.
- [x] Agregar un test de equivalencia: con movil compatible, el conjunto de sedes viables/descartadas
      producido por el cableado con `evaluateEligibility(..., { checkBeds: false })` coincide con el
      que produce hoy la cadena de comprobaciones en linea (mismo `motivoDescarte` por sede real,
      sin la rama de movil).
- [x] Confirmar el nombre exacto de la propiedad identificadora en `Unidad`
      (`apps/backend/core/src/contracts/types.ts`) antes de escribir el mensaje esperado
      (`"Este paciente requiere TAM y ${identificador} es ${caso.tipoMovil}"`); si `caso.unidad` es
      `null`, el texto esperado degrada a "el movil despachado" (nunca `textoCrudo` ni `origen`).
- **Verificacion:** `cd apps/backend/core && pnpm test -- scoring.service.spec.ts` — rojo en los casos
      nuevos/modificados.
- **Satisface:** requirements "Compatibilidad movil-paciente evaluada una vez a nivel de caso", "El
      detalle del error identifica el hecho del caso, no de la sede", "Ninguna sede recibe
      motivoDescarte por una condicion del caso" de `specs/filtro-movil-caso/spec.md`.

### 2.4 [IMPL] — `scoring.service.ts`: precondicion fuera del bucle + gate de elegibilidad

- [x] Antes del `for (const sede of sedes)` (hoy linea ~202), llamar
      `movilCompatible(caso.tipoMovil, caso.requiereMedicoABordo)` **una vez**; si es `false`, lanzar
      `PulsoError('PULSO_MOVIL_INCOMPATIBLE', mensaje, undefined, false)` (retryable `false`) y
      **no** entrar al bucle.
- [x] Antes del bucle, llamar tambien
      `evaluateEligibility(caso, destinos, { checkBeds: false })` una sola vez (batch) y quedarse con
      su conjunto `eligible`.
- [x] Dentro del bucle, mantener `faltantes`/`complejidadOk` como hoy; si `motivoDescarte === null` y
      la sede **no** esta en el conjunto `eligible`, asignar
      `motivoDescarte = 'No cumple una regla dura de elegibilidad'`. La interseccion nunca reemplaza
      el filtro duro existente (design.md §2: "el cableado no puede aflojar el filtro duro").
- [x] Borrar la rama `movilOk` de dentro del bucle (la llamada N-veces a `movilCompatible` por
      sede desaparece).
- [x] Resolver la asignabilidad estructural `Sede.servicios: CodServicio[]` vs
      `Destination.servicios: readonly number[]` si `CodServicio` no es numerico — ensanchar el tipo
      de `Destination` o mapear explicitamente en `ScoringService`. **Prohibido `as unknown as`**
      (apaga la verificacion que hace segura la interseccion).
- **Verificacion:** `cd apps/backend/core && pnpm test -- scoring.service.spec.ts routing-policies.spec.ts`
      — todo en verde, incluyendo los 4 tests de `routing-policies.spec.ts` **sin editarlos**.
- **Rollback:** revertir este archivo y 2.2 juntos (2.4 depende de la firma nueva de 2.2); no toca
      ningun archivo de la Fase 1.

### 2.5 [TEST] — `vigilante.service.spec.ts`: `reRutear()` escala en vez de silenciar

Contexto (item A del brief): `reRutear()` envuelve `this.match.rankear(caso, 3)` en un try cuyo catch
(hoy ~linea 153) solo hace `this.log.error(...)`, mientras la rama de arriba (sin candidatos) si
escala via `escalamiento.escalar({motivo: 'candidatos-agotados'})`. Hoy esto es **latente**: un caso
que llega a `reRutear()` ya paso el chequeo de movil en el despacho, asi que `rankear()` nunca lanzaba
ahi. En cuanto 2.4 hace que `rankear()` pueda lanzar `PulsoError`, un caso que llega a `reRutear()`
en un estado donde la precondicion ya no se cumple (p. ej. el movil cambio entre el despacho y el
re-ruteo) deja el caso sin re-rutear **y sin escalar** — el silencio que la regla 3 de `AGENTS.md`
prohibe.

- [x] Escribir un test que fuerce `this.match.rankear(...)` a lanzar `PulsoError` dentro de
      `reRutear()` y confirme que `escalamiento.escalar(...)` se invoca con un motivo identificable
      (no solo un `log.error`).
- **Verificacion:** `cd apps/backend/core && pnpm test -- vigilante.service.spec.ts` — rojo en el caso
      nuevo.
- **Nota de honestidad:** no se describe como bug activo — es una condicion que la Fase 2 activa por
      primera vez; hasta ahora ningun camino de ejecucion real la disparaba.

### 2.6 [IMPL] — `vigilante.service.ts`: capturar `PulsoError` y escalar en `reRutear()`

- [x] En el catch de `reRutear()` (~linea 153), si el error es una instancia de `PulsoError` (o
      cualquier error propagado de `rankear()`), llamar
      `escalamiento.escalar({ motivo: 'candidatos-agotados' })` (o un motivo especifico si conviene
      distinguir "rankear lanzo" de "sin candidatos") ademas de/en vez de solo loguear.
- **Verificacion:** `cd apps/backend/core && pnpm test -- vigilante.service.spec.ts` en verde.
- **Rollback:** revertir este archivo y 2.5 juntos; no afecta el resto de la Fase 2 ni la Fase 1.

### 2.7 — Cierre de Fase 2: suite completa de `core`

- [x] `cd apps/backend/core && pnpm test` — suite completa en verde.
- **Rollback de la fase completa:** `eligibility-policy.ts`, `scoring.service.ts`,
      `vigilante.service.ts` mas sus tres archivos de test se revierten juntos, sin tocar ningun
      archivo de la Fase 1 ni del frontend.

---

## Fase 3 — Contrato compartido y frontend

Depende de 2.4 (el codigo nuevo debe existir en `core` antes de propagarlo) y de la puerta humana
0.4 (aviso antes de guardar `contracts/types.ts`).

### 3.1 [IMPL] — `contracts/types.ts`: agregar `PULSO_MOVIL_INCOMPATIBLE` a `PulsoCode`

- [ ] **Bloqueado por 0.4** — confirmar el aviso antes de guardar. **El cambio de codigo de abajo ya
      esta hecho en el disco; el AVISO AL EQUIPO todavia no se ha dado.** Ver bloqueante #3 en
      `apply-progress.md`.
- [x] Agregar el miembro `'PULSO_MOVIL_INCOMPATIBLE'` a la union `PulsoCode`.
- **Verificacion:** `cd apps/backend/core && pnpm exec tsc --noEmit` compila.
- **Satisface:** requirement "PULSO_MOVIL_INCOMPATIBLE es un codigo de error valido en ambos
      contratos" (mitad `core`) de `specs/filtro-movil-caso/spec.md`.

### 3.2 [IMPL] — `apps/frontend/lib/api.ts`: agregar `PULSO_MOVIL_INCOMPATIBLE` a `CodigoError`

- [x] Agregar el miembro `'PULSO_MOVIL_INCOMPATIBLE'` a la union `CodigoError`.
- [x] Confirmar (sin editarlo) que `apps/frontend/lib/types.ts` **no** necesita este miembro:
      `scripts/verificar-tipos.mts:74` tolera `PulsoCode` como `solo-core` (tarea 0.7, fuera de
      alcance de esta ola).
- **Verificacion:** `pnpm --dir apps/frontend exec tsc --noEmit` — fallara hasta completar 3.3
      (`Record<CodigoError, Guion>` exige todas las claves).
- **Satisface:** requirement "PULSO_MOVIL_INCOMPATIBLE es un codigo de error valido en ambos
      contratos" (mitad frontend).

### 3.3 [IMPL] — `RevisionRequerida.tsx`: entrada en `GUION`

- [x] Agregar la clave `PULSO_MOVIL_INCOMPATIBLE` a `GUION: Record<CodigoError, Guion>` (linea ~33),
      con la instruccion estable: "Solicita movil medicalizado (TAM) o escala al CRUE." — misma forma
      que las entradas vecinas.
- [x] Confirmar que `campo/page.tsx` **no** necesita cambios (linea 226-233 ya rutea cualquier
      `ErrorApi` con `.codigo` hacia esta pantalla).
- **Verificacion:** `pnpm --dir apps/frontend exec tsc --noEmit` compila; inspeccion visual de que
      `{codigo} · {detalle}` (linea ~117) se combina con la instruccion nueva.
- **Satisface:** requirement "El frontend ofrece un guion estable para el codigo nuevo".

### 3.4 — Cierre de Fase 3: espejo de tipos y verificacion cruzada

- [x] `cd apps/backend/core && pnpm exec tsc --noEmit` — compila limpio.
- [x] `pnpm --dir apps/frontend exec tsc --noEmit` — compila limpio (solo quedan 3 errores
      preexistentes y no relacionados de `.next/types/validator.ts`, confirmados identicos en un
      `git stash` sobre el arbol limpio).
- [ ] `npm run test:tipos` — **NO SE PUDO EJECUTAR.** Ver nota de entorno abajo.
- [ ] `npm run verificar:tipos` — **NO SE PUDO EJECUTAR.** Ver nota de entorno abajo.

**Nota de entorno (no causada por esta ola):** `npm run verificar:tipos` y `npm run test:tipos`
fallan en este entorno con `TypeError: Cannot read properties of undefined (reading 'Latest')` al
intentar `ts.createSourceFile(..., ts.ScriptTarget.Latest, ...)`. La causa es que **la raiz del repo
nunca tuvo `npm install` corrido**: `node_modules/typescript` no existe en la raiz, y Node cae de
vuelta a un paquete `typescript` GLOBAL de pnpm en el store del usuario
(`typescript@7.0.2/lib/version.cjs`, un stub que solo expone `version`), no al `typescript@^5.8.3`
que pide `package.json`. Confirmado con `git stash` sobre el arbol limpio (sin ningun cambio de esta
ola): el mismo error ocurre identico. **`task setup` tampoco lo instala** — solo instala
`apps/frontend`, `apps/backend/core` y `apps/backend/ai-core`, nunca la raiz. Esto es grave porque
`verificar:tipos` es, segun `AGENTS.md`, **lo unico que corre CI** — pero es un problema de entorno
preexistente, fuera de alcance de las 61 tareas de esta ola, y no se intento "arreglar" corriendo
`npm install` en la raiz porque toca dependencias fuera del alcance asignado.

**Verificacion manual del resultado esperado (lectura de codigo, no ejecucion):**
`scripts/verificar-tipos.mts:74` tiene `{ nombre: 'PulsoCode', lado: 'solo-core', porque: ... }` en
`TOLERADOS`. La funcion `comparar()` (linea 252) solo compara miembros de una union cuando el nombre
de la declaracion existe en AMBOS lados (`enCore` y `enEspejo`); como `PulsoCode` no existe del todo
en `apps/frontend/lib/types.ts`, el chequeo de esa declaracion nunca llega al bloque que compararia
los miembros de la union — se resuelve por la rama "tolerada por lado" (linea 254) antes de mirar el
contenido. Agregar un miembro a `PulsoCode` no puede, por construccion del script, producir una
divergencia nueva. Esto es lectura de codigo, no una corrida real — el maintainer debe correr el
comando de verdad despues de que el entorno tenga `npm install` en la raiz.
- **Rollback de la fase completa:** los 3 archivos (`contracts/types.ts`, `lib/api.ts`,
      `RevisionRequerida.tsx`) se revierten juntos; no afecta ninguna otra fase.

---

## Fase 4 — Cierre de la ola

### 4.1 — Verificacion completa antes de abrir el PR

- [x] `cd apps/backend/core && pnpm test` — 102 passed, 8 failed (3 suites de `migration`/`persistence`
      sin relacion, confirmados preexistentes via `git stash` sobre el arbol limpio: fallan identico
      sin ningun cambio de esta ola — dependen de Postgres real).
- [x] `cd apps/services/voz && uv run pytest` — 78 passed, 5 skipped (mismos 5 que el baseline,
      dependen de `PULSO_TEST_DATABASE_URL`).
- [x] `pnpm --dir apps/frontend exec tsc --noEmit` — compila limpio salvo 3 errores preexistentes y
      no relacionados de `.next/types/validator.ts` (confirmados identicos via `git stash`).
- [ ] `npm run test:tipos && npm run verificar:tipos` — **bloqueado por entorno**, ver nota detallada
      en la tarea 3.4. No causado por esta ola; confirmado con `git stash`.
- [x] `git grep -n "<<<<<<<" -- apps/` (regla 8 de `AGENTS.md`) — vacio. (`grep -rn` sin `git` trae
      falsos positivos de `node_modules`/`.venv` — se uso `git grep`, que respeta `.gitignore`.)
- [ ] **Confirmar que las 5 puertas humanas de la Fase 0 (0.1 a 0.5) estan cerradas — NO LO ESTAN.**
      0.1 se resolvio en este apply; 0.2, 0.3, 0.4 y 0.5 siguen abiertas y requieren accion humana.
      Ver la seccion de bloqueantes al inicio de `apply-progress.md`. **No abrir el PR sin resolver
      al menos 0.4 (aviso de `contracts/types.ts`) y sin dejar constancia de 0.2/0.3/0.5.**

### 4.2 — Agrupar commits por unidad de trabajo

Siguiendo `work-unit-commits`: cada fase de este documento es un candidato natural a commit (o grupo
de commits) independiente, en este orden sugerido dentro del PR unico:

1. `docs: actualizar openspec/config.yaml con stack y comandos de test reales` (0.1)
2. `feat(voz): verificar firma de WhatsApp contra bytes crudos` (Fase 1, 1.1-1.5)
3. `feat(voz): validar firma de Twilio antes de aceptar el WebSocket` (Fase 1, 1.6-1.7)
4. `fix(core): mover el chequeo de movil a precondicion de caso` (Fase 2, 2.1-2.4)
5. `fix(core): escalar cuando reRutear() recibe un PulsoError de rankear()` (Fase 2, 2.5-2.6)
6. `feat(contracts): agregar PULSO_MOVIL_INCOMPATIBLE a PulsoCode y CodigoError` (Fase 3)
- [x] Confirmar que los commits 2-3 (Fase 1) y 4-5-6 (Fase 2 y 3) no comparten ningun archivo en su
      diff — verificable con `git diff --stat` por commit. **Verificado sin commitear:**
      `git status --short apps/` muestra 16 archivos modificados; los de la Fase 1 viven enteros bajo
      `apps/services/voz/` (6 de produccion + 2 de test) y los de Fase 2/3 bajo
      `apps/backend/core/` (7) y `apps/frontend/` (2) — cero interseccion de rutas.
- [ ] **No se crearon los commits reales — fuera de alcance de este `sdd-apply`.** El prompt de esta
      corrida indica explicitamente "Do NOT commit, branch, or push": el trabajo queda en el working
      tree para que el usuario decida el commiteo. Esta lista de 6 mensajes queda como guia para quien
      commitee, no como un `git log` ya ejecutado.
- **Verificacion pendiente para quien commitee:** `git log --oneline` y `git diff --stat` por commit,
      una vez creados.

---

## Fuera de alcance (no generar tareas para esto)

- Exponer el modo de firma en `GET /listo` — recomendado por el diseno (mismo patron que
  `deduplicacion.modo`) pero no esta en la lista de archivos de la propuesta; queda para una ola
  futura si se decide.
- Unificar el filtro duro completo de `ScoringService` dentro de `evaluateEligibility()` — trabajo
  futuro nombrado explicitamente en `specs/filtro-movil-caso/spec.md`.
- Espejar `PulsoCode`/`CodigoError` en `apps/frontend/lib/types.ts` — tarea 0.7, ya tolerada por
  `scripts/verificar-tipos.mts:74`.
- Renombrar `eligibility-policy.ts` a espanol — decision D1 del diseno: se sigue el patron existente
  del archivo, no se mezclan idiomas dentro de el.

---

## Review Workload Forecast

- **Chained PRs recommended:** No
- **400-line budget risk:** Medium
- **Estimated changed lines:** ~420-520 (adiciones + eliminaciones, codigo + tests + `config.yaml`)
- **Decision needed before apply:** No

**Como se llego al numero.** Codigo de implementacion (sin tests): `config.py` (~8),
`canales/whatsapp.py` (~40), `rutas/whatsapp.py` (2), `telefonia/rutas.py` (~35), `metricas.py` (3),
`eligibility-policy.ts` (~15), `scoring.service.ts` (~25), `vigilante.service.ts` (~10),
`contracts/types.ts` (1), `lib/api.ts` (1), `RevisionRequerida.tsx` (~5) ≈ 145 lineas. Tests (TDD,
suelen pesar mas que la implementacion): `test_whatsapp.py` (~100), `test_telefonia.py` (~85),
`scoring.service.spec.ts` (~65), `vigilante.service.spec.ts` (~30), extension de
`routing-policies.spec.ts` (~15) ≈ 295 lineas. Mas `openspec/config.yaml` (~25). Total ≈ 465,
redondeado al rango 420-520 para absorber incertidumbre de estilo/formato.

Esto queda comodamente bajo el `review_budget_lines: 800` de esta sesion — sin necesidad de PRs
encadenados ni de una decision explicita antes de aplicar — pero por encima de la guia general de
~400 lineas por PR de `work-unit-commits`, de ahi el riesgo Medium: la mitigacion no es dividir en
mas PRs (el `delivery_strategy` de esta ola ya es `single-pr`), sino la disciplina de commits por
unidad de trabajo de la seccion 4.2, que mantiene cada bloque (Fase 1 vs. Fase 2/3) revertible sin
tocar al otro aunque vivan en el mismo PR.
