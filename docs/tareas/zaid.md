# Zaid — 16 tareas

> Carril histórico: Backend / Datos, dueño del ETL, PostGIS, `SedesService` y el catálogo REPS.
> **En este plan rota:** también le tocan firmas de webhook en Python, el cliente HTTP del frontend,
> ventanas clínicas y el despliegue completo. **Es dueño de tipos en las olas 1 y 5.**

**Ola 0** [0.2](#02--verificar-firma-de-whatsapp-y-twilio) · [0.8](#08--corregir-el-filtro-de-móvil) — **Ola 1** [1.1](#11--migración-0003_identidad) · [1.5](#15--rol-no-owner--force-rls--encontextode) — **Ola 2** [2.4](#24--crud-de-organización-y-sedes-vinculadas) · [2.8](#28--tanstack-query--cliente-tipado) · [2.12](#212--estado-público-y-health-extendido) — **Ola 3** [3.3](#33--sede_estado--capacidad_declarada--filtro-duro) · [3.6](#36--movil--movil_estado--campoturno) · [3.9](#39--tiempo-real-por-canales-con-alcance) — **Ola 4** [4.4](#44--ventanas-clínicas) · [4.6](#46--tabla-tramite--motor-de-trámites) · [4.11](#411--alerta-de-preparación-no-confirmada) — **Ola 5** [5.1](#51--webhooks-salientes-outbox) · [5.6](#56--e2e-con-playwright) · [5.10](#510--despliegue-completo)

---

## 0.2 · Verificar firma de WhatsApp y Twilio

**Ola 0** · sin dependencias · dominio `voz/app/canales/whatsapp.py`, `voz/app/telefonia/`

**Qué.** Validar `X-Hub-Signature-256` (Meta) y `X-Twilio-Signature` contra el **cuerpo crudo**.

**Por qué.** Hoy `voz` es el único servicio con cara a internet y **acepta cualquier POST que le llegue**. Telegram sí está bien (`secret_token`), pero WhatsApp y Twilio no. Cualquiera puede inyectar un caso falso — o peor, disparar una llamada de Twilio que cuesta dinero real.

**Pasos.**
1. FastAPI: capturar el cuerpo crudo antes de parsear.
   ```python
   cuerpo = await request.body()          # bytes EXACTOS
   firma = request.headers.get("X-Hub-Signature-256", "")
   esperado = "sha256=" + hmac.new(APP_SECRET.encode(), cuerpo, hashlib.sha256).hexdigest()
   if not hmac.compare_digest(firma, esperado):
       raise HTTPException(401)
   ```
2. **Contra el cuerpo crudo, no contra el JSON re-serializado.** Meta firma los bytes exactos: si parseas y vuelves a serializar, el HMAC no coincide nunca.
3. Twilio: `RequestValidator` del SDK oficial, con la URL pública completa (la que Twilio usó, incluido el esquema).
4. Sin `WHATSAPP_APP_SECRET` configurado: **loguear una advertencia fuerte y seguir aceptando** en desarrollo, pero **rechazar en producción** (`NODE_ENV`/`ENTORNO`). Es la única excepción a "degrada siempre": un webhook abierto en producción es la vulnerabilidad.
5. Métrica `pulso_webhook_firma_invalida_total{proveedor}` — y alerta si > 0 (o hay un bug, o alguien está probando).

**Hecho cuando.**
- [ ] Firma correcta → 200; firma alterada → 401
- [ ] Test con payload real de Meta y su firma
- [ ] `compare_digest`, no `==` (tiempo constante)
- [ ] En producción sin secreto, el servicio no arranca o rechaza todo
- [ ] La métrica existe

**Trampas.** Comparte servicio con 0.3 (Neid), que toca `rutas/whatsapp.py`. **Tú tocas `canales/whatsapp.py` y `telefonia/`.** Coordinen el orden.

---

## 0.8 · Corregir el filtro de móvil

**Ola 0** · sin dependencias · dominio `core/src/scoring/scoring.service.ts`, `routing/eligibility-policy.ts`

**Qué.** `movilCompatible(caso.tipoMovil, caso.requiereMedicoABordo)` se evalúa **dentro del bucle de destinos** y no depende de la sede.

**Por qué.** Si el paciente requiere médico a bordo y el móvil es TAB, **todas** las sedes reciben `motivoDescarte` y el ranking sale vacío. El resultado final es correcto (un TAB no puede llevar ese paciente), pero **la UI le echa la culpa al hospital**: pinta cuatro tarjetas grises con "El paciente requiere médico a bordo" como si fuera un defecto de las sedes.

**Pasos.**
1. Sacar la comprobación del bucle de `rankear()` y hacerla **antes**, a nivel de caso.
2. Si falla: devolver `PULSO_INCOMPLETE_EVIDENCE`... **no** — código nuevo `PULSO_MOVIL_INCOMPATIBLE`, agregado a `PulsoCode` (coordinar con el dueño de tipos).
3. El mensaje dice la verdad: *"Este paciente requiere TAM y AMB-014 es TAB. Solicita móvil medicalizado o escala al CRUE."*
4. La UI de `/campo` lo pinta como bloqueo de caso, no como ranking vacío. Reusar el componente `RevisionRequerida` que ya existe.
5. Aprovechar y decidir sobre `evaluateEligibility()`: está escrito, correcto y **nadie lo llama**. Conectarlo **sin `NO_AVAILABLE_BED`** — filtrar camas contra el snapshot 2022-11-30 descarta hospitales que hoy sí reciben (`sedes.json` trae sedes con 108 camas y 119 ocupadas).

**Hecho cuando.**
- [ ] Caso TAM + móvil TAB → error de caso, no ranking vacío
- [ ] `evaluateEligibility()` conectado y con test, sin el filtro de camas
- [ ] Ninguna sede recibe `motivoDescarte` por una condición que no es suya
- [ ] Los tests de `routing-policies.spec.ts` siguen verdes

**Trampas.** `catalogo/servicios-reps.ts` lo toca Sebas en 0.6. **Tú solo tocas `scoring.service.ts` y `eligibility-policy.ts`.**

---

## 1.1 · Migración `0003_identidad`

**Ola 1** · sin dependencias · dominio `supabase/migrations/` · **mergea antes que 1.5 y 1.6** · 🔑 **dueño de tipos de la ola 1**

**Qué.** Las cinco tablas del modelo de identidad.

**Pasos.**
1. `organizacion`, `organizacion_sede`, `actor`, `actor_rol`, `invitacion` — DDL completo en [Parte II §1 bloque B](../pulso-plataforma-afiliacion-y-tramites.md#bloque-b--identidad-organizaciones-y-roles).
2. `unique (tipo, nit)` en organización; `unique` en `actor.identificador`.
3. Índices: `actor(organizacion_id)`, `actor_rol(actor_id)`, `organizacion_sede(codigo_sede)`, `invitacion(token_hash)`.
4. **Migración `down` que funcione.** CI la corre en cada PR.
5. Semilla: una organización `crue` con un `admin_plataforma`, para no quedarse fuera del sistema que acabas de cerrar.
6. **Como dueño de tipos:** mergea primero un PR que solo toca `contracts/types.ts` + `lib/types.ts` con `Organizacion`, `Actor`, `Rol`, `EstadoAfiliacion` — **todos los campos nuevos opcionales**.

**Hecho cuando.**
- [ ] `up` y `down` corren limpio sobre base vacía y sobre base con datos
- [ ] `pg_trgm` habilitada (la usa 2.1 para el cruce por nombre)
- [ ] La semilla deja un `admin_plataforma` utilizable
- [ ] Los tipos están mergeados **antes** que el resto de la ola

**Trampas.** `caso` y `handshake` ya existen en `0001`. **No los modifiques aquí** — eso es 1.2 (Neid). Las columnas `organizacion_id`/`movil_id`/`creado_por` van en su migración.

---

## 1.5 · Rol no-owner + `force RLS` + `enContextoDe()`

**Ola 1** · depende de `1.1` · dominio `core/src/persistence/contexto.ts`, migración `0004`

**Qué.** La infraestructura sin la cual RLS no protege nada.

**Por qué.** Tres trampas, y **cada una es un fallo silencioso**. Detalle en [multitenancy §6.1](../multitenancy-y-autenticacion.md#61-las-tres-trampas-de-rls).

**Pasos.**
1. Crear rol `pulso_app`: **no-owner, no-superusuario**. Owners y superusuarios se saltan RLS por defecto.
2. `alter table … force row level security` en toda tabla con `organizacion_id` — para que ni el dueño se escape.
3. `enContextoDe(actor, fn)` que abre transacción y hace **`SET LOCAL`** (nunca `SET` a secas: con pooler, un `SET` plano filtra el contexto de un inquilino al siguiente request).
4. ⚠️ **Core deja de usar `SUPABASE_SERVICE_ROLE_KEY` para datos de dominio.** La service role se salta RLS y es lo que `supabase.service.ts` usa hoy. Se queda solo para el ETL de catálogo, que es global y sin dueño.
5. Documentar en `core/README.md` que ninguna consulta de dominio va fuera del wrapper.

**Hecho cuando.**
- [ ] `select current_user` dentro de una petición devuelve `pulso_app`
- [ ] Test de concurrencia: 20 peticiones alternando inquilino, ninguna ve datos de la otra
- [ ] `grep -rn "SET " src/` no encuentra un `SET` sin `LOCAL`
- [ ] La service role key solo aparece en el módulo de ETL

**Trampas.** Supabase da la service role por defecto y es cómoda. **Esa comodidad es exactamente el agujero.** Si esto no se hace, las policies que escribe Neid en 1.6 no protegen absolutamente nada y el equipo va a creer que sí.

---

## 2.4 · CRUD de organización y sedes vinculadas

**Ola 2** · depende de `1.3`, `2.7`, `2.8` · dominio `core/src/organizaciones/`, `frontend/app/(panel)/organizacion`, `(panel)/sedes`

**Qué.** El administrador de una IPS gestiona su organización y sus sedes.

**Pasos.**
1. `GET/PATCH /organizaciones/:id` — solo su propia organización, o `admin_plataforma`.
2. `GET/POST /organizaciones/:id/sedes` — agregar sede exige **verificación contra REPS** (reusa 2.1 de Juan).
3. `GET/PATCH /sedes/:codigo` — ficha: servicios habilitados con **vigencia** (`vigente_desde`/`vigente_hasta`) y **población** (`adulto`/`pediatrico`/`neonatal`/`mixto`).
4. Desvincular es `activa=false`, **nunca `DELETE`**.
5. UI: tabla con shadcn/ui, formularios con `react-hook-form` + `zod`.
6. La población del servicio cierra el hueco adulto/pediátrico/neonatal — hoy "UCI" es solo un código y un paciente de 54 años puede rutearse contra una UCI neonatal (spec §1.5, §2.4).

**Hecho cuando.**
- [ ] Un admin no ve ni edita organizaciones ajenas (probarlo, no asumirlo)
- [ ] Agregar sede sin verificación REPS → 400
- [ ] Servicio con `vigente_hasta` pasado → excluido del ranking
- [ ] Población incompatible con la edad del paciente → sede descartada con motivo legible

**Trampas.** Estas rutas son las primeras con alcance por organización. **Prueba el 403 cruzado explícitamente**; es la clase de cosa que "parece funcionar" porque nunca la probaste con dos inquilinos.

---

## 2.8 · TanStack Query + cliente tipado

**Ola 2** · depende de `1.4` · dominio `frontend/lib/api.ts`, `lib/queries/` · **mergea PRIMERO en la ola 2**

**Qué.** Reemplazar los `useEffect` + `setInterval` copiados en tres consolas.

**Por qué.** `/hospital` y `/crue` tienen el mismo bloque de polling copiado con variaciones (`vivo.actual`, `catch` que mantiene el intervalo). Está bien escrito pero está tres veces, y cada vista nueva lo copia otra vez.

**Pasos.**
1. `QueryClientProvider` en el layout de consolas.
2. Hooks por recurso: `useEstado()`, `useCaso(id)`, `useCandidatos()`, `useCapacidades()`, `useSedeEstado(codigo)`.
3. `refetchInterval` configurable, `retry` con backoff, `staleTime` sensato.
4. **Conservar el manejo honesto de la desconexión** que ya existe: si core no responde, la UI lo dice — core caído no puede verse igual que "no hay solicitudes".
5. Conservar `alPerderSesion()` y el gancho de refresh (1.4).
6. Preparar el terreno para 3.9 (realtime): los hooks deben poder recibir invalidación externa.

**Hecho cuando.**
- [ ] Las tres consolas usan los mismos hooks
- [ ] `useEffect` con `setInterval` no aparece en ninguna consola
- [ ] Core caído sigue mostrando el aviso de desconexión
- [ ] No hay peticiones en pestañas ocultas (`refetchOnWindowFocus`)

**Trampas.** **`lib/api.ts` es el archivo más compartido del repo.** Mergea esto el día 1 de la ola 2 o vas a bloquear a los otros tres.

---

## 2.12 · Estado público y `/health` extendido

**Ola 2** · sin dependencias · dominio `frontend/app/estado-plataforma`, `core/src/health/`

**Qué.** Página pública de estado + healthcheck que sirva para algo.

**Pasos.**
1. `GET /health` sigue siendo liveness puro (no toca nada aguas abajo — eso ya está bien).
2. `GET /health/listo` nuevo: readiness real — base de datos, Redis, ai-core, Mapbox, canal. **Sin exponer URLs ni credenciales**, solo modo.
3. `/estado-plataforma` público: semáforo por componente, incidentes abiertos, degradaciones activas.
4. Reusar la filosofía de `CapacidadesService`: decir **en qué modo** está cada pieza, nunca a qué host apunta.

**Hecho cuando.**
- [ ] `/health` responde en < 50 ms sin tocar dependencias
- [ ] `/health/listo` distingue "degradado" de "caído"
- [ ] La página pública no filtra ni una URL interna
- [ ] Render usa `/health` para el healthcheck y `/health/listo` no lo tumba

---

## 3.3 · `sede_estado` + `capacidad_declarada` + filtro duro

**Ola 3** · depende de `1.1` · dominio migración `0007`, `core/src/capacidades/`, `core/src/scoring/`

**Qué.** El hospital declara su estado y su capacidad, y **eso filtra el ranking**.

**Por qué.** Hoy el ranking decide con un snapshot del **2022-11-30** y un hospital en contingencia sigue saliendo #1. Es la brecha más grande entre lo que el sistema dice saber y lo que sabe.

**Pasos.**
1. Migración con `sede_estado`, `capacidad_declarada` y la vista `capacidad_vigente` — DDL en [Parte II §1 bloque C](../pulso-plataforma-afiliacion-y-tramites.md#bloque-c--operación-en-tiempo-real-lo-que-cambia-cada-minuto).
2. `capacidad_declarada` es **append-only**: una corrección es una declaración nueva, no un `UPDATE`.
3. `sede_estado.vence_en` obligatorio (default 4 h). **Una declaración que no caduca queda para siempre.**
4. **Filtro duro nuevo**: `operativo != 'recibiendo'` → `motivoDescarte` legible: *"Declaró contingencia hace 12 min"*.
5. `ScoringService` prefiere `capacidad_vigente` sobre `ocupadasSnapshot`, y **expone cuál usó** — el candidato lleva la procedencia hasta la tarjeta.
6. Un job que expira declaraciones vencidas y vuelve a `recibiendo`.

**Hecho cuando.**
- [ ] Declarar contingencia saca la sede del ranking en < 5 s
- [ ] La tarjeta gris dice el motivo y hace cuánto
- [ ] Capacidad declarada gana sobre snapshot, y la UI lo distingue
- [ ] Una declaración vencida vuelve sola a `recibiendo`
- [ ] Nunca se pinta un número de camas de 2022 como si fuera de hoy (spec §3.5)

**Trampas.** Esta es la tarea que hace verdadera la frase "tiempo real". Si la caducidad no está, en dos semanas media red está en contingencia permanente y el producto deja de funcionar.

---

## 3.6 · `movil` + `movil_estado` + `/campo/turno`

**Ola 3** · depende de `1.1` · dominio `core/src/moviles/`, `frontend/app/(consolas)/campo/turno` · **mergea antes que 3.7**

**Qué.** La ambulancia deja de ser texto libre.

**Por qué.** Hoy `Unidad {id, tripulante?}` se escribe desde el navegador y el propio contrato advierte: *"quien tiene la contraseña del turno puede escribir el id que quiera"*. Y `tipoMovil` —que es filtro duro— se autodeclara.

**Pasos.**
1. Migración `movil` + `movil_estado` (DDL en Parte II §1 bloque C).
2. CRUD en `/panel/moviles` (de 2.4, mismo patrón).
3. **`tipoMovil` sale del móvil, no de un selector.** Un TAB no puede declararse TAM.
4. `/campo/turno`: elegir móvil de la lista de **su organización**, elegir tripulante, PIN. Ver el diseño completo en [multitenancy §4](../multitenancy-y-autenticacion.md#4-el-caso-difícil-login-dentro-de-una-ambulancia).
5. Vinculación de dispositivo por QR desde `/panel/moviles` — el `deviceToken` es el que carga el inquilino.
6. Cierre de turno manual y automático (14 h sin actividad **y sin caso abierto**).

**Hecho cuando.**
- [ ] Abrir turno toma < 5 s con guantes
- [ ] Un paramédico no ve móviles de otra organización
- [ ] `tipoMovil` no se puede falsear desde el cliente
- [ ] **Con caso abierto, el turno no se cierra solo**
- [ ] Sin dispositivo vinculado, el PIN no sirve

**Trampas.** El caso límite 8: dos tripulantes y un tablet. La sesión es del que abrió turno; el otro va en `tripulacion[]`. No inventes sesiones simultáneas.

---

## 3.9 · Tiempo real por canales con alcance

**Ola 3** · depende de `1.6` · dominio `core/src/realtime/`, `frontend/lib/realtime.ts`

**Qué.** Cuatro canales, con el alcance resuelto **en el servidor**.

**Pasos.**
1. Canales: `sede:{codigo}`, `caso:{id}`, `red:bogota`, `org:{id}`.
2. **El servidor decide a qué canales puede suscribirse un token.** Nunca el cliente, nunca comodines. `sede:*` no debe existir como suscripción posible.
3. Transporte: Supabase Realtime si hay base; **SSE desde core** si no; polling como último piso.
4. `lib/realtime.ts` invalida las queries de TanStack (2.8) en vez de manejar estado propio.
5. **Degradación visible**: si cae a polling, la UI lo dice — misma filosofía de `Capacidades`.
6. Publicar al escribir: `sede_estado`, `capacidad_declarada`, `handshake`, `evento_caso`.

**Hecho cuando.**
- [ ] Un jefe de urgencias solo recibe eventos de su sede (probar con dos sedes)
- [ ] Suscribirse a un canal fuera de alcance → rechazo del servidor
- [ ] Sin Realtime, cae a polling y lo declara
- [ ] Declarar capacidad se ve en `/crue` en < 2 s

**Trampas.** Es el nivel 4 de aislamiento y **el más fácil de romper**: un comodín en una suscripción entrega datos clínicos de toda la red a quien se suscriba. Trátalo con el mismo cuidado que una policy de RLS.

---

## 4.4 · Ventanas clínicas

**Ola 4** · depende de `4.1` · dominio `core/src/recepcion/ventanas.ts`, `catalogo/protocolos.ts`

**Qué.** El reloj que de verdad mira un jefe de urgencias: door-to-balloon 90 min en IAM, door-to-needle 60 min en ACV trombolizable.

**Por qué.** El ETA dice cuándo llega la ambulancia. **La ventana clínica dice cuánto tiempo le queda al paciente.** No son lo mismo y confundirlos es un error clínico.

**Pasos.**
1. Catálogo de protocolos **versionado**, no LLM: `codigo_infarto`, `codigo_acv`, `trauma_mayor`, con su ventana y su checklist.
2. Resolución por diagnóstico: `I21.*` → `codigo_infarto`; `I63.*` → `codigo_acv`. **Tabla, no modelo** (spec §7.2: *"el LLM propone, la tabla decide"*).
3. **La ventana cuenta desde el primer contacto médico**, no desde la llegada al hospital. Eso significa desde `caso_creado` o desde `llegada_escena`, lo que exista primero.
4. Un diagnóstico sin protocolo mapeado → sin ventana, y **se dice**: "sin protocolo definido, escala a criterio clínico". No se inventa una ventana.
5. Exponer en `recepcion.ventana_clinica_min` y en el evento.

**Hecho cuando.**
- [ ] Un IAM produce ventana de 90 min contando desde el primer contacto
- [ ] Un diagnóstico no mapeado no inventa ventana
- [ ] La versión del protocolo queda en la evidencia
- [ ] Test con los cinco diagnósticos del corpus de evals

**Trampas.** No pongas los umbrales en el código. Van en catálogo versionado, porque son criterio clínico y van a cambiar — y cuando cambien hay que poder saber con qué versión se atendió un caso viejo.

---

## 4.6 · Tabla `tramite` + motor de trámites

**Ola 4** · depende de `3.1` · dominio `core/src/tramites/` (nuevo), migración `0009` · **mergea antes que 4.7, 4.8, 4.10**

**Qué.** El expediente administrativo que viaja con el paciente.

**Por qué.** Es la tesis del producto: *un hospital no dice que no porque no tenga cama, dice que no porque no sabe quién le va a pagar*. Ver [Parte II §0](../pulso-plataforma-afiliacion-y-tramites.md#0-la-tesis-que-ordena-todo-el-plan).

**Pasos.**
1. Migración con la tabla `tramite` (DDL en Parte II §1 bloque E).
2. Motor: dado un caso, decidir qué trámites aplican. Empezar por los cinco de la ruta crítica: `verificacion_derechos`, `referencia`, `aceptacion`, `admision`, `entrega_paciente`.
3. **`base_legal` obligatoria** en todo trámite que mueva datos clínicos (spec §9.1, §9.5). En urgencias es la excepción de consentimiento, y **queda constancia de que se operó bajo esa excepción**.
4. `autorizacion_servicios` se marca **`omitido_por_urgencia`** citando la Ley 1751 de 2015 art. 14. No es un trámite pendiente: es un trámite que no aplica, y decirlo con la norma al lado es lo que elimina la discusión en la puerta.
5. `POST /casos/:id/tramites/:tipo/firmar` — **nada sale solo**. El humano firma con su actor.
6. Cada cambio de estado escribe `evento_caso` tipo `tramite_generado` / `tramite_firmado`.

**Hecho cuando.**
- [ ] Un caso de urgencias marca la autorización como omitida, con la norma citada
- [ ] Ningún trámite pasa a `completado` sin actor humano
- [ ] `base_legal` vacía en un trámite clínico → 400
- [ ] `unique (caso_id, tipo)` impide duplicados

**Trampas.** ⚠️ **Un abogado o alguien de la Secretaría de Salud tiene que validar la tabla de trámites antes del pitch.** Citar mal una resolución frente a un jurado de salud cuesta más que no citarla. Los números que el repo ya usa están verificados; FURIPS y RIPS están marcados **[verificar]** en el plan.

---

## 4.11 · Alerta de preparación no confirmada

**Ola 4** · depende de `4.1` · dominio `core/src/recepcion/alertas.ts`

**Qué.** Si a T-5 min de la llegada el checklist no está confirmado, se avisa y se registra.

**Por qué.** Aceptar es barato; preparar es lo que salva. Sin esta señal, "aceptado" y "listo para recibir" se confunden.

**Pasos.**
1. El worker (3.8) evalúa recepciones con llegada estimada < 5 min y checklist incompleto.
2. Avisa al jefe de urgencias por su canal (`sede_canal`, 3.5) y escribe `evento_caso`.
3. **No le quita el caso a nadie.** Se registra que la preparación no se confirmó, y ese dato entra al historial de la sede igual que un rechazo.
4. Una sola alerta por recepción (idempotencia), como `demoraAvisada` en el handshake.

**Hecho cuando.**
- [ ] La alerta sale una sola vez
- [ ] Queda como evento consultable
- [ ] No cambia el destino del caso
- [ ] Sin ETA vivo, usa el del despacho y lo marca

**Trampas.** No conviertas esto en una herramienta de castigo al hospital. Es una señal operativa; si se percibe como vigilancia, las IPS dejan de declarar y se pierde todo el modelo.

---

## 5.1 · Webhooks salientes (outbox)

**Ola 5** · depende de `3.1` · dominio `core/src/webhooks/` (nuevo), migración `0010` · **mergea antes que 5.2**

**Qué.** PULSO como proveedor de webhooks: el HIS del hospital se entera solo.

**Por qué.** Es lo que convierte a PULSO de aplicación en plataforma, y es como se integra un HIS sin que nadie escriba un adaptador por hospital.

**Pasos.**
1. Migración: `webhook_endpoint` + `webhook_outbox` (DDL en [plan maestro §4.2](../pulso-produccion-plan-maestro.md#42--salida--pulso-como-proveedor-de-webhooks)).
2. **El evento se escribe en la MISMA transacción que el dato.** Esa es toda la garantía del patrón outbox; sin eso, un fallo entre el commit y el publish pierde el evento para siempre.
3. Worker `outbox-relay` con BullMQ: backoff exponencial + jitter (10 s, 1 m, 5 m, 30 m, 2 h, 6 h), luego cola muerta.
4. Firma `X-Pulso-Signature: t=<ts>,v1=<hmac(ts + "." + body)>` — **con timestamp adentro**, para que una firma vieja no se pueda reproducir.
5. `X-Pulso-Event-Id` **inmutable entre reintentos** → el receptor puede deduplicar.
6. **Circuit breaker por endpoint**: 20 fallos seguidos → se desactiva y se avisa. Un endpoint caído no puede atascar la cola de todos.
7. **Nunca PII en el payload.** Se manda `casoId` y el mínimo; el receptor consulta con su llave si necesita más.
8. `trace_id` en la fila, para que la traza sobreviva el salto por la cola (5.3).

**Hecho cuando.**
- [ ] Un evento se entrega exactamente una vez en el camino feliz
- [ ] Un receptor caído no pierde eventos ni bloquea a los demás
- [ ] La firma valida contra el cuerpo exacto
- [ ] El payload no contiene dictado, coordenadas ni teléfono
- [ ] Test: matar el worker a mitad de entrega y verificar que reintenta

**Trampas.** La tentación es publicar directo desde el servicio. **No.** Si el HTTP falla después del commit, el evento se perdió y nadie se entera. La tabla es lo que lo hace confiable.

---

## 5.6 · E2E con Playwright

**Ola 5** · depende de `1.7` · dominio `e2e/`, `.github/workflows/`

**Qué.** El flujo del demo completo, corriendo en CI.

**Pasos.**
1. `docker compose` con los tres servicios + Postgres + Redis, sin credenciales externas (todo en modo degradado — que es justo lo que hay que probar).
2. Escenario principal: login → `/campo` → dictar (texto, no voz) → ranking → despachar → `/hospital` en otro contexto → aceptar → ver la confirmación en `/campo`.
3. Escenarios de borde: ranking vacío → escalamiento; timeout → re-ruteo automático; **doble aceptación → la segunda es rechazada** (el guard de 0.1).
4. **Prueba de aislamiento**: sesión de la sede A no ve el caso dirigido a la sede B.
5. Traza y video solo de los que fallan.

**Hecho cuando.**
- [ ] El flujo completo pasa en CI desde limpio
- [ ] Los tres escenarios de borde pasan
- [ ] Corre en < 5 min
- [ ] Un fallo deja video y traza descargables

**Trampas.** Web Speech API no existe en el navegador de CI. **Prueba la ruta de texto**, que además es el plan B real del dictado según las reglas del repo.

---

## 5.10 · Despliegue completo

**Ola 5** · sin dependencias · dominio `render.yaml`, `Dockerfile`s, `Taskfile.yml`

**Qué.** Los tres servicios + Redis + workers, con secretos y healthchecks.

**Por qué.** Hoy `render.yaml` **solo despliega `voz`**, a propósito y bien explicado. Para producción hacen falta los otros, sin perder la frontera de seguridad.

**Pasos.**
1. `core` y `ai-core` como servicios **privados** de Render (no `web` público). `voz` sigue siendo el único con cara a internet — esa frontera no se negocia.
2. Redis administrado + servicio de workers separado del web (el vigilante no puede seguir siendo `@Interval` en el proceso web: con dos instancias, dos vigilantes vencen el mismo handshake).
3. Healthchecks: `/health` para liveness, `/health/listo` para readiness.
4. Secretos con `sync: false`, nunca en el archivo. Documentar cuáles son obligatorios y cuáles degradan.
5. `task doctor` corriendo contra el entorno desplegado.
6. Migraciones como paso previo al arranque, no dentro del proceso web.

**Hecho cuando.**
- [ ] Un despliegue limpio arranca sin intervención manual
- [ ] `core` y `ai-core` no son alcanzables desde internet (verificarlo con `curl`, no asumirlo)
- [ ] Los workers corren en un servicio aparte
- [ ] Faltando un secreto opcional, arranca degradado y lo dice; faltando uno obligatorio, no arranca
- [ ] Rollback probado

**Trampas.** `ai-core` tiene las credenciales de los proveedores de IA. Exponerlo por error es la peor consecuencia posible de esta tarea. **Verifícalo con `curl` desde fuera.**
