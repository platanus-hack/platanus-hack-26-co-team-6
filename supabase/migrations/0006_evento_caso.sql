-- ═══════════════════════════════════════════════════════════════
--  PULSO — 0006 · evento_caso, la línea de tiempo append-only
--  Tarea 3.1 (carril de Neid) · la escribió el carril de Sebas
--  Correr en: Supabase → SQL Editor → pegar todo → Run
-- ═══════════════════════════════════════════════════════════════
--
-- POR QUÉ EXISTE ESTA TABLA
--
--   De los 22 eventos del sistema, **3 se guardaban**: 6 vivían en memoria y
--   13 no existían o se descartaban. Los dos momentos más vendibles del
--   producto eran invisibles — el re-ruteo automático ("el hospital dijo que
--   no y el sistema siguió solo") no quedaba en ninguna parte, y el override
--   del CRUE, que es una decisión con potestad legal, vivía en el
--   `localStorage` del navegador de quien lo hizo.
--
--   Sin esta tabla no hay reporte del paramédico (3.10), no hay métricas de
--   negocio (5.4), no hay retención (5.8) y no se puede responder "¿qué pasó
--   con este paciente?" tres meses después.
--
-- APPEND-ONLY, Y EN SERIO
--
--   El trigger es el mismo de `pulso_routing_decision_audit` (0002): rechaza
--   UPDATE, DELETE y TRUNCATE. Corregir NO es editar: es una fila nueva con
--   `corrige_a` apuntando a la vieja. Las dos se leen juntas, y esa lectura
--   es la que sirve en una auditoría:
--
--     22:14  llegada_puerta
--     22:19  llegada_puerta  (corrige a la anterior: era 22:11)
--
--   Un UPDATE habría borrado el error, que es justo lo que un auditor
--   necesita ver.
--
-- NUMERACIÓN
--
--   La tarea decía `0006` y coincide: 0003 es el webhook (Juan, 0.4), 0004 el
--   catálogo de motivos (Sebas, 0.6) y 0005 la idempotencia (Sebas, 2.11).
--   ⚠️ La migración de identidad de Zaid (1.1) toma la **0007**.

-- ⚠️ `actor_id` NO lleva la FK a `actor(id)` que pide el DDL del bloque D1:
--    esa tabla llega con 1.1 y sin ella la migración no corre. Queda el tipo
--    `text` para admitir también los ids sintéticos que ya existen hoy
--    (`legado:operador`, `llave:<uuid>`, `svc:voz`). Cuando 1.1 aterrice, se
--    agrega la restricción en su propia migración — no antes, para que esta
--    pueda correr sola.

create table if not exists evento_caso (
  id                  bigint generated always as identity primary key,
  caso_id             uuid not null,
  tipo                text not null check (tipo in (
                        'caso_creado','revision_humana','match_calculado','despachado',
                        'aceptado','rechazado','timeout','rerouteado','escalado','override_crue',
                        'llegada_escena','salida_escena','llegada_puerta','entrega','cerrado',
                        'demora_reportada','demora_detectada','prearribo_enviado',
                        'preparacion_confirmada','derechos_verificados','tramite_generado',
                        'tramite_firmado','contrarreferencia','intento_cruzado')),
  actor_id            text,
  movil_id            text,
  codigo_sede         text,
  detalle             jsonb not null default '{}',
  ocurrido_en         timestamptz not null default now(),
  -- Enmienda de §11.1: las dos columnas que faltaban en el DDL de D1.
  corrige_a           bigint references evento_caso(id),
  clave_idempotencia  text
);

comment on table evento_caso is
  'Línea de tiempo del caso. APPEND-ONLY: una corrección es una fila nueva '
  'con corrige_a, nunca un UPDATE.';

comment on column evento_caso.detalle is
  '⚠️ SIN PII. Aquí no entran texto_crudo, origen, teléfono ni el token de '
  'paciente. La tabla se conserva más allá de la purga de retención (5.8), '
  'así que lo que entre aquí sobrevive al borrado de la PII del caso.';

comment on column evento_caso.clave_idempotencia is
  'El paramédico toca "ya llegué" dos veces con mala señal: eso es UNA '
  'llegada. Único por (caso_id, tipo, clave).';

-- La consulta de la línea de tiempo, que es la única que se hace de verdad.
create index if not exists evento_caso_caso_ocurrido_idx
  on evento_caso (caso_id, ocurrido_en);

-- Idempotencia por evento. Parcial: la mayoría de eventos no lleva clave y
-- no tiene por qué competir por el índice.
create unique index if not exists evento_caso_idempotencia_idx
  on evento_caso (caso_id, tipo, clave_idempotencia)
  where clave_idempotencia is not null;

-- ── Append-only ────────────────────────────────────────────────
--
-- `pulso_reject_audit_mutation()` la crea 0002. Se recrea aquí con `or
-- replace` para que esta migración pueda correr sobre una base donde 0002 no
-- pasó todavía — no depende del orden y no pisa nada: es la misma función.

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
-- Misma regla que 0001, 0003, 0004 y 0005: sin RLS, PostgREST deja la tabla
-- abierta al rol `anon`, y la llave anon viaja en el bundle del navegador.
--
-- Sin policy no hay puerta. Core habla por conexión directa y no se entera;
-- quien llegue por anon no lee ni escribe. El filtro por organización de las
-- lecturas legítimas llega con las policies de 1.6 sobre `caso_acceso`.

alter table evento_caso enable row level security;

revoke all on table evento_caso from anon, authenticated;

-- ── Down ───────────────────────────────────────────────────────
--
-- Deliberadamente comentado: bajar esto borra la línea de tiempo de todos los
-- casos, y es exactamente el dato que no se puede reconstruir. Si hay que
-- revertir, se descomenta a mano y se asume la pérdida.
--
-- drop trigger if exists evento_caso_no_truncate on evento_caso;
-- drop trigger if exists evento_caso_append_only on evento_caso;
-- drop index if exists evento_caso_idempotencia_idx;
-- drop index if exists evento_caso_caso_ocurrido_idx;
-- drop table if exists evento_caso;
