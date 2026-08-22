# PULSO — Catálogo de validaciones de negocio del backend

> Especificación de reglas que el backend debe hacer cumplir, más allá de la validación
> de tipos/formatos. Cada regla indica **qué valida**, **por qué importa** y **qué hacer
> cuando falla**. El principio rector: PULSO es un sistema de *soporte a la decisión*, no un
> despachador autónomo — ninguna acción con consecuencia clínica o legal ocurre sin
> confirmación humana y sin quedar auditada.

---

## 0. Principios transversales (aplican a todo el sistema)

- **Fail-safe, no fail-open.** Ante duda, ambigüedad o falla de un servicio externo, el sistema
  degrada hacia "escalar a un humano / al CRUE", nunca hacia "asignar automáticamente". Un
  falso positivo silencioso en salud mata.
- **Human-in-the-loop obligatorio.** El sistema *sugiere y rankea*; el clínico remisor confirma el
  despacho y el jefe de urgencias confirma la recepción. El backend rechaza cualquier intento de
  auto-despacho sin confirmación humana registrada.
- **Todo es auditable.** Toda decisión (score calculado, destino sugerido, aceptación, rechazo,
  escalamiento, override del CRUE) escribe un registro inmutable *append-only* (solo se agrega,
  nunca se edita ni borra) con actor, timestamp, versión del modelo e inputs.
- **Idempotencia en toda mutación.** Toda petición que cambia estado lleva una *idempotency key*
  (clave que garantiza que reenviar la misma petición no produzca un efecto duplicado). Reintentos
  por mala conectividad de la ambulancia son la norma, no la excepción.
- **Minimización de datos.** Solo se transmiten los "datos clínicos relevantes" mínimos para la
  continuidad de la atención (base legal: Ley 2015 de 2020 + excepción de urgencias). Nunca la
  historia clínica completa.

---

## 1. Ingesta clínica — validación de la salida del LLM (voz/texto → JSON estructurado)

Este es el punto más peligroso: un modelo de lenguaje puede *alucinar* (inventar con seguridad
datos falsos). Aquí el backend no confía en el LLM; lo audita.

1.1 **Código CIE-10 existente.** El código diagnóstico (`I21.1`, etc.) debe existir en el catálogo
oficial CIE-10 cargado en base de datos. Un código con formato válido pero inexistente es una
alucinación. → *Falla:* rechazar el código, marcar el caso como "requiere confirmación diagnóstica
manual", no rutear con ese Dx.

1.2 **Umbral de confianza.** Si la confianza del parser está por debajo del umbral configurado
(p. ej. 0.75) en cualquier entidad crítica (diagnóstico, complejidad, servicios), el caso NO avanza a
matching automático: se presenta al clínico para confirmar/corregir. → *Falla:* bloquear ruteo,
forzar revisión humana.

1.3 **Entidades obligatorias presentes.** Deben existir: diagnóstico probable, nivel de complejidad
requerido, y al menos un servicio mandatorio. Sin esto no hay criterio de matching. → *Falla:*
rechazar y solicitar entrada estructurada manual.

1.4 **Coherencia clínica cruzada.** El trío (diagnóstico ↔ servicios requeridos ↔ complejidad) debe
ser internamente consistente contra una tabla de reglas mantenida. Ejemplos: IAM (I21.x) ⇒ exige
Hemodinamia y suele exigir UCI adulto y complejidad III/IV; ACV isquémico (I63.x) ⇒ exige unidad de
ictus/neuro y ventana de trombólisis. Si el LLM extrae "IAM" pero "servicio: pediatría", hay
incoherencia. → *Falla:* marcar inconsistencia, no auto-rutear, mostrar al clínico.

1.5 **Población correcta.** Sexo/edad deben mapear al tipo de servicio correcto (adulto vs.
pediátrico vs. neonatal). Un paciente de 54 años no puede requerir "UCI neonatal". → *Falla:*
rechazar el mapeo de servicio incongruente.

1.6 **Rangos fisiológicos plausibles.** Edad 0–120, y si se capturan signos vitales, rangos
plausibles (FC, TA, SatO₂). Valores fuera de rango sugieren error de transcripción de voz. → *Falla:*
señalar para confirmación, no descartar en silencio.

