# PULSO — El agente de campo, qué cruza y qué no, y el modelo de roles que falta

> Análisis del estado real del repo (ago 22, commit `8ecb5e1`) + plan de datos y roles.
> Cruza los cuatro carriles. Nada de esto es opinión: cada afirmación apunta a un archivo.

---

## Parte 1 — Respuestas directas

### 1.1 ¿Qué prompt tiene el agente de campo?

**No hay un agente de campo. Hay cuatro prompts distintos, y solo dos están conectados a código.**

| # | Prompt | Dónde vive | ¿Corre hoy? | Qué hace |
|---|---|---|---|---|
| A | Extracción clínica | `apps/backend/ai-core/app/triage.py:36` | ✅ Sí | Dictado crudo → `ExtraccionClinica` (structured output). Catálogo REPS inyectado en el prompt, prohibición explícita de inventar CIE-10, "ante duda escoge el triage MÁS grave". |
| A' | Copia en TypeScript | `apps/backend/core/src/triage/triage.service.ts:228` | ✅ Sí (respaldo) | El mismo prompt carácter por carácter. Corre cuando ai-core no está. **Divergen en silencio si tocas uno solo.** |
| B | Enrutador de intención | `apps/backend/ai-core/app/agente/herramientas.py:135` | ✅ Sí | Mensaje suelto de WhatsApp → UNA de 6 tools (`registrar_caso`, `confirmar_llegada`, `reportar_demora`, `pedir_ubicacion`, `consultar_estado`, `no_entendido`). No conversa: clasifica. |
| C | **Agente de campo (persona)** | `apps/backend/ai-core/app/agente/prompts/agente_reporte.txt` | ❌ **No** | La persona completa: voz de radio, "nunca prometas una cama", "no diagnosticas", flujo reporte→destino→espera→cambio→llegada. |
| D | Agente de seguimiento | `apps/backend/ai-core/app/agente/prompts/agente_seguimiento.txt` | ❌ **No** | Llamada saliente cuando el traslado se pasa 1.5x su ETA. Sección `APOYO` declarada SIN DEFINIR a propósito. |

**El hallazgo importante:** los prompts C y D son los buenos —los que suenan a producto— y **ningún código de Python los abre**. Solo existen como IDs de configuración vacíos:

```python
# apps/backend/ai-core/app/config.py:80-81
elevenlabs_agente_reporte_id: str = ""
elevenlabs_agente_seguimiento_id: str = ""
```

Son especificaciones para agentes de ElevenLabs que **nadie ha creado todavía**. `WS /telefonia/twilio` acepta la conexión de Twilio y la cierra limpio: el puente de audio no está. Sigue bloqueado por una decisión abierta (ElevenLabs Agents vs. Deepgram Voice Agent — ver `docs/neid-faltantes.md`).

> **Traducción para el pitch:** hoy el agente *extrae* y *clasifica*. No *conversa*. La conversación existe escrita, sin motor.

### 1.2 ¿Cruza el historial clínico de las personas?

**No, y es deliberado. No hay ni un solo dato identificable del paciente en todo el repo.**

Grep sobre `apps/`, `supabase/` y `docs/`: cero ocurrencias de `historia_clinica`, `cedula`, `documento_identidad`, `afiliacion`, `RIPS`, `FURIPS`, `alergia`, `antecedente` como campo. El `Caso` completo (`contracts/types.ts`) es:

```
resumen · triage · dxCie10 · dxDescripcion · serviciosRequeridos · complejidadRequerida
edad · sexo · signosAlarma · requiereMedicoABordo · confianza
textoCrudo · origen · tipoMovil · unidad · telefonoReporta
```

Ni nombre, ni documento, ni EPS. Y está escrito como regla:

- `docs/PULSO-validaciones-backend.md` §1.8 — *"el motor de matching opera sobre atributos clínicos, no sobre identidad"*.
- §9.4 — *"el dataset de aprendizaje se conserva disociado de la identidad del paciente → privacidad + moat sin PII"*.
- `estado.service.ts::despojar()` — lista blanca campo por campo; `textoCrudo` y `origen` ni siquiera salen a las consolas.

