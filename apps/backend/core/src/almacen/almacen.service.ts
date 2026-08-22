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

import { Injectable, Logger } from '@nestjs/common';
import type { Caso, Escalamiento, Handshake } from '../contracts/types';

interface Historial {
  aceptados: number;
  rechazados: number;
}

@Injectable()
export class AlmacenService {
  private readonly log = new Logger(AlmacenService.name);

  private readonly casos = new Map<string, Caso>();
  private readonly handshakes = new Map<string, Handshake>();
  private readonly escalamientos = new Map<string, Escalamiento>();
  /** sedeCodigo → { aceptados, rechazados } — alimenta P(aceptación) */
  private readonly historial = new Map<string, Historial>();
  /** sedeCodigo → timestamps ISO de rechazos, para la ventana de 6h */
  private readonly rechazosRecientes = new Map<string, string[]>();

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
    this.expirarVencidos();
    const todos = [...this.handshakes.values()];
    const filtrados = casoId ? todos.filter((h) => h.casoId === casoId) : todos;
    return filtrados.sort((a, b) => b.enviadoEn.localeCompare(a.enviadoEn));
  }

  /** Handshakes que siguen esperando respuesta. Los pinta la consola del hospital. */
  handshakesPendientes(): Handshake[] {
    return this.listarHandshakes().filter((h) => h.estado === 'enviado');
  }

  /**
   * Pasa a 'timeout' toda solicitud que ya vencio.
   *
   * ── POR QUE UN BARRIDO PEREZOSO Y NO UN CRON ──────────────────
   * Un `setInterval` (o @nestjs/schedule, que ni siquiera esta instalado)
   * exigiria un temporizador vivo por proceso para un estado que solo importa
   * cuando alguien pregunta. Las tres consolas ya hacen polling cada 1.5-2s,
   * asi que barrer al leer da la misma latencia observable sin un reloj de
   * fondo que ademas mantendria el proceso despierto.
   *
   * El precio honesto: si NADIE consulta, el vencimiento no ocurre. Da igual
   * — un timeout que nadie observa no cambia ninguna decision, y en cuanto
   * alguien lee, ya esta aplicado.
   *
   * Idempotente por construccion: solo toca los que estan en 'enviado', y al
   * tocarlos deja de verlos. Por eso se puede llamar en cada lectura sin
   * duplicar la senal al modelo.
   */
  expirarVencidos(ahora = Date.now()): Handshake[] {
    const vencidos: Handshake[] = [];

    for (const h of this.handshakes.values()) {
      if (h.estado !== 'enviado') continue;
      if (new Date(h.expiraEn).getTime() > ahora) continue;

      const expirado: Handshake = {
        ...h,
        estado: 'timeout',
        respondidoEn: null,
        latenciaS: null,
      };
      this.handshakes.set(h.id, expirado);
      vencidos.push(expirado);

      // ⚠️ UN SILENCIO CUENTA COMO RECHAZO.
      //
      // No es lo mismo que un "no" explicito, pero tampoco es informacion
      // vacia: un servicio de urgencias que no contesta en el plazo esta
      // saturado, ocupado o no esta mirando el canal — y para el paramedico
      // que espera, las tres cosas significan lo mismo. Dejarlo sin registrar
      // haria que una sede que nunca responde conservara P(aceptacion) alta
      // para siempre y siguiera saliendo #1 en el ranking.
      //
      // MatchService ya trataba 'timeout' igual que 'rechazado' al excluir
      // sedes de un caso (ver match.service.ts): esto solo cierra el circuito
      // que el resto del sistema ya asumia cerrado.
      this.registrarRespuesta(h.sedeCodigo, 'rechazado');
      this.log.warn(
        `handshake ${h.id} → timeout · ${h.sedeCodigo} no respondio`,
      );
    }

    return vencidos;
  }

  // ── Escalamientos al CRUE ──────────────────────────────────────

  guardarEscalamiento(e: Escalamiento): Escalamiento {
    this.escalamientos.set(e.id, e);
    return e;
  }

  obtenerEscalamiento(id: string): Escalamiento | undefined {
    return this.escalamientos.get(id);
  }

  /** Escalamiento abierto de un caso, si lo hay. Evita duplicarlos. */
  escalamientoAbiertoDe(casoId: string): Escalamiento | undefined {
    return [...this.escalamientos.values()].find(
      (e) => e.casoId === casoId && e.atendidoEn === null,
    );
  }

  listarEscalamientos(casoId?: string): Escalamiento[] {
    const todos = [...this.escalamientos.values()];
    const filtrados = casoId ? todos.filter((e) => e.casoId === casoId) : todos;
    return filtrados.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
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
    this.escalamientos.clear();
    this.historial.clear();
    this.rechazosRecientes.clear();
  }
}
