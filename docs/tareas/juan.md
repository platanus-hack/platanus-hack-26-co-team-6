# Juan — 16 tareas

> Carril histórico: Frontend / PWA, dueño de `/campo`, el mapa, `components/` y el cronómetro.
> **En este plan rota:** también le tocan webhooks en Python, token de servicio en Nest, el constructor
> de RDA FHIR y la instrumentación con OpenTelemetry. Ver [README de tareas](README.md).

**Ola 0** [0.4](#04--deduplicar-webhooks-por-wamid) · [0.7](#07--test-de-espejo-de-tipos) — **Ola 1** [1.4](#14--vistas-de-login-y-sesión) · [1.8](#18--token-de-servicio-para-voz) — **Ola 2** ✅ [2.1](#21--api-de-afiliación) · ✅ [2.5](#25--crud-de-equipo-e-invitaciones) · ✅ [2.9](#29--autoverificación-de-operadores-de-ambulancia) — **Ola 3** [3.4](#34--vista-hospitalcapacidad) · [3.7](#37--posición-del-móvil-en-vivo--cruecobertura) · [3.11](#311--persistir-el-override-del-crue) — **Ola 4** [4.3](#43--vista-hospitalrecepcióncasoid) · [4.8](#48--rda-builder-fhir-r4) · [4.12](#412--vista-forense-auditoriacasosid) — **Ola 5** [5.3](#53--opentelemetry--pino-con-redacción-de-pii) · [5.7](#57--prueba-de-carga-con-k6) · [5.11](#511--adminatalogos-y-adminmodelos)

---

## 0.4 · Deduplicar webhooks por `wamid`

**Ola 0** · sin dependencias · dominio `apps/services/voz/app/sesiones.py`, migración `0003`

**Qué.** Meta reintenta un webhook con backoff exponencial **hasta 7 días** ante 4xx/5xx o timeout. Hoy nada impide que el mismo mensaje se procese dos veces.

**Por qué.** Un reintento sobre `registrar_caso` crea **dos casos** y despacha **dos ambulancias** al mismo paciente. Es el bug más caro del sistema y hoy está abierto.

**Pasos.**
1. Migración `0003_webhook_recibido.sql`:
   ```sql
   create table webhook_recibido (
     proveedor   text not null check (proveedor in ('whatsapp','telegram','twilio')),
     id_externo  text not null,          -- wamid, update_id, CallSid
     recibido_en timestamptz default now(),
     resultado   jsonb,
     primary key (proveedor, id_externo)
   );
   ```
2. En `voz`, antes de despachar: `insert ... on conflict do nothing`. Si `rowcount == 0`, es un reintento → responder 200 con el resultado guardado y **no** ejecutar nada.
3. El `wamid` viene en `entry[].changes[].value.messages[].id`.
4. Purga de filas > 30 días en el worker de retención (5.8, de Neid).

**Hecho cuando.**
- [ ] El mismo `wamid` enviado dos veces crea **un** caso
- [ ] El segundo request responde 200 y no toca core
- [ ] Test con payload real de Meta duplicado
- [ ] Métrica `pulso_webhook_duplicados_total{proveedor}`

**Trampas.** `voz` no tiene base de datos propia hoy — usa la de core o una tabla en el mismo Postgres. **No lo guardes en memoria**: con dos instancias en Render la deduplicación deja de existir, que es justo el escenario donde importa.

---

## 0.7 · Test de espejo de tipos

**Ola 0** · sin dependencias · dominio `apps/frontend/lib/`, CI

**Qué.** `apps/frontend/lib/types.ts` es un **espejo manual** de `apps/backend/core/src/contracts/types.ts`. Un cambio en uno solo no rompe el build.

**Por qué.** Rompe el **runtime**, que es peor: el build pasa, el demo falla en vivo. Está documentado como deuda en `docs/contrato-api.md` y nunca se cerró.

**Pasos.**
1. Script `scripts/verificar-tipos.ts` que normaliza ambos archivos (quita comentarios, JSDoc y espacios) y compara las declaraciones exportadas.
2. Alternativa mejor si hay tiempo: convertir `lib/types.ts` en un re-export desde un paquete compartido `packages/contratos`. Más limpio, pero toca `tsconfig` de dos apps — **decidir con el equipo antes**.
3. Añadir `pnpm verificar:tipos` al pipeline, antes de `build`.

**Hecho cuando.**
- [ ] Cambiar un tipo en core sin espejarlo → CI rojo con el nombre del tipo que divergió
- [ ] El mensaje de error dice qué hacer, no solo que falló
- [ ] Corre en < 2 s

**Trampas.** Los dos archivos tienen comentarios distintos a propósito (el del front está en español con tildes). Compara **estructura**, no texto.

---

## 1.4 · Vistas de login y sesión

**Ola 1** · depende de `1.3` (Sebas) · dominio `apps/frontend/app/entrar`, `lib/sesion.ts`

**Qué.** `/entrar` pasa de una contraseña de turno a correo + contraseña, con rol y organización en el contexto del cliente.

**Por qué.** Es la puerta de todo el modelo de identidad. Sin esto, los guards de rol de la ola 2 no tienen a quién dejar pasar.

**Pasos.**
1. `/entrar`: formulario correo + contraseña con `react-hook-form` + `zod`. Mensaje de error **único** ("Credenciales incorrectas") — no distinguir "no existe" de "contraseña mala".
2. `/entrar/recuperar`: pide correo, responde **siempre** lo mismo exista o no.
3. `lib/sesion.ts`: contexto React con `{actor, organizacion, roles, sedes}` desde `GET /auth/sesion`. **Nunca leer el token** — sigue siendo `HttpOnly`.
4. Redirección por rol tras login: `paramedico → /campo`, `jefe_urgencias → /hospital`, `regulador_crue → /crue`, `admin_organizacion → /panel`, `admin_plataforma → /admin`.
5. Renovación silenciosa: interceptor que ante `401` llama `POST /auth/refresh` una vez y reintenta. Si el refresh falla, va a `/entrar`. El gancho `alPerderSesion()` ya existe en `lib/api.ts`.
6. Selector de organización si el correo tiene actor en varias (caso límite 1 de [multitenancy §7](../multitenancy-y-autenticacion.md#7-los-19-casos-límite)).

**Hecho cuando.**
- [ ] Login exitoso redirige según rol
- [ ] `401` se recupera solo sin sacar al usuario de la pantalla
- [ ] `PULSO_AUTH_LEGACY=true` sigue permitiendo la contraseña de turno
- [ ] La UI nunca ve el token en JS
- [ ] Un actor con dos organizaciones ve el selector

**Trampas.** El reintento tras refresh tiene que ser **una sola vez**; un bucle de refresh fallido genera una tormenta de peticiones justo cuando el servidor está mal.

---

## 1.8 · Token de servicio para `voz`

**Ola 1** · depende de `1.3` · dominio `core/src/auth/token-servicio.ts` (nuevo), `voz/app/clientes/core.py`

**Qué.** `voz` deja de autenticarse con `CORE_PASSWORD` (la contraseña de los operadores) y usa un token propio con `sub: 'svc:voz'` y alcance limitado.

**Por qué.** Lo señaló Neid como deuda al mezclar con main: *"un servicio autenticándose con la contraseña compartida de los operadores no distingue quién hizo qué en la auditoría"*. Y hoy `voz` puede hacer **todo** lo que puede un humano, incluido aceptar un traslado.

**Pasos.**
1. `SesionService.emitirServicio(nombre, alcance[])` → token de 24 h con `tip:'servicio'`.
2. Alcance de `voz`: `['caso:crear','caso:leer','notificar']`. **No** incluye `handshake:responder` ni `capacidad:declarar`.
3. `POST /auth/servicio` solo para `admin_plataforma`, y queda auditado.
4. En `voz/app/clientes/core.py`: leer `CORE_SERVICE_TOKEN` de entorno en vez de hacer login con contraseña.
5. `RolGuard` valida el alcance del servicio en cada ruta.

**Hecho cuando.**
- [ ] `voz` funciona sin `CORE_PASSWORD`
- [ ] `voz` intentando `POST /handshake/respond` → 403
- [ ] La auditoría distingue `svc:voz` de un humano
- [ ] Sin token configurado, `voz` lo dice en `/listo` y degrada

**Trampas.** El token vive en variable de entorno de Render. **Rotarlo no puede tumbar el servicio** — acepta el token viejo durante una ventana de gracia al rotar.

---

## 2.1 · API de afiliación

**Ola 2** · depende de `1.3` · dominio `core/src/afiliacion/` (nuevo) · **mergea antes que 2.2, 2.3, 2.6, 2.9**

**Qué.** El endpoint que hace la autoverificación contra REPS y crea la organización.

**Por qué.** Es el módulo que elimina su propio trámite: el afiliado escribe 12 dígitos y el sistema precarga todo desde el REPS que ya está en el repo. Ver [Parte II §3.3](../pulso-plataforma-afiliacion-y-tramites.md#33-el-camino-sin-trámite-autoverificación-contra-el-reps).

**Pasos.**
1. `POST /afiliacion/verificar` `{tipo, codigoHabilitacion?, nit}`:
   - Busca `codigoHabilitacion` (12 dígitos) en la tabla `sede`.
   - Existe + nombre coincide (similitud > 0.85, `pg_trgm`) → `{encontrada:true, sede, precarga}` con dirección, coords, localidad, naturaleza, complejidad, servicios y camas.
   - Existe + nombre no coincide → `{encontrada:true, requiereRevision:true}`.
   - No existe → `{encontrada:false, motivo}` **específico**, no genérico.
2. `POST /afiliacion` crea `organizacion` (estado `borrador`), `organizacion_sede`, y el primer `actor` con rol `admin_organizacion`.
3. Máquina de estados con transiciones válidas explícitas: `borrador → enviada → en_verificacion → {aprobada | observada}`, `aprobada → activa`, `activa ↔ suspendida`, `* → retirada`. Una transición ilegal es `PULSO_ILLEGAL_TRANSITION`.
4. **Solo `activa` es despachable** — el ranking filtra por eso.
5. `@Publico()` en verificar y crear; todo lo demás exige sesión.

**Hecho cuando.**
- [x] Un código REPS real devuelve la sede correcta con sus servicios — precarga dirección, coords, localidad, naturaleza, complejidad, servicios y camas
- [x] Un código inventado devuelve motivo específico — y uno de 10 dígitos lo llama por su nombre: *«ese es el código de PRESTADOR»*
- [x] Rate limit por IP — `afiliacion/limite-ip.ts`, ventana deslizante de 20/min. **Lo reemplaza 2.11 cuando mergee**
- [x] Test de todas las transiciones ilegales — las 38, enumeradas, no escritas a mano
- [x] Una organización que no está `activa` no aparece en el ranking — el filtro está en `MatchService.rankear`, con su test

**Trampas.** `codigohabilitacionsede` es de **12 dígitos y único**; `codigoprestador` es de 10 y **colapsa una subred entera en un código**. Está documentado en `data/CATALOGO.md` y ya causó un bug. Usa el de 12.

> **Lo que se encontró al hacerla.**
> - **El NIT no se puede cruzar contra el REPS.** La tabla `sede` no tiene columna de NIT — ni el catálogo compilado ni `0001_init.sql`. Se valida el formato y se guarda, pero quien afilie puede declarar el NIT de otra entidad. Lo contiene la razón social (que sí se cruza) y que la organización nace `aprobada`, no `activa`. Cerrarlo pide el NIT por sede en el pipeline de `data/`.
> - **El NIT lleva dígito de verificación y eso rompía la unicidad.** `900123456` y `900123456-1` son el mismo NIT; comparando «todos los dígitos» la misma clínica se afiliaba dos veces. `afiliacion/nit.ts` normaliza a la base.
> - **El umbral de 0.85 es estricto.** Medido: agregar «SAS» a la razón social ya baja de 0.85 (0.83). Se deja en 0.85 porque el error caro es el otro —«Usme» contra «Suba» da 0.55— y porque la respuesta trae `sede.nombre` para que el afiliado confirme.
> - **Solo hay 84 sedes en el catálogo**, no 16.181: son las IPS con servicio de urgencias. Las 84 tienen código REPS de 12 dígitos válido.

> **Lo que quedó fuera, y por qué.**
> - **Persistencia.** Vive en memoria detrás de una interfaz, igual que `auth/actores.ts` de 1.3. La migración `0006_afiliacion.sql` está escrita pero **se pisa con la tarea 1.1 de Zaid**: la cabecera del archivo dice qué hacer al mergear.
> - **El wizard de `/afiliacion`.** Depende de `2.7` (shell de `/panel`) y `2.8` (`lib/api.ts`), que son los que mergean primero en la ola.

---

## 2.5 · CRUD de equipo e invitaciones

**Ola 2** · depende de `1.3`, `2.7` · dominio `core/src/invitaciones/`, `frontend/app/(panel)/equipo`, `app/invitacion`

**Qué.** Cómo entra el segundo humano de una organización.

**Pasos.**
1. `POST /organizaciones/:id/invitaciones` `{correo, rol, codigoSede?}` → genera token aleatorio de 32 bytes, guarda **solo el hash**, expira en 72 h.
2. Envía correo (o muestra el enlace si no hay proveedor — regla de degradación del repo).
3. `GET/POST /invitacion/:token` → valida, crea el actor con su rol, marca `aceptada_en`. **Un solo uso.**
4. `/panel/equipo`: tabla con actores, roles, último acceso, invitaciones pendientes, botón revocar.
5. Un `admin_organizacion` **no puede** otorgar un rol que él no tiene (invariante 3 de [multitenancy §5.3](../multitenancy-y-autenticacion.md#53-los-cuatro-invariantes-del-guard)).
6. Desactivar un actor es `activo=false`, **nunca `DELETE`**: aparece en auditoría.

**Hecho cuando.**
- [x] El token viaja en el enlace, en base solo está el hash — 32 bytes, sha256; el test comprueba que el token no aparece en nada de lo guardado
- [x] Un token usado dos veces → 410 `PULSO_INVITACION_YA_USADA`, y dice cuándo se usó
- [x] Un token de 73 h → 410 `PULSO_INVITACION_EXPIRADA`, dice que duran 72 h y qué hacer
- [x] `admin_organizacion` intentando crear `regulador_crue` → 403 — **con un matiz, ver abajo**
- [x] Desactivar un actor no rompe la auditoría histórica — `activo=false`, sigue resolviendo por id y sigue en la tabla del equipo

**Trampas.** No pongas el token en la URL de un correo **y** en el log. Redacción en Pino (5.3).

> **El invariante 3, leído con cuidado.**
> La lectura literal —«solo otorgas roles que tienes»— rompe el producto: un `admin_organizacion` no podría invitar al `jefe_urgencias` de su sede ni a sus paramédicos, que es literalmente para lo que existe `/panel/equipo`. El ejemplo de §5.3 no es casual: `regulador_crue` es un **rol de red**. Lo que el invariante protege es el salto de alcance. Implementado así:
> - `admin_plataforma` → cualquiera.
> - Roles de red (`regulador_crue`, `auditor`, `admin_plataforma`) → **nadie más**, ni teniéndolos.
> - `servicio` → tampoco por correo; se emite con `POST /auth/servicio` (1.8).
> - Roles de organización → los otorga `admin_organizacion` dentro de la suya.

> **Lo que quedó fuera, y por qué.**
> - **`/panel/equipo` y `/invitacion/:token`.** Dependen de `2.7` y `2.8`, que mergean antes que todo el frontend de la ola. El backend está completo y probado: `POST /organizaciones/:id/invitaciones`, `GET .../equipo`, `DELETE` de invitación y de actor, y `POST /invitaciones/:token/aceptar`.
> - **El envío de correo.** No hay proveedor configurado, así que se devuelve el enlace y `enviadoPorCorreo: false`. Es la regla de degradación del repo, no un pendiente.
> - **Un mismo correo en dos organizaciones** (caso límite 1 de §7). Necesita que `actor.identificador` deje de ser único, y eso es de la tarea 1.1. Hoy lo dice con todas las letras en vez de adivinar.

> **⚠️ Para Sebas (1.3) y para quien haga el frontend de la ola.** `POST /auth/login` recibe la contraseña como **`password`**; `POST /afiliacion` y `POST /invitaciones/:token/aceptar` la reciben como **`clave`**. Son la contraseña de la misma persona en los tres. Hay que unificarlo antes de que el front escriba los tres formularios — la regla 7 del repo (dominio en español) apunta a `clave`, pero la decisión es de quien es dueño de `auth/`.

---

## 2.9 · Autoverificación de operadores de ambulancia

**Ola 2** · depende de `2.1` · dominio `core/src/afiliacion/ambulancias.ts`

**Qué.** Lo mismo que 2.1 pero contra los 225 prestadores de transporte asistencial.

**Por qué.** `data/procesado/ambulancias.json` ya tiene el universo real con marca TAB/TAM (112 básicos, 53 medicalizados, corte 01/07/2026) y **nadie lo consume**.

**Pasos.**
1. Cargar `ambulancias.json` como catálogo compilado (mismo patrón que `sedes/catalogo.generado.ts`).
2. Cruce por NIT si está, y por nombre con `pg_trgm` si no.
3. Precargar dirección, teléfono, correo y **la marca TAB/TAM**, que es la que después alimenta `movil.tipo` en 3.6.
4. Si no cruza → `observada` con motivo, no rechazo.

**Hecho cuando.**
- [x] Un prestador real del CSV se autoverifica — contra `afiliacion/ambulancias.generado.ts`, los 225 del corte
- [x] La marca TAB/TAM llega precargada al alta de flota — `PrecargaOperador.tiposMovil`, del corte oficial y nunca inferida
- [x] Sin cruce, el mensaje dice qué falta — y si hay algo parecido, lo nombra

**Trampas.** El CSV trae `utf-8-sig` y nombres en mayúsculas sin tildes. Normaliza antes de comparar o no cruza nada.

> **El paso 2 de esta tarea no se puede ejecutar.**
> «Cruce por NIT si está, y por nombre con `pg_trgm` si no»: **el "si está" nunca se cumple.** El CSV de transporte asistencial trae nueve columnas —prestador, sede, dirección, teléfono, email y las tres marcas— y ninguna es el NIT. No está vacío en algunas filas: la columna no existe en la fuente. El cruce es **siempre** por nombre normalizado.
>
> El camino por NIT está escrito y probado igual, contra un catálogo de prueba: `PrestadorAmbulancia.nit` existe y hoy es `null` en las 225 filas. Hay un test que se cae el día que la fuente lo publique, para que alguien lo encienda.

> **Además.** El catálogo lo emite ahora `scripts/datos/construir.py` (`_ts_ambulancias`), mismo patrón que `sedes/catalogo.generado.ts`. Antes `ambulancias.json` no lo consumía nadie.

---

## 3.4 · Vista `/hospital/capacidad`

**Ola 3** · depende de `3.3` (Zaid) · dominio `frontend/app/(consolas)/hospital/capacidad`, `components/hospital/`

**Qué.** La pantalla donde el jefe de urgencias declara estado operativo y camas disponibles.

**Por qué.** **Es la vista más usada de todo el sistema** — 20 veces por turno, a las 3 de la mañana. Si toma más de dos toques, nadie la usa y todo el modelo de capacidad declarada se cae. Sin esta pantalla, el ranking sigue decidiendo con un snapshot de 2022.

**Pasos.**
1. **Estado operativo**: cuatro botones grandes (`recibiendo` / `saturado` / `contingencia` / `cerrado`), 56 px mínimo, con color de estado. Un toque.
2. Si no es `recibiendo`, pide motivo de una lista corta + "otro". Segundo toque.
3. **Capacidad**: una fila por tipo de cama con `−` / número / `+`. Nada de teclado.
4. **Mostrar `vence_en`**: "Esta declaración caduca en 3 h 12 min". Una declaración que no caduca queda para siempre y nadie la revierte.
5. **Marcar la procedencia**: "Declarado por ti hace 12 min" vs. "Snapshot REPS 2022". Nunca pintar los dos igual — es la misma honestidad de `/capacidades`.
6. Optimista al escribir, con reversión visible si falla.

**Hecho cuando.**
- [ ] Declarar `contingencia` toma 2 toques y < 5 s
- [ ] Todos los objetivos táctiles ≥ 56 px
- [ ] Legible a bajo brillo (probar con el brillo al mínimo, de verdad)
- [ ] La caducidad se ve sin buscarla
- [ ] Sin scroll horizontal en 320 px
- [ ] Tras declarar, `/campo` deja de ver esa sede en el ranking en < 5 s

**Trampas.** No hagas un formulario con "Guardar". Cada control guarda solo. Un botón de guardar al final es un paso más y a las 3 a.m. se olvida.

---

## 3.7 · Posición del móvil en vivo + `/crue/cobertura`

**Ola 3** · depende de `3.6` (Zaid) · dominio `components/crue/MapaCobertura.tsx`, `core/src/moviles/posicion.ts`

**Qué.** La ambulancia reporta posición; el CRUE ve la flota por zona.

**Por qué.** Es el insumo del ETA vivo (4.3) y de la cobertura de ciudad. **Con el límite que el equipo ya fijó: PULSO le *muestra* la cobertura al CRUE, no asigna móviles** — reposicionar ambulancias es función legal del CRUE (Res. 1220/2010) y cruzar esa línea debilita el argumento.

**Pasos.**
1. `PUT /moviles/:id/estado` con `{lat, lng, velocidadKmh?, disponible}`. Solo el paramédico dueño o su organización.
2. En `/campo`: `watchPosition` con throttle a 15 s, y **pausado si no hay caso abierto** (no drenar batería ni rastrear a alguien fuera de servicio).
3. `MapaCobertura.tsx` en `/crue/cobertura`: pines por tipo (TAB/TAM) y estado (libre/ocupado), agrupados por localidad, con conteo.
4. Reusar el lenguaje visual de `MapaRed.tsx` (estilo `standard-satellite`, `lightPreset: dusk`).
5. Degradar: sin posición, el móvil aparece en su última conocida con la antigüedad visible.

**Hecho cuando.**
- [ ] La posición llega y se ve moverse
- [ ] Sin caso abierto no se rastrea, y la UI lo dice
- [ ] Un operador **no** ve móviles de otro operador; el CRUE sí ve todos
- [ ] Última posición conocida marcada con su antigüedad

**Trampas.** `watchPosition` sin throttle drena la batería y satura el servidor. Y la geolocalización del navegador en interiores da errores de cientos de metros: no lo pintes como si fuera exacto.

---

## 3.11 · Persistir el override del CRUE

**Ola 3** · depende de `3.1`, `3.2` · dominio `components/crue/bitacora.ts`, `core/src/escalamiento`

**Qué.** El override del regulador sale de `localStorage` y entra a `evento_caso` con justificación obligatoria.

**Por qué.** Hoy **una decisión que la ley le atribuye al regulador vive en el navegador** y se borra al limpiar caché. Es de las cosas más difíciles de defender del sistema actual, y de las más fáciles de arreglar.

**Pasos.**
1. `POST /casos/:id/override` `{sedeCodigo, justificacion}` — `justificacion` **no vacía**, validada en servidor.
2. Escribe `evento_caso` tipo `override_crue` con `actor_id` y la justificación en `detalle`.
3. `bitacora.ts` deja de escribir en `localStorage` y pasa a leer del servidor. **Quita el rótulo "registro local"** — ya no lo es.
4. La UI exige la justificación antes de habilitar el botón. La doble confirmación que ya existe se conserva.
5. Migrar lo que haya en `localStorage` no aplica: era de sesión.

**Hecho cuando.**
- [ ] Un override sin justificación → 400
- [ ] El override aparece en `/auditoria/casos/:id` (4.12) con actor y hora
- [ ] Sobrevive a recargar el navegador y a cambiar de máquina
- [ ] Solo `regulador_crue` puede hacerlo

**Trampas.** `core/src/escalamiento` lo toca Sebas en 3.2. **Mergea después de 3.2 y rebasa.**

---

## 4.3 · Vista `/hospital/recepcion/:casoId`

**Ola 4** · depende de `4.1` (Sebas), `4.2` (Neid) · dominio `frontend/app/(consolas)/hospital/recepcion`

**Qué.** El paquete de prearribo: SBAR, protocolo, checklist y los tres relojes.

**Por qué.** **Aquí vive la hora dorada que el ruteo ganó.** Hoy el hospital acepta y no vuelve a saber nada hasta que la camilla cruza la puerta; ese hueco se come la mitad del tiempo ganado.

**Pasos.**
1. Cabecera con el protocolo (`CÓDIGO INFARTO`) y la cuenta regresiva de llegada. Tipografía grande, `tabular-nums`.
2. Bloque SBAR de 4 líneas: Situación · Antecedente · Evaluación · Recomendación.
3. **Los tres relojes**, visualmente distintos:
   - ETA vivo (de la posición del móvil, 3.7)
   - Ventana clínica (door-to-balloon 90 min / door-to-needle 60 min, de 4.4)
   - Preparación (checklist)
4. Checklist con confirmación por ítem, mostrando quién confirmó y hace cuánto.
5. Si el ETA es estimado y no de tráfico real, **decirlo** — igual que la barra de `/campo`.
6. Actualización en vivo por el canal `caso:{id}` (3.9), con degradación a polling declarada.

**Hecho cuando.**
- [ ] Se ve de un vistazo a 2 metros (es una pantalla de pared en urgencias)
- [ ] Los tres relojes no se confunden entre sí
- [ ] Confirmar un ítem escribe `preparacion_confirmada` con actor
- [ ] Solo la sede destinataria la ve (probar con otra sede → 403)
- [ ] Sin ETA vivo, cae al del despacho y lo marca

**Trampas.** No metas el dictado crudo aquí. `CasoPublico` lo excluye a propósito y `despojar()` deja de compilar si alguien lo agrega — eso es una feature, no un obstáculo.

---

## 4.8 · `rda-builder` — FHIR R4

**Ola 4** · depende de `4.6` (Zaid) · dominio `core/src/rda/` (nuevo)

**Qué.** Construir el `Bundle` FHIR R4 del RDA de urgencias colombiano a partir del caso.

**Por qué.** **Es la diferencial del producto.** La Res. 1888 de 2025 obliga a todo prestador REPS a integrarse al IHCE, con plazo vencido el 15 de abril de 2026, y PULSO ya produce en la escena buena parte del contenido. Ver [plan maestro §0](../pulso-produccion-plan-maestro.md#0-el-hallazgo-que-reordena-el-producto).

**Pasos.**
1. Leer la guía en [vulcano.ihcecol.gov.co](https://vulcano.ihcecol.gov.co/indexRDA) **antes de escribir código**.
2. Mapear lo que ya existe:
   | Perfil | Fuente en PULSO |
   |---|---|
   | `EncounterEmergencyRDA` | el caso + eventos de traslado |
   | `ObservationTriageRDA` | `caso.triage` (Res. 5596/2015) |
   | `ConditionRDA` | `dxCie10` + `dxDescripcion` |
   | `ServiceRequestRDA` | `serviciosRequeridos` |
   | `CareDeliveryOrganizationRDA` | código REPS de la sede |
   | `PractitionerRDA` | el actor (de 1.1) |
3. Lo que **falta** y hay que marcarlo como hueco declarado, no inventarlo: `PatientRDA` (PULSO es seudónimo por diseño) y `ProcedureRDA` (no hay CUPS).
4. `GET /casos/:id/rda` devuelve el **borrador**. Estado `pendiente` hasta que un humano firme (4.10).
5. Evento `caso.rda_disponible` al outbox (5.1).

**Hecho cuando.**
- [ ] Un caso cerrado produce un `Bundle` bien formado
- [ ] Los huecos aparecen explícitos, no rellenados con datos falsos
- [ ] Valida contra los perfiles (4.9, Neid)
- [ ] El borrador **nunca se envía solo**

**Trampas.** ⚠️ **Hasta verificar el punto 3 del §0 del plan maestro (si un traslado prehospitalario genera RDA propio o solo lo genera la IPS receptora), la frase es "PULSO pre-llena el RDA", nunca "PULSO reporta al IHCE".** Prometer un reporte oficial que no se está haciendo hunde la demo ante alguien de MinSalud.

---

## 4.12 · Vista forense `/auditoria/casos/:id`

**Ola 4** · depende de `3.2` (Sebas) · dominio `frontend/app/(auditoria)/`

**Qué.** La reconstrucción completa de un caso: cada evento, cada actor, cada decisión con su evidencia.

**Por qué.** **Es la vista que hace defendible todo lo demás** ante un jurado, una interventoría o un juez. Sin ella, "todo es auditable" es una afirmación sin pantalla que la respalde.

**Pasos.**
1. Línea de tiempo vertical con todos los `evento_caso`: hora, tipo, actor, organización, detalle.
2. Al abrir `match_calculado`, mostrar la evidencia de `pulso_routing_decision_audit`: candidatos evaluados, descartados con motivo, desglose en minutos, versión de modelo y de config, procedencia del ETA.
3. Marcar visiblemente las **correcciones** (`corrige_a`): "22:14 llegada a puerta — corregido a 22:11 por X". El error se ve, no se esconde.
4. Distinguir actor humano de servicio (`svc:voz`).
5. Exportar a JSON y a PDF imprimible.
6. Acceso: `auditor`, `regulador_crue`, y `admin_organizacion` **solo de su organización**. **Cada lectura queda registrada.**

**Hecho cuando.**
- [ ] Un caso completo se reconstruye sin huecos
- [ ] Las correcciones se ven como correcciones
- [ ] Un `admin_organizacion` no ve casos ajenos
- [ ] La lectura del auditor queda registrada
- [ ] El PDF es legible impreso en blanco y negro

**Trampas.** Esta vista muestra datos clínicos. **Redacción por rol**: el auditor externo no necesita el dictado crudo. Aplica la misma lista blanca de `despojar()`.

---

## 5.3 · OpenTelemetry + Pino con redacción de PII

**Ola 5** · sin dependencias · dominio `core/src/observabilidad/`, `ai-core/app/telemetria.py`

**Qué.** Trazas de punta a punta con `casoId`, y logs estructurados sin PII.

**Por qué.** Hoy no hay forma de saber por qué un caso tardó 40 s. Y sin redacción, el primer log con un dictado clínico adentro es un incidente de datos sensibles.

**Pasos.**
1. OTel SDK en core con auto-instrumentación de Nest, `pg` y BullMQ.
2. `casoId` y `organizacion_id` como atributos de span. **Nunca** `textoCrudo`, `origen` ni teléfono.
3. Propagar el contexto a `ai-core` (headers `traceparent`) y **a través de la cola** — por eso `webhook_outbox` tiene columna `trace_id`.
4. `nestjs-pino` con redacción:
   ```ts
   redact: { paths: ['req.headers.authorization','req.headers.cookie',
                     '*.textoCrudo','*.texto','*.origen','*.telefono',
                     '*.pacienteToken','*.password','*.dictado'],
             censor: '[redactado]' }
   ```
5. **Test que falle si aparece PII en un log**: correr un caso y hacer grep del texto del dictado en la salida.

**Hecho cuando.**
- [ ] Una traza cubre `/campo → core → ai-core → Mapbox → canal → webhook`
- [ ] El salto por la cola no rompe la traza
- [ ] El test de PII en logs pasa
- [ ] Sin colector configurado, no revienta: no exporta y lo dice

**Trampas.** `ai-core` tiene las credenciales de proveedores. **Ni las URLs de proveedor deben salir en las trazas** — el propio `CapacidadesService` ya explica por qué: *"saber que el ruteo es estimado no le sirve a un atacante; saber a qué host apunta, sí"*.

---

## 5.7 · Prueba de carga con k6

**Ola 5** · depende de `5.6` (Zaid) · dominio `carga/`

**Qué.** 50 casos simultáneos contra los SLOs del [plan maestro §7.1](../pulso-produccion-plan-maestro.md#71-slos--lo-que-se-promete-y-se-mide).

**Por qué.** Los SLOs prometidos (ranking p95 < 8 s, ciclo completo p50 < 90 s) no están medidos. Un número prometido y no medido es una opinión.

**Pasos.**
1. Escenario realista: 50 usuarios virtuales creando casos en 5 min, con las respuestas de hospital simuladas.
2. Medir: `/triage`, `/match`, `/dispatch`, `/handshake/respond` y el ciclo completo.
3. **Sin llamar a Claude ni a Mapbox de verdad** — mockearlos con la latencia real medida, o la prueba cuesta dinero y mide a otro.
4. Probar específicamente: el vigilante con 50 handshakes vivos, y **el pooler con `SET LOCAL` bajo concurrencia** (es donde aparece la fuga de inquilino del caso límite 18).
5. Reporte en `carga/RESULTADOS.md` con la fecha y la versión.

**Hecho cuando.**
- [ ] Los cinco SLOs medidos, con su p50/p95/p99
- [ ] El test de fuga de inquilino bajo concurrencia pasa
- [ ] Se identifica el primer cuello de botella, con nombre
- [ ] Corre en CI solo bajo etiqueta, no en cada PR

**Trampas.** Con `AlmacenService` en memoria, la prueba mide un sistema que no existe. **Corre esto después de 1.2**, o no significa nada.

---

## 5.11 · `/admin/catalogos` y `/admin/modelos`

**Ola 5** · depende de `3.12` (Neid) · dominio `frontend/app/(admin)/`

**Qué.** Administrar lo versionado: motivos de rechazo, protocolos clínicos, mapa Dx→servicios, y versiones de prompt y de config de scoring.

**Por qué.** Estos catálogos son **lógica clínica**, no configuración. Si cambian sin versionar, el dataset histórico se vuelve incomparable — y el dataset es el activo del producto.

**Pasos.**
1. `/admin/catalogos`: CRUD de `motivo_rechazo` (código inmutable, etiqueta editable, versión) y de protocolos.
2. Mapa Dx→servicios: la tabla que traduce diagnóstico a códigos REPS obligatorios (spec §7.2, *"el LLM propone, la tabla decide"*).
3. `/admin/modelos`: versiones de prompt clínico y de config de scoring, con histórico y **qué casos se procesaron con cada una**.
4. **Cambiar una etiqueta crea versión nueva; el código nunca cambia.**
5. Solo `admin_plataforma`. Todo cambio escribe evento.

**Hecho cuando.**
- [ ] Editar una etiqueta no rompe el histórico
- [ ] Se puede ver qué versión de prompt procesó un caso de hace una semana
- [ ] Un diagnóstico sin mapeo se marca "escala a criterio humano", no se inventa
- [ ] `admin_organizacion` → 403
