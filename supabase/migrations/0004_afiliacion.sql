-- ═══════════════════════════════════════════════════════════════
--  PULSO — 0004 · afiliación: organizaciones, actores y roles
--  Dueño: Juan · tareas 2.1 y 2.9
--  Correr en: Supabase → SQL Editor → pegar todo → Run
-- ═══════════════════════════════════════════════════════════════
--
-- QUÉ ES ESTE BLOQUE
--
--   El bloque B del modelo de datos de
--   `docs/pulso-plataforma-afiliacion-y-tramites.md` §1: quién puede estar en
--   el sistema. El bloque A (`sede`, `servicio_sede`, `capacidad_sede`, de
--   0001) es el universo del Estado y no se toca desde la app; esto es el
--   subconjunto que además ACEPTÓ operar en PULSO.
--
--   Mientras no haya Postgres configurado, `AfiliacionService` mantiene lo
--   mismo en un `Map` y verifica contra los catálogos compilados del repo
--   (84 sedes de urgencias, 225 operadores de transporte asistencial). Estas
--   tablas son a dónde se muda ese estado, con la misma forma.
--
-- POR QUÉ LA AFILIACIÓN NO ES UN BOOLEANO
--
--   Es una máquina de ocho estados porque `activa` es el permiso para que
--   llegue un paciente crítico. Entre "alguien llenó un formulario" y ese
--   permiso hay verificación, aprobación y un acto humano de activación, y
--   cada paso tiene que quedar escrito: la tabla `afiliacion_evento` de abajo
--   es ese expediente, y es append-only.

-- ── B1. Organización ───────────────────────────────────────────
--
-- `unique (tipo, nit)` es lo que hace idempotente el POST público de
-- afiliación: el formulario se reenvía solo con un doble clic, y sin esta
-- restricción cada clic sería una organización nueva pidiendo verificación.

create table if not exists organizacion (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ('ips','operador_ambulancia','crue','entidad_pagadora')),
  razon_social   text not null,
  nombre_corto   text,
  nit            text not null,
  estado         text not null default 'borrador'
                 check (estado in ('borrador','enviada','en_verificacion','observada',
                                   'aprobada','activa','suspendida','retirada')),
  -- 'reps_automatico' es el camino sin trámite: cruzó sola contra el REPS.
  verificacion   text check (verificacion in ('reps_automatico','manual','pendiente')),
  verificada_en  timestamptz,
  verificada_por uuid,                      -- FK a actor; se agrega más abajo
  creada_en      timestamptz default now(),
  actualizada_en timestamptz default now(),
  unique (tipo, nit)
);

comment on column organizacion.estado is
  'Máquina de estados de §3.2. SOLO "activa" es despachable: es el único '
  'estado en el que el ranking puede mandarle un paciente. La transición la '
  'valida la app (afiliacion/estados.ts), no un trigger — el mensaje de error '
  'tiene que decir a dónde SÍ se podía ir.';

-- La cola de `admin_plataforma` ("qué está esperando revisión") y el filtro
-- del ranking ("quién está activa") son las dos únicas consultas por estado, y
-- las dos son de conjunto pequeño sobre tabla que va a crecer.
create index if not exists organizacion_estado_idx on organizacion (estado);

-- ── B2. Sede afiliada — el puente con el REPS ──────────────────
--
-- La PK sigue siendo la del REPS: `codigo_habilitacion_sede`, 12 dígitos.
--
-- ⚠️ NO ES `codigoprestador`. Ese tiene 10 dígitos y una subred entera comparte
--    uno: usarlo colapsó nueve sedes distintas en un mismo código y ya costó un
--    bug. Está documentado en `data/CATALOGO.md`. La app rechaza un código de
--    10 dígitos con un motivo que explica la diferencia, en vez de buscarlo
--    "por si acaso".

create table if not exists organizacion_sede (
  organizacion_id uuid references organizacion(id) on delete cascade,
  codigo_sede     text references sede(codigo),
  -- true solo si el código existía en `sede` al momento de afiliar.
  verificada      boolean default false,
  activa          boolean default true,
  vinculada_en    timestamptz default now(),
  primary key (organizacion_id, codigo_sede)
);

