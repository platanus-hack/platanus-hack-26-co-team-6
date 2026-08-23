/**
 * Bloqueo progresivo de login — tarea 1.3, paso 7.
 *
 * POR CUENTA **Y** POR IP, y las dos cosas son necesarias:
 *
 *   solo por cuenta → quien ataca prueba una contraseña comun contra mil
 *                     cuentas distintas y nunca bloquea ninguna
 *                     (*password spraying*, el ataque que de verdad se usa)
 *   solo por IP     → una IPS entera detras de un NAT comparte IP y un
 *                     tecleo torpe deja sin sistema a un turno completo
 *
 * Progresivo y no permanente: 5 fallos → 1 min, 10 → 15 min. Un bloqueo
 * permanente convierte cualquier torpeza en una llamada al administrador a
 * las 3 de la mañana, y aqui al otro lado hay una ambulancia.
 */

import { Injectable } from '@nestjs/common';

const ESCALONES: readonly { fallos: number; esperaMs: number }[] = [
  { fallos: 10, esperaMs: 15 * 60 * 1000 },
  { fallos: 5, esperaMs: 60 * 1000 },
];

/** Sin fallos nuevos en media hora, la cuenta vuelve a empezar de cero. */
const OLVIDO_MS = 30 * 60 * 1000;

interface Intento {
  fallos: number;
  ultimoEn: number;
  bloqueadoHasta: number;
}

@Injectable()
export class BloqueoLogin {
  private readonly intentos = new Map<string, Intento>();

  /** Segundos que faltan, o 0 si puede intentar. Mira cuenta e IP. */
  esperaRestanteS(cuenta: string, ip: string): number {
    const ahora = Date.now();
    const espera = Math.max(
      this.restante(clave('cuenta', cuenta), ahora),
      this.restante(clave('ip', ip), ahora),
    );
    return Math.ceil(espera / 1000);
  }

  registrarFallo(cuenta: string, ip: string): void {
    this.sumar(clave('cuenta', cuenta));
    this.sumar(clave('ip', ip));
  }

  /**
   * Un login bueno limpia SOLO la cuenta, no la IP.
   *
   * Si limpiara la IP, quien ataca desde un sitio con una cuenta propia
   * valida se destraba solo entre tanda y tanda de intentos.
   */
  registrarExito(cuenta: string): void {
    this.intentos.delete(clave('cuenta', cuenta));
  }

  private restante(k: string, ahora: number): number {
    const intento = this.intentos.get(k);
    if (!intento) return 0;
    if (ahora - intento.ultimoEn > OLVIDO_MS) {
      this.intentos.delete(k);
      return 0;
    }
    return Math.max(0, intento.bloqueadoHasta - ahora);
  }

  private sumar(k: string): void {
    const ahora = Date.now();
    const previo = this.intentos.get(k);
    const fallos =
      previo && ahora - previo.ultimoEn <= OLVIDO_MS ? previo.fallos + 1 : 1;

    const escalon = ESCALONES.find((e) => fallos >= e.fallos);
    this.intentos.set(k, {
      fallos,
      ultimoEn: ahora,
      bloqueadoHasta: escalon ? ahora + escalon.esperaMs : 0,
    });
  }
}

const clave = (tipo: 'cuenta' | 'ip', valor: string): string =>
  `${tipo}:${valor.trim().toLowerCase()}`;
