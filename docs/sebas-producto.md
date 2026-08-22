# Sebas · Producto / Pitch / Dominio

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
