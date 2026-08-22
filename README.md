# 🫀 PULSO — Motor Predictivo de Ruteo e Inferencia de Urgencias Hospitalarias

<img src="./project-logo.png" alt="PULSO" width="140" />

**Del dictado del paramédico al hospital que sí puede recibirlo, en menos de 90 segundos.**

> Platanus Hack 26: Bogotá · Track 🚨 Emergencies · team-6
> *Transformando el proceso de referencia y contrarreferencia médica en Colombia mediante inferencia pasiva, matching algorítmico multi-variable y un handshake de un toque.*

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
| `apps/frontend` | Next.js | 3000 | pnpm |
| `apps/backend/core` | NestJS | 3001 | pnpm |
| `apps/backend/ai-core` | FastAPI | 8000 | uv |

Para cambiar puertos en una corrida: `task dev PORT_CORE=3005`.

<details>
<summary><b>Sin Task, a mano</b></summary>

Hacen falta **al menos** frontend y core: desde que el backend salió de Next,
el frontend no tiene API propia y las consolas no cargan sin core.

```bash
# terminal 1 — core (:3001)
cd apps/backend/core && pnpm install && cp env.example .env && pnpm start:dev

# terminal 2 — frontend (:3000)
cd apps/frontend && pnpm install && cp env.example .env.local && pnpm dev

# terminal 3 — ai-core (:8000), opcional: sin él el triage cae a la heurística
cd apps/backend/ai-core && uv sync && uv run uvicorn app.main:app --port 8000
```

⚠️ `AI_CORE_BASE_URL` en `core/.env` tiene que apuntar al puerto donde
realmente escucha ai-core (**8000**). Si no coinciden, todo lo que pasa por él
falla con un `fetch failed` que no explica nada.

</details>

Abre <http://localhost:3000>. **Funciona sin ninguna credencial**: sin Supabase usa sedes semilla, sin Mapbox estima el ETA por distancia, sin API key de Claude usa un extractor por palabras clave, y sin proveedor de voz el dictado usa el del navegador. Cada credencial que agregues mejora una pieza sin romper nada — y `GET /capacidades` te dice en cuál estás.

Para el demo se abren **dos pantallas a la vez**: `/campo` en el celular y `/hospital` en el portátil.

### Las consolas piden contraseña

La landing (`/`) es pública. Las tres consolas (`/campo`, `/hospital`, `/crue`) no: core sirve el dictado clínico y las coordenadas del paciente, así que exige sesión.

Pon una contraseña de turno en `apps/backend/core/.env`:

```bash
OPERADOR_PASSWORD=lo-que-quieras
SESION_SECRET=$(openssl rand -hex 32)   # firma la cookie de sesión
```

Si las dejas en blanco arranca igual: **core genera una contraseña aleatoria y la imprime al arrancar**, buscála en su log. Lo que nunca hace es arrancar sin autenticar.

Se entra una vez en `/entrar` y la sesión dura 12 horas — no molesta durante el pitch.

> Si vas a usar el webhook de Telegram, `TELEGRAM_WEBHOOK_SECRET` es **obligatorio**: sin él, core ignora todos los updates y los botones no hacen nada. `task doctor` te avisa. Ver [`telegram.controller.ts`](apps/backend/core/src/telegram/telegram.controller.ts).

<details>
<summary><b>Trabajando con Live Share</b></summary>

- **Solo el host corre `task dev`.** Live Share reenvía el puerto 3000 a todos.
- El `.env.local` vive **solo en la máquina del host**. Los demás no lo necesitan.
- Si a alguien no le carga `localhost:3000`, que revise el panel de Live Share → *Shared Servers*.
- ⚠️ **`node_modules` dentro de OneDrive es un problema conocido**: OneDrive intenta sincronizar 60.000 archivos y bloquea el build. Si ves errores raros de `EPERM` o el build se cuelga, click derecho en la carpeta `hackaton` → *Liberar espacio* / excluir de la sincronización.

</details>

---

## 🎯 El problema

En Colombia y América Latina, el proceso de **Referencia y Contrarreferencia (SIRC)** durante una emergencia crítica (ACV, infarto, politraumatismo) sufre de una asimetría de información mortal:

