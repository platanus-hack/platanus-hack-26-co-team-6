/**
 * /auditoria/casos/:id — la vista forense de un caso (tarea 4.12).
 *
 * Server component mínimo: en Next 16 `params` es una promesa y se espera
 * aquí. Todo lo demás es cliente, porque la lectura del expediente **queda
 * registrada como un acceso** y tiene que salir del navegador de quien mira,
 * con su sesión — no del servidor de Next con la suya.
 */

import VistaForense from "@/components/auditoria/VistaForense";

export const metadata = {
  title: "PULSO — Expediente forense",
};

export default async function Pagina({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VistaForense casoId={id} />;
}
