# Zaid · Backend / Datos

> Tú conviertes 16.181 filas del REPS en ~60 sedes de Bogotá que un
> jurado puede señalar en un mapa y reconocer. Sin ti, PULSO es una demo
> con datos inventados — y eso se nota en 10 segundos.

---

## Tu punto de partida

Todo corre ya sobre 14 sedes semilla de [`lib/mock.ts`](../lib/mock.ts). Tu trabajo es reemplazarlas por datos reales **sin que nadie más tenga que cambiar una línea**: la firma de `sedesCercanas()` no cambia.

## Tus archivos

| Archivo | Qué es |
|---|---|
| [`scripts/etl/extraer_reps.py`](../scripts/etl/extraer_reps.py) | ETL con la lógica y las trampas ya documentadas. **Léelo entero antes de correrlo.** |
| [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) | Esquema + la RPC `sedes_cercanas`. Pegar en el SQL Editor y correr. |
| [`lib/db.ts`](../lib/db.ts) | Capa de acceso. Ya intenta la RPC y cae a mock si falla. |
| [`app/api/match/route.ts`](../app/api/match/route.ts) | Orquesta candidatos + ETA + score. |
| [`app/crue/page.tsx`](../app/crue/page.tsx) | Tablero del CRUE. Es la vitrina natural de tu capa de datos. |

---

## Tareas

### Bloque 1 · H2–H10 — datos reales en la mesa

- [ ] **Crear el proyecto en Supabase** y correr `0001_init.sql` completo en el SQL Editor. Llenar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`.
- [ ] **Correr el ETL:**
  ```bash
  cd scripts/etl
  pip install -r requirements.txt
  python extraer_reps.py
  ```
  Produce `salida/sedes.csv`, `salida/capacidad.csv` y `salida/reporte.txt`. **Lee el reporte.**
- [ ] **Cargar los CSV** a Supabase (Table Editor → Import CSV). `sede.geom` no sale del CSV: después de importar `lat`/`lng` a columnas temporales, corre:
  ```sql
  update sede set geom = st_makepoint(lng, lat)::geography where geom is null;
  ```
- [ ] 🔴 **PINTAR TODAS LAS SEDES EN UN MAPA Y MIRARLAS CON LOS OJOS.** No es opcional. Si hay un punto en el Amazonas, en el mar, o en la mitad de los Cerros, el geocoder mintió. Un mapa con puntos absurdos hunde el demo más rápido que no tener mapa.
  ```sql
  select nombre, st_y(geom::geometry) lat, st_x(geom::geometry) lng from sede;
  ```
  Pégalo en geojson.io o similar.
- [ ] **Arreglar las que fallaron** agregándolas a `COORDS_MANUALES` en el ETL. Ya hay 12 clínicas grandes ahí verificadas a mano.

### Bloque 2 · el problema de `servicio_sede`

**Este es tu riesgo número uno.** Sin saber qué servicios tiene habilitados cada sede, el filtro duro no filtra nada y PULSO deja de tener sentido.

No hay un dataset nacional limpio en Socrata. Dos caminos:

- [ ] **Plan A — timebox de 90 minutos, ni un minuto más.** `prestadores.minsalud.gov.co/habilitacion` → consulta pública → filtrar Bogotá → exportar servicios → cargar a `servicio_sede`.
- [ ] **Plan B — si el Plan A pelea, cámbiate sin culpa.** Llena a mano las ~60 sedes que sobreviven al filtro. **Son 60 filas.** Una persona las hace en una hora mirando la consulta pública del REPS, y quedan *perfectas* — mejores que un scraper frágil.

> **No gastes 6 horas peleando con un scraper.** Ese no es el trabajo. El trabajo es que a la hora 10 existan datos reales de Bogotá en la base. Cómo llegaron ahí no sale en el pitch.

### Bloque 3 · H10–H20 — que la query sea rápida y honesta

- [ ] **Verificar que la RPC funciona.** En `lib/db.ts`, si `sedes_cercanas` falla, hace `console.warn` y sigue con mock — o sea, **puede estar rota y tú no enterarte**. Revisa la consola del servidor a propósito.
  ```sql
  select codigo, nombre from sedes_cercanas(4.5981, -74.0758, 25000) limit 5;
  ```
- [ ] **Confirmar que el índice GiST se usa:** `explain analyze` sobre esa query. Sin índice, con 16k filas, se nota.
- [ ] **Mapbox Matrix.** Consigue el token y verifica que `matrizEta` devuelve `conTrafico: true`. El perfil `driving-traffic` acepta **pocas** coordenadas por llamada (`MAX_DESTINOS = 9` en [`lib/mapbox.ts`](../lib/mapbox.ts)). Si Mapbox devuelve 422, es eso: baja el número, no subas el límite.
- [ ] **Sanidad de los ETA.** De la Plaza de Bolívar a Kennedy no son 3 minutos. Si ves tiempos absurdos, el problema es casi siempre lat/lng invertidos — **Mapbox espera `lng,lat`**, al revés de lo intuitivo.
- [ ] **Pulir `/crue`.** Es la pantalla que responde "¿ustedes reemplazan al CRUE?" (no: PULSO propone, el CRUE regula) y donde se ve que la congestión se mueve sola con cada rechazo.

---

## Cómo pruebas lo tuyo

```bash
npm run dev
curl -s -X POST localhost:3000/api/match -H "Content-Type: application/json" \
  -d '{"caso":{"id":"t","origen":{"lat":4.5981,"lng":-74.0758},"serviciosRequeridos":[743,110],"complejidadRequerida":"alta","tipoMovil":"TAM","requiereMedicoABordo":true,"triage":2,"resumen":"prueba","dxCie10":null,"dxDescripcion":"x","edad":54,"sexo":"M","signosAlarma":[],"confianza":1,"textoCrudo":"x","creadoEn":"2026-08-22T00:00:00Z"},"limite":5}'
