# PULSO · /campo con lenguaje "Pulsewave" — spec fusionado

> 📌 **Documento de la hackathon (ago 2026).** Conserva contexto útil, pero **algunas rutas de archivo ya cambiaron**.
> El plan vigente está en [`docs/README.md`](README.md).

**Principio rector:** el template RBP/Pulsewave aporta el *lenguaje* (tokens dark, tipografía editorial, cápsulas, easings firma, píldoras glass, springs). Tu doc de frontend aporta las *reglas duras* (≥44px, legible a bajo brillo, sin scroll horizontal, teléfono con guantes, cronómetro intocable). **Cuando choquen, ganan las reglas duras — siempre.**

---

## 0. Qué se adopta y qué se descarta del template

**Se adopta en /campo:**
- Tokens dark-first (`#0a0a0a / #fafafa / #171717 / #a3a3a3`) + acentos cálidos de la variante del template: `#FF8026` (alerta), `#FF4059` (rojo pulso), `#FF73A6` (rosa). Los cálidos son para *estados*, nunca para texto largo.
- Geist (sans) + Geist Mono (cronómetro, ETAs — con `tabular-nums` para que los números no bailen) + serif italic por stack CSS para palabras de énfasis.
- Tipografía fluida con `clamp()`, motivo cápsula (`rounded-full`), píldoras glass `bg-neutral-900/70 backdrop-blur-lg rounded-2xl`.
- Easing firma `[0.22, 1, 0.36, 1]` para entradas, springs `stiffness: 400` para lo que sigue al dedo, bezier rebote `[0.34, 1.56, 0.64, 1]` para confirmaciones.
- `AnimatePresence` para transiciones de estado del flujo.

**Se descarta en /campo (queda solo para una landing `/` post-hack):**
- `three` / `@react-three/fiber` / postprocessing — Mapbox ya consume el contexto WebGL del teléfono; un shader más es batería y riesgo.
- GSAP + ScrollTrigger, marquee, secciones pineadas, footer cortina — no hay coreografía de scroll en una herramienta de trabajo.
- Cursor custom y tilt magnético — no existen en touch.
- `next-themes` — el demo es un auditorio oscuro: dark fijo, una dependencia menos y cero riesgo de flash de hidratación.

**Dependencias a agregar:** solo `motion` (framer-motion) y `lucide-react`. Nada más.

---

## 1. Tokens (`app/globals.css` — coordinar con Sebas, él los define)

```css
--background: #0a0a0a;
--foreground: #fafafa;
--muted: #171717;
--muted-foreground: #a3a3a3;
--pulso: #FF4059;      /* rojo pulso: descartes, crítico */
--alerta: #FF8026;     /* ámbar: confianza baja, congestión media */
--rosa: #FF73A6;       /* gradientes del ECG y la ruta */
--ok: #22c55e;         /* aceptado, minutos ahorrados */
--font-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
```

---

## 2. Shell de pantalla (adaptación del header Pulsewave)

- Dos píldoras glass fijas arriba (`fixed top-0`, mismas clases del template): izquierda logo **pulso** en minúscula con un punto que late (scale/opacity, loop 1.2s); derecha el **Cronometro** en Geist Mono dentro de su píldora. Entrada al cargar `y:-20, opacity:0 → 0,1`, 0.5s, bezier firma.
- El cronómetro **nunca se desmonta** y su fuente de tiempo no se toca — solo se le pone la píldora encima.
- **Selector TAB/TAM**: segmented control en cápsula, dos opciones, 44px de alto, thumb que se desliza con `layoutId` de Motion (spring 400). Vive junto al header o encima de la zona de dictado.

---

## 3. Estado "Analizando" — los 3 segundos del jurado

Reemplaza el texto plano por la traducción del hero de Pulsewave a 2D:

- **Línea ECG en SVG** animada (path que se dibuja en loop con `stroke-dashoffset`), con gradiente `--rosa → --alerta`. Es la "ola de luz" del template convertida en pulso cardíaco — la marca es literalmente eso.
- Debajo, frases de estado rotando con `AnimatePresence`, palabra clave en serif italic: "Leyendo *signos*…", "Cruzando *capacidad*…", "Calculando *rutas*…" — comunica que el pipeline (triage → match → rutas) es real.
- Skeletons de las tarjetas del ranking con shimmer donde van a aparecer.
- `prefers-reduced-motion`: se sustituye todo por una barra de progreso simple.
- Cero WebGL, cero spinner genérico.

---

## 4. Ranking — el #1 se ve, no se lee

