/**
 * Limite de tasa por IP para los endpoints publicos de afiliacion — 2.1.
 *
 * ⚠️ ESTO LO REEMPLAZA LA TAREA 2.11 (Sebas), que ya esta abierta en el
 *    PR #15 con `common/limite-tasa.ts` — un limitador por ACTOR, general,
 *    para toda mutacion autenticada. Cuando mergee, este archivo se borra y
 *    el decorador de `afiliacion.controller.ts` apunta alla.
 *
 *    Se escribe igual porque `POST /afiliacion/verificar` es publico HOY y
 *    2.11 no esta en esta rama: dejarlo sin limite mientras tanto es dejar
 *    abierto justo el endpoint que enumera el REPS.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  QUE PROTEGE, HONESTAMENTE
 * ═══════════════════════════════════════════════════════════════════
 *  El REPS es publico: quien quiera el listado se lo baja del Ministerio, no
 *  lo raspa de aqui. Lo que este limite protege es el COSTO — cada consulta
 *  calcula trigramas contra el catalogo entero— y el ruido en la auditoria.
 *  No se vende como una defensa contra enumeracion, porque no lo es.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  VENTANA DESLIZANTE, Y EN MEMORIA
 * ═══════════════════════════════════════════════════════════════════
 *  Ventana deslizante y no contador por minuto porque un contador que se
 *  reinicia en punto deja pasar el doble del limite a caballo del reinicio.
 *
 *  En memoria: con dos instancias en Render el limite es por instancia, o
 *  sea el doble. Es una degradacion conocida y aceptable para un limite de
 *  costo — NO lo seria para la deduplicacion de webhooks (tarea 0.4), que
 *  por eso vive en Postgres.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PulsoError } from '../common/pulso-error.filter';

/** Un formulario de 4 pasos que reintenta no pasa de esto. Un script si. */
export const LIMITE_POR_VENTANA = 20;
export const VENTANA_MS = 60_000;

/** Si crece mas que esto, se purga. Techo de memoria ante muchas IPs. */
const MAX_CLAVES = 10_000;

@Injectable()
export class LimiteIp {
  private readonly log = new Logger(LimiteIp.name);
  /** clave → marcas de tiempo dentro de la ventana. */
  private readonly golpes = new Map<string, number[]>();

  /**
   * Registra un golpe y revienta con 429 si se paso.
   *
   * `ahora` es parametro para poder probar la ventana sin dormir el test.
   */
  exigir(clave: string, ahora = Date.now()): void {
    const desde = ahora - VENTANA_MS;
    const previos = (this.golpes.get(clave) ?? []).filter((t) => t > desde);

    if (previos.length >= LIMITE_POR_VENTANA) {
      // La IP NO va al mensaje ni al log: es dato personal bajo la ley
      // colombiana y la regla 5 del repo no distingue entre PII clinica y
      // el resto. Se cuenta el evento, no a quien lo hizo.
      this.log.warn(
        `limite de tasa alcanzado en afiliacion (${previos.length} en ${VENTANA_MS / 1000} s)`,
      );
      const esperaS = Math.ceil((previos[0] + VENTANA_MS - ahora) / 1000);
      throw new PulsoError(
        'PULSO_RATE_LIMITED',
        `Demasiadas consultas seguidas. Vuelve a intentar en ${esperaS} s.`,
        { esperaS },
        // Reintentable: no es un error del que llama, es un «ahora no».
        true,
        429,
      );
    }

    previos.push(ahora);
    this.golpes.set(clave, previos);
    if (this.golpes.size > MAX_CLAVES) this.purgar(desde);
  }

  private purgar(desde: number): void {
    for (const [clave, marcas] of this.golpes) {
      const vivas = marcas.filter((t) => t > desde);
      if (vivas.length) this.golpes.set(clave, vivas);
      else this.golpes.delete(clave);
    }
  }

  /** Solo para los tests. */
  vaciar(): void {
    this.golpes.clear();
  }
}
