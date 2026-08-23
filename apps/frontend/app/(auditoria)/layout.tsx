/**
 * Layout de la consola de auditoría: /auditoria/casos/:id.
 *
 * El paréntesis lo convierte en route group: agrupa sin aparecer en la URL.
 *
 * Va aparte de `(consolas)` porque no es una consola de operación: aquí no se
 * despacha ni se acepta nada, solo se lee lo que ya pasó. Comparte la guarda
 * de sesión —una pantalla que hace polling contra un 401 no le sirve a
 * nadie— pero **la autorización de verdad la hace core**: `auditor`,
 * `regulador_crue` y `admin_organizacion` de su propia organización, con un
 * 403 explicado para todos los demás. Por eso `ROL_DE_CONSOLA` no declara
 * `/auditoria`: fingir aquí un permiso que el servidor niega sería peor que
 * no comprobar nada.
 */

import Sesion from "@/components/Sesion";

export default function LayoutAuditoria({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Sesion>{children}</Sesion>;
}
