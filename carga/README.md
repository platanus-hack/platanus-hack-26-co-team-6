# `carga/` — prueba de carga con k6 (tarea 5.7)

> **Lee esto primero.** Los numeros que produce este harness **no significan
> nada todavia**, y no es una forma de hablar: ver [Por que hoy no
> cuentan](#por-que-hoy-estos-numeros-no-cuentan).

Los SLOs del [plan maestro §7.1](../docs/pulso-produccion-plan-maestro.md#71-slos--lo-que-se-promete-y-se-mide)
—ranking p95 < 8 s, ciclo completo p50 < 90 s— **estan prometidos y no estan
medidos**. Un numero prometido y no medido es una opinion. Esto los mide, y
falla solo cuando no se cumplen.

---

## Por que hoy estos numeros no cuentan

**La tarea [1.2](../docs/tareas/neid.md#12--persistir-caso-y-handshake) no esta
hecha.** El estado de core —casos, handshakes, historial por sede— vive en un
`Map` en RAM (`apps/backend/core/src/almacen/almacen.service.ts`). Un `Map` no
tiene pool de conexiones, ni transacciones, ni indices, ni contencion de
escritura, ni `SET LOCAL`. Medir eso es medir la velocidad de V8.

Y no es solo que los numeros salgan bonitos: **es que salen bonitos justo en la
parte que va a doler.** El p95 de `/match` con 84 sedes en un array es
irrelevante; el p95 de `/match` con 84 sedes detras de PostGIS y un pooler es
la pregunta.

Por eso:

- `lib/preflight.js` consulta `GET /capacidades` al arrancar y **avisa en
  pantalla** antes de la primera peticion.
- El umbral `pulso_corrida_concluyente == 1` pone la corrida **en rojo** si no
  se puede concluir. Se apaga a mano con `CARGA_PERMITIR_MEMORIA=true`, y
  apagarlo queda escrito en el comando.
- [`RESULTADOS.md`](RESULTADOS.md) tiene la casilla "concluyente" y hoy dice que no.

> **Lo que hace falta de 1.2 para que esto sirva:** ademas de persistir, un
> campo nuevo y **opcional** en `Capacidades` del estilo
> `estado?: 'postgres' | 'memoria'`. Hoy `GET /capacidades` solo dice
> `datos: 'supabase' | 'semillas'`, que habla del **catalogo de sedes**, no del
> almacen de casos — el harness lo usa como proxy y lo dice cada vez. Ese campo
> toca `contracts/types.ts` y su espejo, asi que le corresponde al dueño de
> tipos de la ola, no a esta tarea.

---

## Los SLOs, tal como los promete el §7.1

| # | Indicador | Objetivo | Metrica de k6 | Que la mide |
|---|---|---|---|---|
| 1 | Dictado → ranking en pantalla | **p95 < 8 s** | `pulso_dictado_a_ranking_ms` | `POST /triage` + `POST /match` |
| 2 | Ranking → handshake entregado | **p95 < 3 s** | `pulso_ranking_a_handshake_ms` | `POST /dispatch` |
| 3 | Ciclo completo dictado → aceptacion | **p50 < 90 s** | `pulso_ciclo_completo_ms` | los cuatro pasos seguidos |
| 4 | Webhook de entrada respondido | **p99 < 3 s** | `pulso_etapa_respond_ms` | `POST /handshake/respond` † |
| 5 | Disponibilidad de `POST /triage` | **99.5 %** | `pulso_triage_disponible` | fraccion de 2xx |
| 6 | Escalados al CRUE por falla tecnica | **< 1 %** | `pulso_escalado_falla_tecnica` | 5xx / red caida / `PULSO_INTERNAL` |

† **El webhook de verdad no pasa por core.** Entra por `apps/services/voz` y esa
mitad la mide la [tarea 0.3](../docs/tareas/neid.md#03--responder-el-webhook-en--3-s).
Lo que mide esta prueba es el **tramo en core** del camino que dispara el
webhook de Telegram: `POST /handshake/respond`. Decir otra cosa seria reportar
un SLO que no se esta midiendo.

La fuente unica de estos numeros es [`slos.js`](slos.js). No se copian a ningun
otro archivo.

### p50 / p95 / p99, y la diferencia entre incumplir y tener cola

El §7.1 nombra **un** percentil por fila. La tarea pide los tres. Se resuelve
asi, y el resumen los imprime por separado:

- **`slo`** — el percentil textual del §7.1. Rojo aqui = **PULSO incumple lo que
  promete**.
- **`implicada`** — cota que se *deduce* de un SLO. Ej: `p95(/triage) < 8 s`,
  porque `/triage` es sumando de dictado→ranking y si un sumando ya se come el
  techo, la suma tambien. Es aritmetica, no una promesa nueva.
- **`cota`** — presupuesto de cola en un percentil que el §7.1 **no** promete
  (p99 donde el doc promete p95). Es mas estricto que la promesa, a proposito.
  **Si lo unico rojo de una corrida son cotas, el SLO se cumplio** — el resumen
  lo dice con esas palabras. Se apagan con `CARGA_SOLO_SLO=true`.

Nada mas en este directorio lleva un numero sin procedencia escrita al lado.

---

## Como se corre

**Nada de esto se ha ejecutado todavia**: k6 no esta instalado en este entorno
(`which k6` → nada) y no hay Postgres corriendo. Lo de abajo es el
procedimiento, no un registro de algo que paso.

### 0. k6

```bash
# https://grafana.com/docs/k6/latest/set-up/install-k6/
sudo gpg -k && sudo gpg --no-default-keyring \
  --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
k6 version   # anotar la version en RESULTADOS.md: el motor de percentiles es parte del resultado
```

### 1. El doble de ai-core

```bash
node carga/mock-ai-core.mjs      # queda escuchando en :8000
```

### 2. Core, en modo degradado

En una terminal aparte, **sin** `ANTHROPIC_API_KEY`, **sin** `MAPBOX_TOKEN` y
**sin** `TELEGRAM_BOT_TOKEN` / `WHATSAPP_TOKEN`:

```bash
cd apps/backend/core
OPERADOR_PASSWORD=carga-local \
SESION_SECRET=$(openssl rand -hex 32) \
AI_CORE_BASE_URL=http://localhost:8000 \
HANDSHAKE_TIMEOUT_S=20 \
PORT=3001 pnpm start
```

### 3. Los tres escenarios

```bash
cd /ruta/al/repo          # los resultados se escriben en carga/resultados/

CARGA_PASSWORD=carga-local CARGA_COMMIT=$(git rev-parse --short HEAD) \
  k6 run carga/escenario-ciclo.js

CARGA_PASSWORD=carga-local CARGA_COMMIT=$(git rev-parse --short HEAD) \
  k6 run carga/escenario-vigilante.js

CARGA_PASSWORD=carga-local CARGA_COMMIT=$(git rev-parse --short HEAD) \
  k6 run carga/escenario-fuga-inquilino.js
```

Cada uno deja `carga/resultados/<escenario>-resumen.txt` (lo que se lee) y
`-crudo.json` (lo que se archiva). Ese directorio esta en `.gitignore`.

### Variables

| Variable | Default | Que hace |
|---|---|---|
| `CARGA_BASE` | `http://localhost:3001` | donde vive core |
| `CARGA_PASSWORD` | — | la de `OPERADOR_PASSWORD`. **Siempre por entorno**, nunca por argumento |
| `CARGA_VUS` | `50` | usuarios virtuales del escenario principal |
| `CARGA_DURACION` | `5m` | tiempo **sostenido** (mas 30 s de rampa y 15 s de bajada) |
| `CARGA_ESPERA_HOSPITAL_S` | `0` | espera simulada del jefe de urgencias |
| `CARGA_PIENSA_S` | `1` | pausa entre ciclos de un mismo VU |
| `CARGA_INQUILINOS` | — | JSON con las credenciales de dos o mas inquilinos |
| `CARGA_COMMIT` | — | version que queda escrita en el reporte |
| `CARGA_SOLO_SLO` | `false` | apaga los presupuestos de cola |
| `CARGA_PERMITIR_MEMORIA` | `false` | acepta una corrida no concluyente |
| `CARGA_ACEPTO_COSTO` | `false` | deja correr contra Claude / Mapbox / un canal real |
| `CARGA_ACEPTO_HEURISTICA` | `false` | deja correr en modo heuristico (todo 400) |

---

## Sin llamar a Claude ni a Mapbox de verdad

Tres razones, en orden de importancia: **cuesta dinero**, **mide a otro** (la
latencia de Anthropic no es un SLO de PULSO) y **le escribe a un humano** (50
VUs por 5 minutos son miles de mensajes al celular del jefe de urgencias del
demo).

La forma de evitarlo **no es un mock nuevo dentro de core**, sino la regla 2 del
repo — todo degrada sin credencial:

| Pieza | Como se apaga | En que cae |
|---|---|---|
| Mapbox | no poner `MAPBOX_TOKEN` | ETA por distancia, 22 km/h (`eta.service.ts`) |
| Telegram / WhatsApp | no poner sus tokens | la tarjeta se imprime en el log (`canal: 'consola'`) |
| Supabase | no poner sus llaves | 84 sedes semilla |
| Claude | no poner `ANTHROPIC_API_KEY` | ⚠️ **ver abajo** |

`lib/preflight.js` verifica las cuatro con `GET /capacidades` y **aborta** si
alguna esta viva, salvo que se le pase `CARGA_ACEPTO_COSTO=true`.

### La trampa: en modo degradado `/triage` responde 400 el 100% de las veces

Este harness la encontro escribiendola, y es un hallazgo que vale mas que
cualquier percentil de esta corrida:

1. Sin `ANTHROPIC_API_KEY`, `TriageService` cae a `extraccionHeuristica()`, que
   devuelve **`confianza: 0.35` fijo** (`triage-heuristico.ts`).
2. `TriageController` llama a `RoutingService.assess()` → `classifyClinicalTriage()`,
   que **rechaza todo lo que baje de 0.5** (`routing/clinical-policy.ts`).
3. El controlador lanza `PULSO_LOW_CONFIDENCE` → **400**.

O sea: **en modo degradado puro, `POST /triage` no deja pasar un solo caso.** El
contrato dice "Nunca devuelve error por falta de credencial"
([`contrato-api.md`](../docs/contrato-api.md)) y la regla 2 del repo dice que la
degradacion no se arregla porque *es* la regla. Hoy las dos cosas chocan con la
puerta clinica, y **eso no lo decide esta tarea**: se reporta. (Ver
[Lo que hace falta de otros](#lo-que-hace-falta-de-otros).)

Mientras tanto, el harness usa **la costura que core ya tiene**:
`AI_CORE_BASE_URL`. [`mock-ai-core.mjs`](mock-ai-core.mjs) es un ai-core falso
—Node puro, sin dependencias— que devuelve una extraccion coherente con
`confianza: 0.72` tras dormir la latencia configurada. Core lo llama por el
mismo cliente con el que llamaria al de verdad. Y se identifica como
`ai-core-falso-de-carga` en `GET /health`, que core republica en
`GET /health/ai-core`, **para que el preflight pueda distinguirlo de un ai-core
real** y abortar si alguien esta a punto de gastar plata sin querer.

### De donde sale la latencia del doble

De [`latencias-medidas.json`](latencias-medidas.json), y ese archivo dice de
donde salio cada numero:

- **Hoy:** `estado: "sin-calibrar"`. La banda es 4–8 s, y sale del **plan
  maestro §4.1, regla 3**: *"Hoy `_registrar_caso` hace triage + match +
  dispatch dentro del request: eso es 4-8 segundos con Claude"*. Como en modo
  degradado match y dispatch son milisegundos, casi todo ese tiempo es el LLM.
  Es una **cota superior razonada, no una medicion**, y el doble lo grita al
  arrancar y lo lleva en su nombre de servicio (`(sin-calibrar)`).
- **Cuando se calibre:** `node carga/calibrar.mjs` hace 10 llamadas reales
  contra un core con credenciales, guarda las muestras de
  `TriageResponse.latenciaMs` —que ya viaja en el contrato, no hace falta
  instrumentar nada— y el doble pasa a sortear de esa distribucion (bootstrap,
  que conserva la cola). Exige `CALIBRAR_ACEPTO_COSTO=true` y se **niega** a
  calibrar contra un core degradado.

`/match` no necesita doble: su unica dependencia externa es Mapbox y sin token
el ETA se calcula por haversine dentro del proceso.

---

## Los tres escenarios

### `escenario-ciclo.js` — el principal

50 VUs, 5 minutos, ciclo completo con la respuesta del hospital simulada. Cada
peticion va **etiquetada** (`etapa: triage|match|dispatch|respond|estado`), asi
que el resumen puede decir **cual es el cuello de botella, con nombre**: la
etapa con el p95 mas alto, cuanto pesa dentro del ciclo y a que ruta
corresponde. Si lo que falla es la puerta clinica y no la latencia, lo dice asi:
*"el cuello de botella es la puerta clinica, no la latencia"*.

**Sobre el SLO del ciclo completo:** los 90 s del §7.1 incluyen el tiempo que
tarda un **humano** en apretar "aceptar". Esta prueba no tiene humano.
`CARGA_ESPERA_HOSPITAL_S` es `0` por defecto —poner ahi un numero inventado
seria peor que no ponerlo— asi que se registran **dos** metricas:
`pulso_ciclo_completo_ms` (con la espera que se haya configurado) y
`pulso_ciclo_maquina_ms` (sin ella). El resumen dice siempre con que espera se
corrio. Con espera 0, el p50 < 90 s se cumple casi por construccion: **eso no es
haber medido el SLO**.

### `escenario-vigilante.js` — 50 handshakes vivos

50 VUs despachan a la vez y **ninguno responde**.
[`VigilanteService`](../apps/backend/core/src/vigilante/vigilante.service.ts)
tiene que vencerlos, registrar el silencio como rechazo y re-rutear —o escalar
al CRUE— los 50 en la misma pasada.

Se mide `respondidoEn - expiraEn`, **los dos sellados por el servidor**, asi que
el numero no depende de cada cuanto haga polling la prueba. El presupuesto
(p95 < 10 s, p99 < 15 s) **no sale del §7.1** —ahi no hay fila para esto— sino
del codigo: `CADA_MS = 5_000`, o sea dos y tres barridos. Dos umbrales mas, y
son de comportamiento, no de latencia:

- `pulso_vigilante_vencio == 1` — el estado `timeout` "existia en el tipo y
  nadie lo escribia nunca"; que siga escribiendose.
- `pulso_vigilante_siguio_solo == 1` — vencer sin recoger el caso es peor que no
  vencer. **Un caso que vence y nadie recoge es un paciente en la camilla sin
  destino**, y por eso el umbral es 1 y no 0.99.

### `escenario-fuga-inquilino.js` — caso limite 18

De [`multitenancy-y-autenticacion.md §6.1`](../docs/multitenancy-y-autenticacion.md):
*"`SET LOCAL`, nunca `SET`. Con un pooler, un `SET` plano filtra el contexto de
un inquilino al siguiente request. **Solo aparece bajo concurrencia**, que es
cuando peor duele."* Y del checklist §9: *"`SET LOCAL` dentro de transaccion,
**con test de concurrencia**"*. Este es ese test.

Un `SET` plano es **correcto** con una sola conexion: la prueba unitaria pasa.
El bug solo existe cuando dos inquilinos se turnan la misma conexion del pool.
Por eso vive aqui y no en un `.spec.ts`.

Cada VU alterna de inquilino **en cada iteracion**, marca sus casos en
`unidad.id` y hace tres comprobaciones:

1. `GET /estado` no puede traer un caso con la marca de otro inquilino.
2. `GET /estado?casoId=<cebo ajeno>` tiene que venir vacio (caso limite 16:
   *"UUID v4 ayuda, no autoriza"*).
3. Y su **propio** cebo tiene que verse — sin esto, un endpoint que no devuelve
   nada a nadie pasaria las dos primeras y el verde seria falso.

`unidad.id` es la marca porque es el unico campo que el cliente controla, que
sobrevive a `despojar()` y que **no es PII**: es una placa de movil inventada.
Marcar con `textoCrudo` seria imposible, y esta bien que lo sea.

> **Hoy este escenario falla, y es correcto que falle.** Core tiene UNA
> contraseña compartida (tarea 1.3) y no existe `organizacion_id` (1.1 y 1.5).
> Sin dos inquilinos reales, la prueba no puede distinguir "no hay fuga" de "no
> hay inquilinos": `pulso_inquilinato_evaluable == 1` se pone rojo. **Verde
> aqui, hoy, seria mentira.** Cuando 1.3 aterrice:
> `CARGA_INQUILINOS='[{"marca":"a","password":"..."},{"marca":"b","password":"..."}]'`.

---

## En CI

[`.github/workflows/carga.yml`](../.github/workflows/carga.yml). **Solo bajo
etiqueta**: se dispara poniendole la etiqueta `carga` a un PR, o a mano desde
Actions. En cada push no: dura minutos y su resultado es un juicio sobre el
despliegue, no sobre el diff — y un job lento en cada PR se ignora a la semana.

El job levanta el doble de ai-core y core en modo degradado, corre los tres
escenarios, sube `carga/resultados/` como artefacto y escribe el resumen en la
pestaña del job **con el aviso de 1.2 arriba del todo**.

Dos cosas marcadas para borrar cuando corresponda, las dos comentadas en el YAML:
`CARGA_PERMITIR_MEMORIA=true` (se va con 1.2) y el `continue-on-error` del
escenario de fuga (se va con 1.3 + 1.5).

---

## Lo que hace falta de otros

| De quien | Que | Por que bloquea |
|---|---|---|
| **1.2 · Neid** | persistir `caso` y `handshake` en Postgres | sin esto la prueba mide un `Map` en RAM |
| **1.2 · Neid** | campo opcional `estado?: 'postgres' \| 'memoria'` en `Capacidades` | hoy el preflight usa `datos` como proxy y tiene que decir que es un proxy |
| **1.5 · Zaid** | `enContextoDe()` con `SET LOCAL` + RLS | es lo que el escenario 3 existe para probar |
| **1.3 · Sebas** | sesion con actor real | sin dos inquilinos, la prueba de fuga no puede concluir |
| **5.6 · Zaid** | `docker compose` con los tres servicios + Postgres + Redis | hoy hay que levantar core a mano; ese compose es la forma de correr esto contra algo parecido a produccion, y el workflow deberia usarlo en vez de compilar core a pelo |
| **0.5 · Neid** | un solo prompt clinico | el doble de ai-core espeja las extracciones a mano; con un prompt unico podria derivarse de la misma fuente |
| **Quien decida** | que hace `/triage` con `confianza < 0.5` en modo degradado | hoy responde 400 siempre y el contrato dice que nunca falla por falta de credencial |

## Lo que habria que agregar al `Taskfile.yml`

No se toca desde esta tarea (es archivo compartido). La tarea seria:

```yaml
  carga:
    desc: Prueba de carga con k6 contra los SLOs del plan maestro §7.1.
    # Necesita k6 y core corriendo. Ver carga/README.md — y ojo: hasta la
    # tarea 1.2 estos numeros no miden el sistema que se despliega.
    cmds:
      - k6 run carga/escenario-ciclo.js
      - k6 run carga/escenario-vigilante.js
      - k6 run carga/escenario-fuga-inquilino.js

  carga:doble:
    desc: Levanta el doble de ai-core que usa la prueba de carga (:8000).
    cmds:
      - node carga/mock-ai-core.mjs
```