**Lo único que se cruza con historia es la de la SEDE, no la del paciente:**
- `almacen.historialSede()` → aceptados/rechazados → `pAceptacion` (posterior Beta-Bernoulli).
- `rechazosEnVentana(sede, 6h)` → señal viva de congestión (peso 0.35).

**Conclusión:** no es un agujero, es la postura. El agujero real es otro y está más abajo (§2.5): **no hay puente**. El hospital receptor no puede traer contexto previo del paciente, y PULSO no escribe nada en el registro del paciente. Eso es decisión de fase 2 con peso legal (Ley 1581/2012, Ley 2015/2020).

### 1.3 ¿Genera el reporte de todo lo que hace el paramédico?

**No. Hay auditoría de la MÁQUINA, no registro del PARAMÉDICO.**

Lo que sí existe:

| Qué | Dónde | Alcance |
|---|---|---|
| Auditoría de decisión de ruteo | `supabase/migrations/0002_*.sql` → `pulso_routing_decision_audit` | Append-only real (triggers rechazan UPDATE/DELETE/TRUNCATE), con `modelVersion` + `configVersion` obligatorios. Registra **qué decidió el motor**. |
| Handshakes | tabla `handshake` | A quién se le preguntó, quién aceptó/rechazó, con qué motivo, latencia. |
| Bitácora del CRUE | `components/crue/bitacora.ts` | **`localStorage` del navegador.** Rotulada "registro local" a propósito. No es auditoría. |
| Historial en `/hospital` | `components/hospital/HistorialAuditoria.tsx` | Vista de sesión, no persistida. |

Lo que **no** existe:
- Ningún registro de atención prehospitalaria (el equivalente al formato que el paramédico llena hoy a mano).
- Ninguna exportación: no hay PDF, no hay CSV de caso, no hay FURIPS, no hay entrega al hospital.
- **Las demoras que el propio paramédico reporta se pierden**: `despachador.py:132` — `# TODO: cuando core exponga registro de demoras, mandarlo allá. Hoy sólo queda en el log`.
- Ninguna línea de tiempo del traslado (salida → llegada a escena → salida de escena → llegada a puerta → entrega).
- Y el problema de fondo: **`AlmacenService` es un `Map` en memoria**. Al reiniciar core, casos y handshakes desaparecen. Aunque quisieras generar el reporte, hoy no hay de dónde.

### 1.4 ¿Les dice a qué hospital ir con base en dónde están?

**Sí. Esto es lo único del sistema que está completo de punta a punta.**

```
/campo (useGeolocalizacion)
   └→ POST /triage {texto, origen, tipoMovil, unidad}
        └→ POST /match {caso}
             1. sedes_cercanas(lat,lng,25km)   PostGIS ST_DWithin, límite 60
             2. Mapbox Matrix driving-traffic   (o haversine/22km-h si no hay token)
             3. FILTRO DURO + score EN MINUTOS
                  └→ POST /dispatch → Telegram/WhatsApp → handshake
```

El **filtro duro que corre de verdad** (`scoring.service.ts:203-222`) son tres cosas: servicios REPS habilitados, complejidad suficiente, y tipo de móvil. El score blando es `ruta + riesgoRechazo + espera − bono`, todo en minutos.

Por WhatsApp el circuito también cierra: `despachador.py::_registrar_caso` toma el ganador, despacha, y **manda el pin de ubicación sin que se lo pidan**.

Si el ranking sale vacío, no devuelve lista vacía: escala al CRUE (`MotivoEscalamiento: 'sin-candidatos'`). Ese invariante está bien puesto.

**Tres reservas honestas sobre esta respuesta:**

