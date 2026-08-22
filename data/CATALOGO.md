# Catalogo de `data/`

> Generado por `scripts/datos/catalogar.py`. **No editar a mano** —
> se sobrescribe. Para cambiar una descripcion, edita `scripts/datos/fuentes.py`.

Ultima generacion: 2026-08-22  ·  17 archivos  ·  17 declarados

## Fuentes en uso

Alimentan `data/procesado/` y de ahi la app.

### `instituciones_emergencia/osb_ofertasrv-ips-urgencias.csv`

84 IPS de Bogota con servicio de urgencias: coords, complejidad, subred, telefono.

cobertura **bogota** · 84 filas · 10 columnas · encoding `cp1252` · 13 KB

Produce: `sedes.json`

> LA fuente del catalogo de sedes. Reemplaza las 14 semillas escritas a mano. Ojo: 2 filas traen lat/lng invertidas (Hospital de Usme, Centro de Salud Patio Bonito) y no trae codigo REPS — se cruza con ins.geojson para sacarlo.

### `instituciones_salud/ins.geojson`

2900 IPS de Bogota geolocalizadas, con codigo REPS, direccion, telefono y naturaleza.

cobertura **bogota** · 2900 filas · encoding `utf-8-sig` · 2500 KB

Produce: `sedes.json`

> Corte REPS jul-2020. Se usa para ENRIQUECER las 84 con su codigo de habilitacion real (cruza 81 de 84). No sirve sola como catalogo de urgencias: incluye odontologias, laboratorios y consultorios.

### `llamadas_123/llamadas123.csv`

9206 incidentes reales del 123 (jun-2026): localidad, tipo, prioridad, edad, sexo, hora.

cobertura **bogota** · 9206 filas · 10 columnas · encoding `latin-1` · 946 KB

Produce: `demanda.json`, `casos-demo.json`

> La joya de la carpeta. Da la curva de demanda REAL por hora y dia, que contradice la curva inventada que tenia congestion.service.ts. Ademas PRIORIDAD_FINAL (Critica/Alta/Media/Baja) mapea a triage 1..4. OJO: trae cp850 y latin-1 MEZCLADOS en la misma linea; se lee con reparar=True. Sin eso, 'USAQUEN' y 'TORACICO' salen corruptos y las localidades no cruzan con las otras fuentes.

> Mojibake: 534 caracteres de control C1 (codepage DOS mezclado). reparado por el pipeline (`reparar=True`).

### `ocupacion_urgencias/osb_ocupacion-urgencias.csv`

Ocupacion mensual de urgencias por subred, 2021-2025. Llega a 219%.

cobertura **bogota** · 57 filas · 13 columnas · encoding `cp1252` · 6 KB

Produce: `ocupacion.json`, `sedes.json`

> El prior estructural de congestion, con numero citable. Cruza con las 84 IPS por Subred: los nombres calzan exacto entre las dos fuentes.

### `urgencias_ambulancias/transporte-especial-de-pacientes-01_07_2026.csv`

225 prestadores de transporte asistencial con marca BASICO / MEDICALIZADO.

cobertura **bogota** · 225 filas · 9 columnas · encoding `utf-8-sig` · 39 KB

Produce: `ambulancias.json`

> Corte jul-2026. Da el universo TAB/TAM real por prestador.

### `CodeSystem-REPShealthcareServices.json`

CodeSystem FHIR de MinSalud: 157 servicios de salud con su codigo REPS.

cobertura **referencia** · 157 filas · encoding `utf-8-sig` · 33 KB

Produce: `servicios.json`

> Ya lo usa catalogo/servicios-reps.ts. Aqui se valida que los codigos existan.

### `tiempo_promedio/osb_ofertasrv-mincentromedico.csv`

Minutos promedio de desplazamiento al centro medico por localidad, 2017-2021.

cobertura **bogota** · 42 filas · 4 columnas · encoding `utf-8-sig` · 1 KB

Produce: `contexto.json`

> Baseline por localidad para comparar contra el ETA de PULSO.

### `razon_camas/osb_tiporazoncamas.csv`

Camas de Bogota por tipo y naturaleza (publica/privada), con tasa por habitante.

cobertura **bogota** · 49 filas · 4 columnas · encoding `cp1252` · 2 KB

Produce: `contexto.json`, `sedes.json`

> Distribucion de camas de TODA la ciudad, no por sede. Se usa como prior estructural para repartir camas por nivel de complejidad.

### `razon_ambulancias/osb_tiporazonambulancias.csv`

952 ambulancias en Bogota: 792 basicas, 236 medicalizadas. Tasa 1,20 por 10k hab.

cobertura **bogota** · 6 filas · 5 columnas · encoding `cp1252` · 0 KB

Produce: `contexto.json`

> Numero de pitch: solo 236 TAM para 7,9 millones de personas.

## Fuentes rotas

Descargas incompletas. **No usar sin re-descargar** — ver el README.

### `uwc4-gvg3.json`

Registro diario de ocupacion de capacidad instalada (REPS).

cobertura **nacional** · 1000 filas · encoding `utf-8-sig` · 845 KB

> INUTILIZABLE tal como esta. Son las primeras 1000 filas del tope por defecto de Socrata, ordenadas alfabeticamente: Antioquia (799), Barranquilla (166), Atlantico (30). CERO registros de Bogota. Re-descargar con $limit y $where — ver REDESCARGA en el README.

### `c36g-9fc2.json`

Registro Especial de Prestadores y Sedes (REPS), directorio nacional.

cobertura **nacional** · 1000 filas · encoding `utf-8-sig` · 802 KB

> INUTILIZABLE tal como esta: 1000 filas, solo Medellin (933) y Leticia (67). CERO de Bogota. Es la misma fuente que scripts/etl/extraer_reps.py descarga bien, con filtro de departamento.

### `s2ru-bqt6.json`

Capacidad instalada por grupo (camas, salas, ambulancias) del REPS.

cobertura **nacional** · 1000 filas · encoding `utf-8-sig` · 718 KB

> INUTILIZABLE tal como esta: 1000 filas, 2 registros de Bogota. Es la fuente que daria camas POR SEDE, que es justo lo que falta hoy. Vale la pena re-descargarla bien.

## Fichas tecnicas

Documentan a su vecino. No traen datos.

### `instituciones_emergencia/metadato-osb_ips-urgencias.csv`

Ficha tecnica de osb_ofertasrv-ips-urgencias.csv.

cobertura **referencia** · 12 filas · 2 columnas · encoding `cp1252` · 1 KB

### `ocupacion_urgencias/metadato_osb_ocupacion-urgencias.csv`

Ficha tecnica de osb_ocupacion-urgencias.csv.

cobertura **referencia** · 9 filas · 2 columnas · encoding `cp1252` · 1 KB

### `razon_camas/metadato-osb_tiporazoncamas.csv`

Ficha tecnica de osb_tiporazoncamas.csv.

cobertura **referencia** · 10 filas · 2 columnas · encoding `cp1252` · 1 KB

### `razon_ambulancias/metadato-osb_tiporazonambulancias.csv`

Ficha tecnica de osb_tiporazonambulancias.csv.

cobertura **referencia** · 10 filas · 2 columnas · encoding `cp1252` · 1 KB

### `tiempo_promedio/metadato_tiempocentrosalud.csv`

Ficha tecnica de osb_ofertasrv-mincentromedico.csv.

cobertura **referencia** · 9 filas · 2 columnas · encoding `cp1252` · 1 KB
