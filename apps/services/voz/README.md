# voz

El canal público de PULSO. **Es el único servicio con cara a internet**:
Twilio y Meta tienen que alcanzarlo. `core` y `ai-core` siguen siendo
internos — este servicio les habla, ellos nunca hablan hacia afuera.

```
    frontend ─┐
              ├─→ core (:3001) ──→ ai-core (:8000)
    voz ──────┘        ↑                  ↑
     ↑                 └──────────────────┘
  Twilio · WhatsApp            internos
```

```bash
uv sync
uv run uvicorn app.main:app --port 8090 --reload
uv run pytest                      # 29 tests, sin red
```

## Lo que hay que exponer

| Endpoint | Quién lo llama | Para qué |
|---|---|---|
| `GET /webhooks/whatsapp` | Meta, una vez | Verificación al registrar el webhook |
| `POST /webhooks/whatsapp` | Meta, siempre | Los mensajes del paramédico |
| `WS /telefonia/twilio` | Twilio | El audio de la llamada |
| `POST /telefonia/llamar` | Nosotros | Dispara una llamada saliente ⚠️ protegido |
| `GET /health` | Render | Liveness |
| `GET /listo` | Tú | Qué está realmente conectado |

**Empieza por `/listo`.** Dice qué credenciales faltan sin que tengas que
leer logs.

## Desplegar en Render

`render.yaml` en la raíz del repo es un blueprint listo:
**Render → New → Blueprint → apuntar a este repo.**

Sólo `voz` va en el blueprint, a propósito: `ai-core` tiene las credenciales
de los proveedores de IA y no debe quedar expuesto.

Los secretos van con `sync: false` — Render los pide en el dashboard y no los
versiona. **Nunca los escribas en `render.yaml`.**

Después del primer deploy:

1. Copia la URL que te dé Render (`https://pulso-voz.onrender.com`).
2. Registra el webhook en Meta con esa URL + `/webhooks/whatsapp`, usando el
   mismo `WHATSAPP_VERIFY_TOKEN` que pusiste en el dashboard.
3. Verifica: `curl https://…/listo`.

⚠️ **El plan `free` de Render duerme el servicio tras ~15 min sin tráfico**, y
despertarlo tarda decenas de segundos. Para el pitch eso es fatal: el primer
mensaje del demo se pierde. Súbelo a un plan pago el día del evento, o
mantenlo caliente con un ping.

## Por qué Twilio necesita `URL_PUBLICA`

No es opcional y es el olvido más común:

1. Le pedimos a Twilio que llame, con TwiML en línea.
2. El TwiML le dice a Twilio que abra un **WebSocket de vuelta hacia nosotros**.
3. Twilio marca.
4. Cuando contestan, el audio va y viene por ese socket.

Sin una URL alcanzable desde internet, el paso 2 no tiene destino y la llamada
no suena. En local: `ngrok http 8090`. En Render: la URL del servicio (el
blueprint la inyecta sola).

`TWILIO_PHONE_NUMBER` acepta un **Verified Caller ID** — no hace falta comprar
un número para que funcione el `from`.

## La ventana de 24 horas juega a favor

Mandar un mensaje iniciado por el negocio exige una plantilla aprobada por
Meta (24–48h de trámite). Pero **responder dentro de las 24h siguientes a un
mensaje del usuario no la necesita**, y en este flujo el paramédico escribe
primero. La ventana se abre sola.

## Mapa

| Archivo | Qué es |
|---|---|
| `app/rutas/whatsapp.py` | Los endpoints que Meta llama |
| `app/canales/whatsapp.py` | Entrada (normalización, bajar audio) y salida (texto, ubicación) |
| `app/despachador.py` | Decisión → acciones reales. Una función por herramienta |
| `app/clientes/` | Los únicos archivos que saben hablarle a `ai-core` y a `core` |
| `app/telefonia/` | Twilio: TwiML, llamada saliente, WebSocket de audio |
| `app/sesiones.py` | Qué caso es de qué teléfono ⚠️ en memoria |

## Lo que NO está hecho

**El puente de audio de la llamada.** `WS /telefonia/twilio` acepta la
conexión y la cierra limpio, pero no conecta con ningún agente de voz.
Conectarlo depende de una decisión pendiente: **ElevenLabs Agents o la Voice
Agent API de Deepgram**. Montar los dos es trabajo perdido.

**El estado sobrevive sólo en memoria.** `app/sesiones.py` mapea teléfono →
caso. Se pierde al reiniciar y no se comparte entre instancias: con dos
instancias en Render, un paramédico puede escribir a una y recibir de la otra,
y el "¿dónde queda?" responde vacío. El arreglo real es que `core` guarde
`caso.telefono_reporta` en Supabase.

**El registro de demoras** sólo queda en el log. Cuando `core` exponga dónde
guardarlo, se manda allá.
