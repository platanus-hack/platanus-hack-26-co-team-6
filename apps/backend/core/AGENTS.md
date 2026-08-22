# core — instrucciones para agentes

Lee primero [`AGENTS.md` de la raíz](../../../AGENTS.md) y [`README.md`](README.md) de este servicio.

## Reglas propias de core

1. **`src/contracts/types.ts` es ley.** No se cambia en silencio; campos nuevos opcionales.
2. **`SesionGuard` es global y niega por defecto.** Una ruta nueva queda protegida sola. Abrir exige
   `@Publico()` a propósito. **No cambies eso.**
3. **La lógica vive en el servicio, no en el controlador.** `HandshakeService` existe separado porque
   lo llaman la consola **y** el webhook de Telegram.
4. **`despojar()` en `estado.service.ts` se escribe campo por campo, no con rest spread.** Si agregas un
   campo a `Caso` y deja de compilar, es la funcionalidad haciendo su trabajo: decide si ese dato puede
   salir del servidor.
5. **Un handshake vencido no revive.** Aceptar tarde devuelve `aplicada: false`. Dos hospitales
   preparando cama para el mismo paciente es peor que un rechazo.
6. **El timeout lo sella el servidor** (`expiraEn`) y viaja al cliente, para que el cronómetro de
   `/campo` cuente contra el mismo reloj. **No inventes el plazo en el front.**
7. **Un rechazo mueve la congestión de la sede.** Ese es el sensor del producto: el acto de rechazar
   *ya es* el dato. No lo pierdas.

## Trampas conocidas

- **`AlmacenService` es un `Map`.** Todo lo que "guardes" ahí desaparece al reiniciar.
- **`PersistenceModule` elige memoria sin `PULSO_ROUTING_DATABASE_URL`** y lo avisa en el log. Si tu
  test depende de persistencia, ponla.
- **`SUPABASE_SERVICE_ROLE_KEY` se salta RLS.** Mientras core hable con la service role, las policies
  no protegen nada.
- **`VigilanteService` usa `@Interval` en el proceso web.** Con dos instancias, dos vigilantes vencen el
  mismo handshake.
- **El prompt clínico de `src/triage/triage.service.ts` es copia del de `ai-core`.** Si tocas uno,
  toca el otro — o mejor, cierra la [tarea 0.5](../../../docs/tareas/neid.md#05--un-solo-prompt-clínico).

## Tareas de este servicio

[0.1](../../../docs/tareas/sebas.md#01--conectar-el-guard-de-aceptación-única) · [0.6](../../../docs/tareas/sebas.md#06--motivos-de-rechazo-como-enum-versionado) · [0.8](../../../docs/tareas/zaid.md#08--corregir-el-filtro-de-móvil) · [1.2](../../../docs/tareas/neid.md#12--persistir-caso-y-handshake) · [1.3](../../../docs/tareas/sebas.md#13--sesión-con-actor-real) · [1.5](../../../docs/tareas/zaid.md#15--rol-no-owner--force-rls--encontextode) · [3.1](../../../docs/tareas/neid.md#31--evento_caso--registroservice) · [3.2](../../../docs/tareas/sebas.md#32--cablear-los-22-eventos) · [3.3](../../../docs/tareas/zaid.md#33--sede_estado--capacidad_declarada--filtro-duro) · [4.1](../../../docs/tareas/sebas.md#41--tabla-recepcion--protocolos) · [4.6](../../../docs/tareas/zaid.md#46--tabla-tramite--motor-de-trámites) · [5.1](../../../docs/tareas/zaid.md#51--webhooks-salientes-outbox)