1. **`evaluateEligibility()` está escrito y no está conectado.** `routing/eligibility-policy.ts` implementa los filtros de la spec (incluido `NO_AVAILABLE_BED`) y **nadie lo llama fuera de su propio `.spec.ts`**. Si se conectara tal cual, filtraría camas contra el snapshot REPS del **2022-11-30**, que trae sedes con `ocupadasSnapshot > total` (Clínica La Inmaculada: 108 camas, 119 ocupadas). Un filtro duro sobre dato de hace 4 años descarta hospitales que hoy sí pueden recibir. **No conectarlo sin resolver esto.**
2. **`movilCompatible(caso.tipoMovil, caso.requiereMedicoABordo)` no depende de la sede.** Es una condición del caso evaluada dentro del bucle de destinos: si el paciente requiere médico a bordo y el móvil es TAB, **las descarta todas** y el caso escala. El resultado final es correcto (un TAB no puede llevar ese paciente), pero se le echa la culpa al hospital en la UI. El móvil pertenece a la ambulancia, no al destino — y ahí está la pista del §2.3.
3. **La ruta real no existe todavía.** El mapa de `/campo` dibuja un arco decorativo porque core no expone geometría de ruta.

---

## Parte 2 — Diagnóstico: los cinco agujeros del modelo de información

Esto es lo que hay que arreglar, en orden de cuánto bloquea a lo demás.

### 2.1 No hay identidad. Hay una contraseña de turno.

`auth/sesion.service.ts` lo dice sin maquillaje: *"una contraseña compartida para todo el turno. No hay usuarios en el sistema"*. Y `contracts/types.ts` sobre `Unidad`: *"No lo uses para autorizar nada: quien tiene la contraseña del turno puede escribir el id que quiera"*.

Consecuencias en cadena:
- Cualquiera con la contraseña puede aceptar por **cualquier** hospital. La spec §8.2 exige lo contrario.
- El servicio `voz` se autentica **con la contraseña de los operadores** (`CORE_PASSWORD`) → la auditoría no distingue si actuó un humano o el bot.
- El campo `atendidoPor` de `Escalamiento` es texto libre sin nadie detrás.
- Sin actor no hay reporte del paramédico (§1.3) ni auditoría con nombre (spec §11.1).

### 2.2 La sede es un registro plano del REPS, no una entidad operativa

`Sede` tiene: código, nombre, dirección, localidad, coord, naturaleza, complejidad, teléfono, servicios[], camas[]. Todo es **snapshot estático**. Falta todo lo que cambia:

- **Estado operativo declarado** (spec §2.7: "no recibir", contingencia, cierre temporal). No existe. Un hospital en contingencia sigue apareciendo #1.
- **Vigencia de la habilitación** (spec §2.2). `servicio_sede` no tiene fechas.
- **Población del servicio** (spec §2.4). "UCI" es un código; adulto/pediátrico/neonatal se distingue solo por el nombre del servicio, no por dato estructurado. Un paciente de 54 años puede rutearse contra una UCI neonatal si el LLM pide el código equivocado.
- **Capacidad declarada por el propio hospital**. Solo hay `ocupadasSnapshot` de 2022. `sedes.json` incluso trae `serviciosInferidos: true` en muchas sedes — servicios **deducidos**, no habilitados.
- **A quién se le avisa**. Hoy es un `TELEGRAM_CHAT_ID_DEMO` global: *todos* los handshakes van al mismo chat.

### 2.3 La ambulancia no existe como entidad

Solo hay `Unidad { id, tripulante? }` declarada desde el navegador, sin validación. Pero:
- `data/procesado/ambulancias.json` ya tiene **225 prestadores reales** con marca básico/medicalizado (112 TAB, 53 TAM).
- `tipoMovil` es un filtro duro que hoy se declara solo (§1.4, reserva 2).
- Sin entidad móvil no hay: posición en vivo, disponibilidad, cobertura de ciudad para el CRUE, ni tiempos por unidad.

### 2.4 El caso no tiene línea de tiempo

`Caso` tiene un solo timestamp: `creadoEn`. `Handshake` tiene tres. No existen los eventos que forman un traslado: llegada a escena, salida, llegada a puerta, entrega, cierre. `confirmar_llegada` los **recibe por WhatsApp y los tira** (`despachador.py:118-127` solo limpia la sesión).

Sin línea de tiempo no hay reporte (§1.3), no hay métricas de negocio (spec §11.2), y no hay con qué probar el "minutos ganados" del pitch más allá del cronómetro de una pantalla.

### 2.5 No hay puente clínico en ninguna de las dos direcciones

