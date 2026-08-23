import { redirect } from "next/navigation";

/**
 * `/admin` no es una pantalla: es la puerta a dos. Se entra por catálogos
 * porque es donde vive la lógica clínica que se toca todos los días; los
 * modelos se miran cuando algo no cuadra.
 */
export default function Admin() {
  redirect("/admin/catalogos");
}
