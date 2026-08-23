/**
 * Layout del panel de organización: /equipo (tarea 2.5) y lo que cuelgue de él.
 *
 * Existe por una sola razón, y es la misma que la del layout de `(consolas)`:
 * que la guarda de sesión esté en UN sitio. `(panel)` nació como grupo
 * hermano de `(consolas)`, así que **no heredaba nada**: `/equipo` era la
 * única ruta con datos de la organización servida sin `<Sesion>` alrededor.
 *
 * No es que estuviera desprotegida —la autorización de verdad la hace core,
 * que responde 401 y 403 aunque este archivo no exista— pero sin esto la
 * página se pintaba entera antes de recibir el 403, que es la pantalla que
 * `<Sesion>` está para evitar.
 *
 * La guarda de rol (`admin_organizacion`) sale de `ROL_DE_CONSOLA` en
 * `lib/sesion-modelo.ts`, que ya conoce `/equipo`.
 */

import Sesion from "@/components/Sesion";

export default function LayoutPanel({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Sesion>{children}</Sesion>;
}
