-- ═══════════════════════════════════════════════════════════════
--  PULSO — esquema inicial
--  Dueño: Zaid
--  Correr en: Supabase → SQL Editor → pegar todo → Run
-- ═══════════════════════════════════════════════════════════════

create extension if not exists postgis;

-- ── Sedes (universo REPS) ──────────────────────────────────────

create table if not exists sede (
  codigo              text primary key,          -- codigo_habilitacion_sede
  nombre              text not null,
  direccion           text,
  localidad           text,
  geom                geography(Point, 4326),
  naturaleza          text check (naturaleza in ('Pública','Privada','Mixta')),
  complejidad         text check (complejidad in ('baja','media','alta')) default 'media',
  telefono            text,
  creado_en           timestamptz default now()
);

-- Índice espacial. Sin esto, ST_DWithin sobre 16k sedes es un table scan.
create index if not exists sede_geom_idx on sede using gist (geom);

-- ── Servicios habilitados por sede ─────────────────────────────
-- cod_servicio viene del CodeSystem FHIR de MinSalud
-- (REPShealthcareServices). 1102=urgencias, 110=UCI adultos, 743=hemodinamia.

create table if not exists servicio_sede (
  codigo_sede    text references sede(codigo) on delete cascade,
  cod_servicio   int not null,
  nombre_servicio text,
  primary key (codigo_sede, cod_servicio)
);

create index if not exists servicio_sede_cod_idx on servicio_sede (cod_servicio);

-- ── Capacidad instalada (semilla del snapshot REPS 2022) ───────

create table if not exists capacidad_sede (
  codigo_sede         text references sede(codigo) on delete cascade,
  tipo_capacidad      text not null,             -- 'CAMAS-Adultos', 'CAMAS-UCI Adultos'...
  camas_reps          int default 0,
  ocupadas_snapshot   int default 0,
  primary key (codigo_sede, tipo_capacidad)
);

-- ── Casos ──────────────────────────────────────────────────────

create table if not exists caso (
  id                     uuid primary key default gen_random_uuid(),
  texto_crudo            text not null,
  resumen                text,
  triage                 int check (triage between 1 and 5),
  dx_cie10               text,
  dx_descripcion         text,
  servicios_requeridos   int[] default '{}',
  complejidad_requerida  text default 'alta',
  edad                   int,
  sexo                   text,
  signos_alarma          text[] default '{}',
  requiere_medico_abordo boolean default false,
  confianza              real,
  tipo_movil             text check (tipo_movil in ('TAB','TAM')) default 'TAB',
  origen                 geography(Point, 4326),
  creado_en              timestamptz default now()
);

-- ── ⭐ Handshakes: el dataset que se auto-etiqueta ─────────────
-- Cada fila de esta tabla es una observación etiquetada que nadie tipeó.
-- Es el activo del producto.

create table if not exists handshake (
  id              uuid primary key default gen_random_uuid(),
  caso_id         uuid references caso(id) on delete cascade,
  codigo_sede     text references sede(codigo),
  canal           text check (canal in ('telegram','whatsapp','consola')),
  estado          text check (estado in ('enviado','aceptado','rechazado','timeout')) default 'enviado',
  motivo_rechazo  text,
  enviado_en      timestamptz default now(),
  respondido_en   timestamptz,
  latencia_s      int
);

create index if not exists handshake_sede_idx on handshake (codigo_sede, enviado_en desc);
create index if not exists handshake_caso_idx on handshake (caso_id);

-- ═══════════════════════════════════════════════════════════════
--  RPC de candidatos.
--  lib/db.ts la llama tal cual: sedes_cercanas(p_lat, p_lng, p_radio_m).
--  Devuelve el JSON exactamente con la forma del tipo `Sede` de types.ts
--  para que el TypeScript no tenga que mapear nada.
-- ═══════════════════════════════════════════════════════════════

create or replace function sedes_cercanas(
  p_lat     double precision,
  p_lng     double precision,
  p_radio_m double precision default 25000
)
returns table (
  codigo      text,
  nombre      text,
  direccion   text,
  localidad   text,
  coord       jsonb,
  naturaleza  text,
  complejidad text,
  telefono    text,
  servicios   int[],
  camas       jsonb
)
language sql
stable
as $$
  select
    s.codigo,
    s.nombre,
    s.direccion,
    s.localidad,
    jsonb_build_object(
      'lat', st_y(s.geom::geometry),
      'lng', st_x(s.geom::geometry)
    ) as coord,
    s.naturaleza,
    s.complejidad,
    s.telefono,
    coalesce(
      (select array_agg(ss.cod_servicio) from servicio_sede ss where ss.codigo_sede = s.codigo),
      '{}'::int[]
    ) as servicios,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
                'tipo', cs.tipo_capacidad,
                'total', cs.camas_reps,
                'ocupadasSnapshot', cs.ocupadas_snapshot))
       from capacidad_sede cs where cs.codigo_sede = s.codigo),
      '[]'::jsonb
    ) as camas
  from sede s
  where s.geom is not null
    and st_dwithin(s.geom, st_makepoint(p_lng, p_lat)::geography, p_radio_m)
  order by s.geom <-> st_makepoint(p_lng, p_lat)::geography
  limit 60;
$$;

-- ── Permisos ───────────────────────────────────────────────────
--
-- RLS EN TODAS LAS TABLAS, SIN EXCEPCIÓN.
--
-- En Supabase, una tabla del esquema `public` SIN rls habilitada queda
-- abierta a lectura Y escritura por PostgREST para el rol `anon` — y la
-- llave anon es pública por diseño: viaja en el bundle del navegador
-- (NEXT_PUBLIC_SUPABASE_ANON_KEY). "No le puse policy" no cierra nada:
-- lo que cierra es habilitar RLS.
--
-- Las tres tablas del REPS llevan policy de lectura pública a propósito:
-- son datos abiertos de MinSalud y no hay dato de paciente en ellas.
-- `caso` y `handshake` NO llevan ninguna: core habla con la service role
-- key, que se salta RLS, así que el backend sigue funcionando igual y el
-- rol anon se queda sin puerta.

alter table sede            enable row level security;
alter table servicio_sede   enable row level security;
alter table capacidad_sede  enable row level security;

-- ⚠️ Estas dos son las que guardan al paciente: texto_crudo es el dictado
--    literal, origen son sus coordenadas de recogida. Sin estas dos líneas,
--    `curl "$SUPABASE_URL/rest/v1/caso?select=*" -H "apikey: $ANON_KEY"`
--    devuelve la historia clínica entera a cualquiera.
alter table caso            enable row level security;
alter table handshake       enable row level security;

-- Cinturón sobre tirantes: revocamos también los grants por defecto que
-- Supabase le da a anon/authenticated en el esquema public. Con RLS activa
-- ya no harían nada, pero si alguien añade una policy permisiva sin pensar,
-- esto lo sigue frenando.
revoke all on table caso      from anon, authenticated;
revoke all on table handshake from anon, authenticated;

drop policy if exists lectura_publica_sede on sede;
create policy lectura_publica_sede on sede for select using (true);

drop policy if exists lectura_publica_servicio on servicio_sede;
create policy lectura_publica_servicio on servicio_sede for select using (true);

drop policy if exists lectura_publica_capacidad on capacidad_sede;
create policy lectura_publica_capacidad on capacidad_sede for select using (true);