- **Tarjeta #1 = héroe**: ancho completo. Nombre del hospital en `clamp(1.75rem, 6vw, 3rem)`; la capacidad decisiva en serif italic ("*hemodinamia disponible*"); **ETA gigante en Geist Mono** a la derecha; anillo exterior que late suave (box-shadow animado, ciclo 2s); chips cápsula con lo que SÍ tiene (✓ UCI, ✓ hemodinamia). Botón **Despachar**: cápsula full-width, ≥56px, `bg-foreground text-background`.
- **#2–#N**: filas compactas de una línea (nombre + ETA + 1 chip). Deben pesar visualmente ~40% de lo que pesa el héroe.
- **Entrada** (one-shot al llegar datos, adaptación del titular 3D del hero): cada tarjeta dentro de un wrapper `overflow-hidden`, `y:24, opacity:0 → 0,1`, delays 0.1/0.2/0.3, bezier firma. El ETA del #1 cuenta hacia arriba con spring de Motion.
- **Confianza < 0.5**: banda ámbar visible dentro del héroe — "Confianza baja · verificar con CRUE". No se esconde, no se suaviza.

---

## 5. La tarjeta descartada — que duela (sin opacity-50)

- Cuerpo de la tarjeta en duotono apagado: `filter: grayscale(1) brightness(0.8)` **solo sobre el cuerpo**.
- El **motivo del descarte queda FUERA del filtro**, a contraste completo: "⛔ No tiene hemodinamia" en `--pulso`, `font-medium`, ratio de contraste ≥ 4.5:1 (regla proyector).
- ETA tachado (`line-through`) — "10 min" tachado al lado del "9 min" vivo del #1: ese contraste es el producto.
- Borde izquierdo de 3px en `--pulso`.
- Micro-animación (adaptación one-shot del hover-cortina de las filas de servicios): la tarjeta entra, y a los ~0.4s el motivo se **estampa** con una cortina roja que baja `translateY(-101% → 0)` en 0.4s `expo` y se asienta. El descarte no aparece: se declara.

---

## 6. Mapa (Bloque 2)

- Contenedor `rounded-[2rem] overflow-hidden` — el motivo cápsula del template aplicado al mapa.
- Estilo `mapbox://styles/mapbox/dark-v11` para que funda con `--background`.
- **Ruta al #1**: `line-gradient` `--rosa → --alerta` + una segunda línea más ancha debajo con opacidad baja (glow barato, sin postprocesado).
- Marcadores: origen = punto con anillo latiendo (CSS puro, mismo latido del logo); sedes = pins cápsula coloreados por congestión (verde / `--alerta` / `--pulso`); el #1 con el pin más grande.
- Al llegar la ruta: `fitBounds` con padding y easing suave.
- Geolocalización con fallback a Plaza de Bolívar + toast discreto "Usando ubicación demo". Nunca romperse.
- Un solo mapa montado. Nada de three.js en esta página.

---

## 7. Handshake en vivo

- Timeline vertical: enviado → visto → aceptado. Puntos que se encienden; el activo con el anillo latiendo.
- Al pasar a "aceptado": check verde con `scale: 0.8 → 1` y bezier rebote `[0.34, 1.56, 0.64, 1]` vía `AnimatePresence`.
- **Se queda en polling 1.5s.** Realtime solo si sobran horas de verdad (regla de tu doc: no gastar 3 horas aquí).

---

## 8. Cierre — minutos ahorrados (la diapo final)

- Al aceptar: pantalla full-bleed limpia. Número en `clamp(4rem, 20vw, 10rem)`, Geist Mono, `--ok`, contando hacia arriba con spring hasta `45 − transcurrido`.
- Debajo: "minutos *ganados* frente al proceso actual" — "ganados" en serif italic.
- Botón discreto "Nuevo caso". Nada más en pantalla.

---

## 9. Botón de dictado

- Cápsula grande (56–64px) con micrófono (lucide).
- Grabando: 2–3 anillos concéntricos expandiéndose (las "ondas" del template en versión táctil) + transcript en vivo si Web Speech lo da.
- Permiso denegado o Safari/iOS: cae al textarea sin drama — el textarea es plan B real, siempre visible o a un tap.

---

## 10. Reglas duras (el estilo NUNCA las pisa)

- Táctil ≥44px; botones primarios 56px. Probar de pie, con el pulgar.
- Sin scroll horizontal en 320–430px (y en el ancho del proyector).
- `prefers-reduced-motion` apaga latidos, cortinas y contadores.
- Contraste AA en todo texto operativo; el motivo del descarte siempre legible.
- No tocar `lib/types.ts`, contratos de `/api/*`, ni la fuente de tiempo del cronómetro.

## 11. Componentes (`components/`)

`TarjetaCandidato` (variantes: heroe / compacta / descartada) · `TarjetaCaso` · `BotonDictado` · `Cronometro` · `EstadoAnalisis` (ECG + frases) · `MapaDespacho` · `LineaHandshake` · `ContadorAhorro` · `SelectorModo` (TAB/TAM).

## 12. Dónde va el template completo

La réplica literal del prompt RBP (marquee, scroll-scrub, shaders three.js, footer cortina) aplica a una **landing `/`** de presentación del proyecto — hero de olas = pulso, projects = Triage / Despacho / Handshake, bento = métricas del pitch. Prioridad cero durante el hackathon; solo si el demo ya está blindado.
