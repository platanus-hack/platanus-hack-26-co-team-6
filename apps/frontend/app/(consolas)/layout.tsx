/**
 * Layout de las consolas de operación: /campo, /hospital y /crue.
 *
 * El paréntesis del directorio lo convierte en un route group: agrupa sin
 * aparecer en la URL. Las rutas siguen siendo /campo, /hospital y /crue.
 *
 * Existe para un solo motivo: que la guarda de sesión esté en UN sitio. Una
 * consola nueva que se cuelgue de aquí queda protegida sin que nadie se
 * acuerde de envolverla.
 *
 * La landing (app/page.tsx) queda fuera a propósito: es pública.
 */

import Sesion from "@/components/Sesion";

export default function LayoutConsolas({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Sesion>{children}</Sesion>;
}
