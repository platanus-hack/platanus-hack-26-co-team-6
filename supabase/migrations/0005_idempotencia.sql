-- ═══════════════════════════════════════════════════════════════
--  PULSO — 0005 · idempotencia generica
--  Dueño: Sebas · tarea 2.11
--  Correr en: Supabase → SQL Editor → pegar todo → Run
-- ═══════════════════════════════════════════════════════════════
--
-- POR QUÉ EXISTE ESTA TABLA
--
--   Spec §0: "Reintentos por mala conectividad de la ambulancia son la
--   norma, no la excepción." Hasta ahora la idempotencia existía SOLO
--   dentro del kernel de ruteo (`pulso_routing_idempotency`, migración
--   0002) y ninguna otra mutación la tenía: un `POST /dispatch`
--   reintentado creaba DOS handshakes y despachaba dos veces.
--
--   Esta tabla es esa misma idea, generalizada a cualquier ruta.
--
-- CLAVE Y HUELLA
--
--   `clave`  la manda el cliente en `Idempotency-Key` e identifica LA
--            ACCIÓN: el mismo despacho reintentado tres veces lleva la
--            misma clave las tres.
--   `huella` la calcula el servidor con método, ruta y cuerpo. Si la misma
--            clave llega con una huella distinta, es un cliente reusando
--            claves — y eso es un 409, no un 200 con el resultado viejo.
--
-- `resultado` NULO SIGNIFICA "TODAVÍA CORRIENDO"
--
--   El insert es el candado: quien gana la llave primaria ejecuta, quien la
--   pierde es un reintento. Mientras `resultado` sea null, la petición
--   original sigue en vuelo y al reintento se le pide esperar.

create table if not exists idempotencia (
  clave         text primary key,
  huella        text not null,
  resultado     jsonb,
  creado_en     timestamptz not null default now(),
  completado_en timestamptz
);

comment on table idempotencia is
  'Una fila por acción con Idempotency-Key. `resultado` null = la petición '
  'original todavía está corriendo. Se purga a las 24 h.';

comment on column idempotencia.huella is
  'sha256 de método + ruta + cuerpo canónico. Detecta la misma clave usada '
  'para dos peticiones distintas, que casi siempre es un bug del cliente.';

-- ⚠️ SIN PII. `resultado` guarda la respuesta que ya viajó al cliente, que
--    pasa por `despojar()` — nunca el dictado crudo ni el origen. Si algún
--    día una respuesta lleva PII, esta tabla la persistiría 24 h: revisar
--    aquí antes de agregar campos a una respuesta.

-- La purga por antigüedad la corre el worker de retención (tarea 5.8). Sin
-- este índice hace seq scan sobre la tabla entera cada vez.
create index if not exists idempotencia_creado_en_idx on idempotencia (creado_en);

-- ── RLS ────────────────────────────────────────────────────────
--
-- Misma regla que 0001, 0003 y 0004: en Supabase, una tabla de `public` SIN
-- rls queda abierta a lectura Y ESCRITURA por PostgREST para el rol `anon`,
-- y la llave anon viaja en el bundle del navegador.
--
-- Aquí no hay policy de lectura para nadie: `resultado` contiene respuestas
-- de otros actores y no es dato de nadie más. Core habla por conexión
-- directa y no pasa por PostgREST.

alter table idempotencia enable row level security;

revoke all on table idempotencia from anon, authenticated;

-- ── Down ───────────────────────────────────────────────────────
--
-- drop index if exists idempotencia_creado_en_idx;
-- drop table if exists idempotencia;
