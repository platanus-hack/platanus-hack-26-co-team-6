# frontend

Las consolas de PULSO. Next.js **16.3.1** (App Router), Tailwind v4, pnpm. Puerto **3000**.

```bash
pnpm install
cp env.example .env.local
pnpm dev          # :3000
pnpm typecheck
```

**Funciona sin ninguna credencial.** Sin core alcanzable no hay consolas, pero core sí degrada solo.
Con `NEXT_PUBLIC_MAPBOX_TOKEN` los mapas se ven; sin él, la UI lo dice.

> ⚠️ **Next 16.3.1 tiene breaking changes respecto a lo que sabes.** Lee la guía correspondiente en
> `node_modules/next/dist/docs/` **antes de escribir código**. Ver [`AGENTS.md`](AGENTS.md).

## Las pantallas

| Ruta | Quién la usa | Estado |
|---|---|---|
| `/` | Público | Landing (WebThreads OGL, flip 3D, bento, FAQ) |
| `/entrar` | Todos | Login — pasa a correo + contraseña en la [tarea 1.4](../../docs/tareas/juan.md#14--vistas-de-login-y-sesión) |
| `/campo` | Paramédico | Dictar → triage → ranking → despachar → aceptación |
| `/hospital` | Jefe de urgencias | Dos botones. En triage I **no hay botón de rechazo** |
| `/crue` | Regulador | Tablero de red, escalamientos, override, mapa |

**30 vistas más** están inventariadas en el [plan maestro §3](../../docs/pulso-produccion-plan-maestro.md#3-inventario-completo-de-vistas): afiliación, panel de organización, capacidad, recepción, entrega por QR, auditoría forense.

## Reglas duras de UI

Vienen del contexto de uso, no del gusto. **No se negocian en `/campo`:**

- **Táctil ≥ 44 px**, primarios **56 px**. Se usa con guantes.
- **Sin scroll horizontal entre 320 y 430 px.**
- **Legible a bajo brillo.** Pruébalo con el brillo al mínimo, de verdad.
- **Respetar `prefers-reduced-motion`.**
- **Si `confianza < 0.5`, la UI lo declara.** No se pinta una extracción dudosa como una segura.
- **El textarea es plan B real del dictado.** Web Speech API solo existe en Chrome + HTTPS; en
  Safari/iOS no hay dictado. Pruébalo en el teléfono real del demo temprano, no la última noche.
- **La degradación se dice.** Un ETA estimado no se pinta igual que uno con tráfico —
  `GET /capacidades` existe justo para eso.

## Lenguaje visual

**Pulsewave**, definido en [`docs/juan-frontend-pulsewave.md`](../../docs/juan-frontend-pulsewave.md):
dark-first, Geist + Geist Mono (`tabular-nums` en cronómetro y ETA), `clamp()` fluido, cápsulas
`rounded-full`, píldoras glass, easing firma `[0.22,1,0.36,1]`, `AnimatePresence` para fases.

Acentos solo para estados, nunca para texto largo. Los tokens viven en `app/globals.css`.

> ⚠️ **shadcn/ui entra solo en `/panel` y `/admin`** (tarea 2.7). **No toca `/campo`, `/hospital` ni
> `/crue`**: su lenguaje ya está definido y es un activo. Dos lenguajes conviviendo, a propósito.

Dependencias permitidas: `motion`, `lucide-react`, `ogl`, `mapbox-gl`. **Sin three.js ni GSAP.**

## La frontera

`lib/api.ts` es **LA** frontera. El front no calcula rutas, no puntúa sedes, no habla con Supabase ni
con Mapbox: **le pide a core y pinta lo que vuelve.**

La sesión es una cookie `HttpOnly` que este archivo **nunca lee** — solo pide que el navegador la mande
con `credentials: "include"`. Por eso un XSS en una consola no se puede llevar el token.

## El espejo de tipos

`lib/types.ts` es un **espejo manual** de `apps/backend/core/src/contracts/types.ts`. Un cambio en un
solo lado **no rompe el build — rompe el runtime**, que es peor. Lo cierra la
[tarea 0.7](../../docs/tareas/juan.md#07--test-de-espejo-de-tipos).

## Estructura

```
app/
├── page.tsx              landing
├── entrar/               login
└── (consolas)/           campo · hospital · crue
components/
├── campo/ hospital/ crue/ mapa/ landing/
lib/
├── api.ts                LA frontera
├── types.ts              espejo de contracts/types.ts
└── use*.ts               geolocalización, dictado, conectividad, capacidades
```