1.7 **Deduplicación / idempotencia del caso.** Si el mismo remisor envía el mismo paciente en una
ventana corta (mismo device, mismos datos, < N segundos), es un reenvío, no un caso nuevo. → *Falla:*
devolver el caso existente, no crear duplicado que dispare dos ambulancias.

1.8 **Data minimization en el parse.** Descartar del JSON cualquier dato identificable que no sea
necesario para el ruteo (nombre completo, documento) o cifrarlo/tokenizarlo. El motor de matching
opera sobre atributos clínicos, no sobre identidad.

---

## 2. Elegibilidad de la IPS receptora — filtros duros (antes de rankear)

Estas son condiciones binarias: si no se cumplen, la IPS **no entra** al ranking (no se le baja el
puntaje: se descarta). Un error aquí manda una ambulancia a un sitio que legalmente no puede recibir.

2.1 **Servicio habilitado en REPS.** La IPS debe tener el/los servicio(s) mandatorio(s) **habilitados**
en el Registro Especial de Prestadores (REPS), no solo "existentes". Se valida contra el código de
habilitación del servicio. → *Falla:* excluir del conjunto de candidatos.

2.2 **Habilitación vigente.** La habilitación no debe estar suspendida ni vencida a la fecha. → *Falla:*
excluir.

2.3 **Nivel de complejidad suficiente.** El nivel de la IPS (III/IV) debe ser ≥ al requerido por el
caso. Una IPS nivel I no recibe un politraumatismo que exige quirófano. → *Falla:* excluir.

2.4 **Población del servicio correcta.** El servicio habilitado debe ser para la población del paciente
(la capacidad instalada de REPS distingue "Cuidado Intensivo Adulto", "Intensivo Neonatal", etc.).
→ *Falla:* excluir.

2.5 **Dentro del perímetro de acción.** La IPS debe estar dentro del radio/ETA máximo configurado para
el tipo de urgencia (una ventana de trombólisis limita el radio útil). → *Falla:* excluir del ranking
primario; puede pasar a un anillo secundario si no hay candidatos cercanos.

2.6 **No auto-referencia.** La IPS remisora no puede ser también la receptora sugerida. → *Falla:*
excluir la remisora del conjunto.

2.7 **Estado operativo válido.** La IPS no debe estar en estado "no recibir" (cierre temporal,
contingencia declarada, saturación total confirmada por ella misma vía handshake reciente). → *Falla:*
excluir mientras dure el estado.

2.8 **Frescura del dato de REPS.** Si el snapshot de REPS supera la antigüedad máxima aceptable, se
sigue usando pero se baja la confianza global y se marca visiblemente como "dato desactualizado".
→ *Falla:* no bloquear, sí degradar y avisar.

2.9 **Geolocalización resuelta.** La IPS debe tener coordenadas válidas (REPS no las trae nativas: se
geocodifican o se unen con centroides DIVIPOLA). Sin coordenadas no se puede calcular ETA. → *Falla:*
excluir del ranking geográfico o marcar "ubicación aproximada por municipio".

**Invariante:** si tras aplicar todos los filtros duros el conjunto de candidatos es **vacío**, el
sistema NO devuelve una lista vacía en silencio: **escala automáticamente al CRUE** con el motivo
("sin IPS elegible en perímetro para servicio X"). El vacío es un evento, no una respuesta muda.

---

## 3. Scoring y ranking

3.1 **Pesos normalizados.** Los pesos `w1..wn` del score deben sumar 1 (o normalizarse). Un set de
pesos que no suma 1 hace incomparables los puntajes entre casos. → *Falla:* rechazar la configuración
de pesos al cargarla, no en tiempo de request.

3.2 **Componentes en rango [0,1].** Cada componente (ETA, congestión estimada, aceptación histórica)
se normaliza a [0,1] antes de ponderar. → *Falla:* clamp (recortar al rango) y registrar la anomalía.

3.3 **Pesos por patología.** El set de pesos depende del tipo de urgencia (en ACV pesa el tiempo; en
politrauma pesa la complejidad/quirófano). Debe existir un set por perfil y un default seguro. → *Falla:*
usar default y registrar que no había perfil específico.

3.4 **Cold-start de aceptación histórica.** Una IPS sin historial de handshake no puede romper el
cálculo. Se usa un *prior* neutro (p. ej. 0.5) y se marca menor confianza en ese componente. → *Falla
evitada:* nunca dividir por cero ni excluir a una IPS nueva por falta de datos.

