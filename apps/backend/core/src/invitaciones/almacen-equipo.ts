/**
 * Donde vive el equipo de una organizacion.
 *
 * Interfaz y no una clase concreta por el mismo motivo que `RoutingStore`: hoy
 * el unico almacen es memoria —no hay Postgres corriendo ni existen aun las
 * tablas `organizacion` y `actor`, que las crea la tarea 1.1— y mañana habra
 * uno de Postgres contra `supabase/migrations/0005_invitaciones.sql`. El
 * servicio de dominio no puede enterarse de cual de los dos esta usando.
 *
 * TODAS las lecturas llevan `organizacionId` como primer parametro. Es el
 * nivel 2 de aislamiento de multitenancy §6: "ningun repositorio expone
 * `find()` sin alcance como primer parametro". Un metodo que no lo pida es un
 * olvido silencioso esperando a pasar.
 *
 * Excepcion unica y deliberada: `invitacionPorHash()`. Quien llega con un
 * token todavia no pertenece a ninguna organizacion — la invitacion es
 * justamente lo que se la va a dar. El hash es el unico identificador que
 * tiene, y por eso ese metodo es el mas peligroso del archivo: nunca debe
 * usarse para nada que no sea resolver una aceptacion.
 */

import type { Actor, EventoEquipo, Invitacion } from './equipo.tipos';

export const ALMACEN_EQUIPO = Symbol('ALMACEN_EQUIPO');

export interface AlmacenEquipo {
  // ── Actores ──────────────────────────────────────────────────────
  guardarActor(actor: Actor): Promise<Actor>;
  actorPorId(organizacionId: string, id: string): Promise<Actor | undefined>;
  actorPorCorreo(
    organizacionId: string,
    correo: string,
  ): Promise<Actor | undefined>;
  listarActores(organizacionId: string): Promise<Actor[]>;

  // ── Invitaciones ─────────────────────────────────────────────────
  guardarInvitacion(invitacion: Invitacion): Promise<Invitacion>;
  /** Ver la nota de arriba: es el unico metodo sin alcance, y es a proposito. */
  invitacionPorHash(tokenHash: string): Promise<Invitacion | undefined>;
  /**
   * Marca una invitacion como aceptada SI seguia pendiente, y devuelve la fila
   * resultante. Devuelve `undefined` si ya estaba aceptada.
   *
   * Existe como un solo metodo y no como "lee, decide, guarda" porque eso es
   * lo que hace que el uso unico sea real: entre la lectura y la escritura hay
   * un `await`, y dos aceptaciones simultaneas del mismo enlace se cuelan por
   * ahi. En Postgres esto es
   *
   *     update invitacion set aceptada_en = $2, actor_creado_id = $3
   *      where token_hash = $1 and aceptada_en is null returning *
   *
   * y el que pierde la carrera recibe cero filas, que aqui es `undefined`.
   */
  aceptarInvitacion(
    tokenHash: string,
    aceptadaEn: string,
    actorCreadoId: string,
  ): Promise<Invitacion | undefined>;
  invitacionPorId(
    organizacionId: string,
    id: string,
  ): Promise<Invitacion | undefined>;
  listarInvitaciones(organizacionId: string): Promise<Invitacion[]>;

  // ── Bitacora (append-only) ───────────────────────────────────────
  registrarEvento(evento: EventoEquipo): Promise<void>;
  listarEventos(organizacionId: string, limite: number): Promise<EventoEquipo[]>;
}
