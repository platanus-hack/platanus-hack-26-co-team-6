# Pipeline de datos

```bash
task datos:descargar   # una vez: baja 17 MB del REPS (no van al repo)
task datos             # regenera todo
```

> **Para correr el demo no hace falta nada de esto.** `data/procesado/` y los
> dos `.generado.ts` sí están commiteados: quien clona compila y corre sin
> tocar Python. Esto solo hace falta para volver a generar.

Lee `data/` (crudo, **nunca lo modifica**) y escribe artefactos tipados que la
app consume. Es idempotente y solo usa la librería estándar de Python: sin
`pip install`, sin venv, sin pelear.

---

## Qué produce

| Salida | Qué es |
|---|---|
| `data/CATALOGO.md` | Qué hay en `data/`, qué cubre y quién lo usa. **Generado — no editar.** |
| `data/procesado/sedes.json` | 84 IPS de urgencias de Bogotá, con código REPS único y camas reales |
| `data/procesado/demanda.json` | Curva de demanda medida sobre 9206 incidentes del 123 |
| `data/procesado/ocupacion.json` | Ocupación de urgencias por subred, 2021-2025 |
| `data/procesado/casos-demo.json` | 400 casos de demo sacados de incidentes reales |
| `data/procesado/ambulancias.json` | 225 prestadores de transporte asistencial |
| `data/procesado/contexto.json` | Flota, camas y tiempos por localidad |
| `data/procesado/servicios.json` | Los 157 servicios del CodeSystem REPS |
| `data/procesado/reporte.json` | Qué salió de cada paso, con sus problemas |

Y genera el TypeScript que `core` importa:

- `apps/backend/core/src/sedes/catalogo.generado.ts`
- `apps/backend/core/src/scoring/demanda.generada.ts`

> Los dos archivos `.generado.ts` **se commitean**. Así quien clona el repo
> compila sin correr Python. Pero no se editan a mano: la siguiente corrida
> los sobrescribe.

---

## Cómo agregar una fuente

1. Pon el archivo en `data/`.
2. Declárala en [`fuentes.py`](fuentes.py) — qué es, si cubre Bogotá, si está
   completa, qué produce.
3. Si alimenta algo, escribe su transformador en `transformadores/`.
4. `task datos`.

Un archivo que esté en `data/` sin declarar sale reportado como huérfano. Uno
declarado que ya no exista sale como ruta muerta. Las dos cosas se ven en
`CATALOGO.md`.

---

## Lo que este pipeline arregla, y por qué existe

Cada uno de estos es un problema real de `data/`, no una precaución teórica.
Todos costaban silencio: nada fallaba, los datos simplemente salían mal.

**Tres encodings conviviendo.** `cp1252`, `latin-1`, `utf-8-sig`. Leer con el
equivocado no lanza un error: devuelve texto corrupto que después no cruza con
nada.

**`llamadas123.csv` mezcla dos codepages DOS en la misma línea.** `USAQUÉN`
está en cp850 y `ACOMPAÑAMIENTO` en latin-1. Ningún encoding lee bien el
archivo entero. Se repara con una tabla explícita de 3 bytes, verificados uno
por uno contra su contexto — ver `REPARACIONES_CP850` en [`comun.py`](comun.py).
Sin eso, 7 de las 19 localidades no cruzaban y sus casos salían sin origen.

**Dos sedes con lat/lng invertidas.** Hospital de Usme y Centro de Salud Patio
Bonito. Sin corregir caen fuera de Bogotá, el filtro por radio nunca las
alcanza, y desaparecen del ranking sin un solo error en los logs.

**El CSV de urgencias no trae código REPS.** Se cruza por nombre contra el
directorio REPS de Bogotá: 83 de 84 con match único, 1 desempatado por
dirección.

**Y el código fácil de agarrar es el equivocado.** El primer intento usó
`codigo_pre` del geojson, que es el código del **prestador**, no de la sede.
Una subred entera es *una* ESE con decenas de sedes: nueve sedes distintas
quedaron con el código `1100130289`, y como `porCodigo()` hace un `find()`,
despachar a Santa Clara podía resolverse a San Blas. El campo correcto es
`codigohabilitacionsede`, de 12 dígitos. El transformador ahora **revienta**
si la PK deja de ser única.

