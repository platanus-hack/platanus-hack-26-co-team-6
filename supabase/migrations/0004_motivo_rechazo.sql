-- ═══════════════════════════════════════════════════════════════
--  PULSO — 0004 · catálogo versionado de motivos de rechazo
--  Dueño: Sebas · tarea 0.6
--  Correr en: Supabase → SQL Editor → pegar todo → Run
-- ═══════════════════════════════════════════════════════════════
--
-- POR QUÉ EXISTE ESTA TABLA
--
--   Los cuatro motivos vivían como literales dentro de un `.tsx` y viajaban
--   a `handshake.motivo_rechazo` como TEXTO LIBRE. Dos consecuencias, y
--   ninguna se ve hasta que ya pasó:
--
--   1. El dataset de aceptación —el activo del producto— queda incomparable
--      en el tiempo. Basta que alguien corrija una palabra en el .tsx para
--      que "Urgencias en capacidad máxima" y "Urgencias saturadas" cuenten
--      como dos causas distintas. La serie histórica se parte en silencio.
--
--   2. No se puede distinguir un rechazo por CAPACIDAD de uno ADMINISTRATIVO,
--      que es justo la distinción que sostiene la tesis del producto. Una red
--      sin camas y una red con fricción de autorizaciones necesitan
--      soluciones opuestas, y hoy se ven idénticas en los datos.
--
-- EL QUINTO MOTIVO
--
--   `SIN_CLARIDAD_PAGADOR` no existía como botón, así que nadie lo reportaba:
--   la sede tocaba "saturación" y la causa real se perdía. Es incómodo de
--   decir y es exactamente lo que hay que decir — medirlo es lo único que
--   permite atacarlo.
--
-- QUÉ ES INMUTABLE Y QUÉ NO
--
--   `codigo`    inmutable. Es lo que se guarda y lo que se agrupa.
--   `etiqueta`  editable. Es lo único que se pinta.
--   `vigente`   false = ya no se ofrece. **NUNCA se borra una fila**: el
--               handshake de hace tres meses tiene que seguir resolviendo su
--               etiqueta.

create table if not exists motivo_rechazo (
  codigo      text primary key,
  etiqueta    text not null,
  categoria   text not null
              check (categoria in ('capacidad','recurso_humano','tecnico','administrativo')),
  version     int  not null default 1,
  vigente     boolean not null default true,
  creado_en   timestamptz not null default now()
);

comment on table motivo_rechazo is
  'Catálogo versionado de declaraciones de capacidad. El código es inmutable; '
  'la etiqueta se puede corregir sin partir la serie histórica.';

comment on column motivo_rechazo.categoria is
  'capacidad / recurso_humano / tecnico / administrativo. La categoría '
  'administrativa se reporta aparte: es la evidencia de la tesis del producto.';

-- Semilla: los cuatro que ya se ofrecían + el que faltaba.
-- `on conflict do nothing` para no pisar una etiqueta corregida en producción.
insert into motivo_rechazo (codigo, etiqueta, categoria, version) values
  ('SIN_CAMAS_UCI',        'Sin camas UCI disponibles',            'capacidad',      1),
  ('HEMODINAMIA_OCUPADA',  'Sala de hemodinamia en procedimiento', 'tecnico',        1),
  ('URGENCIAS_SATURADAS',  'Urgencias en capacidad máxima',        'capacidad',      1),
  ('SIN_ESPECIALISTA',     'Sin especialista de turno',            'recurso_humano', 1),
  ('SIN_CLARIDAD_PAGADOR', 'Sin claridad del pagador',             'administrativo', 2)
on conflict (codigo) do nothing;

-- ── El handshake guarda el código, no el texto ─────────────────
--
-- `motivo_rechazo` (texto) SE CONSERVA a propósito: es la etiqueta congelada
-- al momento del rechazo. Si mañana se reescribe la etiqueta del catálogo, el
-- historial sigue mostrando lo que el jefe de urgencias realmente leyó cuando
-- tocó el botón. El código es para agregar; el texto es para el acta.

alter table handshake add column if not exists motivo_codigo text
  references motivo_rechazo(codigo);

-- Reportar la categoría administrativa aparte es la consulta que justifica
-- todo esto. Sin este índice hace seq scan sobre el activo del producto.
create index if not exists handshake_motivo_codigo_idx
  on handshake (motivo_codigo)
  where motivo_codigo is not null;

-- ── RLS ────────────────────────────────────────────────────────
--
-- Misma regla que 0001 y 0003: en Supabase, una tabla de `public` SIN rls
-- queda abierta a lectura Y ESCRITURA por PostgREST para el rol `anon`, y la
-- llave anon viaja en el bundle del navegador.
--
-- Este catálogo sí lleva lectura pública: no hay dato de paciente en él y las
-- consolas lo pintan. La escritura no la tiene nadie salvo la service role
-- key — una etiqueta editable por cualquiera es una serie histórica editable
-- por cualquiera.

alter table motivo_rechazo enable row level security;

drop policy if exists motivo_rechazo_lectura_publica on motivo_rechazo;
create policy motivo_rechazo_lectura_publica
  on motivo_rechazo for select using (true);

revoke insert, update, delete on table motivo_rechazo from anon, authenticated;

-- ── Down ───────────────────────────────────────────────────────
--
-- Deliberadamente comentado: bajar esto BORRA la columna que guarda por qué
-- rebotó cada traslado, y eso no se recupera. Si hay que revertir, se
-- descomenta a mano y se asume la pérdida.
--
-- drop index if exists handshake_motivo_codigo_idx;
-- alter table handshake drop column if exists motivo_codigo;
-- drop table if exists motivo_rechazo;
