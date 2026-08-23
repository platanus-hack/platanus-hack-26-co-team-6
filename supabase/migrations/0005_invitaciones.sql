-- ═══════════════════════════════════════════════════════════════
--  PULSO — 0005 · invitaciones a una organizacion
--  Dueño: Juan · tarea 2.5
--  Correr en: Supabase → SQL Editor → pegar todo → Run
-- ═══════════════════════════════════════════════════════════════
--
-- POR QUE EXISTE ESTA TABLA
--
--   Es como entra el segundo humano de una organizacion. Sin ella, el unico
--   actor de una IPS es el que creo la afiliacion (tarea 2.1) y no hay forma
--   de sumar al jefe de urgencias del turno de noche sin que alguien reparta
--   una contraseña por WhatsApp — que es exactamente lo que hoy pasa y lo que
--   AGENTS.md lista como "una contraseña compartida abre las tres consolas".
--
-- ⚠️ SOLO EL HASH DEL TOKEN
--
--   `token_hash` y no `token`. El token son 32 bytes aleatorios que existen
--   una sola vez: en la respuesta que crea la invitacion y en el enlace que
--   recibe el invitado. Guardar el token en claro convertiria esta tabla en un
--   llavero: quien la lea entra como cualquiera de los invitados pendientes,
--   con el rol que se le concedio.
--
--   La consecuencia practica, y hay que asumirla: **un token perdido no se
--   recupera, se reemplaza**. Core no puede reenviar "el mismo enlace" porque
--   tampoco lo sabe. Reinvitar revoca el anterior y emite uno nuevo.
--
-- POR QUE NO HAY FOREIGN KEYS TODAVIA
--
--   `organizacion` y `actor` las crea la tarea 1.1 y aun no existen. Una FK a
--   una tabla ausente no compila, y adelantar aqui la definicion de esas dos
--   tablas seria pisarle el esquema a otro carril. Las columnas quedan
--   tipadas y comentadas; el `alter table` que cierra el circulo esta escrito
--   al final de este archivo, comentado, listo para el dia que 1.1 mergee.

create table if not exists invitacion (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,          -- → organizacion(id), ver el final
  correo          text not null,
  rol             text not null check (rol in (
                    'paramedico',
                    'jefe_urgencias',
                    'admin_organizacion',
                    'regulador_crue',
                    'auditor',
                    'admin_plataforma'
                  )),
  codigo_sede     text,                   -- alcance opcional; null = toda la org
  token_hash      text not null unique,   -- sha256 hex del token de 32 bytes
  creada_en       timestamptz not null default now(),
  expira_en       timestamptz not null,
  aceptada_en     timestamptz,
  revocada_en     timestamptz,
  invitada_por    uuid not null,          -- → actor(id), ver el final
  actor_creado_id uuid,                   -- → actor(id), el que nacio al aceptar

  -- `servicio` NO esta en el check de arriba, y es deliberado: un token de
  -- servicio (`svc:voz`) no es una persona y lo emite POST /auth/servicio
  -- (tarea 1.8), solo para admin_plataforma. Una invitacion por correo que
  -- crea credenciales de servicio seria la forma mas barata de conseguir unas.

  -- Aceptada implica que se sabe a quien creo. Sin esto, una fila puede decir
  -- "alguien acepto" sin decir quien, y la auditoria de esa concesion se
  -- pierde justo en el momento que importa.
  constraint invitacion_aceptada_tiene_actor check (
    (aceptada_en is null) = (actor_creado_id is null)
  ),

  -- Una invitacion no se acepta y se revoca: son estados excluyentes. Si
  -- hicieran falta los dos, el modelo correcto es un evento, no una columna.
  constraint invitacion_no_aceptada_y_revocada check (
    aceptada_en is null or revocada_en is null
  ),

  constraint invitacion_vigencia_positiva check (expira_en > creada_en)
);

