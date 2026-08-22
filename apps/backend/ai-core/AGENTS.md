# ai-core — instrucciones para agentes

Lee primero [`AGENTS.md` de la raíz](../../../AGENTS.md) y [`README.md`](README.md) de este servicio.

## La frontera

**`ai-core` decide, no ejecuta. No tiene base de datos y no debe tenerla.** Quien ejecuta es `core`,
que sí sabe de qué caso y de qué teléfono se trata.

**Concentra las credenciales de los proveedores de IA.** Es interno, nunca público, y **ni sus URLs de
proveedor deben salir en trazas ni en respuestas**: saber que el ruteo es estimado no le sirve a un
atacante; saber a qué host apunta, sí.

## Reglas propias

1. **Nada lanza hacia afuera.** El triaje cae a `extraccion_heuristica()` (`confianza: 0.35`); el
   intérprete cae a palabras clave. Una excepción deja al paramédico sin respuesta.
2. **`motor` siempre viaja en la respuesta.** Nunca hay que adivinar si corrió Claude o la heurística.
3. **Cinturón de seguridad en la salida del LLM.** Un código REPS fuera del catálogo se descarta en
   silencio: un código inventado vacía el ranking.
4. **Structured outputs para extraer, tools para decidir.** El triaje tiene UNA respuesta de forma
   conocida → `messages.parse`. El intérprete elige entre acciones → tools con `strict: true`.
   No conviertas uno en el otro.
5. **La tabla decide, el LLM propone.** Protocolos clínicos y mapa Dx→servicios son catálogos
   versionados, **no** salida de modelo.
6. **Ante duda entre dos niveles de triage, el MÁS grave.** En urgencias el falso negativo mata.
7. **Timeouts por debajo del presupuesto de core** (25 s frente a 30 s), para caer a la heurística
   antes de que el gateway corte.

## Trampas conocidas

- **`app/agente/prompts/*.txt` no los abre ningún código.** Son especificaciones para agentes de
  ElevenLabs que nadie ha creado; solo existen como IDs vacíos en `config.py`.
- **El prompt de `triage.py` está duplicado** en `core/src/triage/triage.service.ts`, carácter por
  carácter. Si tocas uno, toca el otro.
- **La heurística saca 4/14 en el corpus.** Es el respaldo, no el motor.

```bash
uv sync && uv run fastapi dev app/main.py    # :8000
uv run pytest
uv run python -m evals.run                    # cuesta tokens
```

## Tareas de este servicio

[0.3](../../../docs/tareas/neid.md#03--responder-el-webhook-en--3-s) · [0.5](../../../docs/tareas/neid.md#05--un-solo-prompt-clínico) · [3.12](../../../docs/tareas/neid.md#312--versionar-el-prompt-clínico) · [4.2](../../../docs/tareas/neid.md#42--generador-de-sbar) · [5.3](../../../docs/tareas/juan.md#53--opentelemetry--pino-con-redacción-de-pii)
