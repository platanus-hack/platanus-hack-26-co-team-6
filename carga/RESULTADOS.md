# Resultados de la prueba de carga

> # ⛔ SIN EJECUTAR TODAVIA
>
> **Este documento es una plantilla vacia. No hay ni un numero medido aqui, y
> no se pone ninguno hasta que se corra de verdad.**
>
> **Por que no se ha ejecutado:**
>
> 1. **k6 no esta instalado** en el entorno donde se escribio el harness
>    (`which k6` → nada). Se escribieron los scripts y se verifico su sintaxis;
>    no se corrieron.
> 2. **No hay Postgres corriendo** y **la tarea
>    [1.2](../docs/tareas/neid.md#12--persistir-caso-y-handshake) no esta
>    hecha**: el estado de core vive en un `Map` en RAM
>    (`apps/backend/core/src/almacen/`). Correr la prueba hoy mediria la
>    velocidad de V8, no la de PULSO. Es literalmente la trampa que la tarea
>    5.7 nombra: *"Corre esto despues de 1.2, o no significa nada."*
>
> Cuando se corra estando 1.2 en su sitio, se llenan las tablas de abajo **con
> la salida real**, no con estimaciones. Un numero inventado en este archivo es
> peor que la casilla vacia: la casilla vacia no engaña a nadie.

---

## Corrida

| Campo | Valor |
|---|---|
| Fecha (ISO 8601) | _pendiente_ |
| Version (commit) | _pendiente_ — `git rev-parse --short HEAD` |
| Rama | _pendiente_ |
| Version de k6 | _pendiente_ — `k6 version`. Va aqui porque el motor de percentiles es parte del resultado |
| Donde corrio core | _pendiente_ (local / CI / staging) — CPU, RAM, y si compartia maquina con k6 |
| `GET /capacidades` al arrancar | _pendiente_ — `ia`, `ruteo`, `voz`, `canal`, `datos`, `handshakeTimeoutS` |
| Almacen de casos | _pendiente_ — **`Map` en RAM** o Postgres |
| Doble de ai-core | _pendiente_ — `calibrado` / `sin-calibrar`, y la latencia usada |
| VUs · duracion | _pendiente_ |
| `CARGA_ESPERA_HOSPITAL_S` | _pendiente_ — **si es 0, el ciclo completo no incluye tiempo humano y el SLO 3 no esta realmente probado** |
| **¿Corrida concluyente?** | **NO** — ver el bloque de arriba |

---

## Los SLOs del §7.1

Objetivos citados del
[plan maestro §7.1](../docs/pulso-produccion-plan-maestro.md#71-slos--lo-que-se-promete-y-se-mide).
El percentil **en negrita** es el que el documento promete; los otros dos se
reportan igual (presupuesto de cola, ver [README](README.md#p50--p95--p99-y-la-diferencia-entre-incumplir-y-tener-cola)).

| # | Indicador | Objetivo | p50 | p95 | p99 | n | Veredicto |
|---|---|---|---|---|---|---|---|
| 1 | Dictado → ranking en pantalla | **p95 < 8 s** | — | — | — | — | _pendiente_ |
| 2 | Ranking → handshake entregado | **p95 < 3 s** | — | — | — | — | _pendiente_ |
| 3 | Ciclo completo dictado → aceptacion | **p50 < 90 s** | — | — | — | — | _pendiente_ |
| 4 | Webhook respondido (tramo en core) | **p99 < 3 s** | — | — | — | — | _pendiente_ |
| 5 | Disponibilidad de `POST /triage` | **99.5 %** | — | — | — | — | _pendiente_ |
| 6 | Escalados al CRUE por falla tecnica | **< 1 %** | — | — | — | — | _pendiente_ |

> El SLO 4 mide **solo el tramo en core** (`POST /handshake/respond`). El
> webhook de entrada de verdad vive en `apps/services/voz` y lo mide la tarea
> 0.3. Esta tabla no puede decir que ese SLO esta cubierto.

## Por etapa (para encontrar el cuello)

| Etapa | Ruta | p50 | p95 | p99 | n |
|---|---|---|---|---|---|
| triage | `POST /triage` | — | — | — | — |
| match | `POST /match` | — | — | — | — |
| dispatch | `POST /dispatch` | — | — | — | — |
| respond | `POST /handshake/respond` | — | — | — | — |
| estado | `GET /estado` | — | — | — | — |

**Primer cuello de botella:** _pendiente_ — el resumen de k6 lo nombra solo.
Va con su p95 y con el porcentaje que se lleva del ciclo.

**Segundo, si el primero se arregla:** _pendiente_.

---

## Escenario del vigilante — 50 handshakes vivos

| Medida | Objetivo | Resultado |
|---|---|---|
| Atraso sobre `expiraEn` (p95) | < 10 s (2 barridos de `CADA_MS=5s`) | _pendiente_ |
| Atraso sobre `expiraEn` (p99) | < 15 s (3 barridos) | _pendiente_ |
| Handshakes que vencieron | 100 % | _pendiente_ |
| Casos recogidos tras vencer (re-ruteo o escalamiento) | 100 % | _pendiente_ |
| Casos abandonados | 0 | _pendiente_ |
| `GET /estado` con 50 handshakes vivos (p95) | — | _pendiente_ |

---

## Escenario de fuga de inquilino — caso limite 18

| Medida | Objetivo | Resultado |
|---|---|---|
| ¿Habia dos inquilinos que comparar? | si | **NO** — una sola contraseña compartida (tarea 1.3 pendiente) |
| Fugas via `GET /estado` | 0 | _no evaluable_ |
| Fugas via `GET /estado?casoId=` (cebo ajeno) | 0 | _no evaluable_ |
| Lectura del cebo propio (anti falso-verde) | 100 % | _pendiente_ |

> **No evaluable no es lo mismo que cero.** Mientras no existan `organizacion_id`
> (1.1 / 1.5) ni identidad real (1.3), esta prueba no puede afirmar que no hay
> fuga: solo puede afirmar que no hay a quien filtrarle nada. El umbral
> `pulso_inquilinato_evaluable == 1` deja la corrida en rojo a proposito.

---

## Hallazgos

Lo que la prueba encontro **sin haberse ejecutado**, solo por leer el codigo
para escribirla. Se deja aqui porque vale mas que cualquier percentil de una
corrida no concluyente:

1. **En modo degradado puro, `POST /triage` responde 400 el 100% de las veces.**
   Sin `ANTHROPIC_API_KEY` la extraccion cae a la heuristica, que devuelve
   `confianza: 0.35` fijo (`triage-heuristico.ts`); `clinical-policy.ts` rechaza
   todo lo que baje de `0.5`; `TriageController` lanza `PULSO_LOW_CONFIDENCE`.
   El contrato promete que `/triage` *"nunca devuelve error por falta de
   credencial"* y la regla 2 del repo dice que la degradacion no se arregla
   porque **es** la regla. Hoy las dos cosas chocan contra la puerta clinica.
   **Alguien tiene que decidir cual gana** — esta tarea no lo decide, lo reporta.
2. **`GET /capacidades` no dice donde vive el estado de casos.** Dice
   `datos: 'supabase' | 'semillas'`, que habla del catalogo de sedes. El
   harness lo usa como proxy para detectar "1.2 sin hacer" y tiene que avisar
   cada vez de que es un proxy. Con 1.2 deberia llegar un campo opcional
   `estado?: 'postgres' | 'memoria'`.
3. **`/dispatch` solo acepta el candidato que eligio `RoutingService.match()`**
   (la primera no descartada). Despachar a cualquier otro devuelve
   `PULSO_INCOMPLETE_EVIDENCE`. Cualquier cliente que deje al humano elegir
   entre los 5 del ranking —que es justo lo que pinta `/campo`— choca con eso.
   El harness replica el criterio para no medir un error propio, pero la
   friccion es real y no esta en el contrato.

---

## Que hacer con esto

- Si algun SLO sale rojo: **no se toca el umbral**. El umbral es la promesa; lo
  que se cambia es el sistema, o se cambia la promesa en el §7.1 y se explica
  por que.
- Si lo unico rojo son presupuestos de cola (p99 donde el doc promete p95): el
  SLO **se cumplio**. Se anota la cola y se sigue.
- Una corrida no concluyente **no se cita en un pitch**.
