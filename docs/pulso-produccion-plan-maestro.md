# PULSO — Plan maestro de producción

> Tercer documento de la serie. [Parte I: el agente y los roles](pulso-agente-campo-y-roles.md) · [Parte II: afiliación, multitenancy y trámites](pulso-plataforma-afiliacion-y-tramites.md).
> Este es el **cómo se lleva a producción**: arquitectura objetivo, stack con justificación, inventario
> completo de vistas, webhooks de entrada y salida, integraciones nacionales reales, seguridad,
> observabilidad, y **el backlog repartido en cuatro carriles equitativos y sin colisión de archivos**.
>
> Toda afirmación normativa está enlazada a su fuente al final. Lo que no pude verificar va marcado.

**Índice** · [0 el hallazgo](#0-el-hallazgo-que-reordena-el-producto) · [1 arquitectura](#1-arquitectura-objetivo) · [2 stack](#2-stack-qué-se-agrega-y-por-qué) · [3 vistas](#3-inventario-completo-de-vistas) · [4 webhooks](#4-webhooks-entrada-y-salida) · [5 integraciones](#5-integraciones-reales) · [6 seguridad](#6-seguridad-y-cumplimiento) · [7 observabilidad](#7-observabilidad-y-operación) · [8 calidad](#8-calidad-y-ci) · [9 datos](#9-datos-y-migraciones) · [10 backlog](#10-el-backlog--64-tareas-en-4-carriles)

---

## 0. El hallazgo que reordena el producto

Buscando referencias de ingeniería encontré algo que vale más que cualquier librería:

> **Colombia tiene, desde el 15 de abril de 2026, un modelo nacional de interoperabilidad de historia
> clínica en operación — y es OBLIGATORIO para todo prestador activo en REPS. El plazo ya venció.**

- La **Resolución 1888 de 2025** de MinSalud adoptó el **RDA — Resumen Digital de Atención en Salud** como el mecanismo oficial de interoperabilidad (IHCE), con plazo máximo de seis meses desde el 15 de octubre de 2025 → **vencido el 15 de abril de 2026**.
- El estándar técnico es **HL7 FHIR R4**, con guía de implementación pública y viva en **[vulcano.ihcecol.gov.co](https://vulcano.ihcecol.gov.co/)** (RDA v1.0.0): **47 perfiles, 25 extensiones, 80 CodeSystems y 82 ValueSets**.
- Existe un **RDA de urgencias** específico, y entre los perfiles hay dos que son literalmente lo que PULSO ya produce:

| Perfil FHIR del IHCE | Qué es | Qué tiene PULSO hoy |
|---|---|---|
| `ObservationTriageRDA` | Triage | `caso.triage` (Res. 5596/2015) ✅ |
| `EncounterEmergencyRDA` | Encuentro de urgencias | El caso completo ✅ |
| `ConditionRDA` | Diagnóstico | `dxCie10` + `dxDescripcion` ✅ |
| `ProcedureRDA` | Procedimientos (CUPS) | ❌ falta CUPS |
| `PatientRDA` | Paciente | ❌ PULSO es seudónimo por diseño |
| `PractitionerRDA` | Profesional | ❌ falta identidad (F1) |
| `CareDeliveryOrganizationRDA` | IPS | ✅ código REPS |
| `ServiceRequestRDA` | Orden de servicio | ✅ `serviciosRequeridos` |
| `DocumentReferenceRDA` | Índice XDS-IHE | — |

### Qué significa esto para el producto

Deja de ser cierto lo que escribí en la Parte I (*"interoperar con la historia clínica no se resuelve en un hackathon, se declara como puerto vacío"*). **El puerto tiene destino, tiene estándar, tiene guía de implementación pública y tiene una fecha vencida.**

Y el reencuadre comercial es fuerte:

> Hay **16.181 sedes** en Bogotá con una obligación normativa vencida y un formato técnico que casi
> ninguna sabe generar. **PULSO ya produce, en la escena, el 70% del contenido de un RDA de urgencias.**
> El traslado deja de ser solo un traslado: **es el evento que genera el RDA que la IPS debe reportar de
> todas formas.**

Eso convierte el módulo de trámites (Parte II §7) de "quitamos fricción" a **"te dejamos cumpliendo una norma que hoy estás incumpliendo"**. Es la diferencia entre un producto que gusta y uno que se compra.

### Lo que hay que verificar antes de decirlo en público

Tres cosas, y son media hora de trabajo:

1. **El alcance exacto del RDA de urgencias**: qué recursos son obligatorios en `BundleEmergencyRDA`. La página del perfil no rindió el detalle a la extracción automática — hay que abrirla a mano en [vulcano.ihcecol.gov.co](https://vulcano.ihcecol.gov.co/indexRDA).
2. **Cómo se autentica un prestador contra la plataforma nacional** y si hay sandbox. Soporte: `soporte_ihce@minsalud.gov.co` · +57 (601) 3305043.
3. **Si un traslado prehospitalario genera RDA por sí mismo o solo lo genera la IPS receptora.** Esto define si PULSO *emite* o *pre-llena*. Sospecho lo segundo, y sería consistente con la regla de la Parte II §7.2 ("PULSO propone, un humano firma").

> ⚠️ **Hasta verificar el punto 3, la frase del pitch es "PULSO pre-llena el RDA", no "PULSO reporta al
> IHCE".** Prometer un reporte oficial que no se está haciendo es exactamente el tipo de afirmación que
> hunde una demo frente a alguien de MinSalud.

---

## 1. Arquitectura objetivo

### 1.1 Hoy vs. producción

```
HOY                                    PRODUCCIÓN
─────────────────────────              ────────────────────────────────────
frontend (Next 16)                     frontend (Next 16) ── CDN + edge
    │                                      │
    ├→ core (Nest, memoria)             API gateway / core (Nest)
    │      └→ ai-core (FastAPI)             ├→ Postgres + PostGIS  (RLS, rol no-owner)
    │                                       ├→ Redis (BullMQ: colas, outbox, ratelimit)
    └  voz (FastAPI, público)               ├→ ai-core (FastAPI)   interno
                                            └→ voz (FastAPI)       ÚNICO público
Estado: Map en RAM                          │
Sin actor, sin tenant                       └→ workers: outbox-relay, vigilante,
                                                        etl-reps, rda-builder
```

**Decisión: se conservan los tres servicios.** No hay razón para consolidar ni para partir más:
- `core` es el dominio y el dueño del estado. Monolito modular — no microservicios: un equipo de 4 no paga el costo operativo de partirlo.
- `ai-core` está separado por una razón real, no de moda: **concentra las credenciales de los proveedores de IA** y no debe quedar expuesto (ya está escrito así en `render.yaml`).
- `voz` está separado porque es **el único con cara a internet** (Twilio y Meta tienen que alcanzarlo). Esa frontera es de seguridad, y se mantiene.

**Lo que sí se agrega:** Redis + workers. Hoy `VigilanteService` corre `@Interval` dentro del proceso web — eso funciona con una instancia y **se rompe con dos** (dos vigilantes venciendo el mismo handshake). Es el primer bug que aparece el día que se escale horizontalmente.

### 1.2 Los cuatro workers

| Worker | Qué hace | Por qué no puede vivir en el proceso web |
|---|---|---|
| `vigilante` | Vence handshakes, detecta demoras, re-rutea | Con N instancias, N vigilantes hacen el trabajo N veces |
| `outbox-relay` | Publica eventos hacia webhooks salientes (§4.2) | Reintentos con backoff no caben en un request |
| `etl-reps` | Refresca el catálogo REPS y la ocupación | Trabajo de minutos |
| `rda-builder` | Arma el borrador de RDA FHIR al cerrar el caso | Depende de servicios externos lentos |

Con **lock distribuido en Redis** para el vigilante (solo una instancia barre) — es la corrección mínima para poder escalar.

---

## 2. Stack: qué se agrega y por qué

Regla: **cada dependencia nueva tiene que pagar su costo.** El repo hoy tiene un stack limpio (Nest 11, Next 16, Tailwind v4, Zod 4, FastAPI, `pg` a pelo) y no hay que ensuciarlo.

| Necesidad | Se agrega | Por qué esta y no otra | Riesgo |
|---|---|---|---|
| Acceso a datos con RLS | **Drizzle ORM** | SQL-first: puedes ver la consulta que sale. Prisma esconde el SQL y su manejo de `SET LOCAL` por transacción es más frágil justo donde importa (§6.2). Alternativa igual de buena: quedarse en `pg` + **Kysely** | Migrar lo que ya existe en `pg` crudo |
| Colas y reintentos | **BullMQ + Redis** | Estándar de facto en Node, reintentos con backoff exponencial, DLQ, y auto-instrumentación de OpenTelemetry ya existente | Un servicio más que operar |
| Entrega de webhooks | **Patrón outbox** (tabla + relay), no librería | Escribir el evento en la MISMA transacción que el dato es lo que hace la entrega confiable. Una librería no lo resuelve por ti | Hay que entender el patrón |
| Trazas y métricas | **OpenTelemetry** + **Sentry** | OTel auto-instrumenta controladores, guards, BullMQ y queries de Nest. Sentry para errores con contexto | Ruido si no se filtra PII |
| Logs | **Pino** (`nestjs-pino`) | JSON estructurado, rápido, redacción de campos sensibles nativa — obligatorio dado §6.4 | — |
| Validación de frontera | **Zod 4** (ya está) | Ya es dependencia en los tres paquetes. Se extiende a **todos** los bordes, no solo algunos | — |
| Formularios (vistas de registro) | **react-hook-form + @hookform/resolvers/zod** | Las vistas de afiliación y CRUD son formularios largos con validación cruzada. Hacerlo a mano en `useState` es donde se van las horas | — |
| Datos en el cliente | **TanStack Query** | Hoy hay `useEffect` + `setInterval` copiado en varias consolas. Reintentos, caché, invalidación y `refetchInterval` resueltos | Curva de una tarde |
| Componentes de admin | **shadcn/ui** (solo en `/panel` y `/admin`) | ⚠️ **No tocar `/campo`, `/hospital`, `/crue`**: su lenguaje visual ya está definido (Pulsewave) y es un activo. shadcn entra solo donde hay tablas y formularios CRUD | Dos lenguajes visuales conviviendo — a propósito |
| Tests de integración | **Testcontainers** (Postgres real) | Es la ÚNICA forma de probar que una policy de RLS realmente aísla. Un mock nunca prueba eso | Docker en CI |
| Tests de punta a punta | **Playwright** | El flujo del demo (dictar → rankear → despachar → aceptar) tiene que correr en CI | Lentos |
| FHIR / RDA | **`@types/fhir`** + validación contra la IG | No hace falta un SDK completo: se arma el `Bundle` y se valida contra los perfiles del IHCE | La IG cambia de versión |
| Feature flags | Tabla `flag` + `ConfigService` | Nada de SaaS. Lo que se necesita es apagar el fan-out paralelo en caliente | — |

**Lo que NO se agrega, y por qué:**
- ❌ **Un ORM pesado en `ai-core`.** No tiene base de datos y no debe tenerla. Esa es la frontera que lo mantiene simple.
- ❌ **Kafka / RabbitMQ.** BullMQ sobre Redis cubre el volumen de una ciudad con margen de sobra.
- ❌ **Un motor de reglas.** Las reglas clínicas son tablas versionadas (spec §7.2). Un motor de reglas es una forma cara de tener las mismas tablas con menos tests.
- ❌ **Microservicios adicionales.** Tres servicios con fronteras justificadas ya es lo correcto.

### 2.1 Referencias de las que copiar

| Proyecto | Qué mirar | Enlace |
|---|---|---|
| **Resgrid/Core** | El CAD open source más completo (Apache-2.0): modelo de personal, unidades, turnos, AVL y **"department links"** — cómo dos organizaciones independientes cooperan. Es exactamente el problema de multitenancy de la Parte II §10 | [github.com/Resgrid/Core](https://github.com/Resgrid/Core) |
| **NEMSIS** | El estándar de datos prehospitalarios de EE.UU. Es la lista de campos que un registro de atención prehospitalaria debe tener. Útil como checklist del `evento_caso`, sin adoptarlo | [nemsis.org](https://www.ems.gov/assets/Data_Integration_Meeting_Summary_March_2020.pdf) |
| **IHE mPSC** (mobile Paramedicine Summary of Care) | Guía FHIR que mapea NEMSIS → FHIR. Es el mismo problema que el RDA de urgencias, resuelto por otros | [build.fhir.org/ig/IHE/PCC.PCS](https://build.fhir.org/ig/IHE/PCC.PCS/NEMSIS-Mapping.html) |
| **AwesomeEMS** | Índice de software y protocolos EMS libres | [github.com/jenkstom/AwesomeEMS](https://github.com/jenkstom/AwesomeEMS) |
| **IHCE Colombia** | **La guía que hay que cumplir.** Perfiles, ValueSets y ejemplos | [vulcano.ihcecol.gov.co](https://vulcano.ihcecol.gov.co/) |

---

## 3. Inventario completo de vistas

30 vistas. Marcadas: ✅ existe · 🔧 existe y hay que extenderla · 🆕 nueva.

### 3.1 Público (sin sesión)

| # | Ruta | Qué es | Estado |
|---|---|---|---|
| 1 | `/` | Landing | ✅ |
| 2 | `/entrar` | Login | 🔧 pasa de contraseña de turno a correo + contraseña |
| 3 | `/entrar/recuperar` | Recuperación de contraseña | 🆕 |
| 4 | **`/afiliacion`** | **Registro de organización — 4 pasos** | 🆕 ⭐ |
| 5 | `/afiliacion/verificar` | Paso 2: código REPS + NIT → **autoverificación en vivo** | 🆕 ⭐ |
| 6 | `/afiliacion/:id/estado` | Seguimiento de la solicitud, con observaciones | 🆕 |
| 7 | `/invitacion/:token` | Aceptar invitación y crear cuenta | 🆕 |
| 8 | `/estado-plataforma` | Página de estado público (incidentes, degradaciones) | 🆕 |

**La vista 5 es la que vende el producto en la afiliación.** El usuario escribe 12 dígitos y la pantalla responde con el nombre de su propia sede, su dirección, sus servicios habilitados y sus camas — sacados del REPS que ya está cargado. **No tipeó nada y el sistema ya sabe quién es.** Ese es el mismo truco del ranking, aplicado al onboarding.

### 3.2 Registro y administración de la organización (`admin_organizacion`)

| # | Ruta | Qué es | Estado |
|---|---|---|---|
| 9 | `/panel` | Resumen: estado de afiliación, actividad, alertas | 🆕 |
| 10 | `/panel/organizacion` | Datos de la organización, NIT, razón social, contactos | 🆕 |
| 11 | `/panel/sedes` | Sedes vinculadas · agregar sede con verificación REPS | 🆕 |
| 12 | `/panel/sedes/:codigo` | Ficha: servicios habilitados con **vigencia**, población, complejidad | 🆕 |
| 13 | `/panel/sedes/:codigo/canales` | Canales de aviso + **botón "probar"** que manda mensaje real | 🆕 |
| 14 | `/panel/equipo` | Actores, roles, invitaciones, último acceso | 🆕 |
| 15 | `/panel/moviles` | Flota: alta, TAB/TAM, placa, habilitación, vigencia técnicomecánica | 🆕 |
| 16 | `/panel/moviles/:id` | Ficha del móvil + histórico de traslados | 🆕 |
| 17 | `/panel/webhooks` | **Endpoints propios, secreto, eventos suscritos, últimas entregas y reintento** | 🆕 ⭐ |
| 18 | `/panel/api` | Llaves de API, alcances, rotación | 🆕 |
| 19 | `/panel/auditoria` | Quién hizo qué en la organización | 🆕 |

### 3.3 Operación clínica

| # | Ruta | Qué es | Estado |
|---|---|---|---|
| 20 | `/campo` | Consola del paramédico | ✅ 🔧 falta §3-§7 de `juan-campo-v2.md` |
| 21 | `/campo/turno` | **Abrir turno: móvil, tripulación, chequeo de equipo** | 🆕 |
| 22 | `/campo/caso/:id` | Traslado en curso: ruta, prearribo, eventos, botón de entrega | 🆕 |
| 23 | `/campo/historial` | Mis traslados del turno + reporte exportable | 🆕 |
| 24 | `/hospital` | Consola del jefe de urgencias | ✅ 🔧 alcance por sede |
| 25 | `/hospital/capacidad` | **Declarar estado operativo y camas — dos toques** | 🆕 ⭐ |
| 26 | `/hospital/recepcion/:casoId` | **Paquete de prearribo + checklist + los tres relojes** | 🆕 ⭐ |
| 27 | `/hospital/entrega/:casoId` | Escanear QR → expediente completo, sin retipear | 🆕 ⭐ |
| 28 | `/crue` | Tablero del regulador | ✅ 🔧 override persistente |
| 29 | `/crue/cobertura` | Mapa de flota disponible por zona | 🆕 |
| 30 | `/crue/red` | Estado declarado de toda la red + sedes en contingencia | 🆕 |

### 3.4 Plataforma (`admin_plataforma`, `auditor`)

| # | Ruta | Qué es | Estado |
|---|---|---|---|
| 31 | `/admin/afiliaciones` | Cola de verificación manual | 🆕 |
| 32 | `/admin/catalogos` | Motivos de rechazo, protocolos, mapa Dx→servicios — **versionados** | 🆕 |
| 33 | `/admin/modelos` | Versiones de prompt y config de scoring, con su histórico | 🆕 |
| 34 | `/auditoria/casos/:id` | **Reconstrucción forense de un caso: cada evento, cada actor, cada decisión** | 🆕 ⭐ |

### 3.5 Las cinco vistas que hay que hacer bien o no hacer

1. **`/afiliacion/verificar`** — el momento "esto ya me conoce".
2. **`/hospital/capacidad`** — se usa 20 veces por turno a las 3 a.m. Si toma más de dos toques, nadie la usa y todo el modelo de capacidad declarada se cae.
3. **`/hospital/recepcion/:casoId`** — donde vive la hora dorada que el ruteo ganó.
4. **`/hospital/entrega/:casoId`** — el renglón "0 campos por tipear".
5. **`/auditoria/casos/:id`** — la vista que hace defendible todo lo demás ante un jurado, una interventoría o un juez.

---

## 4. Webhooks: entrada y salida

### 4.1 Entrada — los tres que ya llegan

| Origen | Ruta | Autenticación | Estado hoy |
|---|---|---|---|
| **Telegram** | `POST /telegram/webhook` | `secret_token` en header | ✅ Correcto (y `TELEGRAM_WEBHOOK_SECRET` obligatorio) |
| **WhatsApp (Meta)** | `POST /webhook/whatsapp` en `voz` | **`X-Hub-Signature-256`** | ⚠️ **Verificar** |
| **Twilio** | `POST /telefonia/*` en `voz` | **`X-Twilio-Signature`** | ⚠️ **Verificar** |

**Las cuatro reglas de un webhook de entrada en producción** — las tres que faltan están marcadas:

1. ❌ **Firmar contra el cuerpo CRUDO, no el JSON parseado.** Meta firma los bytes exactos; si Express ya parseó y re-serializó, el HMAC no coincide. Necesita `rawBody` en el body parser.
2. ❌ **Deduplicar por el id del proveedor.** Meta reintenta con backoff exponencial **hasta 7 días** ante 4xx/5xx o timeout. Sin deduplicar por `wamid`, un caso se crea dos veces y **salen dos ambulancias**. Tabla `webhook_recibido(proveedor, id_externo)` con índice único.
3. ❌ **Responder 200 en menos de 3 segundos y procesar después.** Meta espera 2xx en ~3s. Hoy `_registrar_caso` hace triage + match + dispatch **dentro del request**: eso es 4-8 segundos con Claude. **Meta ya está reintentando y nadie lo ha notado porque no hay métricas.**
4. ✅ **Nunca confiar en el contenido.** Ya se hace en `interprete.py`.

> **Ese punto 3 probablemente es un bug activo en producción hoy.** Es de los primeros que hay que medir.

### 4.2 Salida — PULSO como proveedor de webhooks

Es lo que convierte a PULSO de aplicación en plataforma: **el HIS del hospital y el software de la empresa de ambulancias se enteran solos.**

```sql
create table webhook_endpoint (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizacion(id) on delete cascade,
  url             text not null,
  secreto_hash    text not null,          -- se muestra UNA vez al crearlo
  eventos         text[] not null,
  activo          boolean default true,
  creado_en       timestamptz default now()
);

-- OUTBOX: se escribe en la MISMA transacción que el dato. Esa es la garantía.
create table webhook_outbox (
  id            bigint generated always as identity primary key,
  organizacion_id uuid not null,
  tipo          text not null,
  payload       jsonb not null,
  disponible_en timestamptz not null default now(),
  intentos      int not null default 0,
  entregado_en  timestamptz,
  ultimo_error  text,
  trace_id      text                       -- propaga la traza al worker (OTel)
);
create index on webhook_outbox (disponible_en) where entregado_en is null;
```

**Eventos publicados** (los mismos nombres de `evento_caso`, para que haya un solo vocabulario):

| Evento | A quién le importa |
|---|---|
| `caso.despachado` | HIS de la sede consultada — abre pre-registro |
| `caso.aceptado` / `caso.rechazado` | Operador de ambulancias, HIS |
| `caso.rerouteado` | Ambos |
| `caso.llegada_puerta` / `caso.entrega` | HIS: dispara la admisión |
| `caso.rda_disponible` | HIS: hay un borrador FHIR listo para revisar y firmar |
| `sede.estado_cambiado` | CRUE, tableros regionales |
| `movil.disponible` | Software de flota |

**Cómo se entrega, bien hecho:**
- Firma `X-Pulso-Signature: t=<ts>,v1=<hmac_sha256(ts + "." + body)>` — con timestamp adentro, para que una firma vieja no se pueda reproducir.
- `X-Pulso-Event-Id` único e inmutable entre reintentos → **el receptor puede deduplicar**.
- Reintentos con backoff exponencial + *jitter*: 10s, 1m, 5m, 30m, 2h, 6h. Después, cola muerta.
- **Reenvío manual** desde `/panel/webhooks` (vista 17).
- **Circuit breaker por endpoint**: 20 fallos seguidos → se desactiva y se avisa. Un endpoint caído no puede atascar la cola de todos.
- **Nunca PII en el payload.** Se manda `casoId` y el mínimo; el receptor consulta con su llave si necesita más.

---

## 5. Integraciones reales

| # | Integración | Estado | Qué hace falta | Prioridad |
|---|---|---|---|---|
| 1 | **IHCE / RDA (FHIR R4)** | 🔴 Nada | Verificar §0, construir `rda-builder`, validar contra la IG | ⭐⭐⭐ **La diferencial** |
| 2 | **REPS (catálogo y capacidad)** | 🟡 ETL manual a `data/` | Refresco programado + marca de antigüedad (spec §2.8) | ⭐⭐⭐ |
| 3 | **Mapbox** (matriz + ruta) | 🟢 Matrix listo | Falta **geometría de ruta** — el mapa dibuja un arco decorativo | ⭐⭐ |
| 4 | **WhatsApp Cloud API** | 🟡 Envío listo | Firma, deduplicación, 200 rápido (§4.1) | ⭐⭐⭐ |
| 5 | **Telegram** | 🟢 Completo | Token de un solo uso en `callback_data` | ⭐⭐ |
| 6 | **Twilio (voz)** | 🟡 Marca, sin agente | Decidir ElevenLabs vs Deepgram + validar firma | ⭐ |
| 7 | **ADRES / BDUA** (derechos) | 🔴 Nada | Exige convenio. **Puerto declarado con mock honesto** | ⭐ |
| 8 | **SIVIGILA / INS** | 🔴 Nada | Detección por CIE-10 → **avisa a un humano**, no notifica solo | ⭐ |
| 9 | **HIS de las IPS** | 🔴 Nada | Se resuelve con §4.2: ellos consumen nuestros webhooks | ⭐⭐ |

---

## 6. Seguridad y cumplimiento

### 6.1 Modelo de amenaza, corto

| Amenaza | Hoy | Mitigación |
|---|---|---|
| Cualquiera con la contraseña de turno acepta por cualquier IPS | 🔴 Real | Identidad por actor + `403` cruzado auditado (Parte II §2) |
| Replay de un botón de Telegram | 🔴 `callback_data` reproducible | Token firmado de un solo uso |
| Webhook falsificado (WhatsApp/Twilio) | 🔴 Sin verificar firma | §4.1 regla 1 |
| Un inquilino lee datos de otro | 🔴 No hay inquilinos | RLS + alcance + guard (Parte II §10.4) |
| PII en logs | 🟡 Sin política | Redacción en Pino (§6.4) |
| Enumerar casos por id | 🟡 UUID v4 mitiga | Autorización por recurso, no por posesión del id |
| Tormenta de reintentos del móvil | 🔴 Sin rate limit | Límite por actor + `Idempotency-Key` |

### 6.2 RLS bien hecho — tres detalles que la rompen

De la práctica documentada, y **cada uno de los tres es un fallo silencioso**:

1. **Conectar con un rol no-owner y no-superusuario.** Owners y superusuarios **se saltan RLS por defecto**. Además `alter table ... force row level security` para que ni el dueño se escape. → **`SUPABASE_SERVICE_ROLE_KEY` se salta RLS**, y es justo lo que `supabase.service.ts` usa hoy.
2. **`SET LOCAL`, nunca `SET` a secas.** Con un pooler de conexiones, un `SET` plano **filtra el contexto de un inquilino al siguiente request**. Es la fuga más difícil de detectar porque solo aparece bajo concurrencia.
3. **RLS es una capa, no la respuesta.** Defensa en profundidad: datos + API + llaves, para que ningún error suelto exponga a otro cliente.

```ts
// El wrapper obligatorio. Ninguna consulta de dominio va fuera de aquí.
async function enContextoDe<T>(actor: Actor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    // SET LOCAL: muere con la transacción. Con SET plano, sobrevive en el pool.
    await tx.execute(sql`set local pulso.organizacion_id = ${actor.organizacionId}`);
    await tx.execute(sql`set local pulso.rol_red = ${actor.roles.includes('regulador_crue')}`);
    return fn(tx);
  });
}
```

**Y el test que lo prueba** (Testcontainers, Postgres real — un mock no prueba esto):
```
dado  un caso de la organización A
cuando se consulta en contexto de la organización B
entonces devuelve 0 filas   ← si esto pasa a verde por accidente, el test está mal escrito
```

### 6.3 Retención — el reloj que empieza cuando F0 entre

Dos relojes distintos y hay que no confundirlos:

| Dato | Retención | Fuente |
|---|---|---|
| Historia clínica (si algún día se guarda) | **20 años** desde la última atención: 5 en archivo de gestión + 15 en central | Normativa de historia clínica |
| PII operativa de PULSO (`texto_crudo`, `origen`, `paciente_token`) | Cierre del caso + ventana legal → **purgar** | Ley 1581/2012, spec §9.4 |
| Residuo disociado (decisión, aceptación, tiempos) | Indefinido | Es el activo, y no tiene PII |

> **PULSO no es un sistema de historia clínica y no debe convertirse en uno por accidente.** Si se guarda
> un RDA completo "por si acaso", se heredan 20 años de obligación de custodia. La postura correcta:
> **PULSO genera el RDA, lo entrega a la IPS, y no lo conserva** más allá de la ventana operativa.

### 6.4 Nunca PII en logs

`nestjs-pino` con redacción explícita, y un test que falle si aparece:

```ts
redact: {
  paths: ['req.headers.authorization', 'req.headers.cookie',
          '*.textoCrudo', '*.texto', '*.origen', '*.telefono',
          '*.pacienteToken', '*.password', '*.dictado'],
  censor: '[redactado]',
}
```

### 6.5 Checklist antes de exponer a una IPS real

- [ ] Rol de base de datos no-owner + `force row level security` en toda tabla con `organizacion_id`
- [ ] `SET LOCAL` verificado bajo carga con pooler
- [ ] Firma verificada en los tres webhooks de entrada
- [ ] Token de un solo uso en botones de canal
- [ ] Rate limit por actor y por organización
- [ ] Secretos fuera del repo, rotables (`/panel/api`)
- [ ] Cifrado en tránsito y en reposo
- [ ] Política de retención implementada, no solo escrita
- [ ] Registro de acceso también para lecturas del `auditor`
- [ ] Backups probados con **restauración real**, no solo configurados

---

## 7. Observabilidad y operación

### 7.1 SLOs — lo que se promete y se mide

| Indicador | Objetivo | Por qué ese número |
|---|---|---|
| Dictado → ranking en pantalla (p95) | **< 8 s** | Más allá, el paramédico deja de mirar la pantalla |
| Ranking → handshake entregado (p95) | **< 3 s** | Es la promesa del canal |
| Ciclo completo dictado → aceptación (p50) | **< 90 s** | Es la promesa del producto |
| Webhook de entrada respondido | **< 3 s** (p99) | Meta reintenta pasado ese umbral |
| Disponibilidad de `POST /triage` | **99.5 %** | Es la ruta crítica |
| Casos escalados al CRUE por falla técnica | **< 1 %** | Distinguirlo de escalamiento clínico legítimo |

### 7.2 Trazas: una por caso, de punta a punta

Con OpenTelemetry, `casoId` como atributo en cada span. Una traza cubre `/campo → core → ai-core → Mapbox → canal → webhook`, **incluyendo el salto por la cola** (el `trace_id` viaja en `webhook_outbox`, por eso está esa columna).

**Métricas de negocio, no solo técnicas** (spec §11.2):
`pulso_casos_total{triage,motor}` · `pulso_aceptacion_ratio{sede}` · `pulso_tiempo_coordinacion_segundos` · `pulso_escalamientos_total{motivo}` · `pulso_sedes_sin_candidato_total` · `pulso_llm_latencia_ms{motor}` · `pulso_webhook_entregas{estado}` · `pulso_rda_generados_total`

### 7.3 Alertas que despiertan a alguien

| Alerta | Umbral |
|---|---|
| Un caso lleva > 5 min sin destino | inmediata |
| Una zona entra en saturación generalizada | inmediata (spec §11.3) |
| Todos los canales caídos | inmediata |
| Cola de outbox creciendo sin drenar | 10 min |
| Tasa de heurística > 20 % (Claude caído) | 15 min |
| Ratio de firma inválida en webhooks > 0 | inmediata — o hay un bug o alguien está probando |

### 7.4 Runbooks (uno por página, en `docs/runbooks/`)
`ai-core caído` · `Mapbox agotado` · `Supabase caído` · `un canal muerto` · `outbox atascado` · `restaurar backup` · `rotar secreto filtrado` · `sede reporta que no le llegan solicitudes`

---

## 8. Calidad y CI

### 8.1 La pirámide

| Nivel | Qué prueba | Herramienta | Dónde falta hoy |
|---|---|---|---|
| Unitario | Scoring, políticas, filtros duros | Jest / pytest | 🟢 Existe y es bueno |
| Contrato | `contracts/types.ts` ↔ frontend ↔ ai-core | Zod + snapshot | 🔴 **El espejo manual `lib/types.ts` no tiene test** |
| Integración | RLS, idempotencia, transiciones | **Testcontainers** | 🔴 Nada |
| Punta a punta | Dictar → rankear → despachar → aceptar | **Playwright** | 🔴 Nada |
| Evals de LLM | Extracción clínica contra corpus | `evals/run.py` | 🟡 Existe; la heurística saca **4/14** |
| Carga | 50 casos simultáneos | k6 | 🔴 Nada |

### 8.2 Los cuatro tests que faltan y más duelen

1. **Espejo de tipos.** Un test que falle si `apps/frontend/lib/types.ts` diverge de `contracts/types.ts`. Hoy divergir **no rompe el build — rompe el runtime**, que es peor.
2. **Aislamiento de inquilino.** §6.2.
3. **Un prompt, no dos.** Test que compare el prompt de `triage.py` con el de `triage.service.ts` carácter por carácter, **hasta que se unifiquen en un solo archivo**.
4. **Cobertura de eventos.** Recorrer las transiciones de `routing/lifecycle.ts` y verificar que cada una escribe su `evento_caso` (Parte II §12.3).

### 8.3 Pipeline

```
push → lint + typecheck (3 apps)
     → unit (jest + pytest)
     → contract
     → integración (Testcontainers: migraciones + RLS + idempotencia)
     → build
     → e2e (Playwright sobre el stack en docker compose)
     → evals de LLM   [solo en main, cuesta tokens]
     → deploy staging → smoke → producción (manual)
```

Ramas protegidas, PR con 1 revisor, `task doctor` en CI, y **migraciones que corren hacia adelante y hacia atrás en cada PR**.

---

## 9. Datos y migraciones

- **Numeradas y en orden**, como ya se hace: `0003_identidad.sql`, `0004_afiliacion.sql`, … Cada una con su `down`.
- **Migración de datos separada de la de esquema.** El backfill de `organizacion_id` en `caso` es un script, no un `alter`.
- **Semillas por entorno**: `dev` con las 14 sedes de siempre; `staging` con el REPS completo; `producción` solo REPS.
- **`data/procesado/` sigue siendo la fuente del ETL**, y `data/CATALOGO.md` se mantiene generado.
- **Índices que van a hacer falta el día 1**: `evento_caso(caso_id, ocurrido_en)`, `caso(organizacion_id, creado_en desc)`, `handshake(codigo_sede, enviado_en desc)` (ya existe), `webhook_outbox(disponible_en) where entregado_en is null`, `capacidad_declarada(codigo_sede, tipo, declarado_en desc)`, y el GiST de `movil_estado`.

---

## 10. El backlog — 64 tareas en 4 carriles

### 10.1 Cómo se reparte y por qué así

**Todos hacen de todo.** Los carriles rotan de dominio en cada ola: quien hizo frontend en la ola 1 hace backend en la 2. Se gana redundancia de conocimiento y nadie queda de cuello de botella.

**Pero dentro de una ola, nadie toca el archivo de otro.** Esa es la única regla que hace que se pueda mergear sin dolor. Cada tarea declara su dominio de archivos y **dos tareas de la misma ola nunca comparten dominio**.

**El archivo compartido tiene dueño por ola.** `contracts/types.ts` y su espejo `lib/types.ts` son la zona de choque garantizada. Protocolo:

> 1. Al abrir la ola, **el dueño de tipos de esa ola** mergea PRIMERO un PR que solo toca los dos archivos de tipos, con todos los campos nuevos de la ola, **todos opcionales**.
> 2. Los otros tres rebasan sobre eso y ya nunca tocan tipos en esa ola.
> 3. Rota cada ola: Ola 1 Zaid · Ola 2 Juan · Ola 3 Neid · Ola 4 Sebas · Ola 5 Zaid · Ola 6 Juan.

**Convenciones:** ramas `feat/<ola>-<id>-<slug>`, PRs pequeños, `task doctor` verde antes de pedir revisión, y `grep -rn "<<<<<<<"` después de cada pull — ya pasó una vez que se commiteó un merge con marcadores adentro.

---

### 🔥 Ola 0 — Arreglos inmediatos (antes que nada; ~medio día)

Ocho bugs reales encontrados en el análisis. No dependen de nada y se pueden mergear el mismo día.

| ID | Tarea | Dueño | Dominio | Hecho cuando |
|---|---|---|---|---|
| 0.1 | **Conectar el guard de aceptación única.** `HandshakeService.procesarRespuesta` llama a `RoutingService.respond()` antes de escribir; devuelve `aplicada:false` con `PULSO_DESTINATION_ALREADY_ACCEPTED` | Sebas | `core/src/handshake` | Test: dos sedes aceptan el mismo caso, la segunda es rechazada |
| 0.2 | **Verificar firma de WhatsApp y Twilio.** `rawBody` + HMAC `X-Hub-Signature-256` contra el cuerpo crudo; `X-Twilio-Signature` | Zaid | `voz/app/canales/whatsapp.py`, `voz/app/telefonia/` | Un webhook con firma mala responde 401 y queda en métrica |
| 0.3 | **Responder el webhook en < 3 s.** `_registrar_caso` encola y responde 200 de una; el trabajo pesado va a una tarea de fondo | Neid | `services/voz/app/despachador.py`, `rutas/whatsapp.py` | p99 de respuesta < 1 s medido |
| 0.4 | **Deduplicar por `wamid`.** Tabla/índice único de eventos recibidos | Juan | `services/voz/app/sesiones.py` + migración `0003` | El mismo `wamid` dos veces crea un solo caso |
| 0.5 | **Un solo prompt clínico.** Extraer a `data/prompts/triage.txt`, leído por Python y TypeScript. Test que verifique que son el mismo | Neid | `ai-core/app/triage.py`, `core/src/triage/triage.service.ts` | El test de igualdad pasa y no hay dos literales |
| 0.6 | **Motivos de rechazo como enum versionado.** Sacarlos del `.tsx` a catálogo con código | Sebas | `core/src/catalogo`, `components/hospital/MotivosCapacidad.tsx` | El handshake guarda `motivo_codigo`, no texto libre |
| 0.7 | **Test de espejo de tipos.** Falla si `lib/types.ts` diverge de `contracts/types.ts` | Juan | `apps/frontend/lib`, CI | Se cambia un tipo en core sin espejar → CI rojo |
| 0.8 | **Corregir el filtro de móvil.** `movilCompatible` sale del bucle de destinos; si el móvil no sirve, se bloquea el caso con el motivo verdadero, no se descartan todas las sedes | Zaid | `core/src/scoring/scoring.service.ts`, `routing/eligibility-policy.ts` | Caso TAM+TAB → error de caso, no ranking vacío |

---

### 🧱 Ola 1 — Cimientos: persistencia, identidad, multitenancy (~2 días)

**Dueño de tipos: Zaid.**

| ID | Tarea | Dueño | Dominio | Depende |
|---|---|---|---|---|
| 1.1 | **Migración `0003_identidad`**: `organizacion`, `organizacion_sede`, `actor`, `actor_rol`, `invitacion` + índices | Zaid | `supabase/migrations` | — |
| 1.2 | **Persistir `caso` y `handshake` en Postgres.** `AlmacenService` pasa a repositorio con dos implementaciones (memoria/PG), igual que `RoutingStore` | Neid | `core/src/almacen`, `core/src/repositorios` (nuevo) | 1.1 |
| 1.3 | **Sesión con actor real.** El token firma `{actorId, organizacionId, roles, sedes}`; login por correo; `RolGuard` + `@Rol()` + `@AlcanceSede()` | Sebas | `core/src/auth` | 1.1 |
| 1.4 | **Vistas de login y sesión.** `/entrar` con correo, `/entrar/recuperar`, contexto de rol en el cliente, redirección por rol | Juan | `frontend/app/entrar`, `lib/sesion.ts` | 1.3 |
| 1.5 | **Rol de base de datos no-owner + `force row level security`** y el wrapper `enContextoDe()` con `SET LOCAL` | Zaid | `core/src/persistence/contexto.ts`, migración `0004` | 1.1 |
| 1.6 | **Policies de RLS** sobre `caso`, `evento_caso`, `handshake`, `movil` + tabla `caso_acceso` | Neid | `supabase/migrations/0005_rls.sql` | 1.5 |
| 1.7 | **Testcontainers en CI** + el test de aislamiento de inquilino (§6.2) | Sebas | `core/test`, `.github/workflows` | 1.6 |
| 1.8 | **Token de servicio para `voz`** (`sub:'svc:voz'`), que deja de usar `CORE_PASSWORD` | Juan | `core/src/auth/token-servicio.ts` (nuevo), `voz/app/clientes/core.py` | 1.3 |

---

### 📝 Ola 2 — Afiliación y CRUD (~2,5 días)

**Dueño de tipos: Juan.**

| ID | Tarea | Dueño | Dominio | Depende |
|---|---|---|---|---|
| 2.1 | **API de afiliación**: `POST /afiliacion/verificar` (cruce contra `sede` con fuzzy > 0.85), `POST /afiliacion`, máquina de estados | Juan | `core/src/afiliacion` (nuevo) | 1.3 |
| 2.2 | **Vista `/afiliacion`** — 4 pasos, react-hook-form + zod, un dato por pantalla | Neid | `frontend/app/afiliacion`, `components/afiliacion` | 2.1 |
| 2.3 | **Vista `/afiliacion/verificar`** — la del momento "esto ya me conoce": 12 dígitos → ficha REPS precargada | Sebas | `components/afiliacion/Verificacion.tsx` | 2.1 |
| 2.4 | **CRUD de organización y sedes vinculadas** + `/panel/organizacion`, `/panel/sedes` | Zaid | `core/src/organizaciones`, `frontend/app/(panel)/organizacion`, `/sedes` | 1.3 |
| 2.5 | **CRUD de equipo e invitaciones**: `/panel/equipo`, `/invitacion/:token`, token hasheado con expiración de 72 h | Juan | `core/src/invitaciones`, `frontend/app/(panel)/equipo`, `app/invitacion` | 1.3 |
| 2.6 | **Cola de verificación manual** `/admin/afiliaciones` + rol `admin_plataforma` | Neid | `frontend/app/(admin)/afiliaciones`, `core/src/afiliacion/revision.ts` | 2.1 |
| 2.7 | **Shell de `/panel`**: layout, navegación por rol, shadcn/ui aislado a este árbol | Sebas | `frontend/app/(panel)/layout.tsx`, `components/panel` | 1.4 |
| 2.8 | **TanStack Query + cliente tipado**: reemplaza los `useEffect`+`setInterval` copiados en tres consolas | Zaid | `frontend/lib/api.ts`, `lib/queries` | 1.4 |
| 2.9 | **Autoverificación de operadores de ambulancia** contra `data/procesado/ambulancias.json` | Juan | `core/src/afiliacion/ambulancias.ts` | 2.1 |
| 2.10 | **`/panel/auditoria`**: quién hizo qué dentro de la organización | Neid | `frontend/app/(panel)/auditoria` | 3.1 |
| 2.11 | **Rate limit + `Idempotency-Key` genérico** en toda mutación | Sebas | `core/src/common/idempotencia.ts` | 1.3 |
| 2.12 | **Vista de estado público** `/estado-plataforma` + `GET /health` extendido | Zaid | `frontend/app/estado-plataforma`, `core/src/health` | — |

---

### ⚡ Ola 3 — Operación viva: eventos, sede, móvil (~2 días)

**Dueño de tipos: Neid.**

| ID | Tarea | Dueño | Dominio | Depende |
|---|---|---|---|---|
| 3.1 | **`evento_caso` + `RegistroService`**: append-only con trigger, idempotencia, `corrige_a`, un único punto de escritura | Neid | `core/src/eventos` (nuevo), migración `0006` | 1.2 |
| 3.2 | **Cablear los 22 eventos.** Toda transición de caso/handshake escribe evento. Incluye `rerouteado` y `override_crue`, hoy invisibles | Sebas | `core/src/handshake`, `dispatch`, `vigilante`, `escalamiento` | 3.1 |
| 3.3 | **`sede_estado` + `capacidad_declarada` + vista `capacidad_vigente`**, y el filtro duro por estado operativo en el ranking | Zaid | `supabase/migrations/0007`, `core/src/capacidades`, `scoring` | 1.1 |
| 3.4 | **Vista `/hospital/capacidad`** — dos toques, legible a bajo brillo, tocable con guantes | Juan | `frontend/app/(consolas)/hospital/capacidad`, `components/hospital` | 3.3 |
| 3.5 | **`sede_canal` + envío dirigido**: se acaba el `TELEGRAM_CHAT_ID_DEMO` global. Con botón "probar canal" | Sebas | `core/src/canales`, `core/src/sedes` | 3.3 |
| 3.6 | **`movil` + `movil_estado` + `/campo/turno`**: abrir turno, tripulación, TAB/TAM sale del móvil y no de un selector | Zaid | `core/src/moviles`, `frontend/app/(consolas)/campo/turno` | 1.1 |
| 3.7 | **Posición del móvil en vivo** + `/crue/cobertura` con la flota por zona | Juan | `frontend/components/crue/MapaCobertura.tsx`, `core/src/moviles/posicion.ts` | 3.6 |
| 3.8 | **Vigilante a worker con lock distribuido en Redis**; se acaba el `@Interval` en el proceso web | Neid | `core/src/colas` (nuevo) + `vigilante` | 1.2, **3.2** |
| 3.9 | **Tiempo real por canales con alcance en el servidor** (`sede:`, `caso:`, `red:`, `org:`), con degradación a polling declarada en la UI | Zaid | `core/src/realtime`, `frontend/lib/realtime.ts` | 1.6 |
| 3.10 | **`GET /casos/:id/reporte`** + `/campo/historial`: la línea de tiempo del traslado, exportable | Sebas | `core/src/eventos/reporte.ts`, `frontend/app/(consolas)/campo/historial` | 3.2 |
| 3.11 | **Persistir el override del CRUE.** Sale de `localStorage`, entra a `evento_caso` con justificación obligatoria | Juan | `frontend/components/crue/bitacora.ts`, `core/src/escalamiento` | 3.1 |
| 3.12 | **Versionar el prompt clínico.** `promptVersion` viaja en el caso y queda en la evidencia de decisión | Neid | `ai-core/app/triage.py`, `core/src/routing/decision-evidence.ts` | 0.5 |

---

### 🏥 Ola 4 — Recepción, trámites y RDA (~3 días)

**Dueño de tipos: Sebas.**

| ID | Tarea | Dueño | Dominio | Depende |
|---|---|---|---|---|
| 4.1 | **Tabla `recepcion` + creación automática al aceptar**; catálogo de protocolos versionado (`codigo_infarto`, `codigo_acv`, `trauma_mayor`) | Sebas | `core/src/recepcion` (nuevo), migración `0008` | 3.1 |
| 4.2 | **Generador de SBAR** en ai-core: dictado + extracción → Situación/Antecedente/Evaluación/Recomendación, con fallback sin LLM | Neid | `ai-core/app/sbar.py`, `routers/sbar.py` | — |
| 4.3 | **Vista `/hospital/recepcion/:casoId`** — paquete de prearribo, checklist, los tres relojes | Juan | `frontend/app/(consolas)/hospital/recepcion` | 4.1 |
| 4.4 | **Ventana clínica**: door-to-balloon 90 min, door-to-needle 60 min, contando desde el primer contacto médico | Zaid | `core/src/recepcion/ventanas.ts`, `catalogo/protocolos.ts` | 4.1 |
| 4.5 | **Entrega por QR**: `POST /casos/:id/entrega` + `/hospital/entrega/:casoId` + pantalla del código en `/campo` | Sebas | `core/src/recepcion/entrega.ts`, `frontend/app/(consolas)/hospital/entrega` | 4.1 |
| 4.6 | **Tabla `tramite` + motor de trámites**: qué aplica según el caso, con `base_legal` obligatoria | Zaid | `core/src/tramites` (nuevo), migración `0009` | 3.1 |
| 4.7 | **Puertos declarados con mock honesto**: `ProveedorDerechos` (ADRES/BDUA) y `ProveedorHistoriaClinica`. La UI dice que es simulado | Neid | `core/src/tramites/puertos` | 4.6 |
| 4.8 | **`rda-builder`**: `Bundle` FHIR R4 de urgencias con `EncounterEmergencyRDA`, `ObservationTriageRDA`, `ConditionRDA`, `ServiceRequestRDA` | Juan | `core/src/rda` (nuevo) | 4.6 |
| 4.9 | **Validar el RDA contra la IG del IHCE** + fixtures de ejemplo + **verificar los 3 puntos abiertos del §0** | Neid | `core/src/rda/validacion`, `docs/ihce.md` | 4.8 |
| 4.10 | **Vista de firma de trámites**: el humano revisa el borrador y firma. Nada sale solo | Sebas | `frontend/app/(consolas)/hospital/tramites` | 4.6 |
| 4.11 | **Alerta de preparación no confirmada** a T-5 min → evento + aviso, sin quitarle el caso a nadie | Zaid | `core/src/recepcion/alertas.ts` | 4.1 |
| 4.12 | **Vista forense `/auditoria/casos/:id`** — cada evento, cada actor, cada decisión, con la evidencia del ranking | Juan | `frontend/app/(auditoria)` | 3.2 |

---

### 🚀 Ola 5 — Producción (~2,5 días)

**Dueño de tipos: Zaid.**

| ID | Tarea | Dueño | Dominio | Depende |
|---|---|---|---|---|
| 5.1 | **Webhooks salientes**: `webhook_endpoint`, `webhook_outbox`, relay con backoff + jitter, firma con timestamp, circuit breaker | Zaid | `core/src/webhooks` (nuevo), migración `0010` | 3.1 |
| 5.2 | **Vista `/panel/webhooks`**: endpoints, secreto de un solo vistazo, últimas entregas, **reenvío manual** | Sebas | `frontend/app/(panel)/webhooks` | 5.1 |
| 5.3 | **OpenTelemetry + Pino con redacción de PII**, `casoId` en cada span, `trace_id` que sobrevive la cola | Juan | `core/src/observabilidad`, `ai-core/app/telemetria.py` | — |
| 5.4 | **Métricas de negocio + tablero** (§7.2) | Neid | `core/src/observabilidad/metricas.ts` | 5.3 |
| 5.5 | **Alertas y runbooks** (§7.3, §7.4) | Sebas | `docs/runbooks/*` | 5.4 |
| 5.6 | **E2E con Playwright** del flujo del demo completo, corriendo en CI | Zaid | `e2e/`, `.github/workflows` | 1.7 |
| 5.7 | **Prueba de carga con k6**: 50 casos simultáneos, medir contra los SLOs del §7.1 | Juan | `carga/` | 5.6 |
| 5.8 | **Política de retención implementada**: purga de PII al cierre + ventana, con test | Neid | `core/src/retencion`, worker | 3.1 |
| 5.9 | **`/panel/api`**: llaves con alcance y rotación | Sebas | `core/src/auth/llaves.ts`, `frontend/app/(panel)/api` | 1.3 |
| 5.10 | **Despliegue completo**: `render.yaml` con los tres servicios + Redis + workers, secretos, healthchecks | Zaid | `render.yaml`, `Dockerfile`s, `Taskfile.yml` | — |
| 5.11 | **`/admin/catalogos` y `/admin/modelos`**: motivos, protocolos, mapa Dx→servicios y versiones de prompt, todo versionado | Juan | `frontend/app/(admin)` | 3.12 |
| 5.12 | **Endurecimiento final**: checklist del §6.5 completo, con evidencia por ítem | Neid | transversal | todo |

---

### 10.2 Orden de merge dentro de cada ola

El reparto evita que dos personas toquen el mismo archivo, pero hay **nueve pares que comparten directorio**. En esos, el orden importa: el primero mergea, el segundo rebasa. No es burocracia — es la diferencia entre una tarde de trabajo y una tarde de resolver conflictos.

| Ola | Primero mergea | Después | Por qué |
|---|---|---|---|
| 0 | 0.6 (catálogo de motivos) | 0.1 (guard de aceptación) | 0.1 devuelve el nuevo código de motivo |
| 1 | 1.1 (esquema) | 1.5, 1.6 | Las policies necesitan las tablas |
| 1 | 1.3 (sesión con actor) | 1.4, 1.8 | Ambas consumen el token nuevo |
| 2 | **2.7 (shell de `/panel`)** | 2.4, 2.5, 2.10 | Todas cuelgan del layout |
| 2 | **2.8 (`lib/api.ts` + Query)** | todo el frontend de la ola | Es el archivo más compartido del repo |
| 2 | 2.1 (API de afiliación) | 2.2, 2.3, 2.6, 2.9 | — |
| 2 | 2.2 (vista de afiliación) | 2.3 | 2.3 es un componente dentro de 2.2 |
| 3 | 3.1 (eventos) | 3.2, luego 3.8, 3.10, 3.11 | Cadena estricta: esquema → cableado → worker |
| 3 | 3.6 (móvil) | 3.7 | 3.7 agrega `posicion.ts` |

**Regla general:** quien abre un directorio nuevo lo mergea primero, aunque su tarea sea más pequeña.

### 10.2 Reparto final

| | Ola 0 | Ola 1 | Ola 2 | Ola 3 | Ola 4 | Ola 5 | **Total** |
|---|---|---|---|---|---|---|---|
| **Juan** | 0.4, 0.7 | 1.4, 1.8 | 2.1, 2.5, 2.9 | 3.4, 3.7, 3.11 | 4.3, 4.8, 4.12 | 5.3, 5.7, 5.11 | **16** |
| **Zaid** | 0.2, 0.8 | 1.1, 1.5 | 2.4, 2.8, 2.12 | 3.3, 3.6, 3.9 | 4.4, 4.6, 4.11 | 5.1, 5.6, 5.10 | **16** |
| **Neid** | 0.3, 0.5 | 1.2, 1.6 | 2.2, 2.6, 2.10 | 3.1, 3.8, 3.12 | 4.2, 4.7, 4.9 | 5.4, 5.8, 5.12 | **16** |
| **Sebas** | 0.1, 0.6 | 1.3, 1.7 | 2.3, 2.7, 2.11 | 3.2, 3.5, 3.10 | 4.1, 4.5, 4.10 | 5.2, 5.5, 5.9 | **16** |

**64 tareas, 16 por persona, reparto exacto.** Cada quien toca migraciones, backend, frontend, IA e infraestructura en algún momento — nadie queda encasillado y nadie es cuello de botella.

### 10.3 El camino crítico

Si hay que recortar, esto es lo que **no** se puede recortar:

```
0.1 aceptación única  →  1.2 persistencia  →  3.1 eventos  →  4.1 recepción  →  4.8 RDA
                         1.3 identidad     →  3.3 capacidad declarada
```

Todo lo demás —afiliación, webhooks salientes, cobertura, carga— es valioso y es **posterior**. Sin esos siete, no hay producto que llevar a una IPS; con esos siete, hay algo real aunque falte todo lo demás.

### 10.4 Definición de "listo" (aplica a toda tarea)

- [ ] Tests que prueban el comportamiento, no la implementación
- [ ] Sin credenciales → degrada y **lo dice** (la regla del repo)
- [ ] Toda mutación es idempotente y escribe su evento
- [ ] Sin PII en logs ni en URLs
- [ ] Alcance de inquilino verificado en servidor
- [ ] `contracts/types.ts` sin cambios fuera del protocolo de la ola
- [ ] Tocable con guantes, legible a bajo brillo, sin scroll horizontal en 320-430 px (si es UI de campo)
- [ ] `task doctor` verde y `grep -rn "<<<<<<<"` limpio

---

## Fuentes

**Normativa e interoperabilidad (Colombia)**
- [Guía de implementación FHIR del RDA — IHCE / MinSalud (vulcano.ihcecol.gov.co)](https://vulcano.ihcecol.gov.co/)
- [Índice de perfiles RDA](https://vulcano.ihcecol.gov.co/indexRDA)
- [Normatividad IHCE — MinSalud](https://www.minsalud.gov.co/ihce/Paginas/Normatividad.aspx)
- [Documento Maestro IHCE (PDF, 111 pp.)](https://www.minsalud.gov.co/ihce/Manuales/Documento_Maestro_IHCE.pdf)
- [Resolución 1888 de 2025 (PDF)](https://www.minsalud.gov.co/Normatividad_Nuevo/Resolucion%20No%201888%20de%202025.pdf)
- [Ley 2015 de 2020 — Gestor Normativo](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=105472)
- [Historia clínica electrónica en Colombia 2026 — guía y plazos](https://www.nevatal.com/es-CO/blog/historia-clinica-electronica-colombia)
- [Historia clínica electrónica interoperable: el caso de Colombia (SciELO)](http://www.scielo.org.pe/scielo.php?script=sci_arttext&pid=S2227-47312022000100026)

**Referencias de dominio (EMS)**
- [Resgrid/Core — CAD open source (Apache-2.0)](https://github.com/Resgrid/Core)
- [AwesomeEMS — índice de software y protocolos EMS](https://github.com/jenkstom/AwesomeEMS)
- [IHE mPSC — mapeo NEMSIS → FHIR](https://build.fhir.org/ig/IHE/PCC.PCS/NEMSIS-Mapping.html)
- [Representing Health Care Data for EMS — HealthIT ISA](https://www.healthit.gov/isa/representing-health-care-data-emergency-medical-services)
- [EMSTrack/EMS-Simulator](https://github.com/EMSTrack/EMS-Simulator)

**Ingeniería**
- [Postgres RLS para multi-tenancy: el patrón y sus trampas](https://patotski.com/blog/postgres-row-level-security-multi-tenant/)
- [Multi-tenant SaaS API con NestJS y Postgres RLS — Telerik](https://www.telerik.com/blogs/how-to-build-multi-tenant-saas-api-nestjs-postgres-row-level-security)
- [Drizzle ORM + Postgres RLS para multi-tenancy](https://ecosire.com/blog/drizzle-orm-postgres-rls-multitenancy)
- [Guía de webhooks de WhatsApp — Hookdeck](https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices)
- [Fiabilidad de webhooks de WhatsApp — guía de ingeniería 2026](https://richautomate.in/blog/whatsapp-webhook-reliability-engineering-guide-2026)
- [Transactional outbox para generar eventos de webhook — Convoy](https://www.getconvoy.io/blog/webhooks-with-transactional-outbox)
- [Trazar el patrón outbox con OpenTelemetry](https://oneuptime.com/blog/post/2026-02-06-trace-outbox-pattern-transactional-messaging-opentelemetry/view)
- [nestjs-outbox](https://github.com/fullstackhouse/nestjs-outbox)
- [OpenTelemetry en NestJS — instrumentación de TypeORM y BullMQ](https://docs.base14.io/instrument/apps/auto-instrumentation/nestjs/)
- [Testcontainers con NestJS — buenas prácticas](https://arg-software.medium.com/testcontainers-best-practices-for-nestjs-integration-testing-4726179bef82)
