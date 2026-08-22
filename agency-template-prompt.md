# PROMPT PARA CLAUDE CODE — Réplica exacta del template "RBP Agency" (Pulsewave)

Construye desde cero un sitio one-page de agencia creativa replicando **exactamente** este template, con todos sus efectos, animaciones y comportamientos: https://rbp-agency-template.vercel.app/

**Antes de escribir código:** haz fetch de esa URL y analiza el HTML renderizado para confirmar estructura, clases y estilos inline iniciales. Luego entra en plan mode y presenta un plan por fases antes de implementar. Usa las skills disponibles cuando apliquen: `/run` para levantar el dev server y verificar visualmente cada sección al terminarla, y la skill de review de código al final. Trabaja sección por sección en este orden: setup global → Header → Hero → Marquee → Projects → Services → About → Social Proof → FAQ → Footer, verificando cada una antes de continuar.

---

## 1. Stack obligatorio

- **Next.js 15+ (App Router) + TypeScript**, componentes de sección como client components montados desde un server component `page.tsx`.
- **Tailwind CSS v4** con tokens CSS: light `--background:#fff / --foreground:#0a0a0a / --muted:#f5f5f5 / --muted-foreground:#737373`; dark `--background:#0a0a0a / --foreground:#fafafa / --muted:#171717 / --muted-foreground:#a3a3a3`.
- **GSAP + ScrollTrigger** para TODAS las apariciones ligadas a scroll.
- **Motion (framer-motion)** para entradas de carga, springs que siguen al mouse, marquee y modal (`AnimatePresence`).
- **three + @react-three/fiber + @react-three/postprocessing** para los dos shaders WebGL.
- **next-themes** (dark por defecto, script anti-flash, `suppressHydrationWarning`).
- **lucide-react** (íconos sun/moon).
- Fuentes con `next/font`: **Geist** (sans, variable `--font-sans`) y **Geist Mono**; serif por stack CSS: `--font-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif`.
- **NO usar Lenis ni smooth-scroll**: scroll nativo. La suavidad viene de `scrub` y springs.

## 2. Reglas globales de diseño y movimiento

- Easing firma para entradas Motion: cubic-bezier `[0.22, 1, 0.36, 1]`. Para scrubs GSAP: `power3.out`. Para springs que siguen al mouse: `stiffness: 400`.
- Tipografía editorial gigante y fluida con `clamp()`. Palabras de énfasis siempre en `font-serif italic` contrastando con Geist.
- Motivo recurrente: imágenes en forma de cápsula (`rounded-full` sobre contenedores rectangulares).
- Layout: contenedor `max-w-360 mx-auto` con padding `px-6 sm:px-12 lg:px-24` (y `2xl:max-w-450 3xl:max-w-550`).
- Accesibilidad: skip-link "Skip to main content", `aria-label` en botones icónicos, `@media (prefers-reduced-motion: reduce)` desactiva animaciones, metadata OG/Twitter completa, imágenes con `next/image` + `fill` + `sizes`.
- Patrón general de reveal por scroll: `gsap.fromTo` con `scrollTrigger: { scrub: 1 }` — reversible y proporcional al scroll, nunca one-shot (salvo donde se indique `toggleActions`).

## 3. Header (fijo, siempre visible)