3.5 **Congestión siempre etiquetada como estimación.** El componente de congestión lleva su nivel de
confianza y se expone como "estimado", nunca como ocupación real. Prohibido presentar un número de
camas libres como hecho. → *Regla de producto, no solo de datos.*

3.6 **ETA sano.** Rechazar ETAs imposibles (≤ 0, o > umbral absoluto). Un ETA de 0 min o negativo
indica falla del motor de ruteo. → *Falla:* recalcular con fallback (ver §10) o excluir.

3.7 **Desempate determinista.** Ante puntajes iguales, regla de desempate fija y documentada (p. ej.
menor ETA, luego mayor complejidad, luego ID). El ranking no puede ser aleatorio entre requests
idénticos. → *Falla evitada:* reproducibilidad para auditoría.

3.8 **Trazabilidad del score.** Cada candidato rankeado guarda su desglose (valor de cada componente,
pesos, versión del modelo). Es lo que alimenta el panel "¿por qué?" y la auditoría. → *Obligatorio.*

---

## 4. Máquina de estados del caso y del handshake

El caso tiene estados y solo se permiten transiciones válidas. Cualquier transición no listada se
rechaza (previene condiciones de carrera y estados corruptos).

Estados: `creado → estructurado → buscando → esperando_confirmacion →
(aceptado | rechazado | expirado) → despachado → en_ruta → entregado → cerrado`
más `escalado_crue` accesible desde `buscando`, `esperando_confirmacion` y `rechazado`.

4.1 **Transiciones válidas únicamente.** El backend valida (estado_actual, evento) contra la tabla de
transiciones. Ej.: no se puede pasar de `creado` directo a `despachado` sin confirmación. → *Falla:*
rechazar con error de transición ilegal, registrar intento.

4.2 **Timeout del handshake.** Si la IPS no responde en N segundos, el caso transita a `expirado` para
ese candidato y avanza al siguiente según la política (secuencial o fan-out limitado). → *Falla
evitada:* que un caso quede colgado esperando a un hospital que nunca contesta ("paseo de la muerte"
digital).

4.3 **Una sola aceptación autoritativa por caso.** Solo una IPS puede sostener el estado `aceptado`
para un caso. Si dos aceptan casi simultáneamente (fan-out), la primera commit gana; a la segunda se le
responde "caso ya asignado". → *Ver §5, es un problema de concurrencia.*

4.4 **Motivo de rechazo estructurado obligatorio.** Un rechazo exige una razón de un enum controlado
(saturación, sin especialista de turno, sin insumo, fuera de red, etc.). Texto libre opcional adicional.
Esta razón alimenta el modelo. → *Falla:* no aceptar el rechazo sin motivo.

4.5 **No reasignación silenciosa.** Un caso ya `despachado`/`en_ruta` no se reasigna sin generar un
evento de escalamiento y auditoría explícito. → *Falla:* bloquear reasignación directa.

4.6 **Confirmaciones fuera de estado.** Una aceptación/rechazo que llega para un caso ya cerrado o
expirado se ignora idempotentemente y se responde el estado actual (no error 500). → *Robustez.*

---

## 5. Concurrencia e integridad de datos (crítico)

El escenario real más duro: dos ambulancias compitiendo por el último cupo, o reintentos por red
inestable duplicando efectos. Aquí es donde un backend amateur se rompe.

5.1 **Aceptación única bajo carrera.** Garantizar a nivel de base de datos que un caso no pueda quedar
`aceptado` por dos IPS. Implementación recomendada: *concurrencia optimista* (columna `version` que se
verifica y aumenta en cada update; si cambió, el commit falla y se reintenta la lógica) **o** un índice
único parcial (`UNIQUE` sobre caso_id donde estado = 'aceptado') que hace que el segundo insert/aceptación
falle a nivel de motor. → *Falla:* la segunda aceptación recibe "ya asignado", no doble-booking.

5.2 **Reserva blanda con TTL.** Cuando un caso se envía a una IPS pendiente de confirmación, se crea un
*hold* (reserva temporal) con tiempo de vida (TTL). Al expirar el TTL o al rechazar, el hold se libera
automáticamente. Previene que un cupo quede "fantasma-bloqueado". → *Falla evitada:* cupos congelados.

