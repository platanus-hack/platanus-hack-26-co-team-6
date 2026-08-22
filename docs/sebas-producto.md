# Sebas · Producto / Pitch / Dominio

> 📌 **Documento de la hackathon (ago 2026).** Conserva contexto útil, pero **algunas rutas de archivo ya cambiaron**.
> El plan vigente está en [`docs/README.md`](README.md) y las tareas en [`docs/tareas/sebas.md`](tareas/sebas.md).

> **En Platanus se gana con el pitch, no con el commit count.**
> Tu carril es el más subestimado del equipo y probablemente el que decide
> el resultado. No te metas al motor: los otros tres ya lo tienen.

---

## 🔴 Haz esto AHORA, antes de leer el resto

**La plantilla de WhatsApp tarda 24–48 horas en ser aprobada por Meta.** Si la mandas en la hora 6, no llega para el demo.

1. <https://developers.facebook.com> → crear app → agregar WhatsApp
2. Copiar el token temporal, el `phone_number_id` y registrar el número de prueba
3. Enviar a aprobación una plantilla de utilidad tipo *"Nueva solicitud de traslado. Paciente {{1}}. Servicio requerido {{2}}."*
4. Pegar las credenciales en `.env.local`

**Tiempo: 20 minutos. Impacto si lo olvidas: perdemos el canal que más impresiona.**

> **Truco del demo que sirve aunque la plantilla no llegue:** dentro de la
> ventana de 24 horas (el destinatario escribió primero) los mensajes
> interactivos con botones fluyen **sin plantilla**. Antes de subir al
> escenario, que el celular receptor le escriba "hola" al número. Listo.

Mientras tanto: **Telegram es el canal primario del demo.** Inline keyboards, cero aprobación, funciona en 15 minutos. Es la red de seguridad y hay que tenerla lista hoy.

---

## Tus archivos

| Archivo | Qué es |
|---|---|
| [`apps/frontend/app/hospital/page.tsx`](../apps/frontend/app/hospital/page.tsx) | Consola del jefe de urgencias. Funciona. |
| [`apps/backend/core/src/canales/canales.service.ts`](../apps/backend/core/src/canales/canales.service.ts) | Telegram + WhatsApp + el texto de la tarjeta. |
| [`apps/backend/core/src/telegram/telegram.controller.ts`](../apps/backend/core/src/telegram/telegram.controller.ts) | Recibe los toques de los botones. |
| [`apps/frontend/app/globals.css`](../apps/frontend/app/globals.css) | **Tú defines los tokens de diseño.** Juan los consume. |
| `deck/` | Créalo. |

---

## Tareas

### Bloque 1 · H2–H10 — el canal