1. **La "Hora Dorada" perdida.** Por cada 15 minutos de retraso en la asignación de una cama de alta complejidad (UCI, hemodinamia, quirófano), la probabilidad de secuelas irreversibles o muerte aumenta drásticamente.
2. **El "Paseo de la Muerte".** Las ambulancias rebotan de IPS en IPS porque nadie sabe, en el momento, quién tiene la cama y el especialista de turno. No hay visibilidad en tiempo real de la capacidad instalada real.
3. **El colapso de la llamada telefónica.** Los centros reguladores (CRUE) dependen de llamadas manuales, correos estáticos y hojas de cálculo para coordinar traslados uno a uno.

## 🚫 Por qué falla lo que ya existe

Los intentos previos —incluidos los del Estado (SMART CRUE, dashboards institucionales)— parten de la misma premisa: **que un hospital saturado va a reportar su ocupación**.

No lo hace. Y tenemos la prueba.

> El dataset **"Registro diario de ocupación de capacidad instalada"**
> ([`uwc4-gvg3`](https://www.datos.gov.co/resource/uwc4-gvg3.json) en datos.gov.co)
> tiene **8.389 filas** y **una sola fecha: 2022-11-30**.
>
> Un registro *diario*, *obligatorio*, con **un solo día vivo**. Se apagó en el
> momento exacto en que terminó el mandato COVID.

Ese es el hallazgo que sostiene todo el pitch. El reporte manual no falla por falta de voluntad: falla por diseño.

| Enfoque tradicional | Por qué fracasa | El enfoque de PULSO |
| :--- | :--- | :--- |
| **Reporte manual del hospital** | Exige que médicos en salas colapsadas actualicen un tablero web a mano. El dato nace desactualizado. | **Inferencia pasiva (zero-friction):** la congestión se deduce de las propias respuestas de la red, sin exigir tipeo. |
| **Ruteo por distancia pura** | Envía la ambulancia al hospital geográficamente más cercano, ignorando si el servicio existe o está saturado. | **Matching multi-variable:** minimiza `ETA + riesgo de rechazo + congestión`, sujeto a un filtro duro de servicios habilitados. |
| **Burocracia documental** | 20 minutos redactando formatos de remisión y códigos CIE-10 antes de autorizar el despacho. | **LLM Triage Agent:** convierte la nota de voz clínica en entidades médicas estructuradas en segundos. |

## 💡 Qué hace PULSO distinto

**El acto de rechazar ya es el sensor.**

Hoy, cuando un jefe de urgencias dice "no tengo cama", esa información se pierde en una llamada telefónica. PULSO la captura, la fecha y la convierte en el *prior* de la siguiente decisión. El hospital no tipea nada — aprieta un botón que de todas formas iba a apretar.

Cada handshake es una observación etiquetada. **La red se entrena sola.**

---

## 🧠 La solución: arquitectura

PULSO es un orquestador inteligente que conecta al personal de campo (paramédico en ambulancia / IPS primaria) con el receptor hospitalario óptimo, eliminando la intermediación burocrática manual. Cuatro piezas:

1. **🎙️ Voice/Text Clinical Parser (`POST /triage`).** El paramédico dicta: *"Masculino 54 años, dolor precordial opresivo, supra ST en DII-DIII-aVF, hemodinámicamente inestable"*. Claude (structured output) extrae: diagnóstico probable **CIE-10 `I21.1`**, **triage II** (Res. 5596/2015), servicios mandatorios **`743` hemodinamia + `110` UCI adultos**, complejidad requerida y si obliga móvil **TAM**.
2. **📊 Ingestion Engine de datos abiertos (REPS).** ETL sobre el Registro Especial de Prestadores: 16.181 sedes de Bogotá con servicios habilitados, geocodificadas a PostGIS.
3. **🧮 Dynamic Matching & Scoring Engine (`POST /match`).** PostGIS filtra por radio → Mapbox Matrix da ETA con tráfico real → filtro duro + score **en minutos** (ver abajo).
4. **📲 One-Tap Handshake (`POST /dispatch` + `POST /handshake/respond`).** Alerta instantánea vía Telegram / WhatsApp interactivo al jefe de urgencias con dos botones: `[Aceptar]` / `[Rechazar]`. La respuesta actualiza `P(aceptación)` y la congestión de la sede, y re-rutea al siguiente.

```
   apps/frontend :3000          apps/backend/core :3001
   ─────────────────────        ───────────────────────
        🎙 dictado de voz
              │
              ▼  fetch
    ┌─────────────────────┐
    │   POST /triage      │  Claude → entidades clínicas estructuradas
    │   (Neid)            │  CIE-10 · triage 1-5 · códigos REPS
    └──────────┬──────────┘
               ▼
    ┌─────────────────────┐
    │   POST /match       │  1. PostGIS: sedes en el radio
    │   (Zaid + Neid)     │  2. Mapbox Matrix: ETA con tráfico real
    │                     │  3. filtro duro + score en MINUTOS
    └──────────┬──────────┘
               ▼
    ┌─────────────────────┐
    │   POST /dispatch    │  Telegram / WhatsApp → 2 botones
    │   (Sebas)           │
    └──────────┬──────────┘
               ▼
    ┌─────────────────────┐
    │  POST /handshake/   │  ⭐ aceptar | rechazar
    │        respond      │     → actualiza P(aceptación) de la sede
    │   (Sebas)           │     → mueve el índice de congestión
    └─────────────────────┘     → re-rutea al siguiente
```

### El score está en minutos

Decisión de diseño deliberada: **no son "puntos" ni pesos adimensionales**. Cada término es una cantidad de minutos de hora dorada que esa decisión cuesta o ahorra. Por eso el ranking se entiende sin explicación.

```
Costo(sede) = ETA_con_tráfico
            + (1 − P_aceptación) × 22 min     ← lo que cuesta un rebote
            + congestión × 25 min             ← espera en puerta
            − bono por camas libres

sujeto a (filtro DURO, no ponderado):
    tiene TODOS los servicios exigidos  ∧  complejidad suficiente
  ∧ urgencias (1102) habilitado         ∧  compatible con el tipo de móvil
```

Una sede sin hemodinamia no es "peor opción": **es no-opción**. Ver una clínica a 10 minutos tachada en gris por no tener el servicio explica el producto entero sin decir una palabra.

`P(aceptación)` es un posterior Beta-Bernoulli por sede que arranca en un prior estructural del REPS y se mueve con cada handshake. La congestión es un índice inferido que sube con cada rechazo y decae en el tiempo. Ver [`apps/backend/core/src/scoring/scoring.service.ts`](apps/backend/core/src/scoring/scoring.service.ts) y [`apps/backend/core/src/scoring/congestion.service.ts`](apps/backend/core/src/scoring/congestion.service.ts).

### Las pantallas

| Ruta | Quién la usa | Qué hace |
|---|---|---|
| `/` | Cualquiera | Landing. La única ruta pública. |
| `/entrar` | El equipo de turno | Contraseña compartida → cookie de sesión. Las tres consolas de abajo pasan por aquí. |
| `/campo` | Paramédico (celular) | Dictado → caso estructurado → ranking → despacho → navegación. El cronómetro de hora dorada vive aquí. |
| `/hospital` | Jefe de urgencias | Consola de handshake: aceptar / rechazar con motivo. En **triage I no ofrece rechazo** (escala al CRUE). |
| `/crue` | Regulador | Geovisor: mapa a pantalla completa, ficha por sede, bandeja de alertas y registro auditable. **PULSO propone; el CRUE regula.** |

#### Dentro de `/campo`

La consola se usa de pie, con guantes, dentro de un vehículo en movimiento y
posiblemente de noche. Cada decisión de esa pantalla sale de ahí:

- **Barra persistente** — unidad, conectividad, GPS y estado de las
  integraciones. La conectividad domina porque de ella dependen las demás: un
  ranking calculado hace cuatro minutos, en un túnel, es una mentira
  peligrosa. Va con punto **y** palabra, nunca solo color.
- **Dictado en cualquier navegador** — Web Speech API donde existe; donde no
  (Firefox, Safari/iOS), se graba y transcribe en el servidor vía ai-core. El
  segundo camino además sobrevive a una zona muerta: el audio se guarda y se
  reintenta. El textarea nunca desaparece.
- **Orbe de voz** que reacciona al **volumen real** del micrófono, no al
  estado. Un asistente que se ve igual con alguien gritando que en silencio
  delata que la animación es decorativa.
- **Mapa de la unidad en vivo** (`watchPosition`) y, al aceptar, **ruta con
  maniobras en español** — más el desglose de por qué se eligió *ese*
  hospital, que es la duda que aparece en camino: "había uno más cerca".

---

## 🔧 El pipeline de datos

```bash
task datos:descargar   # una vez: 17 MB del REPS, no van al repo
task datos             # regenera data/procesado/ y el TypeScript que core importa
```

**Para correr el demo no hace falta ninguno de los dos**: lo generado está
commiteado.

`data/` trae 17 archivos de datos abiertos en tres encodings distintos. El
pipeline los normaliza y los convierte en artefactos tipados. Lee
[`scripts/datos/README.md`](scripts/datos/README.md); el inventario vive en
[`data/CATALOGO.md`](data/CATALOGO.md), y se genera solo.

Lo que salió de ahí y **cambió el producto**:

| Antes | Ahora |
|---|---|
| 14 sedes escritas a mano, servicios "ilustrativos" | **84 IPS de urgencias reales**, todas con código de habilitación REPS único, coordenadas y complejidad oficiales |
| Curva de demanda inventada, pico supuesto a las 20:00 | **Medida sobre 9206 incidentes del 123**. El pico real es a las **09:00** |
| Fin de semana +12% de carga | Sábado y domingo son los días **más flojos**. Los picos son lunes y martes |
| Ocupación de camas estimada | **62 sedes con camas medidas** (total y ocupadas, REPS) + ocupación real por subred 2021-2025 |
| Dictados de demo inventados | **400 casos** derivados de incidentes reales |

Dos archivos TypeScript se generan y **se commitean**, para que quien clone el
repo compile sin correr Python: `sedes/catalogo.generado.ts` y
`scoring/demanda.generada.ts`. No se editan a mano.

---

## 📂 Datos

Endpoints verificados contra la API real (agosto 2026):

| Fuente | Recurso | Estado | Uso |
|---|---|---|---|
| REPS — prestadores y sedes | [`c36g-9fc2`](https://www.datos.gov.co/resource/c36g-9fc2.json) | ✅ vivo, corte abr 2026 · **16.181 sedes en Bogotá** | Universo de IPS. Sin lat/lon → hay que geocodificar. |
| Ocupación diaria | [`uwc4-gvg3`](https://www.datos.gov.co/resource/uwc4-gvg3.json) | ⚠️ 8.389 filas, **una sola fecha** | Semilla de camas + **la slide del pitch** |
| CodeSystem FHIR de servicios | [`REPShealthcareServices`](https://vulcano.ihcecol.gov.co/CodeSystem-REPShealthcareServices) | ✅ 130 conceptos, CC-BY-4.0 | Vocabulario oficial de MinSalud |

**Filtro de Bogotá:** `$where=departamentodededesc='Bogotá D.C'` — sin punto final ni coma. Así viene el string; si lo "arreglas" devuelve 0 filas.

<details>
<summary><b>Fuentes exploradas para el roadmap (no integradas en el MVP)</b></summary>

- **SISPRO / MinSalud — históricos de capacidad instalada:** distribución de camas por IPS y tasas de rotación, como prior más rico que el snapshot 2022.
- **Bogotá Open Data / IDECA — movilidad e infraestructura vial:** isócronas de ambulancia con tráfico pesado (hoy lo cubre Mapbox `driving-traffic`).
- **SIVIGILA / INS — eventos de interés en salud pública:** ponderar picos epidemiológicos que saturan trauma o respiratorio.

</details>

### Códigos de servicio (los correctos)

El pitch original traía `302` para UCI y `408` para hemodinamia. **Están mal.** Según el CodeSystem FHIR de MinSalud:

| Código | Servicio |
|---|---|
| `1102` | Urgencias |
| `110` / `109` / `108` | UCI adultos / pediátrica / neonatal |
| `743` | **Hemodinamia e intervencionismo** |
| `245` | Neurocirugía |
| `203` | Cirugía general |
| `320` | Ginecobstetricia |
| `408` | Radioterapia — *no* hemodinamia |

Usar el vocabulario que el Ministerio ya publicó es el argumento de interoperabilidad más fuerte que tenemos: **PULSO no inventa códigos**.

---

## ⚖️ Marco normativo

Esto es lo que separa un proyecto de hackathon de uno que un médico toma en serio.

- **Res. 5596/2015** — triage de 5 niveles. I: inmediato · II: ≤30 min · III: ≤120 · IV: ≤240 · V: ≤360. El parser emite este número.
- **Res. 3100/2019** — habilitación de servicios, y los móviles **TAB** (básico) vs **TAM** (medicalizado). El tipo de móvil es un **filtro duro**: un TAB no traslada un paciente que requiere ventilación.
- **Res. 1220/2010** — el **CRUE** tiene la potestad regulatoria. **PULSO propone; el CRUE regula.** No lo reemplazamos: legalmente no se puede, y decir lo contrario en el pitch es un autogol.
- **Ley 1751/2015** — las urgencias se atienden sin autorización previa. Por eso el botón "Rechazar" **no es un derecho a negar atención**: es una *declaración de capacidad*, queda auditada con timestamp, y en triage I ni siquiera se ofrece. Esa regla está implementada en [`apps/frontend/app/(consolas)/hospital/page.tsx`](apps/frontend/app/(consolas)/hospital/page.tsx).

---

## 🏆 Qué nos hace únicos (moat)

1. **No depende del reporte manual de camas.** A diferencia de las plataformas institucionales, PULSO no asume que un médico ocupado va a loguearse a actualizar un tablero. La señal sale del flujo de trabajo que ya existe: aceptar o rechazar un traslado.
2. **Cero fricción de adopción.** Los hospitales receptores interactúan con micro-confirmaciones (Telegram / WhatsApp / consola web ligera), sin instalar software nuevo ni migrar historias clínicas.
3. **Enfoque en la Hora Dorada.** Reduce el tiempo de decisión y enrutamiento de **~45 minutos (promedio actual)** a **menos de 90 segundos**, y el cronómetro en pantalla lo demuestra en vivo.
4. **Interoperable por diseño.** Habla el vocabulario FHIR/REPS que MinSalud ya publicó y respeta el rol legal del CRUE.

---

## 🛠️ Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend / PWA | **Next.js 16 (App Router) + Tailwind CSS v4** — optimizado para uso táctil en ambulancia (dark, alto contraste, áreas ≥44px) |
| API | NestJS en `core` :3001 — `/triage` `/match` `/dispatch` `/handshake/respond` `/estado` `/escalamiento` `/ruta` `/voz/transcribir` `/capacidades`. Todas exigen sesión salvo `/health` y el webhook. |
| AI / NLP | **Claude (Anthropic SDK)** con structured output a esquema clínico; fallback heurístico por palabras clave sin credencial |
| Geo & Routing | **Mapbox** Matrix + Directions (`driving-traffic`); fallback por distancia haversine a 22 km/h efectivos |
| Datos | **PostgreSQL + PostGIS** (Supabase) · ETL Python del REPS ([`scripts/etl/extraer_reps.py`](scripts/etl/extraer_reps.py)) · 14 sedes semilla como fallback |
| Canales | **Telegram Bot** (inline keyboards) · **WhatsApp Cloud API** · consola web como fallback absoluto |
| Servicios satélite | Scaffolds **NestJS** ([`apps/backend/core`](apps/backend/core)) y **FastAPI** ([`apps/backend/ai-core`](apps/backend/ai-core)) para extracción post-MVP |

### Estructura del repo

```
apps/frontend/            ← las pantallas. Ya NO tiene API: pinta lo que core le da.
  app/(consolas)/campo/   ← pantalla del paramédico (Juan)
  app/(consolas)/hospital/← consola del jefe de urgencias (Sebas)
  app/(consolas)/crue/    ← vista del regulador (Zaid)
  components/campo/       ← barra persistente, orbe de voz, mapas, ruta
  lib/types.ts            ← ⭐ ESPEJO DEL CONTRATO. Ver regla abajo.
  lib/api.ts              ← el único sitio que habla con core

apps/backend/core/        ← NestJS :3001. Dueño de la sesión y de todo el estado.
  src/triage|match|dispatch|handshake|estado/   el flujo
  src/escalamiento/       cuando el ruteo no cierra → tablero del CRUE
  src/vigilante/          vence solicitudes, re-rutea y detecta demoras
  src/eta/                ETA con tráfico + ruta con maniobras (Mapbox)
  src/voz/                dictado entrante (→ai-core) y avisos salientes
  src/capacidades/        en qué modo corre cada integración
  src/contracts/types.ts  ⭐ EL CONTRATO. Es ley.

apps/backend/ai-core/     ← FastAPI :8000. Interno, sin CORS: solo core le habla.
                             parser clínico, scoring y transcripción (STT/TTS)
supabase/migrations/      ← esquema PostGIS
scripts/datos/            ← pipeline de datos abiertos (Python)
docs/                     ← guía por carril + contrato de API
```

⚠️ **`apps/frontend/app/api/` ya no existe.** El backend salió de Next a
`core` — entre otras cosas porque la service role de Supabase y las llaves de
Mapbox y Anthropic no pueden vivir en un bundle que se descarga el navegador.

### Degradación: nadie se bloquea por una credencial

| Falta | Qué pasa |
|---|---|
| `ANTHROPIC_API_KEY` (en ai-core) | Extractor heurístico por palabras clave (confianza 0.35, la UI lo marca) |
| Supabase | Sedes semilla de [`apps/backend/core/src/sedes/semillas.ts`](apps/backend/core/src/sedes/semillas.ts) |
| `MAPBOX_TOKEN` (en core) | ETA estimado por distancia (22 km/h efectivos) y sin ruta que trazar |
| `DEEPGRAM_API_KEY` / `ELEVENLABS_API_KEY` (en ai-core) | El dictado usa la Web Speech API del navegador — que **no existe en Firefox ni en Safari/iOS** |
| `TELEGRAM_BOT_TOKEN` | La tarjeta se imprime en la consola del servidor |

**Esto es a propósito y no se debe "arreglar".** Es lo que permite que los cuatro trabajen en paralelo desde la hora cero.

Pero degradar en silencio sí era un problema: un ETA calculado por regla de
tres se pintaba idéntico a uno con tráfico real, y nadie podía saberlo.
**`GET /capacidades`** dice en qué modo corre cada pieza, y la barra de
`/campo` lo muestra — solo lo que está degradado, para que no sea ruido.

---

## 👥 El equipo

Cuatro carriles que no se bloquean entre sí. **Cada quien lee su README y arranca.**

| Persona | Carril | README | Dueño de |
|---|---|---|---|
| **Juan Lizcano** · [@lizcanojuan1010](https://github.com/lizcanojuan1010) | Frontend / PWA | [docs/juan-frontend.md](docs/juan-frontend.md) | `/campo`, mapa, componentes, el cronómetro |
| **Alberth Zaid Pantoja** · [@alberthzaid](https://github.com/alberthzaid) | Backend / Datos | [docs/zaid-backend.md](docs/zaid-backend.md) | ETL REPS, PostGIS, `/match`, `/crue` |
| **Neyl Peñuela Bernate** · [@neylinsomne](https://github.com/neylinsomne) | AI / LLM | [docs/neid-ai.md](docs/neid-ai.md) | `/triage`, scoring, congestión |
| **Sebastián Acuña** · [@heysebitas](https://github.com/heysebitas) | Producto / Pitch | [docs/sebas-producto.md](docs/sebas-producto.md) | `/hospital`, Telegram/WhatsApp, demo, deck |

📄 **[docs/contrato-api.md](docs/contrato-api.md)** — el contrato entre los cuatro. Léelo antes de tocar nada.
🎨 **[docs/juan-frontend-pulsewave.md](docs/juan-frontend-pulsewave.md)** — el lenguaje visual del front (spec Pulsewave adaptado a reglas de campo).

### La regla que hace que esto funcione

[`apps/backend/core/src/contracts/types.ts`](apps/backend/core/src/contracts/types.ts) **es ley**. Nadie cambia un tipo de ahí en silencio: se dice en voz alta antes de guardar. Un cambio silencioso rompe el trabajo de los otros tres sin que se enteren.

---

## 🗓️ Cronograma

| Hora | Qué |
|---|---|
| **H0–H2** | ✅ *Ya hecho:* scaffold, contrato, migración SQL, ETL, flujo end-to-end sobre mocks. **Falta:** crear cuentas y **Sebas manda la plantilla de WhatsApp a aprobación (tarda 24–48h)**. |
| **H2–H10** | Cada quien su carril. Ver los READMEs. |
| **🚩 H10** | **HITO 1** — end-to-end con datos reales de Bogotá. Si no corre, se recorta alcance; no se extiende el horario. |
| **H10–H20** | Realismo: PostGIS real, Mapbox con tráfico, mapa, WhatsApp. |
| **🚩 H20** | **FEATURE FREEZE.** Lo que no funciona a H20 se corta. Sin excepciones. |
| **H20–H28** | El demo *es* el producto. Guion, modo determinista, **grabar video de respaldo**. |
| **H28–H34** | Tres ensayos completos. Turnos de sueño de 4h, mínimo 2 despiertos. Nadie hace la noche entera. |
| **H34–H36** | Buffer. No se toca código. |

---

## ✅ Verificación

```bash
cd apps/frontend && pnpm typecheck && pnpm build    # ambos limpios
cd apps/backend/core && pnpm test                   # los suites de persistence/
                                                    # y migration/ piden un
                                                    # PostgreSQL de pruebas
```

Prueba de humo del flujo completo (con el dev server corriendo):

```bash
# ⚠️ core exige sesión en TODO salvo /health. Sin la cookie, todo da 401.
curl -s -c /tmp/pulso.txt -X POST localhost:3001/auth/login \
  -H "Content-Type: application/json" -d '{"password":"<OPERADOR_PASSWORD>"}'

# 0. ¿en qué modo está corriendo el sistema?
curl -s -b /tmp/pulso.txt localhost:3001/capacidades
#    ruteo "estimado" = sin MAPBOX_TOKEN, los ETA son regla de tres
#    ia "heuristico"  = sin ai-core alcanzable, extracción por palabras clave

# 1. dictado → caso estructurado
curl -s -b /tmp/pulso.txt -X POST localhost:3001/triage \
  -H "Content-Type: application/json" \
  -d '{"texto":"Masculino 54 anos, dolor precordial opresivo, supra ST en DII DIII aVF, inestable."}'

# 2. caso → ranking  (pasar el objeto `caso` completo de la respuesta anterior)
curl -s -b /tmp/pulso.txt -X POST localhost:3001/match \
  -H "Content-Type: application/json" -d '{"caso": <el caso>, "limite": 5}'

# 3. ruta hasta la sede elegida, con maniobras en español
curl -s -b /tmp/pulso.txt -X POST localhost:3001/ruta \
  -H "Content-Type: application/json" \
  -d '{"origen":{"lat":4.6097,"lng":-74.0817},"sedeCodigo":"<código>"}'
```

**Lo que debe pasar** (assert duro, no "se ve bien"):
- Un caso de IAM devuelve **solo** sedes con `743` en el ranking.
- Las sedes sin `743` aparecen con `motivoDescarte` lleno, aunque estén más cerca.
- Tras rechazar, esa sede **desaparece** del ranking de ese caso y sube el #2.
- Si nadie contesta en `HANDSHAKE_TIMEOUT_S`, la solicitud pasa a `timeout`
  sola y el vigilante re-rutea al siguiente candidato **sin que nadie toque
  nada**. Si se agotan, aparece un escalamiento en `GET /estado`.
- Aceptar una solicitud ya vencida devuelve `aplicada: false` y **no** revive
  el traslado: el paciente ya va camino a otra sede.
- Los ETA son plausibles: nada de 3 minutos de la Plaza de Bolívar a Kennedy.

**Antes del pitch, ≥3 veces:** dictar en el teléfono real → ranking → despachar → el celular del "jefe de urgencias" vibra → aceptar → confirmación. Cronometrar. **Debe cerrar bajo 90 segundos.**

---

## 📦 Pendientes de entrega (plantilla Platanus)

- [ ] Llenar metadata en `platanus-hack-project.jsonc` (nombre, oneliner, descripción, deploy URL)
- [ ] Reemplazar `project-description.md` con la descripción del proyecto — es lo que se renderiza en la página de votación
- [ ] Logo 1000x1000 px, máx 500kb, en `project-logo.png`

<details>
<summary><b>⚠️ Despliegue e integraciones (Vercel, Render, etc.)</b></summary>

Vercel, Render y Netlify solo pueden conectarse a repos **propios** — no se les
puede dar acceso a este repo de la organización. Para desplegar manteniendo los
commits acá, hay que espejar el código a un repo personal:

1. Crear un repositorio **personal** en tu cuenta de GitHub.
2. Apuntar `origin` a **ambos** repos, para que un solo `git push` actualice los dos:

   ```bash
   git remote set-url --add --push origin https://github.com/platanus-hack/platanus-hack-26-co-team-6.git
   git remote set-url --add --push origin https://github.com/<tu-usuario>/<tu-repo>.git
   ```

3. Conectar el servicio de despliegue al repo **personal**.

Los commits quedan espejados acá para la evaluación, y el deploy corre desde el repo propio.

</details>
