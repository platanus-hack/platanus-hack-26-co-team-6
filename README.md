<div align="center">

<img src="./project-logo.png" alt="PULSO" width="160" />

# PULSO

**Del dictado del paramédico al hospital que sí puede recibirlo, en menos de 90 segundos.**

🔗 **[Demo en vivo](https://pulso-frontend.onrender.com)** · Platanus Hack 26 · Bogotá · Track 🚨 Emergencias · team-6

</div>

---

## El problema

En una emergencia crítica (infarto, ACV, politraumatismo), asignar la cama correcta hoy toma **~45 minutos de llamadas telefónicas**, y cada 15 minutos de retraso aumenta drásticamente las secuelas o la muerte. Las ambulancias rebotan de IPS en IPS —el "paseo de la muerte"— porque nadie sabe, en el momento, quién tiene la cama y el especialista de turno.

¿Por qué no existe un tablero de capacidad en tiempo real? Porque **el reporte manual falla por diseño**, y tenemos la prueba:

> El dataset oficial **"Registro diario de ocupación de capacidad instalada"**
> ([`uwc4-gvg3`](https://www.datos.gov.co/resource/uwc4-gvg3.json) en datos.gov.co)
> tiene **8.389 filas** y **una sola fecha: 2022-11-30**. Un registro *diario*,
> *obligatorio*, con un solo día vivo — se apagó al terminar el mandato COVID.

## La solución

PULSO no le pide a ningún hospital que reporte camas. **El acto de rechazar ya es el sensor**: cuando un jefe de urgencias dice "no tengo cama", esa respuesta se captura, se fecha y se convierte en el *prior* de la siguiente decisión. La red se entrena sola con cada handshake.

```
  🎙 dictado (voz / WhatsApp)
        │
        ▼
  POST /triage      Claude → caso clínico estructurado
        │           CIE-10 · triage 1-5 · servicios REPS · tipo de móvil
        ▼
  POST /match       84 IPS de urgencias reales de Bogotá
        │           filtro DURO de servicios + score en MINUTOS
        ▼
  POST /dispatch    Telegram / WhatsApp / consola → [Aceptar] [Rechazar]
        │
        ▼
  handshake         acepta → prearribo con SBAR y checklist
                    rechaza / no contesta → re-rutea al siguiente, solo
                    ranking vacío → escala al CRUE
```

### El score está en minutos, no en puntos

Cada término es tiempo de hora dorada que esa decisión cuesta o ahorra — por eso el ranking se entiende sin explicación:

```
Costo(sede) = ETA_con_tráfico
            + (1 − P_aceptación) × 22 min     ← lo que cuesta un rebote
            + congestión × 25 min             ← espera en puerta
            − bono por camas declaradas

sujeto a (filtro DURO, no ponderado):
    tiene TODOS los servicios exigidos  ∧  complejidad suficiente
  ∧ urgencias (1102) habilitada         ∧  compatible con el tipo de móvil
```

Una sede sin hemodinamia para un infarto no es "peor opción": **es no-opción**. `P(aceptación)` es un posterior Beta-Bernoulli por sede; la congestión es un índice inferido que sube con cada rechazo y decae en el tiempo ([scoring.service.ts](apps/backend/core/src/scoring/scoring.service.ts) · [congestion.service.ts](apps/backend/core/src/scoring/congestion.service.ts)).

### Las pantallas

| Ruta | Quién | Qué hace |
|---|---|---|
| [`/`](https://pulso-frontend.onrender.com) | Cualquiera | Landing. La única ruta pública. |
| `/entrar` | Equipo de turno | Sesión → cookie `HttpOnly`. Las consolas exigen sesión: detrás hay dictado clínico y coordenadas de paciente. |
| `/campo` | Paramédico (celular) | Dictado → caso → ranking → despacho → navegación. El cronómetro de hora dorada vive aquí. |
| `/hospital` | Jefe de urgencias | Handshake con auditoría filtrable, prearribos y declaración de capacidad. **En triage I no ofrece rechazo** (Ley 1751/2015). |
| `/crue` | Regulador | Geovisor, escalamientos y override con justificación. **PULSO propone; el CRUE regula.** |

### Por qué es distinto

1. **Cero fricción de adopción.** El hospital no instala nada ni tipea nada: aprieta un botón que de todas formas iba a apretar (Telegram, WhatsApp o consola web).
2. **Legalmente en su sitio.** Rechazar es una *declaración de capacidad* auditada con timestamp, no un derecho a negar atención; el CRUE conserva la potestad regulatoria (Res. 1220/2010). Nada con consecuencia clínica ocurre sin confirmación humana registrada.
3. **Interoperable por diseño.** Usa el vocabulario de servicios FHIR/REPS que MinSalud ya publicó, y produce en la escena buena parte del RDA de urgencias que la Res. 1888/2025 exige en FHIR R4 desde abril de 2026.
4. **Datos reales.** 84 IPS con habilitación REPS verificada; curva de demanda medida sobre **9.206 incidentes reales de la línea 123** (el pico es a las 09:00, no a las 20:00); 400 dictados de demo derivados de incidentes reales.

---

## Arranque rápido (5 minutos)

Con [Task](https://taskfile.dev) instalado, desde la raíz:

```bash
task setup     # instala las 3 apps y crea los .env locales
task doctor    # verifica venv, dependencias, env y puertos libres
task dev       # levanta frontend + core + ai-core a la vez
```

| App | Stack | Puerto | Gestor |
|---|---|---|---|
| `apps/frontend` | Next.js 16 | 3000 | pnpm |
| `apps/backend/core` | NestJS | 3001 | pnpm |
| `apps/backend/ai-core` | FastAPI | 8000 | uv |
| `apps/services/voz` | FastAPI (WhatsApp/Twilio) | 8090 | uv |

Abre <http://localhost:3000>. **Funciona sin ninguna credencial**: sin Supabase usa sedes semilla, sin Mapbox estima el ETA por distancia, sin API key de Claude usa un extractor heurístico (confianza 0.35, la UI lo marca), y sin proveedor de voz el dictado usa el del navegador. `GET /capacidades` dice en qué modo corre cada pieza. **Esa degradación es la regla, no un bug.**

Para el demo se abren dos pantallas a la vez: `/campo` en el celular y `/hospital` en el portátil.

### Las consolas piden contraseña

La landing es pública; las consolas no. Pon la contraseña de turno en `apps/backend/core/.env`:

```bash
OPERADOR_PASSWORD=lo-que-quieras
SESION_SECRET=$(openssl rand -hex 32)
```

Si las dejas vacías, core **genera una aleatoria y la imprime en su log** en cada arranque. Lo que nunca hace es arrancar sin autenticar — la autenticación es la única pieza que no degrada a modo abierto.

<details>
<summary><b>Sin Task, a mano</b></summary>

Hacen falta al menos frontend y core: el frontend no tiene API propia.

```bash
# terminal 1 — core (:3001)
cd apps/backend/core && pnpm install && cp env.example .env && pnpm start:dev

# terminal 2 — frontend (:3000)
cd apps/frontend && pnpm install && cp env.example .env.local && pnpm dev

# terminal 3 — ai-core (:8000), opcional: sin él el triage cae a la heurística
cd apps/backend/ai-core && uv sync && uv run uvicorn app.main:app --port 8000
```

⚠️ `AI_CORE_BASE_URL` en `core/.env` tiene que apuntar al puerto real de ai-core (8000), o todo lo que pasa por él falla con un `fetch failed` sin explicación.

</details>

<details>
<summary><b>Verificación y prueba de humo</b></summary>

```bash
cd apps/frontend && pnpm typecheck && pnpm test && pnpm build
cd apps/backend/core && pnpm test   # persistence/ y migration/ piden un PostgreSQL de pruebas
```

Flujo completo por curl (core exige sesión en todo salvo `/health`):

```bash
curl -s -c /tmp/pulso.txt -X POST localhost:3001/auth/login \
  -H "Content-Type: application/json" -d '{"password":"<OPERADOR_PASSWORD>"}'

curl -s -b /tmp/pulso.txt localhost:3001/capacidades   # ¿en qué modo corre todo?

curl -s -b /tmp/pulso.txt -X POST localhost:3001/triage \
  -H "Content-Type: application/json" \
  -d '{"texto":"Masculino 54 anos, dolor precordial opresivo, supra ST en DII DIII aVF, inestable."}'

curl -s -b /tmp/pulso.txt -X POST localhost:3001/match \
  -H "Content-Type: application/json" -d '{"caso": <el caso>, "limite": 5}'
```

**Lo que debe pasar** (assert duro, no "se ve bien"):

- Un IAM devuelve **solo** sedes con hemodinamia (`743`); las demás aparecen con `motivoDescarte`, aunque estén más cerca.
- Tras rechazar, esa sede desaparece del ranking del caso y sube la #2.
- Sin respuesta en el plazo, la solicitud vence sola y el vigilante re-rutea al siguiente; si se agotan, aparece un escalamiento en `GET /estado`.
- Aceptar una solicitud vencida devuelve `aplicada: false` y no revive el traslado.

</details>

---

## Los datos

```bash
task datos:descargar   # una vez: 17 MB de datos abiertos, no van al repo
task datos             # regenera data/procesado/ y el TypeScript que core importa
```

Para correr el demo no hace falta ninguno de los dos: lo generado está commiteado (`sedes/catalogo.generado.ts`, `scoring/demanda.generada.ts` — no se editan a mano). Inventario en [`data/CATALOGO.md`](data/CATALOGO.md), pipeline en [`scripts/datos/README.md`](scripts/datos/README.md).

| Fuente | Recurso | Uso |
|---|---|---|
| REPS — prestadores y sedes | [`c36g-9fc2`](https://www.datos.gov.co/resource/c36g-9fc2.json) · 16.181 sedes en Bogotá | Universo de IPS, habilitación y complejidad |
| Ocupación diaria | [`uwc4-gvg3`](https://www.datos.gov.co/resource/uwc4-gvg3.json) · una sola fecha | Semilla de camas + la slide del pitch |
| CodeSystem FHIR de servicios | [`REPShealthcareServices`](https://vulcano.ihcecol.gov.co/CodeSystem-REPShealthcareServices) · 130 conceptos | Vocabulario oficial: `1102` urgencias, `110` UCI adultos, `743` hemodinamia, `245` neurocirugía… **PULSO no inventa códigos.** |
| Línea 123 | 9.206 incidentes reales | Curva de demanda medida + 400 casos de demo |

## Marco normativo

- **Res. 5596/2015** — triage de 5 niveles; el parser emite este número.
- **Res. 3100/2019** — habilitación de servicios y móviles TAB/TAM; el tipo de móvil es filtro duro.
- **Res. 1220/2010** — la potestad regulatoria es del CRUE. PULSO propone; el CRUE regula.
- **Ley 1751/2015** — urgencias sin autorización previa: "rechazar" es declaración de capacidad auditada, y en triage I no se ofrece ([hospital/page.tsx](apps/frontend/app/(consolas)/hospital/page.tsx)).
- **Res. 1888/2025 (IHCE/RDA)** — intercambio en FHIR R4 obligatorio desde abril 2026; PULSO ya produce en la escena buena parte del RDA de urgencias.

## Stack y estructura

| Capa | Tecnología |
|---|---|
| Frontend | **Next.js 16 + Tailwind v4** — táctil ≥44 px, dark, alto contraste (se usa con guantes, de noche, en movimiento) |
| Dominio | **NestJS** `core` :3001 — triage, match, dispatch, handshake, vigilante, escalamiento, auditoría append-only |
| IA | **FastAPI** `ai-core` :8000 (interno, tiene las llaves) — **Claude** con salida estructurada + STT/TTS; heurística sin credencial |
| Canales | **FastAPI** `voz` :8090 (único público) — WhatsApp Cloud API, Twilio; Telegram desde core |
| Geo | **Mapbox** Matrix + Directions (`driving-traffic`); fallback por distancia |
| Datos | **PostgreSQL + PostGIS** (Supabase); semillas compiladas como fallback |

```
apps/frontend            las consolas          :3000   pnpm
apps/backend/core        el dominio            :3001   pnpm   ← interno
apps/backend/ai-core     la IA                 :8000   uv     ← interno, tiene las llaves
apps/services/voz        WhatsApp y Twilio     :8090   uv     ← ÚNICO público
supabase/migrations      esquema, numerado, con down
data/                    fuentes REPS y 123 + pipeline
docs/                    plan vigente y tareas
render.yaml              blueprint del deploy (4 servicios en Render)
```

La regla que sostiene el paralelismo: [`core/src/contracts/types.ts`](apps/backend/core/src/contracts/types.ts) **es ley** y su espejo manual es [`frontend/lib/types.ts`](apps/frontend/lib/types.ts) — cambiar uno solo no rompe el build, rompe el runtime. `textoCrudo` (dictado literal) y `origen` (dónde está el paciente) **no salen del servidor**.

## El equipo

| Persona | Carril | Dueño de |
|---|---|---|
| **Juan Lizcano** · [@lizcanojuan1010](https://github.com/lizcanojuan1010) | Frontend | `/campo`, mapas, cronómetro, consola de urgencias |
| **Alberth Zaid Pantoja** · [@alberthzaid](https://github.com/alberthzaid) | Backend / Datos | ETL REPS, PostGIS, `/match`, `/crue`, voz |
| **Neyl Peñuela Bernate** · [@neylinsomne](https://github.com/neylinsomne) | IA / LLM | `/triage`, scoring, congestión, ai-core |
| **Sebastián Acuña** · [@heysebitas](https://github.com/heysebitas) | Producto / Pitch | `/hospital`, Telegram/WhatsApp, demo, deck |

## Documentación

**Plan vigente** (en orden): [I · diagnóstico](docs/pulso-agente-campo-y-roles.md) → [II · plataforma y trámites](docs/pulso-plataforma-afiliacion-y-tramites.md) → [III · plan maestro](docs/pulso-produccion-plan-maestro.md) → [IV · multitenancy y login](docs/multitenancy-y-autenticacion.md)

**Referencia**: [contrato-api.md](docs/contrato-api.md) (es ley) · [tareas por persona](docs/tareas/) · [validaciones de negocio](docs/PULSO-validaciones-backend.md) · [índice completo](docs/README.md) · [deploy](render.yaml)