- [ ] **Bot de Telegram:** hablar con [@BotFather](https://t.me/botfather) → `/newbot` → copiar el token a `TELEGRAM_BOT_TOKEN`.
- [ ] **Deploy a Vercel.** Telegram exige HTTPS: el webhook **no funciona en localhost**. En local, alternativa: `npx localtunnel --port 3000`.
- [ ] **Inventar el secreto del webhook** y ponerlo en `apps/backend/core/.env`:
  ```bash
  TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)
  ```
  ⚠️ **No es opcional.** `/telegram/webhook` es la única ruta pública que cambia estado clínico: sin secreto, cualquiera que adivine la URL fabrica un *"el hospital aceptó"* que el sistema no distingue de tu toque real. Core lo sabe y **rechaza todo update sin firmar** — si te lo saltas, los botones no hacen nada y no hay error visible. `task doctor` te avisa.
- [ ] **Registrar el webhook** con ese secreto (una sola vez):
  ```bash
  curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<TU-CORE>/telegram/webhook&secret_token=<EL-SECRETO>"
  curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"   # verificar
  ```
- [ ] **Sacar el `chat_id`:** escríbele cualquier cosa al bot. El webhook te responde con tu `chat_id` — pégalo en `TELEGRAM_CHAT_ID_DEMO`. (Ya está implementado justo para ahorrarte pelear con `getUpdates`.)
- [ ] **Probar el ciclo completo:** despachar desde `/campo` → el celular vibra → tocar *Aceptar* → `/campo` se actualiza sola.
- [ ] **Definir los tokens de diseño** en `globals.css`. Los que hay son un punto de partida oscuro y de alto contraste. Criterio: **celular, dentro de una ambulancia en movimiento, de noche.**

### Bloque 2 · H10–H20 — la consola y el dominio

- [ ] **Pulir `/hospital`.** Es el fallback absoluto del demo: si el wifi de los celulares se cae, el handshake sigue funcionando desde ahí. También es la pantalla que se proyecta cuando muestras "el otro lado".
- [ ] **Verificar la regla legal.** En triage I **no aparece** el botón de rechazo. Ya está implementado. Entiende por qué y prepárate para explicarlo — es tu mejor respuesta a la pregunta más incómoda (abajo).
- [ ] **WhatsApp con la ventana abierta.** Probarlo de verdad, con el celular del demo.
- [ ] **Primer ensayo del pitch a H18.** No a H30. El primer ensayo siempre sale mal y hay que tener tiempo de arreglar lo que revele.

### Bloque 3 · H20–H28 — el demo *es* el producto

- [ ] **Modo demo determinista.** `NEXT_PUBLIC_MODO_DEMO=true`. Nada de aleatoriedad en vivo.
- [ ] **Estado limpio antes de subir.** `reiniciarTodo()` en [`apps/backend/core/src/almacen/almacen.service.ts`](../apps/backend/core/src/almacen/almacen.service.ts) borra casos y handshakes. Si en el escenario aparecen 14 casos de las pruebas, se ve amateur. Ponle un botón escondido o un endpoint.
- [ ] 🔴 **GRABAR EL VIDEO DE RESPALDO DEL DEMO COMPLETO.** El wifi del evento se cae. Siempre. Un video de 90 segundos te salva el pitch entero.
- [ ] **Tres ensayos cronometrados.** Con los teléfonos reales, en la red del evento.

---

## Guion del demo · 3 minutos

| t | Qué pasa |
|---|---|
| **0:00** | El problema: la ambulancia rebota. Slide del registro de ocupación **muerto desde noviembre de 2022**. |
| **0:30** | El paramédico dicta en vivo, desde un teléfono, en el escenario. |
| **0:50** | Aparece el caso estructurado: CIE-10, triage II, servicios `743` + `110`. |
| **1:10** | Mapa: 47 sedes con urgencias → filtro duro → 6 con hemodinamia y UCI. **Señalar la clínica que está más cerca y quedó tachada.** |
| **1:30** | One-tap: el celular de un compañero (jefe de urgencias) vibra **en el escenario**. Acepta. |
| **1:50** | Confirmación en el teléfono del paramédico. **Cronómetro: 74 segundos.** |
| **2:10** | El giro: segundo caso, se rechaza → la congestión de esa IPS sube en vivo y el sistema re-rutea solo. *"El rechazo es el sensor."* |
| **2:40** | Cierre: 45 min → 90 s. Vocabulario FHIR de MinSalud. PULSO propone, el CRUE regula. |

**El momento 1:10 es el más importante y el más fácil de desperdiciar.** Que se vea la clínica más cercana en gris, tachada por no tener hemodinamia, mientras el #1 está a un minuto más. Ese contraste explica el producto sin una palabra.

---

## Las tres preguntas que te van a hacer

**1. "¿De dónde sacan la ocupación de camas?"**
La respuesta completa está en [neid-ai.md](neid-ai.md). Resumen: *el acto de rechazar ya es el sensor*, y el reporte manual ya se intentó — el registro diario del Ministerio tiene una sola fecha viva. **Esta pregunta es tu mejor momento, no tu peor.**

**2. "¿Esto no reemplaza al CRUE? ¿Es legal?"**
No. La Res. 1220/2010 le da al CRUE la potestad regulatoria y legalmente no se puede quitar. **PULSO propone; el CRUE regula.** Eliminamos la llamada telefónica, no la regulación. Muéstrale `/crue`.

**3. "¿El botón 'Rechazar' no legaliza negar atención?"** *(la más incómoda)*
No. La Ley 1751/2015 obliga a atender urgencias sin autorización previa. El botón **no es un derecho a negar**: es una **declaración de capacidad**, queda auditada con timestamp y motivo, y **en triage I el sistema ni siquiera la ofrece** — escala directo al CRUE. Ábreles `/hospital` con un caso triage I y que vean que el botón no está. Esa demostración vale más que el argumento.

---

## Lo que NO tienes que hacer

No toques `apps/backend/core/src/scoring/scoring.service.ts`, `apps/backend/core/src/scoring/congestion.service.ts` ni el ETL. Están cubiertos. Cada hora que pasas ahí es una hora que no pasas en lo que realmente decide el resultado.

Y protege esta lista con los dientes: **no se construye** auth real, historia clínica, FHIR completo, contrarreferencia, app nativa, multi-ciudad ni modelo entrenado. Cuando alguien del equipo proponga uno de esos a las 4 de la mañana, tu trabajo es decir que no.

---

## Hallazgos de Neid (H+)

### 🔴 Nadie escribe el estado `timeout` — no hay escalamiento

`EstadoHandshake` incluye `"timeout"`, y `/api/match` lo lee para no volver a
ofrecer una sede que no contestó. **Pero ningún código lo asigna nunca.**
Busqué en todo el repo: solo aparece en la definición del tipo y en ese filtro.

O sea: si el jefe de urgencias no contesta, el caso se queda colgado para
siempre y el paramédico se queda mirando una pantalla que dice "enviado".

Es tu carril ([`apps/frontend/lib/handshake.ts`](../apps/frontend/lib/handshake.ts))
y es barato: a los 60 s sin respuesta, marcar `timeout` y despachar al #2 del
ranking. **Vale más para el demo que cualquier canal nuevo** — y de paso te da
un momento fuerte que hoy no tienes: *"el hospital no contestó y el sistema
siguió solo"*. Eso es exactamente lo que hoy hace un humano al teléfono.

### La flota de ambulancias es tu slide de cierre, no código

Salió una idea grande: modelar cada ambulancia como un móvil con tracking,
recalcular cobertura por grilla al estilo Uber, detectar demoras con outliers
(q10/q90) y llamar por voz con Twilio + ElevenLabs para preguntar la razón.

**Nada de eso existe en el repo** — busqué "ambulancia", "móvil", "flota",
"tracking": cero. `tipoMovil` es un string en el caso, nada más. Construirlo
requiere entidad de móvil, máquina de estados, grilla, política de
reposicionamiento y **demanda histórica por celda**, que tampoco tenemos. Y el
q10/q90 necesita cientos de viajes: al momento del pitch habría cero.

Dos razones más para no construirlo, y la segunda es tuya:

1. Un stub de flota es exactamente lo que un jurado técnico caza. Dicho como
   visión es fuerte; mostrado a medias, resta.
2. **Debilita tu mejor respuesta legal.** Hoy dices *"PULSO propone, el CRUE
   regula"* (Res. 1220/2010). Reposicionar ambulancias por la ciudad **es** la
   función operativa del CRUE. En el momento en que el sistema mueve flota, esa
   respuesta deja de ser limpia y te abres a la pregunta incómoda que hoy
   tienes blindada.

Mi recomendación: va en el cierre, después de los 45 min → 90 s. *"Hoy PULSO
elige el destino. El mismo motor, con la flota conectada, elige también qué
ambulancia y desde dónde."* Es una frase, no una sprint.

### El motor ahora aprende el rebote por sede

`PENALIZACION_REBOTE` era una constante global de 22 minutos para todos. Ahora
se descompone en dos mitades: lo que **esa sede** tarda en contestar (medible
desde cada handshake) más el sobrecosto fijo de descargar y re-rutear.

Para el pitch: sin datos sigue dando exactamente 22 min, así que el número que
ya ensayaste no cambia. Lo que cambia es que ahora puedes decir *"y ese 22 no
es un supuesto congelado: cada handshake lo calibra por hospital"*. Detalle en
[neid-ai.md](neid-ai.md).

Y ojo con la honestidad, que es tu marca en este pitch: los 22 min y los 25 de
espera en puerta **siguen siendo juicio informado, no medición colombiana
publicada**. Si te preguntan, dilo así — son parámetros calibrables, no
verdades. Eso genera confianza; fingir precisión la destruye.


---

## El flujo de WhatsApp de entrada (idea nueva, H+)

La idea: el paramédico llega a la escena, reporta por WhatsApp (texto o nota de
voz), y PULSO le responde con el hospital y la ubicación para navegar.

**ai-core ya tiene su mitad lista.** `POST /v1/triage` acepta `audioBase64` y
hace transcripción + extracción en una sola llamada, con Deepgram o ElevenLabs
detrás. Falta la mitad tuya: el webhook de entrada y el mensaje de respuesta.

### Tres cosas, en orden de rendimiento

**1. Mensaje de ubicación nativo — hazlo aunque no hagas lo demás.**
WhatsApp tiene un tipo de mensaje `location`: le mandas
`{latitude, longitude, name, address}` y en el celular sale una tarjeta de mapa
con botón de navegar que abre Google Maps o Waze. **No es un link, es una
tarjeta.** `sede.coord` ya trae lat/lng desde PostGIS. Son ~15 líneas en
`canales.service.ts` y en el escenario se ve muy bien.

**2. Webhook de entrada, sólo texto.** Hoy WhatsApp es sólo de salida. Lo de
entrada es el mismo patrón del webhook de Telegram que ya tienes.

**3. Audio.** Llega como un `media_id`: hay que hacer un GET autenticado a la
API de Meta para bajar el `.ogg` y recién ahí mandárselo a ai-core en base64.
Dos saltos extra antes de que empiece el triaje.

### La ventana de 24h juega a tu favor aquí

Tu doc la trata como truco de demo. En este flujo **el paramédico escribe
primero**, así que la ventana se abre legítimamente y la respuesta con el
hospital y la ubicación **no necesita plantilla aprobada**. Es una ventaja real
de que el flujo sea de entrada, no un parche.

Ojo con el otro lado: la llamada de seguimiento horas después ya cae fuera de
la ventana. Ahí una llamada de voz (Twilio) sí se justifica, porque esquiva el
problema entero.

### La parte que yo no construiría

Cobertura de flota y reposicionamiento de ambulancias. Dos razones, y la
segunda es tuya:

1. No hay entidad de móvil en el repo, ni demanda histórica por zona, ni viajes
   de los cuales sacar un q10/q90. Al momento del pitch habría cero datos.
2. **Debilita tu mejor respuesta legal.** Reposicionar ambulancias por la ciudad
   *es* la función operativa del CRUE (Res. 1220/2010). Hoy dices "PULSO
   propone, el CRUE regula" y es limpio. Si el sistema mueve flota, deja de
   serlo.

Hay una versión que no cruza la línea: **PULSO no asigna, le muestra al CRUE la
cobertura.** `/crue` ya existe justo para eso. Y como cierre del pitch: *"hoy
PULSO elige el destino; el mismo motor, con la flota conectada, elige también
qué ambulancia y desde dónde."* Una frase, no un sprint.
