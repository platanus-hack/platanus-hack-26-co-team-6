-- ═══════════════════════════════════════════════════════════════
--  PULSO — 0003 · acuse de webhooks entrantes (idempotencia)
--  Dueño: Juan · tarea 0.4
--  Correr en: Supabase → SQL Editor → pegar todo → Run
-- ═══════════════════════════════════════════════════════════════
--
-- POR QUÉ EXISTE ESTA TABLA
--
--   Meta reintenta un webhook con backoff exponencial HASTA 7 DÍAS ante
--   cualquier 4xx/5xx o timeout. Twilio y Telegram reintentan también.
--   Un reintento sobre `registrar_caso` crea DOS casos y despacha DOS
--   ambulancias al mismo paciente: es el bug más caro del sistema.
--
--   `voz` ya deduplicaba en memoria (un `set` en el proceso). Eso deja de
--   existir justo donde importa: con dos instancias en Render, el reintento
--   cae en la otra instancia, que nunca vio el primer mensaje. La
--   deduplicación tiene que vivir donde las dos instancias la vean.
--
-- POR QUÉ LA LLAVE ES COMPUESTA
--
--   Un `wamid` de Meta y un `CallSid` de Twilio no comparten espacio de
--   nombres. Sin `proveedor` en la llave, dos ids iguales de proveedores
--   distintos se pisarían — improbable, pero el modo de fallo es descartar
--   una emergencia real y en silencio.

create table if not exists webhook_recibido (
  proveedor   text not null check (proveedor in ('whatsapp','telegram','twilio')),
  id_externo  text not null,          -- wamid, update_id, CallSid
  recibido_en timestamptz not null default now(),
  resultado   jsonb,
  primary key (proveedor, id_externo)
);

comment on table webhook_recibido is
  'Acuse de recibo de cada webhook entrante. El insert es el candado: quien '
  'gana el insert procesa, quien choca es un reintento y responde con `resultado`.';

comment on column webhook_recibido.resultado is
  'Qué pasó con el mensaje, para poder responderle lo mismo al reintento. '
  'SIN PII: aquí no entra el dictado ni el origen del paciente.';

-- La purga por antigüedad la corre el worker de retención (tarea 5.8). Sin
-- este índice, esa purga hace seq scan sobre la tabla entera cada vez.
create index if not exists webhook_recibido_recibido_en_idx
  on webhook_recibido (recibido_en);

-- ── RLS ────────────────────────────────────────────────────────
--
-- Misma regla que 0001: en Supabase, una tabla de `public` SIN rls queda
-- abierta a lectura Y escritura por PostgREST para el rol `anon`, y la llave
-- anon viaja en el bundle del navegador. `voz` habla con la service role key
-- (o por conexión directa), que se salta RLS: cerrar aquí no le quita nada al
-- servicio y le quita todo a un desconocido.
--
-- Sin policy no hay puerta: quien llegue por anon no lee ni escribe. Esta
-- tabla no tiene lectura pública porque `id_externo` es un identificador de
-- conversación de WhatsApp — no es PII clínica, pero tampoco es dato abierto.

alter table webhook_recibido enable row level security;

revoke all on table webhook_recibido from anon, authenticated;