5.3 **Un único ruteo activo por caso.** Un caso no puede tener dos procesos de matching activos al mismo
tiempo (evita disparar dos ambulancias). → *Constraint + estado.*

5.4 **Atomicidad decisión + auditoría.** El cambio de estado del caso y la escritura del registro de
auditoría ocurren en la misma transacción. Si falla el log, se revierte el cambio de estado. Nunca una
decisión sin su rastro. → *Falla:* rollback completo.

5.5 **Idempotencia con clave.** Toda mutación (crear caso, aceptar, rechazar, escalar) exige
idempotency key; una key ya vista devuelve el resultado previo sin re-ejecutar. → *Falla evitada:*
reintentos de la ambulancia con mala señal no duplican efectos.

5.6 **Bloqueo con timeout.** Cualquier bloqueo pesimista (`SELECT ... FOR UPDATE`) lleva timeout para no
colgar la asignación indefinidamente si otra transacción se cuelga. → *Robustez.*

---

## 6. Validaciones geoespaciales (PostGIS)

6.1 **Coordenadas en rango.** Latitud ∈ [-90,90], longitud ∈ [-180,180], y dentro del *bounding box* de
Colombia. Coordenadas (0,0) o fuera de país = geocodificación fallida. → *Falla:* marcar ubicación
inválida, excluir del ranking geográfico.

6.2 **SRID consistente.** Todas las geometrías en el mismo sistema de referencia (p. ej. SRID 4326).
Mezclar SRIDs da distancias absurdas. → *Falla:* rechazar la geometría inconsistente.

6.3 **ETA por ruta real, con fallback.** El ETA se calcula por red vial (OSRM), no por línea recta. Si el
motor de rutas no responde, se usa distancia *haversine* (línea recta sobre la esfera) × factor, marcado
como "ETA aproximado". → *Ver §10.*

6.4 **Perímetro coherente con la urgencia.** El radio máximo depende de la ventana clínica (trombólisis
< X, IAM door-to-balloon < 90 min). No ofrecer destinos fuera de la ventana útil sin marcarlos. → *Regla
clínica en el geofiltro.*

---

## 7. Catálogos y datos de referencia

7.1 **CIE-10 versionado.** El catálogo diagnóstico está versionado y se valida contra él (§1.1). → *Base.*

7.2 **Mapa diagnóstico → servicios requeridos.** Tabla mantenida que traduce un diagnóstico/perfil a los
códigos de servicio REPS mandatorios. Es lógica de negocio, no del LLM; el LLM propone, la tabla decide
qué servicios exigir. → *Falla:* si un diagnóstico no está mapeado, escalar a criterio humano.

7.3 **DIVIPOLA válido.** Códigos de departamento/municipio válidos al unir REPS con geo. → *Falla:*
excluir o marcar.

7.4 **Enum de motivos de rechazo controlado.** Cerrado y versionado, para que el dataset de aceptación
sea consistente en el tiempo. → *Base del moat de datos.*

---

## 8. Autorización y control de acceso (RBAC por actor)

8.1 **Alcance por rol.** Tres roles con vistas distintas: paramédico/remisor (crea y despacha sus
casos), jefe de urgencias de IPS (responde solo solicitudes dirigidas a *su* IPS), regulador CRUE (ve la
red, escala, hace override). Cada uno accede solo a su alcance. → *Falla:* 403.

8.2 **Respuesta atada a la identidad correcta.** Solo el jefe de urgencias autenticado de la IPS
destinataria puede aceptar/rechazar ese caso. Un actor de otra IPS no puede responder por ella. → *Falla:*
rechazar y registrar intento de acción cruzada.

8.3 **Token de confirmación de un solo uso.** El enlace/botón del handshake usa un token firmado, de un
solo uso y con expiración; previene *replay* (reenviar una confirmación antigua). → *Falla:* rechazar
token usado/expirado.

8.4 **Jerarquía de autoridad.** El override del CRUE está por encima del ranking automático (el CRUE
tiene la potestad legal de regular). El sistema lo permite pero lo audita con actor y justificación.
→ *Modela la realidad legal.*

---

## 9. Cumplimiento legal y datos sensibles

