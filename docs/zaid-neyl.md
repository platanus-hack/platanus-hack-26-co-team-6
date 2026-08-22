# Zaid + Neyl · Cobertura de flota

> Doc compartido. Lo que hay, lo que falta, y quién lo tiene.
> Complementa [neid-ai.md](neid-ai.md), [zaid-backend.md](zaid-backend.md) y
> [neid-faltantes.md](neid-faltantes.md).

---

## 🔴 Decisión de producto: no hay app móvil, hay WhatsApp

El paramédico **no instala nada**. Toda la comunicación va por WhatsApp:
reporta por texto o nota de voz, recibe el hospital y la ubicación ahí mismo.

Eso cambia el orden de importancia de todo lo demás:

- `apps/services/voz` deja de ser un canal secundario y pasa a ser **la
  interfaz principal del producto**. Lo que se rompa ahí, se rompe para el
  usuario final.
- La PWA (`/campo`) queda como respaldo y como pantalla de demo, no como el
  camino que usa un paramédico de verdad.
- La ventana de 24h de Meta **juega a favor**: el paramédico escribe primero,
  así que la ventana se abre sola y las respuestas no necesitan plantilla
  aprobada.
- El `Unidad.id` que declara `/campo` ahora tiene que poder declararse
  **desde WhatsApp**. Hoy no se puede — está anotado abajo.

---

## El modelo de los cuatro puntos

```
  A ──────► B ──────► C ──────► D
móvil     paciente  hospital   zona a cubrir

A→B  el móvil va por el paciente
B→C  traslado. Aquí vive el ranking (scoring.py): a QUÉ hospital
C→D  reposicionamiento. Aquí vive lo nuevo (cobertura.py): a QUÉ zona
```

**En D no se mide permanencia** — es donde la unidad espera. Lo que sí importa
es el trayecto **C→D**, porque es lo que decide si vale la pena que *esa*
unidad cubra *esa* zona en vez de otra.

Los tiempos "estacionado" que sí importan son tres, y hoy solo medimos uno:

| Dónde | Qué se mide | ¿Existe? |
|---|---|---|
| En B | Estabilizar y montar al paciente | ❌ |
| En C | Entregar — es el rebote | ✅ calibrado por sede |
| Turnaround antes de quedar libre | | ❌ |

---

## ✅ Lo que ya está (Neyl · `ai-core`)

### `POST /v1/cobertura`

Función pura: entra la foto de la flota, sale el reparto. Sin estado —
`core` guarda los locks, igual que con `/v1/score`.

```
zonas + unidades + locks  →  asignaciones + descubiertas + liberadas
```

**Cupo por demanda real.** No es una suposición: sale de las **9.206 llamadas
del 123** en `data/derivados/demanda_localidad.json`. Kennedy concentra el
**15,0%** de la demanda de Bogotá; Suba el 10,1%; Sumapaz el 0,08%.

**Dos medidas que NO son lo mismo**, y confundirlas hace que un tablero
mienta:

- `cupo` — reparto de las unidades **que hay**. Suma exactamente la flota
  libre, así que medir déficit contra esto **siempre da cero**.
- `requeridas` — contra la flota que la ciudad **debería** tener
  (`flotaObjetivo`). Sin ese objetivo declarado, no se inventa un déficit.
- `descubierta` — sin una sola unidad. **Es el número honesto** y el que se
  pinta en rojo, porque no depende de suponer nada.

*(Este error estaba en mi primera versión: el déficit siempre daba cero y lo
cazó un test.)*

### El problema del checkout, resuelto

Una unidad puede terminar turno, irse a almorzar, o simplemente no responder.
**Desde el sistema las tres son iguales y se tratan igual:** sin latido en
`latidoMaximoMin`, la unidad sale del pool sola, diga lo que diga su estado.

No distinguir "no quiere trabajar" de "se le cayó la red" no es pereza de
diseño: es lo que evita que esto se convierta en una herramienta de vigilancia
laboral, que es una conversación que no queremos tener con un sindicato de
paramédicos.

`en_traslado` nunca está disponible — **no se saca una ambulancia de un
trayecto con paciente a bordo**. `en_puerta` sí: está a minutos de quedar
libre y es exactamente el caso C→D.

### Locks con TTL

Tres razones para liberar una zona: el lock venció, la unidad hizo checkout, o
la zona ya no existe.

Sin TTL, una unidad que se desconecta camino a D deja esa zona **reservada y
descubierta a la vez** — el peor de los dos mundos.

### El ETL de demanda

```bash
python3 scripts/etl/demanda_123.py
```

9.206 llamadas → demanda por localidad, por hora y por día de semana.
Corre con el Python del sistema, sin instalar nada.

---

## 🔎 Hallazgo: nuestra curva horaria estaba mal