Ni el hospital recibe contexto previo del paciente, ni PULSO devuelve nada al registro del paciente. Eso está bien para el hackathon —y hay que decirlo así— pero es lo primero que va a preguntar un jurado de salud.

---

## Parte 3 — El plan

Seis fases. **F1 desbloquea todo lo demás**; F2–F4 son paralelizables entre carriles; F5 y F6 son de producto.

### F1 · Identidad y roles (bloquea a todas) — carril Zaid + Sebas

Reemplaza la contraseña de turno por tres tablas. **No es un sistema de usuarios completo**: es lo mínimo para que una acción tenga dueño.

```sql
-- Organización: quién es una entidad del sistema
create table organizacion (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null check (tipo in ('ips','proveedor_ambulancia','crue')),
  nombre        text not null,
  -- Si tipo='ips', apunta al REPS. Es la costura con el catálogo existente.
  codigo_sede   text references sede(codigo),
  nit           text,
  activa        boolean default true
);

-- Actor: una persona o un servicio. NO es "usuario final".
create table actor (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid references organizacion(id),
  tipo            text not null check (tipo in ('humano','servicio')),
  nombre          text not null,           -- "Jefe urgencias turno noche" | "voz"
  identificador   text unique not null,    -- login, o 'svc:voz'
  password_hash   text,                    -- null para servicios (usan token propio)
  activo          boolean default true
);

-- Rol: qué puede hacer, en el alcance de su organización
create table actor_rol (
  actor_id  uuid references actor(id) on delete cascade,
  rol       text not null check (rol in ('paramedico','jefe_urgencias','regulador_crue','admin','servicio')),
  primary key (actor_id, rol)
);
```

**Los cuatro roles y su alcance** (traduce spec §8.1 a código):

| Rol | Ve | Puede | No puede |
|---|---|---|---|
| `paramedico` | Sus casos abiertos + ranking | Crear caso, despachar, escalar, cerrar traslado | Ver casos de otros móviles, responder por un hospital |
| `jefe_urgencias` | Solicitudes dirigidas a **su** `codigo_sede` | Aceptar/rechazar **las suyas**, declarar estado operativo y capacidad de su sede | Ver casos que no le fueron dirigidos, responder por otra IPS |
| `regulador_crue` | La red completa, escalamientos, congestión | Override con justificación obligatoria, forzar destino, atender escalamiento | Modificar auditoría |
| `servicio` | Solo lo que necesita su función | `voz`: crear casos y notificar | Nada de humano |

**Cambios de código concretos:**
1. `sesion.service.ts::emitir(sub)` — el `sub` deja de ser `'operador'` fijo y pasa a ser `{actorId, rol, organizacionId}`. El guard ya escribe `req.operador`, así que el punto de inyección existe.
2. Decorador `@Rol('jefe_urgencias')` + `RolGuard` junto al `SesionGuard` global.
3. `handshake/respond` valida que `actor.organizacion.codigo_sede === handshake.sedeCodigo` → si no, **403 + registro del intento cruzado** (spec §8.2).
4. `voz` deja de usar `CORE_PASSWORD` y usa un token de servicio `sub: 'svc:voz'` (la deuda que Neid ya identificó).
5. **Token de un solo uso** en los botones de Telegram/WhatsApp (spec §8.3): hoy el `callback_data` es `a:<uuid>` y es reproducible.

> **Escape de demo:** si a 12h del pitch esto no está, el modo degradado es login con `?rol=` y sede fija por variable de entorno. Lo que **no** se degrada es el 403 cruzado: es la línea que hace verdadera la frase "cada IPS responde por lo suyo".

### F2 · La sede como entidad viva — carril Zaid

Cuatro tablas nuevas sobre el catálogo REPS que ya existe. **No se toca `sede`**: se le cuelgan estados.

