<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# frontend — instrucciones para agentes

Lee primero [`AGENTS.md` de la raíz](../../AGENTS.md) y [`README.md`](README.md) de esta app.

> El bloque de arriba lo escribe `next dev` solo. **No lo borres del diff** — se vuelve a crear.

## Reglas duras de UI — vienen del uso, no del gusto

**No se negocian en `/campo`:**

- **Táctil ≥ 44 px**, primarios **56 px**. Se usa con guantes.
- **Sin scroll horizontal entre 320 y 430 px.**
- **Legible a bajo brillo.** Pruébalo con el brillo al mínimo, de verdad.
- **`prefers-reduced-motion` respetado.**
- **Si `confianza < 0.5`, la UI lo declara.** Una extracción dudosa no se pinta como una segura.
- **El textarea es plan B real del dictado.** Web Speech API solo existe en Chrome + HTTPS; en
  Safari/iOS no hay dictado. Pruébalo en el teléfono real del demo **temprano**, no la última noche.
- **La degradación se dice.** Un ETA estimado no se pinta igual que uno con tráfico —
  `GET /capacidades` existe justo para eso, y la barra persistente de `/campo` lo muestra.

## La frontera

`lib/api.ts` es **LA** frontera. El front **no calcula rutas, no puntúa sedes, no habla con Supabase
ni con Mapbox**: le pide a core y pinta lo que vuelve.

La sesión es una cookie `HttpOnly` que este archivo **nunca lee** — solo pide que el navegador la
mande con `credentials: "include"`. Por eso un XSS en una consola no se lleva el token. **No muevas el
token a `localStorage` por comodidad.**

## Lo que no debes romper

1. **`lib/types.ts` es espejo manual de `core/src/contracts/types.ts`.** Cambiar uno solo **no rompe
   el build — rompe el runtime**. Campos nuevos siempre opcionales.
2. **El cronómetro de `/campo`.** El número que sale en el pitch sale de `transcurrido`. Puedes hacerlo
   más bonito; no puedes hacerlo mentir.
3. **`expiraEn` viene del servidor.** No inventes el plazo en el front: la barra llegaría a cero
   mientras core sigue esperando.
4. **Mira `aplicada` antes de decir que un traslado quedó aceptado.** Vale `false` en doble toque o en
   respuesta tardía.
5. **En triage I, `/hospital` no ofrece botón de rechazo.** Es regla de producto (Ley 1751/2015), no
   un olvido.
6. **Las degradaciones de privacidad son deliberadas.** `CasoPublico` excluye `textoCrudo` y `origen`;
   el re-match desde `/crue` pinta el 400 de core a propósito. **No las "arregles".**

## Lenguaje visual

**Pulsewave** ([`docs/juan-frontend-pulsewave.md`](../../docs/juan-frontend-pulsewave.md)): dark-first,
Geist + Geist Mono (`tabular-nums` en cronómetro y ETA), `clamp()` fluido, cápsulas `rounded-full`,
píldoras glass `bg-neutral-900/70 backdrop-blur-lg rounded-2xl`, easing firma `[0.22,1,0.36,1]`,
springs `stiffness:400`, `AnimatePresence` para fases.

Acentos **solo para estados**, nunca para texto largo. Tokens en `app/globals.css`.

Dependencias permitidas: `motion`, `lucide-react`, `ogl`, `mapbox-gl`. **Sin three.js, sin GSAP.**

> ⚠️ **shadcn/ui entra SOLO en `/panel` y `/admin`** (tarea 2.7). **No toca `/campo`, `/hospital` ni
> `/crue`**: su lenguaje ya está definido y es un activo. Dos lenguajes conviviendo, a propósito.

## Mapas

Estilo `standard-satellite` con `lightPreset: dusk` (decisión de Juan; `dark-v11` es el plan B si el
satélite compite en proyector — cambiar `ESTILO_MAPA` en `components/mapa/paleta.ts`).
`mapbox-gl` toca `window` al importarse: **siempre con `dynamic(..., { ssr: false })`**.

## Tareas de esta app

[0.7](../../docs/tareas/juan.md#07--test-de-espejo-de-tipos) · [1.4](../../docs/tareas/juan.md#14--vistas-de-login-y-sesión) · [2.2](../../docs/tareas/neid.md#22--vista-afiliacion) · [2.3](../../docs/tareas/sebas.md#23--vista-afiliacionverificar) · [2.5](../../docs/tareas/juan.md#25--crud-de-equipo-e-invitaciones) · [2.7](../../docs/tareas/sebas.md#27--shell-de-panel) · [2.8](../../docs/tareas/zaid.md#28--tanstack-query--cliente-tipado) · [3.4](../../docs/tareas/juan.md#34--vista-hospitalcapacidad) · [3.7](../../docs/tareas/juan.md#37--posición-del-móvil-en-vivo--cruecobertura) · [3.11](../../docs/tareas/juan.md#311--persistir-el-override-del-crue) · [4.3](../../docs/tareas/juan.md#43--vista-hospitalrecepcióncasoid) · [4.5](../../docs/tareas/sebas.md#45--entrega-por-qr) · [4.10](../../docs/tareas/sebas.md#410--vista-de-firma-de-trámites) · [4.12](../../docs/tareas/juan.md#412--vista-forense-auditoriacasosid) · [5.2](../../docs/tareas/sebas.md#52--vista-panelwebhooks) · [5.11](../../docs/tareas/juan.md#511--adminatalogos-y-adminmodelos)

**Inventario completo de las 34 vistas** en el [plan maestro §3](../../docs/pulso-produccion-plan-maestro.md#3-inventario-completo-de-vistas).
