# DATOS SINTETICOS — ni un paciente, ni una persona, ni un telefono de esta carpeta es real.

> Los pacientes, los dictados, las respuestas de los hospitales, los actores, los correos,
> los telefonos, las placas y los NIT son **inventados**. Los nombres se arman combinando
> dos listas de fantasia. Los correos usan `@demo.pulso.invalid` (`.invalid` esta reservado
> por la RFC 2606 y no resuelve nunca). Los telefonos usan el rango de ficcion `555-01xx`
> sobre el indicativo de Bogota: ningun operador colombiano entrega esos numeros.

## Que SI es real

| Dato | Fuente |
|---|---|
| Sedes, codigos REPS de 12 digitos, direcciones, localidades, coordenadas, complejidad, camas instaladas | `data/procesado/sedes.json` (REPS de Bogota) |
| Curva horaria y reparto por localidad de los casos | `data/procesado/demanda.json` (9206 incidentes del 123) |
| Ocupacion por subred que inclina el estado de cada sede | `data/procesado/ocupacion.json` |
| Operadores de transporte asistencial y su marca TAB/TAM | `data/procesado/ambulancias.json` |
| Codigos de servicio REPS | `data/procesado/servicios.json` |

El codigo de sede es **`codigohabilitacionsede`, de 12 digitos**. No es `codigoprestador`,
de 10, que colapsa una subred entera en un solo codigo. Ver `data/CATALOGO.md`.

## Como se regenera

```bash
python3 scripts/datos/generar_sintetico.py
```

Determinista: semilla `20260822` fija. Dos corridas dan archivos identicos byte a byte.
Un demo que cambia en cada corrida no se puede ensayar.

## Como se enciende en el demo

```bash
PULSO_DEMO_SINTETICO=true pnpm --filter core start
```

Por defecto esta **apagado**. Arrancar produccion con datos falsos por accidente es peor
que un demo vacio.

## El turno: 2026-08-22 19:00 → 2026-08-23 07:00

| Archivo | Filas |
|---|---|
| `sedes_estado.csv` | 84 |
| `camas.csv` | 240 |
| `casos.csv` | 120 |
| `dictados.csv` | 120 |
| `handshakes.csv` | 205 |
| `eventos_caso.csv` | 1317 |
| `moviles.csv` | 40 |
| `posiciones.csv` | 600 |
| `mensajes.csv` | 150 |
| `escalamientos.csv` | 14 |
| `organizaciones.csv` | 20 |
| `actores.csv` | 82 |

Todas las marcas de tiempo son ISO 8601 con offset `-05:00` (Bogota no tiene horario de verano).
Los CSV son `utf-8`, separador coma, con cabecera, terminador de linea `\n`.

## Diccionario de columnas

### `sedes_estado.csv`

| Columna | Que es |
|---|---|
| `codigo_sede` | codigo_habilitacion_sede del REPS, 12 digitos. PK. REAL. |
| `nombre_sede` | nombre de la IPS segun el REPS. REAL. |
| `localidad` | localidad de Bogota. REAL. |
| `subred` | subred integrada de servicios de salud. REAL. |
| `complejidad` | baja | media | alta (Res. 3100/2019). REAL. |
| `estado` | recibiendo | saturado | contingencia | cerrado. SINTETICO. |
| `motivo` | texto libre; vacio cuando el estado es `recibiendo`. |
| `declarado_en` | ISO 8601 con offset -05:00. |
| `vence_en` | ISO 8601; vacio si el estado no vence. |
| `declarado_por` | rol:alcance de quien lo declaro. |

### `camas.csv`

| Columna | Que es |
|---|---|
| `codigo_sede` | FK a sedes_estado.codigo_sede. |
| `tipo_cama` | nombre REPS del tipo de cama. REAL. |
| `total` | camas instaladas (unidad: camas). REAL, del REPS. |
| `ocupadas` | camas ocupadas al corte del turno (camas). SINTETICO. |
| `disponibles` | total - ocupadas (camas). |
| `ocupadas_snapshot_reps` | ocupadas del snapshot REPS 2022-11-30. REAL, es un prior. |
| `medido_en` | ISO 8601 del corte. |

### `casos.csv`

| Columna | Que es |
|---|---|
| `caso_id` | CAS-NNNN. Estable entre corridas. |
| `creado_en` | ISO 8601 -05:00. Reparte segun la curva horaria real del 123. |
| `hora_turno` | hora local 0-23, para agrupar sin parsear fechas. |
| `triage` | 1..5 (Res. 5596/2015). |
| `dx_cie10` | codigo CIE-10 del protocolo. |
| `dx_descripcion` | descripcion clinica del dx. |
| `resumen` | una linea, como la diria un medico. |
| `servicios_requeridos` | codigos REPS separados por espacio. 743 = hemodinamia (NO 408). |
| `complejidad_requerida` | baja | media | alta. |
| `edad` | anios. |
| `sexo` | M | F. |
| `signos_alarma` | hallazgos separados por ' | '. |
| `requiere_medico_abordo` | true | false. true obliga TAM. |
| `confianza` | 0..1 del parser. < 0.5 exige revision humana. |
| `tipo_movil` | TAB | TAM. |
| `movil_id` | FK a moviles.movil_id. |
| `localidad` | localidad del origen, sin tildes y en mayuscula (como el 123). |
| `origen_lat` | grados decimales, dentro de la caja de Bogota. |
| `origen_lng` | grados decimales, dentro de la caja de Bogota. |
| `telefono_reporta` | telefono FICTICIO, rango 555-01xx. No es asignable. |
| `protocolo` | clave del protocolo clinico usado. |

