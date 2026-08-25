-- ═══════════════════════════════════════════════════════════════
--  PULSO — 0006 · afiliación, organizaciones e identidad
--  Dueño: Juan · tareas 2.1, 2.5 y 2.9
--  Correr en: Supabase → SQL Editor → pegar todo → Run
-- ═══════════════════════════════════════════════════════════════
--
-- ⚠️ SE PISA CON LA TAREA 1.1 (Zaid, «migración de identidad»).
--
--    Este archivo crea `organizacion`, `organizacion_sede`, `actor`,
--    `actor_rol` e `invitacion` — que es exactamente el bloque B de
--    `docs/pulso-plataforma-afiliacion-y-tramites.md` §1, declarado como
--    dominio de 1.1. Se escribe aquí porque 1.1 no existe todavía y 2.1
--    depende de esas tablas.
--
--    QUÉ HACER AL MERGEAR: si 1.1 aterriza primero, este archivo se BORRA y
--    lo único que sobrevive es `invitacion` (que 1.1 no declara) más los
--    índices trigram del final. Si aterriza este primero, 1.1 se reduce a la
--    diferencia. **No se dejan las dos.**
--
--    El número es 0006 y no 0005 a propósito: 0005 lo reclama la tarea 2.11
--    de Sebas, que ya está abierta en el PR #15. Un hueco en la numeración
--    no le molesta al runner (ordena por nombre de archivo); dos archivos
--    con el mismo número sí.
--
-- NADA DE ESTO BLOQUEA EL ARRANQUE
--
--    `core/src/afiliacion/` funciona sin base de datos, en memoria, y lo
--    dice en el log — la regla de degradación del repo. Esta migración es
--    lo que hace que sobreviva a un reinicio, no lo que la enciende.

-- `similarity()` y el operador `%`, para el PRE-FILTRO por nombre.
--
-- ⚠️ El puntaje que decide NO sale de aquí: lo calcula
--    `afiliacion/similitud.ts`, y a propósito. `similarity()` compara con
--    minúsculas pero CON tildes, y las dos fuentes que hay que cruzar están
--    en registros distintos — el REPS trae «Clínica» y el CSV de transporte
--    trae «CLINICA» en utf-8-sig. Sin quitar tildes antes, esos dos pierden
--    la mitad de sus trigramas y no cruzan. `unaccent()` no es IMMUTABLE, así
--    que tampoco se puede indexar directo.
--
--    Resultado: Postgres acelera el «candidatos plausibles» con el operador
--    `%` sobre este índice, y el número que decide lo pone TypeScript, uno
--    solo, igual con base o sin ella.
create extension if not exists pg_trgm;

-- ═══════════════════════════════════════════════════════════════
--  B1. Organización — la entidad jurídica que se afilia
-- ═══════════════════════════════════════════════════════════════
create table if not exists organizacion (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null
                 check (tipo in ('ips','operador_ambulancia','crue','entidad_pagadora')),
  razon_social   text not null,
  nombre_corto   text,
  nit            text not null,
  estado         text not null default 'borrador'
                 check (estado in ('borrador','enviada','en_verificacion','observada',
                                   'aprobada','activa','suspendida','retirada')),
  verificacion   text check (verificacion in ('reps_automatico','manual','pendiente')),
  -- Por qué quedó `observada`. Se le dice QUÉ falta, no "solicitud rechazada".
  observaciones  jsonb not null default '[]'::jsonb,
  verificada_en  timestamptz,
  verificada_por uuid,                     -- FK a actor; se agrega más abajo
  creada_en      timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  -- Una misma empresa puede ser IPS y operador de ambulancias con el mismo
  -- NIT: son dos afiliaciones distintas, con estados distintos. Por eso la
  -- unicidad es (tipo, nit) y no nit a secas.
  unique (tipo, nit)
);

comment on table organizacion is
  'El inquilino. `estado` = ''activa'' es la ÚNICA condición despachable: '
  'el ranking filtra por eso (§3.2).';

-- El ranking pregunta "¿esta sede es despachable?" en cada match. Sin este
-- índice parcial eso es un seq scan sobre la tabla entera por caso.
create index if not exists organizacion_activa_idx
  on organizacion (id) where estado = 'activa';

-- ═══════════════════════════════════════════════════════════════
--  B2. Sede afiliada — el puente entre la organización y el REPS
-- ═══════════════════════════════════════════════════════════════
--
-- La PK sigue siendo la del REPS: `codigo_habilitacion_sede`, 12 dígitos.
-- NO `codigoprestador`, que son 10 y colapsa una subred entera en un código.
-- Está documentado en `data/CATALOGO.md` y ya causó un bug (9 sedes en uno).
create table if not exists organizacion_sede (
  organizacion_id uuid references organizacion(id) on delete cascade,
  codigo_sede     text references sede(codigo),
  verificada      boolean not null default false,
  activa          boolean not null default true,
  vinculada_en    timestamptz not null default now(),
  primary key (organizacion_id, codigo_sede)
);

