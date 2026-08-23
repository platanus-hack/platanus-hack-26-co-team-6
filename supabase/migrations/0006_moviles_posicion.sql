-- ═══════════════════════════════════════════════════════════════
--  PULSO — 0006 · posición del móvil en vivo
--  Dueño: Juan · tarea 3.7
--  Correr en: Supabase → SQL Editor → pegar todo → Run
-- ═══════════════════════════════════════════════════════════════
--
-- QUÉ AÑADE
--
--   1. `movil_posicion` — la traza append-only de reportes. Es el insumo del
--      ETA vivo (4.3) y la única forma de responder después "¿dónde estaba
--      esa ambulancia a las 03:14?".
--   2. Las columnas que `movil_estado` (tarea 3.6, Zaid) no traía y que 3.7
--      necesita: el radio de error del GPS y quién reportó.
--
-- POR QUÉ DOS COSAS Y NO UNA
--
--   `movil_estado` responde "¿dónde está AHORA?" — una fila por móvil, se
--   sobrescribe. `movil_posicion` responde "¿por dónde pasó?" — muchas filas,
--   nadie las edita. Meterlo todo en una tabla obliga a elegir entre perder la
--   historia o hacer un scan para pintar el mapa.
--
-- ORDEN DE MERGE
--
--   3.6 mergea ANTES que 3.7 y es quien crea `movil` y `movil_estado`. Esta
--   migración NO las crea: si no existen, se salta esa parte y avisa, para que
--   correr las migraciones en desorden no reviente ni —peor— cree una versión
--   distinta de la tabla de otro.
--
-- ⚠️ SIN PII
--
--   Aquí van coordenadas de ambulancias, y una ambulancia con paciente a bordo
--   dice dónde está ese paciente. No hay `caso_id` en `movil_posicion` a
--   propósito: cruzar la traza con el caso reconstruye el recorrido clínico de
--   una persona identificable, y eso es una decisión de retención (tarea 5.8),
--   no un `join` que se deja abierto por comodidad.

-- ── 1. La traza. Append-only, como toda la auditoría del sistema. ──

create table if not exists movil_posicion (
  id            bigint generated always as identity primary key,
  movil_id      text not null,
  -- Se guarda desnormalizada: el alcance por inquilino se filtra por aquí y
  -- no puede depender de un join con una tabla que 3.6 todavía puede cambiar.
  organizacion_id uuid,
  geom          geography(Point, 4326) not null,
  -- `coords.accuracy` del navegador. NO es decorativa: en interiores el error
  -- es de cientos de metros, y una posición sin su radio se lee como una
  -- certeza que no existe.
  precision_m   real,
  velocidad_kmh real,
  disponible    boolean not null,
  -- Sello del SERVIDOR. El reloj de un tablet de campo se desfasa, y con un
  -- `ts` del cliente un móvil con la hora mal puesta se ve siempre "en vivo".
  reportado_en  timestamptz not null default now()
);

comment on table movil_posicion is
  'Traza append-only de reportes de posición de la flota (tarea 3.7). Insumo '
  'del ETA vivo. Sin caso_id a propósito: ver la cabecera de la migración.';

-- El mapa de cobertura pide "el último reporte de cada móvil" y el ETA vivo
-- pide "los últimos N de este móvil". Las dos son este índice.
create index if not exists movil_posicion_movil_reportado_idx
  on movil_posicion (movil_id, reportado_en desc);

-- La cobertura por zona es una consulta espacial: sin GiST es un scan de la
-- tabla entera cada vez que el CRUE mira el mapa.
create index if not exists movil_posicion_geom_idx
  on movil_posicion using gist (geom);

-- Append-only de verdad, no por convención. Regla 4 del repo: nadie edita ni
-- borra; una corrección es una fila nueva. La purga por antigüedad la hace el
-- worker de retención (5.8) con un rol que se salta el trigger a propósito.
create or replace function movil_posicion_rechazar_mutacion()
returns trigger language plpgsql as $$
begin
  raise exception 'movil_posicion es append-only';
end;
$$;

drop trigger if exists movil_posicion_append_only on movil_posicion;
create trigger movil_posicion_append_only
before update or delete on movil_posicion
for each row execute function movil_posicion_rechazar_mutacion();

-- ── 2. Lo que le falta a `movil_estado` (creada en 3.6) ────────────
--
-- Condicional: 3.6 mergea primero, pero si alguien corre las migraciones en
-- otro orden esto avisa en vez de reventar a mitad del archivo.

do $$
begin
  if to_regclass('public.movil_estado') is null then
    raise notice
      'movil_estado no existe todavía (la crea la migración de la tarea 3.6). '
      'Cuando esté, vuelve a correr esta migración: es idempotente.';
  else
    alter table movil_estado add column if not exists precision_m real;
    alter table movil_estado add column if not exists reportado_por uuid;
    -- Índice espacial del estado vivo: es el que pinta el mapa del CRUE.
    create index if not exists movil_estado_geom_idx
      on movil_estado using gist (geom);
  end if;
end
$$;

-- ── 3. RLS ─────────────────────────────────────────────────────
--
-- Misma regla que 0001 y 0003: en Supabase una tabla de `public` SIN rls queda
-- abierta a lectura y escritura por PostgREST para el rol `anon`, y la llave
-- anon viaja en el bundle del navegador. Core habla con la service role key,
-- que se salta RLS: cerrar aquí no le quita nada al servidor.
--
-- Sin policy no hay puerta. Y aquí importa más que en ninguna otra tabla: la
-- posición de la flota abierta a internet es un mapa en vivo de dónde están
-- las ambulancias de la ciudad. Las policies por organización llegan con 1.5.

alter table movil_posicion enable row level security;
revoke all on table movil_posicion from anon, authenticated;

-- ── DOWN ───────────────────────────────────────────────────────
--
-- Destructivo: se lleva la traza. Solo para deshacer un despliegue fallido, y
-- exportando antes si ya hubo tráfico real.
--
-- drop trigger if exists movil_posicion_append_only on movil_posicion;
-- drop function if exists movil_posicion_rechazar_mutacion();
-- drop table if exists movil_posicion;
-- alter table movil_estado drop column if exists precision_m;
-- alter table movil_estado drop column if exists reportado_por;
-- drop index if exists movil_estado_geom_idx;