**Coma decimal y porcentajes como texto.** `"132,52%"` → `1.3252`.

**Dos horas del día son un artefacto de reporte.** Las 17h y 18h caen 50% y
vuelven. No es que Bogotá deje de accidentarse a las 5 de la tarde: es el
cambio de turno del CRUE. Se detecta, se reporta y se interpola **solo para el
modelo** — el conteo crudo queda intacto en `demanda.json`.

---

## Lo que encontramos y contradijo al código

| Lo que el código asumía | Lo que dicen los datos |
|---|---|
| Pico de demanda a las 20:00 | Pico a las **09:00**. Las 20:00 están al 65% |
| Fin de semana +12% de carga | Sábado y domingo son los días **más flojos** (0.92, 0.91). Los picos son lunes y martes |
| 14 sedes con servicios "ilustrativos" | 84 IPS reales, **todas** con código de habilitación de sede único |
| Camas y ocupación estimadas | **62 sedes con camas medidas** (total y ocupadas) del registro REPS |

---

## Las tres fuentes rotas: ya reemplazadas

`uwc4-gvg3.json`, `c36g-9fc2.json` y `s2ru-bqt6.json` eran 2.4 MB inservibles:
descargas de Socrata **sin `$limit`**, cortadas en las primeras 1000 filas y
ordenadas alfabéticamente. Entre las tres traían 2 registros de Bogotá.

Ya se re-descargaron con el filtro correcto, a `data/reps_bogota/`:

| Archivo | Filas de Bogotá | Qué aportó |
|---|---|---|
| `reps_bogota/sedes.json` | 16 181 | El `codigohabilitacionsede`, PK única de sede |
| `reps_bogota/capacidad.json` | 4 647 | Camas instaladas por sede (respaldo) |
| `reps_bogota/ocupacion.json` | 548 | **Camas totales y ocupadas por sede** |

Los tres originales siguen en `data/` marcados como reemplazados en
`fuentes.py`, solo para que nadie los vuelva a usar por error. Se pueden
borrar.

Los tres archivos de `data/reps_bogota/` **no se commitean**: son 17 MB que
`task datos:descargar` reconstruye en 15 segundos, y duplicarían el peso del
repo. [`descargar.py`](descargar.py) verifica el conteo contra la API antes de
escribir, así que una descarga truncada falla en vez de quedarse con pinta de
estar bien.

Si prefieres hacerlo a mano:

```bash
BASE=https://www.datos.gov.co/resource

curl -o data/reps_bogota/sedes.json "$BASE/c36g-9fc2.json?\$limit=50000&\$where=departamentoprestadordesc='Bogotá D.C'"

curl -o data/reps_bogota/capacidad.json "$BASE/s2ru-bqt6.json?\$limit=50000&\$where=departamento='Bogotá D.C'"

curl -o data/reps_bogota/ocupacion.json "$BASE/uwc4-gvg3.json?\$limit=50000&\$where=departamento_sede_prestador='Bogotá D.C'"
```

> El departamento va **sin punto final**: `'Bogotá D.C'`. Con `'Bogotá D.C.'`
> el filtro devuelve cero filas y parece que no hay datos.

> Los campos que las fuentes llaman `c_digo_sede` o `codigo_habilitacion_sede`
> son en realidad el **prestador**, de 10 dígitos. La PK de sede se arma
> concatenando el número de sede: 10 + 2 = 12. Los nombres de los campos
> mienten; las longitudes no.

---

## Lo que queda pendiente

**La ocupación medida es del 2022-11-30.** Es la única fecha que existe: el
registro "diario" obligatorio se apagó al terminar el mandato COVID. No es un
defecto del pipeline — es la tesis de PULSO, y por eso el modelo la trata como
*prior estructural* y no como el dato de hoy. La señal viva es el rechazo.

**21 de 84 sedes no aparecen en ningún registro de capacidad** y caen a un
prior por complejidad. Salen marcadas con `origenCamas: "prior-complejidad+subred"`.

**Los servicios por sede siguen siendo inferidos.** REPS no los publica
abiertos. Es el hueco de datos más grande que queda. La ruta sería la consulta
pública de habilitación (`prestadores.minsalud.gov.co`), o llenar a mano las 25
sedes de alta complejidad — que es lo que ya recomienda
`scripts/etl/extraer_reps.py`, y para un demo son 25 filas.
