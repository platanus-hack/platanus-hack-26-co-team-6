-- ═══════════════════════════════════════════════════════════════
--  PULSO — 0008 · catálogos clínicos versionados
--  Dueño: Juan · tarea 5.11
--  Correr en: Supabase → SQL Editor → pegar todo → Run
-- ═══════════════════════════════════════════════════════════════
--
-- POR QUÉ EXISTEN ESTAS TABLAS
--
--   Los motivos de rechazo, los protocolos, el mapa diagnóstico→servicios y
--   las versiones de prompt y de scoring son LÓGICA CLÍNICA, no configuración.
--   Son las variables respecto de las cuales se interpreta el dataset
--   histórico de aceptación y rechazo — que es el activo del producto.
--
--   Si cambian sin dejar versión, dos casos de meses distintos dejan de ser
--   comparables y nadie se entera: el gráfico sigue dibujando algo. Hoy los
--   cuatro motivos de rechazo viven como strings sueltos dentro de
--   `apps/frontend/components/hospital/MotivosCapacidad.tsx`; cambiarle una
--   coma a uno parte la serie en dos.
--
-- LA REGLA QUE DECIDE EL ESQUEMA
--
--   **El código es inmutable. La etiqueta es editable. Editarla no modifica
--   nada: inserta una fila nueva con la versión siguiente.**
--
--   Por eso la llave primaria es (coleccion, codigo, version) y no un id
--   sintético: la unicidad que importa es "no puede haber dos filas para la
--   misma versión del mismo código", y una llave sustituta la dejaría pasar.
--
-- POR QUÉ NO HAY COLUMNA `vigente`
--
--   La versión vigente es la de número más alto. Guardarla como booleano
--   obligaría a apagar la anterior en la misma transacción, y el día que eso
--   falle habrá dos vigentes y nadie sabrá cuál mandó. Derivarla no puede
--   quedar inconsistente. La vista `catalogo_vigente` la calcula.
--
-- ESTADO
--
--   El módulo `apps/backend/core/src/admin/` corre hoy contra un almacén EN
--   MEMORIA detrás de la interfaz `AlmacenAdmin` — y lo dice en
--   `GET /admin/acceso` y en la consola. Falta `AlmacenAdminPostgres`, que se
--   conecta en un solo sitio (`admin.module.ts`). Esta migración es lo que ese
--   almacén va a encontrar.

-- ── Las versiones ──────────────────────────────────────────────

create table if not exists catalogo_version (
  coleccion   text not null check (coleccion in (
                'motivo_rechazo','protocolo','mapa_dx',
                'prompt_clinico','config_scoring')),
  -- INMUTABLE. La clave estable contra la que se compara el histórico.
  -- La forma va en un check y no solo en el código: un código con espacios o
  -- tildes termina en eventos de auditoría y en nombres de columna de
  -- exportaciones, y como no se puede corregir después, la única defensa es
  -- no aceptarlo nunca.
  codigo      text not null check (codigo ~ '^[A-Z0-9][A-Z0-9_.-]{1,63}$'),
  version     integer not null check (version >= 1),

  etiqueta    text not null check (length(btrim(etiqueta)) between 1 and 200),
  -- Cuerpo propio de cada colección. El esquema por colección lo valida core
  -- con zod (`admin/tipos.ts`); aquí solo se exige que sea un objeto.
  datos       jsonb not null default '{}'::jsonb
                check (jsonb_typeof(datos) = 'object'),
  -- false = retirada. NO se borra: retirar es una versión más.
  activo      boolean not null default true,
  -- Por qué cambió. Obligatorio de la v2 en adelante: una versión sin motivo
  -- es una fila que dentro de seis meses nadie sabrá explicar.
  motivo      text check (version = 1 or length(btrim(motivo)) > 0),
  creado_en   timestamptz not null default now(),
  -- Quién lo firmó. Nada con consecuencia clínica ocurre sin actor (regla 6).
  creado_por  text not null,

  primary key (coleccion, codigo, version)
);

comment on table catalogo_version is
  'Lógica clínica versionada. Append-only: editar una etiqueta inserta una '
  'versión nueva; el código nunca cambia porque es la clave con la que se '
  'compara el dataset histórico.';

comment on column catalogo_version.codigo is
  'INMUTABLE. No existe UPDATE que lo cambie: el trigger de append-only lo impide.';

-- El histórico de un código se lee entero y en orden. Sin este índice, cada
-- apertura de la vista de historial es un seq scan.
create index if not exists catalogo_version_codigo_idx
  on catalogo_version (coleccion, codigo, version desc);

-- ── Lo que rige hoy ────────────────────────────────────────────
--
-- La versión de número más alto de cada código. Derivada, nunca almacenada.

create or replace view catalogo_vigente as
select distinct on (coleccion, codigo)
  coleccion, codigo, version, etiqueta, datos, activo, motivo, creado_en, creado_por
from catalogo_version
order by coleccion, codigo, version desc;

comment on view catalogo_vigente is
  'La versión que manda hoy por código. Un `activo = false` aquí significa '
  'retirado: el mapa Dx lo trata como "sin mapeo" y el caso escala a criterio humano.';

-- ── Con qué se procesó cada caso ───────────────────────────────
--
-- La tabla que responde "¿con qué versión de prompt se leyó el dictado de
-- hace una semana?". Sin ella, comparar la tasa de aceptación de marzo con la
-- de abril compara dos motores distintos creyendo que compara dos redes
-- hospitalarias.

