/**
 * Registro de sesiones — tarea 1.3, pasos 3 y 4.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  QUE RESUELVE
 * ═══════════════════════════════════════════════════════════════════
 *  El access token dura 15 minutos y lleva los roles adentro para no
 *  consultar la base en cada request. El precio de eso es que un rol
 *  revocado seguiria vivo hasta 15 minutos — y hay un caso donde eso no se
 *  puede aceptar: **revocar a alguien tiene que surtir efecto YA**. De ahi
 *  este registro: el guard pregunta por `sid` en memoria, no en Postgres.
 *
 *  Y de ahi tambien la **rotacion con deteccion de reuso**: un refresh que
 *  ya se uso y reaparece significa que alguien tiene una copia. No se
 *  bloquea ese token: se revoca **la cadena completa** de la sesion. Es lo
 *  que convierte un token robado en un incidente detectable en vez de un
 *  acceso permanente.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  ⚠️ VIVE EN RAM, Y ESO SE DICE
 * ═══════════════════════════════════════════════════════════════════
 *  El plan pide la tabla `sesion` con la lista de revocadas cacheada en
 *  Redis. Ninguna de las dos existe todavia (la persistencia es 1.2). Este
 *  registro es la misma logica contra un `Map`, detras de una interfaz que
 *  1.2 implementa sin que ninguna ruta se entere.
 *
 *  Lo que se pierde al reiniciar: TODAS las sesiones se invalidan de golpe.
 *  Es molesto y es el lado seguro del fallo — nunca al reves. Lo mismo ya
 *  pasa con `AlmacenService` y esta documentado igual.
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export type MotivoRevocacion =
  | 'logout'
  | 'reuso_de_refresh'
  | 'rol_revocado'
  | 'cambio_de_contrasena'
  | 'revocacion_manual';

export interface EventoSeguridad {
  tipo: 'refresh_reusado' | 'sesion_revocada' | 'intento_cruzado' | 'bloqueo';
  actorId: string;
  sesionId?: string;
  detalle: string;
  en: string;
}

export interface Sesion {
  id: string;
  actorId: string;
  creadaEn: string;
  expiraEn: number;
  revocadaEn: string | null;
  motivoRevocacion: MotivoRevocacion | null;
  /** El unico refresh que sirve ahora mismo. */
  jtiVigente: string;
  /** Los que ya se gastaron. Si uno reaparece, hay una copia por ahi. */
  jtiUsados: Set<string>;
}

export type ResultadoRotacion =
  | { ok: true; jti: string }
  | { ok: false; motivo: 'desconocida' | 'revocada' | 'expirada' | 'reuso' };

@Injectable()
export class RegistroSesiones {
  private readonly log = new Logger(RegistroSesiones.name);
  private readonly sesiones = new Map<string, Sesion>();

  /**
   * Ultimos eventos de seguridad. Los consume el tablero de 5.5 y, cuando
   * exista `RegistroService` (3.1), se reenvian ahi. Acotado a proposito:
   * esto es una pista, no el registro de auditoria.
   */
  private readonly eventos: EventoSeguridad[] = [];
  private static readonly MAX_EVENTOS = 200;

  abrir(actorId: string, duracionRefrescoMs: number): Sesion {
    this.purgar();
    const sesion: Sesion = {
      id: randomUUID(),
      actorId,
      creadaEn: new Date().toISOString(),
      expiraEn: Date.now() + duracionRefrescoMs,
      revocadaEn: null,
      motivoRevocacion: null,
      jtiVigente: randomUUID(),
      jtiUsados: new Set(),
    };
    this.sesiones.set(sesion.id, sesion);
    return sesion;
  }

  obtener(sid: string): Sesion | undefined {
    return this.sesiones.get(sid);
  }

