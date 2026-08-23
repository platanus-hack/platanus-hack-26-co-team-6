-- ═══════════════════════════════════════════════════════════════
--  PULSO — 0007 · evento_caso: la línea de tiempo del caso
--  Dueño: Juan · tareas 3.11 (override del CRUE) y 4.12 (vista forense)
--  Correr en: Supabase → SQL Editor → pegar todo → Run
-- ═══════════════════════════════════════════════════════════════
--
-- POR QUÉ EXISTE ESTA TABLA
--
--   Hoy, de 22 eventos del sistema, se guardan 3. El re-ruteo automático
--   —la mejor demostración del producto— no deja rastro. El override del
--   regulador, que es una decisión con potestad legal (Res. 1220/2010),
--   vivía en el `localStorage` del navegador: se borraba al limpiar la
--   caché y ningún servidor lo había visto.
--
--   Sin esta tabla no hay reporte del traslado, no hay métricas, y "todo
--   es auditable" es una frase sin nada detrás.
--
-- QUÉ PARTE ES DE QUIÉN
--
--   La dueña de `evento_caso` y del `RegistroService` es la tarea 3.1
--   (Neid); la 3.2 (Sebas) cablea los 22 eventos. Ninguna de las dos
--   estaba hecha cuando 3.11 y 4.12 la necesitaron, así que esta migración
--   escribe el esquema COMPLETO —con las dos enmiendas de la spec §11.1,
--   `corrige_a` y `clave_idempotencia`, ya incorporadas— y core escribe de
--   momento solo dos tipos: `override_crue` y `lectura_auditoria`.
--
--   3.1 aterriza encima sin cambiar nada de aquí: le toca el adaptador de
--   Postgres detrás de la interfaz `AlmacenEventos` (core/src/eventos).
--
-- LA REGLA
--
--   APPEND-ONLY. Ni UPDATE, ni DELETE, ni TRUNCATE — tampoco para
--   `admin_plataforma`. Una corrección es una fila NUEVA que apunta a la
--   vieja con `corrige_a`. Un UPDATE habría borrado el error, que es justo
--   lo que un auditor necesita ver: "22:14 llegada a puerta; 22:19 el mismo
--   actor la corrigió a 22:11".

create table if not exists evento_caso (
  id            bigint generated always as identity primary key,

  -- Sin `references caso(id)`: `caso` existe (0001) pero core todavía guarda
  -- los casos en un Map en RAM (tarea 1.2), así que hoy la FK rechazaría
  -- cada inserción. Se agrega junto con la persistencia del caso.
  caso_id       uuid not null,

  tipo          text not null check (tipo in (
                  -- Los 21 de la DDL §D1 del plan (Parte II), literales.
                  'caso_creado','revision_humana','match_calculado','despachado',
                  'aceptado','rechazado','timeout','rerouteado','escalado',
                  'override_crue','llegada_escena','salida_escena',
                  'llegada_puerta','entrega','cerrado','demora_reportada',
                  'prearribo_enviado','preparacion_confirmada',
                  'derechos_verificados','tramite_generado','contrarreferencia',
                  -- Añadido por la tarea 4.12: "cada lectura queda
                  -- registrada". Abrir el expediente forense de un caso es un
                  -- acceso a datos clínicos y tiene que dejar huella. Va en
                  -- esta tabla y no en una propia porque una segunda tabla de
                  -- accesos es una segunda cosa que se olvida de escribir.
                  'lectura_auditoria')),

  -- Sin FK a `actor(id)` por lo mismo: la tabla llega con 1.3. Hoy el valor
  -- es `turno:<sub>` (contraseña compartida) o `svc:voz` (token de servicio).
  actor_id      text,
  actor_nombre  text,
  -- Distinguir la persona del servicio no es cosmético: "el paramédico
  -- confirmó la llegada" y "voz interpretó un audio como confirmación de
  -- llegada" son dos hechos distintos ante un juez.
  actor_tipo    text not null default 'humano'
                  check (actor_tipo in ('humano','servicio','sistema')),

  -- Organización del actor al momento del evento. No está en la DDL §D1
  -- porque allí el alcance se deriva de `caso.organizacion_id`, que aún no
  -- existe. Aquí se guarda porque la vista forense lo muestra campo por campo
  -- y porque es lo único con lo que hoy se le puede negar un caso ajeno a un
  -- `admin_organizacion`.
  organizacion_id uuid,

  movil_id      text,
  codigo_sede   text,

  -- SIN PII. El dictado crudo y el teléfono viven en `caso`, detrás de la
  -- sesión; aquí no entran porque este detalle se exporta a JSON y a PDF.
  -- `RegistroService.registrar()` rechaza esas claves antes de llegar aquí.
  detalle       jsonb not null default '{}',

  -- La corrección no borra: apunta.
  corrige_a     bigint references evento_caso(id),

  -- Idempotencia: el paramédico toca "ya llegué" dos veces con mala señal, o
  -- el navegador reintenta la confirmación del override.
  clave_idempotencia text,

  ocurrido_en   timestamptz not null default now()
);

