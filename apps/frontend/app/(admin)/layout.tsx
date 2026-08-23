/**
 * Layout de la consola de plataforma.
 *
 * El paréntesis lo convierte en route group: agrupa sin aparecer en la URL.
 * Las rutas siguen siendo `/admin/catalogos` y `/admin/modelos`.
 *
 * Va SEPARADO de `(consolas)` a propósito. Aquel envuelve /campo, /hospital y
 * /crue, cuyo lenguaje visual es un activo del producto y no se toca. Este es
 * un panel de escritorio interno, y `apps/frontend/AGENTS.md` dice que los dos
 * lenguajes conviven a propósito.
 *
 * La guarda de sesión es la misma (`<Sesion>`), y encima va la de rol, que la
 * hace `MarcoAdmin` con lo que responde `GET /admin/acceso`. Ninguna de las
 * dos es la seguridad: core responde 401 y 403 aunque se borren.
 */

import Sesion from "@/components/Sesion";
import { MarcoAdmin } from "@/components/admin/MarcoAdmin";

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return (
    <Sesion>
      <MarcoAdmin>{children}</MarcoAdmin>
    </Sesion>
  );
}