  /**
   * ⭐ Lo que consulta el guard en cada request.
   *
   * Una sesion desconocida cuenta como NO vigente: tras un reinicio los
   * tokens firmados siguen siendo validos criptograficamente pero su sesion
   * ya no existe, y dejarlos pasar seria justo el agujero que este registro
   * viene a cerrar.
   */
  vigente(sid: string): boolean {
    const s = this.sesiones.get(sid);
    return Boolean(s && !s.revocadaEn && s.expiraEn > Date.now());
  }

  revocar(sid: string, motivo: MotivoRevocacion): void {
    const s = this.sesiones.get(sid);
    if (!s || s.revocadaEn) return;
    s.revocadaEn = new Date().toISOString();
    s.motivoRevocacion = motivo;
    this.registrar({
      tipo: 'sesion_revocada',
      actorId: s.actorId,
      sesionId: s.id,
      detalle: motivo,
      en: s.revocadaEn,
    });
  }

  /**
   * Todas las sesiones de un actor. Es lo que hace que **revocar un rol
   * invalide al instante** en vez de esperar los 15 minutos del access.
   * Tambien es el "perdi el dispositivo" del §3.5.
   */
  revocarDeActor(actorId: string, motivo: MotivoRevocacion): number {
    let contadas = 0;
    for (const s of this.sesiones.values()) {
      if (s.actorId === actorId && !s.revocadaEn) {
        this.revocar(s.id, motivo);
        contadas += 1;
      }
    }
    return contadas;
  }

  /**
   * ⭐ Rotacion con deteccion de reuso.
   *
   * Camino feliz: el `jti` presentado es el vigente → se marca usado y se
   * emite uno nuevo.
   *
   * Camino que importa: el `jti` presentado **ya estaba usado** → alguien
   * tiene una copia del refresh. Se revoca la cadena entera y se emite
   * evento de seguridad. El dueño legitimo se entera porque su siguiente
   * peticion lo saca al login; es exactamente lo que se quiere que pase.
   */
  rotar(sid: string, jti: string): ResultadoRotacion {
    const s = this.sesiones.get(sid);
    if (!s) return { ok: false, motivo: 'desconocida' };
    if (s.revocadaEn) return { ok: false, motivo: 'revocada' };
    if (s.expiraEn <= Date.now()) return { ok: false, motivo: 'expirada' };

    if (jti !== s.jtiVigente) {
      if (s.jtiUsados.has(jti)) {
        this.log.error(
          `refresh REUSADO en la sesion ${sid} del actor ${s.actorId}: ` +
            'se revoca la cadena completa',
        );
        this.registrar({
          tipo: 'refresh_reusado',
          actorId: s.actorId,
          sesionId: s.id,
          detalle: 'un refresh ya usado volvio a presentarse: hay una copia',
          en: new Date().toISOString(),
        });
        this.revocar(sid, 'reuso_de_refresh');
      }
      return { ok: false, motivo: 'reuso' };
    }

    s.jtiUsados.add(jti);
    s.jtiVigente = randomUUID();
    return { ok: true, jti: s.jtiVigente };
  }

  /** Lo lee el tablero de seguridad. Copia: nadie edita el historial. */
  ultimosEventos(limite = 50): EventoSeguridad[] {
    return this.eventos.slice(-limite).map((e) => ({ ...e }));
  }

  registrar(evento: EventoSeguridad): void {
    this.eventos.push(evento);
    if (this.eventos.length > RegistroSesiones.MAX_EVENTOS)
      this.eventos.shift();
  }

  /** Sesiones abiertas de un actor. Lo pinta "mis dispositivos". */
  activasDe(actorId: string): Sesion[] {
    return [...this.sesiones.values()].filter(
      (s) => s.actorId === actorId && !s.revocadaEn && s.expiraEn > Date.now(),
    );
  }

  private purgar(): void {
    const ahora = Date.now();
    for (const [id, s] of this.sesiones) {
      // Las revocadas se quedan hasta que expire su refresh: si se borraran
      // al revocarlas, un refresh robado volveria a verse como "desconocida"
      // y se perderia la señal de que alguien la esta usando.
      if (s.expiraEn <= ahora) this.sesiones.delete(id);
    }
  }
}
