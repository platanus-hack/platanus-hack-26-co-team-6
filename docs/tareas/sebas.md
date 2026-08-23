# Sebas — 16 tareas

> Carril histórico: Producto / Pitch / Dominio, dueño de los tokens de diseño, el handshake y el guion.
> **En este plan rota:** también le toca el core de identidad, Testcontainers, el shell de `/panel` y
> los runbooks. **Es dueño de tipos en la ola 4.**

**Ola 0** ✅ [0.1](#01--conectar-el-guard-de-aceptación-única) · ✅ [0.6](#06--motivos-de-rechazo-como-enum-versionado) — **Ola 1** ✅ [1.3](#13--sesión-con-actor-real) · [1.7](#17--testcontainers--aislamiento-de-inquilino) — **Ola 2** [2.3](#23--vista-afiliacionverificar) · [2.7](#27--shell-de-panel) · ✅ [2.11](#211--rate-limit--idempotency-key) — **Ola 3** 🟡 [3.2](#32--cablear-los-22-eventos) · [3.5](#35--sede_canal--envío-dirigido) · [3.10](#310--reporte-del-traslado) — **Ola 4** [4.1](#41--tabla-recepcion--protocolos) · [4.5](#45--entrega-por-qr) · [4.10](#410--vista-de-firma-de-trámites) — **Ola 5** [5.2](#52--vista-panelwebhooks) · [5.5](#55--alertas-y-runbooks) · 🟡 [5.9](#59--panelapi--llaves-con-alcance)

---

## 0.1 · Conectar el guard de aceptación única

**Ola 0** · depende de `0.6` (misma persona, mergear 0.6 primero) · dominio `core/src/handshake/`

**Qué.** ~10 líneas. **La mejor relación valor/esfuerzo de todo el plan.**

**Por qué.** El guard **ya existe y está bien hecho**: `RoutingStore.respond()` tiene idempotencia por `requestKey`, verifica `accepted_destination` y devuelve `PULSO_DESTINATION_ALREADY_ACCEPTED`; la versión Postgres usa `pg_advisory_xact_lock` + `select … for update` y es correcta bajo concurrencia.

**Pero nadie lo llama.** `RoutingService.respond()` no aparece en ningún sitio fuera de su propia definición. La ruta que acepta de verdad es `POST /handshake/respond` → `HandshakeService.procesarRespuesta`, que solo mira el estado de *ese* handshake (`h.estado !== 'enviado'`), **no si otra sede ya aceptó el caso**.

Lo que hoy tapa el hueco es que el fan-out es secuencial. **El día que alguien active fan-out paralelo —que es la optimización obvia— el hueco se abre entero: dos hospitales preparando cama para el mismo paciente.**

**Pasos.**
1. Inyectar `RoutingService` en `HandshakeService`.
2. Antes de escribir el handshake aceptado, llamar `respond(casoId, sedeCodigo, requestKey, fingerprint)`.
3. Si el guard rechaza, devolver `aplicada: false` con el código `PULSO_DESTINATION_ALREADY_ACCEPTED`. **La UI ya sabe manejar `aplicada: false`** — el trabajo de front está hecho.
4. `requestKey` = `handshakeId` + decisión, para que el doble toque siga siendo idempotente.
5. Test de concurrencia: dos aceptaciones simultáneas sobre el mismo caso.

**Hecho cuando.**
- [x] Dos sedes aceptan el mismo caso → la segunda recibe `aplicada: false`
- [x] El doble toque sigue siendo idempotente
- [x] El webhook de Telegram no dice "aceptado" cuando no se aplicó — dice "otra sede ya aceptó este caso · no prepare cama"
- [x] Test de concurrencia real, no secuencial — dos `procesarRespuesta` en vuelo a la vez, con frontera asíncrona en el store: las dos pasan el chequeo de estado antes de que ninguna reserve. La concurrencia entre PROCESOS (dos clientes de Postgres) ya la cubre `postgres-routing.store.spec.ts`, que necesita `PULSO_TEST_DATABASE_URL` — se enciende en 1.7

**Trampas.** No dupliques la lógica en `HandshakeService`. **Llama al guard que ya existe.** Dos mecanismos resolviendo la misma carrera es peor que cualquiera de los dos por separado — el propio `AlmacenService` documenta que ya pasó una vez con el vencimiento de handshakes.

---

## 0.6 · Motivos de rechazo como enum versionado

**Ola 0** · sin dependencias · dominio `core/src/catalogo/`, `components/hospital/MotivosCapacidad.tsx` · **mergea antes que 0.1**

**Qué.** Los cuatro motivos son literales dentro de un `.tsx` y viajan como texto libre a `handshake.motivoRechazo`.

**Por qué.** Dos consecuencias:
- **El dataset de aceptación —el activo del producto— es incomparable en el tiempo.** Basta que alguien cambie una palabra en el `.tsx` para partir la serie histórica.
- **No se puede distinguir un rechazo por capacidad de uno administrativo**, que es justo la distinción que sostiene la tesis del producto.

**Pasos.**
1. Catálogo `motivo_rechazo` con `codigo` (inmutable), `etiqueta` (editable), `categoria` (`capacidad` / `recurso_humano` / `tecnico` / `administrativo`) y `version`.
2. Semilla con los cuatro actuales + **el quinto que falta**: `SIN_CLARIDAD_PAGADOR`, categoría administrativa. Es el motivo real que nadie toca hoy porque no existe el botón.
3. `handshake.motivo_codigo` referencia el catálogo; `motivoRechazo` (texto) se conserva para no romper nada.
4. `MotivosCapacidad.tsx` lee del catálogo.
5. **Conservar la regla de producto que ya está bien puesta**: en triage I no se ofrece rechazo, escala directo al CRUE. Ley 1751/2015.

**Hecho cuando.**
- [x] El handshake guarda código, no texto — `motivoCodigo`; el texto se conserva como la etiqueta congelada que se vio
- [x] Cambiar una etiqueta no rompe el histórico
- [x] La categoría administrativa existe y se puede reportar aparte — `SIN_CLARIDAD_PAGADOR`, con índice parcial en `handshake.motivo_codigo`
- [x] Triage I sigue sin botón de rechazo

**Trampas.** El quinto motivo es delicado en el pitch: es admitir que hay rechazos administrativos. **Es exactamente lo que hay que decir** — es la evidencia de la tesis, y medirlo es lo que permite atacarlo.

---

## 1.3 · Sesión con actor real

**Ola 1** · depende de `1.1` (Zaid) · dominio `core/src/auth/` · **mergea antes que 1.4 y 1.8**

**Qué.** El corazón del modelo de identidad. Reemplaza la contraseña de turno.

**Pasos.**
1. El token firma `{sub, org, rol[], sed[], tip, sid, exp}` en vez de `{sub:'operador', exp}`. Estructura completa en [multitenancy §3.2](../multitenancy-y-autenticacion.md#32-tokens-qué-lleva-cada-uno).
2. **Argon2id** para contraseñas, no `sha256` sin sal. Mínimo 12 caracteres.
3. Access 15 min + refresh 30 días **con rotación y detección de reuso**: si un `jti` ya usado reaparece, se revoca la cadena completa y se emite evento de seguridad.
4. Tabla `sesion` con `revocada_en`; lista de revocadas cacheada en Redis para que revocar un rol invalide al instante y no espere los 15 min.
5. `RolGuard` + decoradores `@Rol()` y `@AlcanceSede()`, junto al `SesionGuard` global que ya niega por defecto (ese diseño es correcto, se conserva).
6. **`PULSO_AUTH_LEGACY=true`**: la contraseña de turno sigue emitiendo token con una organización "demo". **Es lo que permite mergear sin bloquear al equipo.**
7. Bloqueo progresivo por cuenta **y** por IP.
8. 2FA (TOTP) para `regulador_crue`, `admin_plataforma` y `auditor`.

**Hecho cuando.**
- [x] Un token lleva actor, organización, roles y alcance
- [x] Refresh reusado → cadena revocada + evento (`refresh_reusado` en `RegistroSesiones`)
- [x] Revocar un rol invalida la sesión al instante — `revocarDeActor()`; la lista de revocadas es un `Map`, no Redis, hasta 1.2
- [x] Con `PULSO_AUTH_LEGACY=true` el demo sigue entrando como siempre — y viene encendido por defecto mientras no exista la tabla `actor`
- [x] La cookie sigue siendo `HttpOnly` y el front nunca lee el token — ahora son dos, y la de refresco va con `path=/auth/refresh`

**Trampas.** Es la tarea de la que dependen 12 más. **Mergéala pronto aunque esté incompleta en lo opcional** (2FA puede ir después). Lo que no puede faltar es la estructura del token.

> **Lo que quedó fuera, y por qué.**
> - **2FA (TOTP).** Es lo opcional de la tarea y no bloquea a nadie. Va aparte; la lista de roles que lo exigirán ya está declarada en `auth/roles.ts`.
> - **Tabla `sesion` y actores en Postgres.** Dependen de `1.1`. Hoy viven en `Map` detrás de una interfaz: cuando 1.1 aterrice se agrega `RepoActoresPostgres` y ninguna ruta cambia.
> - **Argon2id.** El código lo usa **si el módulo está**; sin él, scrypt (`N=2^15,r=8,p=3`), que también es memory-hard. No se agregó la dependencia porque el lockfile es de pnpm y no se puede regenerar desde aquí: `pnpm --filter core add argon2` y cada login migra su hash solo.
> - **`@Rol()` sobre las rutas existentes.** La maquinaria está y probada; decorar cada ruta es de quien la conoce, en su tarea. Aplicarlas hoy sobre rutas que abría una contraseña compartida rompería el demo sin que nadie lo pida.

---

## 1.7 · Testcontainers + aislamiento de inquilino

**Ola 1** · depende de `1.6` (Neid) · dominio `core/test/`, `.github/workflows/`

**Qué.** Postgres real en los tests, y **el test que prueba que RLS funciona**.

**Por qué.** Es la **única** forma de probar que una policy aísla de verdad. Un mock nunca prueba eso — y una policy rota se ve exactamente igual que una que funciona hasta el día que no.

**Pasos.**
1. Testcontainers con Postgres + PostGIS. **Puertos dinámicos**: no hardcodear la cadena de conexión, sobrescribir la config en `Test.createTestingModule`.
2. Correr las migraciones en el contenedor al arrancar la suite.
3. **El test que importa:**
   ```
   dado    un caso de la organización A
   cuando  se consulta en contexto de la organización B
   entonces devuelve 0 filas
   ```
   Si pasa a verde por accidente (porque no hay datos), el test está mal escrito. **Verifica primero que en contexto de A sí devuelve la fila.**
4. Test de concurrencia con pooler: 20 peticiones alternando inquilino, ninguna ve datos de la otra. Es donde aparece la fuga de `SET` sin `LOCAL`.
5. Test de idempotencia de `RoutingStore` bajo concurrencia real.
6. Docker en CI, con caché de imagen.

**Hecho cuando.**
- [ ] La suite levanta Postgres real y corre migraciones
- [ ] El test de aislamiento pasa **y falla si se quita la policy** (compruébalo quitándola)
- [ ] El test de concurrencia pasa
- [ ] CI corre en < 8 min

**Trampas.** Un test de aislamiento que pasa porque la consulta no devuelve nada en ningún contexto es peor que no tenerlo: da confianza falsa. **Prueba siempre el caso positivo y el negativo.**

---

## 2.3 · Vista `/afiliacion/verificar`

**Ola 2** · depende de `2.1` (Juan), `2.2` (Neid) · dominio `components/afiliacion/Verificacion.tsx`

**Qué.** El paso 2 de la afiliación: 12 dígitos → la ficha REPS completa.

**Por qué.** **Es el momento que vende el producto en el onboarding.** El usuario escribe su código de habilitación y la pantalla le responde con el nombre de su propia sede, su dirección, sus servicios habilitados y sus camas. **No tipeó nada y el sistema ya sabe quién es.** Es el mismo truco del ranking, aplicado al registro.

**Pasos.**
1. Campo de 12 dígitos con formato y validación en vivo.
2. Al completar, consulta sola (con *debounce*): estado de carga → resultado.
3. **La revelación**: tarjeta con nombre, dirección, localidad, complejidad, naturaleza, servicios habilitados (con nombre, no código) y camas. Animación de entrada — es un momento, no un mensaje.
4. Si no cruza: motivo específico y camino alterno ("no encontramos ese código; verifica en REPS o continúa con verificación manual").
5. Si cruza parcialmente: lo que coincide en verde, lo que no en ámbar.
6. Botón "no es mi sede" que vuelve atrás sin perder lo escrito.

**Hecho cuando.**
- [ ] Un código real revela la ficha en < 1 s
- [ ] El momento de la revelación se siente (mídelo con alguien que no lo haya visto)
- [ ] Un código inválido explica qué hacer
- [ ] Funciona en móvil

**Trampas.** Vive dentro de `components/afiliacion/` que abre Neid en 2.2. **Mergea después de 2.2 y rebasa.** Coordinen la interfaz del componente antes de empezar.

---

## 2.7 · Shell de `/panel`

**Ola 2** · depende de `1.4` · dominio `frontend/app/(panel)/layout.tsx`, `components/panel/` · **mergea PRIMERO en la ola 2**

**Qué.** El armazón de la consola de administración.

**Pasos.**
1. Layout con navegación lateral que **cambia según rol**: un `jefe_urgencias` no ve "Equipo" ni "Móviles".
2. Selector de organización si el actor tiene varias (caso límite 1).
3. shadcn/ui **aislado a este árbol**. ⚠️ **No tocar `/campo`, `/hospital` ni `/crue`**: su lenguaje visual (Pulsewave) ya está definido y es un activo. Dos lenguajes conviviendo, a propósito.
4. Estados vacíos con acción ("aún no tienes móviles — agregar el primero").
5. Migas de pan y título por página.
6. Responsive: un administrador de IPS pequeña entra desde el celular.

**Hecho cuando.**
- [ ] La navegación refleja el rol real
- [ ] Ninguna clase de shadcn se filtra a las tres consolas
- [ ] Los estados vacíos dicen qué hacer
- [ ] Los otros tres pueden colgar sus páginas sin tocar el layout

**Trampas.** **Mergea el día 1 de la ola 2.** Tres personas cuelgan páginas de aquí; si llega tarde, los bloqueas a todos.

---

## 2.11 · Rate limit + `Idempotency-Key`

**Ola 2** · depende de `1.3` · dominio `core/src/common/idempotencia.ts`

**Qué.** Idempotencia genérica en toda mutación y límite de tasa por actor.

**Por qué.** Spec §0: *"Reintentos por mala conectividad de la ambulancia son la norma, no la excepción."* Hoy la idempotencia existe solo dentro de `RoutingStore` y nada más la tiene.

**Pasos.**
1. Interceptor que lee el header `Idempotency-Key` y, si ya se procesó, devuelve el resultado guardado.
2. Generalizar `pulso_routing_idempotency` a `idempotencia(clave, huella, resultado, creado_en)` con purga a 24 h.
3. **Conflicto de huella** con la misma clave → `PULSO_IDEMPOTENCY_CONFLICT` (el código ya existe).
4. Rate limit por actor y por organización, con `Retry-After`. Límites distintos: `/triage` es caro, `/estado` es barato.
5. El cliente de `/campo` genera la clave por acción y la reusa al reintentar (engancha con la cola offline).

**Hecho cuando.**
- [x] La misma mutación con la misma clave dos veces → un solo efecto (y la respuesta lleva `Idempotency-Replayed: true`)
- [x] La misma clave con cuerpo distinto → 409 `PULSO_IDEMPOTENCY_CONFLICT`
- [x] El rate limit devuelve `Retry-After` y `retryable: true`; `/triage` nunca hace esperar más de 5 s
- [x] `/campo` reintenta sin duplicar — la clave se deriva de la acción (caso+sede), no de un aleatorio por intento

**Trampas.** No apliques rate limit a `POST /triage` con la misma dureza que al resto. **Un paramédico con un paciente crítico reintentando no es un abusador**, y bloquearlo es el peor fallo posible del sistema.

---

## 3.2 · Cablear los 22 eventos

**Ola 3** · depende de `3.1` (Neid) · dominio `core/src/handshake/`, `dispatch/`, `vigilante/`, `escalamiento/` · **mergea antes que 3.8, 3.10, 3.11**

**Qué.** Que toda transición escriba su evento.

**Por qué.** Los cuatro que más duelen: **`rerouteado`** (el mejor momento del producto —"el hospital dijo que no y el sistema siguió solo"— no queda registrado en ninguna parte), **`override_crue`** (en `localStorage`), **`llegada_puerta`/`entrega`** (no existen, y sin ellos no hay tiempo de traslado real), y **`revision_humana`** (la compuerta de seguridad clínica no deja evidencia de que se ejerció).

**Pasos.**
1. Recorrer la lista de los 22 en [Parte II §11.2](../pulso-plataforma-afiliacion-y-tramites.md#112-los-22-eventos-quién-los-emite-y-cuáles-se-pierden-hoy).
2. Cada transición llama `RegistroService.registrar()` con actor y clave de idempotencia.
3. **Regla que lo mantiene honesto:** si un servicio cambia estado sin registrar, es un bug — no una omisión. El test de 5.12 lo hace cumplir.
4. Los eventos que llegan por WhatsApp (`llegada_escena`, `entrega`, `demora_reportada`) hoy **se reciben y se tiran** — `despachador.py` solo limpia la sesión y el `TODO` de la demora lleva ahí desde el principio. Cablearlos.
5. `evento_caso` en la misma transacción que el cambio de estado.

**Hecho cuando.**
- [~] Los 22 eventos se escriben desde su punto real — **12 sí**; 6 tienen la puerta abierta y esperan a `1.8` (token de servicio de `voz`); 6 necesitan funcionalidad que no existe (`4.1`, `4.6`). Tabla abajo
- [x] `rerouteado` aparece en la línea de tiempo con la sede origen y destino
- [ ] "Ya llegué" por WhatsApp produce un evento, no un log — **bloqueado**: `POST /casos/:id/eventos` ya lo acepta, pero `voz` no puede autenticarse contra core hasta `1.8` (Juan)
- [x] Ninguna transición escribe estado sin evento — de las que existen hoy en core. El test que lo vuelve exigible es `5.12`

**Trampas.** Toca cuatro módulos a la vez. **Hazlo en un PR por módulo**, no en uno grande: son los archivos más calientes del repo y tres personas más los van a tocar en esta ola.

> ### Estado real del cableado — [PR #22](https://github.com/platanus-hack/platanus-hack-26-co-team-6/pull/22), sobre la [#20](https://github.com/platanus-hack/platanus-hack-26-co-team-6/pull/20) (la `3.1` de Neid, hecha desde este carril)
>
> **Un solo PR y no cuatro**, a propósito: nadie más tenía trabajo en vuelo sobre
> esos archivos en el momento de hacerlo (Neid iba por `voz` y `ai-core`, Zaid y
> Juan no habían abierto rama). Con la ola vacía, cuatro PRs encadenados sobre el
> mismo `RegistroService` era ceremonia sin revisor.
>
> | Evento | Estado | Dónde |
> |---|---|---|
> | `caso_creado` | ✅ | `triage.controller.ts` |
> | `revision_humana` | ✅ | `triage.controller.ts` — la compuerta clínica por fin deja rastro |
> | `match_calculado` | ✅ | `match.controller.ts`, con la huella de la evidencia |
> | `despachado` | ✅ | `dispatch.service.ts`, idempotente por (caso, sede) |
> | `aceptado` · `rechazado` | ✅ | `handshake.service.ts`, con `motivoCodigo` de `0.6` |
> | `timeout` | ✅ | `vigilante.service.ts` |
> | `rerouteado` | ✅ | `vigilante.service.ts`, con sede origen **y** destino |
> | `demora_detectada` | ✅ | `vigilante.service.ts` |
> | `escalado` | ✅ | `escalamiento.service.ts` |
> | `intento_cruzado` | ✅ | `rol.guard.ts` — en el registro de seguridad **y** en la línea del caso |
> | `override_crue` | ✅ | `POST /casos/:id/eventos` + `crue/bitacora.ts`. **Salió de `localStorage`** |
> | `llegada_escena` · `salida_escena` · `llegada_puerta` · `entrega` · `demora_reportada` · `cerrado` | 🚪 | La puerta existe y valida; falta que `voz` la llame — necesita el token de servicio de **`1.8` (Juan)** |
> | `prearribo_enviado` · `preparacion_confirmada` | ❌ | Necesitan la recepción de **`4.1`** (mía, bloqueada por `3.1`) |
> | `derechos_verificados` · `tramite_generado` · `tramite_firmado` · `contrarreferencia` | ❌ | Necesitan la tabla `tramite` de **`4.6` (Zaid)** |
>
> **Lo que un cliente puede escribir es una lista corta y cerrada.** Un `POST`
> abierto a los 22 tipos dejaría que una consola escribiera `aceptado` sin que
> nadie haya aceptado nada. Y el evento se firma con **el actor de la sesión**,
> nunca con lo que venga en el cuerpo.

---

## 3.5 · `sede_canal` + envío dirigido

**Ola 3** · depende de `3.3` (Zaid) · dominio `core/src/canales/`, `core/src/sedes/`

**Qué.** Se acaba el `TELEGRAM_CHAT_ID_DEMO` global.

**Por qué.** Hoy **todos** los handshakes van al mismo chat, sin importar a qué hospital se dirigen. Es correcto para un demo e imposible para dos hospitales.

**Pasos.**
1. Tabla `sede_canal` (DDL en Parte II §1 bloque C): canal, destino, etiqueta, prioridad, verificado.
2. `CanalesService.notificar()` resuelve el destino desde la sede, con la cascada actual de fallback (Telegram → WhatsApp → consola) **por sede**, no global.
3. **Botón "probar canal"**: manda un mensaje real que hay que confirmar. Un canal no verificado no cuenta como canal.
4. Sin canal configurado para una sede → cae a consola y **lo dice en `/panel`**, no en silencio.
5. Conservar `TELEGRAM_CHAT_ID_DEMO` como último recurso para el demo, detrás de bandera.

**Hecho cuando.**
- [ ] Dos sedes reciben en dos chats distintos
- [ ] El botón de prueba manda un mensaje real
- [ ] Un canal no verificado se ve como pendiente
- [ ] El demo sigue funcionando con la variable global

**Trampas.** Es la tarea que hace útil la identidad por sede. Sin ella, `jefe_urgencias` de dos hospitales distintos siguen recibiendo lo mismo y la separación es solo visual.

---

## 3.10 · Reporte del traslado

**Ola 3** · depende de `3.2` · dominio `core/src/eventos/reporte.ts`, `frontend/app/(consolas)/campo/historial`

**Qué.** `GET /casos/:id/reporte` y la vista que lo muestra.

**Por qué.** Es la respuesta a "¿genera el reporte de todo lo que hace el paramédico?" — que hoy es **no**. Con esto, el registro que hoy se llena a mano se llena solo.

**Pasos.**
1. `GET /casos/:id/reporte` arma la línea de tiempo: hora, actor, evento, motivo, sede.
2. Incluye los tiempos que importan: escena → salida → puerta → entrega, y el ETA prometido vs. el real.
3. `/campo/historial`: traslados del turno con su reporte, exportable.
4. Compartible por WhatsApp desde `/campo` (el paramédico lo manda a su coordinador).
5. **No es un FURIPS.** Se dice "esto alimenta el FURIPS", nunca "esto es el FURIPS": es un formato regulado y falsificarlo para un demo es peor que no tenerlo.
6. Alcance: el paramédico ve los suyos; el CRUE, todos.

**Hecho cuando.**
- [ ] Un traslado completo produce un reporte sin huecos
- [ ] Los tiempos reales aparecen junto a los prometidos
- [ ] Se puede compartir desde el celular
- [ ] Un paramédico no ve traslados de otro móvil

---

## 4.1 · Tabla `recepcion` + protocolos

**Ola 4** · depende de `3.1` · dominio `core/src/recepcion/` (nuevo), migración `0008` · **mergea PRIMERO en la ola 4** · 🔑 **dueño de tipos de la ola 4**

**Qué.** Lo que se dispara en el instante del "Aceptar".

**Pasos.**
1. Migración con la tabla `recepcion` (DDL en Parte II §1 bloque D2).
2. Al aceptar: crear la recepción, resolver el protocolo, pedir el SBAR (4.2), armar el checklist, arrancar la ventana (4.4), abrir los trámites (4.6), empezar el ETA vivo.
3. **Protocolo por tabla versionada, no por LLM.** Un modelo que activa "código infarto" mal enciende una sala de hemodinamia por nada. Spec §7.2: *"el LLM propone, la tabla decide"*.
4. Checklist por protocolo: hemodinamia + hemodinamista + camilla + banco de sangre en IAM; TAC + neurólogo + ventana en ACV.
5. `PATCH /casos/:id/recepcion/checklist` escribe `preparacion_confirmada` con actor.
6. **Como dueño de tipos:** mergea primero `Recepcion`, `Tramite`, `TipoTramite` — todos opcionales.

**Hecho cuando.**
- [ ] Aceptar crea la recepción en la misma transacción
- [ ] Un IAM activa código infarto con su checklist
- [ ] Un diagnóstico sin protocolo no inventa uno
- [ ] Solo la sede destinataria ve la recepción

**Trampas.** Si el SBAR o el protocolo fallan, **la aceptación no puede fallar**. Se crea la recepción igual, con el SBAR en cola. Nunca bloquees un "Aceptar" por un servicio de IA.

---

## 4.5 · Entrega por QR

**Ola 4** · depende de `4.1` · dominio `core/src/recepcion/entrega.ts`, `frontend/app/(consolas)/hospital/entrega`

**Qué.** El paciente llega y el expediente pasa sin retipear nada.

**Por qué.** **Es el renglón "0 campos por tipear"** — el momento más caro del trámite actual: hoy se repite el triage, se retipean los datos y la historia empieza de cero.

**Pasos.**
1. `/campo` muestra un QR (y un código de 6 dígitos como respaldo: el QR falla con pantalla sucia o poca luz).
2. El hospital escanea o tipea → `POST /casos/:id/entrega`.
3. Llega el expediente completo: SBAR, signos, línea de tiempo, trámites, decisión de ruteo con evidencia.
4. **El triage de puerta deja de repetirse**: llega hecho con hora, autor y nivel; el hospital **confirma o corrige** (una corrección es un evento nuevo, no una edición).
5. Escribe `entrega` y completa `tramite:entrega_paciente`.
6. Token de un solo uso, con expiración corta.

**Hecho cuando.**
- [ ] Escanear trae el expediente completo
- [ ] El código de 6 dígitos funciona igual
- [ ] El triage llega prellenado y se puede corregir
- [ ] El token no se puede reusar
- [ ] Solo la sede destinataria lo puede consumir

**Trampas.** El QR se muestra en un celular que puede tener la pantalla rota, sucia o al 10% de brillo. **El código de respaldo no es opcional.**

---

## 4.10 · Vista de firma de trámites

**Ola 4** · depende de `4.6` (Zaid) · dominio `frontend/app/(consolas)/hospital/tramites`

**Qué.** El humano revisa el borrador y firma.

**Por qué.** La regla que evita el desastre: **PULSO genera, pre-llena y propone; un humano firma. Nunca al revés.** Un FURIPS mal presentado automáticamente no es eficiencia: es un problema jurídico para el hospital que confió.

**Pasos.**
1. Lista de trámites del caso con su estado y quién los generó (`automatico` / `ia` / `humano`).
2. Al abrir uno: el borrador editable, con **lo generado por IA marcado visualmente**.
3. Firmar exige revisar: no hay "firmar todo".
4. Los `omitido_por_urgencia` muestran la norma que los exime (Ley 1751/2015 art. 14) — es lo que elimina la discusión en la puerta.
5. Un trámite firmado ya no se edita; una corrección es un trámite nuevo.
6. Alcance: `jefe_urgencias` firma los hospitalarios; `paramedico`, los prehospitalarios.

**Hecho cuando.**
- [ ] Nada se firma sin abrirlo
- [ ] Lo generado por IA se distingue de lo verificado
- [ ] La norma citada aparece junto al trámite omitido
- [ ] Un trámite firmado es inmutable

**Trampas.** La tentación es "firmar todo" para que el demo se vea rápido. **Es exactamente lo que no se puede hacer.** La lentitud de esta pantalla es una característica.

---

## 5.2 · Vista `/panel/webhooks`

**Ola 5** · depende de `5.1` (Zaid) · dominio `frontend/app/(panel)/webhooks`

**Qué.** Que una organización configure sus propios webhooks sin escribirle a nadie.

**Pasos.**
1. Alta de endpoint: URL, eventos suscritos, secreto **mostrado una sola vez** al crearlo.
2. Tabla de últimas entregas: evento, estado, intentos, código de respuesta, latencia.
3. **Botón de reenvío manual** por entrega fallida.
4. Estado del circuit breaker: si se desactivó por 20 fallos, decirlo y ofrecer reactivar.
5. Enviar un evento de prueba.
6. Documentación en la propia página: cómo verificar la firma, con ejemplo de código.

**Hecho cuando.**
- [ ] Se crea un endpoint y llega un evento de prueba
- [ ] El secreto no se puede volver a ver (solo rotar)
- [ ] El reenvío funciona
- [ ] El ejemplo de verificación de firma es copiable y correcto

**Trampas.** El ejemplo de código de la documentación **tiene que funcionar de verdad**. Un ejemplo que no valida la firma correctamente es peor que ninguno: el integrador lo copia y queda inseguro creyendo que no.

---

## 5.5 · Alertas y runbooks

**Ola 5** · depende de `5.4` (Neid) · dominio `docs/runbooks/`

**Qué.** Qué despierta a alguien, y qué hace cuando lo despiertan.

**Pasos.**
1. Las seis alertas del [plan maestro §7.3](../pulso-produccion-plan-maestro.md#73-alertas-que-despiertan-a-alguien), con umbral y destinatario.
2. Un runbook por página en `docs/runbooks/`: `ai-core caído` · `Mapbox agotado` · `Supabase caído` · `canal muerto` · `outbox atascado` · `restaurar backup` · `rotar secreto filtrado` · `sede reporta que no le llegan solicitudes`.
3. Cada runbook: síntoma → diagnóstico (comandos exactos) → mitigación → causa raíz → prevención.
4. **Probar dos de ellos de verdad**, tumbando el servicio a propósito. Un runbook no probado es ficción.
5. Escalamiento: quién, en qué orden, con qué tiempo.

**Hecho cuando.**
- [ ] Las seis alertas disparan en pruebas
- [ ] Ocho runbooks, cada uno en una página
- [ ] Dos probados tumbando el servicio
- [ ] Alguien que no escribió el código puede seguir uno

**Trampas.** Escribir runbooks desde la teoría produce documentos que no sirven a las 3 a.m. **Tumba el servicio y escribe lo que realmente hiciste.**

---

## 5.9 · `/panel/api` — llaves con alcance

**Ola 5** · depende de `1.3` · dominio `core/src/auth/llaves.ts`, `frontend/app/(panel)/api`

**Qué.** Llaves de API para que el HIS de un hospital consuma PULSO.

**Pasos.**
1. Generar llave con prefijo `pulso_sk_`, guardar **solo el hash**, mostrar el valor una sola vez.
2. Alcance por llave: `caso:leer`, `capacidad:declarar`, `webhook:administrar`. **Mínimo por defecto.**
3. Rotación con ventana de gracia: la vieja sigue sirviendo 24 h para no tumbar la integración del cliente.
4. Registro de uso por llave: última vez, IP, conteo. Es lo que permite detectar una llave filtrada.
5. Revocación inmediata.
6. Rate limit por llave, independiente del de sesión.

**Hecho cuando.**
- [x] Una llave solo hace lo de su alcance (403 probado end-to-end) — y **una ruta sin `@Alcance()` no la admite ninguna llave**
- [x] La rotación no tumba al integrador — 24 h de gracia, alcances heredados
- [x] El uso queda registrado — conteo, última vez e IP; los intentos con una llave revocada también
- [x] La llave no se puede volver a ver — se guarda solo el sha256 y los últimos 4 para la tabla

**Trampas.** El prefijo `pulso_sk_` no es cosmético: permite que escáneres de secretos la detecten si alguien la commitea. Es una cortesía al integrador que cuesta cero.

> **Estado: backend hecho, vista pendiente.** `core/src/auth/llaves.ts` +
> `POST/GET/DELETE /auth/llaves` funcionan y están probados; `GET /estado` ya
> acepta llaves con `caso:leer`. La vista `/panel/api` **cuelga del shell de
> `/panel` (2.7)**, que a su vez espera `1.4`. Mientras tanto se administra con
> `curl`, que es como lo va a usar el integrador de un HIS de todas formas.
>
> Dos cosas que hay que cerrar antes de repartir una llave fuera del equipo:
> **`/estado` todavía no filtra por organización** (eso es 1.5/1.6), y las
> llaves viven en memoria hasta que exista su tabla (1.2).