create index if not exists organizacion_sede_codigo_idx
  on organizacion_sede (codigo_sede);

-- ── B3. Actor — una persona o un servicio ──────────────────────
--
-- No es "usuario final": el paciente nunca tiene cuenta. Un actor es quien
-- opera el sistema, y `tipo='servicio'` cubre a `voz` y a los webhooks.
--
-- La autenticación de verdad (login por actor, token con organización y rol)
-- es la tarea 1.3. Aquí solo se crea el PRIMER actor de una organización, con
-- rol `admin_organizacion`, y se guarda su contraseña ya hasheada — nunca en
-- claro, nunca reversible.

create table if not exists actor (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid references organizacion(id) on delete cascade,
  tipo            text not null check (tipo in ('humano','servicio')),
  nombre          text not null,
  identificador   text not null unique,     -- correo, o 'svc:voz'
  password_hash   text,                     -- null en servicios: usan token propio
  telefono        text,                     -- E.164, para WhatsApp
  registro_profesional text,
  activo          boolean default true,
  ultimo_acceso   timestamptz,
  creado_en       timestamptz default now()
);

comment on column actor.identificador is
  'Correo o id de servicio. ES PII: no sale en respuestas de la API (la lista '
  'blanca está en afiliacion/tipos.ts::ActorPublico) y no entra en logs.';

comment on column actor.activo is
  'Desactivar un actor es activo=false, NUNCA delete: sus decisiones tienen '
  'que seguir siendo atribuibles en la auditoría.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizacion_verificada_por_fk'
  ) then
    alter table organizacion add constraint organizacion_verificada_por_fk
      foreign key (verificada_por) references actor(id);
  end if;
end $$;

-- ── B4. Rol — qué puede hacer, y dónde ─────────────────────────
--
-- `codigo_sede` es el alcance: un jefe de urgencias puede estar atado a UNA
-- sede, y un mismo actor puede serlo de dos sedes sin que una fila pise a la
-- otra.

create table if not exists actor_rol (
  id           bigserial primary key,
  actor_id     uuid not null references actor(id) on delete cascade,
  rol          text not null check (rol in (
                 'paramedico','jefe_urgencias','admin_organizacion',
                 'regulador_crue','auditor','admin_plataforma','servicio')),
  -- NULL = el rol vale en toda la organización, sin atarse a una sede.
  codigo_sede  text references sede(codigo),
  otorgado_por uuid references actor(id),
  otorgado_en  timestamptz default now()
);

-- ⚠️ POR QUÉ ESTO ES UN ÍNDICE Y NO LA PK QUE DIBUJA EL DOCUMENTO
--    §1 del plan escribe `primary key (actor_id, rol, codigo_sede)`, y eso no
--    se puede: una columna de PK es NOT NULL, así que el rol SIN alcance de
--    sede — que es el caso normal de `admin_organizacion` — no entraría nunca.
--    Con `unique` a secas tampoco alcanza: Postgres considera distintos dos
--    NULL, y el mismo actor podría acumular el mismo rol global N veces. El
--    índice sobre `coalesce` es lo que hace cumplir "un rol, un alcance, una
--    vez".
create unique index if not exists actor_rol_unico
  on actor_rol (actor_id, rol, (coalesce(codigo_sede, '')));

-- ── B5. Evento de afiliación — el expediente, append-only ──────
--
-- Regla 4 de AGENTS.md: nadie edita ni borra. Una corrección es un evento
-- NUEVO. Aquí queda por qué una organización está donde está: qué dijo el
-- cruce automático, qué observó un humano y quién la activó.
--
-- No es `evento_caso` (tarea 3.1): eso es la línea de tiempo de un paciente.
-- Esto es la de una organización, y no tiene PII clínica ni de contacto —
-- `por` guarda el id del actor, jamás su correo.

