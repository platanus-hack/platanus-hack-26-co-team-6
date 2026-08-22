/**
 * Plazos del handshake.
 *
 * Vive aparte porque tres piezas necesitan el MISMO numero y no pueden
 * discrepar: DispatchService lo usa para sellar `expiraEn`, AlmacenService
 * para decidir que ya vencio, y CapacidadesService para que /campo pinte el
 * cronometro. Tres constantes separadas serian tres relojes distintos.
 */

import type { ConfigService } from '@nestjs/config';

/**
 * Cuanto espera una solicitud antes de pasar al siguiente candidato.
 *
 * 45 segundos no es un numero de ingenieria, es de operacion: es lo que un
 * jefe de urgencias tarda en mirar el celular y tocar un boton sin sentirse
 * apurado, y lo que un paramedico aguanta mirando una pantalla sin concluir
 * que el sistema se colgo. Mas corto rebota solicitudes que iban a ser
 * aceptadas; mas largo regala tiempo de hora dorada a un hospital que ya
 * decidio no contestar.
 */
export const HANDSHAKE_TIMEOUT_S = 45;

/** Permite acortarlo en el ensayo del demo sin recompilar. */
export function handshakeTimeoutS(config: ConfigService): number {
  const crudo = config.get<string>('HANDSHAKE_TIMEOUT_S');
  const n = Number(crudo);
  return Number.isFinite(n) && n > 0 ? n : HANDSHAKE_TIMEOUT_S;
}
