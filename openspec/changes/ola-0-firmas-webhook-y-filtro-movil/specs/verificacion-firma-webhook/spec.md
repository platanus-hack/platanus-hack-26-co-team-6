# Verificacion de Firma de Webhook — Especificacion

## Purpose

`apps/services/voz` es el unico servicio de PULSO con cara a internet. Esta capacidad garantiza
que solo solicitudes autenticas de Meta (WhatsApp) y Twilio sean procesadas. Es la unica excepcion
documentada a la regla 2 de `AGENTS.md` ("todo degrada sin credenciales"): en produccion, un
webhook sin verificar **es** la vulnerabilidad, no una degradacion aceptable. La asimetria
desarrollo/produccion descrita abajo es intencional y no debe homogeneizarse.

## Fuera de alcance

- Reescribir el cuerpo de `rutas/whatsapp.py::recibir()` (tarea 0.3).
- Alertar sobre la metrica (umbral, paging): solo se expone el contador.

## Requirements

### Requirement: Verificacion de la firma de WhatsApp contra bytes crudos

El sistema MUST verificar `X-Hub-Signature-256` antes de que el payload de un webhook de WhatsApp
sea procesado. La comparacion MUST usar `hmac.compare_digest` (tiempo constante), nunca `==`. El
HMAC MUST calcularse sobre los bytes crudos exactos de la solicitud (`request.body()`), nunca
sobre una re-serializacion del JSON ya parseado.

#### Scenario: Firma valida sobre cuerpo crudo permite el paso
- GIVEN una solicitud con cuerpo crudo C y `X-Hub-Signature-256` calculada con HMAC-SHA256 sobre C
- WHEN el servicio recibe la solicitud
- THEN responde 200 y procesa el payload

#### Scenario: Cuerpo alterado con firma antigua se rechaza
- GIVEN una firma calculada para un cuerpo C, pero un cuerpo enviado C' distinto de C
- WHEN el servicio verifica la firma
- THEN responde 401 y no procesa el payload

#### Scenario: La verificacion usa bytes crudos, no JSON re-serializado
- GIVEN una solicitud con cuerpo crudo C y firma valida para C
- WHEN el payload se parsea y se re-serializa a un cuerpo C'' con bytes distintos de C
- THEN el HMAC se recalcula contra C, no contra C'', y la solicitud se acepta

### Requirement: Asimetria desarrollo/produccion cuando falta el secreto

El sistema MUST leer `entorno` (variable `ENTORNO`, valor por defecto `"desarrollo"`). Cuando
`whatsapp_app_secret` esta ausente: en `entorno == "desarrollo"` el sistema MUST aceptar la
solicitud y MUST emitir una advertencia fuerte en el log; en `entorno == "produccion"` el sistema
MUST rechazar toda solicitud de WhatsApp (o MUST negarse a iniciar).

#### Scenario: Sin secreto en desarrollo, acepta y advierte
- GIVEN `entorno == "desarrollo"` y `whatsapp_app_secret` sin configurar
- WHEN llega un webhook de WhatsApp con cualquier firma o sin firma
- THEN el servicio acepta la solicitud y escribe una advertencia fuerte en el log

#### Scenario: Sin secreto en produccion, rechaza todo
- GIVEN `entorno == "produccion"` y `whatsapp_app_secret` sin configurar
- WHEN llega un webhook de WhatsApp
- THEN el servicio rechaza la solicitud (o no arranca), sin excepcion

### Requirement: Firma invalida o ausente con secreto presente se rechaza en cualquier entorno

Cuando `whatsapp_app_secret` esta configurado, el sistema MUST responder 401 ante cualquier
solicitud cuya firma este ausente o no coincida, sin importar `entorno`, y MUST incrementar la
metrica de firma invalida.

#### Scenario: Secreto presente, firma invalida en desarrollo
- GIVEN `entorno == "desarrollo"` y `whatsapp_app_secret` configurado
- WHEN llega un webhook con firma ausente o incorrecta
- THEN responde 401 y `pulso_webhook_firma_invalida_total{proveedor="whatsapp"}` se incrementa

#### Scenario: Secreto presente, firma invalida en produccion
- GIVEN `entorno == "produccion"` y `whatsapp_app_secret` configurado
- WHEN llega un webhook con firma ausente o incorrecta
- THEN responde 401 y `pulso_webhook_firma_invalida_total{proveedor="whatsapp"}` se incrementa

### Requirement: Validacion de la firma de Twilio en el handshake del WebSocket

El sistema MUST validar `X-Twilio-Signature` en el handshake HTTP de upgrade de
`telefonia/rutas.py::audio()` (`/telefonia/twilio`) usando `RequestValidator`, antes de aceptar la
conexion WebSocket. La URL validada MUST tolerar el quirk conocido de la barra final sin producir
un rechazo falso por esa sola diferencia.

#### Scenario: Firma de Twilio valida en el handshake
- GIVEN una solicitud de upgrade a `/telefonia/twilio` con `X-Twilio-Signature` valida para la URL usada
- WHEN el servicio valida la firma en el handshake
- THEN acepta la conexion WebSocket

#### Scenario: Firma de Twilio invalida o ausente en el handshake
- GIVEN una solicitud de upgrade a `/telefonia/twilio` con firma ausente o invalida
- WHEN el servicio valida la firma en el handshake
- THEN rechaza la conexion y `pulso_webhook_firma_invalida_total{proveedor="twilio"}` se incrementa

### Requirement: Metrica de firmas invalidas expuesta en Prometheus

El sistema MUST exponer el contador `pulso_webhook_firma_invalida_total{proveedor}` en el registro
existente de `metricas.py`, incrementandolo una vez por solicitud rechazada por firma, etiquetado
por `proveedor` (`whatsapp` o `twilio`). MUST ser visible en `GET /metrics` sin infraestructura nueva.

#### Scenario: El contador se incrementa y es visible
- GIVEN al menos un rechazo por firma invalida de cada proveedor
- WHEN se consulta `GET /metrics`
- THEN `pulso_webhook_firma_invalida_total` aparece con las etiquetas `proveedor` correspondientes y valores incrementados

### Requirement: Ninguna PII en la verificacion de firma

Los logs, las etiquetas de metrica y las respuestas de error producidos por la verificacion de
firma MUST NOT incluir el cuerpo de la solicitud, `textoCrudo`, `origen` ni ningun otro campo de
PII. Solo MAY registrarse proveedor, marca de tiempo y resultado exito/fracaso.

#### Scenario: Un rechazo por firma no filtra contenido del payload
- GIVEN un webhook rechazado por firma invalida que contiene datos de paciente en el cuerpo
- WHEN el sistema registra el rechazo y actualiza la metrica
- THEN el log y las etiquetas de la metrica no contienen el cuerpo del payload, `textoCrudo` ni `origen`
