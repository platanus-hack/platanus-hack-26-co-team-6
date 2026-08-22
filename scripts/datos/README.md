# Pipeline de datos

```bash
task datos          # o: python scripts/datos/construir.py
```

Lee `data/` (crudo, **nunca lo modifica**) y escribe artefactos tipados que la
app consume. Es idempotente y solo usa la librería estándar de Python: sin
`pip install`, sin venv, sin pelear.

---

## Qué produce

| Salida | Qué es |
|---|---|
| `data/CATALOGO.md` | Qué hay en `data/`, qué cubre y quién lo usa. **Generado — no editar.** |
| `data/procesado/sedes.json` | 84 IPS de urgencias de Bogotá, reales |
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

**El CSV de urgencias no trae código REPS.** Se cruza con `ins.geojson` por
nombre normalizado y, si falla, por cercanía física. Cruzan 81 de 84.

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
| 14 sedes con servicios "ilustrativos" | 84 IPS reales, 81 con código REPS de verdad |

---

## REDESCARGA — las tres fuentes rotas

`uwc4-gvg3.json`, `c36g-9fc2.json` y `s2ru-bqt6.json` son 2.4 MB inservibles:
descargas de Socrata **sin `$limit`**, cortadas en las primeras 1000 filas y
ordenadas alfabéticamente por departamento. Entre las tres suman **2 registros
de Bogotá**.

Para traerlas bien:

```bash
# Sedes REPS de Bogota (directorio de prestadores)
curl -o data/reps_sedes_bogota.json \
  "https://www.datos.gov.co/resource/c36g-9fc2.json?\$limit=50000&\$where=departamentoprestadordesc='Bogotá D.C'"

# Capacidad instalada por sede — la que daria CAMAS POR SEDE,
# que es el hueco mas grande que le queda al modelo hoy
curl -o data/reps_capacidad_bogota.json \
  "https://www.datos.gov.co/resource/s2ru-bqt6.json?\$limit=50000&\$where=departamento='Bogotá D.C'"

# Ocupacion diaria REPS
curl -o data/reps_ocupacion_bogota.json \
  "https://www.datos.gov.co/resource/uwc4-gvg3.json?\$limit=50000&\$where=departamento_sede_prestador='Bogotá D.C'"
```

> El string del departamento va **sin punto final**: `'Bogotá D.C'`. Con
> `'Bogotá D.C.'` el filtro devuelve cero filas y parece que no hay datos.
> Es la misma trampa que ya documenta `scripts/etl/extraer_reps.py`.

Después: declararlas en `fuentes.py` y escribir su transformador.

---

## El hueco que queda

**No hay camas por sede para Bogotá.** Hoy `sedes.json` reparte la
distribución real de camas de la ciudad según el nivel de complejidad, y lo
marca como inferido. La fuente que lo arreglaría es `s2ru-bqt6` bien
descargada. Es lo de mayor retorno que queda pendiente en datos.

**La Candelaria no tiene IPS de urgencias** en el listado de 84, así que sus
casos salen sin coordenada de origen. Es un hueco de la fuente, no del
pipeline.
