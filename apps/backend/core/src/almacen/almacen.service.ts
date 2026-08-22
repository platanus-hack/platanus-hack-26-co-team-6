/**
 * Almacén en memoria.
 *
 * Existe para que TODO el flujo corra sin Supabase configurado. Cuando la DB
 * esté lista, SedesService lee de allá y esto queda como estado de sesión
 * (casos y handshakes vivos del demo).
 *
 * Limitación conocida: el estado se pierde al reiniciar core y no se comparte
 * entre instancias. Para el demo da igual — una sola sesión, un solo proceso.
 * No lo "arreglen": si necesitan persistencia real, es porque ya deberían
 * estar escribiendo en Supabase.
 *
 * Como Nest instancia los providers una sola vez, ya no hace falta el truco
 * de colgarse de `globalThis` que exigía el hot-reload de Next.
 */

import { Injectable } from '@nestjs/common';
import type { Caso, Handshake } from '../contracts/types';

interface Historial {
  aceptados: number;
  rechazados: number;
}

@Injectable()
export class AlmacenService {
  private readonly casos = new Map<string, Caso>();
  private readonly handshakes = new Map<string, Handshake>();
  /** sedeCodigo → { aceptados, rechazados } — alimenta P(aceptación) */
  private readonly historial = new Map<string, Historial>();
  /** sedeCodigo → timestamps ISO de rechazos, para la ventana de 6h */
  private readonly rechazosRecientes = new Map<string, string[]>();
  /** sedeCodigo → segundos que tardó en responder cada handshake */
  private readonly latenciasRespuesta = new Map<string, number[]>();

  // ── Casos ──────────────────────────────────────────────────────

  guardarCaso(caso: Caso): Caso {
    this.casos.set(caso.id, caso);
    return caso;
  }

  obtenerCaso(id: string): Caso | undefined {
    return this.casos.get(id);
  }

  listarCasos(): Caso[] {
    return [...this.casos.values()].sort((a, b) =>
      b.creadoEn.localeCompare(a.creadoEn),
    );
  }

  // ── Handshakes ─────────────────────────────────────────────────

  guardarHandshake(h: Handshake): Handshake {
    this.handshakes.set(h.id, h);
    return h;
  }

  obtenerHandshake(id: string): Handshake | undefined {
    return this.handshakes.get(id);
  }

  listarHandshakes(casoId?: string): Handshake[] {
    const todos = [...this.handshakes.values()];
    const filtrados = casoId ? todos.filter((h) => h.casoId === casoId) : todos;
    return filtrados.sort((a, b) => b.enviadoEn.localeCompare(a.enviadoEn));
  }

  /** Handshakes que siguen esperando respuesta. Los pinta la consola del hospital. */
  handshakesPendientes(): Handshake[] {
    return this.listarHandshakes().filter((h) => h.estado === 'enviado');
  }

  // ── Historial de aceptación — el dataset que se auto-etiqueta ───

  /**
   * ⭐ Aquí está el corazón del producto: cada respuesta de un hospital queda
   * registrada y se convierte en el prior de la siguiente decisión. Nadie
   * tipeó nada. El rechazo ES el sensor.
   */
  registrarRespuesta(
    sedeCodigo: string,
    decision: 'aceptado' | 'rechazado',
    latenciaS?: number | null,
  ): void {
    const h = this.historial.get(sedeCodigo) ?? { aceptados: 0, rechazados: 0 };
    if (decision === 'aceptado') h.aceptados += 1;
    else h.rechazados += 1;
    this.historial.set(sedeCodigo, h);

    if (decision === 'rechazado') {
      const lista = this.rechazosRecientes.get(sedeCodigo) ?? [];
      lista.push(new Date().toISOString());
      this.rechazosRecientes.set(sedeCodigo, lista);
    }

    // Cuánto tardó en contestar es la mitad medible del costo de rebotarla.
    // Ver penalizacionRebote() en scoring.service.ts.
    if (typeof latenciaS === 'number' && latenciaS >= 0) {
      const lista = this.latenciasRespuesta.get(sedeCodigo) ?? [];
      lista.push(latenciaS);
      this.latenciasRespuesta.set(sedeCodigo, lista);
    }
  }

  /** Minutos que esta sede ha tardado en responder handshakes anteriores. */
  latenciasRespuestaMin(sedeCodigo: string): number[] {
    return (this.latenciasRespuesta.get(sedeCodigo) ?? []).map((s) => s / 60);
  }

  historialSede(sedeCodigo: string): Historial {
    return this.historial.get(sedeCodigo) ?? { aceptados: 0, rechazados: 0 };
  }

  /** Cuántos rechazos acumula esta sede en las últimas `horas`. */
  rechazosEnVentana(sedeCodigo: string, horas = 6): number {
    const lista = this.rechazosRecientes.get(sedeCodigo) ?? [];
    const corte = Date.now() - horas * 3_600_000;
    return lista.filter((iso) => new Date(iso).getTime() >= corte).length;
  }

  /** Solo para el demo: dejar todo limpio antes de subir al escenario. */
  reiniciarTodo(): void {
    this.casos.clear();
    this.handshakes.clear();
    this.historial.clear();
    this.rechazosRecientes.clear();
    this.latenciasRespuesta.clear();
  }
}
