# Neid — 16 tareas

> Carril histórico: IA / LLM, dueño de `ai-core`, el parser clínico, el scoring y los agentes de voz.
> **En este plan rota:** también le tocan persistencia en Postgres, policies de RLS, vistas de afiliación
> en React y la política de retención. **Es dueño de tipos en la ola 3.**

**Ola 0** [0.3](#03--responder-el-webhook-en--3-s) · [0.5](#05--un-solo-prompt-clínico) — **Ola 1** [1.2](#12--persistir-caso-y-handshake) · [1.6](#16--policies-de-rls--caso_acceso) — **Ola 2** [2.2](#22--vista-afiliacion) · [2.6](#26--cola-de-verificación-manual) · [2.10](#210--panelauditoria) — **Ola 3** [3.1](#31--evento_caso--registroservice) · [3.8](#38--vigilante-a-worker-con-lock-distribuido) · [3.12](#312--versionar-el-prompt-clínico) — **Ola 4** [4.2](#42--generador-de-sbar) · [4.7](#47--puertos-declarados-con-mock-honesto) · [4.9](#49--validar-el-rda-contra-la-ig-del-ihce) — **Ola 5** [5.4](#54--métricas-de-negocio) · [5.8](#58--política-de-retención) · [5.12](#512--endurecimiento-final)

---

## 0.3 · Responder el webhook en < 3 s

**Ola 0** · sin dependencias · dominio `voz/app/rutas/whatsapp.py`, `voz/app/despachador.py`

**Qué.** El webhook responde 200 de inmediato y procesa después.

**Por qué.** **Esto probablemente ya es un bug activo en producción.** Meta espera 2xx en ~3 segundos; hoy `_registrar_caso` hace triage + match + dispatch **dentro del request**, y eso es 4-8 segundos con Claude. Meta ya está reintentando y nadie lo ha notado porque no hay métricas. Combinado con la falta de deduplicación (0.4), cada reintento crea un caso más.

**Pasos.**
1. La ruta valida firma (0.2, Zaid) y deduplica (0.4, Juan), encola, y responde `200 {"ok": true}`.
2. El trabajo va a una tarea de fondo. En el corto plazo `BackgroundTasks` de FastAPI; en producción, una cola real.
3. **El paramédico no puede quedarse sin respuesta**: acuse inmediato por WhatsApp ("Copiado, procesando") y luego el destino. Hoy la respuesta es el resultado; con esto son dos mensajes, y eso **mejora** la experiencia — el paramédico sabe que llegó.
4. Si el trabajo de fondo falla, se le dice, con la salida al canal que sí funciona (radio al CRUE).
5. Métrica `pulso_webhook_latencia_ms{proveedor}` con histograma.

**Hecho cuando.**
- [x] p99 de la respuesta del webhook < 1 s
- [x] Un fallo en el procesamiento produce un mensaje al paramédico, no silencio
- [x] La métrica existe y se ve
- [x] Test que simula triage lento y verifica que el 200 sale igual

**Trampas.** Comparte servicio con 0.2 (Zaid). **Tú tocas `rutas/whatsapp.py` y `despachador.py`; él toca `canales/whatsapp.py` y `telefonia/`.** Coordinen quién mergea primero.

### ✅ Hecho — rama `feat/o0-0.3-webhook-3s`

`pulso_webhook_latencia_ms{proveedor}` como histograma, con cortes alrededor
de 1 s y 3 s — sin buckets en el umbral, un histograma no responde la única
pregunta que se le va a hacer. Se mide en **todas** las salidas de la ruta,
incluida la del cuerpo ilegible: si esa rama no midiera, el p99 mentiría por
omisión.

**Los dos mensajes.** El paramédico recibe acuse inmediato y después el
destino:

| Entra | Acuse | Después |
|---|---|---|
| Texto | «Copiado, procesando…» | destino + ubicación |
| Nota de voz | «🎙️ Nota recibida, transcribiendo…» | «Entendí: …» → destino |

**El acuse del audio va ANTES de bajar el media**, y el orden está fijado por
un test. Bajar el media de Meta son dos saltos autenticados más la
transcripción: con el acuse después, el paramédico manda una nota y mira un
chat mudo varios segundos con un paciente al lado.

**El eco del transcript** es la pieza que no estaba en el enunciado y que hace
falta: es la única forma de que un paramédico cace una transcripción mala
**antes** de que salga la ambulancia. En la app el dictado se ve en pantalla;
por WhatsApp, este mensaje *es* la pantalla. Solo se manda cuando la acción es
un caso nuevo — repetirle «ya llegué» llena el chat de ruido justo cuando
menos conviene.

Un acuse que falla no tumba el traslado. Perder el acuse es molesto; perder el
traslado es otra cosa.

---

## ⚠️ Aviso para 0.2 (Zaid) — la firma ya está escrita

**No la escribas desde cero.** `apps/services/voz/app/canales/firma.py` existe
en la rama `feat/cobertura-zonas`, commit `6d988f5`, y **no llegó a main**: el
PR #8 se mezcló antes de ese commit.

Lo que ya tiene, probado con 11 tests:

- HMAC-SHA256 sobre el cuerpo **crudo** — sobre el JSON reserializado no
  cuadra: un espacio o un cambio de orden de claves cambia el hash.
- Las dos cabeceras: `X-Webhook-Signature` (Kapso) y `X-Hub-Signature-256`
  (Meta, con el prefijo `sha256=`).
- Comparación en tiempo constante. Un `==` normal filtra, por lo que tarda en
  fallar, cuántos bytes del prefijo acertaste.
- Sin secreto configurado no verifica **y lo grita en el log**, para que
  «arranca sin configurar» no se vuelva «quedó abierto y nadie lo notó».

Y trae un bug ya cazado que conviene no repetir: el handler del GET se llamaba
`verificar` y **sombreaba** a la función importada del mismo nombre. El POST
llamaba al handler equivocado y descartaba el resultado — el webhook quedaba
sin verificar **pareciendo correcto**.

Rescátalo con `git cherry-pick 6d988f5` y quédate con lo de `canales/` y
`tests/test_firma.py`.

---

## 0.5 · Un solo prompt clínico

**Ola 0** · sin dependencias · dominio `ai-core/app/triage.py`, `core/src/triage/triage.service.ts`, `data/prompts/`

**Qué.** El prompt de extracción clínica existe **dos veces, idéntico carácter por carácter**: Python y TypeScript.

**Por qué.** Tú mismo lo documentaste como deuda con fecha de vencimiento: *"Si tocas el prompt o el catálogo REPS, tócalo en los dos o divergen en silencio."* Dos motores clínicos que discrepan sin que nadie se entere es el bug más caro que este sistema puede tener.

**Pasos.**
1. Extraer a `data/prompts/triage.txt`, con el catálogo REPS interpolado en tiempo de carga (los dos lados ya tienen la lista de códigos).
2. Python lo lee al arrancar; TypeScript lo importa como recurso.
3. **Test que compara los dos prompts renderizados carácter por carácter.** Mientras no se unifiquen del todo, ese test es la red.
4. Aprovechar y numerar la versión — prepara el terreno para 3.12.
5. Igual con el catálogo de servicios REPS, que también está duplicado.

**Hecho cuando.**
- [x] Un solo archivo fuente para el prompt
- [x] El test de igualdad pasa
- [x] Los evals (`uv run python -m evals.run`) siguen dando lo mismo que antes
- [x] Cambiar el prompt en un solo lugar cambia los dos motores

**Trampas.** El TypeScript es el **respaldo** cuando `ai-core` no está. No lo borres todavía: se borra el día que ai-core sea el único camino, y ese día no es hoy.

### ✅ Hecho — rama `feat/o0-0.5-prompt-unico`

| Archivo | Qué es |
|---|---|
| `data/prompts/triage.txt` | El prompt. Fuente única, con `{{CATALOGO_SERVICIOS}}` |
| `data/catalogos/servicios-reps.json` | Los códigos REPS, canónicos |
| `data/prompts/triage.rendered.txt` | El **golden**: el render que los dos motores deben producir |
| `scripts/prompts/render.py` | Regenera el golden |
| `ai-core/app/prompts.py` · `core/src/prompts/` | Los dos cargadores |

**Por qué un golden y no comparar Python contra TypeScript.** Comparar los dos
directamente exigiría levantar ambos runtimes en el mismo test. Con un golden,
cada lado se verifica solo en su propio CI, y si uno se desvía el diff sale en
su suite — no en un job cruzado que nadie mira.

**Verificado que no hay regresión:** reconstruí el prompt viejo desde
`git show main:...triage.py`, lo evalué, y el render nuevo es **idéntico
carácter por carácter**. Los evals siguen dando 4/14 con la heurística.

**La versión sale del contenido** (sha256 del render, 12 caracteres:
`b6b3e3556c87`). Cambiar el prompt cambia la versión sola, sin que nadie tenga
que acordarse de subir un número. Es la mitad de la 3.12 ya puesta.

**El catálogo también era doble** y no lo unifiqué del todo: `servicios_reps.py`
y `servicios-reps.ts` conservan su copia, porque los usan muchos sitios y
cambiarlos es un PR aparte. Lo que sí hay es **un test en cada lado que los
fija contra el JSON**: si alguien agrega un código en un solo lugar, falla. El
día que los dos módulos lean del JSON, esos dos tests se vuelven triviales y
se borran.

**Nota para el despliegue:** los dos servicios leen `data/` en tiempo de
arranque, así que **esa carpeta tiene que viajar en las imágenes de Docker**.
Si no viaja, revientan al arrancar — que es el orden correcto para fallar, pero
conviene saberlo antes del deploy y no durante.

---

## 1.2 · Persistir `caso` y `handshake`

**Ola 1** · depende de `1.1` · dominio `core/src/almacen/`, `core/src/repositorios/` (nuevo)

**Qué.** `AlmacenService` deja de ser un `Map` en RAM.

**Por qué.** **Es el hallazgo más grave de todo el análisis.** Al reiniciar core se pierden: todos los casos, todos los handshakes, todos los escalamientos, el historial aceptados/rechazados por sede, la ventana de rechazos de 6 h y las latencias. Es decir: **el "dataset que se auto-etiqueta" que el README llama el activo del producto vive hoy en la RAM de un proceso, y un `Ctrl+C` lo borra.** Nada de las olas 3, 4 y 5 tiene sentido sin esto.

**Pasos.**
1. Interfaz `RepositorioCasos` / `RepositorioHandshakes` con dos implementaciones — **exactamente el patrón que ya existe en `RoutingStore`** (memoria + Postgres, elegido por variable de entorno). Cópialo, funciona bien.
2. Las tablas ya existen en `0001_init.sql` con sus índices. Agregar `organizacion_id`, `movil_id`, `creado_por`, `paciente_token` (todas nulables por ahora).
3. Migrar `historialSede`, `rechazosEnVentana(6h)` y `latenciasRespuesta` a consultas sobre `handshake`. **Dejan de ser estado y pasan a ser proyecciones** — que es lo que siempre debieron ser.
4. **Sin `DATABASE_URL` sigue funcionando en memoria y lo dice en el log.** Regla del repo, y el `PersistenceModule` ya tiene el patrón exacto.
5. Backfill: los casos previos se asignan a una organización "histórica". **Nunca `organizacion_id` nulo** — bajo RLS, un nulo es invisible o es visible para todos, y las dos opciones son malas.

**Hecho cuando.**
- [ ] Reiniciar core no pierde casos ni handshakes
- [ ] `pAceptacion` sobrevive al reinicio
- [ ] Sin credenciales sigue corriendo en memoria, avisando
- [ ] Los tests existentes de `almacen` pasan contra las dos implementaciones
- [ ] Ninguna fila queda con `organizacion_id` nulo

**Trampas.** `AlmacenService` lo usan ocho servicios. Cambia la implementación **detrás de la misma interfaz** y no toques a los consumidores, o el PR se vuelve inmergeable.

---

## 1.6 · Policies de RLS + `caso_acceso`

**Ola 1** · depende de `1.5` (Zaid) · dominio `supabase/migrations/0005_rls.sql`

**Qué.** Las policies que hacen real el aislamiento entre inquilinos.

**Pasos.**
1. Tabla `caso_acceso` (DDL en [multitenancy §6.2](../multitenancy-y-autenticacion.md#62-el-caso-que-cruza-inquilinos)).
2. Policies sobre `caso`, `evento_caso`, `handshake`, `movil`, `tramite`, `recepcion`:
   ```sql
   create policy caso_alcance on caso for select using (
     organizacion_id = current_setting('pulso.organizacion_id', true)::uuid
     or exists (select 1 from caso_acceso a
                 where a.caso_id = caso.id
                   and a.organizacion_id = current_setting('pulso.organizacion_id', true)::uuid
                   and a.revocado_en is null)
     or current_setting('pulso.rol_red', true) = 'true'
   );
   ```
3. **Al rechazar o vencer un handshake, se revoca la concesión.** Es la pieza no obvia: sin eso, cada hospital al que se le preguntó conserva para siempre la ficha de un paciente que nunca recibió.
4. Las tres tablas del REPS conservan lectura pública — son datos abiertos de MinSalud y no tienen paciente adentro. `0001` ya lo explica bien.
5. Policies de escritura separadas de las de lectura.

**Hecho cuando.**
- [ ] Caso de la organización A → 0 filas en contexto de B
- [ ] Una sede que rechazó deja de ver el caso, pero conserva su handshake
- [ ] El CRUE ve todo y **queda registrado** que lo vio
- [ ] Las policies funcionan con el rol `pulso_app`, no solo con el owner

**Trampas.** ⚠️ **Si 1.5 no está mergeada, estas policies no protegen nada** y el equipo va a creer que sí, porque los tests con el owner pasan. **Verifica que corres como `pulso_app` antes de dar esto por hecho.**

---

## 2.2 · Vista `/afiliacion`

**Ola 2** · depende de `2.1` (Juan) · dominio `frontend/app/afiliacion/`, `components/afiliacion/` · **mergea antes que 2.3**

**Qué.** El registro de una organización, en 4 pasos.

**Pasos.**
1. Un dato por pantalla, con progreso visible. `react-hook-form` + `zod`.
2. Paso 1: tipo de organización (IPS u operador de ambulancias), dos tarjetas grandes.
3. Paso 2: delega en el componente de 2.3 (Sebas) — la verificación.
4. Paso 3: confirmar o corregir lo precargado del REPS. **Todo editable, todo prellenado.**
5. Paso 4: crear el `admin_organizacion` (correo + contraseña, mínimo 12 caracteres).
6. `/afiliacion/:id/estado`: seguimiento con las observaciones si quedó `observada`.
7. Guardar el borrador entre pasos (no perder el trabajo al recargar).

**Hecho cuando.**
- [ ] Se completa en < 3 min sin ayuda
- [ ] Recargar en el paso 3 no pierde lo escrito
- [ ] Un error de validación dice qué corregir, no "datos inválidos"
- [ ] Funciona en móvil (un administrador de IPS pequeña se afilia desde el celular)

**Trampas.** Es la primera impresión del producto para alguien que no vio el pitch. Si esta pantalla se siente como un formulario del Estado, el producto se percibe como uno más.

---

## 2.6 · Cola de verificación manual

**Ola 2** · depende de `2.1` · dominio `frontend/app/(admin)/afiliaciones`, `core/src/afiliacion/revision.ts`

**Qué.** La bandeja de `admin_plataforma` para lo que no se autoverificó.

**Pasos.**
1. Lista de organizaciones en `en_verificacion`, ordenada por antigüedad.
2. Ficha: lo que declaró vs. lo que dice el REPS, **con las diferencias resaltadas**.
3. Acciones: aprobar · observar (con motivo obligatorio y específico) · rechazar.
4. **Observar no es rechazar**: se le dice qué falta y puede corregir sin empezar de cero.
5. Toda acción escribe evento con actor.
6. SLA visible: "en verificación hace 8 h" con el máximo declarado (24 h hábiles).

**Hecho cuando.**
- [ ] Las diferencias con el REPS saltan a la vista
- [ ] Observar exige motivo y el afiliado lo ve tal cual
- [ ] Solo `admin_plataforma` accede
- [ ] Cada decisión queda auditada

---

## 2.10 · `/panel/auditoria`

**Ola 2** · depende de `3.1`... **no**: depende de `1.3` y usa eventos cuando existan · dominio `frontend/app/(panel)/auditoria`

**Qué.** Quién hizo qué dentro de la organización.

**Pasos.**
1. Tabla con filtros por actor, tipo de acción y rango de fechas.
2. Muestra: hora, actor, acción, recurso, resultado.
3. **Solo eventos de la propia organización.** Un `admin_organizacion` nunca ve otra.
4. Distingue actor humano de servicio (`svc:voz`).
5. Exportar a CSV.
6. Mientras `evento_caso` (3.1) no exista, lee de la auditoría de sesión y de handshakes; se amplía después.

**Hecho cuando.**
- [ ] Filtros funcionan y son rápidos
- [ ] Cero eventos de otras organizaciones (probarlo con dos)
- [ ] El CSV no lleva PII clínica
- [ ] Un `jefe_urgencias` solo ve lo de su sede

---

## 3.1 · `evento_caso` + `RegistroService`

**Ola 3** · depende de `1.2` · dominio `core/src/eventos/` (nuevo), migración `0006` · **mergea PRIMERO en la ola 3** · 🔑 **dueño de tipos de la ola 3**

**Qué.** La tabla append-only y el único punto de escritura de eventos.

**Por qué.** De los 22 eventos del sistema, **3 se guardan, 6 viven en memoria y 13 no existen o se descartan**. Sin esto no hay reporte del paramédico, no hay métricas de negocio, y los dos momentos más vendibles del producto —el re-ruteo automático y el override del CRUE— son invisibles.

**Pasos.**
1. Migración con `evento_caso` completa, incluidas las dos columnas que faltaban: `corrige_a` y `clave_idempotencia` (ver [Parte II §11.1](../pulso-plataforma-afiliacion-y-tramites.md#111-el-crud-de-un-evento-no-es-un-crud)).
2. **Trigger append-only**, calcado del de `pulso_routing_decision_audit` en `0002`: rechaza `UPDATE`, `DELETE` y `TRUNCATE`.
3. `unique (caso_id, tipo, clave_idempotencia) where clave_idempotencia is not null`.
4. `RegistroService.registrar({casoId, tipo, actorId?, movilId?, codigoSede?, detalle?, claveIdempotencia?, corrigeA?})` — **una sola firma, un solo punto de escritura**.
5. `GET /casos/:id/eventos` con alcance.
6. Índice `(caso_id, ocurrido_en)`.
7. **Como dueño de tipos:** mergea primero los tipos `TipoEvento`, `EventoCaso`, `SedeEstado`, `CapacidadDeclarada` — todos opcionales donde toquen tipos existentes.

**Hecho cuando.**
- [ ] Un `UPDATE` sobre `evento_caso` lanza excepción
- [ ] El mismo evento con la misma clave dos veces → una fila
- [ ] Una corrección se lee como corrección, no borra el original
- [ ] Los tipos están mergeados antes que el resto de la ola

**Trampas.** La tentación es dejar que cada servicio inserte directo. **No.** Un solo punto de escritura es lo que permite el test de cobertura de eventos (5.12) y lo que evita que dentro de un mes haya eventos con formas distintas.

---

## 3.8 · Vigilante a worker con lock distribuido

**Ola 3** · depende de `1.2`, `3.2` (Sebas) · dominio `core/src/colas/` (nuevo) + `vigilante`

**Qué.** El barrido periódico sale del proceso web.

**Por qué.** `VigilanteService` usa `@Interval(5000)` **dentro del proceso web**. Funciona con una instancia y **se rompe con dos**: dos vigilantes venciendo el mismo handshake y re-ruteando el mismo caso. Es el primer bug que aparece al escalar horizontalmente, y el propio archivo lo anticipa: *"Cuando el estado se mude a Supabase, esto puede salirse a un cron."* Ya es hora.

**Pasos.**
1. BullMQ + Redis. Job repetible cada 5 s.
2. **Lock distribuido**: solo una instancia barre. Redlock o un `SET NX EX` simple.
3. Mover `vencerHandshakes()` y `detectarDemoras()` al worker sin cambiar su lógica.
4. Sin Redis configurado: **vuelve a `@Interval` con una advertencia clara**. Regla del repo.
5. El worker escribe eventos vía `RegistroService` (3.1) — hoy calcula y no persiste.
6. Idempotencia: vencer dos veces el mismo handshake no debe duplicar la señal de rechazo.

**Hecho cuando.**
- [ ] Con dos instancias, un handshake se vence **una** vez
- [ ] El re-ruteo escribe `evento_caso` tipo `rerouteado`
- [ ] Sin Redis, sigue funcionando en modo una-instancia y lo dice
- [ ] Los tests de `vigilante.service.spec.ts` pasan

**Trampas.** `core/src/vigilante` lo toca Sebas en 3.2 (cableado de eventos). **Mergea después de 3.2 y rebasa.**

---

## 3.12 · Versionar el prompt clínico

**Ola 3** · depende de `0.5` · dominio `ai-core/app/triage.py`, `core/src/routing/decision-evidence.ts`

**Qué.** Que se pueda saber con qué versión de prompt se extrajo un caso.

**Por qué.** `pulso_routing_decision_audit` exige `modelVersion` y `configVersion` para el **ruteo** — con `check` en la base, bien hecho. Pero la **extracción clínica** no versiona nada. Si el prompt cambia, no hay forma de saber con cuál se procesó un caso de hace una semana. Y el prompt estuvo duplicado en dos lenguajes, así que pudo haber dos versiones distintas corriendo el mismo día.

**Pasos.**
1. `data/prompts/triage.txt` lleva versión en cabecera (o se deriva de un hash del contenido).
2. La respuesta de `/v1/triage` incluye `promptVersion` y `modelo`.
3. `Caso` guarda `promptVersion` (campo opcional).
4. `decision-evidence.ts` lo incluye en la evidencia.
5. `/admin/modelos` (5.11, Juan) lo muestra.

**Hecho cuando.**
- [ ] Un caso guarda con qué prompt se extrajo
- [ ] Cambiar el prompt cambia la versión sola
- [ ] Se puede consultar qué casos usaron una versión dada
- [ ] La heurística también se identifica (`motor: heuristica`, versión propia)

---

## 4.2 · Generador de SBAR

**Ola 4** · sin dependencias · dominio `ai-core/app/sbar.py`, `ai-core/app/routers/sbar.py`

**Qué.** Dictado + extracción → el formato de entrega estándar: **S**ituación, **B**ackground/antecedente, **A**nálisis, **R**ecomendación.

**Por qué.** **Es IA legítima**, a diferencia del protocolo (que es tabla). Convertir un dictado desordenado en el formato con el que los clínicos se entregan pacientes es exactamente lo que un LLM hace bien, y es lo que el hospital lee antes de que llegue la camilla.

**Pasos.**
1. Structured output (`messages.parse`), igual que el triaje — hay una respuesta y su forma se conoce.
2. Prompt con las mismas reglas del resto: no inventar, no diagnosticar, bajar confianza antes que rellenar.
3. **Cuatro líneas, no cuatro párrafos.** Se lee en una pantalla de urgencias a dos metros.
4. Fallback sin LLM: armar el SBAR desde los campos ya estructurados del caso. Peor redactado, igual de correcto.
5. `POST /v1/sbar` con su test y su entrada en los evals.
6. **No repite el dictado crudo.** Es una síntesis, y el dictado crudo no sale del servidor.

**Hecho cuando.**
- [x] Los cinco casos del corpus producen SBAR legible — los **14**, de hecho
- [x] Sin `ANTHROPIC_API_KEY` cae al fallback y lo marca
- [x] Nunca inventa un antecedente que el dictado no trae
- [x] Cabe en cuatro líneas

**Trampas.** Es lo primero que un clínico va a juzgar. Un SBAR que suena a resumen de LLM ("El paciente presenta un cuadro compatible con…") pierde credibilidad al instante. **Frases de radio, como el resto del sistema.**

### ✅ Hecho — rama `feat/o4-4.2-sbar`

⚠️ **Sale de `feat/o0-0.5-prompt-unico`, no de main.** Usa la infraestructura
de prompts canónicos de la 0.5, así que **hay que mezclar el PR #18 primero**.

`data/prompts/sbar.txt` con su golden, igual que el triaje. `render.py` ahora
maneja los dos: agregar un prompt es agregar una línea a `NOMBRES`.

**El respaldo no es un adorno.** Sin API key arma el SBAR desde los campos ya
estructurados del caso, y lo declara (`motor: "plantilla"`). Un SBAR feo pero
cierto sirve; uno bonito e inventado no. También reporta `versionPrompt: null`
en ese modo — inventar una versión sería mentir justo en el campo que existe
para auditar.

**Contra el relleno de LLM.** Hay un test que rechaza cualquier línea que
empiece con «El paciente presenta», «Se trata de», «Nos encontramos ante» o
«cuadro compatible con», y corre sobre los 14 casos del corpus. El prompt lo
prohíbe explícitamente; el test es la red por si el modelo no obedece.

**Cuatro líneas es un contrato, no una sugerencia.** `_recortar()` aplana
saltos y corta en el último espacio antes del tope. El modelo a veces devuelve
un párrafo aunque el prompt pida una línea; recortar sale más barato que
reintentar y garantiza el contrato pase lo que pase.

**Lo que no sale:** hay tests de que el SBAR no repite el dictado crudo ni
filtra las coordenadas del paciente. Es una síntesis, y esos dos campos son
los más sensibles del sistema.

**Al parser se le pasa el caso estructurado, no el dictado.** Además de que el
dictado no sale del servidor, el trabajo de extraerlo ya se hizo: repetirlo
invitaría al modelo a re-interpretarlo y a discrepar consigo mismo.

Y un test fija que la versión del prompt de triaje **siguió siendo
`b6b3e3556c87`**: si agregar el SBAR hubiera movido el prompt clínico, los
evals dejarían de ser comparables con los de antes.

---

## 4.7 · Puertos declarados con mock honesto

**Ola 4** · depende de `4.6` (Zaid) · dominio `core/src/tramites/puertos/`

**Qué.** `ProveedorDerechos` (ADRES/BDUA) y `ProveedorHistoriaClinica` (IHCE) como interfaces **sin implementación real**.

**Por qué.** Ninguna de las dos se puede integrar sin convenio. **Un puerto vacío bien nombrado es más creíble que una integración fingida** — y deja el hueco listo para el día que el convenio exista.

**Pasos.**
1. Interfaces con la firma que tendría la integración real.
2. Implementación mock que devuelve datos plausibles **y se identifica como mock** en la respuesta.
3. **La UI dice "simulado".** No se pinta un resultado falso con la misma tipografía que uno real — es la misma regla de `Capacidades`.
4. Documentar en `docs/integraciones-pendientes.md` qué haría falta para cada una: convenio, credenciales, ambiente de pruebas.
5. Para IHCE: dejar anotados los tres puntos por verificar del [plan maestro §0](../pulso-produccion-plan-maestro.md#0-el-hallazgo-que-reordena-el-producto).

**Hecho cuando.**
- [ ] Cambiar de mock a real es implementar una interfaz, nada más
- [ ] La UI nunca presenta un dato simulado como verificado
- [ ] El documento dice exactamente qué falta

**Trampas.** La tentación de "que se vea bien en el demo" haciendo que el mock parezca real. **No.** El día que alguien de una EPS pregunte y descubra que era falso, se pierde toda la credibilidad del resto — que sí es verdad.

---

## 4.9 · Validar el RDA contra la IG del IHCE

**Ola 4** · depende de `4.8` (Juan) · dominio `core/src/rda/validacion/`, `docs/ihce.md`

**Qué.** Que el `Bundle` que produce 4.8 cumpla los perfiles colombianos.

**Pasos.**
1. **Primero: verificar los tres puntos abiertos** del plan maestro §0 — recursos obligatorios de `BundleEmergencyRDA`, cómo se autentica un prestador, y **si un traslado prehospitalario genera RDA propio o solo lo genera la IPS receptora**. Soporte: `soporte_ihce@minsalud.gov.co`, +57 (601) 3305043.
2. Descargar los `StructureDefinition` de [vulcano.ihcecol.gov.co](https://vulcano.ihcecol.gov.co/) y fijarlos como fixtures con su versión.
3. Validador contra los perfiles (HAPI validator o equivalente en CI).
4. Fixtures de ejemplo por patología: IAM, ACV, politrauma.
5. `docs/ihce.md` con lo que se verificó, con fecha — la guía cambia de versión y hay que saber contra cuál se validó.

**Hecho cuando.**
- [ ] Un `Bundle` generado valida sin errores
- [ ] Los huecos conocidos (`PatientRDA`, CUPS) están documentados como huecos
- [ ] La versión de la IG contra la que se valida está fijada
- [ ] `docs/ihce.md` responde las tres preguntas, o dice explícitamente que siguen abiertas

**Trampas.** ⚠️ **Hasta responder la pregunta 3, la frase del pitch es "PULSO pre-llena el RDA", nunca "PULSO reporta al IHCE".** Prometer un reporte oficial que no se está haciendo hunde la demo ante alguien de MinSalud — y es exactamente el tipo de persona que va a estar en la sala.

---

## 5.4 · Métricas de negocio

**Ola 5** · depende de `5.3` (Juan) · dominio `core/src/observabilidad/metricas.ts`

**Qué.** Las métricas que le importan al producto, no solo al servidor.

**Por qué.** Spec §11.2 las pide y son, además, el termómetro del pitch: "tiempo de coordinación" es el número que el producto promete bajar.

**Pasos.**
1. `pulso_casos_total{triage,motor}` · `pulso_aceptacion_ratio{sede}` · `pulso_tiempo_coordinacion_segundos` (histograma) · `pulso_escalamientos_total{motivo}` · `pulso_sedes_sin_candidato_total` · `pulso_llm_latencia_ms{motor}` · `pulso_webhook_entregas{estado}` · `pulso_rda_generados_total`.
2. **Etiqueta de inquilino en las métricas internas, nunca PII.**
3. `pulso_tiempo_coordinacion_segundos` se mide de `caso_creado` a `aceptado`. **Es el número del pitch: mídelo de verdad.**
4. Tablero con las seis que importan.
5. ⚠️ **La tasa de rechazo por sede es sensible.** Visible para CRUE y auditor; para el operador de ambulancias solo llega transformada en `pAceptacion` dentro del score. Ver [Parte II §10.7](../pulso-plataforma-afiliacion-y-tramites.md#107-el-dato-agregado-de-quién-es-la-tasa-de-rechazo).

**Hecho cuando.**
- [ ] Las ocho métricas se emiten
- [ ] El tiempo de coordinación se puede citar con su p50 real
- [ ] Ninguna etiqueta contiene datos de paciente
- [ ] El tablero se entiende sin explicación

---

## 5.8 · Política de retención

**Ola 5** · depende de `3.1` · dominio `core/src/retencion/`, worker

**Qué.** Purgar la PII operativa al cierre del caso + ventana legal, conservando el residuo disociado.

**Por qué.** Hoy nada se purga porque nada se guarda. **El día que 1.2 entre, el reloj legal de Habeas Data empieza a correr** y esto deja de ser teoría.

**Pasos.**
1. Job diario: casos cerrados hace más de la ventana → borrar `texto_crudo`, `origen`, `paciente_token`, `telefono_reporta`.
2. **Conservar** decisión de ruteo, aceptación/rechazo con motivo codificado y tiempos. Ese residuo **es el activo** y no tiene PII adentro.
3. Registrar la purga como evento (qué se purgó, cuándo, cuántas filas) — sin registrar lo purgado, obviamente.
4. La ventana es configurable y **hay que decidirla con Sebas**: no está definida.
5. ⚠️ **PULSO no conserva RDA completos.** Guardarlos heredaría **20 años** de obligación de custodia de historia clínica. PULSO genera el RDA, lo entrega a la IPS, y no lo guarda más allá de la ventana operativa.
6. Purga también `webhook_recibido` > 30 días (de 0.4).

**Hecho cuando.**
- [ ] Un caso cerrado y vencido no conserva dictado ni coordenadas
- [ ] `pAceptacion` sigue funcionando tras la purga
- [ ] La purga queda auditada
- [ ] Test que verifica que el residuo no tiene PII

**Trampas.** No borres el `caso` entero. **Se anonimiza, no se elimina**: la auditoría de la decisión tiene que sobrevivir, y es lo que protege al equipo si alguien reclama.

---

## 5.12 · Endurecimiento final

**Ola 5** · depende de todo · dominio transversal

**Qué.** Completar el checklist de [multitenancy §9](../multitenancy-y-autenticacion.md#9-checklist-de-verificación) y el del [plan maestro §6.5](../pulso-produccion-plan-maestro.md#65-checklist-antes-de-exponer-a-una-ips-real), **con evidencia por ítem**.

**Por qué.** Un checklist marcado sin evidencia es una lista de deseos. Cada casilla necesita un test, una captura o un comando que lo demuestre.

**Pasos.**
1. Recorrer los dos checklists y, por cada ítem, dejar el enlace al test o al comando que lo verifica.
2. Cerrar el test de cobertura de eventos: recorrer las transiciones de `routing/lifecycle.ts` y verificar que **cada una escribe su evento**. Si una no lo hace, es un bug, no una omisión.
3. Test de PII en logs: correr un caso completo y hacer `grep` del dictado en la salida.
4. Verificar con `curl` **desde fuera** que `core` y `ai-core` no son alcanzables.
5. `docs/seguridad.md` con lo verificado y **lo que quedó pendiente, dicho en voz alta**.

**Hecho cuando.**
- [ ] Cada ítem tiene evidencia enlazada
- [ ] El test de cobertura de eventos pasa
- [ ] El test de PII en logs pasa
- [ ] Lo pendiente está escrito, no escondido

**Trampas.** Esta tarea revela deuda de las otras 63. **Ábrela en la ola 3, no en la 5** — llevar el checklist en paralelo evita que la última semana sea una lista de sorpresas.
