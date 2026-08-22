# 🫀 PULSO

<img src="./project-logo.png" alt="PULSO" width="140" />

**Del dictado del paramédico al hospital que sí puede recibirlo, en menos de 90 segundos.**

Platanus Hack 26: Bogotá · Track 🚨 Emergencies · team-6

---

## Arranque rápido (5 minutos)

```bash
npm install
cp .env.example .env.local     # PowerShell: copy .env.example .env.local
npm run dev
```

Abre <http://localhost:3000>. **Funciona sin ninguna credencial**: sin Supabase usa 14 sedes semilla, sin Mapbox estima el ETA por distancia, sin API key de Claude usa un extractor por palabras clave. Cada credencial que agregues mejora una pieza sin romper nada.

Para el demo se abren **dos pantallas a la vez**: `/campo` en el celular y `/hospital` en el portátil.

<details>
<summary><b>Trabajando con Live Share</b></summary>

- **Solo el host corre `npm run dev`.** Live Share reenvía el puerto 3000 a todos.
- El `.env.local` vive **solo en la máquina del host**. Los demás no lo necesitan.
- Si a alguien no le carga `localhost:3000`, que revise el panel de Live Share → *Shared Servers*.
- ⚠️ **`node_modules` dentro de OneDrive es un problema conocido**: OneDrive intenta sincronizar 60.000 archivos y bloquea el build. Si ves errores raros de `EPERM` o el build se cuelga, click derecho en la carpeta `hackaton` → *Liberar espacio* / excluir de la sincronización.

</details>

---

## El problema

Durante una emergencia crítica en Colombia, el proceso de **referencia y contrarreferencia** funciona por teléfono. La ambulancia rebota de IPS en IPS porque nadie sabe, en el momento, quién tiene la cama y el especialista. Cada 15 minutos perdidos en un infarto o un ACV se pagan en secuelas irreversibles.

## Por qué falla lo que ya existe

Todos los intentos previos —incluidos los del Estado— parten de la misma premisa: **que un hospital saturado va a reportar su ocupación**.

No lo hace. Y tenemos la prueba.

