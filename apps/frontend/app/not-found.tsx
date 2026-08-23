/**
 * 404 — la ruta no existe.
 *
 * Next la sirve para cualquier URL sin página Y para cualquier `notFound()`
 * que lance un segmento dinámico. En PULSO el segundo caso es el frecuente:
 * `/hospital/recepcion/<casoId>` con un id viejo, o `/auditoria/casos/<id>`
 * de un caso que ya se cerró y no llegó a persistirse.
 *
 * Por eso el texto no dice "página no encontrada" a secas: dice también que
 * el caso pudo cerrarse, que es la explicación real nueve de cada diez veces
 * y la que evita que alguien crea que el sistema se rompió.
 */

import { Rescate, Salidas } from "@/components/Salidas";

export default function NoEncontrado() {
  return (
    <Rescate titulo="Esta pantalla no existe">
      <p className="mb-5 text-xs text-[color:var(--color-texto-tenue)]">
        O la dirección está mal escrita, o el caso al que apunta ya se cerró.
        Ninguna de las dos cosas significa que el sistema esté caído: las demás
        consolas siguen funcionando.
      </p>
      <Salidas />
    </Rescate>
  );
}