```sql
-- Lo que el hospital DECLARA de sí mismo. Reemplaza el snapshot 2022 cuando existe.
create table sede_estado (
  codigo_sede   text primary key references sede(codigo),
  operativo     text not null default 'recibiendo'
                check (operativo in ('recibiendo','saturado','contingencia','cerrado')),
  motivo        text,
  declarado_por uuid references actor(id),
  declarado_en  timestamptz default now(),
  vence_en      timestamptz          -- una declaración caduca; si no, nadie la revierte
);

-- Capacidad declarada, por tipo. Append-only: es serie de tiempo, no estado editable.
create table capacidad_declarada (
  id            bigint generated always as identity primary key,
  codigo_sede   text references sede(codigo),
  tipo          text not null,            -- 'UCI-Adultos', 'Urgencias-Camillas'...
  disponibles   int  not null check (disponibles >= 0),
  declarado_por uuid references actor(id),
  declarado_en  timestamptz default now()
);

-- Vigencia de la habilitación (spec §2.2) y población del servicio (§2.4)
alter table servicio_sede add column vigente_desde date;
alter table servicio_sede add column vigente_hasta date;
alter table servicio_sede add column poblacion text
  check (poblacion in ('adulto','pediatrico','neonatal','mixto'));

-- A quién se le avisa. Mata el TELEGRAM_CHAT_ID_DEMO global.
create table sede_canal (
  codigo_sede text references sede(codigo),
  canal       text check (canal in ('telegram','whatsapp','consola')),
  destino     text not null,     -- chat_id | teléfono E.164
  prioridad   int default 1,
  primary key (codigo_sede, canal, destino)
);
```

**Reglas que esto habilita, en orden de valor:**

1. **`operativo != 'recibiendo'` es filtro duro** (spec §2.7). Un hospital que declaró contingencia sale del ranking con motivo legible: *"Declaró contingencia hace 12 min"*. Esa tarjeta en gris vale tanto en el demo como la de "no tiene hemodinamia".
2. **Capacidad declarada gana sobre snapshot**, y la UI dice cuál está usando. Nunca se pinta un número de camas de 2022 como si fuera de hoy (spec §3.5). El campo `origenCamas` ya existe en `sedes.json` — se propaga hasta la tarjeta.
3. **Población del servicio** cierra el hueco adulto/pediátrico/neonatal. Es la validación §1.5 que hoy no existe en ningún lado.
4. **`sede_canal`** hace que el handshake llegue al hospital correcto en vez de a un chat de demo. Es requisito de F1: sin canal por sede, la identidad por sede no sirve de nada.

**Y una decisión que hay que tomar ya:** ¿se conecta `evaluateEligibility()`? Recomendación: **sí, pero sin `NO_AVAILABLE_BED`** hasta que `capacidad_declarada` tenga datos. Camas del 2022 como filtro duro es peor que no filtrar.

### F3 · La ambulancia como entidad — carril Zaid + Juan

```sql
create table movil (
  id              text primary key,          -- 'AMB-014'
  organizacion_id uuid references organizacion(id),
  tipo            text not null check (tipo in ('TAB','TAM')),
  placa           text,
  activo          boolean default true
);

create table movil_estado (
  movil_id     text primary key references movil(id),
  disponible   boolean default true,
  caso_id      uuid references caso(id),
  geom         geography(Point,4326),
  actualizado  timestamptz default now()
);
```

Qué cambia:
- `Unidad` deja de ser texto libre: `/campo` selecciona de los móviles de su organización. `tipoMovil` sale del móvil, **no de un selector** — un TAB no puede declararse TAM.
- El filtro de móvil se mueve de "descarto todas las sedes" a un **bloqueo del caso** con mensaje correcto: *"Este paciente requiere TAM y AMB-014 es TAB"* → escala al CRUE por el motivo verdadero.
- `movil_estado.geom` + `data/procesado/ambulancias.json` (225 prestadores, 112 TAB / 53 TAM reales) le dan al `/crue` el mapa de cobertura. **Con el límite que Neid ya fijó: PULSO le *muestra* la cobertura al CRUE, no asigna móviles.** Reposicionar ambulancias es función legal del CRUE (Res. 1220/2010) y cruzar esa línea debilita el argumento del equipo.

### F4 · El reporte del traslado — carril Sebas + Neid

**Una tabla de eventos, append-only. Es la respuesta a la pregunta 1.3 y el insumo de todo lo demás.**

