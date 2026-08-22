# Juan · Frontend / PWA

> 📌 **Documento de la hackathon (ago 2026).** Conserva contexto útil, pero **algunas rutas de archivo ya cambiaron**.
> El plan vigente está en [`docs/README.md`](README.md) y las tareas en [`docs/tareas/juan.md`](tareas/juan.md).

> Tú haces la pantalla que el jurado va a mirar durante 3 minutos.
> Si el motor es perfecto y la pantalla es confusa, perdemos.

---

## Tu punto de partida

**Ya corre end-to-end.** Abre <http://localhost:3000/campo>, aprieta un caso de prueba, dale *Analizar y rutear*, despacha, y en otra pestaña abre `/hospital` y acepta. Todo el flujo funciona.

Es **fea a propósito**. Tu trabajo no es construirla desde cero: es convertirla en algo que un paramédico usaría a las 3 de la mañana, con guantes, dentro de una ambulancia en movimiento.

## Tus archivos

| Archivo | Qué es |
|---|---|
| [`apps/frontend/app/campo/page.tsx`](../apps/frontend/app/campo/page.tsx) | **Tu pantalla principal.** Flujo completo funcionando. |
| `components/` | Vacío. Créalo tú. |
| [`apps/frontend/app/globals.css`](../apps/frontend/app/globals.css) | Tokens de diseño. Los define Sebas; tú los consumes. |
| [`apps/frontend/app/crue/page.tsx`](../apps/frontend/app/crue/page.tsx) | De Zaid, pero si te sobra tiempo ayúdale. |

## Lo que NO debes tocar

- `apps/backend/core/src/contracts/types.ts` sin avisar (ver [contrato-api.md](contrato-api.md))
- Los contratos de `/triage`, `/match`, `/dispatch`
- **El cronómetro.** El número que sale en el pitch sale de tu `transcurrido`. Puedes hacerlo más bonito; no puedes hacerlo mentir.

---

## Tareas

### Bloque 1 · H2–H10 — que se vea como un producto

- [ ] **Extraer componentes** de `campo/page.tsx` a `components/`: `TarjetaCandidato`, `TarjetaCaso`, `BotonDictado`, `Cronometro`. Ahora mismo está todo en un archivo — está bien para arrancar, mal para trabajar 30 horas.
- [ ] **Probar el dictado por voz EN EL TELÉFONO REAL DEL DEMO. En la hora 4, no en la hora 30.** Web Speech API necesita Chrome + HTTPS. En `localhost` funciona; desde otro dispositivo NO, hasta que haya deploy en Vercel. *Esta es la trampa número uno de este proyecto.*
- [ ] **Estados de carga que no sean texto.** "Analizando…" es pobre. Un pulso latiendo, un skeleton, algo que comunique que el sistema está pensando. Son los 3 segundos que el jurado va a mirar.
- [ ] **Jerarquía visual del ranking.** El #1 tiene que dominar la pantalla. Ahora todas las tarjetas pesan casi igual. El paramédico no debe *leer* — debe *ver* cuál es.
- [ ] **Que la tarjeta descartada duela.** Cuando aparece "Hospital Santa Clara · 10 min · ⛔ No tiene hemodinamia" y arriba está el #1 a 9 minutos, ese contraste **es el producto**. Ahora está en `opacity-50` y punto. Hazlo elocuente.

### Bloque 2 · H10–H20 — el mapa

- [ ] **Mapbox GL JS en `/campo`.** Marcador de origen, marcadores de sedes coloreados por congestión, y la ruta al #1 dibujada. `apps/backend/core/src/eta/eta.service.ts` ya tiene `rutaHasta()` que devuelve el GeoJSON LineString — solo falta exponerlo por una ruta de API y pintarlo.
- [ ] **Geolocalización real** del paramédico (`navigator.geolocation`) en vez de `ORIGEN_DEMO`. Con fallback: si el usuario niega el permiso, usar Plaza de Bolívar y no romperse.
- [ ] **Estado del handshake en vivo.** Ahora hace polling cada 1.5s y funciona. Si sobra tiempo: Supabase Realtime. Si no sobra: **déjalo en polling**, en el demo se ve idéntico. No gastes 3 horas en esto.
- [ ] **Modo TAB/TAM** — un selector. Cambia qué sedes son viables (filtro duro) y es un detalle de dominio que muy pocos equipos van a tener.

### Bloque 3 · H20–H28 — el demo

- [ ] **Contador de minutos ahorrados**: `45 min (baseline actual) − tu cronómetro`. Grande, en verde, al final. Ese número es la diapositiva de cierre.
- [ ] **Probar en el teléfono exacto del demo, en la red del evento.** No en tu máquina.
- [ ] **Que no haya scroll horizontal en ningún ancho.** Se ve en el proyector.

---

## Cómo pruebas lo tuyo

```bash
pnpm dev
```

Dos pestañas: `/campo` y `/hospital`. Despacha desde una, acepta en la otra.

Checklist antes de decir "listo":

- [ ] Funciona con el teléfono en la mano, **de pie**, no sentado frente al portátil.
- [ ] Se lee con brillo bajo (van a estar en un auditorio oscuro).
- [ ] Ningún botón mide menos de 44px de alto.
- [ ] Si el LLM devuelve `confianza < 0.5`, la UI lo dice. No presentamos como certeza lo que es una suposición.
- [ ] Si niego el permiso del micrófono, la app sigue funcionando con el textarea.

---

## Trampas conocidas

**Web Speech API.** Solo Chrome/Edge. Requiere HTTPS salvo en localhost. `continuous: true` se corta solo tras un rato de silencio — el `onend` ya lo maneja, no lo quites. En Safari/iOS no existe: el textarea **no es opcional**, es el plan B real.

**El polling y el hot-reload.** El estado vive en memoria del servidor (`apps/backend/core/src/almacen/almacen.service.ts`). Si guardas un archivo mientras el dev server corre, Next recarga el módulo y **puedes perder los casos**. Está enganchado a `globalThis` para mitigarlo, pero si algo desaparece raro, esa es la razón. No es un bug tuyo.

**`opacity` sobre tarjetas descartadas.** Cuidado con bajar tanto el contraste que en el proyector no se lea el motivo del descarte. Ese texto es un argumento del pitch.

---

## Nota de Neid (H+): dónde vive el motor ahora

Nada de tu contrato cambia — `Candidato`, `DesgloseScore`, `motivoDescarte` y
las descartadas en gris siguen idénticas. Esto es solo para que no te
sorprenda si abres el backend.

El motor de scoring y congestión ahora también existe en
`apps/backend/ai-core` (`POST /v1/score`), portado a Python. `/api/match` sigue
funcionando igual que hoy; la versión de ai-core es la que usaremos si movemos
el cálculo fuera del frontend. **Tú no tienes que hacer nada.**

Dos cosas que sí te pueden servir:

- **El score es reproducible.** `/v1/score` acepta un campo `ahora` (ISO): con
  él fijo, el mismo request da exactamente el mismo ranking. Sirve para
  `NEXT_PUBLIC_MODO_DEMO` y para grabar el video de respaldo sin que la curva
  horaria te cambie los números entre tomas.
- **El desglose de congestión** (ocupación base, horario, rechazo reciente,
  epidemiológico) está disponible por separado si quieres pintar el panel de
  "por qué" al abrir una tarjeta. Está en `app/congestion.py`,
  `desglose_congestion()`. Si lo quieres expuesto por HTTP, dime y lo saco.