`congestion.py` asume que el pico de urgencias es a las **20:00**. Los datos
reales del 123 dicen otra cosa:

| | Pico | 17:00 | 18:00 |
|---|---|---|---|
| Curva asumida | 20:00 | 0.82 | 0.90 |
| **Real (9.206 llamadas)** | **09:00** | **0.28** | **0.31** |

La divergencia en la tarde es enorme: donde asumíamos el máximo, el dato real
cae al mínimo.

⚠️ **No cambié la curva todavía, y a propósito.** Dos reservas honestas:

1. El campo es `FECHA_INICIO_DESPLAZAMIENTO_MOVIL` — cuándo **salió el móvil**,
   no cuándo entró la llamada. Mezcla demanda con capacidad de despacho.
2. Una caída a 0.28 a las 17:00 seguida de un salto a 0.73 a las 19:00 huele
   más a artefacto de reporte (¿cambio de turno en el sistema?) que a
   epidemiología.

Es un mes (junio 2026, 31 días). **Decisión de los dos:** o se adopta la curva
empírica declarando la reserva, o se deja la actual diciendo que es juicio
informado. Lo que no se puede es seguir sin saberlo.

---

## ❌ Lo que falta — Zaid

**Persistir los locks.** `POST /v1/cobertura` es sin estado; alguien tiene que
guardar `lock(zona, unidad, expira_en)` y devolverlo en el siguiente request.
Tabla nueva o campo en `handshake`, tu decisión.

**La tabla de unidades.** Hoy `Unidad` es una etiqueta pegada al caso, con tu
propia advertencia de que no autoriza nada. Para cobertura hace falta una
ambulancia **con existencia propia**: id, estado, última posición, último
latido.

**Los polígonos de las localidades.** El motor recibe `centroide` y un
`poligono` opcional que no usa — viaja solo para pintar. No hay geometría de
localidades en el repo: `ins.geojson` son 2.900 puntos de IPS, sin campo de
localidad (sólo `barrio`, 828 valores). Están en datos abiertos de Bogotá.

**El heartbeat.** Algo tiene que recibir la posición de cada móvil. Sin eso,
`ultimoLatidoEn` va en null y el motor confía en el estado declarado — que es
un modo válido para arrancar, pero no detecta el checkout silencioso.

**Persistencia general**, que sigue abierta y ahora pesa más: el vigilante,
las sesiones de WhatsApp y la calibración del rebote viven todos en memoria.

---

## ❌ Lo que falta — Neyl

**Declarar la unidad desde WhatsApp.** Si no hay app, el `AMB-014` tiene que
poder decirse por chat. Hace falta una herramienta más en el agente
(`declarar_unidad`) y que el teléfono quede asociado al móvil, no sólo al caso.

**Que el vigilante dispare la cobertura.** Hoy detecta demoras y vence
handshakes. Cuando un traslado se cierra (`confirmar_llegada` con
`donde: "hospital"`), esa unidad queda libre y **nadie recalcula la
cobertura**. Es el gatillo natural de C→D y no está conectado.

**Tiempos en B y el turnaround.** Dos de los tres tiempos "estacionado" no se
miden.

**El puente de audio**, que sigue esperando la decisión ElevenLabs Agents vs.
Deepgram Voice Agent.

---

## 🚧 Lo que NO se construyó, y por qué

**Grilla de hexágonos (H3).** Era mi recomendación hasta que miré el dato: las
llamadas del 123 **no traen coordenadas**, sólo localidad. Sin puntos no hay
nada que agrupar en hexágonos. Por eso la zona es la localidad.

El motor no se casa con eso: `Zona.id` es opaco a propósito. El día que haya
datos con lat/lng, se subdivide sin tocar `cobertura.py`.

**Asignación óptima global.** El reparto es greedy — la unidad más cercana a
la zona con más déficit. Un óptimo global (asignación húngara) no se explica
en un pitch y con decenas de unidades la diferencia son minutos, no vidas.

**Ruta real para C→D.** Se usa haversine con 22 km/h efectivos, no Mapbox.
Reposicionar no justifica gastar llamadas a la Matrix API, que además tiene un
límite de 9 destinos por llamada.

---

## ⚖️ La línea con el CRUE, otra vez

Esto **no despacha ambulancias a emergencias**. Eso es función del CRUE
(Res. 1220/2010) y no se le puede quitar.

Lo que hace es **reposicionar unidades libres y mostrar dónde quedan los
huecos**. La salida de `/v1/cobertura` es una **propuesta**, y `descubiertas`
es información que hoy nadie tiene.

Si alguien pregunta en el pitch: *"PULSO propone, el CRUE regula"* sigue
siendo cierto — pero **sólo mientras la salida sea una propuesta**. En el
momento en que el sistema mueva flota por su cuenta, esa respuesta deja de
servir. Es una línea que conviene no cruzar sin hablarlo.
