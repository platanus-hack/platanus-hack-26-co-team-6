# PULSO — Plataforma: afiliación, CRUD con roles, recepción asistida y muerte del trámite

> Plan detallado. Continúa [pulso-agente-campo-y-roles.md](pulso-agente-campo-y-roles.md), que diagnosticó el estado del repo.
> Aquí está el **cómo**: esquema completo, matriz de permisos, máquina de estados de afiliación,
> endpoints con la convención de la casa, y el inventario de trámites con qué hace PULSO con cada uno.
>
> Convención del repo: identificadores en español **sin tildes**; tildes solo en texto visible.
> Campos nuevos en `contracts/types.ts` **siempre opcionales** (regla de `docs/contrato-api.md`).

**Parte I — la plataforma:** [0 tesis](#0-la-tesis-que-ordena-todo-el-plan) · [1 modelo de datos](#1-modelo-de-datos-completo) · [2 roles](#2-matriz-de-roles-y-permisos-rbac) · [3 afiliación](#3-módulo-de-afiliación) · [4 CRUD](#4-crud-con-roles--la-tabla-completa) · [5 recepción asistida](#5-recepción-asistida-que-el-hospital-sepa-qué-le-llega-y-esté-listo) · [6 tiempo real](#6-tiempo-real) · [7 trámites](#7-los-trámites-uno-por-uno) · [8 ejecución](#8-ejecución) · [9 decisiones](#9-decisiones-que-hay-que-tomar)

**Parte II — lo transversal:** [10 multitenancy](#10-multitenancy) · [11 CRUD de eventos](#11-crud-de-eventos--auditoría-de-qué-se-escribe-de-verdad) · [12 qué se guarda en cada etapa](#12-qué-se-guarda-en-cada-etapa--auditoría-de-completitud)

---

## 0. La tesis que ordena todo el plan

**Un hospital no dice que no porque no tenga cama. Dice que no porque no sabe quién le va a pagar.**

Esto no es retórica: es lo que ordena qué se construye primero. Los cuatro motivos de rechazo que hoy ofrece la consola (`components/hospital/MotivosCapacidad.tsx`) son todos clínicos —"sin camas UCI", "sin especialista de turno"—. Falta el quinto, que es el verdadero y nadie va a tocar en un botón: *"no sé si esto me lo pagan"*.

La ley colombiana ya resolvió la parte clínica: **la Ley 1751 de 2015 obliga a atender urgencias sin autorización previa**, y el Decreto 4747 de 2007 lo dice igual. El repo ya lo tiene escrito como regla de producto en `/hospital`. Pero la obligación legal de atender **no elimina el riesgo financiero de admitir**, y ese riesgo es el que produce la demora: verificación de derechos por teléfono, autorización que nadie tiene que dar pero todos piden, glosa posterior, cuentas que se caen.

> **Entonces el producto no es "rutear mejor". Es esto:**
> PULSO arma el expediente administrativo **en paralelo** con el ruteo clínico, de modo que cuando el
> hospital aprieta "Aceptar", **acepta con el papeleo ya hecho**. El sí deja de ser un riesgo.

Todo lo que sigue —afiliación, roles, CRUD, recepción, trámites— es la ingeniería de esa frase.

---

## 1. Modelo de datos completo

Cinco bloques. El bloque A ya existe (REPS); B, C, D y E son nuevos.

### Bloque A — Catálogo REPS (existe, no se toca)

`sede`, `servicio_sede`, `capacidad_sede` de `0001_init.sql`. Es el **universo de verdad del Estado**: 16.181 sedes de Bogotá con su `codigo_habilitacion_sede`. Nadie lo edita desde la app; se refresca por ETL. **Es la base contra la que se autoverifica la afiliación** (§3.3).

### Bloque B — Identidad, organizaciones y roles

```sql
-- ═══════════════════════════════════════════════════════════════
--  B1. Organización — la entidad jurídica que se afilia a PULSO
-- ═══════════════════════════════════════════════════════════════
create table organizacion (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ('ips','operador_ambulancia','crue','entidad_pagadora')),
  razon_social   text not null,
  nombre_corto   text,
  nit            text not null,
  -- Estado de la afiliación. La máquina de estados vive en §3.2.
  estado         text not null default 'borrador'
                 check (estado in ('borrador','enviada','en_verificacion','observada',
                                   'aprobada','activa','suspendida','retirada')),
  -- Cómo se verificó: 'reps_automatico' es el camino sin trámite (§3.3).
  verificacion   text check (verificacion in ('reps_automatico','manual','pendiente')),
  verificada_en  timestamptz,
  verificada_por uuid,                     -- FK a actor, se agrega abajo
  creada_en      timestamptz default now(),
  actualizada_en timestamptz default now(),
  unique (tipo, nit)
);

-- ═══════════════════════════════════════════════════════════════
--  B2. Sede afiliada — el puente entre la organización y el REPS
--  Una IPS puede afiliar VARIAS sedes. La PK sigue siendo la del REPS.
-- ═══════════════════════════════════════════════════════════════
create table organizacion_sede (
  organizacion_id uuid references organizacion(id) on delete cascade,
  codigo_sede     text references sede(codigo),
  -- Si el código existe en `sede`, la verificación es automática.
  verificada      boolean default false,
  activa          boolean default true,
  vinculada_en    timestamptz default now(),
  primary key (organizacion_id, codigo_sede)
);

-- ═══════════════════════════════════════════════════════════════
--  B3. Actor — una persona o un servicio. NO es "usuario final".
-- ═══════════════════════════════════════════════════════════════
create table actor (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid references organizacion(id) on delete cascade,
  tipo            text not null check (tipo in ('humano','servicio')),
  nombre          text not null,
  identificador   text not null unique,     -- correo, o 'svc:voz'
  password_hash   text,                     -- null en servicios: usan token propio
  telefono        text,                     -- E.164, para WhatsApp
  -- Registro profesional. Obligatorio para paramédico y jefe de urgencias.
  registro_profesional text,
  activo          boolean default true,
  ultimo_acceso   timestamptz,
  creado_en       timestamptz default now()
);
alter table organizacion add constraint organizacion_verificada_por_fk
  foreign key (verificada_por) references actor(id);

-- ═══════════════════════════════════════════════════════════════
--  B4. Rol — qué puede hacer, dentro del alcance de su organización
-- ═══════════════════════════════════════════════════════════════
create table actor_rol (
  actor_id uuid references actor(id) on delete cascade,
  rol      text not null check (rol in (
             'paramedico','jefe_urgencias','admin_organizacion',
             'regulador_crue','auditor','admin_plataforma','servicio')),
  -- Alcance opcional: un jefe de urgencias puede estar atado a UNA sede.
  codigo_sede text references sede(codigo),
  otorgado_por uuid references actor(id),
  otorgado_en  timestamptz default now(),
  primary key (actor_id, rol, codigo_sede)
);

-- ═══════════════════════════════════════════════════════════════
--  B5. Invitación — cómo entra el segundo humano de una organización
-- ═══════════════════════════════════════════════════════════════
create table invitacion (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid references organizacion(id) on delete cascade,
  correo          text not null,
  rol             text not null,
  codigo_sede     text references sede(codigo),
  token_hash      text not null,            -- se guarda el hash, nunca el token
  expira_en       timestamptz not null,
  aceptada_en     timestamptz,
  invitada_por    uuid references actor(id),
  creada_en       timestamptz default now()
);
```

### Bloque C — Operación en tiempo real (lo que cambia cada minuto)

```sql
-- ═══════════════════════════════════════════════════════════════
--  C1. Estado operativo declarado por la propia sede
--  Reemplaza la adivinanza. Es filtro DURO en el ranking.
-- ═══════════════════════════════════════════════════════════════
create table sede_estado (
  codigo_sede   text primary key references sede(codigo),
  operativo     text not null default 'recibiendo'
                check (operativo in ('recibiendo','saturado','contingencia','cerrado')),
  motivo        text,
  declarado_por uuid references actor(id),
  declarado_en  timestamptz default now(),
  -- Una declaración CADUCA. Sin esto, alguien declara contingencia un martes
  -- y la sede queda invisible para siempre porque nadie se acuerda de revertir.
  vence_en      timestamptz not null default (now() + interval '4 hours')
);

-- ═══════════════════════════════════════════════════════════════
--  C2. Capacidad declarada — serie de tiempo, NO estado editable
-- ═══════════════════════════════════════════════════════════════
create table capacidad_declarada (
  id            bigint generated always as identity primary key,
  codigo_sede   text not null references sede(codigo),
  tipo          text not null,           -- 'UCI-Adultos','UCI-Pediatrica','Urgencias-Camillas'...
  disponibles   int  not null check (disponibles >= 0),
  total         int  check (total >= 0),
  declarado_por uuid references actor(id),
  declarado_en  timestamptz default now()
);
create index on capacidad_declarada (codigo_sede, tipo, declarado_en desc);

-- Vista de "lo último declarado por sede y tipo". Es lo que lee el scoring.
create or replace view capacidad_vigente as
select distinct on (codigo_sede, tipo)
  codigo_sede, tipo, disponibles, total, declarado_en,
  (now() - declarado_en) as antiguedad
from capacidad_declarada
order by codigo_sede, tipo, declarado_en desc;

-- ═══════════════════════════════════════════════════════════════
--  C3. Canal de aviso por sede. Mata el TELEGRAM_CHAT_ID_DEMO global.
-- ═══════════════════════════════════════════════════════════════
create table sede_canal (
  id          bigint generated always as identity primary key,
  codigo_sede text not null references sede(codigo),
  canal       text not null check (canal in ('telegram','whatsapp','consola','correo')),
  destino     text not null,             -- chat_id | E.164 | correo
  etiqueta    text,                      -- 'Jefe urgencias noche'
  prioridad   int default 1,
  verificado  boolean default false,     -- se verifica mandando un mensaje de prueba
  activo      boolean default true,
  unique (codigo_sede, canal, destino)
);

-- ═══════════════════════════════════════════════════════════════
--  C4. Móvil — la ambulancia como entidad de primera clase
-- ═══════════════════════════════════════════════════════════════
create table movil (
  id              text primary key,        -- 'AMB-014'
  organizacion_id uuid not null references organizacion(id) on delete cascade,
  tipo            text not null check (tipo in ('TAB','TAM')),
  placa           text,
  -- Habilitación del REPS del servicio de transporte asistencial.
  codigo_habilitacion text,
  vigencia_tecnomecanica date,
  activo          boolean default true,
  creado_en       timestamptz default now()
);

create table movil_estado (
  movil_id      text primary key references movil(id) on delete cascade,
  disponible    boolean default true,
  caso_id       uuid,
  tripulacion   jsonb default '[]',        -- [{actorId, rol}]
  geom          geography(Point,4326),
  velocidad_kmh real,
  actualizado   timestamptz default now()
);
create index on movil_estado using gist (geom);
```

### Bloque D — El caso, su línea de tiempo y la recepción

```sql
-- Se extiende `caso` (ya existe) con lo administrativo. Todo opcional.
alter table caso add column organizacion_id uuid references organizacion(id);
alter table caso add column movil_id         text references movil(id);
alter table caso add column creado_por       uuid references actor(id);
-- Token de paciente: identificador SEUDÓNIMO. Nunca el documento en claro.
alter table caso add column paciente_token   text;

-- ═══════════════════════════════════════════════════════════════
--  D1. Línea de tiempo. Append-only. Es el reporte del traslado.
-- ═══════════════════════════════════════════════════════════════
create table evento_caso (
  id          bigint generated always as identity primary key,
  caso_id     uuid not null references caso(id),
  tipo        text not null check (tipo in (
                'caso_creado','revision_humana','match_calculado','despachado',
                'aceptado','rechazado','timeout','rerouteado','escalado','override_crue',
                'llegada_escena','salida_escena','llegada_puerta','entrega','cerrado',
                'demora_reportada','prearribo_enviado','preparacion_confirmada',
                'derechos_verificados','tramite_generado','contrarreferencia')),
  actor_id    uuid references actor(id),
  movil_id    text references movil(id),
  codigo_sede text references sede(codigo),
  detalle     jsonb not null default '{}',
  ocurrido_en timestamptz not null default now()
);
create index on evento_caso (caso_id, ocurrido_en);
-- Mismo trigger append-only que pulso_routing_decision_audit (0002).

-- ═══════════════════════════════════════════════════════════════
--  D2. Recepción — lo que el hospital prepara antes de que llegue
-- ═══════════════════════════════════════════════════════════════
create table recepcion (
  id             uuid primary key default gen_random_uuid(),
  caso_id        uuid not null references caso(id),
  codigo_sede    text not null references sede(codigo),
  handshake_id   uuid,
  -- Paquete de prearribo generado (§5.2)
  sbar           jsonb,                   -- {situacion, antecedente, evaluacion, recomendacion}
  protocolo      text,                    -- 'codigo_infarto' | 'codigo_acv' | 'trauma_mayor' | null
  checklist      jsonb default '[]',      -- [{item, responsable, confirmado, confirmado_en}]
  ventana_clinica_min int,                -- 90 door-to-balloon, 60 door-to-needle
  eta_min_actual real,
  llegada_estimada timestamptz,
  preparada_en   timestamptz,
  preparada_por  uuid references actor(id),
  entregado_en   timestamptz,
  unique (caso_id, codigo_sede)
);

-- ═══════════════════════════════════════════════════════════════
--  D3. Enum controlado de motivos de rechazo (spec §7.4)
--  Hoy son 4 strings escritos a mano en un .tsx del frontend.
-- ═══════════════════════════════════════════════════════════════
create table motivo_rechazo (
  codigo      text primary key,           -- 'SIN_CAMA_UCI'
  etiqueta    text not null,              -- 'Sin camas UCI disponibles'
  categoria   text not null check (categoria in ('capacidad','recurso_humano','tecnico','administrativo')),
  version     int not null default 1,
  activo      boolean default true
);
alter table handshake add column motivo_codigo text references motivo_rechazo(codigo);
```

### Bloque E — Trámites

```sql
-- ═══════════════════════════════════════════════════════════════
--  E1. El expediente administrativo que viaja con el paciente
-- ═══════════════════════════════════════════════════════════════
create table tramite (
  id           uuid primary key default gen_random_uuid(),
  caso_id      uuid not null references caso(id),
  tipo         text not null check (tipo in (
                 'verificacion_derechos','referencia','aceptacion','admision',
                 'entrega_paciente','contrarreferencia','furips','rips','notificacion_sivigila')),
  estado       text not null default 'pendiente'
               check (estado in ('no_aplica','pendiente','en_proceso','completado','fallido','omitido_por_urgencia')),
  -- Base jurídica de la actuación (spec §9.1). Obligatoria en los que mueven datos clínicos.
  base_legal   text,
  -- El contenido del trámite. Estructurado, no un PDF opaco.
  payload      jsonb not null default '{}',
  generado_por text check (generado_por in ('automatico','ia','humano')),
  actor_id     uuid references actor(id),
  creado_en    timestamptz default now(),
  completado_en timestamptz,
  unique (caso_id, tipo)
);
create index on tramite (caso_id, tipo);
```

---

## 2. Matriz de roles y permisos (RBAC)

Siete roles. **La regla que los ordena: el alcance nunca es global salvo para `regulador_crue` y `admin_plataforma`.**

| Rol | Quién es | Alcance de lectura | Puede crear/editar | Nunca puede |
|---|---|---|---|---|
| `paramedico` | TAPH o médico en la ambulancia | Sus casos abiertos + ranking + su móvil | Caso, despacho, escalamiento, eventos de traslado, demora | Ver casos de otros móviles · responder por un hospital · editar catálogo |
| `jefe_urgencias` | Jefe de turno de **una** sede | Solicitudes dirigidas a **su** `codigo_sede` + recepciones de su sede | Aceptar/rechazar lo suyo, `sede_estado`, `capacidad_declarada`, checklist de recepción | Ver casos no dirigidos a él · responder por otra IPS · borrar auditoría |
| `admin_organizacion` | Quien afilió la IPS o la empresa de ambulancias | Todo lo de su organización | Sedes vinculadas, móviles, canales, invitar actores, asignar roles de su org | Salir de su organización · ver casos clínicos ajenos · autoaprobarse la afiliación |
| `regulador_crue` | Regulador del CRUE | **La red completa**, escalamientos, congestión, cobertura | Override con justificación **obligatoria**, atender escalamiento, forzar destino, suspender sede | Modificar o borrar auditoría · editar datos clínicos del caso |
| `auditor` | Interventoría / calidad / secretaría | Solo lectura, histórico completo, reportes | Nada. Sus consultas también quedan registradas | Cualquier escritura |
| `admin_plataforma` | El equipo PULSO | Todo | Aprobar/observar afiliaciones, catálogos, motivos de rechazo, versiones de modelo | Borrar auditoría · aceptar por una IPS |
| `servicio` | `svc:voz`, `svc:etl` | Lo mínimo de su función | `voz`: crear casos y notificar. `etl`: refrescar catálogo | Cualquier cosa fuera de su función declarada |

**Cinco invariantes que el guard hace cumplir y no se negocian:**

1. **Aceptación atada a identidad** (spec §8.2). `actor.organizacion → organizacion_sede.codigo_sede` debe contener el `handshake.sedeCodigo`. Si no → **403 + `evento_caso` tipo `intento_cruzado`**. Un 403 silencioso pierde la señal más interesante que tiene el sistema.
2. **Token de un solo uso** en los botones de Telegram/WhatsApp (spec §8.3). Hoy el `callback_data` es `a:<uuid>`, reproducible por cualquiera que lo vea.
3. **Override del CRUE exige justificación** (spec §8.4). Campo obligatorio, no opcional; se guarda en `evento_caso.detalle.justificacion`.
4. **Auditoría inmutable**: ni `admin_plataforma` puede editar `evento_caso`, `tramite` completado ni `pulso_routing_decision_audit`. Los triggers de `0002` ya son el patrón.
5. **Nadie se autoaprueba la afiliación.** Salvo el camino automático contra REPS (§3.3), que no lo aprueba una persona sino una coincidencia de datos del Estado.

**Implementación:** `sesion.service.ts::emitir()` deja de firmar `sub:'operador'` y firma `{actorId, organizacionId, roles[], sedes[]}`. El `SesionGuard` ya escribe `req.operador` — ahí se inyecta el actor completo. Encima, un `@Rol('jefe_urgencias')` + `RolGuard`, y para el alcance por sede un `@AlcanceSede()` que compara contra el recurso pedido.

---

## 3. Módulo de afiliación

**El objetivo: que una IPS o una empresa de ambulancias se inscriba sola, en minutos, sin que nadie del equipo PULSO intervenga — y que a partir de ahí mantenga su información viva.**

### 3.1 Las dos puertas de entrada

| | IPS / hospital | Operador de ambulancias |
|---|---|---|
| Se identifica con | `codigo_habilitacion_sede` (12 dígitos) + NIT | NIT + código de habilitación de transporte asistencial |
| Se verifica contra | `sede` (16.181 sedes REPS de Bogotá, ya en el repo) | `data/procesado/ambulancias.json` (225 prestadores, 112 TAB / 53 TAM) |
| Al aprobarse declara | Servicios habilitados, capacidad, canales de aviso, estado operativo | Flota de móviles con tipo TAB/TAM, tripulaciones |
| Gana | Recibir solicitudes que **sí puede atender**, con el papeleo hecho | Rutear a sedes que **sí van a aceptar**, sin llamar hospital por hospital |

### 3.2 Máquina de estados

```
  borrador ──enviar──→ enviada ──→ en_verificacion ──┬──→ aprobada ──activar──→ activa
     ↑                                               │                            │ │
     └──────── corregir ──── observada ←──observar───┘              suspender ────┘ │
                                                                                    │
                                            retirada ←──── retirar (por la propia org)
```

- **`borrador`** — se puede editar todo, no recibe solicitudes, no aparece en el ranking.
- **`en_verificacion`** — automática (§3.3) o manual. Máximo declarado: 24h hábiles.
- **`observada`** — falta un dato o no cruza con REPS. Se le dice **qué** falta, no "solicitud rechazada".
- **`activa`** — entra al ranking. **Este es el único estado en que una sede es despachable.**
- **`suspendida`** — la suspende `admin_plataforma` o el `regulador_crue` (p.ej. habilitación vencida). Sale del ranking; sus casos en curso **no** se cancelan.
- **`retirada`** — la propia organización se va. Sus datos históricos **no se borran**: la auditoría es append-only. Se anonimiza el contacto, se conserva la decisión.

### 3.3 El camino sin trámite: autoverificación contra el REPS

**Esta es la parte que hace el módulo distinto de un formulario más.**

```
1. Ingresa código de habilitación de sede (12 dígitos) + NIT
2. PULSO busca ese código en `sede` (ya cargada del REPS)
   ├─ Existe y el nombre coincide (fuzzy > 0.85)  → verificacion='reps_automatico' → aprobada
   │     Y ADEMÁS: precarga sola dirección, coords, localidad, naturaleza,
   │     complejidad, servicios habilitados y camas del snapshot.
   │     El afiliado NO tipea nada de eso: lo CONFIRMA o lo CORRIGE.
   ├─ Existe pero el nombre no coincide            → en_verificacion (revisión humana)
   └─ No existe                                    → observada, con el motivo exacto
```

**Por qué importa:** el trámite de afiliación se elimina a sí mismo usando el mismo dato público que el resto del producto. Es la demostración más barata de la tesis del §0 — y ya tienes los 16.181 registros en el repo.

**Lo que sí requiere confirmación humana del afiliado** (porque el REPS no lo sabe o está viejo):
- Los canales de aviso (`sede_canal`) — y se verifican mandando un mensaje de prueba que hay que confirmar.
- El estado operativo inicial.
- La capacidad real, si quiere superar el snapshot 2022.
- Quién es el jefe de urgencias de cada turno.

### 3.4 Pantallas

**`/afiliacion` (pública)** — 4 pasos, un dato por pantalla:
1. Tipo de organización → IPS u operador de ambulancias.
2. Código de habilitación + NIT → **autoverificación en vivo**; si cruza, muestra el nombre de la sede que encontró en el REPS. Ese momento vende el producto.
3. Confirmar/corregir lo precargado.
4. Crear el `admin_organizacion` (correo + contraseña) → queda `activa`.

**`/panel` (post-login, según rol)** — la consola de administración:
- `admin_organizacion`: sedes, móviles, canales, equipo e invitaciones.
- `jefe_urgencias`: **estado operativo + capacidad, en dos toques.** Es la pantalla que más se va a usar y tiene que funcionar en un celular a las 3 a.m.
- `admin_plataforma`: cola de afiliaciones en verificación.

---

## 4. CRUD con roles — la tabla completa

Convención: rutas en español, `contracts/types.ts` es ley, campos nuevos opcionales. **Todo lo clínico es append-only; solo el catálogo administrativo se edita.**

| Entidad | Ruta | C | R | U | D | Notas |
|---|---|---|---|---|---|---|
| Organización | `/organizaciones` | público (afiliación) | admin_org (suya), admin_plataforma, auditor | admin_org, admin_plataforma | ❌ **nunca** | `D` es `estado='retirada'`, no `DELETE` |
| Sede vinculada | `/organizaciones/:id/sedes` | admin_org | admin_org, CRUE, auditor | admin_org | soft (`activa=false`) | Verificación contra REPS obligatoria |
| Actor | `/organizaciones/:id/actores` | admin_org (por invitación) | admin_org, el propio actor | admin_org, el propio (su perfil) | soft (`activo=false`) | Nunca se borra: aparece en auditoría |
| Rol | `/actores/:id/roles` | admin_org (de su org), admin_plataforma | admin_org, auditor | — | sí (revocar) | Cada otorgamiento y revocación → `evento_caso` |
| Invitación | `/organizaciones/:id/invitaciones` | admin_org | admin_org | — | sí (revocar) | Token hasheado, expira en 72h |
| **Estado de sede** | `/sedes/:codigo/estado` | jefe_urgencias, admin_org | **todos los autenticados** | jefe_urgencias | — | **Caduca solo** (`vence_en`) |
| **Capacidad** | `/sedes/:codigo/capacidad` | jefe_urgencias | todos los autenticados | ❌ append-only | ❌ | Una corrección es una declaración nueva |
| Canal de aviso | `/sedes/:codigo/canales` | admin_org, jefe_urgencias | admin_org | admin_org | soft | Se verifica con mensaje de prueba |
| Móvil | `/organizaciones/:id/moviles` | admin_org | admin_org, CRUE, su paramédico | admin_org | soft | `tipo` TAB/TAM **no** lo edita el paramédico |
| Estado de móvil | `/moviles/:id/estado` | paramédico (el suyo) | CRUE, su org | paramédico | — | Posición en vivo (§6.3) |
| Caso | `/triage` (existe) | paramédico, `svc:voz` | dueño + sede destinataria + CRUE | ❌ | ❌ | Corregir = caso nuevo enlazado |
| Handshake | `/dispatch`, `/handshake/respond` (existen) | paramédico | dueño + sede + CRUE | solo transición legal | ❌ | Ya idempotente |
| Evento de caso | `/casos/:id/eventos` | quien tenga alcance sobre el caso | ídem + auditor | ❌ **append-only** | ❌ | Trigger lo impide |
| Recepción | `/casos/:id/recepcion` | sistema (al aceptar) | sede destinataria, CRUE | jefe_urgencias (checklist) | ❌ | §5 |
| Trámite | `/casos/:id/tramites` | sistema / IA | según tipo y alcance | mientras `estado != 'completado'` | ❌ | §7 |
| Motivo de rechazo | `/catalogos/motivos-rechazo` | admin_plataforma | todos | versionado | ❌ | Enum controlado (spec §7.4) |

**Reglas transversales del CRUD:**
- **Idempotencia obligatoria** en toda mutación (spec §0). La tabla `pulso_routing_idempotency` ya existe: se generaliza a un header `Idempotency-Key`.
- **Borrado = estado, nunca `DELETE`.** El único `DELETE` real del sistema es el purgado por retención (§7.5).
- **Todo `U` sobre datos de sede escribe `evento_caso`** con actor y valor anterior.
- **`GET` de auditor también se registra.** Quien mira datos clínicos deja rastro.

---

## 5. Recepción asistida: que el hospital sepa qué le llega y esté listo

Hoy el hospital aprieta "Aceptar" y **no vuelve a saber nada** hasta que la camilla cruza la puerta. Ese hueco es donde se pierde la mitad de la hora dorada ganada en el ruteo.

### 5.1 Qué pasa en el instante del "Aceptar"

```
POST /handshake/respond {decision:'aceptado'}
   │
   ├─→ 1. Se crea `recepcion`                                    [determinista]
   ├─→ 2. Se resuelve el PROTOCOLO por diagnóstico               [tabla, NO IA]
   ├─→ 3. Se genera el SBAR de prearribo                         [IA]
   ├─→ 4. Se arma el CHECKLIST del protocolo                     [tabla + IA para el orden]
   ├─→ 5. Se arranca el RELOJ de ventana clínica                 [determinista]
   ├─→ 6. Se abren los TRÁMITES que aplican (§7)                 [determinista + IA]
   └─→ 7. Se empieza a transmitir ETA en vivo                    [determinista]
```

**Qué es IA de verdad y qué no** — esta distinción es la que hace creíble el pitch:

| Pieza | Motor | Por qué |
|---|---|---|
| Protocolo por diagnóstico | **Tabla versionada**, no LLM | Spec §7.2: *"el LLM propone, la tabla decide"*. Un LLM que elige "código infarto" mal activa una sala de hemodinamia por nada. |
| Checklist del protocolo | Tabla + LLM solo para ordenar y redactar | El contenido es clínico y fijo; la redacción se adapta al caso. |
| **SBAR de prearribo** | **LLM** | Sí es IA legítima: convertir dictado desordenado en el formato de entrega estándar (Situación · Antecedente · Evaluación · Recomendación). |
| ETA vivo | Mapbox + posición del móvil | Determinista. |
| Detección de demora | Reloj (`VigilanteService`, ya existe) | Determinista. |
| Reconciliación de llegada | LLM con confirmación humana | Verifica que el paciente que llegó es el caso aceptado. |

### 5.2 El paquete de prearribo

Lo que ve la sede destinataria en `/hospital`, desde el "Aceptar" hasta la entrega:

```
┌──────────────────────────────────────────────────────┐
│  🔴 CÓDIGO INFARTO — llega en 07:12                  │
│  AMB-014 · TAM · Dr. ███ · a 4,2 km                  │
├──────────────────────────────────────────────────────┤
│  S  Masculino 54a, dolor precordial 40 min           │
│  B  Antecedente de fibrilación auricular             │
│  A  Supradesnivel ST en cara inferior · TA 170/95    │
│  R  Hemodinamia (743) + UCI adultos (110)            │
├──────────────────────────────────────────────────────┤
│  ⏱  Door-to-balloon: 90 min · quedan 82              │
├──────────────────────────────────────────────────────┤
│  PREPARACIÓN                    [ Confirmar listo ]  │
│  ☑ Sala de hemodinamia          confirmó Enf. jefe   │
│  ☐ Hemodinamista de turno       sin confirmar 3 min  │
│  ☑ Camilla en reanimación                            │
│  ☐ Banco de sangre notificado                        │
├──────────────────────────────────────────────────────┤
│  TRÁMITES                                            │
│  ✓ Derechos verificados · Régimen contributivo       │
│  ✓ Referencia generada (Res. 3047/2008, anexo 3)     │
│  ✓ Admisión precargada — 0 campos por tipear         │
│  ⏳ Historia clínica: apertura al ingreso            │
└──────────────────────────────────────────────────────┘
```

**El renglón que gana el pitch es el penúltimo: `0 campos por tipear`.**

### 5.3 Los tres relojes

1. **ETA vivo** — posición del móvil (`movil_estado.geom`) → Mapbox → cuenta regresiva. Si no hay posición, cae al ETA del despacho marcado como estimado (misma honestidad de `/capacidades`).
2. **Ventana clínica** — no es el ETA, es la ventana de la patología: door-to-balloon 90 min en IAM, door-to-needle 60 min en ACV trombolizable. **Cuenta desde el primer contacto médico, no desde la llegada.** Esto es lo que un jefe de urgencias mira de verdad.
3. **Preparación** — si a `T-5 min` el checklist no está confirmado, se avisa al jefe de urgencias y **se marca en el evento**. No se le quita el caso a nadie: se registra que la preparación no se confirmó, y ese dato entra al historial de la sede igual que un rechazo.

### 5.4 La entrega sin volver a tipear

El momento más caro del trámite actual: el paciente llega y **en la puerta se vuelve a hacer todo** — triage otra vez, datos otra vez, historia desde cero.

```
Ambulancia          →  QR/código de 6 dígitos en pantalla de /campo
Puerta de urgencias →  el hospital lo escanea o lo tipea
                    →  POST /casos/:id/entrega
                    →  llega el expediente completo: SBAR, signos, evento
                       de traslado, trámites, decisión de ruteo con evidencia
                    →  evento `entrega` + `tramite:entrega_paciente` completado
```

Con eso, **el triage de puerta deja de repetirse**: llega hecho, con hora, autor y nivel, y el hospital lo confirma o lo corrige (una corrección es un evento nuevo, no una edición).

---

## 6. Tiempo real

**Decisión: Supabase Realtime cuando hay DB, SSE desde core cuando no, polling como último piso.** El repo ya eligió polling a 2s a propósito (`estado.service.ts`) y funciona; esto lo mejora sin romperlo.

| Canal | Qué propaga | A quién |
|---|---|---|
| `sede:{codigo}` | Solicitudes nuevas, cambios de estado y capacidad, checklist | Jefe de urgencias de esa sede |
| `caso:{id}` | Handshake, ETA, eventos, trámites | Paramédico dueño + sede destinataria + CRUE |
| `red:bogota` | Congestión, escalamientos, cobertura de móviles | CRUE |
| `org:{id}` | Afiliación, altas/bajas de actores y móviles | Admin de esa organización |

**Reglas:**
- El canal **filtra por alcance en el servidor**, nunca en el cliente. Un jefe de urgencias suscrito a `red:bogota` es una fuga de datos clínicos.
- Se degrada solo: si Realtime no conecta, el hook cae a polling y **la UI lo dice** (misma filosofía de `Capacidades`).
- `capacidad_declarada` y `sede_estado` publican en cuanto se escriben: es lo que hace que "en tiempo real" sea verdad y no una promesa de landing.

---

## 7. Los trámites, uno por uno

> ⚠️ **Antes del pitch, un abogado o alguien de la Secretaría de Salud debe validar esta tabla.**
> Las normas que el repo ya cita están verificadas dentro del proyecto (Ley 1751/2015, Decreto 4747/2007,
> Res. 3047/2008, Res. 5596/2015, Res. 3100/2019, Res. 1220/2010, Ley 2015/2020, Ley 1581/2012).
> Las de facturación (RIPS, FURIPS) están marcadas **[verificar número]**: la norma existe, el número exacto
> hay que confirmarlo. Citar mal una resolución frente a un jurado de salud cuesta más que no citarla.

### 7.1 Inventario y qué hace PULSO con cada uno

| # | Trámite | Cómo es hoy | Qué hace PULSO | Ahorro |
|---|---|---|---|---|
| 1 | **Verificación de derechos** (afiliación, BDUA/ADRES) | Llamada o consulta manual en la puerta | Se consulta **en paralelo** al ruteo, con el token seudónimo. Resultado en el paquete de prearribo | Sale de la ruta crítica |
| 2 | **Autorización de servicios** (Decreto 4747/2007) | La piden aunque no aplique | **No aplica en urgencias** (Ley 1751/2015 art. 14). PULSO lo marca `omitido_por_urgencia` **con base legal citada** | Elimina la discusión |
| 3 | **Referencia** (Res. 3047/2008, anexo técnico 3) | Formato en papel/PDF, fax o WhatsApp | Se genera **solo** desde el caso estructurado. No hay nada que tipear | Minutos → 0 |
| 4 | **Búsqueda de receptor** | Llamar hospital por hospital | **Es el producto.** Ranking + handshake | El "paseo de la muerte" |
| 5 | **Aceptación del receptor** | Verbal, sin registro | Un toque, con timestamp, actor y motivo controlado | Prueba de quién dijo qué |
| 6 | **Aviso al CRUE** (Res. 1220/2010) | Radio, sin registro | Automático al escalar; el CRUE ve el tablero | Deja rastro |
| 7 | **Registro de atención prehospitalaria** | A mano, en movimiento | `evento_caso` + SBAR generado; se firma al cerrar | Se llena solo |
| 8 | **Admisión hospitalaria** | Se tipea todo en la puerta | Precargada desde el prearribo; se **confirma** | El renglón "0 campos" |
| 9 | **Triage de puerta** (Res. 5596/2015) | Se repite el que ya hizo el paramédico | Llega hecho, con autor y hora; el hospital confirma o corrige | Se hace una vez |
| 10 | **Entrega de paciente** | Verbal + hoja | QR/código → expediente completo (§5.4) | Sin transcripción |
| 11 | **Apertura de historia clínica** (Ley 2015/2020) | Desde cero | Puerto `ProveedorHistoriaClinica` **sin implementar** — se declara, no se finge | Fase 2 |
| 12 | **Contrarreferencia** | Rara vez ocurre | Evento `contrarreferencia` con resumen generado al cierre | Cierra el ciclo |
| 13 | **FURIPS** (accidente de tránsito, SOAT/ADRES) **[verificar número]** | Se reconstruye días después | Se **pre-llena** con lo capturado en la escena, que es cuando existe el dato | Recupera plata que hoy se pierde |
| 14 | **RIPS** **[verificar número]** | Se arma al facturar | Se pre-llena con Dx CIE-10 y servicios ya estructurados | Menos glosa |
| 15 | **Notificación SIVIGILA** (eventos de interés en salud pública) | Manual, tarde | Se detecta por CIE-10 y se marca; **notifica un humano, no el sistema** | Menos subregistro |

### 7.2 La regla que evita el desastre

> **PULSO genera, pre-llena y propone. Un humano firma. Nunca al revés.**

Ningún trámite con efecto legal o financiero se envía solo. El sistema deja el formulario listo con `generado_por: 'ia'` y el humano confirma con su actor. Un FURIPS mal presentado automáticamente no es eficiencia: es un problema jurídico para el hospital que confió.

Es la misma postura que ya tiene el repo con el ruteo (*"PULSO propone, el CRUE regula"*), aplicada a lo administrativo.

### 7.3 Qué se elimina de verdad, y qué solo se mueve

Hay que decirlo con precisión, porque el jurado lo va a preguntar:

- **Se elimina** (deja de existir): la búsqueda telefónica de receptor, la retranscripción en la puerta, el triage repetido, la autorización previa que nunca debió pedirse.
- **Se paraleliza** (existe, pero fuera de la ruta crítica): verificación de derechos, referencia, admisión.
- **Se pre-llena** (sigue existiendo y lo firma un humano): FURIPS, RIPS, contrarreferencia, notificación epidemiológica.
- **No se toca**: la historia clínica del paciente. PULSO no es un sistema de historia clínica.

### 7.4 Base legal por transmisión

Cada `tramite` y cada `evento_caso` que mueva datos clínicos guarda `base_legal` (spec §9.1, §9.5). En urgencias es la excepción de consentimiento: se opera sin autorización previa **y queda constancia de que se operó bajo esa excepción**. Sin ese campo, el sistema es indefendible ante Habeas Data (Ley 1581/2012).

### 7.5 Retención

`caso.texto_crudo`, `origen` y `paciente_token` se purgan al cierre + ventana legal. Lo que sobrevive es lo disociado: decisión de ruteo, aceptación/rechazo con motivo, tiempos. **Ese residuo es el activo del producto** (spec §9.4) y no tiene PII adentro.

---

## 8. Ejecución

### Orden y dependencias

```
F0 persistencia (caso+handshake a Supabase)   ← sin esto nada de abajo existe
 └─ F1 identidad, organizaciones y roles       ← desbloquea todo
     ├─ F2 afiliación (autoverificación REPS)
     │   └─ F3 CRUD de sede viva (estado + capacidad + canales)
     │       └─ F5 recepción asistida ──→ F6 trámites
     └─ F4 móviles y flota
```

### Fases

| Fase | Entregable | Carril | Prerrequisito |
|---|---|---|---|
| **F0** | `caso` y `handshake` en Supabase (tablas ya existen en `0001`) | Zaid | — |
| **F1** | `organizacion`/`actor`/`actor_rol` + `RolGuard` + token de servicio para `voz` | Zaid + Sebas | F0 |
| **F2** | `/afiliacion` con autoverificación contra REPS + `/panel` | Juan (UI) + Zaid (API) | F1 |
| **F3** | `sede_estado`, `capacidad_declarada`, `sede_canal` + filtro duro por estado operativo | Zaid | F2 |
| **F4** | `movil` + `movil_estado` + posición en vivo; `tipoMovil` deja de declararse solo | Zaid + Juan | F1 |
| **F5** | `recepcion`: SBAR, protocolo, checklist, tres relojes, entrega por QR | Neid + Sebas | F3 |
| **F6** | `tramite`: los 15 del §7.1, empezando por 1-5 y 8-10 | Sebas + Neid | F5 |
| **F7** | Tiempo real por canales con alcance | Zaid + Juan | F3 |

### Lo mínimo que hace verdadera la promesa

Si el tiempo alcanza para **una sola cosa** de este documento, que sea esta cadena:

> **F1 (identidad) → F3 (capacidad declarada) → F5 (paquete de prearribo con el renglón "0 campos por tipear").**

Es la línea recta entre "rutear mejor" y "eliminar el trámite", y se puede demostrar en 40 segundos de pitch.

---

## 9. Decisiones que hay que tomar

Ninguna la puede tomar un carril solo:

1. **¿La afiliación es abierta o por invitación?** Abierta demuestra el producto; por invitación es lo que una secretaría de salud aceptaría. Recomendación: **abierta con autoverificación REPS**, que es abierta *y* verificada.
2. **¿Qué pasa con una sede afiliada que declara capacidad falsa?** Hoy nada. Propuesta: contrastar lo declarado contra su tasa de rechazo; si diverge, se marca y el CRUE lo ve. **No** suspender automáticamente.
3. **¿La verificación de derechos (BDUA/ADRES) se integra o se declara?** Sin convenio no hay API. Recomendación para el hackathon: **puerto declarado con mock honesto**, igual que el puerto de historia clínica.
4. **¿Quién firma los trámites pre-llenados?** Define si `jefe_urgencias` basta o hace falta un rol `facturacion`. Afecta la matriz del §2.
5. **Aceptación única — ⚠️ corregida en §11.5.** El guard existe, es correcto y **nadie lo llama**: `RoutingService.respond()` es código muerto y `POST /handshake/respond` no lo usa. Lo que hoy tapa el hueco es que el fan-out es secuencial. **Arreglo de ~10 líneas, la mejor relación valor/esfuerzo del documento.**
6. **¿`evaluateEligibility()` se conecta?** Sí, pero **sin `NO_AVAILABLE_BED`** hasta que `capacidad_vigente` tenga datos reales. Filtrar camas contra el snapshot 2022-11-30 descarta hospitales que hoy sí reciben.

---

## Anexo A — Endpoints nuevos

```ts
// ── Afiliación (público hasta crear el admin) ─────────────────
POST   /afiliacion/verificar        → { tipo, codigoHabilitacion?, nit }
                                    ← { encontrada: boolean, sede?: Sede, precarga?: object }
POST   /afiliacion                  → { tipo, nit, razonSocial, sedes[], admin{...} }
                                    ← { organizacion: Organizacion, token }
GET    /afiliacion/:id/estado       ← { estado, observaciones[] }

// ── Organización (admin_organizacion) ─────────────────────────
GET    PATCH  /organizaciones/:id
GET    POST   /organizaciones/:id/sedes
GET    POST   /organizaciones/:id/moviles
GET    POST   /organizaciones/:id/invitaciones
POST          /invitaciones/:token/aceptar        // público con token
GET    POST   /organizaciones/:id/actores
POST   DELETE /actores/:id/roles

// ── Sede viva (jefe_urgencias) ────────────────────────────────
GET    PUT    /sedes/:codigo/estado               // PUT reemplaza; caduca solo
GET    POST   /sedes/:codigo/capacidad            // POST = nueva declaración
GET    POST   /sedes/:codigo/canales
POST          /sedes/:codigo/canales/:id/probar   // manda mensaje de prueba

// ── Móvil (paramedico / admin_organizacion) ───────────────────
GET    PATCH  /moviles/:id
PUT           /moviles/:id/estado                 // posición + disponibilidad

// ── Caso, recepción y trámites ────────────────────────────────
GET           /casos/:id/eventos
POST          /casos/:id/eventos                  // llegada_escena, entrega, demora...
GET           /casos/:id/reporte                  // la línea de tiempo completa
GET           /casos/:id/recepcion
PATCH         /casos/:id/recepcion/checklist
POST          /casos/:id/entrega                  // el QR de la puerta
GET    POST   /casos/:id/tramites
POST          /casos/:id/tramites/:tipo/firmar    // el humano que firma

// ── Catálogos (admin_plataforma) ──────────────────────────────
GET    POST   /catalogos/motivos-rechazo
GET    POST   /catalogos/protocolos               // codigo_infarto, codigo_acv...
```

## Anexo B — Tipos nuevos para `contracts/types.ts`

Todos los campos agregados a tipos existentes van **opcionales**, según la regla del contrato.

```ts
export type TipoOrganizacion = 'ips' | 'operador_ambulancia' | 'crue' | 'entidad_pagadora';
export type EstadoAfiliacion =
  | 'borrador' | 'enviada' | 'en_verificacion' | 'observada'
  | 'aprobada' | 'activa' | 'suspendida' | 'retirada';
export type Rol =
  | 'paramedico' | 'jefe_urgencias' | 'admin_organizacion'
  | 'regulador_crue' | 'auditor' | 'admin_plataforma' | 'servicio';
export type EstadoOperativo = 'recibiendo' | 'saturado' | 'contingencia' | 'cerrado';
export type TipoTramite =
  | 'verificacion_derechos' | 'referencia' | 'aceptacion' | 'admision'
  | 'entrega_paciente' | 'contrarreferencia' | 'furips' | 'rips' | 'notificacion_sivigila';

export interface Organizacion {
  id: string; tipo: TipoOrganizacion; razonSocial: string; nit: string;
  estado: EstadoAfiliacion; verificacion: 'reps_automatico' | 'manual' | 'pendiente';
  sedes: string[]; creadaEn: string;
}
export interface Actor {
  id: string; organizacionId: string; nombre: string;
  roles: Rol[]; sedes: string[]; tipo: 'humano' | 'servicio';
}
export interface SedeEstado {
  codigoSede: string; operativo: EstadoOperativo; motivo: string | null;
  declaradoEn: string; venceEn: string;
}
export interface CapacidadDeclarada {
  codigoSede: string; tipo: string; disponibles: number; total?: number;
  declaradoEn: string; antiguedadMin: number;
}
export interface Recepcion {
  casoId: string; codigoSede: string;
  sbar: { situacion: string; antecedente: string; evaluacion: string; recomendacion: string } | null;
  protocolo: string | null;
  checklist: { item: string; responsable: string; confirmado: boolean; confirmadoEn: string | null }[];
  ventanaClinicaMin: number | null;
  etaMinActual: number | null; llegadaEstimada: string | null;
  preparadaEn: string | null; entregadoEn: string | null;
}
export interface Tramite {
  id: string; casoId: string; tipo: TipoTramite;
  estado: 'no_aplica' | 'pendiente' | 'en_proceso' | 'completado' | 'fallido' | 'omitido_por_urgencia';
  baseLegal: string | null; generadoPor: 'automatico' | 'ia' | 'humano';
  completadoEn: string | null;
}

// Añadidos OPCIONALES a tipos que ya existen:
//   Caso     → organizacionId?, movilId?, creadoPor?, pacienteToken?
//   Sede     → estado?: SedeEstado, capacidadVigente?: CapacidadDeclarada[]
//   Candidato→ motivoDescarte ya existe; se le suma el estado operativo como causa
```

---

# Parte II — Multitenancy, eventos y completitud del registro

> Agregado tras la revisión del `RoutingStore`. **Corrige la decisión 9.5**: el guard de aceptación
> única sí existe y está bien escrito — lo que pasa es que **nadie lo llama**. Detalle en §11.5.

---

## 10. Multitenancy

### 10.1 PULSO no es multi-tenant clásico, y confundirlo cuesta caro

El SaaS típico aísla inquilinos en silos: los datos de la empresa A jamás tocan a la B. **Aquí no se puede, porque un caso cruza tres inquilinos por diseño:**

```
   AMB-014  (operador de ambulancias)   ── crea el caso, es el DUEÑO
       │
       ├─→ Hospital San Carlos (IPS)     ── recibe la solicitud, ve lo clínico mínimo
       ├─→ Clínica del Norte (IPS)       ── la vio, rechazó, y NO debe seguir viéndola
       └─→ CRUE Bogotá                   ── ve todo, por mandato legal (Res. 1220/2010)
```

Entonces el modelo correcto no es aislamiento: es **propiedad + concesiones explícitas y revocables**. Un silo puro rompería el producto; un espacio compartido sin reglas es una fuga de datos clínicos.

> **La regla:** el inquilino es la `organizacion`. Todo dato tiene un dueño. El acceso de un tercero
> es un **permiso concedido, con motivo y con vencimiento** — nunca un efecto lateral de estar logueado.

### 10.2 De quién es cada cosa

| Recurso | Dueño (inquilino) | Quién más lo ve | Por qué |
|---|---|---|---|
| `organizacion`, `actor`, `actor_rol`, `invitacion` | Ella misma | `admin_plataforma`, `auditor` | Nadie ve el equipo de otro |
| `movil`, `movil_estado` | Operador de ambulancias | CRUE (cobertura de ciudad) | Res. 1220/2010 |
| `sede_estado`, `capacidad_declarada`, `sede_canal` | La IPS dueña de la sede | **Todos los autenticados, solo lectura** | Es el dato que hace posible el ruteo. Ocultarlo mata el producto |
| `caso`, `evento_caso`, `tramite` | Operador que lo creó | Sede destinataria **mientras** tenga concesión + CRUE | §10.3 |
| `handshake` | Compartido: operador + sede | CRUE | Es la conversación entre dos inquilinos |
| `recepcion` | La IPS destinataria | Operador dueño del caso (ve el checklist, no quién lo confirmó) | El paramédico necesita saber si lo están esperando |
| `sede`, `servicio_sede`, `motivo_rechazo`, protocolos, curva de demanda | **Nadie. Son globales** | Todos | Datos públicos del Estado + catálogos versionados |

**El renglón que más se discute es el tercero.** Un hospital podría querer ocultar que está saturado. Pero una sede que oculta su estado y luego rechaza produce exactamente el paseo de la muerte que PULSO existe para eliminar. **La declaración es el precio de estar afiliado**, y conviene que esté escrito en los términos de afiliación (§3), no descubierto después.

### 10.3 La concesión de acceso cruzado

```sql
create table caso_acceso (
  id              bigint generated always as identity primary key,
  caso_id         uuid not null references caso(id),
  organizacion_id uuid not null references organizacion(id),
  motivo          text not null check (motivo in (
                    'propietario','destinataria','consultada','regulador','auditoria')),
  -- 'consultada' = se le preguntó y aún no responde.
  -- 'destinataria' = aceptó. Es la única que conserva acceso tras el cierre.
  otorgado_en     timestamptz not null default now(),
  revocado_en     timestamptz,
  revocado_motivo text,
  unique (caso_id, organizacion_id, motivo)
);
create index on caso_acceso (caso_id) where revocado_en is null;
```

**Ciclo de vida de la concesión:**

| Momento | Efecto |
|---|---|
| `POST /triage` | El operador queda `propietario`. Permanente. |
| `POST /dispatch` | La sede queda `consultada`. **Ve el mínimo clínico, no el dictado crudo ni el origen.** |
| Acepta | `consultada` → `destinataria`. Gana el paquete de prearribo completo (§5.2). |
| Rechaza o vence | **`revocado_en = now()`.** Deja de ver el caso vivo. Conserva su propio `handshake` como constancia de lo que respondió. |
| Escalamiento | El CRUE entra como `regulador`. Se registra, porque un acceso legal también es un acceso. |
| Cierre + retención | Todo se revoca salvo `auditoria`, que lee el residuo disociado. |

**Que el rechazo revoque el acceso es la pieza no obvia y la más importante.** Sin eso, cada hospital al que se le preguntó conserva para siempre la ficha clínica de un paciente que nunca recibió. Eso no es una decisión de UI: es minimización de datos (spec §1.8, Ley 1581/2012).

### 10.4 Tres capas de aislamiento

El repo ya cree en esto — `0001_init.sql` habilita RLS *y además* revoca los grants por defecto ("cinturón sobre tirantes"). Se sigue la misma doctrina:

**Capa 1 — Guard HTTP.** `@Rol()` + `@AlcanceSede()` resuelven el actor del token y rechazan antes de tocar la DB.

**Capa 2 — Capa de consulta.** Ningún repositorio expone un `find()` sin alcance. La firma obliga:

```ts
// El alcance no es un parámetro opcional: es el primero, y no hay sobrecarga sin él.
buscarCasos(alcance: Alcance, filtro?: FiltroCasos): Promise<Caso[]>

type Alcance =
  | { tipo: 'organizacion'; organizacionId: string }
  | { tipo: 'sede'; codigos: string[] }
  | { tipo: 'red' }          // solo regulador_crue y auditor
```

**Capa 3 — RLS en Postgres.** La red de seguridad de verdad: si alguien olvida el alcance en la capa 2, la base no devuelve la fila.

```sql
-- core setea el actor en cada transacción:
--   set local pulso.organizacion_id = '<uuid>';
--   set local pulso.rol_red = 'true' | 'false';

alter table caso enable row level security;

create policy caso_alcance on caso for select using (
  -- 1. Soy el dueño
  organizacion_id = current_setting('pulso.organizacion_id', true)::uuid
  -- 2. O tengo una concesión vigente
  or exists (
    select 1 from caso_acceso a
     where a.caso_id = caso.id
       and a.organizacion_id = current_setting('pulso.organizacion_id', true)::uuid
       and a.revocado_en is null
  )
  -- 3. O soy el CRUE / auditor
  or current_setting('pulso.rol_red', true) = 'true'
);

-- Escritura: solo el dueño, y solo mientras el caso esté abierto.
create policy caso_escritura on caso for update using (
  organizacion_id = current_setting('pulso.organizacion_id', true)::uuid
);

-- Misma política, heredada, para evento_caso / tramite / recepcion vía caso_id.
```

> ⚠️ **`SUPABASE_SERVICE_ROLE_KEY` se salta RLS.** Es lo que usa `supabase.service.ts` hoy. Si core sigue
> hablando con la service role, la capa 3 no protege nada. **Para que RLS sirva, core debe usar una
> conexión con rol propio y setear `pulso.organizacion_id` por transacción.** Es la decisión técnica más
> importante de esta sección y hay que tomarla antes de escribir la primera policy.

### 10.5 Cómo se resuelve el inquilino

**Del token de sesión firmado. Nunca de un header, un subdominio ni un query param.**

```ts
// sesion.service.ts — la carga del token deja de ser {sub, exp}
interface Carga {
  actorId: string;
  organizacionId: string;   // ← el inquilino
  roles: Rol[];
  sedes: string[];          // alcance para jefe_urgencias
  exp: number;
}
```

Un `X-Organizacion-Id` que el cliente pueda escribir es una escalada de privilegios de una línea. Si alguien pide "poder cambiar de organización" (un jefe que cubre dos sedes), eso es **reemitir el token** tras verificar que tiene rol en ambas, no confiar en un header.

### 10.6 Los tres errores que hay que no cometer

1. **Filtrar en el cliente.** Traer todos los casos y esconder los ajenos en el front. La red ya los entregó.
2. **Suscribirse a un canal de tiempo real sin alcance en el servidor.** Un `sede:*` con comodín entrega datos clínicos de toda la red a quien se suscriba (§6).
3. **Usar la service role key "porque es más fácil".** Es cómoda hasta el día que una policy es lo único que separaba dos hospitales.

### 10.7 El dato agregado: de quién es la tasa de rechazo

Pregunta política, no técnica, y va a salir en el pitch: **¿un operador de ambulancias puede ver que el Hospital X rechaza el 40% de las veces?**

Recomendación:

| Consumidor | Qué ve | Por qué |
|---|---|---|
| Motor de scoring | `pAceptacion` como número dentro del costo en minutos | Sin esto no hay producto |
| Paramédico | El **orden** del ranking y el motivo del descarte. **No** el porcentaje | No le sirve y expone a la sede |
| Jefe de urgencias | Sus **propios** números | Es su dato |
| CRUE | Todos, con nombre | Es su función regular la red |
| Auditor | Todos, histórico | Su función |

**La sede es una entidad pública prestando un servicio público**, así que el agregado no es secreto comercial — pero exponerlo sin necesidad convierte a PULSO en un ranking de hospitales, y eso destruye la relación con las IPS de las que depende. Se guarda todo, se muestra a quien tiene función.

---

## 11. CRUD de eventos — auditoría de qué se escribe de verdad

### 11.1 El CRUD de un evento no es un CRUD

| Op | Permitido | Cómo |
|---|---|---|
| **C**reate | ✅ | `POST /casos/:id/eventos`. Idempotente. |
| **R**ead | ✅ con alcance | `GET /casos/:id/eventos` filtrado por `caso_acceso` (§10.3) |
| **U**pdate | ❌ **nunca** | Trigger lo rechaza. Corregir = evento nuevo con `corrige_a` |
| **D**elete | ❌ **nunca** | Ni `admin_plataforma`. Solo el purgado por retención toca `caso`, no `evento_caso` |

**Enmienda al DDL de D1** — dos columnas que faltaban:

```sql
alter table evento_caso add column corrige_a bigint references evento_caso(id);
-- Idempotencia: el paramédico toca "ya llegué" dos veces con mala señal.
alter table evento_caso add column clave_idempotencia text;
create unique index on evento_caso (caso_id, tipo, clave_idempotencia)
  where clave_idempotencia is not null;

-- Trigger append-only, calcado del de pulso_routing_decision_audit (0002).
create trigger evento_caso_append_only
before update or delete on evento_caso
for each row execute function pulso_reject_audit_mutation();
```

Una corrección se lee como lo que es: *"a las 22:14 se registró llegada a puerta; a las 22:19 el mismo actor la corrigió a 22:11"*. Eso es forense. Un `UPDATE` habría borrado el error, que es justo lo que un auditor necesita ver.

### 11.2 Los 22 eventos: quién los emite y cuáles se pierden hoy

| Evento | Lo emite | Desde | ¿Se guarda hoy? |
|---|---|---|---|
| `caso_creado` | `svc:voz` / paramédico | `triage.controller.ts` | ⚠️ Memoria (`AlmacenService`) |
| `revision_humana` | Paramédico | `RevisionRequerida.tsx` | ❌ **Se pierde**. La compuerta de baja confianza no deja rastro |
| `match_calculado` | Sistema | `routing.service.ts::match` | ✅ Solo con `PULSO_ROUTING_DATABASE_URL`; sin ella, memoria |
| `despachado` | Paramédico | `dispatch.service.ts` | ⚠️ Memoria |
| `aceptado` / `rechazado` | Jefe de urgencias | `handshake.service.ts` | ⚠️ Memoria. **El motivo es texto libre del front** (§11.4) |
| `timeout` | `VigilanteService` | `vigilante.service.ts` | ⚠️ Memoria |
| `rerouteado` | `VigilanteService` | `reRutear()` | ❌ **Se pierde**. El re-ruteo automático —la mejor demostración del producto— no queda registrado |
| `escalado` | Sistema / paramédico | `escalamiento.service.ts` | ⚠️ Memoria |
| `override_crue` | Regulador | `components/crue/bitacora.ts` | ❌ **`localStorage`**. Una decisión con potestad legal, guardada en el navegador |
| `llegada_escena` | Paramédico | `despachador.py::_confirmar_llegada` | ❌ **Se recibe y se tira** |
| `salida_escena` | Paramédico | — | ❌ No existe el concepto |
| `llegada_puerta` | Paramédico | `_confirmar_llegada(donde='hospital')` | ❌ Solo limpia la sesión |
| `entrega` | Ambos | — | ❌ No existe |
| `cerrado` | Sistema | — | ❌ No existe |
| `demora_reportada` | Paramédico | `despachador.py:132` | ❌ **`TODO`, solo log** |
| `demora_detectada` | `VigilanteService` | `detectarDemoras()` | ⚠️ Dispara llamada, no persiste |
| `prearribo_enviado` | Sistema | — | ❌ Fase F5 |
| `preparacion_confirmada` | Jefe de urgencias | — | ❌ Fase F5 |
| `derechos_verificados` | Sistema | — | ❌ Fase F6 |
| `tramite_generado` / `tramite_firmado` | Sistema / humano | — | ❌ Fase F6 |
| `contrarreferencia` | IPS | — | ❌ Fase F6 |
| `intento_cruzado` | Guard | — | ❌ Fase F1 (§2, invariante 1) |

**Cuenta:** de 22 eventos, **3 se guardan** (y uno solo con variable de entorno puesta), **6 viven en memoria** y **13 no existen o se descartan**.

### 11.3 Los cuatro que más duelen

1. **`rerouteado`** — es *el* momento del producto ("el hospital dijo que no y el sistema siguió solo") y no queda registrado en ninguna parte. Sin él no se puede probar en el pitch ni medir después.
2. **`override_crue` en `localStorage`** — una decisión que la ley le atribuye al regulador, guardada donde se borra al limpiar el navegador.
3. **`llegada_puerta` / `entrega`** — sin estos dos no hay tiempo de traslado real, no hay reporte (§1.3 de la parte I) y el "minutos ganados" del pitch se queda en el cronómetro de una pantalla.
4. **`revision_humana`** — la compuerta de confianza baja es el argumento de seguridad clínica del sistema, y no deja evidencia de que se ejerció.

### 11.4 El motivo de rechazo tiene que dejar de ser un string del front

Hoy los cuatro motivos son literales en `components/hospital/MotivosCapacidad.tsx` y viajan como texto libre a `handshake.motivoRechazo`. Consecuencias:

- El dataset de aceptación —**el activo del producto**— es incomparable en el tiempo: basta que alguien cambie una palabra en el `.tsx` para partir la serie.
- No se puede distinguir un rechazo por **capacidad** de uno **administrativo**, que es justo la distinción que sostiene la tesis del §0.

Se arregla con `motivo_rechazo` (§1, bloque D3) y el `motivo_codigo` en el handshake. **El texto se puede cambiar; el código, no.**

### 11.5 Corrección a la decisión 9.5 — la aceptación única

Lo que dije antes ("no hay guard") era impreciso. El estado real:

- ✅ **El guard existe y está bien hecho.** `RoutingStore.respond()` tiene idempotencia por `requestKey`, verifica `accepted_destination` y devuelve `PULSO_DESTINATION_ALREADY_ACCEPTED`. La versión Postgres usa `pg_advisory_xact_lock` + `select ... for update`: es correcta bajo concurrencia.
- ❌ **Nadie lo llama.** `RoutingService.respond()` no aparece en ningún sitio fuera de su propia definición. La ruta que acepta de verdad es `POST /handshake/respond` → `HandshakeService.procesarRespuesta`, que **solo mira el estado de *ese* handshake** (`h.estado !== 'enviado'`), no si otra sede ya aceptó el caso.
- 🩹 **Lo que hoy tapa el hueco es la política de fan-out secuencial**: como solo hay un handshake `enviado` a la vez, la carrera casi no ocurre. **El día que alguien active fan-out paralelo —que es la optimización obvia— el hueco se abre entero.**

> **El arreglo son ~10 líneas:** que `HandshakeService.procesarRespuesta` llame a `RoutingService.respond()`
> antes de escribir, y que devuelva `aplicada: false` con el código `PULSO_DESTINATION_ALREADY_ACCEPTED`
> cuando el guard lo rechace. Es la corrección de mejor relación valor/esfuerzo de todo el documento.

---

## 12. Qué se guarda en cada etapa — auditoría de completitud

La pregunta de fondo: **¿el sistema guarda por detrás todo lo que hace falta en cada etapa?** La respuesta corta es no, y esto es exactamente dónde.

Leyenda: ✅ persistido · ⚠️ en memoria (se pierde al reiniciar) · ❌ no se guarda

| # | Etapa | Qué DEBE quedar | Dónde | Hoy |
|---|---|---|---|---|
| 0 | **Afiliación** | Organización, sedes verificadas, actores, roles, quién aprobó | `organizacion`, `actor`, `actor_rol` | ❌ No existe |
| 1 | **Inicio de turno** | Móvil, tripulación, tipo TAB/TAM, actor que abre turno | `movil_estado` | ❌ `Unidad` es texto libre del navegador |
| 2 | **Incidente recibido** | Hora, canal (WhatsApp/consola/123), teléfono | `evento_caso:caso_creado` | ⚠️ `telefonoReporta` en memoria |
| 3 | **Llegada a escena** | Hora, posición | `evento_caso:llegada_escena` | ❌ Se recibe por WhatsApp y se descarta |
| 4 | **Dictado** | Texto crudo, audio, duración, origen | `caso.texto_crudo` | ⚠️ Memoria. **El audio nunca se guarda** |
| 5 | **Extracción IA** | Entidades, confianza, **motor** (claude/heurística), **versión del prompt**, latencia | `caso` + evidencia | ⚠️ Parcial: `motor` viaja en la respuesta y no se persiste; **la versión del prompt no se registra en ningún lado** |
| 6 | **Compuerta humana** | Que se mostró, qué corrigió el humano, quién | `evento_caso:revision_humana` | ❌ Nada |
| 7 | **Match** | Candidatos evaluados, descartados **con motivo**, desglose en minutos, versión de modelo y config, procedencia del ETA | `pulso_routing_decision_audit` | ✅ **solo si** `PULSO_ROUTING_DATABASE_URL` está puesta; si no, memoria |
| 8 | **Despacho** | Sede, canal, hora, ETA base, quién despachó | `handshake` | ⚠️ Memoria. **Sin actor**: la sesión es una contraseña compartida |
| 9 | **Respuesta** | Decisión, motivo **codificado**, latencia, quién respondió | `handshake` | ⚠️ Memoria · motivo texto libre · **sin actor** |
| 10 | **Re-ruteo** | Que ocurrió, desde qué sede, hacia cuál, por qué | `evento_caso:rerouteado` | ❌ Nada |
| 11 | **Escalamiento** | Motivo, sedes intentadas, quién lo tomó | `escalamiento` | ⚠️ Memoria |
| 12 | **Traslado** | Posición en el tiempo, demoras (reportadas y detectadas) | `movil_estado` + eventos | ❌ Sin posición · demoras solo en log |
| 13 | **Prearribo** | SBAR, protocolo, checklist, ventana clínica | `recepcion` | ❌ Fase F5 |
| 14 | **Llegada a puerta** | Hora real, ETA prometido vs. cumplido | `evento_caso:llegada_puerta` | ❌ Nada |
| 15 | **Entrega** | Quién entregó, quién recibió, hora, estado del paciente | `evento_caso:entrega` | ❌ No existe |
| 16 | **Cierre** | Cierre, contrarreferencia, trámites firmados | `tramite` | ❌ Fase F6 |
| 17 | **Post-cierre** | Purgado de PII, residuo disociado para el modelo | Política de retención | ❌ No existe |

### 12.1 Lo que hoy desaparece al reiniciar core

`AlmacenService` es un `Map`. Al reiniciar se pierden: **todos los casos, todos los handshakes, todos los escalamientos, el historial aceptados/rechazados por sede, la ventana de rechazos de 6h y las latencias de respuesta.**

Traducción: **el "dataset que se auto-etiqueta" —lo que el README llama el activo del producto— hoy vive en la RAM de un proceso.** Un `Ctrl+C` lo borra. Ese es el hallazgo más importante de esta sección y por eso F0 (persistencia) va antes que todo lo demás.

### 12.2 Los seis huecos, ordenados por lo que cuesta cada uno

1. **Nada persiste** (F0) — sin esto, ninguna otra fila de la tabla se puede arreglar.
2. **Ninguna acción tiene actor** (F1) — hay auditoría de la máquina, no de las personas. Con contraseña compartida, "quién aceptó" no tiene respuesta.
3. **La línea de tiempo del traslado no existe** (F4/F5) — sin etapas 3, 14 y 15 no hay reporte, ni métricas, ni el número del pitch.
4. **El re-ruteo y el override no dejan rastro** (§11.3) — los dos momentos más vendibles del producto son invisibles para la auditoría.
5. **La versión del prompt no se registra** — `pulso_routing_decision_audit` exige `modelVersion` y `configVersion` para el ruteo, pero la **extracción clínica** no versiona su prompt. Si el prompt cambia, no hay forma de saber con cuál se extrajo un caso viejo. Y el prompt está duplicado en Python y TypeScript, así que puede haber dos versiones distintas corriendo el mismo día.
6. **No hay política de retención** — hoy nada se purga porque nada se guarda. El día que F0 entre, el reloj legal de Habeas Data empieza a correr y §7.5 deja de ser teoría.

### 12.3 El arreglo transversal: un solo lugar por donde pasa todo

En vez de salpicar `insert` por doce servicios, un `RegistroService` con una sola firma:

```ts
// Un único punto de escritura. Idempotente, con actor, con alcance.
registrar(evento: {
  casoId: string;
  tipo: TipoEvento;
  actorId?: string;
  movilId?: string;
  codigoSede?: string;
  detalle?: Record<string, unknown>;
  claveIdempotencia?: string;
  corrigeA?: number;
}): Promise<EventoCaso>
```

Y **la regla que lo mantiene honesto**: toda transición de estado del caso o del handshake pasa por aquí. Si un servicio cambia estado sin registrar, es un bug — no una omisión. Se puede hacer cumplir con un test que recorra las transiciones de `routing/lifecycle.ts` y verifique que cada una tiene su evento.

