# /campo v2 — plan de integración

> Rediseño de la consola de campo a las 9 pantallas del spec, más el orbe de
> voz portado desde `~/dev/Domu task`.
>
> Este documento es el plan. El detalle de *por qué* cada decisión está en las
> notas de cada bloque; si vas con prisa, lee §A (lo que falta) y §D (orden de
> trabajo).

---

## A · Dónde estamos contra el spec

La consola actual funciona end-to-end y tiene resuelto lo difícil de verdad
(ruteo real, geolocalización validada, ranking con desglose en minutos,
tarjeta descartada elocuente). Lo que falta no es motor: es **estructura de
flujo y honestidad de estado**.

| § del spec | Hoy | Falta |
|---|---|---|
| 0 · Barra persistente | `Cabecera` con cronómetro y GPS | identidad usuario/unidad, conectividad, salud de ruteo e IA |
| 1 · Inicio | no existe — arranca en el textarea | pantalla de arranque, botón "Nuevo caso", lista de casos activos con cronómetro |
| 2 · Captura por voz | textarea + botón mic | orbe, temporizador, regrabar/agregar/cancelar, guardado offline del audio |
| 3 · **Revisión y confirmación** | `TarjetaCaso`, **solo lectura** | **toda la compuerta humana**: chips editables, confianza por campo, ver dictado crudo, nota libre, bloqueos |
| 4 · Ranking | completo y bueno | badges de servicios, "¿por qué?" plegable, selección + botón único, **estado de conjunto vacío** |
| 5 · Solicitud en curso | pantalla estática de 6 líneas | cronómetro de expiración, motivo de rechazo, avance al siguiente, cambiar destino, cancelar |
| 6 · Aceptado / en ruta | sede + cronómetro + foto | dirección, resumen compartido, navegación, llamar, línea de tiempo, marcar entregado, reportar novedad |
| 7 · Entrada manual | no existe | formulario mínimo de 4 campos |
| 8 · Offline / sync | no existe | detección, cola local, ETA marcados como aproximados |

### El hallazgo que hace viable todo esto