create table if not exists afiliacion_evento (
  id              bigserial primary key,
  organizacion_id uuid not null references organizacion(id) on delete cascade,
  ts              timestamptz not null default now(),
  tipo            text not null check (tipo in ('transicion','verificacion','observacion')),
  estado_de       text,
  estado_a        text,
  motivo          text,
  mensaje         text not null,
  por             text not null,            -- 'sistema' o el id del actor
  constraint afiliacion_evento_transicion_completa
    check (tipo <> 'transicion' or (estado_de is not null and estado_a is not null))
);

create index if not exists afiliacion_evento_org_idx
  on afiliacion_evento (organizacion_id, ts);

-- Append-only en serio, y no de palabra.
--
-- Un `revoke update, delete` no alcanza: core habla con la service role key,
-- que se salta RLS, y el dueño de la tabla conserva todo pase lo que pase. El
-- trigger sí aplica a todo el mundo, incluido el dueño.
--
-- Si la retención (tarea 5.8) necesita purgar este expediente, tendrá que
-- quitar el trigger a propósito y en su propia migración. Ese es el punto:
-- borrar auditoría no puede ser algo que pase de paso.

create or replace function afiliacion_evento_solo_insert()
returns trigger language plpgsql as $$
begin
  raise exception
    'afiliacion_evento es append-only: % no está permitido. Una corrección es un evento nuevo.',
    tg_op;
end $$;

drop trigger if exists afiliacion_evento_append_only on afiliacion_evento;
create trigger afiliacion_evento_append_only
  before update or delete on afiliacion_evento
  for each row execute function afiliacion_evento_solo_insert();

comment on table afiliacion_evento is
  'Auditoría de la afiliación. APPEND-ONLY: solo insert. Corregir es escribir '
  'otro evento, nunca editar el anterior.';

-- ── RLS ────────────────────────────────────────────────────────
--
-- Misma regla que 0001 y 0003: en Supabase, una tabla de `public` SIN rls
-- queda abierta a lectura Y escritura por PostgREST para el rol `anon`, y la
-- llave anon viaja en el bundle del navegador. core habla con la service role
-- key (o por conexión directa) y se salta RLS: cerrar aquí no le quita nada al
-- servicio y le quita todo a un desconocido.
--
-- Sin policy no hay puerta. Ninguna de estas cinco tablas tiene lectura
-- pública: `actor.identificador` es un correo, y saber qué organizaciones
-- están afiliadas y en qué estado es inteligencia competitiva, no dato abierto
-- — a diferencia de `sede`, que sí es el REPS público.

alter table organizacion       enable row level security;
alter table organizacion_sede  enable row level security;
alter table actor              enable row level security;
alter table actor_rol          enable row level security;
alter table afiliacion_evento  enable row level security;

revoke all on table organizacion      from anon, authenticated;
revoke all on table organizacion_sede from anon, authenticated;
revoke all on table actor             from anon, authenticated;
revoke all on table actor_rol         from anon, authenticated;
revoke all on table afiliacion_evento from anon, authenticated;

-- ── DOWN ───────────────────────────────────────────────────────
--
-- Comentado a propósito: `EsquemaService` ejecuta el archivo COMPLETO en una
-- transacción, así que un `drop` vivo aquí borraría lo que se acaba de crear.
-- Para revertir, copiar este bloque al SQL Editor y correrlo a mano.
--
-- ⚠️ Esto BORRA el expediente de afiliación, que es auditoría. Antes de
--    correrlo en cualquier cosa que no sea un entorno de desarrollo hay que
--    exportar `afiliacion_evento` — la regla append-only no se cumple sola si
--    el rollback se lleva la tabla por delante.
--
--   drop trigger if exists afiliacion_evento_append_only on afiliacion_evento;
--   drop function if exists afiliacion_evento_solo_insert();
--   drop table if exists afiliacion_evento;
--   drop table if exists actor_rol;
--   alter table organizacion drop constraint if exists organizacion_verificada_por_fk;
--   drop table if exists actor;
--   drop table if exists organizacion_sede;
--   drop table if exists organizacion;