```sql
create table evento_caso (
  id            bigint generated always as identity primary key,
  caso_id       uuid not null references caso(id),
  tipo          text not null check (tipo in (
                  'caso_creado','revision_humana','match_calculado','despachado',
                  'aceptado','rechazado','timeout','rerouteado','escalado',
                  'llegada_escena','salida_escena','llegada_puerta','entrega',
                  'demora_reportada','override_crue','cerrado')),
  actor_id      uuid references actor(id),
  movil_id      text references movil(id),
  codigo_sede   text references sede(codigo),
  detalle       jsonb not null default '{}',
  ocurrido_en   timestamptz not null default now()
);
create index on evento_caso (caso_id, ocurrido_en);
```

Mismo tratamiento que `pulso_routing_decision_audit`: trigger que rechaza UPDATE/DELETE/TRUNCATE. Una corrección es un evento nuevo (spec §9.3).

**Los cinco enganches ya existen y hoy no escriben nada:**

| Enganche | Archivo | Estado hoy |
|---|---|---|
| `llegada_escena` / `entrega` | `despachador.py::_confirmar_llegada` | Recibe el dato y lo tira |
| `demora_reportada` | `despachador.py:132` | `TODO`, solo log |
| `timeout` / `rerouteado` | `vigilante.service.ts` | Calcula y no persiste |
| `override_crue` | `components/crue/bitacora.ts` | `localStorage` |
| `aceptado` / `rechazado` | `handshake.service.ts` | En memoria |

**El entregable visible:** `GET /caso/:id/reporte` → una línea de tiempo con hora, actor, evento y motivo. En `/campo` es el cierre del traslado que el paramédico puede mandar por WhatsApp. En `/hospital` es lo que recibe la puerta antes de que llegue la camilla. En `/crue` es la auditoría del caso.

Formato: JSON + render HTML. **No inventar un FURIPS**: es un formato regulado y falsificarlo para un demo es peor que no tenerlo. Se dice "esto alimenta el FURIPS", no "esto es el FURIPS".

**Prerrequisito ineludible:** persistir `caso` y `handshake` en Supabase. Las tablas ya existen en `0001_init.sql` con sus índices; `AlmacenService` es un `Map`. Sin esto, F4 no puede existir.

### F5 · El puente clínico — decisión de producto, no de código

Tres niveles. **Recomendación: hacer el nivel 1, declarar el 2, no prometer el 3.**

1. **Contexto que viaja hacia adelante** *(hacer)*. El hospital receptor ve lo que el paramédico dictó: resumen, signos de alarma, servicios requeridos, ETA. **Ya funciona** — es `canales.service.ts::textoTarjeta`. Nombrarlo como lo que es: transmisión del mínimo necesario bajo excepción de urgencia (Ley 2015/2020), registrada con base legal (spec §9.1, §9.5).
2. **Contexto que viene de atrás** *(declarar, no construir)*. Traer antecedentes/alergias/medicación exige interoperar con la historia clínica del paciente. En Colombia hoy eso es la Ley 2015 de 2020 y su reglamentación — no se resuelve en un hackathon. **Se dibuja en la arquitectura como puerto (`ProveedorHistoriaClinica`) sin implementación.** Un puerto vacío bien nombrado es más creíble que una integración fingida.
3. **Escribir en la historia clínica** *(no)*. PULSO no es un sistema de historia clínica y no debe pretenderlo.

**Si se hace el nivel 1 completo, agregar:** campo `base_legal` en `evento_caso.detalle` para toda transmisión de datos clínicos, y política de retención (§9.4: lo identificable se purga tras el cierre + ventana legal; el dataset de aceptación/rechazo sobrevive disociado). Eso último **es el moat** — conviene que esté escrito, no solo dicho.

### F6 · Los prompts, cuando el modelo exista — carril Neid

Con F1–F4 en pie, los prompts C y D dejan de ser especulativos:

