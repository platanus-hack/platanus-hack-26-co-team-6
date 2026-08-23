# Campo: agente con contexto, sector y coordinación multi-unidad

> Análisis y plan para convertir `/campo` de "una consola que dicta casos" en
> "el puesto de trabajo de una tripulación dentro de una ciudad coordinada".
>
> Escrito tras revisar el backend existente. **La mitad de lo que hace falta ya
> está construido y sin cablear.**

---

## 0. El hallazgo: casi todo existe, nadie lo conectó

| Pieza | Dónde está | Quién la usa hoy |
|---|---|---|
| **Agente conversacional** con 5 herramientas | `ai-core/app/agente/` · `POST /v1/interpretar` | **Solo WhatsApp** (`voz/rutas/whatsapp.py`). Core no lo expone |
| **Reparto de zonas C→D** | `ai-core/app/cobertura.py` · `POST /v1/cobertura` | **Nadie**. Función pura, sin cablear |
| **Congestión de 84 sedes** con nombre, índice y coordenada | `GET /estado` → `congestion[]` | `/crue`. **Ahora también `/campo`** (hecho) |
| **Posición de móviles** | `core/src/moviles/posicion.ts` | El mapa del CRUE |

Las cinco herramientas que el agente ya sabe usar: `registrar_caso`,
`confirmar_llegada`, `reportar_demora`, `pedir_ubicacion`, `consultar_estado`.

**Ninguna responde "¿cómo está el San Carlos?" ni "¿cuál es mi sector?".** Ese
es el trabajo que falta, y es pequeño comparado con lo que ya hay.

## 1. El techo que no se puede cruzar

Lo dice el propio `ai-core/app/routers/cobertura.py`, y no es una opinión:

> ⚠️ La salida es una **PROPUESTA**. PULSO reposiciona unidades libres y le
> muestra al CRUE dónde quedan los huecos; **el despacho a una emergencia
> sigue siendo función del CRUE** (Res. 1220/2010).

Así que "que el agente orqueste múltiples usuarios" tiene una forma legal y una
ilegal:

- ✅ **Coordinar información**: quién está en el incidente, qué sedes quedan,
  quién va a cuál, dónde está el hueco de cobertura. PULSO *muestra* y *propone*.
- ❌ **Asignar unidades a una emergencia**: eso es regulación médica y la ley se
  la atribuye al CRUE.

La diferencia no es cosmética. Es el argumento entero del producto ante
MinSalud, y la regla 6 del repo — *PULSO propone, el humano decide*.

## 2. Lo que ya quedó hecho

- **Tablero de casos** con búsqueda (dx, CIE-10, móvil, signos de alarma, sin
  tildes), filtros por triage y estado, y tres grupos ordenados por **deuda**:
  por atender → en curso → cerrados. `lib/tablero-modelo.ts`, con 21 tests.
- **Estado de la red** en `/campo`: las 84 sedes con su congestión, buscables.
  El dato ya viajaba; ninguna consola de campo lo pintaba.
- **Pantalla partida** en escritorio, con el mapa a media vista.

## 3. Tareas nuevas

Numeradas como **ola 6** para no renumerar las 64 del plan vigente.

---

### 6.1 · Exponer el agente a las consolas

**Dominio** `core/src/agente/` (nuevo) · depende de `1.3`

**Qué.** `POST /agente/mensaje` `{mensaje, casoId?}` → proxy a
`/v1/interpretar` con el **contexto real** que core ya tiene: caso abierto,
sede despachada, estado del handshake, posición del móvil, sector asignado.

**Por qué.** El agente existe y funciona, pero solo lo alcanza quien escribe por
WhatsApp. Un paramédico con la consola abierta tiene que salir a otra app para
hablar con el mismo sistema.

**Trampas.** `interpretar` **no ejecuta**: devuelve una acción y sus argumentos.
Quien ejecuta es core, y cada acción con consecuencia sigue necesitando
confirmación humana. No conviertas el proxy en un ejecutor automático.

