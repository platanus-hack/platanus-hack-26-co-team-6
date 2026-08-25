/**
 * El repositorio de invitaciones y el manejo del token — tarea 2.5.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  EL TOKEN SE VE UNA VEZ Y NO SE GUARDA
 * ═══════════════════════════════════════════════════════════════════
 *  32 bytes de `randomBytes`, en base64url. Lo que se guarda es su
 *  sha256, y es lo unico que existe despues de responder: quien se lleve
 *  esta tabla —o el volcado de memoria— no puede aceptar ninguna invitacion.
 *
 *  sha256 y no scrypt, a diferencia de las contraseñas: un token de 32 bytes
 *  aleatorios no se adivina por fuerza bruta ni con GPUs, y aqui el hash se
 *  calcula en el camino caliente de cada `GET /invitacion/:token`. El costo
 *  memory-hard protege contra entropia baja, y aqui la entropia es maxima.
 *
 * ⚠️ NO PONER EL TOKEN EN UN LOG. Ni en el mensaje de error, ni en el
 *    `debug` de «no encontre esta invitacion». La redaccion de Pino (5.3)
 *    es la red, no el plan.
 */

import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Invitacion, Rol } from '../contracts/types';

/** §3.5 y la tarea: 72 h. Mas que eso y nadie se acuerda de que la pidio. */
export const VIGENCIA_MS = 72 * 60 * 60 * 1000;

/** 32 bytes. El plan lo pide y no es negociable: es toda la seguridad. */
const BYTES_TOKEN = 32;

export interface NuevaInvitacion {
  organizacionId: string;
  correo: string;
  rol: Rol;
  codigoSede?: string | null;
  invitadaPor?: string | null;
}

export interface RepoInvitaciones {
  crear(
    nueva: NuevaInvitacion,
  ): Promise<{ invitacion: Invitacion; token: string }>;
  /** Resuelve por el token EN CLARO. Lo hashea aqui: nadie mas lo toca. */
  porToken(token: string): Promise<Invitacion | undefined>;
  porId(id: string): Promise<Invitacion | undefined>;
  deOrganizacion(organizacionId: string): Promise<Invitacion[]>;
  guardar(invitacion: Invitacion): Promise<Invitacion>;
}

export const hashDeToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

/** Ni aceptada, ni revocada, ni vencida. Es la unica que sirve de algo. */
export const estaViva = (invitacion: Invitacion, ahora = Date.now()): boolean =>
  !invitacion.aceptadaEn &&
  !invitacion.revocadaEn &&
  Date.parse(invitacion.expiraEn) > ahora;

/**
 * ⚠️ EN MEMORIA, igual que `afiliacion/organizaciones.ts` y por la misma
 *    razon. La tabla es `invitacion` en `supabase/migrations/0006`.
 */
@Injectable()
export class RepoInvitacionesMemoria implements RepoInvitaciones {
  private readonly porUuid = new Map<string, Invitacion>();
  /** hash del token → id. El token en claro no vive en ningun mapa. */
  private readonly porHash = new Map<string, string>();

  crear(
    nueva: NuevaInvitacion,
  ): Promise<{ invitacion: Invitacion; token: string }> {
    const token = randomBytes(BYTES_TOKEN).toString('base64url');
    const ahora = Date.now();
    const invitacion: Invitacion = {
      id: randomUUID(),
      organizacionId: nueva.organizacionId,
      correo: nueva.correo.trim().toLowerCase(),
      rol: nueva.rol,
      codigoSede: nueva.codigoSede ?? null,
      expiraEn: new Date(ahora + VIGENCIA_MS).toISOString(),
      aceptadaEn: null,
      revocadaEn: null,
      invitadaPor: nueva.invitadaPor ?? null,
      creadaEn: new Date(ahora).toISOString(),
    };

    this.porUuid.set(invitacion.id, invitacion);
    this.porHash.set(hashDeToken(token), invitacion.id);
    return Promise.resolve({ invitacion, token });
  }

  porToken(token: string): Promise<Invitacion | undefined> {
    const id = this.porHash.get(hashDeToken(token));
    return Promise.resolve(id ? this.porUuid.get(id) : undefined);
  }

  porId(id: string): Promise<Invitacion | undefined> {
    return Promise.resolve(this.porUuid.get(id));
  }

  deOrganizacion(organizacionId: string): Promise<Invitacion[]> {
    return Promise.resolve(
      [...this.porUuid.values()]
        .filter((i) => i.organizacionId === organizacionId)
        .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn)),
    );
  }

  guardar(invitacion: Invitacion): Promise<Invitacion> {
    this.porUuid.set(invitacion.id, invitacion);
    return Promise.resolve(invitacion);
  }

  /** Solo para los tests. */
  vaciar(): void {
    this.porUuid.clear();
    this.porHash.clear();
  }
}
