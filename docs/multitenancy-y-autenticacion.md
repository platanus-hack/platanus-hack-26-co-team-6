# PULSO — Multitenancy y autenticación

> La solución completa. Reemplaza la contraseña de turno de `auth/sesion.service.ts` sin romper el demo.
> Serie: [I · agente y roles](pulso-agente-campo-y-roles.md) · [II · afiliación y trámites](pulso-plataforma-afiliacion-y-tramites.md) · [III · plan maestro](pulso-produccion-plan-maestro.md) · **IV · este**.

**Índice** · [1 el problema](#1-el-problema-en-una-frase) · [2 modelo de inquilinos](#2-el-modelo-de-inquilinos) · [3 autenticación](#3-autenticación) · [4 la ambulancia](#4-el-caso-difícil-login-dentro-de-una-ambulancia) · [5 autorización](#5-autorización-rbac--alcance) · [6 aislamiento](#6-los-seis-niveles-de-aislamiento) · [7 casos límite](#7-los-19-casos-límite) · [8 migración](#8-migración-desde-la-contraseña-de-turno) · [9 checklist](#9-checklist-de-verificación)

---

## 1. El problema en una frase

> Hoy **una sola contraseña compartida** abre las tres consolas, y con ella cualquiera puede aceptar un
> traslado en nombre de cualquier hospital del país.

Está escrito sin maquillaje en el propio código (`auth/sesion.service.ts`): *"una contraseña compartida para todo el turno. No hay usuarios individuales porque no hay a quién distinguir"*. Fue la decisión correcta para 36 horas de hackathon. **No sobrevive al primer hospital real.**

Y arrastra tres consecuencias que ya se pagan:

1. **La auditoría no tiene sujeto.** `pulso_routing_decision_audit` guarda qué decidió la máquina; nadie guarda quién apretó el botón. La pregunta "¿quién aceptó a este paciente?" no tiene respuesta.
2. **El servicio `voz` se autentica como si fuera un humano**, con `CORE_PASSWORD`. En el registro, un bot y una persona son indistinguibles.
3. **No hay a quién aislar.** Sin identidad no hay inquilino, y sin inquilino no hay multitenancy — solo una base de datos compartida y buena fe.

---

## 2. El modelo de inquilinos

### 2.1 El inquilino es la organización, no la sede ni el usuario

```
organizacion (INQUILINO)
   ├── tipo: ips | operador_ambulancia | crue | entidad_pagadora
   ├── organizacion_sede[]   → códigos REPS que le pertenecen
   ├── actor[]               → personas y servicios
   │     └── actor_rol[]     → rol + alcance opcional por sede
   └── movil[]               → solo si es operador_ambulancia
```

**Por qué la organización y no la sede:** una IPS con seis sedes tiene un solo equipo de administración, un solo NIT y un solo contrato. La sede es el **alcance**, no el inquilino.

**Por qué no el usuario:** un jefe de urgencias que renuncia no se lleva la configuración de su hospital.

### 2.2 Lo que rompe el modelo SaaS clásico

Un caso es tocado por tres inquilinos a la vez:

```
  AMB-014 (operador)  ──crea──→  CASO  ←──consulta──  Hospital San Carlos (IPS)
                                   ↑                  Clínica del Norte (IPS, rechazó)
                                   └──regula──        CRUE Bogotá
```

Aislamiento puro rompería el producto. El modelo correcto es **propiedad + concesiones explícitas y revocables**:

> Todo dato tiene un dueño. El acceso de un tercero es un **permiso concedido, con motivo y con
> vencimiento** — nunca un efecto lateral de estar autenticado.

### 2.3 Las tres clases de datos

| Clase | Ejemplos | Regla |
|---|---|---|
| **Del inquilino** | `actor`, `movil`, `sede_estado`, `webhook_endpoint` | Solo su organización. RLS estricta |
| **Compartido con concesión** | `caso`, `evento_caso`, `handshake`, `recepcion`, `tramite` | Dueño + concesiones vigentes + CRUE |
| **Global sin dueño** | `sede`, `servicio_sede`, `motivo_rechazo`, protocolos, curva de demanda | Lectura para todo autenticado. Escritura solo `admin_plataforma` |

**La cuarta, la que se discute:** `capacidad_declarada` y `sede_estado` son *del inquilino* pero **legibles por todos**. Ocultarlos mataría el ruteo. **Declarar es el precio de estar afiliado**, y va escrito en los términos de afiliación — no descubierto después.

---

## 3. Autenticación

### 3.1 Cinco identidades distintas, cinco mecanismos

| Quién | Mecanismo | Duración | Por qué |
|---|---|---|---|
| **Humano en consola** (`/panel`, `/hospital`, `/crue`) | Correo + contraseña → *access* + *refresh* en cookie HttpOnly | access 15 min · refresh 30 días | Estándar, revocable |
| **Paramédico en ambulancia** | Dispositivo vinculado + **PIN de 6 dígitos** | Turno (12 h) con renovación silenciosa | §4 |
| **Servicio** (`voz`, `etl`) | Token de servicio firmado, `sub: 'svc:voz'` | 24 h, rotable | Distingue bot de humano en la auditoría |
| **Botón de canal** (Telegram/WhatsApp) | **Token de un solo uso** firmado, atado a `handshakeId` + sede | Vence con el handshake | No es sesión: es una autorización puntual |
| **API de terceros** (HIS del hospital) | Llave de API con alcance, prefijo `pulso_sk_` | Hasta rotación | `/panel/api` |

### 3.2 Tokens: qué lleva cada uno

```ts
// ACCESS — corto, sin consultar base de datos para autorizar
interface CargaAcceso {
  sub: string;              // actorId
  org: string;              // organizacionId ← EL INQUILINO
  rol: Rol[];               // ['jefe_urgencias']
  sed: string[];            // alcance por sede, vacío = toda la organización
  tip: 'humano' | 'servicio';
  sid: string;              // sessionId → permite revocar
  exp: number;              // 15 min
}

// REFRESH — solo sirve para pedir un access nuevo
interface CargaRefresh {
  sub: string;
  sid: string;
  jti: string;              // id de ESTE refresh; rota en cada uso
  exp: number;              // 30 días
}
```

**Por qué el access lleva los roles adentro:** para no consultar la base en cada request. **El precio:** un rol revocado sigue vivo hasta 15 minutos. Se acepta, con una excepción — **revocar un rol invalida la sesión de inmediato** (`sesion.revocada_en`), y el guard consulta una lista de sesiones revocadas cacheada en Redis. Es una consulta a memoria, no a Postgres.

### 3.3 Rotación de refresh y detección de reuso

```
POST /auth/refresh  con  refresh(jti=A)
   → emite access nuevo + refresh(jti=B), y marca A como usado
   → si alguien vuelve a presentar A:  ⚠️ ALGUIEN CLONÓ EL TOKEN
        → se revoca la CADENA COMPLETA de esa sesión
        → evento de seguridad + aviso al admin de la organización
```

Es el patrón estándar de *refresh token rotation con detección de reuso*, y es lo que convierte un token robado en un incidente detectable en vez de un acceso permanente.

### 3.4 Dónde vive el token

**Cookie `HttpOnly` + `Secure` + `SameSite`.** El repo ya lo hace bien y hay que conservarlo tal cual:

> *"si el token viviera en localStorage, cualquier XSS en las consolas se lo llevaría. El front nunca lee el token."* — `auth.controller.ts`

Se agrega: cookie de refresh con `path=/auth/refresh` (no viaja en cada request), y CSRF por *double submit* en las mutaciones — con `SameSite=Lax` la exposición es baja, pero `COOKIE_CROSS_SITE=true` (front y core en dominios distintos) obliga a `SameSite=None` y ahí **el CSRF deja de ser teórico**.

### 3.5 Todos los flujos

| Flujo | Ruta | Notas |
|---|---|---|
| Registro de organización | `POST /afiliacion` | Crea organización + primer `admin_organizacion`. Verificación REPS |
| Invitación | `POST /organizaciones/:id/invitaciones` → `/invitacion/:token` | Token **hasheado** en base, 72 h, un solo uso |
| Login | `POST /auth/login` | Rate limit por correo **y** por IP. Mensaje único ante fallo |
| Refresh | `POST /auth/refresh` | Rotación + detección de reuso |
| Logout | `POST /auth/logout` | Revoca la sesión, no solo borra la cookie |
| Logout global | `POST /auth/sesiones/revocar-todas` | Dispositivo perdido |
| Recuperar contraseña | `POST /auth/recuperar` | Respuesta **idéntica** exista o no el correo. Token de 1 h |
| Cambiar contraseña | `POST /auth/contrasena` | Exige la actual. **Revoca las demás sesiones** |
| Segundo factor | `POST /auth/2fa/*` | **Obligatorio** para `regulador_crue`, `admin_plataforma`, `auditor` |
| Vincular dispositivo | `POST /auth/dispositivo` | §4 |
| Token de servicio | `POST /auth/servicio` | Solo `admin_plataforma`, y queda auditado |

### 3.6 Contraseñas

- **Argon2id** (`argon2` en Node), no bcrypt, no SHA-256. Hoy es `sha256` sin sal — suficiente para una contraseña de turno efímera, **inaceptable** para credenciales de personas.
- Mínimo 12 caracteres, y contraste contra una lista de contraseñas filtradas.
- Comparación en tiempo constante (ya se hace bien).
- Bloqueo progresivo: 5 fallos → 1 min, 10 → 15 min, siempre por cuenta **e** IP.

### 3.7 Servicio a servicio

`voz → core` deja de usar `CORE_PASSWORD`:

```ts
// El token de servicio se emite una vez y se rota. Su `sub` es inconfundible.
{ sub: 'svc:voz', org: '<uuid del CRUE o de plataforma>', rol: ['servicio'],
  alcance: ['caso:crear', 'caso:leer', 'notificar'], exp: +24h }
```

Y **el alcance importa**: `svc:voz` puede crear casos y notificar; **no** puede aceptar un traslado ni tocar capacidad. Hoy, con la contraseña compartida, puede todo.

---

## 4. El caso difícil: login dentro de una ambulancia

Aquí es donde los patrones de SaaS se rompen contra la realidad, y hay que diseñarlo a propósito.

### 4.1 Las cinco restricciones reales

1. **Guantes.** Un teclado de contraseña de 14 caracteres es inviable.
2. **Sin señal.** Un *magic link* por correo no funciona en un sótano de urgencias.
3. **Turno compartido.** El mismo tablet lo usan tres tripulaciones en 24 horas.
4. **El paciente no espera.** Un login que falla y bloquea es peor que no tener login.
5. **La sesión no puede expirar a mitad de un traslado.** Desloguear a alguien con un paciente en la camilla es un fallo de seguridad **del paciente**, no de la aplicación.

### 4.2 El diseño

```
UNA VEZ POR TABLET (con señal, en la base, lo hace el admin de la organización)
   /panel/moviles → "Vincular dispositivo" → QR
   El tablet lo escanea → guarda un `deviceToken` de larga vida en almacenamiento seguro
   El dispositivo queda ATADO a la organización. Eso ya es el inquilino.

CADA TURNO (5 segundos, con guantes)
   /campo/turno → elegir móvil de una lista → elegir tripulante → PIN de 6 dígitos
   → sesión de 12 h atada a (dispositivo, actor, movil)

DURANTE EL TURNO
   Renovación silenciosa cada 10 min mientras haya red.
   ⚠️ Si hay un caso ABIERTO, la sesión NO expira: se extiende hasta el cierre + 30 min.
   Sin red: el token vigente sigue sirviendo y las acciones se encolan (§4.3).

FIN DE TURNO
   "Cerrar turno" → revoca la sesión, el dispositivo sigue vinculado.
   Cierre automático a las 14 h sin actividad y sin caso abierto.
```

**El `deviceToken` es el que carga el inquilino.** El PIN identifica a la persona. Separar las dos cosas es lo que permite un PIN corto sin debilitar el sistema: un PIN sin el dispositivo vinculado no vale nada.

### 4.3 Sin señal

- Las acciones se encolan en IndexedDB con su `Idempotency-Key`, y se reintentan al volver la red.
- **Lo que nunca se encola: crear un caso.** Un caso creado offline que se sincroniza 20 minutos tarde rutea contra una ciudad que ya cambió. Sin red, la UI manda al canal que sí funciona (radio al CRUE) y lo dice.
- El `useConectividad` que ya existe en el front es el gancho.

---

## 5. Autorización: RBAC + alcance

### 5.1 Permiso = rol × alcance × recurso

Un rol no basta. `jefe_urgencias` no significa nada sin *de qué sede*.

```ts
type Alcance =
  | { tipo: 'organizacion'; organizacionId: string }
  | { tipo: 'sede'; codigos: string[] }
  | { tipo: 'red' };                    // solo regulador_crue y auditor

// El guard resuelve el alcance; la policy decide; RLS es la red de seguridad.
@Rol('jefe_urgencias')
@Alcance('sede')
@Post('handshake/respond')
async responder(@Actor() actor: ActorSesion, @Body() cuerpo: RespondRequest) { ... }
```

### 5.2 Matriz de permisos

| Permiso | paramedico | jefe_urgencias | admin_organizacion | regulador_crue | auditor | admin_plataforma | servicio |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `caso:crear` | ✅ | — | — | ✅ | — | — | ✅ `voz` |
| `caso:leer` | propios | dirigidos a su sede | — | ✅ red | ✅ red | — | propios |
| `caso:despachar` | ✅ propios | — | — | ✅ | — | — | ✅ `voz` |
| `handshake:responder` | — | ✅ **solo su sede** | — | ✅ override | — | — | — |
| `caso:escalar` | ✅ | ✅ | — | — | — | — | — |
| `escalamiento:atender` | — | — | — | ✅ | — | — | — |
| `sede:estado:escribir` | — | ✅ su sede | ✅ sus sedes | ✅ suspender | — | ✅ | — |
| `capacidad:declarar` | — | ✅ su sede | ✅ | — | — | — | — |
| `organizacion:administrar` | — | — | ✅ la suya | — | — | ✅ | — |
| `actor:invitar` | — | — | ✅ | — | — | ✅ | — |
| `rol:otorgar` | — | — | ✅ de su org | — | — | ✅ | — |
| `movil:administrar` | — | — | ✅ | — | — | ✅ | — |
| `movil:estado` | ✅ el suyo | — | ✅ | — | — | — | — |
| `webhook:administrar` | — | — | ✅ | — | — | ✅ | — |
| `evento:leer` | sus casos | sus casos | — | ✅ red | ✅ red | — | — |
| `evento:escribir` | ✅ sus casos | ✅ sus casos | — | ✅ | — | — | ✅ |
| `tramite:firmar` | ✅ prehospitalario | ✅ hospitalario | — | — | — | — | — |
| `catalogo:escribir` | — | — | — | — | — | ✅ | — |
| `afiliacion:aprobar` | — | — | — | — | — | ✅ | — |
| `auditoria:leer` | — | su sede | su org | ✅ red | ✅ red | ✅ | — |

**Ninguna casilla dice ✅ para borrar.** El sistema no borra: transiciona estados y agrega eventos.

### 5.3 Los cuatro invariantes del guard

1. **`handshake:responder` exige que la sede del handshake esté en el alcance del actor.** Si no → `403` **+ evento `intento_cruzado`**. Un 403 mudo pierde la señal más interesante del sistema.
2. **El override del CRUE exige justificación no vacía.** Campo obligatorio, guardado en el evento.
3. **Nadie se otorga un rol que no tiene.** `admin_organizacion` no puede crear un `regulador_crue`.
4. **Ninguna ruta es pública por omisión.** El `SesionGuard` global ya niega por defecto y hay que abrir con `@Publico()` — ese diseño es correcto y se conserva.

---

## 6. Los seis niveles de aislamiento

| # | Nivel | Cómo | Si falla |
|---|---|---|---|
| 1 | **Datos** | RLS con `SET LOCAL pulso.organizacion_id` en cada transacción | Un inquilino lee a otro |
| 2 | **Consulta** | Ningún repositorio expone `find()` sin `Alcance` como primer parámetro | Olvido silencioso |
| 3 | **API** | Guard de rol + alcance antes de tocar la base | 403 tardío |
| 4 | **Tiempo real** | El canal se resuelve en el servidor desde el token. **Nunca comodines** | Fuga masiva |
| 5 | **Llaves** | Llave de API por organización, con alcance, rotable | Acceso cruzado permanente |
| 6 | **Telemetría** | `organizacion_id` como atributo de span; **nunca PII en trazas ni logs** | Fuga por el backend de observabilidad |

### 6.1 Las tres trampas de RLS

1. **Rol no-owner y no-superusuario.** Owners y superusuarios **se saltan RLS por defecto**; hace falta además `alter table … force row level security`. ⚠️ **`SUPABASE_SERVICE_ROLE_KEY` se salta RLS y es lo que `supabase.service.ts` usa hoy** — mientras core hable con la service role, la capa 1 no protege nada.
2. **`SET LOCAL`, nunca `SET`.** Con un pooler, un `SET` plano **filtra el contexto de un inquilino al siguiente request**. Solo aparece bajo concurrencia, que es cuando peor duele.
3. **RLS es una capa, no la respuesta.** Defensa en profundidad: datos + API + llaves.

```ts
export async function enContextoDe<T>(actor: ActorSesion, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local pulso.organizacion_id = ${actor.org}`);
    await tx.execute(sql`set local pulso.actor_id       = ${actor.sub}`);
    await tx.execute(sql`set local pulso.rol_red        = ${actor.rol.includes('regulador_crue') || actor.rol.includes('auditor')}`);
    return fn(tx);
  });
}
```

### 6.2 El caso que cruza inquilinos

```sql
create table caso_acceso (
  caso_id         uuid not null references caso(id),
  organizacion_id uuid not null references organizacion(id),
  motivo          text not null check (motivo in
                    ('propietario','destinataria','consultada','regulador','auditoria')),
  otorgado_en     timestamptz not null default now(),
  revocado_en     timestamptz,
  revocado_motivo text,
  primary key (caso_id, organizacion_id, motivo)
);
```

| Momento | Efecto |
|---|---|
| `POST /triage` | Operador = `propietario`, permanente |
| `POST /dispatch` | Sede = `consultada`. Ve el mínimo clínico, **no** `textoCrudo` ni `origen` |
| Acepta | `consultada` → `destinataria`. Gana el paquete de prearribo completo |
| **Rechaza o vence** | **`revocado_en = now()`.** Deja de ver el caso vivo; conserva su `handshake` como constancia |
| Escalamiento | CRUE entra como `regulador`. **Se registra: un acceso legal también es un acceso** |
| Cierre + retención | Todo se revoca salvo `auditoria` |

> **Que el rechazo revoque el acceso es la pieza no obvia.** Sin eso, cada hospital al que se le preguntó
> conserva para siempre la ficha clínica de un paciente que nunca recibió. Es minimización de datos
> (Ley 1581/2012), no una preferencia de interfaz.

---

## 7. Los 19 casos límite

Esto es lo que "hay que tener en cuenta". Cada uno con su decisión.

### Identidad y pertenencia

| # | Caso | Decisión |
|---|---|---|
| 1 | **Un médico trabaja en dos IPS** | `actor` pertenece a UNA organización. Para la segunda, **otro actor con el mismo correo**. El login pregunta con cuál entra y emite un token distinto. **Nunca** un token con dos organizaciones |
| 2 | **Jefe que cubre dos sedes de la misma IPS** | Un solo actor, `actor_rol` con dos filas y distinto `codigo_sede`. El alcance es la unión |
| 3 | **Se cambia de hospital** | Se desactiva el actor viejo (`activo=false`), se crea uno nuevo. **No se reasigna**: la auditoría vieja debe seguir apuntando a la organización donde ocurrió |
| 4 | **Actor desactivado que aparece en auditoría** | Los eventos guardan `actor_id`, y el actor **nunca se borra**. Se muestra "Nombre (inactivo)" |
| 5 | **Organización suspendida con casos vivos** | Sale del ranking de inmediato. **Sus casos en curso NO se cancelan**: se dejan cerrar. Cancelarlos abandonaría pacientes |
| 6 | **Organización retirada** | Datos históricos intactos, contacto anonimizado, accesos revocados |

### Sesión

| # | Caso | Decisión |
|---|---|---|
| 7 | **La sesión expira a mitad de traslado** | **No expira.** Con caso abierto se extiende hasta cierre + 30 min. Es seguridad del paciente |
| 8 | **Dos tripulantes, un tablet** | La sesión es del actor que abrió turno; el segundo queda en `tripulacion[]` del móvil. Cambio de conductor = cerrar y abrir turno (5 s) |
| 9 | **Tablet perdido** | `/panel/moviles` → desvincular dispositivo. Revoca `deviceToken` y todas sus sesiones |
| 10 | **Refresh reusado** | Cadena completa revocada + evento de seguridad + aviso al admin (§3.3) |
| 11 | **Contraseña cambiada** | Revoca todas las demás sesiones, conserva la actual |
| 12 | **Rol revocado** | La sesión se revoca al instante vía lista en Redis; no espera los 15 min del access |

### Multitenancy

| # | Caso | Decisión |
|---|---|---|
| 13 | **`X-Organizacion-Id` en el header** | **Se ignora siempre.** El inquilino sale del token firmado. Confiar en un header es escalada de privilegios de una línea |
| 14 | **CRUE lee un caso ajeno** | Permitido por ley y **registrado como acceso**, con actor y motivo |
| 15 | **Suscripción a realtime con comodín** | El canal se resuelve en el servidor desde el token. `sede:*` no existe como suscripción posible |
| 16 | **Enumerar casos por id** | UUID v4 ayuda, no autoriza. La autorización es por recurso, nunca por poseer el id |
| 17 | **Llave de API filtrada** | Alcance mínimo + rotación en `/panel/api` + registro de uso por llave |
| 18 | **Pooler filtra contexto** | `SET LOCAL` dentro de transacción, siempre. Test de concurrencia que lo prueba |
| 19 | **Migración de datos sin `organizacion_id`** | Los casos previos a F1 se asignan a una organización "histórica" y quedan marcados. **Nunca `null`**: un `null` bajo RLS es invisible o es visible para todos, y las dos son malas |

---

## 8. Migración desde la contraseña de turno

Cuatro pasos. **En ningún momento se queda el demo sin poder entrar.**

| Paso | Qué | Cómo se convive |
|---|---|---|
| **1** | Tablas de identidad + `admin_plataforma` semilla | La contraseña de turno sigue funcionando |
| **2** | Login por correo funcionando en paralelo | **Los dos caminos activos.** `OPERADOR_PASSWORD` emite un token con una organización "demo" y rol amplio |
| **3** | Guards de rol y alcance activos | El token de la contraseña de turno **empieza a chocar** contra los guards. Se migran las consolas una por una |
| **4** | `PULSO_AUTH_LEGACY=false` | La contraseña de turno deja de emitir token. Se borra el código |

**La bandera `PULSO_AUTH_LEGACY` es lo que permite mergear el paso 3 sin bloquear al equipo.** En desarrollo queda en `true` hasta el final; en staging se apaga primero.

---

## 9. Checklist de verificación

**Autenticación**
- [ ] Argon2id, mínimo 12 caracteres, contraste contra listas filtradas
- [ ] Access 15 min + refresh 30 días con rotación y detección de reuso
- [ ] Cookies `HttpOnly` + `Secure` + `SameSite`; refresh con `path` restringido
- [ ] CSRF por double-submit cuando `COOKIE_CROSS_SITE=true`
- [ ] Bloqueo progresivo por cuenta **y** por IP
- [ ] Recuperación con respuesta idéntica exista o no el correo
- [ ] 2FA obligatorio en `regulador_crue`, `admin_plataforma`, `auditor`
- [ ] Token de servicio con alcance, distinto del de humano
- [ ] Token de un solo uso en botones de Telegram/WhatsApp
- [ ] **La sesión no expira con un caso abierto**

**Multitenancy**
- [ ] Rol de base de datos no-owner + `force row level security`
- [ ] `SET LOCAL` dentro de transacción, con test de concurrencia
- [ ] Core **no** usa `SUPABASE_SERVICE_ROLE_KEY` para datos de dominio
- [ ] `Alcance` obligatorio en la firma de todo repositorio
- [ ] `caso_acceso` con revocación al rechazar
- [ ] Canales de realtime resueltos en servidor, sin comodines
- [ ] `organizacion_id` nunca nulo en tablas de inquilino
- [ ] Test: caso de la organización A → 0 filas en contexto de B
- [ ] Test: `handshake:responder` de otra sede → 403 + evento `intento_cruzado`
- [ ] Telemetría con `organizacion_id`, sin PII
