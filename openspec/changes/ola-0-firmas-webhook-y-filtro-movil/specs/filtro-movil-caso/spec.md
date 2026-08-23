# Filtro de Compatibilidad Movil-Caso — Especificacion

## Purpose

`movilCompatible()` se evalua hoy dentro del bucle por sede de `ScoringService`, aunque la
compatibilidad movil-paciente no depende de la sede. `RoutingService.match()` ya escala un ranking
vacio a `PULSO_NO_ELIGIBLE_DESTINATION` (regla 3 de `AGENTS.md` ya se cumple); el defecto real es
de **atribucion**: una condicion del caso se pinta como si fuera un defecto de cada hospital. Esta
capacidad mueve la compatibilidad movil-paciente a una precondicion de caso, evaluada una sola vez,
y la separa del filtro por sede.

## Fuera de alcance

- Unificar el filtro duro completo de `ScoringService` dentro de `evaluateEligibility()` (queda
  como trabajo futuro; `evaluateEligibility()` no devuelve hoy el detalle por servicio que el
  paramedico ve en `Candidato.motivoDescarte`).
- Espejar `PulsoCode` / `CodigoError` en `apps/frontend/lib/types.ts` (tarea 0.7;
  `scripts/verificar-tipos.mts:74` tolera explicitamente el hueco).

## Requirements

### Requirement: Compatibilidad movil-paciente evaluada una vez a nivel de caso

El sistema MUST evaluar `movilCompatible(caso.tipoMovil, caso.requiereMedicoABordo)` exactamente
una vez por caso, fuera del bucle por sede de `ScoringService`, no una vez por sede candidata.

#### Scenario: Movil incompatible con el caso produce un error de caso
- GIVEN un caso que requiere movil TAM (`requiereMedicoABordo == true`) despachado con un movil TAB
- WHEN el sistema evalua la elegibilidad del caso
- THEN se lanza `PulsoError('PULSO_MOVIL_INCOMPATIBLE', ...)` antes de rankear las sedes
- AND el bucle de scoring por sede no se ejecuta para este caso

#### Scenario: Movil compatible permite continuar con el ranking normal
- GIVEN un caso cuyo movil es compatible con el tipo requerido
- WHEN el sistema evalua la elegibilidad del caso
- THEN el flujo continua al ranking por sede sin lanzar `PULSO_MOVIL_INCOMPATIBLE`

### Requirement: El detalle del error identifica el hecho del caso, no de la sede

Cuando se lanza `PULSO_MOVIL_INCOMPATIBLE`, el campo `detalle` MUST indicar que movil fue
despachado y que tipo requiere el caso (ejemplo: "Este paciente requiere TAM y AMB-014 es TAB").
El `detalle` MUST NOT contener PII (`textoCrudo`, `origen` ni datos identificables del paciente).

#### Scenario: El detalle nombra el movil y el tipo requerido
- GIVEN un caso TAM despachado con el movil AMB-014, de tipo TAB
- WHEN se lanza `PULSO_MOVIL_INCOMPATIBLE`
- THEN `detalle` incluye el identificador del movil y el tipo requerido por el caso

#### Scenario: El detalle no incluye PII
- GIVEN un caso con `textoCrudo` u `origen` presentes en su estado
- WHEN se lanza `PULSO_MOVIL_INCOMPATIBLE`
- THEN `detalle` no contiene `textoCrudo`, `origen` ni ningun otro campo de PII

### Requirement: Ninguna sede recibe motivoDescarte por una condicion del caso

Cuando el sistema detecta una incompatibilidad movil-caso, ninguna sede candidata MUST recibir un
`Candidato.motivoDescarte` relacionado con esa incompatibilidad. La incompatibilidad MUST
representarse como un error de caso, no distribuida entre las sedes evaluadas.

#### Scenario: Caso TAM con movil TAB no genera motivoDescarte por sede
- GIVEN un caso TAM despachado con un movil TAB y N sedes candidatas
- WHEN el sistema procesa el caso
- THEN ninguna de las N sedes recibe `motivoDescarte` por incompatibilidad de movil

#### Scenario: Un descarte por sede real no se ve afectado
- GIVEN un caso con movil compatible y una sede sin disponibilidad
- WHEN el sistema rankea las sedes
- THEN esa sede recibe su propio `motivoDescarte` por la razon real, sin relacion con el movil

### Requirement: PULSO_MOVIL_INCOMPATIBLE es un codigo de error valido en ambos contratos

El sistema MUST agregar `PULSO_MOVIL_INCOMPATIBLE` a la union `PulsoCode` en
`apps/backend/core/src/contracts/types.ts` y a la union `CodigoError` en
`apps/frontend/lib/api.ts`.

#### Scenario: El codigo compila en ambos lados
- GIVEN el codigo `PULSO_MOVIL_INCOMPATIBLE` agregado a `PulsoCode` y a `CodigoError`
- WHEN se ejecuta `tsc --noEmit` en `core` y en `frontend`
- THEN ambos compilan sin errores relacionados con este codigo

### Requirement: El frontend ofrece un guion estable para el codigo nuevo

El sistema MUST agregar una entrada para `PULSO_MOVIL_INCOMPATIBLE` en
`GUION: Record<CodigoError, Guion>` de `RevisionRequerida.tsx`, con instrucciones estables sobre
que hacer (ejemplo: "Solicita movil medicalizado o escala al CRUE"). Esta adicion MUST NOT requerir
cambios en `campo/page.tsx`.

#### Scenario: RevisionRequerida combina el hecho del caso y la instruccion estable
- GIVEN un error con `codigo == "PULSO_MOVIL_INCOMPATIBLE"` y `detalle` con el hecho del caso
- WHEN `RevisionRequerida` renderiza el error
- THEN muestra `{codigo} · {detalle}` junto con la instruccion de `GUION[PULSO_MOVIL_INCOMPATIBLE]`

#### Scenario: Falta una entrada en GUION rompe la compilacion
- GIVEN `PULSO_MOVIL_INCOMPATIBLE` agregado a `CodigoError` sin su entrada en `GUION`
- WHEN se ejecuta `tsc --noEmit` en `frontend`
- THEN falla, porque `Record<CodigoError, Guion>` exige todas las claves

### Requirement: evaluateEligibility conectado sin el filtro de camas, sin cambiar su comportamiento por defecto

El sistema MUST invocar `evaluateEligibility()` desde `ScoringService` con el filtro de
disponibilidad de camas desactivado para esa ruta de llamada. El comportamiento por defecto de
`evaluateEligibility()` (sin opt-out explicito) MUST permanecer sin cambios: `NO_AVAILABLE_BED`
MUST seguir reportandose por defecto cuando no hay camas disponibles.

#### Scenario: ScoringService omite el filtro de camas
- GIVEN una sede sin camas disponibles segun el snapshot 2022-11-30, que hoy si recibe pacientes
- WHEN `ScoringService` invoca `evaluateEligibility()` para esa sede
- THEN esa llamada no reporta `NO_AVAILABLE_BED` para la sede

#### Scenario: El comportamiento por defecto no cambia
- GIVEN una llamada a `evaluateEligibility()` sin optar por desactivar el filtro de camas
- WHEN la sede evaluada no tiene camas disponibles
- THEN `evaluateEligibility()` sigue reportando `NO_AVAILABLE_BED`, igual que hoy
