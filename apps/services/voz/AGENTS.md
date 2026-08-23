# voz — instrucciones para agentes

Lee primero [`AGENTS.md` de la raíz](../../../AGENTS.md) y [`README.md`](README.md) de este servicio.

## ⚠️ Este es el único servicio con cara a internet

Twilio y Meta tienen que alcanzarlo. `core` y `ai-core` son internos: este servicio les habla, ellos
nunca hablan hacia afuera. **Esa frontera es de seguridad y no se negocia.**

## Los bugs abiertos

| # | Bug | Consecuencia | Tarea |
|---|---|---|---|
| 1 | No se verifica `X-Hub-Signature-256` ni `X-Twilio-Signature` | Cualquiera inyecta un caso falso o dispara una llamada que cuesta dinero | [0.2](../../../docs/tareas/zaid.md#02--verificar-firma-de-whatsapp-y-twilio) |
| 2 | El webhook tarda 4-8 s; Meta espera 2xx en ~3 s | **Meta ya está reintentando y nadie lo ha notado** | [0.3](../../../docs/tareas/neid.md#03--responder-el-webhook-en--3-s) |
| ~~3~~ | ~~No se deduplica por `wamid`~~ | **Cerrado** por [0.4](../../../docs/tareas/juan.md#04--deduplicar-webhooks-por-wamid): `webhooks_recibidos.py` + migración `0003`. Sin `PULSO_WEBHOOK_DATABASE_URL` degrada a memoria y lo dice en `/listo`. | — |

## Reglas de un webhook de entrada

1. **Firma contra el cuerpo CRUDO**, no contra el JSON re-serializado. El proveedor firma los bytes exactos.
2. **Deduplica por el id del proveedor** (`wamid`, `update_id`, `CallSid`), **en base de datos**. En
   memoria no sirve: con dos instancias en Render, la deduplicación deja de existir.
   Ya está hecho: `await reclamar(proveedor, id_externo)` de `webhooks_recibidos.py`. El candado es
   el `insert ... on conflict do nothing` — no hay ventana entre consultar y marcar porque no hay
   consulta. Un canal nuevo (Telegram, Twilio) lo llama igual y ya queda cubierto.
3. **Responde 2xx en < 3 s** y procesa después. Meta reintenta con backoff hasta 7 días.
4. **Nunca confíes en el contenido.**

## Reglas propias

- **Ninguna acción lanza.** Un fallo se convierte en mensaje al paramédico, no en un 500: del otro
  lado hay alguien con un paciente esperando respuesta.
- **Los casos se crean por `core`, no por `ai-core` directo.** Ya hubo un bug así: `voz` creaba el caso
  en ai-core y luego pedía `/dispatch` a core, que lo buscaba en SU almacén y respondía 404 siempre.
- **El ranking vacío nunca se calla.** Se dice y se devuelve al canal que sí funciona (radio al CRUE).
- **`/interno/*` va protegido por `SECRETO_ENDPOINT`**: está en el mismo servicio público que los
  webhooks y `/seguimiento` gasta dinero real.
- **`sesiones.py` está en memoria.** Con dos instancias, el "¿dónde queda?" responde vacío.

## Deuda

~~`voz` se autenticaba con `CORE_PASSWORD`~~ — **cerrado por la tarea 1.8**: `voz` usa
`CORE_SERVICE_TOKEN` (`sub: svc:voz`, alcance `caso:crear · caso:leer · notificar`), la auditoría
distingue el bot de una persona, y `POST /handshake/respond` le responde 403. Sin token configurado,
`/listo` lo dice y el despachador degrada a "reporta por radio al CRUE" — nunca a mandar sin cabecera.

```bash
uv sync && uv run uvicorn app.main:app --port 8090 --reload
uv run pytest
curl localhost:8090/listo    # qué está realmente conectado (incl. deduplicacion.modo)
curl localhost:8090/metrics  # pulso_webhook_duplicados_total{proveedor}

# Los tests de deduplicación contra Postgres de verdad se saltan sin base:
PULSO_TEST_DATABASE_URL=postgresql://localhost/pulso_test uv run pytest
```
