-- ═══════════════════════════════════════════════════════════════
--  Tarea 1.2 · persistir `caso` y `handshake`
--  Dueño: Neid
-- ═══════════════════════════════════════════════════════════════
--
--  Hasta hoy `AlmacenService` era un Map en RAM. Al reiniciar core se
--  perdían: todos los casos, todos los handshakes, el historial de
--  aceptación por sede, la ventana de rechazos de 6 h y las latencias.
--
--  El "dataset que se auto-etiqueta" que el README llama el activo del
--  producto vivía en la memoria de un proceso, y un Ctrl+C lo borraba.
--
--  Las tablas ya existían en 0001 y nadie escribía en ellas. Esto agrega
--  las columnas que faltaban y los índices de las consultas que el motor
--  hace en el camino caliente.
-- ═══════════════════════════════════════════════════════════════

-- ── Multi-inquilino y trazabilidad ─────────────────────────────
-- Nulables POR AHORA: el backfill de abajo las llena y 1.6 las hará
-- obligatorias con RLS. Nunca dejar `organizacion_id` nulo cuando esa
-- tarea entre: bajo RLS un nulo es invisible o es visible para todos, y
-- las dos opciones son malas.

alter table caso add column if not exists organizacion_id uuid references organizacion(id);
alter table caso add column if not exists movil_id        text;
alter table caso add column if not exists creado_por      text;
-- Seudónimo del paciente. Hoy nadie lo llena; existe para que 5.8 pueda
-- purgar la PII sin borrar la fila, que es lo que sostiene la auditoría.
alter table caso add column if not exists paciente_token  text;
-- Quién reportó, si entró por WhatsApp. Es PII: 5.8 lo purga.
alter table caso add column if not exists telefono_reporta text;
-- Con qué versión de prompt se extrajo. Prepara 3.12.
alter table caso add column if not exists version_prompt  text;
alter table caso add column if not exists motor           text;

alter table handshake add column if not exists organizacion_id uuid references organizacion(id);
-- La línea base contra la que el vigilante mide si un traslado se demora.
alter table handshake add column if not exists eta_min_al_despachar real;
alter table handshake add column if not exists demora_avisada boolean not null default false;
-- Cuándo vence la solicitud. Si no se persiste, al reiniciar core todos los
-- handshakes pendientes quedan sin plazo y el vigilante no los vence nunca.
alter table handshake add column if not exists expira_en timestamptz;

-- ── Índices del camino caliente ────────────────────────────────
-- `historialSede`, `rechazosEnVentana(6h)` y `latenciasRespuestaMin` dejan
-- de ser estado en RAM y pasan a ser PROYECCIONES sobre estas filas — que
-- es lo que siempre debieron ser. Sin estos índices, cada scoring de cada
-- sede haría un scan.

create index if not exists handshake_sede_estado_idx
  on handshake (codigo_sede, estado, respondido_en desc);

-- Parcial: la ventana de 6 h sólo mira rechazos, y son una fracción.
create index if not exists handshake_rechazos_idx
  on handshake (codigo_sede, respondido_en desc)
  where estado = 'rechazado';

create index if not exists caso_creado_idx on caso (creado_en desc);
create index if not exists caso_organizacion_idx on caso (organizacion_id, creado_en desc);

-- ── Backfill ───────────────────────────────────────────────────
-- Los casos previos se asignan a una organización "histórica". Es lo que
-- evita el nulo cuando 1.6 encienda RLS.
-- `where not exists` en vez de `on conflict`: la unicidad de `organizacion`
-- puede estar en una columna distinta según cómo quedó 0004, y un conflicto
-- mal apuntado fallaría en silencio.

-- `tipo` y `estado` salen de los check de 0004: 'operador_ambulancia'
-- (singular) y 'activa'. Un valor fuera del check aborta la migración
-- entera, así que se copian tal cual, no de memoria.
insert into organizacion (id, tipo, razon_social, nombre_corto, nit, estado, verificacion)
select
  '00000000-0000-0000-0000-000000000001'::uuid,
  'operador_ambulancia',
  'Histórica — datos previos a la afiliación',
  'Histórica',
  '000000000',
  'activa',
  'manual'
where not exists (
  select 1 from organizacion where id = '00000000-0000-0000-0000-000000000001'::uuid
);

update caso      set organizacion_id = '00000000-0000-0000-0000-000000000001'::uuid
  where organizacion_id is null;
update handshake set organizacion_id = '00000000-0000-0000-0000-000000000001'::uuid
  where organizacion_id is null;