- `fixed top-0 z-50`. Dos píldoras `bg-neutral-900/70 backdrop-blur-lg rounded-2xl shadow-lg` con texto blanco (igual en ambos temas): logo "pulsewave" a la izquierda; menú a la derecha (`w-48 sm:w-60`, `h-12 sm:h-16`).
- Entrada al cargar: `opacity:0, y:-20 → 1, 0`, duración 0.4–0.6s, bezier firma. Logo con `whileHover:{scale:1.05}` y `whileTap:{scale:0.95}`.
- El botón del menú muestra el **nombre de la sección activa** (Home / Work / Services / About us / Testimonials / Contact): listener de scroll que compara `scrollY + innerHeight/3` contra `offsetTop` de cada sección (ids `hero, projects, services, about, social-proof, contact`); si `scrollY + innerHeight >= scrollHeight - 100` → "Contact".
- Ícono "+" hecho con dos spans de 1.5px; rota 45° (→ "×") al abrir, 0.3s.
- Al abrir: la píldora anima `height` a `auto` (0.4s bezier firma) y los links entran con `opacity:0, x:-10 → 1, 0`, delay `0.05 * índice`. El link activo resaltado en blanco.
- Cuando el modal de proyecto está abierto (contexto React `OverlayContext`), el header se desmonta con `AnimatePresence` (exit `opacity:0, y:-20`).
- Botón flotante de tema `fixed bottom-6 right-6 z-50`: círculo 48px `bg-foreground/10`, ícono sun/moon (lucide) según `resolvedTheme`, alterna dark/light. Placeholder deshabilitado hasta el mount para evitar mismatch de hidratación.

## 4. Hero (h-screen)

### 4a. Fondo WebGL (Canvas R3F, `absolute inset-0`, `pointer-events:none`, clases `opacity-50 saturate-125 md:opacity-85`)

Shader fragment custom en un plano fullscreen (`planeGeometry [2,2]`, vertex passthrough `gl_Position = vec4(position, 1.0)`). Uniforms: `iTime, iResolution, isDark, iScroll, color1Start..color3End`. Comportamiento:

- **Tres bandas de luz diagonales** ("olas"): cada una es `1 - smoothstep(0, D, distance(p.x, 0.5 + sin(offset + p.y*3) * 0.15))` con `D = 0.08`, offsets `vec2(D*0.25, 0)`, `vec2(0.015, 0.005)`, `vec2(D*0.5, 0.015)`; copias desplazadas `+vec2(0.3,0)` y `+vec2(0.6,0)`. Cada ola lleva además un "glow" con `D*2.5`.
- Colores iniciales: `#FF66B2` (rosa), `#994DE6` (morado), `#4D80FF` (azul). Colores finales (al scrollear): `#4D80FF`, `#994DE6`, `#FF66B2` (o cálidos `#FF8026 / #FF4059 / #FF73A6`); interpola con `mix(start, end, iScroll)`.
- **`iScroll` = `smoothstep` de `scrollY / innerHeight`** (fórmula `t*t*(3-2*t)`, clamp 0–1), actualizado en listener passive de scroll. Rota las UV `radians(mix(-55°, -120°, iScroll))` → las olas giran de -55° a -120° durante el primer viewport de scroll, mientras cambian de paleta.
- **Efecto CRT**: scanlines `0.95 + 0.05*sin((uv.y + t*0.05) * iResolution.y * 1.5)`, flicker `0.99 + 0.01*sin(t*8)`, viñeta `1 - dot(centro,centro)*0.15`.
- **Beams**: haces horizontales de luz blanca recorriendo cada ola, posición `fract(t*speed + phase)` con speed/phase pseudoaleatorios por índice, falloff gaussiano `exp(-d²*25)*0.8`.
- **Reveal de entrada**: máscara diagonal por ola con progreso `ease(clamp((t - i*0.2)/3.5, 0, 1))` donde `ease(t) = 1-(1-t)⁴` — las tres olas se descubren escalonadas en ~3.5s.
- **Dos modos por tema** (uniform `isDark`): dark = blending aditivo sobre transparente con alpha calculado por intensidad; light = multiplicativo sobre blanco (`mix(blanco, color, máscara)` multiplicando las tres olas), fade a blanco en la base (`smoothstep(0, 0.25, uv.y)`).
- **Performance**: `dpr={[1, 1.5]}`, `gl={{ antialias:false, powerPreference:'high-performance' }}`, `resize={{ scroll:false }}`, resolución del uniform a mitad del devicePixelRatio, resize con debounce 150ms.

### 4b. Titular 3D con máscara