### `dictados.csv`

| Columna | Que es |
|---|---|
| `caso_id` | FK a casos.caso_id, 1:1. |
| `texto_crudo` | el dictado literal. PII sintetica: no sale del servidor. |
| `canal` | whatsapp | consola. |
| `duracion_s` | segundos de audio estimados. |
| `ambiguo` | true = escrito a proposito para forzar confianza baja. |
| `confianza_declarada` | 0..1, la misma de casos.confianza. |
| `dictado_en` | ISO 8601. |

### `handshakes.csv`

| Columna | Que es |
|---|---|
| `handshake_id` | HSK-NNNN. |
| `caso_id` | FK a casos.caso_id. |
| `codigo_sede` | FK a sedes_estado.codigo_sede. |
| `nombre_sede` | denormalizado, para leer el CSV sin join. |
| `canal` | telegram | whatsapp | consola. |
| `estado` | enviado | aceptado | rechazado | timeout. |
| `motivo_rechazo` | texto; vacio salvo en `rechazado`. |
| `enviado_en` | ISO 8601. |
| `expira_en` | ISO 8601 = enviado_en + 90 s. |
| `respondido_en` | ISO 8601; vacio en `timeout`. |
| `latencia_s` | segundos hasta la respuesta; vacio en `timeout`. |
| `eta_min_al_despachar` | minutos estimados (haversine / 0.38 km-min). |
| `intento` | 1 = primer toque; > 1 = rebote. |

### `eventos_caso.csv`

| Columna | Que es |
|---|---|
| `evento_id` | entero creciente. Es la clave a la que apunta corrige_a. |
| `caso_id` | FK a casos.caso_id. |
| `tipo` | uno de los 22 tipos de la migracion 0007. |
| `ocurrido_en` | ISO 8601. |
| `actor_id` | `svc:*` para servicios, `rol:alcance` para humanos. |
| `actor_nombre` | nombre de fantasia, o el nombre del servicio. |
| `actor_tipo` | humano | servicio | sistema. |
| `codigo_sede` | sede implicada; vacio si no aplica. |
| `movil_id` | movil implicado; vacio si no aplica. |
| `detalle` | texto SIN PII: aqui no entra el dictado ni el origen. |
| `corrige_a` | evento_id que este evento corrige. Vacio = no corrige nada. |

### `moviles.csv`

| Columna | Que es |
|---|---|
| `movil_id` | AMB-NNN. |
| `tipo` | TAB | TAM. |
| `operador` | prestador de transporte asistencial. REAL (corte 01/07/2026). |
| `placa` | placa FICTICIA. |
| `base_localidad` | localidad de la base. |
| `tripulacion` | dos nombres de fantasia. |
| `disponible` | true | false. |
| `turno` | noche. |

### `posiciones.csv`

| Columna | Que es |
|---|---|
| `movil_id` | FK a moviles.movil_id. |
| `lat` | grados decimales, dentro de Bogota. |
| `lng` | grados decimales, dentro de Bogota. |
| `precision_m` | radio de error del GPS en METROS. No es decorativo. |
| `velocidad_kmh` | kilometros por hora. |
| `disponible` | true | false al momento del reporte. |
| `reportado_en` | ISO 8601, sello del servidor. |

### `mensajes.csv`

| Columna | Que es |
|---|---|
| `wamid` | id del mensaje de WhatsApp. FICTICIO, prefijo `wamid.DEMO`. |
| `proveedor` | whatsapp. |
| `direccion` | entrada | salida. |
| `telefono` | FICTICIO, rango 555-01xx. |
| `caso_id` | FK a casos.caso_id. |
| `cuerpo` | texto del mensaje. |
| `ts` | ISO 8601. |

### `escalamientos.csv`

| Columna | Que es |
|---|---|
| `escalamiento_id` | ESC-NNN. |
| `caso_id` | FK a casos.caso_id. |
| `motivo` | sin-candidatos | candidatos-agotados | solicitud-paramedico. |
| `sedes_intentadas` | codigos de sede separados por espacio. |
| `detalle` | texto. |
| `creado_en` | ISO 8601. |
| `atendido_en` | ISO 8601; vacio = sigue en la cola del CRUE. |
| `atendido_por` | regulador_crue:<nombre de fantasia>; vacio si no lo tomo nadie. |

### `organizaciones.csv`

| Columna | Que es |
|---|---|
| `organizacion_id` | ORG-NNN. |
| `tipo` | ips | operador_ambulancia | crue | entidad_pagadora. |
| `razon_social` | para IPS y operadores es REAL (REPS / Secretaria). |
| `nombre_corto` | para pintar en la UI. |
| `nit` | FICTICIO, prefijo 9000. |
| `estado` | activa (solo `activa` es despachable, migracion 0004). |
| `verificacion` | reps_automatico | manual | pendiente. |
| `codigo_sede` | sede REPS vinculada; vacio para operadores y CRUE. |

### `actores.csv`

| Columna | Que es |
|---|---|
| `actor_id` | ACT-NNN. |
| `organizacion_id` | FK a organizaciones.organizacion_id. |
| `tipo` | humano | servicio. |
| `nombre` | nombre de FANTASIA, o el id del servicio. |
| `identificador` | correo @demo.pulso.invalid (RFC 2606: nunca resuelve) o `svc:*`. |
| `telefono` | FICTICIO, rango 555-01xx. |
| `rol` | paramedico | jefe_urgencias | admin_organizacion | regulador_crue | auditor | servicio. |
| `codigo_sede` | alcance del rol; vacio = toda la organizacion. |
| `activo` | true | false. |