> El dataset **"Registro diario de ocupación de capacidad instalada"**
> ([`uwc4-gvg3`](https://www.datos.gov.co/resource/uwc4-gvg3.json) en datos.gov.co)
> tiene **8.389 filas** y **una sola fecha: 2022-11-30**.
>
> Un registro *diario*, *obligatorio*, con **un solo día vivo**. Se apagó en el
> momento exacto en que terminó el mandato COVID.

Ese es el hallazgo que sostiene todo el pitch. El reporte manual no falla por falta de voluntad: falla por diseño.

## Qué hace PULSO distinto

**El acto de rechazar ya es el sensor.**

Hoy, cuando un jefe de urgencias dice "no tengo cama", esa información se pierde en una llamada telefónica. PULSO la captura, la fecha y la convierte en el *prior* de la siguiente decisión. El hospital no tipea nada — aprieta un botón que de todas formas iba a apretar.

Cada handshake es una observación etiquetada. **La red se entrena sola.**

---

## Cómo funciona

```
        🎙 dictado de voz
              │
              ▼
    ┌─────────────────────┐
    │   /api/triage       │  Claude → entidades clínicas estructuradas
    │   (Neid)            │  CIE-10 · triage 1-5 · códigos REPS
    └──────────┬──────────┘
               ▼
    ┌─────────────────────┐
    │   /api/match        │  1. PostGIS: sedes en el radio
    │   (Zaid + Neid)     │  2. Mapbox Matrix: ETA con tráfico real
    │                     │  3. filtro duro + score en MINUTOS
    └──────────┬──────────┘
               ▼
    ┌─────────────────────┐
    │   /api/dispatch     │  Telegram / WhatsApp → 2 botones
    │   (Sebas)           │
    └──────────┬──────────┘
               ▼
    ┌─────────────────────┐
    │ /api/handshake/     │  ⭐ aceptar | rechazar
    │      respond        │     → actualiza P(aceptación) de la sede
    │   (Sebas)           │     → mueve el índice de congestión
    └─────────────────────┘     → re-rutea al siguiente
```

### El score está en minutos

Decisión de diseño deliberada: **no son "puntos"**. Cada término es una cantidad de minutos de hora dorada que esa decisión cuesta o ahorra. Por eso el ranking se entiende sin explicación.

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

`P(aceptación)` es un posterior Beta-Bernoulli por sede que arranca en un prior estructural del REPS y se mueve con cada handshake. Ver [`lib/scoring.ts`](lib/scoring.ts) y [`lib/congestion.ts`](lib/congestion.ts).

---

## Datos

Endpoints verificados contra la API real (agosto 2026):

| Fuente | Recurso | Estado | Uso |
|---|---|---|---|
| REPS — prestadores y sedes | [`c36g-9fc2`](https://www.datos.gov.co/resource/c36g-9fc2.json) | ✅ vivo, corte abr 2026 · **16.181 sedes en Bogotá** | Universo de IPS. Sin lat/lon → hay que geocodificar. |
| Ocupación diaria | [`uwc4-gvg3`](https://www.datos.gov.co/resource/uwc4-gvg3.json) | ⚠️ 8.389 filas, **una sola fecha** | Semilla de camas + **la slide del pitch** |
| CodeSystem FHIR de servicios | [`REPShealthcareServices`](https://vulcano.ihcecol.gov.co/CodeSystem-REPShealthcareServices) | ✅ 130 conceptos, CC-BY-4.0 | Vocabulario oficial de MinSalud |

**Filtro de Bogotá:** `$where=departamentodededesc='Bogotá D.C'` — sin punto final ni coma. Así viene el string; si lo "arreglas" devuelve 0 filas.

### Códigos de servicio (los correctos)

El README original del proyecto traía `302` para UCI y `408` para hemodinamia. **Están mal.** Según el CodeSystem FHIR de MinSalud:

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

## Marco normativo

Esto es lo que separa un proyecto de hackathon de uno que un médico toma en serio.

- **Res. 5596/2015** — triage de 5 niveles. I: inmediato · II: ≤30 min · III: ≤120 · IV: ≤240 · V: ≤360. El parser emite este número.
- **Res. 3100/2019** — habilitación de servicios, y los móviles **TAB** (básico) vs **TAM** (medicalizado). El tipo de móvil es un **filtro duro**: un TAB no traslada un paciente que requiere ventilación.
- **Res. 1220/2010** — el **CRUE** tiene la potestad regulatoria. **PULSO propone; el CRUE regula.** No lo reemplazamos: legalmente no se puede, y decir lo contrario en el pitch es un autogol.
- **Ley 1751/2015** — las urgencias se atienden sin autorización previa. Por eso el botón "Rechazar" **no es un derecho a negar atención**: es una *declaración de capacidad*, queda auditada con timestamp, y en triage I ni siquiera se ofrece. Esa regla está implementada en [`app/hospital/page.tsx`](app/hospital/page.tsx).

---

## El equipo

Cuatro carriles que no se bloquean entre sí. **Cada quien lee su README y arranca.**

| Persona | Carril | README | Dueño de |
|---|---|---|---|
| **Juan Lizcano** · [@lizcanojuan1010](https://github.com/lizcanojuan1010) | Frontend / PWA | [docs/juan-frontend.md](docs/juan-frontend.md) | `/campo`, mapa, componentes, el cronómetro |
| **Alberth Zaid Pantoja** · [@alberthzaid](https://github.com/alberthzaid) | Backend / Datos | [docs/zaid-backend.md](docs/zaid-backend.md) | ETL REPS, PostGIS, `/api/match`, `/crue` |
| **Neyl Peñuela Bernate** · [@neylinsomne](https://github.com/neylinsomne) | AI / LLM | [docs/neid-ai.md](docs/neid-ai.md) | `/api/triage`, scoring, congestión |
| **Sebastián Acuña** · [@heysebitas](https://github.com/heysebitas) | Producto / Pitch | [docs/sebas-producto.md](docs/sebas-producto.md) | `/hospital`, Telegram/WhatsApp, demo, deck |

📄 **[docs/contrato-api.md](docs/contrato-api.md)** — el contrato entre los cuatro. Léelo antes de tocar nada.

### La regla que hace que esto funcione

[`lib/types.ts`](lib/types.ts) **es ley**. Nadie cambia un tipo de ahí en silencio: se dice en voz alta antes de guardar. Un cambio silencioso rompe el trabajo de los otros tres sin que se enteren.

---

## Cronograma

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

## Verificación

```bash
npm run typecheck        # debe pasar limpio
npm run build            # debe pasar limpio
```

Prueba de humo del flujo completo (con el dev server corriendo):

```bash
# 1. dictado → caso estructurado
curl -s -X POST localhost:3000/api/triage -H "Content-Type: application/json" \
  -d '{"texto":"Masculino 54 anos, dolor precordial opresivo, supra ST en DII DIII aVF, inestable."}'

# 2. caso → ranking  (pasar el objeto `caso` completo de la respuesta anterior)
curl -s -X POST localhost:3000/api/match -H "Content-Type: application/json" \
  -d '{"caso": <el caso>, "limite": 5}'
```

**Lo que debe pasar** (assert duro, no "se ve bien"):
- Un caso de IAM devuelve **solo** sedes con `743` en el ranking.
- Las sedes sin `743` aparecen con `motivoDescarte` lleno, aunque estén más cerca.
- Tras rechazar, esa sede **desaparece** del ranking de ese caso y sube el #2.
- Los ETA son plausibles: nada de 3 minutos de la Plaza de Bolívar a Kennedy.

**Antes del pitch, ≥3 veces:** dictar en el teléfono real → ranking → despachar → el celular del "jefe de urgencias" vibra → aceptar → confirmación. Cronometrar. **Debe cerrar bajo 90 segundos.**

---

## Pendientes de entrega (plantilla Platanus)

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