`api.match()` recibe el **`Caso` completo desde el cliente**
([lib/api.ts:91-100](../apps/frontend/lib/api.ts#L91-L100)). Es decir: el
front puede editar el caso que devolvió `/triage` y mandar el editado a
`/match`, y core lo acepta tal cual.

**La compuerta humana del §3 se implementa 100% en frontend, sin tocar core y
sin negociar con nadie.** Eso convierte la pantalla más importante del módulo
—y la que hoy no existe— en la de menor riesgo de integración.

Hoy [`campo/page.tsx:104-129`](../apps/frontend/app/(consolas)/campo/page.tsx#L104-L129)
encadena `triage()` y `match()` dentro de la misma función `analizar()`. Todo
el trabajo del §3 consiste en **partir esa función en dos** y meter una
pantalla en medio.

### Lo que el backend no tenía — YA ESTÁ HECHO

Los tres huecos que este documento identificó se implementaron en core en vez
de simularse en el front. El detalle está en
[contrato-api.md](contrato-api.md); el resumen:

1. **Identidad de unidad.** `Unidad { id, tripulante? }` viaja en
   `POST /triage`, se guarda en el caso y **sale en `CasoPublico`**, así que el
   regulador del CRUE ve qué móvil pregunta. La declara el dispositivo
   ([`lib/unidad.ts`](../apps/frontend/lib/unidad.ts), `localStorage`) porque
   core no tiene usuarios: la sesión es una contraseña por turno. **No es
   autenticación** y está documentado como tal en los dos lados.

2. **Timeout del handshake.** `POST /dispatch` ahora sella `expiraEn`
   (`enviadoEn + HANDSHAKE_TIMEOUT_S`, default 45s, configurable) y el almacén
   lo aplica con un barrido perezoso al leer. El cronómetro del §5 cuenta
   contra **el mismo instante que usa core**, no contra uno inventado en el
   front. Un silencio se registra como rechazo: si no, una sede que nunca
   contesta conservaría P(aceptación) alta para siempre.
   Efecto colateral que había que cerrar: `RespondResponse` gana `aplicada`,
   porque aceptar tarde ya no revive el traslado y quien responda tiene que
   enterarse (antes Telegram decía "ACEPTADO" igual).

3. **Escalamiento al CRUE.** `POST /escalamiento` con motivo tipado, la lista
   de sedes ya intentadas, e idempotente por caso. Aparece en `GET /estado`
   para que `/crue` lo pinte, y `POST /escalamiento/atender` lo cierra.

Y dos que no estaban en el plan original pero hacían falta:

4. **`GET /capacidades`** — en qué modo corre cada integración (IA, ruteo, voz,
   canal, datos). Es lo que permite que la barra del §0 y los "ETA aproximados"
   del §8 digan la verdad. Sin esto la degradación era invisible: un ETA
   estimado por regla de tres se pintaba idéntico a uno con tráfico real.

5. **Transcripción de servidor** (`/voz/token`, `/voz/transcribir`) — ver §B.

---

## B · El orbe de voz (portado de Domu)

### El backend ya está listo (hecho)

`POST /voz/transcribir` recibe el audio y devuelve el texto; `POST /voz/token`
da una credencial efímera para transcribir en vivo. La API key vive en core y
**nunca entra en el bundle**.

Con la key que trajimos de Domu el camino activo es el proxy
(`voz: "deepgram-servidor"` en `/capacidades`): esa key transcribe
perfectamente pero no tiene permiso para emitir credenciales, así que core lo
detecta al arrancar y elige el camino que funciona. Para el dictado clínico no
es un consuelo — es probablemente mejor: puntúa más, normaliza números
("cincuenta y cuatro" → "54", que es lo que después lee el parser clínico), y
es **el único de los dos que sobrevive a una zona muerta**, porque el `Blob` se
puede guardar y reintentar.

Medido contra un dictado real de 9 segundos: **1,7 s de latencia, confianza
0,994**. Si algún día quieren el streaming, basta con una key de Deepgram con
permiso de escritura de keys; core cambia solo, sin tocar código.

### Qué se trae

`~/dev/Domu task/frontend/src/features/call/AiOrb.tsx` (80 líneas) más el
bloque "Orbe IA" de `src/index.css` (líneas 256–503, ~250 líneas de CSS puro).

Es la parte buena y es **cero-dependencias**: solo React y CSS. No usa gsap,
no usa three, no usa Deepgram. Estados vía `data-state`, tamaño vía
`--orb-size`, y ya trae `prefers-reduced-motion`. El port es casi copiar.

Cambios al portar:

- `"use client"` arriba (Next 16, RSC por defecto).
- Estados al español, alineados al dominio: `escuchando · procesando ·
  hablando · mudo · sin-senal`. El `ended` de Domu se vuelve `sin-senal`, que
  es el estado que importa en una ambulancia.
- **Repaletizar.** El orbe de Domu es gris/blanco sobre negro. PULSO es azul
  nocturno con semáforo clínico. Los blobs pasan a `--color-info` cuando
  escucha y a `--color-alerta` cuando procesa; en `sin-senal` va a gris
  desaturado. El halo de partículas se queda blanco: es lo que lo hace ver
  caro.
- Los ojos siguen el cursor con `pointermove`, que **en un teléfono no existe**.
  No se rompe (el `data-idle` hace que miren solo), pero conviene bajarle el
  peso a esa parte: en campo el orbe se ve con el dedo, no con el mouse.
- CSS en `app/campo-orbe.css` importado desde `globals.css`, no pegado dentro:
  son 250 líneas y `globals.css` es de Sebas.

### Lo que NO se trae

- **`LiveCall.tsx` + Deepgram Agents.** Es un agente conversacional con TTS —
  la IA *habla*. PULSO no necesita eso: necesita transcripción y extracción.
  Traerlo mete una API key en el cliente, un WebSocket y un `AudioWorklet`
  por un beneficio que el spec no pide. Descartado.
- `ThreeBackground`, `gsap`, `StrokeText`. Pesan y pelean con la estética
  clínica.
- El `VoicePlayer` y el half-duplex. Sin TTS no hay nada que silenciar.

### Lo que hay que agregar para que el orbe no sea decorativo

El orbe de Domu anima por estado, no por sonido. Un orbe que "escucha" igual
de fuerte cuando el paramédico grita que cuando hay silencio es un adorno, y
en tarima se nota.

**`lib/useNivelVoz.ts`** (~50 líneas): `getUserMedia` → `AnalyserNode` →
RMS normalizado 0..1 en un `requestAnimationFrame`, escrito directo a la
variable CSS `--nivel-voz` (sin `setState`: 60 renders por segundo son
inaceptables y además innecesarios). El CSS del orbe lo consume en el
`transform: scale()` de la esfera y en la opacidad de las ondas.

Corre en paralelo a la Web Speech API sobre el mismo micrófono — son dos
consumidores del stream y el navegador lo permite. Esto es lo que hace que el
orbe se sienta vivo, y son 50 líneas.

---

## C · Arquitectura propuesta

### Máquina de estados

Las cinco fases actuales (`dictado · analizando · ranking · esperando ·
resuelto`) se convierten en ocho pantallas. El cambio de fondo: **`revision`
es un estado nuevo entre `analizando` y `ranking`**, y de él no se sale sin
una acción humana explícita.

```
inicio ──► captura ──► revision ──► ranking ──► solicitud ──► ruta ──► cierre
   ▲          │            ▲            │           │           │
   │          └─ manual ───┘            │           └─ rechazo ─┘
   │                                    │              (siguiente candidato)
   └──────────── caso activo ───────────┴──► escalado (ranking vacío /
                                              candidatos agotados)
```

Reglas que la máquina tiene que garantizar:

- De `revision` solo se sale por "Confirmar y buscar destino". No hay atajo,
  no hay auto-avance, no hay `useEffect` que dispare el match.
- `escalado` es alcanzable desde `ranking` (conjunto vacío) y desde
  `solicitud` (todos rechazan). Nunca se llega a una lista vacía.
- `inicio` es reentrante: tocar un caso activo devuelve a la pantalla donde
  ese caso se quedó.

### Archivos

```
app/(consolas)/campo/
  page.tsx                    orquestador: máquina de estados + cronómetro
components/campo/
  BarraPersistente.tsx        §0  (reemplaza y absorbe Cabecera)
  PantallaInicio.tsx          §1
  PantallaCaptura.tsx         §2
  OrbeVoz.tsx                 ←── portado de AiOrb
  PantallaRevision.tsx        §3  ← la nueva, la importante
  EditorEntidad.tsx           §3  selector rápido al tocar un chip
  PantallaRanking.tsx         §4  (envuelve TarjetaCandidato, que se queda)
  PantallaEscalado.tsx        §4/§5  el "paseo de la muerte" resuelto
  PantallaSolicitud.tsx       §5
  PantallaRuta.tsx            §6
  FormularioManual.tsx        §7
  (Cabecera.tsx se elimina; TarjetaCaso se absorbe en PantallaRevision)
lib/
  useConectividad.ts          §0/§8  online/offline + salud de core
  useNivelVoz.ts              audio real → --nivel-voz
  useCasosActivos.ts          §1  filtra GET /estado por unidad
  colaOffline.ts              §8  cola en localStorage
  unidad.ts                   identidad local de la unidad
app/campo-orbe.css            CSS del orbe
```

`TarjetaCandidato` y `MapaDespacho` se quedan como están: son buenos y el spec
no los contradice. `TarjetaCandidato` solo gana badges de servicios y el
plegable "¿por qué?".

### Detección de conectividad (§0 y §8)

Tres señales distintas, y la barra tiene que distinguirlas porque significan
cosas diferentes:

| Señal | Cómo se mide | Qué habilita |
|---|---|---|
| Red del dispositivo | `navigator.onLine` + eventos `online`/`offline` | nada por sí sola — `onLine` miente (dice `true` con wifi sin salida) |
| Core alcanzable | ping a `/health` cada 10 s | ranking y despacho |
| IA disponible | latencia y éxito del último `/triage` | dictado con extracción; si no, → §7 manual |
| Ruteo degradado | core responde pero sin Mapbox | ETA marcados "aproximados" |

`navigator.onLine` sola no basta y no debe pintarse como verdad. La señal que
manda es el ping a `/health`.

---

## D · Orden de trabajo

Ordenado por **valor de demo por hora invertida**, no por número de sección.

### Bloque 1 — la compuerta humana (§3)
Lo más importante del spec, lo que hoy no existe, y —por el hallazgo del §A—
lo que no necesita a nadie más.

1. Partir `analizar()` en `analizar()` (triage → `revision`) y `buscarDestino()`
   (match → `ranking`).
2. `PantallaRevision`: chips por entidad, confianza por campo, resaltado de
   baja confianza.
3. `EditorEntidad`: buscador de diagnóstico, selector de complejidad,
   casillas de servicios (el catálogo ya está en
   [`presentacion.ts`](../apps/frontend/lib/presentacion.ts) — 13 servicios REPS).
4. "Ver dictado original" (`caso.textoCrudo` ya viene en la respuesta de
   `/triage`, no hay que pedirlo).
5. Bloqueos: sin diagnóstico, sin servicio, sin complejidad, o confianza
   crítica baja → el botón no avanza y señala qué resolver.

*Riesgo: bajo. Todo es front. No toca contratos.*

### Bloque 2 — el orbe y la captura (§2)
Es lo que se ve en el video y en la tarima.

6. Portar `AiOrb` → `OrbeVoz`, repaletizado.
7. `useNivelVoz` conectado a `--nivel-voz`.
8. `PantallaCaptura`: orbe dominante, temporizador de grabación,
   transcripción visible, y los cuatro botones (regrabar / agregar / escribir
   / cancelar).

*Riesgo: bajo-medio. El único cuidado es no dejar el `AnalyserNode` abierto al
desmontar — deja el micrófono encendido, igual que ya cuida `useDictadoVoz`.*

### Bloque 3 — no dejar al paramédico solo (§4 vacío, §5)
El momento "paseo de la muerte". Es el argumento de producto más fuerte del
spec y hoy es una pantalla en blanco.

9. `PantallaEscalado` para ranking vacío.
10. `PantallaSolicitud` con cronómetro de expiración, motivo de rechazo
    estructurado, "enviar al siguiente", "cambiar destino", "cancelar".
11. Candidatos agotados → escalado.

*Riesgo: medio. El timeout es cliente-side; verificar con Sebas si quiere que
core lo emita de verdad.*

### Bloque 4 — el arranque y el cierre (§1, §6)
12. `PantallaInicio` con casos activos (`GET /estado` filtrado por unidad).
13. `PantallaRuta`: dirección, resumen compartido, navegación
    (`geo:` / `https://maps.google.com/?q=`), llamar (`tel:` — `sede.telefono`
    ya viene en el tipo `Sede`), marcar entregado.

### Bloque 5 — la barra y los respaldos (§0, §7, §8)
14. `BarraPersistente` con las cuatro luces.
15. `FormularioManual` — es el mismo `EditorEntidad` del bloque 1 en otro
    contenedor, así que sale casi gratis si el bloque 1 se hizo bien.
16. Cola offline y ETA "aproximados".

*El orden importa: hacer el §3 primero es lo que abarata el §7.*

---

## E · Decisiones ya tomadas

Las tres preguntas abiertas de la primera versión de este documento se
resolvieron al implementar el backend:

1. **La unidad se declara en el dispositivo**, no hay login por usuario.
   `localStorage` + `useUnidad()`. Documentado en los dos lados como
   trazabilidad y **no** como autenticación.

2. **El timeout lo emite core**, no el cliente. Salió más barato de lo
   estimado (`expiraEn` sellado en dispatch + barrido perezoso al leer) y
   evita el problema de fondo del enfoque cliente: dos relojes que se
   desincronizan. Configurable con `HANDSHAKE_TIMEOUT_S` para ensayar sin
   esperar 45 s de verdad.

3. **El rechazo avanza solo con aviso visible**, y sigue pendiente de pintar en
   el §5 del front. Core ya expone todo lo necesario: `motivoRechazo`,
   `expiraEn`, y el `match` re-scoreado que excluye a quien ya dijo que no.

## F · Estado

**Backend: hecho y verificado.** Prueba end-to-end de los siete puntos (unidad
que viaja, `expiraEn` coherente, vencimiento real, respuesta tardía que no
revive el traslado, sede excluida del re-match, escalamiento idempotente,
validación) en verde. `tsc` limpio en core y front, 22 tests de core pasando,
`next build` prerenderizando las cuatro rutas, y las cinco rutas nuevas
devolviendo 401 sin sesión.

**Frontend: pendiente**, y es el trabajo grande — los cinco bloques del §D.
Nada de eso está bloqueado ya: cada pieza que el plan daba por "hay que
simular" ahora tiene endpoint real detrás.