- Contenedor de texto con `style={{ perspective: '1200px' }}`, centrado vertical en desktop (`md:justify-center`), arriba en móvil (`pt-44`).
- `h1` `text-[clamp(3rem,8vw,12rem)] leading-[1.05] tracking-tight`. Tres líneas: "Crafting digital" / "experiences that" / "*inspire & convert.*" (tercera en `<em class="font-serif">`).
- Cada línea: wrapper `block overflow-hidden pb-[0.1em]` conteniendo un `motion.span` con `initial={{ y:'120%', rotateX:-90, z:-200, opacity:0 }}` → `animate={{ y:0, rotateX:0, z:0, opacity:1 }}`, `transition={{ duration:1.6, ease:[0.22,1,0.36,1], delay: 0.3 / 0.5 / 0.7 }}`, `style={{ transformOrigin:'center bottom', transformStyle:'preserve-3d' }}`. Efecto: cada línea se levanta girando en 3D desde detrás de su máscara.
- Párrafo: `mt-8 max-w-md text-[clamp(1.125rem,1.5vw,1.75rem)] text-foreground/80`, entra `y:20, opacity:0 → 0,1`, duración 1, ease `[0.25,1,0.5,1]`, delay 1.2. Copy: "A creative agency specializing in brand strategy, web design, and development — building truly memorable products that convert."
- Indicador "Scroll" abajo-izquierda: fade-in duración 1.2, delay 2.

## 5. Marquee "SELECTED WORK" (inicio de #projects)

- Texto `SELECTED Work` con "Selected" en sans medium italic uppercase y "Work" en `font-serif font-thin`, tamaño `clamp(4rem, 12vw, 14rem)`, repetido **6 veces** en un `motion.div` `flex whitespace-nowrap` dentro de `overflow-hidden`.
- Implementar el patrón **scroll-velocity marquee** con Motion:
  - `baseVelocity = 80`. Cada frame (`useAnimationFrame`): `moveBy = direction * baseVelocity * (delta/1000)`.
  - `useScroll().scrollY` → `useVelocity` → `useSpring({ damping:50, stiffness:400 })` → `useTransform([0,1000] → [0,5], { clamp:false })` = `velocityFactor`. Sumar `moveBy += direction * moveBy * velocityFactor`.
  - Si `velocityFactor < 0` → `direction = -1`; si `> 0` → `direction = 1` (el marquee invierte dirección con el sentido del scroll y se acelera con la velocidad).
  - Wrap infinito: medir `offsetWidth` del primer span (con listener de resize) y envolver `x` con módulo en `[-width, 0]`, salida en px.

## 6. Projects (3 proyectos alternados)

Datos: 01 "Brand / Vision", 02 "Digital / Canvas", 03 "Future / Forward", cada uno con imagen webp y descripción de una línea. Layout por proyecto: `flex-col md:flex-row` (pares) / `md:flex-row-reverse` (impares), imagen `md:w-3/5 aspect-4/3 rounded-full overflow-hidden`, texto `md:w-2/5` (alineado a la derecha en impares), número `0N` en uppercase tracking-widest, `h3` `clamp(2.5rem,6vw,6rem)` con primera palabra en sans medium y segunda en `font-serif italic`.

### 6a. Imagen WebGL con revelado circular (efecto principal)

Cada imagen es un `<Canvas>` R3F (`dpr:1`, `antialias:false`, `alpha:true`, `stencil:false`, `depth:false`) con shader propio:

- **Máscara circular por scroll**: ScrollTrigger sobre la tarjeta `{ start:'top 80%', end:'top -20%', scrub:1.5, invalidateOnRefresh:true }` cuyo `onUpdate` hace `setMaskRadius(1200 * progress)` (y `onLeaveBack` → 0). En el fragment: `dist = distance(px, centro)`, borde orgánico con value-noise 2D animado `n = noise(px*0.01 + uTime*0.15) * 50.0`, `mask = 1.0 - smoothstep(uMaskRadius - 35.0 + n, uMaskRadius + n, dist)`, salida `gl_FragColor = vec4(color, mask)`. La imagen aparece como un círculo de tinta de borde ruidoso que crece del centro con el scroll y se cierra al retroceder.
- **Duotono**: contraste `(c-0.5)*1.2+0.5`, luminancia `pow(dot(c, vec3(.299,.587,.114)), 0.9)`, `mix(vec3(0.08,0.02,0.18), vec3(0.98,0.65,0.85), smoothstep(lum))`, shift de canal `(r-b)*0.1`, saturación final ×1.3. UV con lógica cover (`getCoverUV` con `uTextureSize`).
- **Displacement trail del cursor**: pool de 30 meshes con textura radial-gradient (canvas 128px, stops 1/0.5/0.1/0 en 0/0.3/0.7/1), `AdditiveBlending`, renderizados con cámara ortográfica a un `WebGLRenderTarget` a mitad de resolución que se pasa como `uDisplacement`. En pointermove (umbral 4px) se activa el siguiente sprite del pool en la posición del cursor (opacity 1, scale 1.5, rotación pseudoaleatoria fija por índice). Cada frame: `rotation.z += 0.02*d`, `opacity *= pow(0.96, d)`, `scale = scale*0.982 + 0.108` (con `d = 60*delta`), ocultar bajo opacity 0.002. En el shader principal: `theta = disp.r * 2π`, `uv += vec2(sin θ, cos θ) * disp.r * 0.05` → la imagen ondula siguiendo la estela del mouse.
- **Postprocesado**: `EffectComposer multisampling={0}` + `Bloom intensity={0.35} luminanceThreshold={0.65} luminanceSmoothing={0.8} mipmapBlur levels={3}`.

### 6b. Tilt magnético

Contenedor interno pre-escalado `scale(1.15)` (`will-change:transform, preserve-3d, backface-visibility:hidden`). Con `gsap.quickTo` sobre x (0.8s power3.out), y (0.8s power3.out) y scale (0.6s power2.out): en `mousemove` mapear posición relativa al rect a `x = -(30 * (relX - 0.5))`, `y = -(30 * (relY - 0.5))`; en enter → scale 1.22; en leave → x/y 0, scale 1.15.

### 6c. Entrada del texto

Timeline GSAP con `scrollTrigger: { trigger: tarjeta, start:'top 50%', toggleActions:'play none none reverse' }`: título desde `y:60, opacity:0` (1s power3.out) y descripción desde `y:40, opacity:0` (0.8s power2.out) solapada `'-=0.6'`.

### 6d. Cursor personalizado "Open"

Visible solo en hover de una tarjeta (estado `isVisible`). `motion.div` `fixed z-50 pointer-events-none`:
- Posición: `useMotionValue` x/y actualizados en mousemove global (throttle con rAF) → `useSpring({ damping:30, stiffness:400, mass:0.2 })` → `useVelocity` de cada eje.
- `speed = √(vx²+vy²)`; `scaleX = transform(speed, [0,800,2000] → [1,1.3,1.6])`; `scaleY = transform(speed, [0,800,2000] → [1,0.8,0.65])`; `rotate = atan2(vy,vx) * 180/π`. El círculo (80px, `bg-foreground`) se estira en la dirección del movimiento; el texto "Open" interior lleva rotate inverso y `scaleX/Y` recíprocos para permanecer legible.
- Aparece/desaparece con `opacity` y `scale` 0→1 (0.3s; scale con bezier rebote `[0.34,1.56,0.64,1]`).

### 6e. Modal fullscreen

Clic en tarjeta → overlay `fixed inset-0 z-100` con `AnimatePresence`: fade 0.3s; imagen full con `scale:1.1 → 1` (0.6s bezier firma) + capa `bg-black/40`; título grande arriba-izquierda entra `x:-30` (delay 0.15); botón cerrar circular glass arriba-derecha (`scale:0.8 → 1`). Cierra con Escape y bloquea `document.body.overflow`. Marca `isOverlayOpen` en el contexto para ocultar el header.

## 7. Services — frase pinned con revelado por caracteres