9.1 **Base legal por transmisión.** Cada envío de datos clínicos registra su base jurídica (urgencia /
continuidad de atención bajo Ley 2015 de 2020). → *Auditoría legal.*

9.2 **Datos sensibles cifrados.** Los datos clínicos son *datos sensibles* (Ley 1581 de 2012 – Habeas
Data): cifrado en reposo y en tránsito. Nunca PII (información personal identificable) en URLs, query
strings ni logs. → *Falla de diseño si aparece PII en un log.*

9.3 **Auditoría inmutable append-only.** El log de decisiones no se edita ni borra; correcciones son
nuevos eventos. → *Integridad forense.*

9.4 **Retención y anonimización.** Política de retención: los datos identificables se purgan/anonimizan
tras el cierre del caso + ventana legal; el dataset de aprendizaje (aceptación/rechazo) se conserva
disociado de la identidad del paciente. → *Privacidad + moat sin PII.*

9.5 **Consentimiento por excepción de urgencia.** En urgencia no se exige autorización previa, pero el
sistema deja constancia de que operó bajo esa excepción. → *Trazabilidad.*

---

## 10. Resiliencia y degradación de servicios externos

Regla: ninguna dependencia externa caída puede tumbar la asignación; degrada con aviso.

10.1 **Motor de rutas (OSRM/Mapbox) caído.** Fallback a distancia haversine × factor, ETA marcado como
aproximado. → *Degrada, no bloquea.*

10.2 **API de REPS caída.** Usar el último *snapshot* cacheado con marca de antigüedad. El sistema no
depende de REPS en vivo por request; opera sobre un espejo local refrescado. → *Diseño: cachear REPS,
no consultarlo en caliente.*

10.3 **LLM caído o baja confianza.** Forzar entrada clínica estructurada manual (formulario mínimo). El
ruteo nunca depende exclusivamente del LLM. → *Fallback humano.*

10.4 **Timeouts y circuit breakers.** Toda llamada externa con timeout y cortacircuitos (deja de llamar a
un servicio que falla repetidamente y usa el fallback). → *Estabilidad.*

10.5 **Rate limiting.** Límite por actor/dispositivo para prevenir abuso y tormentas de reintentos. →
*Protección.*

---

## 11. Observabilidad y auditoría operativa

11.1 **Registro completo por decisión.** Inputs, candidatos, desglose de score, versión de modelo,
resultado. → *Reproducibilidad.*

11.2 **Métricas de negocio.** Tiempo de coordinación, tasa de aceptación por IPS/hora/patología, casos
escalados al CRUE, casos sin candidato. Son también el termómetro del producto para el pitch. →
*Producto + operación.*

11.3 **Alertas.** Disparar alerta operativa cuando un caso lleva demasiado tiempo sin destino o cuando
una zona entra en saturación generalizada. → *Seguridad del paciente.*

---

## 12. Convención de errores (para respuestas de API)

Espacio de nombres por dominio, para que el front y la app de campo reaccionen distinto según el tipo:

- `PULSO-CLIN-*` — ingesta/parsing clínico (ej. `CLIN-001` código CIE-10 inexistente,
  `CLIN-002` confianza insuficiente, `CLIN-003` incoherencia diagnóstico-servicio).
- `PULSO-MATCH-*` — elegibilidad/ranking (ej. `MATCH-001` sin candidatos → escalar CRUE,
  `MATCH-002` servicio no habilitado, `MATCH-003` complejidad insuficiente).
- `PULSO-STATE-*` — máquina de estados (ej. `STATE-001` transición ilegal, `STATE-002` caso ya
  asignado, `STATE-003` handshake expirado).
- `PULSO-AUTH-*` — autorización (ej. `AUTH-001` fuera de alcance, `AUTH-002` token de un solo uso
  ya usado).
- `PULSO-DATA-*` — integridad/concurrencia (ej. `DATA-001` conflicto de versión, reintentar;
  `DATA-002` idempotency key duplicada).
- `PULSO-DEP-*` — dependencias externas degradadas (ej. `DEP-001` ruteo en modo aproximado,
  `DEP-002` REPS desactualizado).

**Regla de oro de las respuestas:** un error clínico o de matching nunca es un 500 genérico; es un
código de negocio que le dice a la app de campo exactamente qué mostrar y si debe escalar al CRUE.