1. **`agente_reporte.txt` gana contexto real.** Hoy dice "el destino sale del motor". Con F3 puede decir el móvil y su tipo; con F2 puede decir por qué se descartó una sede citando su estado declarado.
2. **La rama `APOYO` de `agente_seguimiento.txt` se puede cerrar.** Hoy está SIN DEFINIR porque *"PULSO no tiene a quién escalar"*. Con F1 sí lo tiene: el rol `regulador_crue` existe, tiene bandeja, y la petición queda como `evento_caso` tipo `escalado`. **Eso convierte una promesa vacía en una acción.**
3. **Un prompt, no dos.** El prompt clínico vive duplicado en Python y TypeScript, idéntico carácter por carácter. Extraerlo a un archivo compartido (`data/prompts/triage.txt`, leído por ambos) elimina la divergencia silenciosa. Es una hora de trabajo y previene el bug más caro posible: dos motores clínicos que discrepan sin que nadie se entere.
4. **Herramientas nuevas para el enrutador** (`herramientas.py`) una vez F4 exista: `registrar_llegada_escena`, `registrar_entrega`. Hoy `confirmar_llegada` colapsa dos eventos distintos en un enum de dos valores.

---

## Parte 4 — Orden de ejecución

```
F1 identidad ──┬──→ F2 sede viva ──┐
               ├──→ F3 móvil ──────┼──→ F4 reporte ──→ F6 prompts
               └──→ persistencia ──┘        │
                                            └──→ F5 puente clínico (decisión)
```

| Fase | Carril | Bloquea a | Sin credenciales |
|---|---|---|---|
| Persistencia (`caso`+`handshake` a Supabase) | Zaid | F4 completo | Degrada a memoria, ya funciona así |
| F1 identidad y roles | Zaid + Sebas | F2, F3, F4, F6 | Login con rol fijo por env |
| F2 sede viva | Zaid | Filtro de estado operativo | `operativo='recibiendo'` por defecto |
| F3 móvil | Zaid + Juan | Filtro TAM correcto | Selector actual de `/campo` |
| F4 reporte | Sebas + Neid | F6 | Eventos en memoria, reporte de sesión |
| F5 puente clínico | Sebas (producto) | — | Es una decisión, no código |
| F6 prompts | Neid | — | Prompts ya escritos |

**Lo que cambia el pitch, en una línea cada uno:** F2 agrega la tarjeta gris *"declaró contingencia"*. F4 agrega el reporte que hoy el paramédico llena a mano. F1 agrega la frase *"cada IPS responde solo por lo suyo, y queda auditado"*.

---

## Parte 5 — Decisiones que el equipo tiene que tomar

Ninguna de estas la puede tomar un carril solo:

1. **¿`evaluateEligibility()` se conecta?** Recomendación: sí, sin `NO_AVAILABLE_BED`, hasta que haya capacidad declarada.
2. **¿Identidad real o contraseña por sede?** La segunda es 2 horas y cubre el 80% del argumento legal. La primera es lo correcto.
3. **¿ElevenLabs Agents o Deepgram?** Sigue bloqueando C y D desde `docs/neid-faltantes.md`. Montar los dos es trabajo perdido.
4. **¿La rama `APOYO` se cierra contra el CRUE de PULSO, o se deja reconociendo sin prometer?** Si F1 entra, se puede cerrar.
5. **¿Aceptación única?** Sigue abierta de la sesión del CRUE: dos sedes pueden aceptar el mismo caso porque el almacén es en memoria y no hay guard. **Esto es un bug de seguridad del paciente, no una funcionalidad pendiente** — dos hospitales preparando cama para el mismo paciente. `RespondResponse.aplicada` mitiga la vista, no la carrera.

---

## Anexo — Datos reales ya disponibles y sin usar

Todo esto está en `data/procesado/` y no lo consume nadie:

| Archivo | Contenido | Para qué sirve en este plan |
|---|---|---|
| `ambulancias.json` | 225 prestadores, 112 TAB / 53 TAM | F3, universo de móviles |
| `ocupacion.json` | Ocupación mensual por subred 2021-2025 (Sur Occidente llegó a 219%) | F2, prior con número citable |
| `demanda.json` | Curva de 9.206 incidentes reales del 123 | Ya lo usa `congestion.service.ts` |
| `contexto.json` | Minutos promedio al centro médico por localidad | Línea base contra la cual comparar el ETA de PULSO — **el número del pitch** |
| `derivados/demanda_localidad.json` | Demanda por localidad | Cobertura para `/crue` |