- Sección `#services` con un bloque `min-h-screen flex items-center justify-center` conteniendo el `h2` `text-center clamp(2.5rem,7vw,7rem) font-medium leading-[1.1]`: **"We craft experiences that captivate. Brands that endure."**
- Componente SplitText casero: dividir por palabras en spans `inline-block whitespace-nowrap`, y dentro cada letra en `<span class="char inline-block">`, con un char de espacio entre palabras (así el wrap de línea es correcto).
- Animación: `gsap.fromTo('.char', { willChange:'transform', transformOrigin:'50% 100%', scaleY:0 }, { scaleY:1, opacity:1, ease:'power3.in', stagger:0.05, scrollTrigger:{ trigger: sección, start:'top top', end:'+=150%', scrub:true, pin: wrapperDelH2, anticipatePin:1 } })`. La pantalla queda **pineada 1.5 viewports** mientras las letras se despliegan verticalmente una a una, 100% controladas por el scroll (reversible a mitad de palabra). Limpiar todos los ScrollTriggers en unmount.

## 8. Menú de servicios (4 filas gigantes)

Filas: Digital Experiences / Brand Identity / Creative Direction / Product Design. Cada fila `relative overflow-hidden border-t border-foreground/10`, link `px-6 py-8 lg:px-24`, texto `clamp(1.5rem,4vw,4rem) font-light`. Cierre con un `border-t` final.

- **Entrada por scroll**: `fromTo(fila, { x:-60, opacity:0 }, { x:0, opacity:1, duration:0.8, ease:'power3.out', scrollTrigger:{ start:'top 90%', end:'top 70%', scrub:1 } })`.
- **Hover direccional (curtain)**: overlay `absolute inset-0 bg-foreground pointer-events-none` (estado inicial `translateY(101%)`) con contenido interno contrapuesto (`translateY(-101%)`) que muestra el título en `text-background` letra a letra + flecha ↗ (SVG 24px, path `M7 17L17 7M17 7H7M17 7V17`). En `mouseenter` detectar si el cursor entró por arriba o abajo (comparar distancia a bordes superior/inferior del rect) y setear overlay/interno a ∓101% de ese lado antes de animar ambos a 0 con timeline `{ duration:0.6, ease:'expo' }`. En `mouseleave`, retirar hacia el lado de salida.
- **Micro-rebote de letras**: en enter, las letras del texto invertido hacen `fromTo(y:0 → y:-32, 0.15s, sine.out, stagger 0.01)` seguido de `to(y:0, 0.2s, sine.inOut, stagger 0.01)` empezando en t=0.15.

## 9. About

- Imagen panorámica cápsula: `aspect-21/9 lg:aspect-3/1 w-full rounded-full overflow-hidden`, entra con `fromTo({ scale:0.9, opacity:0 } → { scale:1, opacity:1 })`, scrub 1, ventana `top 80%` → `top 30%`.
- Statement centrado `clamp(1.75rem,4vw,3rem) max-w-4xl`: "At Pulsewave, we transform bold ideas into immersive digital experiences through good design and relentless creativity." — entra `y:60 → 0`, scrub 1, `top 85%` → `top 60%`.
- CTA píldora "More about us" (`bg-foreground text-background rounded-full`): `y:40 → 0`, scrub 1, `top 90%` → `top 70%`.

## 10. Social Proof — bento grid

- Heading "Trusted by industry leaders" + CTA "Work with us" (oculto en móvil): entran juntos `y:40 → 0`, scrub 1, `top 75%` → `top 50%`.
- Grid `md:grid-cols-2 lg:grid-cols-4 gap-4` con `lg:grid-rows-[minmax(220px,auto)_minmax(220px,auto)_minmax(180px,auto)]`. Celdas: columna de 2 fotos (una `rounded-2xl`, otra `rounded-full`) con `row-span-2`; quote grande `lg:col-span-2 row-span-2` (ícono comillas, blockquote 2xl-3xl, autor "Alex Chen — CTO, Nextura", logo + botón flecha); tarjetas métricas "3x Faster / Time to Market Launch" (novahq), "+280% / Increase in Engagement" (arclight), "Top 1% / Digital Experience & Product Studios / 5.0 Rated On Trustpilot"; case study ancho `lg:col-span-3` ("We helped Meridian rebrand… 12M+ users"). Celdas `bg-muted/50 rounded-2xl p-6/p-8 flex flex-col` con footer `mt-auto`.
- Entrada de TODAS las celdas: `fromTo(children del grid, { y:80, opacity:0, scale:0.95 } → { y:0, opacity:1, scale:1, duration:0.8, ease:'power3.out', stagger:0.1, scrollTrigger:{ start:'top 80%', end:'top 40%', scrub:1 } })` — caen en cascada con el scroll, reversible.
- Botones flecha circulares: hover invierte a `bg-foreground text-background`.

