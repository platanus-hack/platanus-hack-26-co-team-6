/**
 * Almacen de equipo en memoria.
 *
 * Mismo trato que `AlmacenService` y `MemoryRoutingStore`: el sistema entero
 * tiene que correr sin una sola credencial, y este modulo no es la excepcion.
 * Se pierde al reiniciar y no se comparte entre instancias — para el demo da
 * igual, y `InvitacionesModule` lo dice en el log al arrancar.
 *
 * `structuredClone` en cada entrada y cada salida a proposito: sin eso, quien
 * lea un actor se lleva la referencia viva del Map y puede mutarlo desde
 * fuera. Con una tabla real eso es imposible; el almacen de memoria tiene que
 * comportarse igual o los bugs solo aparecen en produccion.
 */

import { Injectable } from '@nestjs/common';
import type { AlmacenEquipo } from './almacen-equipo';
import type { Actor, EventoEquipo, Invitacion } from './equipo.tipos';

@Injectable()
export class AlmacenEquipoMemoria implements AlmacenEquipo {
  private readonly actores = new Map<string, Actor>();
  private readonly invitaciones = new Map<string, Invitacion>();
  /** tokenHash → id de invitacion. El indice unico de la tabla real. */
  private readonly porHash = new Map<string, string>();
  private readonly eventos: EventoEquipo[] = [];

  // ── Actores ──────────────────────────────────────────────────────

  async guardarActor(actor: Actor): Promise<Actor> {
    this.actores.set(actor.id, structuredClone(actor));
    return structuredClone(actor);
  }

  async actorPorId(
    organizacionId: string,
    id: string,
  ): Promise<Actor | undefined> {
    const actor = this.actores.get(id);
    // El filtro por organizacion va aqui y no en quien llama: si estuviera
    // arriba, un solo `if` olvidado deja leer el actor de otro inquilino.
    if (!actor || actor.organizacionId !== organizacionId) return undefined;
    return structuredClone(actor);
  }

  async actorPorCorreo(
    organizacionId: string,
    correo: string,
  ): Promise<Actor | undefined> {
    const encontrado = [...this.actores.values()].find(
      (a) => a.organizacionId === organizacionId && a.correo === correo,
    );
    return encontrado && structuredClone(encontrado);
  }

  async listarActores(organizacionId: string): Promise<Actor[]> {
    return [...this.actores.values()]
      .filter((a) => a.organizacionId === organizacionId)
      .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))
      .map((a) => structuredClone(a));
  }

  // ── Invitaciones ─────────────────────────────────────────────────

  async guardarInvitacion(invitacion: Invitacion): Promise<Invitacion> {
    this.invitaciones.set(invitacion.id, structuredClone(invitacion));
    this.porHash.set(invitacion.tokenHash, invitacion.id);
    return structuredClone(invitacion);
  }

  async invitacionPorHash(tokenHash: string): Promise<Invitacion | undefined> {
    const id = this.porHash.get(tokenHash);
    const invitacion = id ? this.invitaciones.get(id) : undefined;
    return invitacion && structuredClone(invitacion);
  }

  async aceptarInvitacion(
    tokenHash: string,
    aceptadaEn: string,
    actorCreadoId: string,
  ): Promise<Invitacion | undefined> {
    const id = this.porHash.get(tokenHash);
    const invitacion = id ? this.invitaciones.get(id) : undefined;
    // La condicion y la escritura, sin `await` entre medias: es lo mismo que
    // el `where aceptada_en is null` de la version en Postgres.
    if (!invitacion || invitacion.aceptadaEn !== null) return undefined;

    invitacion.aceptadaEn = aceptadaEn;
    invitacion.actorCreadoId = actorCreadoId;
    return structuredClone(invitacion);
  }

  async invitacionPorId(
    organizacionId: string,
    id: string,
  ): Promise<Invitacion | undefined> {
    const invitacion = this.invitaciones.get(id);
    if (!invitacion || invitacion.organizacionId !== organizacionId) {
      return undefined;
    }
    return structuredClone(invitacion);
  }

  async listarInvitaciones(organizacionId: string): Promise<Invitacion[]> {
    return [...this.invitaciones.values()]
      .filter((i) => i.organizacionId === organizacionId)
      .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn))
      .map((i) => structuredClone(i));
  }

  // ── Bitacora ─────────────────────────────────────────────────────

  async registrarEvento(evento: EventoEquipo): Promise<void> {
    // `push` y nunca un `set` por id: la bitacora es append-only (regla 4).
    this.eventos.push(structuredClone(evento));
  }

  async listarEventos(
    organizacionId: string,
    limite: number,
  ): Promise<EventoEquipo[]> {
    return this.eventos
      .filter((e) => e.organizacionId === organizacionId)
      .slice(-limite)
      .reverse()
      .map((e) => structuredClone(e));
  }
}
