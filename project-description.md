# PULSO

**Del dictado del paramédico al hospital que sí puede recibirlo, en menos de 90 segundos.**

🔗 **Demo en vivo:** <https://pulso-frontend.onrender.com>

## El problema

En una emergencia crítica (infarto, ACV, politraumatismo), cada 15 minutos de retraso en asignar la cama correcta aumenta drásticamente las secuelas o la muerte. Hoy ese proceso —la referencia y contrarreferencia— se resuelve **por teléfono**: la ambulancia rebota de IPS en IPS ("el paseo de la muerte") porque nadie sabe, en el momento, quién tiene la cama y el especialista de turno. El promedio actual de decisión es **~45 minutos**.

¿Y por qué no existe un tablero con la capacidad en tiempo real? Porque el reporte manual falla por diseño, y tenemos la prueba: el dataset oficial de **"Registro diario de ocupación"** ([`uwc4-gvg3`](https://www.datos.gov.co/resource/uwc4-gvg3.json) en datos.gov.co) tiene 8.389 filas y **una sola fecha: 2022-11-30**. Un registro *diario* y *obligatorio* con un solo día vivo — se apagó el día que terminó el mandato COVID.

## La solución

PULSO no le pide a ningún hospital que reporte camas. **El acto de rechazar ya es el sensor.**

1. 🎙️ **El paramédico dicta** — por voz en la consola de campo, o por nota de voz de WhatsApp. Claude convierte el dictado en un caso clínico estructurado: diagnóstico CIE-10, triage 1–5 (Res. 5596/2015), servicios REPS mandatorios, complejidad y tipo de móvil.
2. 🧮 **El motor rankea** las **84 IPS de urgencias reales de Bogotá** (REPS, geocodificadas). El score está **en minutos de hora dorada**: `ETA con tráfico + riesgo de rechazo + congestión − bono por camas declaradas`, sujeto a un filtro **duro**: una sede sin hemodinamia para un infarto no es peor opción — es no-opción.
3. 📲 **El jefe de urgencias responde con un toque** — Telegram, WhatsApp o consola web: `Aceptar` / `Rechazar con motivo`. Cada respuesta actualiza la probabilidad de aceptación y la congestión de esa sede: **la red se entrena sola con cada handshake**.
4. 🔁 **Si nadie contesta, PULSO re-rutea solo** al siguiente candidato; si el ranking se vacía, escala al CRUE. El hospital que aceptó ve el **prearribo**: qué llega, en cuánto tiempo, SBAR de entrega y qué falta en la sala.

## Por qué es distinto

- **Cero fricción de adopción.** El hospital no instala nada ni tipea nada: aprieta un botón que de todas formas iba a apretar.
- **Legalmente en su sitio.** PULSO propone; el humano decide y el **CRUE regula** (Res. 1220/2010). En triage I ni siquiera se ofrece el botón de rechazo (Ley 1751/2015): rechazar es una *declaración de capacidad* auditada, no un derecho a negar atención.
- **Interoperable por diseño.** Habla el vocabulario de servicios FHIR/REPS que MinSalud ya publicó, y produce en la escena buena parte del RDA de urgencias que la Res. 1888/2025 exige en FHIR R4.
- **Datos reales, no inventados.** 84 sedes con habilitación REPS verificada, curva de demanda medida sobre 9.206 incidentes de la línea 123, y 400 casos de demo derivados de incidentes reales.
- **Todo degrada, y lo dice.** Sin ninguna credencial el sistema completo funciona (semillas, ETA por distancia, extractor heurístico) y cada consola declara en qué modo corre. La auditoría es append-only: nada con consecuencia clínica ocurre sin confirmación humana registrada.

## Stack

Next.js 16 + Tailwind v4 (consolas de campo, hospital y CRUE) · NestJS (dominio, handshake, scoring bayesiano) · FastAPI + **Claude** (triage estructurado, STT/TTS) · PostgreSQL/PostGIS (Supabase) · Mapbox Matrix con tráfico real · WhatsApp Cloud API, Telegram y Twilio.

**Equipo 6 — Bogotá:** Juan Lizcano (frontend), Alberth Zaid Pantoja (backend/datos), Neyl Peñuela (IA), Sebastián Acuña (producto/hospital).