**Hecho cuando.**
- [ ] Desde `/campo` se puede preguntar y el agente responde con contexto del caso
- [ ] Sin ai-core, degrada a la heurística y **lo dice**
- [ ] Ninguna acción con consecuencia se ejecuta sin confirmación
- [ ] La conversación queda en `evento_caso`

---

### 6.2 · Herramientas de red y de sector

**Dominio** `ai-core/app/agente/herramientas.py` · depende de `6.1`, `6.3`

**Qué.** Dos herramientas nuevas:
- `consultar_red(nombre_o_zona?)` → ocupación de sedes desde `congestion`.
- `consultar_sector()` → qué zona cubre este móvil y qué huecos hay.

**Por qué.** Son las dos preguntas que hoy se hacen por radio.

**Trampas.** El índice de congestión es **comportamiento observado**, no una
declaración del hospital. El agente tiene que decir cuál de las dos está
citando, o estará afirmando algo que nadie declaró.

---

### 6.3 · Sector asignado al móvil

**Dominio** `core/src/moviles/` + `core/src/cobertura/` (nuevo) · depende de `3.6`

**Qué.** Cablear `POST /v1/cobertura`: core manda la foto de la flota, guarda la
propuesta y expone `GET /moviles/:id/sector`.

**Por qué.** El reparto C→D está calculado y no lo consume nadie. Es la base de
"el usuario ambulancia ve su sector designado".

**Trampas.** Es una **propuesta de reposicionamiento de unidades libres**, no una
asignación. La UI tiene que decirlo con esas palabras.

---

### 6.4 · Incidente multi-víctima

**Dominio** `core/src/incidentes/` (nuevo) + `contracts/types.ts` · depende de `3.1`

**Qué.** Agrupar varios casos bajo un `incidente` (un choque con seis heridos es
un incidente, no seis casos sueltos). Cada caso conserva su triage y su destino;
el incidente da la vista de conjunto: cuántas unidades hay, quién lleva a quién,
qué sedes quedan libres.

**Por qué.** Es el escenario que el usuario describió: *"una emergencia con
muchos incidentes coordinada entre múltiples usuarios"*. Hoy no existe el
concepto y cada tripulación compite por las mismas sedes sin saberlo.

**Trampas.** El campo nuevo en `contracts/types.ts` **se avisa antes de guardar**
y va opcional (regla 1). Y el incidente **no reparte pacientes**: enseña el
reparto para que el CRUE lo regule.

**Hecho cuando.**
- [ ] Dos unidades en el mismo incidente se ven entre sí
- [ ] Una sede ya comprometida se marca antes de que la segunda unidad la pida
- [ ] El CRUE ve el incidente completo en una pantalla
- [ ] Nada se asigna solo

---

### 6.5 · Vista de sector y de incidente en `/campo`

**Dominio** `frontend/components/campo/` · depende de `6.3`, `6.4`

**Qué.** El sector sobre el mapa, con los huecos de cobertura, y la barra del
incidente cuando el caso pertenece a uno.

**Trampas.** Reusar el lenguaje de `MapaRed.tsx` (`standard-satellite`,
`lightPreset: dusk`). Y no pintar el sector como una orden: es dónde conviene
estar, no dónde hay que ir.

---

### 6.6 · El tablero en vivo

**Dominio** `core/src/canales/` + `frontend` · depende de `3.9`

**Qué.** El tablero hace polling cada 3 s. Con varias unidades en un incidente
eso es tarde y es caro. Pasa al canal en vivo que ya existe para `caso:{id}`.

**Trampas.** Degradar a polling **declarándolo**, como el resto del repo.

---

## 4. Orden sugerido

```
6.1 (agente expuesto) ─┬─→ 6.2 (herramientas)
6.3 (sector)  ─────────┘        │
                                ↓
6.4 (incidente) ──────→ 6.5 (vistas) ──→ 6.6 (vivo)
```

**6.1 y 6.3 son independientes y se pueden hacer en paralelo.** Las dos son
cableado de algo que ya está escrito y probado — el trabajo caro ya se hizo.