-- El índice del día 1 (plan maestro §9): la línea de tiempo de un caso.
create index if not exists evento_caso_caso_id_ocurrido_en_idx
  on evento_caso (caso_id, ocurrido_en);

-- El tablero del CRUE lee los últimos eventos de todos los casos.
create index if not exists evento_caso_ocurrido_en_idx
  on evento_caso (ocurrido_en desc);

create unique index if not exists evento_caso_idempotencia_idx
  on evento_caso (caso_id, tipo, clave_idempotencia)
  where clave_idempotencia is not null;

comment on table evento_caso is
  'Línea de tiempo append-only del caso. Es el reporte del traslado y la '
  'prueba de la vista forense. Nadie edita ni borra: una corrección es una '
  'fila nueva con corrige_a.';

comment on column evento_caso.detalle is
  'SIN PII: ni textoCrudo, ni teléfono, ni pacienteToken. Este campo sale del '
  'servidor en el expediente forense.';

-- ── Append-only ────────────────────────────────────────────────
--
-- Se reutiliza `pulso_reject_audit_mutation()` de 0002 —la misma que protege
-- `pulso_routing_decision_audit`— porque son la misma regla y dos funciones
-- que dicen lo mismo se desincronizan. Se define aquí también con
-- `create or replace` para que 0007 pueda correr sobre una base donde 0002
-- todavía no pasó.

create or replace function pulso_reject_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'pulso routing decision audit is append-only';
end;
$$;

drop trigger if exists evento_caso_append_only on evento_caso;
create trigger evento_caso_append_only
before update or delete on evento_caso
for each row execute function pulso_reject_audit_mutation();

drop trigger if exists evento_caso_no_truncate on evento_caso;
create trigger evento_caso_no_truncate
before truncate on evento_caso
for each statement execute function pulso_reject_audit_mutation();

-- ── RLS ────────────────────────────────────────────────────────
--
-- Misma regla que 0001 y 0003: una tabla de `public` sin RLS queda abierta a
-- lectura y escritura por PostgREST para el rol `anon`, y la llave anon viaja
-- en el bundle del navegador. Core habla con la service role key, que se
-- salta RLS: cerrar aquí no le quita nada al servidor.
--
-- Y aquí importa especialmente: esta tabla es el expediente clínico-operativo
-- del caso. Las policies por organización y por concesión (`caso_acceso`)
-- llegan con la tarea 1.6.

alter table evento_caso enable row level security;
revoke all on table evento_caso from anon, authenticated;

-- ── DOWN ───────────────────────────────────────────────────────
--
-- Destructivo, y de una forma que las otras migraciones no lo son: se lleva
-- la auditoría. Borrar `evento_caso` es borrar la prueba de quién decidió
-- qué. Solo para deshacer un despliegue fallido y SIN tráfico real; con
-- tráfico, exportar antes es obligatorio, no una buena práctica.
--
-- drop trigger if exists evento_caso_no_truncate on evento_caso;
-- drop trigger if exists evento_caso_append_only on evento_caso;
-- drop index if exists evento_caso_idempotencia_idx;
-- drop index if exists evento_caso_ocurrido_en_idx;
-- drop index if exists evento_caso_caso_id_ocurrido_en_idx;
-- drop table if exists evento_caso;
-- -- pulso_reject_audit_mutation() NO se borra: la sigue usando 0002.