-- Una sede la reclama UNA organización. Sin esto, dos IPS afilian el mismo
-- código y el handshake no sabe a quién avisarle.
create unique index if not exists organizacion_sede_unica_idx
  on organizacion_sede (codigo_sede) where activa;

-- ═══════════════════════════════════════════════════════════════
--  B3. Actor — una persona o un servicio. NO es "usuario final".
-- ═══════════════════════════════════════════════════════════════
create table if not exists actor (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid references organizacion(id) on delete cascade,
  tipo            text not null check (tipo in ('humano','servicio')),
  nombre          text not null,
  identificador   text not null unique,     -- correo, o 'svc:voz'
  password_hash   text,                     -- null en servicios: usan token propio
  telefono        text,
  registro_profesional text,
  -- Desactivar es esto, NUNCA un delete: el actor tiene que seguir
  -- resolviendo en la auditoría vieja (caso límite 4 de §7).
  activo          boolean not null default true,
  ultimo_acceso   timestamptz,
  creado_en       timestamptz not null default now()
);

-- Se declara aquí y no en la tabla porque `actor` no existía todavía.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizacion_verificada_por_fk'
  ) then
    alter table organizacion add constraint organizacion_verificada_por_fk
      foreign key (verificada_por) references actor(id);
  end if;
end $$;

create index if not exists actor_organizacion_idx on actor (organizacion_id);

-- ═══════════════════════════════════════════════════════════════
--  B4. Rol — qué puede hacer, y sobre qué sede
-- ═══════════════════════════════════════════════════════════════
--
-- `codigo_sede` nullable = el rol vale para toda la organización. Un jefe
-- que cubre dos sedes son DOS filas (caso límite 2): el alcance es la unión.
create table if not exists actor_rol (
  actor_id     uuid references actor(id) on delete cascade,
  rol          text not null check (rol in (
                 'paramedico','jefe_urgencias','admin_organizacion',
                 'regulador_crue','auditor','admin_plataforma','servicio')),
  codigo_sede  text references sede(codigo),
  otorgado_por uuid references actor(id),
  otorgado_en  timestamptz not null default now(),
  -- `codigo_sede` es nullable y en una PK eso deja pasar duplicados: dos
  -- filas con null NO chocan. Se usa '' como centinela de "toda la org".
  codigo_alcance text generated always as (coalesce(codigo_sede, '')) stored,
  primary key (actor_id, rol, codigo_alcance)
);

-- ═══════════════════════════════════════════════════════════════
--  B5. Invitación — cómo entra el segundo humano (tarea 2.5)
-- ═══════════════════════════════════════════════════════════════
--
-- ⚠️ AQUÍ SOLO VIVE EL HASH. El token en claro viaja una vez, en el enlace,
--    y no se guarda en ningún lado — ni en esta tabla ni en el log (5.3
--    redacta en Pino). Quien tenga esta tabla no puede aceptar invitaciones.
create table if not exists invitacion (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid references organizacion(id) on delete cascade,
  correo          text not null,
  rol             text not null check (rol in (
                    'paramedico','jefe_urgencias','admin_organizacion',
                    'regulador_crue','auditor','admin_plataforma','servicio')),
  codigo_sede     text references sede(codigo),
  token_hash      text not null unique,
  expira_en       timestamptz not null,
  aceptada_en     timestamptz,
  revocada_en     timestamptz,
  invitada_por    uuid references actor(id),
  creada_en       timestamptz not null default now()
);

-- El único acceso caliente: llega un token, se hashea y se busca. Ya lo
-- cubre el unique de token_hash.
create index if not exists invitacion_organizacion_idx
  on invitacion (organizacion_id, creada_en desc);

comment on column invitacion.aceptada_en is
  'No null = ya se usó. Un solo uso: el segundo intento responde 410.';

-- ═══════════════════════════════════════════════════════════════
--  Autoverificación contra el REPS (§3.3) — el índice que la hace viable
-- ═══════════════════════════════════════════════════════════════
--
-- Pre-filtro: `sede.nombre % $1` sin índice es un seq scan sobre las 16.181
-- sedes por cada tecla del formulario de afiliación. GIN trigram lo convierte
-- en un lookup. El puntaje final lo pone `afiliacion/similitud.ts` — ver la
-- nota de `create extension` arriba.
create index if not exists sede_nombre_trgm_idx
  on sede using gin (nombre gin_trgm_ops);

-- ── RLS ────────────────────────────────────────────────────────
--
-- Misma regla que 0001 y 0003: en Supabase una tabla de `public` SIN rls
-- queda abierta a lectura Y escritura por PostgREST para el rol `anon`, y la
-- llave anon viaja en el bundle del navegador.
--
-- Aquí pesa más que en ninguna otra tabla: `actor.password_hash` y
-- `invitacion.token_hash` son credenciales. Sin policy no hay puerta.
-- Core habla con la service role key, que se salta RLS.
alter table organizacion       enable row level security;
alter table organizacion_sede  enable row level security;
alter table actor              enable row level security;
alter table actor_rol          enable row level security;
alter table invitacion         enable row level security;