```

Asserts duros (no "se ve bien"):

- [ ] `evaluadas` > 40 cuando la DB real esté cargada (con mock son 14 — si sigue en 14, **estás leyendo mock sin saberlo**).
- [ ] **Toda** sede con `rank ≥ 1` tiene `743` en `sede.servicios`.
- [ ] **Ninguna** sede sin `743` tiene `rank ≥ 1`.
- [ ] Aparecen 1–3 sedes con `rank: 0` y `motivoDescarte` lleno.
- [ ] Los ETA son plausibles para Bogotá.
- [ ] `latenciaMs` < 2000 con Mapbox activo.

---

## Trampas conocidas

**El filtro de Bogotá.** `departamentodededesc='Bogotá D.C'` — sin punto final, sin coma. Así viene el string en el dataset. Si lo "corriges" a `'Bogotá, D.C.'` devuelve **0 filas** y vas a perder media hora buscando el error en otro lado. (Ya me pasó verificándolo.)

**El dataset de ocupación está muerto.** `uwc4-gvg3` tiene una sola `fecha_corte`: 2022-11-30. **No es un bug del ETL.** Es un snapshot y se usa como *prior* estructural, no como ocupación de hoy. Y es la primera slide del pitch — no lo "arregles", explótalo.

**`lib/db.ts` falla en silencio.** Si la RPC no existe o el nombre no coincide, hace `console.warn` y devuelve mock. Eso es bueno (nadie se bloquea) y peligroso (puedes creer que estás sobre datos reales cuando no). **Revisa la consola del servidor a propósito** cada vez que toques la DB.

**El nombre de la columna en la RPC.** El SQL devuelve `coord` como `jsonb` con `{lat, lng}` justamente para que TypeScript no tenga que mapear nada. Si cambias la forma de salida, se rompe `lib/db.ts` en silencio (llega un `any`).
