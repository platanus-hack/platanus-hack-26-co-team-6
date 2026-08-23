/**
 * El correo de invitacion.
 *
 * ── LA DEGRADACION, QUE ES LA REGLA 2 ──────────────────────────────
 * Sin proveedor configurado esto NO finge. No devuelve `enviado: true`, no
 * escribe "revisa tu bandeja": dice que no hay proveedor y devuelve el enlace
 * para que quien invita lo pase por donde pueda. Un boton que dice "invitacion
 * enviada" sobre un correo que nunca salio deja a alguien esperando un mensaje
 * que no existe, y el que invito no se entera hasta que lo llaman.
 *
 * Es el mismo criterio de `/entrar/recuperar` en el frontend, y el mismo de
 * `SedesService` con las semillas: degrada, y lo dice.
 *
 * ── LO QUE NUNCA SE HACE AQUI ──────────────────────────────────────
 * **El enlace no se registra en ningun log.** Lleva el token en claro: un
 * `log.debug(enlace)` lo deja escrito en el backend de observabilidad, donde
 * sobrevive mas que la invitacion y lo lee mas gente. Los mensajes de esta
 * clase nombran la invitacion por id y nada mas — ni token, ni enlace, ni
 * correo del destinatario.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ResultadoCorreo =
  | { enviado: true; proveedor: string }
  /** `sin-proveedor` no es un fallo: es el modo por defecto del repo. */
  | { enviado: false; motivo: 'sin-proveedor' | 'fallo-envio' };

export interface InvitacionPorCorreo {
  /** Id de la invitacion. Lo unico que se puede nombrar en un log. */
  invitacionId: string;
  destino: string;
  enlace: string;
  organizacion: string;
  rol: string;
  expiraEn: string;
}

const REMITENTE_POR_DEFECTO = 'PULSO <no-reply@pulso.local>';

@Injectable()
export class CorreoService {
  private readonly log = new Logger(CorreoService.name);

  constructor(private readonly config: ConfigService) {}

  /** Lo pinta `/equipo` para explicar por que se ve un enlace en pantalla. */
  proveedor(): 'resend' | 'ninguno' {
    return this.config.get<string>('RESEND_API_KEY') ? 'resend' : 'ninguno';
  }

  configurado(): boolean {
    return this.proveedor() !== 'ninguno';
  }

  async enviarInvitacion(datos: InvitacionPorCorreo): Promise<ResultadoCorreo> {
    const llave = this.config.get<string>('RESEND_API_KEY');
    if (!llave) return { enviado: false, motivo: 'sin-proveedor' };

    try {
      // `fetch` nativo y no un SDK: es una peticion. Meter una dependencia
      // entera para un POST con JSON es el tipo de cosa que despues nadie
      // puede quitar.
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${llave}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from:
            this.config.get<string>('CORREO_REMITENTE') ?? REMITENTE_POR_DEFECTO,
          to: [datos.destino],
          subject: `Te invitaron a ${datos.organizacion} en PULSO`,
          html: cuerpoHtml(datos),
        }),
      });

      if (!res.ok) {
        // Sin cuerpo de la respuesta en el log: Resend hace eco del
        // destinatario en sus errores, y eso es PII.
        this.log.warn(
          `Resend rechazo el envio de la invitacion ${datos.invitacionId} ` +
            `(HTTP ${res.status}). Se devuelve el enlace a quien invito.`,
        );
        return { enviado: false, motivo: 'fallo-envio' };
      }

      return { enviado: true, proveedor: 'resend' };
    } catch {
      this.log.warn(
        `No se pudo contactar al proveedor de correo para la invitacion ` +
          `${datos.invitacionId}. Se devuelve el enlace a quien invito.`,
      );
      return { enviado: false, motivo: 'fallo-envio' };
    }
  }
}

/**
 * El cuerpo del correo. Texto plano envuelto en HTML minimo: un correo de
 * acceso que llega con maquetacion pesada es el que los filtros marcan como
 * phishing, y este es justo el que no puede acabar en spam.
 */
function cuerpoHtml(datos: InvitacionPorCorreo): string {
  const vence = new Date(datos.expiraEn).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
  });
  return [
    `<p>Te invitaron a <strong>${escapar(datos.organizacion)}</strong> en PULSO`,
    ` como <strong>${escapar(datos.rol)}</strong>.</p>`,
    `<p><a href="${datos.enlace}">Aceptar la invitacion</a></p>`,
    `<p>El enlace vence el ${escapar(vence)} (hora de Bogota) y sirve una sola vez.</p>`,
    `<p>Si no esperabas esto, ignora el mensaje: sin abrir el enlace no pasa nada.</p>`,
  ].join('');
}

/** El nombre de una organizacion lo escribio un humano; no entra crudo en HTML. */
function escapar(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