## 11. FAQ

- Heading centrado "Frequently Asked\nQuestions": `y:60 → 0`, scrub 1, `top 75%` → `top 50%`.
- 5 tarjetas acordeón `border border-foreground/10 rounded-2xl overflow-hidden`; cada una entra individualmente `y:40 → 0` (0.6s power3.out), scrub 1, `top 90%` → `top 70%` → cascada natural.
- Expansión SIN medir alturas: contenedor `display:grid` con `gridTemplateRows: abierto ? '1fr' : '0fr'` y `transition-all duration-300 ease-out`, hijo `overflow-hidden`. Ícono "+" (dos spans) rota 45° al abrir (0.3s).
- Preguntas/respuestas sobre diferenciación, plazos (6–12 semanas), startups vs. marcas establecidas, retainers y proceso en 4 fases (Discovery/Design/Development/Launch).

## 12. Footer — efecto cortina (solo CSS)

- `<main>` con `lg:relative lg:z-10 bg-background`; `<footer id="contact">` con `lg:sticky lg:bottom-0 lg:z-0 bg-foreground text-background`. Al llegar al final, el main se desliza revelando el footer que estaba debajo (telón). Sin JS.
- Contenido: email gigante `hello@pulsewave.design` (`clamp` 2xl→7rem, hover opacity); CTA píldora invertida "Start New Project"; separador `border-background/10`; grid de columnas: marca ("pulsewave" + "Built to evolve ideas."), Location (Worldwide/100% Remote, San Francisco/Los Angeles), Services (Web Design, Development, Branding, Strategy, Motion), Navigation (anchors a secciones), Social (Dribbble, Instagram, Behance, LinkedIn, Twitter con `target=_blank rel=noopener`); barra final con legales y "© 2026 Pulsewave - All rights reserved".

## 13. Criterios de aceptación (verifícalos todos con la app corriendo)

1. El fondo del hero rota de -55° a -120° y cambia de paleta durante el primer viewport de scroll; funciona en dark y light.
2. Las 3 líneas del titular entran con flip 3D desde máscara, escalonadas 0.3/0.5/0.7s.
3. El marquee se acelera con la velocidad del scroll e invierte dirección al scrollear hacia arriba; el loop no salta.
4. Las imágenes de proyectos se revelan como círculo de borde ruidoso atado al scroll (reversible), con duotono, estela de distorsión bajo el cursor, bloom y tilt magnético.
5. El cursor "Open" sigue al mouse con spring, se estira según la velocidad y el texto interior nunca se deforma.
6. La sección Services queda pineada ~1.5 viewports mientras las letras se despliegan con scrub (pausable/reversible a mitad de frase).
7. Las filas de servicios llenan con el overlay desde el lado por el que entra el mouse y se vacían hacia el lado de salida, con rebote de letras.
8. El bento grid cae en cascada con scrub; el FAQ abre con grid-template-rows; el footer se revela como cortina.
9. El nav muestra la sección activa y desaparece cuando el modal está abierto.
10. Sin errores de hidratación, sin layout shift, DPR capado en los canvas, `prefers-reduced-motion` respetado, responsive correcto en 375px / 768px / 1440px.

Al terminar cada fase, levanta el dev server, revisa la sección en el navegador (incluye un screenshot si puedes) y corrige antes de seguir. Cierra con un review de código completo.
