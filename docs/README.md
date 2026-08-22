# Documentación de PULSO

## 📐 Plan de producto y arquitectura — leer en este orden

| # | Documento | Qué responde |
|---|---|---|
| **I** | [pulso-agente-campo-y-roles.md](pulso-agente-campo-y-roles.md) | ¿Qué prompt tiene el agente de campo? ¿Cruza historial clínico? ¿Genera el reporte del paramédico? ¿Rutea por ubicación? **Diagnóstico del estado real del repo.** |
| **II** | [pulso-plataforma-afiliacion-y-tramites.md](pulso-plataforma-afiliacion-y-tramites.md) | Modelo de datos completo, roles, afiliación autoverificada contra REPS, CRUD, recepción asistida, **los 15 trámites**, multitenancy, auditoría de eventos y de completitud del registro. |
| **III** | [pulso-produccion-plan-maestro.md](pulso-produccion-plan-maestro.md) | Arquitectura objetivo, stack justificado, **34 vistas**, webhooks de entrada y salida, integración **IHCE/RDA (FHIR R4)**, seguridad, observabilidad, CI, y **el backlog de 64 tareas**. |
| **IV** | [multitenancy-y-autenticacion.md](multitenancy-y-autenticacion.md) | La solución completa de identidad, login, RBAC, aislamiento de inquilinos y **los 19 casos límite**. |

> **El hallazgo que reordena el producto** está en [III §0](pulso-produccion-plan-maestro.md#0-el-hallazgo-que-reordena-el-producto):
> Colombia tiene el modelo IHCE en operación desde el **15 de abril de 2026**, obligatorio para todo
> prestador REPS, en **HL7 FHIR R4** — y **el plazo ya venció**. PULSO ya produce buena parte del
> contenido del RDA de urgencias.

## ✅ Tareas

| Carril | Documento |
|---|---|
| Índice y protocolo de merge | [tareas/README.md](tareas/README.md) |
| Juan | [tareas/juan.md](tareas/juan.md) |
| Zaid | [tareas/zaid.md](tareas/zaid.md) |
| Neid | [tareas/neid.md](tareas/neid.md) |
| Sebas | [tareas/sebas.md](tareas/sebas.md) |

**64 tareas, 16 por persona, 6 olas.** Todos hacen de todo; dentro de una ola nadie toca el archivo de otro.

## 📋 Referencia

| Documento | Qué es |
|---|---|
| [contrato-api.md](contrato-api.md) | **Ley.** Los contratos entre los cuatro carriles. Léelo antes de tocar nada. |
| [PULSO-validaciones-backend.md](PULSO-validaciones-backend.md) | Catálogo de validaciones de negocio (§1 a §12). Se cita en todo el plan. |
| [runbooks/](runbooks/) | Qué hacer cuando algo se cae (tarea 5.5). |

## 🗂️ Documentos de la hackathon (histórico)

Escritos para las 36 horas. **Conservan contexto útil pero apuntan a rutas que ya cambiaron** — el plan vigente es el de arriba.

[juan-frontend.md](juan-frontend.md) · [juan-campo-v2.md](juan-campo-v2.md) · [juan-frontend-pulsewave.md](juan-frontend-pulsewave.md) · [zaid-backend.md](zaid-backend.md) · [zaid-neyl.md](zaid-neyl.md) · [neid-ai.md](neid-ai.md) · [neid-faltantes.md](neid-faltantes.md) · [sebas-producto.md](sebas-producto.md)