comment on table invitacion is
  'Como entra el segundo humano de una organizacion. Un solo uso, 72 h de '
  'vigencia. En claro no queda el token: solo su sha256.';

comment on column invitacion.token_hash is
  'sha256 (hex) del token de 32 bytes. NUNCA el token. El unico sitio donde '
  'el token existe es el enlace que tiene el invitado.';

comment on column invitacion.revocada_en is
  'Revocar es marcar, no borrar: la invitacion revocada sigue en la tabla '
  'porque es parte de la historia de quien intento entrar y no entro.';

-- El camino caliente es GET/POST /invitacion/:token, que resuelve por hash.
-- Ya hay indice por el `unique` de la columna; este es el otro camino, la
-- tabla de /panel/equipo: las invitaciones de una organizacion, recientes
-- primero.
create index if not exists invitacion_org_idx
  on invitacion (organizacion_id, creada_en desc);

-- Reinvitar tiene que poder encontrar la pendiente del mismo correo sin
-- recorrer la organizacion entera.
create index if not exists invitacion_org_correo_idx
  on invitacion (organizacion_id, lower(correo));

-- Una sola invitacion PENDIENTE por correo y organizacion. Parcial a
-- proposito: las aceptadas y las revocadas se acumulan sin estorbar —son la
-- auditoria—, pero dos enlaces vivos para el mismo puesto son una credencial
-- de mas circulando.
create unique index if not exists invitacion_pendiente_unica_idx
  on invitacion (organizacion_id, lower(correo))
  where aceptada_en is null and revocada_en is null;

-- La purga de invitaciones vencidas la corre el worker de retencion (5.8).
-- Ojo: purgar borra auditoria. Lo que se puede tirar es el `token_hash` de las
-- vencidas —ya no sirve para nada—, no la fila.
create index if not exists invitacion_expira_en_idx
  on invitacion (expira_en);

-- ── RLS ────────────────────────────────────────────────────────
--
-- Misma regla que 0001 y 0003: en Supabase, una tabla de `public` SIN rls
-- queda abierta a lectura Y escritura por PostgREST para el rol `anon`, y la
-- llave anon viaja en el bundle del navegador.
--
-- Aqui el riesgo es concreto y peor que en las otras tablas: sin esto,
--
--     curl "$SUPABASE_URL/rest/v1/invitacion?select=*" -H "apikey: $ANON_KEY"
--
-- devuelve el directorio de correos de todas las organizaciones afiliadas
-- junto con el rol que se le concedio a cada quien. Es una lista de objetivos
-- de phishing con el cargo incluido.
--
-- Sin policy no hay puerta. Core habla con la service role key (que se salta
-- RLS) o por conexion directa: cerrar aqui no le quita nada al servicio.
--
-- ⚠️ Y la trampa de siempre (multitenancy §6.1): owners y superusuarios se
--    saltan RLS por defecto. Cuando 1.1 endurezca el esquema, esta tabla
--    necesita ademas `alter table invitacion force row level security`.

alter table invitacion enable row level security;

revoke all on table invitacion from anon, authenticated;

-- ── Lo que se conecta cuando 1.1 cree `organizacion` y `actor` ─────
--
-- No se descomenta aqui ni se adelanta: cada tabla la crea su dueño. El dia
-- que 1.1 mergee, esto es una migracion de tres lineas.
--
--   alter table invitacion
--     add constraint invitacion_organizacion_fk
--       foreign key (organizacion_id) references organizacion(id),
--     add constraint invitacion_invitada_por_fk
--       foreign key (invitada_por) references actor(id),
--     add constraint invitacion_actor_creado_fk
--       foreign key (actor_creado_id) references actor(id);
--
-- Ninguna de las tres lleva `on delete cascade`, y es la decision importante
-- del archivo: la regla 4 del repo dice que nadie borra. Si algun dia alguien
-- intenta borrar una organizacion, que la FK lo detenga en vez de arrastrarse
-- en silencio la evidencia de quien invito a quien.
