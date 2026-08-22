# Tareas — 64 en 4 carriles, 16 por persona

> Detalle de ejecución del backlog de [pulso-produccion-plan-maestro.md](../pulso-produccion-plan-maestro.md) §10.
> Base conceptual: [I · agente y roles](../pulso-agente-campo-y-roles.md) · [II · afiliación y trámites](../pulso-plataforma-afiliacion-y-tramites.md) · [IV · multitenancy y login](../multitenancy-y-autenticacion.md).

| Carril | Archivo | Tareas |
|---|---|---|
| Juan | [juan.md](juan.md) | 0.4 · 0.7 · 1.4 · 1.8 · 2.1 · 2.5 · 2.9 · 3.4 · 3.7 · 3.11 · 4.3 · 4.8 · 4.12 · 5.3 · 5.7 · 5.11 |
| Zaid | [zaid.md](zaid.md) | 0.2 · 0.8 · 1.1 · 1.5 · 2.4 · 2.8 · 2.12 · 3.3 · 3.6 · 3.9 · 4.4 · 4.6 · 4.11 · 5.1 · 5.6 · 5.10 |
| Neid | [neid.md](neid.md) | 0.3 · 0.5 · 1.2 · 1.6 · 2.2 · 2.6 · 2.10 · 3.1 · 3.8 · 3.12 · 4.2 · 4.7 · 4.9 · 5.4 · 5.8 · 5.12 |
| Sebas | [sebas.md](sebas.md) | 0.1 · 0.6 · 1.3 · 1.7 · 2.3 · 2.7 · 2.11 · 3.2 · 3.5 · 3.10 · 4.1 · 4.5 · 4.10 · 5.2 · 5.5 · 5.9 |

---

## Cómo se trabaja

**Todos hacen de todo.** Los carriles rotan de dominio en cada ola: quien hizo frontend en la ola 1 hace migraciones en la 2. Se gana redundancia de conocimiento y nadie queda de cuello de botella.

**Dentro de una ola, nadie toca el archivo de otro.** Es la única regla que hace que se pueda mergear sin dolor. Cada tarea declara su dominio de archivos.

### El archivo compartido tiene dueño por ola

`apps/backend/core/src/contracts/types.ts` y su espejo `apps/frontend/lib/types.ts` son la zona de choque garantizada.

> 1. Al abrir la ola, **el dueño de tipos** mergea PRIMERO un PR que solo toca esos dos archivos, con todos los campos nuevos de la ola, **todos opcionales**.
> 2. Los otros tres rebasan sobre eso y ya no tocan tipos en esa ola.
> 3. Rota: **Ola 1 Zaid · Ola 2 Juan · Ola 3 Neid · Ola 4 Sebas · Ola 5 Zaid**.

### Orden de merge dentro de cada ola

Nueve pares comparten directorio. El primero mergea, el segundo rebasa.

| Ola | Primero | Después | Por qué |
|---|---|---|---|
| 0 | 0.6 | 0.1 | 0.1 devuelve el nuevo código de motivo |
| 1 | 1.1 | 1.5, 1.6 | Las policies necesitan las tablas |
| 1 | 1.3 | 1.4, 1.8 | Ambas consumen el token nuevo |
| 2 | **2.7** | 2.4, 2.5, 2.10 | Todas cuelgan del layout de `/panel` |
| 2 | **2.8** | todo el frontend de la ola | `lib/api.ts` es el archivo más compartido |
| 2 | 2.1 | 2.2, 2.3, 2.6, 2.9 | API antes que vistas |
| 2 | 2.2 | 2.3 | 2.3 es un componente dentro de 2.2 |
| 3 | 3.1 | 3.2 → 3.8, 3.10, 3.11 | Cadena estricta: esquema → cableado → worker |
| 3 | 3.6 | 3.7 | 3.7 agrega `posicion.ts` |

**Regla general:** quien abre un directorio nuevo lo mergea primero, aunque su tarea sea más pequeña.

### Convenciones

- Ramas: `feat/<ola>-<id>-<slug>` — ej. `feat/o0-0.1-aceptacion-unica`
- PRs pequeños, un revisor, `task doctor` verde antes de pedir revisión
- **`grep -rn "<<<<<<<" apps/` después de cada pull** — ya pasó una vez que se commiteó un merge con marcadores adentro (`4b6efce`)
- Identificadores en español **sin tildes**; tildes solo en texto visible
- Next 16.3.1 tiene breaking changes: leer `node_modules/next/dist/docs/` antes de codear

### Definición de "listo" — aplica a TODA tarea

- [ ] Tests que prueban comportamiento, no implementación
- [ ] Sin credenciales → degrada y **lo dice** (regla del repo)
- [ ] Toda mutación es idempotente y escribe su `evento_caso`
- [ ] Sin PII en logs ni en URLs (`textoCrudo`, `origen`, teléfono, `pacienteToken`)
- [ ] Alcance de inquilino verificado **en el servidor**
- [ ] `contracts/types.ts` sin cambios fuera del protocolo de la ola
- [ ] Si es UI de campo: tocable con guantes (≥44 px, primarios 56 px), legible a bajo brillo, sin scroll horizontal 320-430 px, respeta `prefers-reduced-motion`
- [ ] `task doctor` verde