create table if not exists caso_procesado_con (
  caso_id      text not null,
  coleccion    text not null check (coleccion in ('prompt_clinico','config_scoring')),
  codigo       text not null,
  version      integer not null,
  -- Cuándo se procesó DE VERDAD. Puede ser anterior a la anotación si el
  -- registro se encoló: la fecha del hecho y la fecha en que se supo son dos
  -- datos distintos, y confundirlos es como se falsifica un histórico.
  procesado_en timestamptz not null default now(),

  -- Idempotente por construcción: anotar dos veces el mismo hecho no lo
  -- duplica. El pipeline reintenta; el registro no puede inflarse por eso.
  primary key (caso_id, coleccion, codigo, version),
  foreign key (coleccion, codigo, version)
    references catalogo_version (coleccion, codigo, version)
);

comment on table caso_procesado_con is
  'Caso ↔ versión del artefacto con el que se procesó. Sin PII: el id de caso '
  'no identifica a nadie por sí solo y ni el dictado ni el origen pasan por aquí.';

create index if not exists caso_procesado_con_version_idx
  on caso_procesado_con (coleccion, codigo, version);

-- ── La auditoría ───────────────────────────────────────────────

create table if not exists evento_admin (
  evento_id   bigint generated always as identity primary key,
  ocurrido_en timestamptz not null default now(),
  actor       text not null,
  -- Cómo se autorizó: 'rol' cuando llegue 1.3, 'puente-token-plataforma' hoy.
  via         text not null,
  accion      text not null check (accion in (
                'entrada.creada','version.creada','entrada.retirada',
                'entrada.restituida','procesamiento.registrado')),
  coleccion   text not null,
  codigo      text not null,
  version     integer not null,
  motivo      text,
  -- Diferencias respecto de la versión anterior, campo por campo.
  cambios     jsonb not null default '[]'::jsonb
                check (jsonb_typeof(cambios) = 'array')
);

comment on table evento_admin is
  'Auditoría append-only de la administración de catálogos. Nadie edita ni '
  'borra: una corrección es un evento nuevo (regla 4 del repo).';

create index if not exists evento_admin_codigo_idx
  on evento_admin (coleccion, codigo, ocurrido_en desc);

-- ── Append-only, impuesto por la base ──────────────────────────
--
-- El código de core ya no expone `actualizar()` ni `borrar()`, pero eso es
-- una promesa del código. Esto es la garantía: aunque alguien entre por el
-- SQL Editor con la service role key, no puede reescribir la historia. Mismo
-- mecanismo que `pulso_reject_audit_mutation()` en la migración 0002.

create or replace function pulso_rechazar_mutacion_catalogo()
returns trigger language plpgsql as $$
begin
  raise exception
    'catálogos versionados: append-only. Para cambiar algo, inserta una versión nueva.';
end;
$$;

drop trigger if exists catalogo_version_append_only on catalogo_version;
create trigger catalogo_version_append_only
before update or delete on catalogo_version
for each row execute function pulso_rechazar_mutacion_catalogo();

drop trigger if exists catalogo_version_no_truncate on catalogo_version;
create trigger catalogo_version_no_truncate
before truncate on catalogo_version
for each statement execute function pulso_rechazar_mutacion_catalogo();

drop trigger if exists evento_admin_append_only on evento_admin;
create trigger evento_admin_append_only
before update or delete on evento_admin
for each row execute function pulso_rechazar_mutacion_catalogo();

drop trigger if exists evento_admin_no_truncate on evento_admin;
create trigger evento_admin_no_truncate
before truncate on evento_admin
for each statement execute function pulso_rechazar_mutacion_catalogo();

-- `caso_procesado_con` también: un registro de procesamiento que se puede
-- reescribir es una respuesta falsificable a la pregunta que la tabla existe
-- para responder.
drop trigger if exists caso_procesado_con_append_only on caso_procesado_con;
create trigger caso_procesado_con_append_only
before update or delete on caso_procesado_con
for each row execute function pulso_rechazar_mutacion_catalogo();

-- ── RLS ────────────────────────────────────────────────────────
--
-- Misma regla que 0001 y 0003: en Supabase una tabla de `public` SIN rls queda
-- abierta a lectura Y escritura por PostgREST para el rol `anon`, y la llave
-- anon viaja en el bundle del navegador. Core habla con la service role key
-- (o por conexión directa), que se salta RLS.
--
-- Sin policy no hay puerta. Y aquí importa más que en otras tablas: quien
-- escriba en `catalogo_version` decide qué servicios exige un infarto.

alter table catalogo_version    enable row level security;
alter table caso_procesado_con  enable row level security;
alter table evento_admin        enable row level security;

revoke all on table catalogo_version   from anon, authenticated;
revoke all on table caso_procesado_con from anon, authenticated;
revoke all on table evento_admin       from anon, authenticated;
revoke all on catalogo_vigente         from anon, authenticated;

-- ── DOWN ───────────────────────────────────────────────────────
--
-- Se deja escrito, no ejecutado. Ojo: `drop table` sobre estas tablas borra
-- histórico clínico firmado. Antes de correrlo, exporta.
--
--   drop trigger if exists caso_procesado_con_append_only on caso_procesado_con;
--   drop trigger if exists evento_admin_no_truncate on evento_admin;
--   drop trigger if exists evento_admin_append_only on evento_admin;
--   drop trigger if exists catalogo_version_no_truncate on catalogo_version;
--   drop trigger if exists catalogo_version_append_only on catalogo_version;
--   drop function if exists pulso_rechazar_mutacion_catalogo();
--   drop view  if exists catalogo_vigente;
--   drop table if exists caso_procesado_con;
--   drop table if exists evento_admin;
--   drop table if exists catalogo_version;
